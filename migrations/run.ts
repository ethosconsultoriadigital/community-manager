import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from 'dotenv';
import pg from 'pg';

const MIGRATIONS = [
  'schema_base.sql',
  'schema_content_sources.sql',
  'schema_auth_password.sql',
] as const;

config({ path: join(__dirname, '..', '.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL no está definida. Copia .env.example a .env');
  process.exit(1);
}

async function ensureMigrationsTable(client: pg.Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function isApplied(client: pg.Client, filename: string): Promise<boolean> {
  const result = await client.query(
    'SELECT 1 FROM schema_migrations WHERE filename = $1',
    [filename],
  );
  return result.rowCount !== null && result.rowCount > 0;
}

async function applyMigration(client: pg.Client, filename: string): Promise<void> {
  const sql = readFileSync(join(__dirname, filename), 'utf-8');
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
    await client.query('COMMIT');
    console.log(`✓ ${filename}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main(): Promise<void> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await ensureMigrationsTable(client);

    for (const filename of MIGRATIONS) {
      if (await isApplied(client, filename)) {
        console.log(`→ ${filename} (ya aplicada, omitida)`);
        continue;
      }
      await applyMigration(client, filename);
    }

    console.log('Migraciones completadas.');
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error('Error al aplicar migraciones:', error);
  process.exit(1);
});
