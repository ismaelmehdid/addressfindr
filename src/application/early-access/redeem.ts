import 'server-only';

import * as v from 'valibot';
import { hasRedeemedCode } from '@/application/early-access/has-redeemed-code';
import { getCurrentUser } from '@/application/me/get-current-user';
import { claimCode } from '@/infra/data-access/early-access/early-access-repo';
import { hashEarlyAccessCode } from '@/shared/early-access-hash';
import { log } from '@/shared/logger';

const InputSchema = v.object({
  code: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
});

export type RedeemInput = v.InferInput<typeof InputSchema>;
export type RedeemResult =
  | { success: true }
  | {
      success: false;
      error: 'unauthenticated' | 'invalid_input' | 'invalid_code' | 'unknown';
    };

export async function redeem(input: RedeemInput): Promise<RedeemResult> {
  const parsed = v.safeParse(InputSchema, input);
  if (!parsed.success) return { success: false, error: 'invalid_input' };

  const currentUser = await getCurrentUser();
  if (currentUser.isErr()) return { success: false, error: 'unauthenticated' };

  const me = currentUser.value;

  // Idempotent retry: re-POSTing an already-redeemed code must succeed, not invalid_code.
  const already = await hasRedeemedCode({ userId: me.id });
  if (already.isOk() && already.value) return { success: true };

  const codeHash = hashEarlyAccessCode(parsed.output.code);

  const claimed = await claimCode({ codeHash, userId: me.id });
  if (claimed.isErr()) return { success: false, error: 'unknown' };
  if (!claimed.value) {
    log.warn('Invalid early-access code', { userId: me.id });
    return { success: false, error: 'invalid_code' };
  }

  log.info('Early access redeemed', { userId: me.id });

  return { success: true };
}
