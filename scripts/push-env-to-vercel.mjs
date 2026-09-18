#!/usr/bin/env node
// Push environment variables from a .env file into a Vercel project.
//
//   node scripts/push-env-to-vercel.mjs                 # dry run against .env / production
//   node scripts/push-env-to-vercel.mjs --apply
//   node scripts/push-env-to-vercel.mjs --env preview --file .env.staging --apply
//
// Values are streamed to the Vercel CLI over stdin and are never printed, so this
// is safe to run with output attached to a terminal or a log.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const TARGET = flagValue('--env') ?? 'production';
const ENV_FILE = flagValue('--file') ?? '.env';

function flagValue(flag) {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
}

// Vercel injects these itself; pushing them causes confusing overrides.
const VERCEL_MANAGED = new Set([
  'NODE_ENV',
  'VERCEL',
  'VERCEL_ENV',
  'VERCEL_URL',
  'VERCEL_REGION',
  'VERCEL_DEPLOYMENT_ID',
]);

// Mirrors src/shared/env.ts. Keep in sync when the schema changes.
const REQUIRED = [
  'NEXT_PUBLIC_APP_URL',
  'DATABASE_URL',
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'EARLY_ACCESS_PEPPER',
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_STORAGE_BUCKET',
  'ZEROENTROPY_API_URL',
  'CRON_SECRET',
];
const REQUIRED_IN_PRODUCTION = ['AUTUMN_SECRET_KEY'];

function parseEnvFile(path) {
  const out = new Map();
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value.length > 0) out.set(key, value);
  }
  return out;
}

function isPlaceholder(v) {
  return /^\[.*\]$/.test(v) || /^<.*>$/.test(v) || v.includes('YOUR-PASSWORD');
}

if (!existsSync(ENV_FILE)) {
  console.error(`${ENV_FILE} not found`);
  process.exit(1);
}
if (!existsSync('.vercel/project.json')) {
  console.error('Project is not linked to Vercel. Run `vercel link` first.');
  process.exit(1);
}
if (spawnSync('vercel', ['--version'], { encoding: 'utf8' }).status !== 0) {
  console.error('Vercel CLI not found. Install it: pnpm add -g vercel');
  process.exit(1);
}

const vars = parseEnvFile(ENV_FILE);

// Fail loudly rather than deploying a half-configured app.
const required = [
  ...REQUIRED,
  ...(TARGET === 'production' ? REQUIRED_IN_PRODUCTION : []),
];
const missing = required.filter((k) => !vars.has(k));
const placeholders = required.filter(
  (k) => vars.has(k) && isPlaceholder(vars.get(k)),
);

if (missing.length > 0) {
  console.error(`Missing required variables in ${ENV_FILE}:`);
  for (const k of missing) console.error(`  - ${k}`);
}
if (placeholders.length > 0) {
  console.error('Variables still holding a placeholder value:');
  for (const k of placeholders) console.error(`  - ${k}`);
}
if (missing.length > 0 || placeholders.length > 0) process.exit(1);

// Localhost URLs in a production push is nearly always a mistake — warn, don't rewrite.
if (TARGET === 'production') {
  for (const k of ['NEXT_PUBLIC_APP_URL', 'BETTER_AUTH_URL']) {
    if (vars.get(k)?.includes('localhost')) {
      console.warn(
        `WARNING  ${k} points at localhost — set the production URL first.`,
      );
    }
  }
  if (vars.get('DATABASE_SSL') !== 'require') {
    console.warn(
      'WARNING  DATABASE_SSL is not "require" (hosted Postgres needs SSL).',
    );
  }
}

const pushable = [...vars.keys()].filter((k) => !VERCEL_MANAGED.has(k)).sort();
console.log(`${ENV_FILE} → Vercel "${TARGET}"`);
console.log(`  ${pushable.length} variables to push`);
console.log(
  `  skipped (Vercel-managed): ${[...vars.keys()].filter((k) => VERCEL_MANAGED.has(k)).join(', ') || 'none'}`,
);

if (!APPLY) {
  console.log('\nVariables:');
  for (const k of pushable) console.log(`  ${k}`);
  console.log('\n[dry run] nothing pushed. Re-run with --apply');
  process.exit(0);
}

let ok = 0;
let failed = 0;
for (const key of pushable) {
  // Remove first so re-runs are idempotent; a missing var makes this a no-op.
  spawnSync('vercel', ['env', 'rm', key, TARGET, '--yes'], { stdio: 'ignore' });
  const res = spawnSync('vercel', ['env', 'add', key, TARGET], {
    input: vars.get(key),
    encoding: 'utf8',
  });
  if (res.status === 0) {
    console.log(`  pushed  ${key}`);
    ok += 1;
  } else {
    console.error(
      `  FAILED  ${key}: ${(res.stderr || '').trim().split('\n').pop()}`,
    );
    failed += 1;
  }
}

console.log(`\n${ok} pushed, ${failed} failed`);
console.log('Redeploy for the new values to take effect: vercel --prod');
process.exit(failed > 0 ? 1 : 0);
