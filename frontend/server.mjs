import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.env.PORT || 8080)
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist')
const INDEX = path.join(ROOT, 'index.html')

const APP_PREFIXES = [
  '/home',
  '/about',
  '/testing',
  '/resources',
  '/news',
  '/contact',
  '/auth',
  '/scope-letters',
  '/samples',
  '/masters',
  '/management-docs',
  '/audit-mrm',
  '/personnel',
  '/general-requirements',
  '/externally-providers',
  '/complaints',
  '/nonconforming-work',
  '/equipment-management',
  '/facilities',
  '/training',
  '/calibration',
  '/finance',
  '/lab-settings',
  '/help',
  '/contact-us',
]

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.pdf': 'application/pdf',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
}

function securityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https: wss:",
      "frame-src 'self' https://maps.google.com https://www.google.com",
      "worker-src 'self'",
      "manifest-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  }
}

function isAppPath(pathname) {
  if (pathname === '/') return true
  return APP_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

// Files whose URL never changes between deploys must be revalidated.
function cacheControlFor(filePath, ext) {
  if (ext === '.html' || ext === '.webmanifest') return 'no-cache'
  if (path.basename(filePath) === 'sw.js') return 'no-cache'
  return 'public, max-age=31536000, immutable'
}

function sendFile(res, filePath, status) {
  const ext = path.extname(filePath).toLowerCase()
  const body = fs.readFileSync(filePath)
  res.writeHead(status, {
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    'Content-Length': body.length,
    'Cache-Control': cacheControlFor(filePath, ext),
    ...securityHeaders(),
  })
  res.end(body)
}

if (!fs.existsSync(INDEX)) {
  console.error('[frontend] dist/index.html is missing. The Vite build did not run.')
  process.exit(1)
}

const server = http.createServer((req, res) => {
  let pathname
  try {
    const url = new URL(req.url || '/', 'http://frontend.local')
    pathname = decodeURIComponent(url.pathname)
  } catch {
    // A malformed %-escape used to throw here and crash the process.
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8', ...securityHeaders() })
    res.end('Bad request')
    return
  }
  if (pathname.includes('..') || pathname.includes('\0')) {
    res.writeHead(400, securityHeaders())
    res.end('Bad request')
    return
  }

  if (req.method === 'GET' && pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain', ...securityHeaders() })
    res.end('ok')
    return
  }

  const relative = pathname.replace(/^\/+/, '')
  const filePath = path.resolve(ROOT, relative)
  const insideRoot = filePath === ROOT || filePath.startsWith(`${ROOT}${path.sep}`)
  if (insideRoot && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    sendFile(res, filePath, 200)
    return
  }

  const ext = path.extname(pathname)
  if (ext) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...securityHeaders() })
    res.end('Not found')
    return
  }

  if (!fs.existsSync(INDEX)) {
    res.writeHead(500, { 'Content-Type': 'text/plain', ...securityHeaders() })
    res.end('Frontend build is missing')
    return
  }

  sendFile(res, INDEX, isAppPath(pathname) ? 200 : 404)
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[frontend] listening on ${PORT}`)
})
