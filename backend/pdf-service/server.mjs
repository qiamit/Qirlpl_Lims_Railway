/**
 * Local Playwright PDF service — renders HTML with Chromium (same engine as Chrome print).
 * POST /pdf  JSON: { html, filename?, format?, landscape?, margin? }
 * GET  /health
 */
import http from 'node:http'
import { chromium } from 'playwright'

const PORT = Number(process.env.PORT || process.env.PDF_SERVICE_PORT || 3847)
const HOST = process.env.PDF_SERVICE_HOST || '0.0.0.0'
const MAX_HTML_BYTES = Number(process.env.PDF_MAX_HTML_BYTES || 12_000_000)
const AUTH_URL = (process.env.AUTH_URL || '').replace(/\/$/, '')
const AUTH_ANON_KEY = process.env.AUTH_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
const ON_RAILWAY = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID)

/** @type {import('playwright').Browser | null} */
let browser = null

async function getBrowser() {
  if (browser && browser.isConnected()) return browser
  const sandboxArgs =
    process.env.RAILWAY_ENVIRONMENT || process.env.PLAYWRIGHT_NO_SANDBOX === '1'
      ? ['--no-sandbox']
      : []
  browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage', '--font-render-hinting=none', ...sandboxArgs],
  })
  return browser
}

/**
 * @param {unknown} body
 */
function parseBody(body) {
  if (!body || typeof body !== 'object') throw new Error('JSON body required')
  const o = /** @type {Record<string, unknown>} */ (body)
  const html = typeof o.html === 'string' ? o.html : ''
  if (!html.trim()) throw new Error('html is required')
  if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) {
    throw new Error('HTML payload too large')
  }
  const filename =
    typeof o.filename === 'string' && o.filename.trim()
      ? o.filename.trim().replace(/[\\/:*?"<>|]+/g, '_')
      : 'document.pdf'
  const formatRaw = typeof o.format === 'string' ? o.format.toLowerCase() : 'a4'
  const format =
    formatRaw === 'letter' || formatRaw === 'legal' || formatRaw === 'a5' || formatRaw === 'a4'
      ? formatRaw
      : 'a4'
  const landscape = o.landscape === true
  const margin =
    o.margin && typeof o.margin === 'object'
      ? /** @type {Record<string, string>} */ (o.margin)
      : { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
  return { html, filename, format, landscape, margin }
}

/**
 * @param {string} html
 * @param {{ format: string; landscape: boolean; margin: Record<string, string> }} opts
 */
function isAllowedAsset(url) {
  if (url.startsWith('data:') || url.startsWith('blob:') || url === 'about:blank') return true
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host === 'qirlpl.com' || host.endsWith('.qirlpl.com')
  } catch {
    return false
  }
}

async function callerIsSignedIn(req) {
  if (!ON_RAILWAY && !AUTH_URL) return true
  if (!AUTH_URL) {
    const err = new Error('PDF service auth is not configured')
    err.statusCode = 503
    throw err
  }
  const header = String(req.headers.authorization || '')
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  if (!token) {
    const err = new Error('Sign in required')
    err.statusCode = 401
    throw err
  }
  const res = await fetch(`${AUTH_URL}/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      ...(AUTH_ANON_KEY ? { apikey: AUTH_ANON_KEY } : {}),
    },
  })
  if (!res.ok) {
    const err = new Error('Sign in required')
    err.statusCode = 401
    throw err
  }
  return true
}

async function htmlToPdf(html, opts) {
  const b = await getBrowser()
  const page = await b.newPage()
  try {
    await page.route('**/*', (route) => {
      if (isAllowedAsset(route.request().url())) route.continue()
      else route.abort()
    })
    await page.setContent(html, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    })
    // Extra settle for fonts / late images
    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready
      const imgs = Array.from(document.images)
      await Promise.all(
        imgs.map(
          (img) =>
            img.complete
              ? Promise.resolve()
              : new Promise((resolve) => {
                  img.addEventListener('load', () => resolve(undefined), { once: true })
                  img.addEventListener('error', () => resolve(undefined), { once: true })
                }),
        ),
      )
    })
    await new Promise((r) => setTimeout(r, 200))

    const pdf = await page.pdf({
      format: opts.format,
      landscape: opts.landscape,
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: opts.margin.top ?? '0mm',
        right: opts.margin.right ?? '0mm',
        bottom: opts.margin.bottom ?? '0mm',
        left: opts.margin.left ?? '0mm',
      },
    })
    return pdf
  } finally {
    await page.close().catch(() => undefined)
  }
}

/**
 * @param {http.IncomingMessage} req
 */
function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_HTML_BYTES + 64_000) {
        reject(new Error('Request body too large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        reject(new Error('Invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

/**
 * @param {http.ServerResponse} res
 * @param {number} status
 * @param {unknown} payload
 */
function allowedPdfOrigin(req) {
  const origin = String(req.headers.origin || '').trim()
  if (!origin) return ''
  if (origin === 'https://www.qirlpl.com' || origin === 'https://qirlpl.com') return origin
  if (/^https:\/\/[a-z0-9-]+\.up\.railway\.app$/i.test(origin)) return origin
  if (/^http:\/\/(localhost|127\.0\.0\.1):51(7[3-9]|8[0-5])$/.test(origin)) return origin
  return ''
}

function corsHeaders(req) {
  const origin = allowedPdfOrigin(req)
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  }
  if (origin) headers['Access-Control-Allow-Origin'] = origin
  return headers
}

function sendJson(res, status, payload, req) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...corsHeaders(req),
  })
  res.end(body)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`)

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(req))
    res.end()
    return
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, { ok: true, service: 'playwright-pdf' }, req)
    return
  }

  if (req.method === 'POST' && (url.pathname === '/pdf' || url.pathname === '/api/pdf')) {
    try {
      await callerIsSignedIn(req)
      const json = await readJson(req)
      const opts = parseBody(json)
      const pdf = await htmlToPdf(opts.html, opts)
      const outName = opts.filename.toLowerCase().endsWith('.pdf')
        ? opts.filename
        : `${opts.filename}.pdf`
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${outName.replace(/"/g, '')}"`,
        'Content-Length': pdf.length,
        ...corsHeaders(req),
      })
      res.end(pdf)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'PDF generation failed'
      const status = Number(err?.statusCode) || 500
      console.error('[pdf-service]', message)
      sendJson(res, status, { error: message }, req)
    }
    return
  }

  sendJson(res, 404, { error: 'Not found' }, req)
})

server.listen(PORT, HOST, () => {
  console.log(`[pdf-service] Playwright PDF listening on http://${HOST}:${PORT}`)
  console.log(`[pdf-service] POST /pdf  |  GET /health`)
})

async function shutdown() {
  console.log('[pdf-service] shutting down…')
  server.close()
  if (browser) await browser.close().catch(() => undefined)
  process.exit(0)
}

process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())
