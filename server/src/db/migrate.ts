import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { config } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations(): Promise<void> {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  console.log('[DB Migrate] Connecting to PostgreSQL at', config.databaseUrl.replace(/:[^:@]+@/, ':****@'));
  const client = new pg.Client({
    connectionString: config.databaseUrl,
  });

  try {
    await client.connect();
    console.log('[DB Migrate] Applying database schema...');
    await client.query(schemaSql);
    console.log('[DB Migrate] Migrations completed successfully.');
  } catch (err: any) {
    console.error('[DB Migrate] Failed to run migrations:', err.message);
    throw err;
  } finally {
    await client.end();
  }
}

// Auto-run when executed directly via CLI
if (process.argv[1] && process.argv[1].endsWith('migrate.ts')) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
