// Settings from the Railway service variables. Secrets are never logged.

function required(name) {
  const v = String(process.env[name] || '').trim()
  if (!v) throw new Error(`Missing variable ${name}`)
  return v
}

function url(name, fallback) {
  return String(process.env[name] || fallback || '').trim().replace(/\/$/, '')
}

export function loadConfig() {
  const publicUrl = url('PUBLIC_URL')
  if (!publicUrl) throw new Error('Missing variable PUBLIC_URL (https address of this service)')
  const encKey = Buffer.from(required('MCP_ENC_KEY'), 'base64')
  if (encKey.length !== 32) throw new Error('MCP_ENC_KEY must be 32 bytes, base64')
  const redirectAllow = String(
    process.env.MCP_REDIRECT_ALLOW ||
      'https://claude.ai/api/mcp/auth_callback,https://claude.com/api/mcp/auth_callback',
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return {
    port: Number(process.env.PORT || 8080),
    publicUrl,
    environment: String(process.env.MCP_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT_NAME || 'staging'),
    restUrl: url('REST_URL', 'http://rest.railway.internal:3000'),
    authUrl: url('AUTH_URL', 'http://auth.railway.internal:9999'),
    serviceRoleKey: required('SERVICE_ROLE_KEY'),
    encKey,
    redirectAllow,
    // Claude Code and other local clients use a loopback redirect (RFC 8252).
    allowLoopbackRedirect: String(process.env.MCP_ALLOW_LOOPBACK_REDIRECT ?? 'true') !== 'false',
    accessTokenSeconds: 3600,
    sessionHours: 8,
    maxRows: 50,
  }
}
