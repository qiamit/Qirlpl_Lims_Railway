'use strict'

const fs = require('fs')
const path = require('path')

const payloadPath = path.join(__dirname, '..', '.mcp-deploy-payload.json')
if (!fs.existsSync(payloadPath)) {
  console.error('Missing .mcp-deploy-payload.json — run build-qi-assistant-deploy-payload.cjs first')
  process.exit(1)
}

const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'))
const outPath = path.join(__dirname, '..', '.deploy-call.json')
fs.writeFileSync(outPath, JSON.stringify(payload))
console.log(`Deploy args ready: ${outPath}`)
