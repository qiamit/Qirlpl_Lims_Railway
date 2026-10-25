// OAuth 2.1 for Claude's custom connectors (authorization code + PKCE,
// dynamic client registration). The sign-in page checks the user's LIMS email
// and password with GoTrue; only the Laboratory Director, Quality Manager and
// Technical Manager get through, and only while the Director has the
// connector switched on (Lab Settings → AI).

import crypto from 'node:crypto'
import { InvalidGrantError, InvalidTokenError, InvalidRequestError } from '@modelcontextprotocol/sdk/server/auth/errors.js'
import { randomToken } from './secure.mjs'

const CODE_TTL_MS = 2 * 60 * 1000
const PENDING_TTL_MS = 10 * 60 * 1000

export const REFUSED_ROLE =
  'The MCP connector is for the Laboratory Director, the Quality Manager and Technical Managers only.'
export const REFUSED_OFF = 'The MCP connector is switched off (Lab Settings → AI). Ask the Laboratory Director.'

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

function page(title, body, refreshTo) {
  const refresh = refreshTo ? `<meta http-equiv="refresh" content="0;url=${esc(refreshTo)}">` : ''
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${refresh}
<title>${esc(title)}</title><style>
:root{color-scheme:light dark;--bg:#f6f7f9;--card:#fff;--fg:#1d2330;--muted:#5d6675;--line:#d9dde3;--accent:#1f5fae;--err:#b3261e}
@media (prefers-color-scheme:dark){:root{--bg:#14171c;--card:#1d2128;--fg:#e8eaee;--muted:#a3abb8;--line:#343a44;--accent:#7fb0f0;--err:#ff8a80}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:400px;margin:8vh auto;padding:0 16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:24px}
h1{font-size:19px;margin:0 0 4px}p{margin:8px 0;color:var(--muted)}label{display:block;margin:14px 0 4px;font-weight:600}
input{box-sizing:border-box;width:100%;padding:9px 10px;border:1px solid var(--line);border-radius:6px;background:transparent;color:var(--fg);font:inherit}
button,a.btn{display:inline-block;margin-top:18px;padding:9px 16px;border:0;border-radius:6px;background:var(--accent);color:#fff;font:inherit;font-weight:600;text-decoration:none;cursor:pointer}
.err{color:var(--err);font-weight:600}small{color:var(--muted)}
</style></head><body><main><div class="card">${body}</div></main></body></html>`
}

function redirectWith(uri, params) {
  const u = new URL(uri)
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) u.searchParams.set(k, v)
  return u.href
}

/**
 * Content-Security-Policy for the sign-in pages. Browsers apply form-action to
 * the redirect that follows the form post, so the app's callback (origin, or
 * scheme for an app link such as cursor://) must be allowed next to 'self'.
 */
function signInCsp(redirectUri) {
  let target = ''
  try {
    const u = new URL(redirectUri)
    target = u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : u.protocol
  } catch {
    target = ''
  }
  const ok = /^[a-z][a-z0-9+.-]*:(\/\/[a-z0-9.\-\[\]:]+)?$/i.test(target) && !/^(javascript|data|blob|vbscript):$/i.test(target)
  const safe = ok ? ` ${target}` : ''
  return `default-src 'none'; style-src 'unsafe-inline'; form-action 'self'${safe}; frame-ancestors 'none'`
}

export function createOAuth({ config, db, auth, sessions, log }) {
  const pending = new Map() // id -> { clientId, clientName, params, at }
  const codes = new Map() // code -> { clientId, redirectUri, codeChallenge, userId, gotrue, at }
  const completed = new Map() // pending id -> { clientName, target, at } (form sent again after sign-in)

  setInterval(() => {
    const now = Date.now()
    for (const [k, v] of pending) if (now - v.at > PENDING_TTL_MS) pending.delete(k)
    for (const [k, v] of codes) if (now - v.at > CODE_TTL_MS) codes.delete(k)
    for (const [k, v] of completed) if (now - v.at > PENDING_TTL_MS) completed.delete(k)
  }, 60000).unref()

  // MCP_REDIRECT_ALLOW entries are exact addresses, or prefixes ending in "*"
  // (for example "https://www.cursor.com/*" or "grokbot://*").
  function redirectAllowed(uri) {
    if (config.redirectAllow.some((a) => (a.endsWith('*') ? uri.startsWith(a.slice(0, -1)) : a === uri))) return true
    try {
      const u = new URL(uri)
      return (
        config.allowLoopbackRedirect &&
        u.protocol === 'http:' &&
        (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]')
      )
    } catch {
      return false
    }
  }

  const clientsStore = {
    async getClient(clientId) {
      const rows = await db.service(
        `/mcp_oauth_clients?client_id=eq.${encodeURIComponent(clientId)}&select=client_info`,
      )
      return rows[0]?.client_info
    },
    async registerClient(client) {
      const uris = client.redirect_uris || []
      if (uris.length === 0 || !uris.every((u) => redirectAllowed(String(u)))) {
        console.warn('register refused:', JSON.stringify({ client_name: client.client_name, redirect_uris: uris }).slice(0, 500))
        throw new InvalidRequestError(`This redirect address is not allowed for the QIRLPL LIMS connector: ${uris.join(', ')}`)
      }
      const full = {
        ...client,
        client_id: client.client_id || crypto.randomUUID(),
        client_id_issued_at: client.client_id_issued_at || Math.floor(Date.now() / 1000),
      }
      await db.service('/mcp_oauth_clients', {
        method: 'POST',
        body: JSON.stringify({ client_id: full.client_id, client_info: full }),
      })
      return full
    },
  }

  function loginForm(id, info, error) {
    const host = (() => {
      try {
        return new URL(info.params.redirectUri).host
      } catch {
        return ''
      }
    })()
    return page(
      'Sign in · QIRLPL LIMS connector',
      `<h1>QIRLPL LIMS</h1><p>Sign in with your own LIMS login to connect <b>${esc(info.clientName || 'your AI app')}</b> (${esc(host)}).</p>
<p><small>For the Laboratory Director, Quality Manager and Technical Managers. Everything you do through the connector is recorded.</small></p>
${error ? `<p class="err">${esc(error)}</p>` : ''}
<form method="post" action="/login" autocomplete="on">
<input type="hidden" name="pending" value="${esc(id)}">
<label for="email">Email</label><input id="email" name="email" type="email" required autocomplete="username">
<label for="password">Password</label><input id="password" name="password" type="password" required autocomplete="current-password">
<button type="submit">Sign in and connect</button></form>`,
    )
  }

  const provider = {
    clientsStore,

    async authorize(client, params, res) {
      if (!redirectAllowed(params.redirectUri)) {
        res.status(400).send(page('Not allowed', '<h1>Not allowed</h1><p>This redirect address is not allowed.</p>'))
        return
      }
      const id = randomToken()
      pending.set(id, { clientId: client.client_id, clientName: client.client_name, params, at: Date.now() })
      res.setHeader('Cache-Control', 'no-store')
      res.setHeader('Content-Security-Policy', signInCsp(params.redirectUri))
      res.send(loginForm(id, pending.get(id)))
    },

    async challengeForAuthorizationCode(client, code) {
      const c = codes.get(code)
      if (!c || c.clientId !== client.client_id) throw new InvalidGrantError('Invalid authorization code')
      return c.codeChallenge
    },

    async exchangeAuthorizationCode(client, code, _verifier, redirectUri) {
      const c = codes.get(code)
      codes.delete(code)
      if (!c || c.clientId !== client.client_id || Date.now() - c.at > CODE_TTL_MS) {
        throw new InvalidGrantError('Invalid or expired authorization code')
      }
      if (redirectUri && redirectUri !== c.redirectUri) throw new InvalidGrantError('redirect_uri does not match')
      const s = await sessions.create({ userId: c.userId, clientId: client.client_id, gotrue: c.gotrue })
      await db
        .service(`/mcp_oauth_clients?client_id=eq.${encodeURIComponent(client.client_id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ last_used_at: new Date().toISOString() }),
        })
        .catch(() => {})
      return { access_token: s.access, token_type: 'bearer', expires_in: s.expiresIn, refresh_token: s.refresh, scope: 'lims' }
    },

    async exchangeRefreshToken(client, refreshToken) {
      let s
      try {
        s = await sessions.rotate(refreshToken, client.client_id)
      } catch {
        s = null
      }
      if (!s) throw new InvalidGrantError('Sign-in has ended. Connect again.')
      return { access_token: s.access, token_type: 'bearer', expires_in: s.expiresIn, refresh_token: s.refresh, scope: 'lims' }
    },

    async verifyAccessToken(token) {
      const s = await sessions.verifyAccess(token)
      if (!s) throw new InvalidTokenError('Invalid or expired token')
      return {
        token,
        clientId: s.client_id,
        scopes: ['lims'],
        expiresAt: Math.floor(Date.parse(s.access_expires_at) / 1000),
        extra: { session: s },
      }
    },

    async revokeToken(_client, request) {
      for (const col of ['access_hash', 'refresh_hash']) {
        const s = await sessions.byHash(col, request.token).catch(() => null)
        if (s) await sessions.revoke(s.id, 'revoked by client')
      }
    },
  }

  /** POST /login from the sign-in form. */
  async function handleLogin(req, res) {
    res.setHeader('Cache-Control', 'no-store')
    const id = String(req.body?.pending || '')
    const info = pending.get(id)
    res.setHeader('Content-Security-Policy', signInCsp(info?.params.redirectUri))
    if (!info) {
      const done = completed.get(id)
      if (done) {
        res.status(409).send(
          page(
            'Already signed in',
            `<h1>Already signed in</h1><p>You signed in a moment ago and your browser was sent back to <b>${esc(done.clientName || 'the app')}</b> at <code>${esc(done.target)}</code>.</p><p>If the app did not finish connecting, that address did not reach it: start the connection again from the app. You do not need to sign in twice.</p>`,
          ),
        )
        return
      }
      res.status(400).send(page('Expired', '<h1>Sign-in expired</h1><p>This sign-in page is older than 10 minutes or the connector restarted. Start the connection again from the app you are connecting.</p>'))
      return
    }
    const email = String(req.body?.email || '').trim().toLowerCase()
    const password = String(req.body?.password || '')
    let gotrue
    try {
      gotrue = await auth.signIn(email, password)
    } catch {
      await log({ tool: 'sign_in', outcome: 'refused', message: 'wrong email or password', arguments: { email } })
      res.status(401).send(loginForm(id, info, 'Email or password is not correct.'))
      return
    }
    let who
    try {
      who = await db.rpc(gotrue.access_token, 'app_mcp_whoami')
    } catch (e) {
      res.status(500).send(loginForm(id, info, 'The LIMS could not check your access. Try again.'))
      return
    }
    const refusal = !who?.mcp_role ? REFUSED_ROLE : !who.mcp_enabled ? REFUSED_OFF : null
    if (refusal) {
      await auth.signOut(gotrue.access_token)
      await log({ who, tool: 'sign_in', outcome: 'refused', message: refusal })
      pending.delete(id)
      const back = redirectWith(info.params.redirectUri, {
        error: 'access_denied',
        error_description: refusal,
        state: info.params.state,
      })
      res.status(403).send(
        page('Not allowed', `<h1>Not allowed</h1><p class="err">${esc(refusal)}</p><a class="btn" href="${esc(back)}">Back to the app</a>`),
      )
      return
    }
    pending.delete(id)
    const code = randomToken()
    codes.set(code, {
      clientId: info.clientId,
      redirectUri: info.params.redirectUri,
      codeChallenge: info.params.codeChallenge,
      userId: who.user_id,
      gotrue,
      at: Date.now(),
    })
    const target = (() => {
      try {
        const u = new URL(info.params.redirectUri)
        return `${u.protocol}//${u.host}${u.pathname}`
      } catch {
        return 'unknown'
      }
    })()
    completed.set(id, { clientName: info.clientName, target, at: Date.now() })
    console.log('sign-in ok, sending the browser to', target, 'for', JSON.stringify(info.clientName || info.clientId))
    await log({ who, tool: 'sign_in', outcome: 'ok', message: `connected ${info.clientName || info.clientId} via ${target}` })
    // Not a 302 from the form post: browsers apply the page's form-action to
    // every redirect after a form post, and an app's callback may redirect
    // again (www.cursor.com -> cursor.com), which was blocked. A page that
    // moves on at once (and a link) is an ordinary navigation.
    const back = redirectWith(info.params.redirectUri, { code, state: info.params.state })
    res.status(200).send(
      page(
        'Signed in',
        `<h1>Signed in</h1><p>Returning to <b>${esc(info.clientName || 'the app')}</b>…</p><a class="btn" href="${esc(back)}">Continue</a>`,
        back,
      ),
    )
  }

  return { provider, handleLogin }
}
