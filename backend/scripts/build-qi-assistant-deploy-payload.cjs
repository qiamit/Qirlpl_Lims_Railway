'use strict'

const fs = require('fs')
const path = require('path')

const fnDir = path.join(__dirname, '..', 'supabase', 'functions', 'qi-assistant')
const outPath = path.join(__dirname, '..', '.mcp-deploy-payload.json')

const payload = {
  project_id: 'tzbgywlwfcdsgrumstpu',
  name: 'qi-assistant',
  entrypoint_path: 'index.ts',
  verify_jwt: false,
  files: ['index.ts', 'limsCrud.ts'].map((name) => ({
    name,
    content: fs.readFileSync(path.join(fnDir, name), 'utf8'),
  })),
}

fs.writeFileSync(outPath, JSON.stringify(payload))
console.log(`Wrote ${outPath} (${payload.files.length} files)`)
