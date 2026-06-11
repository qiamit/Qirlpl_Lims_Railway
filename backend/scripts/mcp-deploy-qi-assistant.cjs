'use strict'

// Reads deploy payload and prints MCP deploy_edge_function arguments as JSON to stdout.
const fs = require('fs')
const path = require('path')

const payloadPath = path.join(__dirname, '..', '.mcp-deploy-payload.json')
const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'))
process.stdout.write(
  JSON.stringify({
    project_id: payload.project_id,
    name: payload.name,
    entrypoint_path: payload.entrypoint_path,
    verify_jwt: payload.verify_jwt,
    files: payload.files,
  }),
)
