// QIRLPL LIMS MCP connector (docs/mcp-connector-plan.md v0.3).
// Streamable HTTP at /mcp, OAuth 2.1 sign-in with the user's LIMS login.

import express from 'express'
import { rateLimit } from 'express-rate-limit'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js'
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js'
import { loadConfig } from './lib/config.mjs'
import { createDb, createAuth, RestError } from './lib/db.mjs'
import { createSessions, SessionEnded } from './lib/sessions.mjs'
import { createOAuth, REFUSED_OFF, REFUSED_ROLE } from './lib/oauth.mjs'
import { createRedactor, NO_REDACTION } from './lib/redact.mjs'
import { createToolkit, Refused } from './lib/tools.mjs'

const config = loadConfig()
const db = createDb(config)
const auth = createAuth(config)
const sessions = createSessions(config, db, auth)

const ARG_LOG_LIMIT = 4000

/** One row in mcp_calls. Never throws. */
async function log({ who, session, tool, args, table, rowIds, rows, isWrite, outcome, message, ms }) {
  let argsJson = args ?? null
  if (argsJson && JSON.stringify(argsJson).length > ARG_LOG_LIMIT) argsJson = { truncated: JSON.stringify(argsJson).slice(0, ARG_LOG_LIMIT) }
  await db
    .service('/mcp_calls', {
      method: 'POST',
      body: JSON.stringify({
        user_id: who?.user_id ?? null,
        user_name: who?.full_name ?? null,
        designation: who?.designation ?? null,
        session_id: session?.id ?? null,
        tool,
        arguments: argsJson,
        table_name: table ?? null,
        row_ids: rowIds?.length ? rowIds.map(String) : null,
        rows_returned: rows ?? null,
        is_write: Boolean(isWrite),
        outcome,
        message: message ? String(message).slice(0, 1000) : null,
        duration_ms: ms ?? null,
      }),
    })
    .catch((e) => console.error('mcp_calls write failed:', e.message))
}

const { provider, handleLogin } = createOAuth({
  config,
  db,
  auth,
  sessions,
  log: (entry) => log({ ...entry, args: entry.arguments }),
})
const toolkit = createToolkit({ config, db })

// Client list for the redactor, per session, for five minutes.
const clientCache = new Map()
async function redactorFor(ctx) {
  if (ctx.role === 'director') return NO_REDACTION
  const hit = clientCache.get(ctx.session.id)
  if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.redactor
  const { data } = await db.asUser(ctx.jwt, '/clients?select=company_name,contact_person_name,address&limit=10000')
  const redactor = createRedactor(config.encKey, Array.isArray(data) ? data : [])
  clientCache.set(ctx.session.id, { at: Date.now(), redactor })
  return redactor
}

const ROLE_OF = { director: 'Laboratory Director', qm: 'Quality Manager', tm: 'Technical Manager' }

function buildServer(ctx) {
  const server = new McpServer(
    { name: 'qirlpl-lims', title: 'QIRLPL LIMS', version: '0.1.0' },
    {
      instructions:
        `QIRLPL LIMS (ISO/IEC 17025 testing and calibration laboratory). You act as ${ctx.who.full_name} (${ROLE_OF[ctx.role]}) with the same access as in the app. ` +
        (ctx.role === 'director'
          ? 'You may change records with update_record and create_record; always show the user what will change and get their OK first. '
          : 'Read only. Client names, contacts and addresses are replaced by placeholders such as CLIENT_3fa91c; do not try to guess them. ') +
        'Results cannot be submitted or approved, reports and certificates cannot be issued or signed, and nothing can be deleted through this connector: tell the user to do that in the app.',
    },
  )
  for (const t of toolkit.toolsFor(ctx.role)) {
    server.registerTool(t.name, t.spec, async (args) => {
      const started = Date.now()
      const callCtx = { ...ctx, note: {}, cache: ctx.cache }
      const done = (outcome, message) =>
        log({
          who: ctx.who,
          session: ctx.session,
          tool: t.name,
          args,
          table: callCtx.note.table ?? args?.table,
          rowIds: callCtx.note.rowIds,
          rows: callCtx.note.rows,
          isWrite: callCtx.note.write || ['update_record', 'create_record'].includes(t.name),
          outcome,
          message,
          ms: Date.now() - started,
        })
      try {
        if (!ctx.who.mcp_enabled) throw new Refused(REFUSED_OFF)
        callCtx.redactor = await redactorFor(callCtx)
        const result = await t.run(callCtx, args || {})
        await done('ok', null)
        return { content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 1) }] }
      } catch (e) {
        const refused = e instanceof Refused || (e instanceof RestError && [401, 403].includes(e.status))
        const message = e instanceof RestError ? `The LIMS database refused this: ${e.message}` : e.message
        await done(refused ? 'refused' : 'error', message)
        if (!(e instanceof Refused) && !(e instanceof RestError)) console.error(t.name, e)
        return { isError: true, content: [{ type: 'text', text: message }] }
      }
    })
  }
  return server
}

const app = express()
app.set('trust proxy', 1)
app.disable('x-powered-by')
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  next()
})

app.get('/health', (_req, res) => res.json({ ok: true }))
app.get('/', (_req, res) => res.type('text/plain').send('QIRLPL LIMS MCP connector. Add https://' + new URL(config.publicUrl).host + '/mcp as a custom connector in Claude.'))

const mcpUrl = new URL(`${config.publicUrl}/mcp`)
app.use(
  mcpAuthRouter({
    provider,
    issuerUrl: new URL(config.publicUrl),
    resourceServerUrl: mcpUrl,
    scopesSupported: ['lims'],
    resourceName: 'QIRLPL LIMS',
  }),
)

app.post(
  '/login',
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false }),
  express.urlencoded({ extended: false, limit: '10kb' }),
  handleLogin,
)

const bearer = requireBearerAuth({ verifier: provider, resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpUrl) })

app.post(
  '/mcp',
  rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false }),
  bearer,
  express.json({ limit: '1mb' }),
  async (req, res) => {
    const session = req.auth.extra.session
    let jwt
    let who
    try {
      jwt = await sessions.userJwt(session)
      who = await sessions.who(session, jwt)
    } catch (e) {
      const ended = e instanceof SessionEnded
      res
        .status(401)
        .set('WWW-Authenticate', `Bearer error="invalid_token", error_description="${ended ? 'Sign-in ended' : 'Sign-in could not be checked'}"`)
        .json({ error: 'invalid_token', error_description: ended ? e.message : 'Sign-in could not be checked' })
      return
    }
    if (!who?.mcp_role) {
      await sessions.revoke(session.id, 'designation no longer allowed')
      await log({ who, session, tool: 'connect', outcome: 'refused', message: REFUSED_ROLE })
      res.status(403).json({ error: 'insufficient_scope', error_description: REFUSED_ROLE })
      return
    }
    sessions.touch(session.id)
    const ctx = { session, jwt, who, role: who.mcp_role, cache: new Map() }
    const server = buildServer(ctx)
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    res.on('close', () => {
      transport.close()
      server.close()
    })
    try {
      await server.connect(transport)
      await transport.handleRequest(req, res, req.body)
    } catch (e) {
      console.error('mcp request failed:', e)
      if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null })
    }
  },
)

const notAllowed = (_req, res) =>
  res.status(405).set('Allow', 'POST').json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null })
app.get('/mcp', notAllowed)
app.delete('/mcp', notAllowed)

app.listen(config.port, () => console.log(`qirlpl-lims-mcp listening on ${config.port} (${config.environment})`))
