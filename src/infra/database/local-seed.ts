import { hashEarlyAccessCode } from '@/shared/early-access-hash';
import { newId } from '@/shared/utils/id';
import { db } from './connection';
import { earlyAccessCode } from './schema/early-access-schema';

const DEV_CODE = 'dev';

async function main(): Promise<void> {
  await db
    .insert(earlyAccessCode)
    .values({
      id: newId(),
      codeHash: hashEarlyAccessCode(DEV_CODE),
      note: 'local dev seed',
    })
    .onConflictDoNothing({ target: earlyAccessCode.codeHash });

  process.stdout.write(`[seed] dev early-access code: ${DEV_CODE}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    process.stderr.write(`[seed] failed: ${String(err)}\n`);
    process.exit(1);
  });
