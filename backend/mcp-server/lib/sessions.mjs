// Connector sessions. Claude holds only random tokens; the GoTrue session of
// the user stays here, encrypted in mcp_sessions. Every tool call uses the
// user's own GoTrue access token. When GoTrue refuses the refresh (the user
// signed out everywhere, was deactivated or had sessions revoked), the
// connector session ends too.

import { decryptJson, encryptJson, randomToken, sha256 } from './secure.mjs'

export class SessionEnded extends Error {}

export function createSessions(config, db, auth) {
  const refreshing = new Map() // session id -> Promise (one GoTrue refresh at a time)
  const whoCache = new Map() // session id -> { at, who }

  const iso = (ms) => new Date(ms).toISOString()

  async function revoke(id, reason) {
    whoCache.delete(id)
    // End the GoTrue session behind it too (best effort).
    try {
      const row = (await db.service(`/mcp_sessions?id=eq.${id}&revoked_at=is.null&select=gotrue_enc`))[0]
      if (row) await auth.signOut(decryptJson(config.encKey, row.gotrue_enc).access_token)
    } catch {
      /* already ended */
    }
    await db
      .service(`/mcp_sessions?id=eq.${id}&revoked_at=is.null`, {
        method: 'PATCH',
        body: JSON.stringify({ revoked_at: new Date().toISOString(), revoke_reason: reason }),
      })
      .catch(() => {})
  }

  async function create({ userId, clientId, gotrue }) {
    const access = randomToken()
    const refresh = randomToken()
    const now = Date.now()
    const sessionEnd = now + config.sessionHours * 3600 * 1000
    const accessEnd = Math.min(sessionEnd, now + config.accessTokenSeconds * 1000)
    const rows = await db.service('/mcp_sessions', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        user_id: userId,
        client_id: clientId,
        access_hash: sha256(access),
        access_expires_at: iso(accessEnd),
        refresh_hash: sha256(refresh),
        session_expires_at: iso(sessionEnd),
        gotrue_enc: encryptJson(config.encKey, gotrue),
      }),
    })
    return { id: rows[0].id, access, refresh, expiresIn: Math.floor((accessEnd - now) / 1000) }
  }

  async function byHash(column, token) {
    const rows = await db.service(
      `/mcp_sessions?${column}=eq.${sha256(token)}&select=*&limit=1`,
    )
    return rows[0] || null
  }

  async function verifyAccess(token) {
    const s = await byHash('access_hash', token)
    if (!s || s.revoked_at) return null
    const now = Date.now()
    if (Date.parse(s.access_expires_at) <= now || Date.parse(s.session_expires_at) <= now) return null
    return s
  }

  async function rotate(refreshToken, clientId) {
    const s = await byHash('refresh_hash', refreshToken)
    if (!s || s.revoked_at || s.client_id !== clientId) return null
    const now = Date.now()
    if (Date.parse(s.session_expires_at) <= now) {
      await revoke(s.id, 'session expired')
      return null
    }
    // Check the user is still allowed in GoTrue before handing out a new token.
    await userJwt(s, { force: true })
    const access = randomToken()
    const refresh = randomToken()
    const accessEnd = Math.min(Date.parse(s.session_expires_at), now + config.accessTokenSeconds * 1000)
    await db.service(`/mcp_sessions?id=eq.${s.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        access_hash: sha256(access),
        access_expires_at: iso(accessEnd),
        refresh_hash: sha256(refresh),
        last_used_at: iso(now),
      }),
    })
    return { id: s.id, access, refresh, expiresIn: Math.floor((accessEnd - now) / 1000) }
  }

  /** The user's GoTrue access token for this session, refreshed when needed. */
  async function userJwt(session, { force = false } = {}) {
    const gotrue = decryptJson(config.encKey, session.gotrue_enc)
    const now = Math.floor(Date.now() / 1000)
    if (!force && gotrue.expires_at - now > 90) return gotrue.access_token
    let p = refreshing.get(session.id)
    if (!p) {
      p = (async () => {
        // Re-read: another call may have refreshed already.
        const fresh = (await db.service(`/mcp_sessions?id=eq.${session.id}&select=gotrue_enc,revoked_at`))[0]
        if (!fresh || fresh.revoked_at) throw new SessionEnded('Session ended')
        const current = decryptJson(config.encKey, fresh.gotrue_enc)
        if (!force && current.expires_at - Math.floor(Date.now() / 1000) > 90) return current.access_token
        let next
        try {
          next = await auth.refresh(current.refresh_token)
        } catch {
          await revoke(session.id, 'LIMS sign-in no longer valid')
          throw new SessionEnded('Your LIMS sign-in has ended. Connect again from Claude.')
        }
        await db.service(`/mcp_sessions?id=eq.${session.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ gotrue_enc: encryptJson(config.encKey, next), last_used_at: new Date().toISOString() }),
        })
        session.gotrue_enc = encryptJson(config.encKey, next)
        return next.access_token
      })().finally(() => refreshing.delete(session.id))
      refreshing.set(session.id, p)
    }
    return p
  }

  /** app_mcp_whoami for the session's user, cached for a minute. */
  async function who(session, jwt) {
    const hit = whoCache.get(session.id)
    if (hit && Date.now() - hit.at < 60000) return hit.who
    const value = await db.rpc(jwt, 'app_mcp_whoami')
    whoCache.set(session.id, { at: Date.now(), who: value })
    return value
  }

  async function touch(id) {
    await db
      .service(`/mcp_sessions?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ last_used_at: new Date().toISOString() }),
      })
      .catch(() => {})
  }

  return { create, verifyAccess, rotate, revoke, userJwt, who, touch, byHash }
}
