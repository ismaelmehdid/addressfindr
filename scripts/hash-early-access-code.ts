import { randomUUID } from 'node:crypto';
import { hashEarlyAccessCode } from '../src/shared/early-access-hash';

const code = process.argv[2];
if (!code) {
  process.stderr.write(
    'Usage: pnpm tsx --env-file=.env scripts/hash-early-access-code.ts <code>\n',
  );
  process.exit(1);
}

const hash = hashEarlyAccessCode(code);
const id = randomUUID();

process.stdout.write(`code:       ${code}\n`);
process.stdout.write(`hash:       ${hash}\n`);
process.stdout.write('\n');
process.stdout.write('SQL to insert:\n');
process.stdout.write(
  `INSERT INTO early_access_code (id, code_hash, created_at, updated_at) VALUES ('${id}', '${hash}', NOW(), NOW());\n`,
);
