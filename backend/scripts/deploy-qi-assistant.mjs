/**
 * Deploy qi-assistant edge function via Supabase MCP payload file.
 * Run from repo root: node backend/scripts/deploy-qi-assistant.mjs
 * Requires: Supabase MCP deploy (use Cursor Supabase plugin) OR SUPABASE_ACCESS_TOKEN for CLI.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const payloadPath = path.join(__dirname, '..', '.mcp-deploy-stdin.json')

if (!fs.existsSync(payloadPath)) {
  console.error('Missing deploy payload. Run: node -e "..." to create backend/.mcp-deploy-stdin.json')
  process.exit(1)
}

const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'))
const fnDir = path.join(__dirname, '..', 'supabase', 'functions', 'qi-assistant')

// Always refresh from source files (LF line endings for Deno)
payload.files = [
  {
    name: 'index.ts',
    content: fs.readFileSync(path.join(fnDir, 'index.ts'), 'utf8'),
  },
  {
    name: 'limsCrud.ts',
    content: fs.readFileSync(path.join(fnDir, 'limsCrud.ts'), 'utf8'),
  },
]

fs.writeFileSync(payloadPath, JSON.stringify(payload))
console.log(
  JSON.stringify({
    project_id: payload.project_id,
    name: payload.name,
    entrypoint_path: payload.entrypoint_path,
    verify_jwt: payload.verify_jwt,
    index_bytes: payload.files[0].content.length,
    lims_bytes: payload.files[1].content.length,
    has_draft_review: payload.files[0].content.includes('isDraftReportReview'),
    has_execute_lims: payload.files[1].content.includes('executeLimsCrud'),
  }),
)
