'use strict';
const fs = require('fs');
const path = require('path');
const payload = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '.mcp-deploy-payload.json'), 'utf8'),
);
module.exports = {
  project_id: payload.project_id,
  name: payload.name,
  entrypoint_path: payload.entrypoint_path,
  verify_jwt: payload.verify_jwt,
  files: payload.files,
};
