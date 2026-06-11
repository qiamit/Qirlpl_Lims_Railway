'use strict';
const fs = require('fs');
const path = require('path');
const payloadPath = path.join(__dirname, '..', '.mcp-deploy-payload.json');
const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
const args = {
  project_id: payload.project_id,
  name: payload.name,
  entrypoint_path: payload.entrypoint_path,
  verify_jwt: payload.verify_jwt,
  files: payload.files,
};
process.stdout.write(JSON.stringify(args));
