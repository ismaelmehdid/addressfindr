#!/usr/bin/env node
// Bootstrap .env with everything that needs no external account: cryptographically
// random secrets and instance constants. Idempotent — a key that already holds a
// real value is never overwritten, so re-running after Step 4 is safe.
//
//   node scripts/init-env.mjs                                  # dry run
//   node scripts/init-env.mjs --apply
//   node scripts/init-env.mjs --apply --app-url https://acme.com
//   node scripts/init-env.mjs --apply --supabase-ref abcdefghijklmnop
//
// Secret values are generated in-process and written straight to .env. They are
// never printed, so this is safe to run with output attached to a log.

import crypto from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');

function optionValue(flag, fallback) {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

const ENV_PATH = optionValue('--file', '.env');
const TEMPLATE_PATH = '.env.template';
const APP_URL = optionValue('--app-url', 'http://localhost:3000');
const SUPABASE_REF = optionValue('--supabase-ref', null);

// Random secrets. Lengths comfortably exceed the minimums in src/shared/env.ts.
const SECRETS = {
  BETTER_AUTH_SECRET: () => crypto.randomBytes(32).toString('base64'),
  CRON_SECRET: () => crypto.randomBytes(32).toString('hex'),
  ENCRYPTION_KEY: () => crypto.randomBytes(32).toString('hex'),
};

// Constants that never vary per project, applied only when absent. They already
// exist in .env.template; this is a safety net for a hand-made .env.
const CONSTANTS = {
  ZEROENTROPY_API_URL: 'https://eu-api.zeroentropy.dev/v1',
  SUPABASE_STORAGE_BUCKET: 'files',
  NEXT_PUBLIC_POSTHOG_HOST: 'https://eu.i.posthog.com',
  EMAIL_PROVIDER: 'smtp',
  SMTP_HOST: 'smtp.gmail.com',
  SMTP_PORT: '465',
};

// Instance-specific values the caller supplies.
const DERIVED = {
  NEXT_PUBLIC_APP_URL: APP_URL,
  BETTER_AUTH_URL: APP_URL,
  ...(SUPABASE_REF
    ? { SUPABASE_URL: `https://${SUPABASE_REF}.supabase.co` }
    : {}),
};

if (!existsSync(ENV_PATH)) {
  if (!existsSync(TEMPLATE_PATH)) {
    console.error(`Neither ${ENV_PATH} nor ${TEMPLATE_PATH} exists.`);
    process.exit(1);
  }
  if (APPLY) {
    copyFileSync(TEMPLATE_PATH, ENV_PATH);
    console.log(`created ${ENV_PATH} from ${TEMPLATE_PATH}`);
  } else {
    console.log(`[dry run] would create ${ENV_PATH} from ${TEMPLATE_PATH}`);
  }
}

const source = existsSync(ENV_PATH)
  ? readFileSync(ENV_PATH, 'utf8')
  : readFileSync(TEMPLATE_PATH, 'utf8');
const lines = source.split('\n');

function locate(key) {
  const index = lines.findIndex((l) => new RegExp(`^\\s*${key}\\s*=`).test(l));
  if (index === -1) return { index: -1, value: null };
  const value = lines[index]
    .replace(/^[^=]*=/, '')
    .trim()
    .replace(/^["']|["']$/g, '');
  return { index, value };
}

function isUnset(value) {
  return (
    value === null ||
    value === '' ||
    /^\[.*\]$/.test(value) ||
    /^<.*>$/.test(value)
  );
}

const planned = [];
for (const [key, make] of Object.entries(SECRETS)) {
  const { index, value } = locate(key);
  if (isUnset(value))
    planned.push({ key, index, next: make(), note: 'generated' });
  else planned.push({ key, index, next: null, note: 'kept (already set)' });
}
for (const [key, val] of Object.entries({ ...CONSTANTS, ...DERIVED })) {
  const { index, value } = locate(key);
  const isDerived = Object.hasOwn(DERIVED, key);
  // Derived values are authoritative: an explicit --app-url overrides a stale URL.
  if (isUnset(value) || (isDerived && value !== val)) {
    planned.push({ key, index, next: val, note: `set to ${val}` });
  } else {
    planned.push({ key, index, next: null, note: `kept (${value})` });
  }
}

for (const { key, note } of planned) {
  console.log(`  ${key.padEnd(26)} ${note}`);
}

if (!APPLY) {
  console.log('\n[dry run] nothing written. Re-run with --apply');
  process.exit(0);
}

for (const { key, index, next } of planned) {
  if (next === null) continue;
  if (index === -1) lines.push(`${key}=${next}`);
  else lines[index] = `${key}=${next}`;
}

writeFileSync(ENV_PATH, lines.join('\n'));
console.log(
  `\n${ENV_PATH} updated. Secret values were generated locally and never printed.`,
);
console.log('Remaining variables need an account — see step 4.');
