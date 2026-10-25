// PostgREST calls. `asUser` is used for every LIMS read and write, so row
// level security and the database guards apply as in the app. `service` is used
// only for the connector's own tables (mcp_oauth_clients, mcp_sessions,
// mcp_calls); `SERVICE_TABLES` below is the whole list.

const SERVICE_TABLES = new Set(['mcp_oauth_clients', 'mcp_sessions', 'mcp_calls'])

export class RestError extends Error {
  constructor(status, body) {
    const msg = (body && (body.message || body.msg || body.error_description || body.error)) || `HTTP ${status}`
    super(String(msg))
    this.status = status
    this.body = body
  }
}

async function call(restUrl, token, path, init = {}) {
  const res = await fetch(`${restUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(20000),
  })
  const text = await res.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }
  if (!res.ok) throw new RestError(res.status, data)
  return { data, headers: res.headers }
}

export function createDb(config) {
  return {
    async service(path, init) {
      const table = path.replace(/^\//, '').split(/[?/]/)[0]
      if (!SERVICE_TABLES.has(table)) throw new Error(`service access to ${table} is not allowed`)
      return (await call(config.restUrl, config.serviceRoleKey, path, init)).data
    },
    async asUser(jwt, path, init = {}) {
      return call(config.restUrl, jwt, path, {
        ...init,
        headers: { 'x-lims-via': 'mcp', ...(init.headers || {}) },
      })
    },
    async rpc(jwt, fn, args = {}) {
      return (
        await call(config.restUrl, jwt, `/rpc/${fn}`, {
          method: 'POST',
          body: JSON.stringify(args),
          headers: { 'x-lims-via': 'mcp' },
        })
      ).data
    },
    /** PostgREST OpenAPI document as the user (tables and columns the user may see). */
    async openApi(jwt) {
      return (await call(config.restUrl, jwt, '/', { headers: { Accept: 'application/openapi+json' } })).data
    },
  }
}

/** GoTrue: password sign-in and refresh. */
export function createAuth(config) {
  async function token(grant, body) {
    const res = await fetch(`${config.authUrl}/token?grant_type=${grant}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new RestError(res.status, data)
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at || Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600),
      user_id: data.user?.id,
    }
  }
  return {
    signIn: (email, password) => token('password', { email, password }),
    refresh: (refreshToken) => token('refresh_token', { refresh_token: refreshToken }),
    /** Ends this GoTrue session only (the user's browser sessions stay). */
    async signOut(accessToken) {
      await fetch(`${config.authUrl}/logout?scope=local`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10000),
      }).catch(() => {})
    },
  }
}
