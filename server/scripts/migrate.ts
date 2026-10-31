import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import { env } from '../src/config/env';

async function runMigration() {
  const migrationPath = path.resolve(__dirname, '../../supabase/migrations/001_initial_schema.sql');

  if (!fs.existsSync(migrationPath)) {
    console.error(`❌ Migration file not found at: ${migrationPath}`);
    process.exit(1);
  }

  if (
    !env.SUPABASE_DB_URL ||
    env.SUPABASE_DB_URL.includes('your_db_password') ||
    env.SUPABASE_DB_URL.includes('your-supabase-project')
  ) {
    console.error('❌ SUPABASE_DB_URL is missing or contains a placeholder value in server/.env.');
    console.error('To apply the migration, either:');
    console.error('  1. Set SUPABASE_DB_URL in server/.env to your Supabase Session pooler connection string (Supabase Dashboard -> Connect -> Session pooler) and re-run `npm run migrate`, OR');
    console.error('  2. Open the Supabase SQL Editor, paste the contents of `supabase/migrations/001_initial_schema.sql`, and click Run.');
    process.exit(1);
  }

  const sql = fs.readFileSync(migrationPath, 'utf-8');
  const client = new Client({
    connectionString: env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔄 Connecting to Supabase PostgreSQL...');
    await client.connect();
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('✅ Migration 001_initial_schema.sql applied in a single transaction!');
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Database migration failed:', err.message);
    console.error('Tip: On the Supabase free tier, direct connection strings (db.<ref>.supabase.co) are IPv6-only. Use the Session pooler string from Supabase Dashboard -> Connect, or paste `supabase/migrations/001_initial_schema.sql` directly into the Supabase SQL Editor.');
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

runMigration();
