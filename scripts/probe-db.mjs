#!/usr/bin/env node
// Prints why a Postgres connection fails. drizzle-kit swallows the driver
// error behind its spinner, so a failed migration says only "exit code 1".
//
//   DATABASE_URL="postgresql://..." node scripts/probe-db.mjs
//
// Credentials are never printed.

import { lookup } from 'node:dns/promises';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(url);
} catch {
  console.error('DATABASE_URL is not a valid url');
  process.exit(1);
}

console.log(`host     ${parsed.hostname}`);
console.log(`port     ${parsed.port || '5432'}`);
console.log(`user     ${parsed.username}`);
console.log(`database ${parsed.pathname.slice(1)}`);

for (const family of [4, 6]) {
  try {
    const { address } = await lookup(parsed.hostname, { family });
    console.log(`IPv${family}     ${address}`);
  } catch {
    console.log(`IPv${family}     none`);
  }
}

const sql = postgres(url, { max: 1, connect_timeout: 15, prepare: false });
try {
  const [row] =
    await sql`select current_database() as db, version() as version`;
  console.log(`\nCONNECT OK — ${row.db}`);
  console.log(row.version);
  const tables = await sql`
    select tablename from pg_tables where schemaname = 'public' order by 1
  `;
  console.log(
    `public tables: ${tables.length === 0 ? '(none)' : tables.map((t) => t.tablename).join(', ')}`,
  );
} catch (error) {
  console.log('\nCONNECT FAILED');
  console.log(`name     ${error.name}`);
  console.log(`code     ${error.code}`);
  console.log(`severity ${error.severity_local ?? error.severity ?? '-'}`);
  console.log(`message  ${error.message}`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
