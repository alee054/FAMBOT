import fs from 'fs';
import path from 'path';
import type { Pool as PgPool } from 'pg';

// In produzione (Railway) DATABASE_URL punta al Postgres vero.
// In sviluppo locale, senza DATABASE_URL, si usa pg-mem: un Postgres
// in-memory che non richiede installazioni (i dati si perdono al riavvio).
let pool: PgPool;

if (process.env.DATABASE_URL) {
  const { Pool } = require('pg');
  const url = process.env.DATABASE_URL;
  // Il Postgres interno di Railway (host *.railway.internal) e quello locale
  // non usano SSL; per URL esterni si abilita. Forzabile con DATABASE_SSL=true/false.
  let ssl: false | { rejectUnauthorized: boolean };
  if (process.env.DATABASE_SSL === 'true') ssl = { rejectUnauthorized: false };
  else if (process.env.DATABASE_SSL === 'false') ssl = false;
  else ssl = /railway\.internal|localhost|127\.0\.0\.1/.test(url)
    ? false : { rejectUnauthorized: false };
  pool = new Pool({ connectionString: url, ssl });
} else {
  const { newDb } = require('pg-mem');
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  pool = new Pool();
  console.log('[db] DATABASE_URL assente: uso pg-mem (database in-memory, solo per sviluppo)');
}

export async function query<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}

export async function migrate(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const done = new Set(
    (await query<{ name: string }>('SELECT name FROM _migrations')).map((r) => r.name)
  );
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    console.log(`[db] applico migration ${file}`);
    await pool.query(sql);
    await pool.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
  }
}
