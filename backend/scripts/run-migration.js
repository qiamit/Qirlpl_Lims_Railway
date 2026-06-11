const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const migrationFilePath = path.join(__dirname, '..', 'supabase', 'migrations', '20260609000000_create_equipment_master.sql');
const sql = fs.readFileSync(migrationFilePath, 'utf8');

const client = new Client({
  host: 'db.tzbgywlwfcdsgrumstpu.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'Amit@1988',
  ssl: {
    rejectUnauthorized: false
  }
});

async function run() {
  console.log('Connecting to database...');
  await client.connect();
  console.log('Connected successfully. Executing migration SQL...');
  
  // Execute the migration SQL
  await client.query(sql);
  
  console.log('Migration executed successfully!');
}

run()
  .catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(() => {
    client.end();
  });
