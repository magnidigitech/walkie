import pg from 'pg';
import { config } from '../config.js';
import { SCHEMA_SQL } from './schema.js';

export async function runMigrations(): Promise<void> {
  console.log('[DB Migrate] Connecting to PostgreSQL at', config.databaseUrl.replace(/:[^:@]+@/, ':****@'));
  const client = new pg.Client({
    connectionString: config.databaseUrl,
  });

  try {
    await client.connect();
    console.log('[DB Migrate] Applying database schema...');
    await client.query(SCHEMA_SQL);
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
