import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import { headers } from 'next/headers';
import { getCurrentUser } from '@/application/me/get-current-user';
import { type AppError, unknown } from '@/core/errors';
import { auth } from '@/infra/auth/auth';
import { log } from '@/shared/logger';
import type { LinkedAccountDto } from './dto';

export async function listLinkedAccounts(): Promise<
  Result<LinkedAccountDto[], AppError>
> {
  const me = await getCurrentUser();
  if (me.isErr()) return err(me.error);

  try {
    const accounts = await auth.api.listUserAccounts({
      headers: await headers(),
    });
    return ok(
      accounts.map((a) => ({
        id: a.id,
        accountId: a.accountId,
        providerId: a.providerId,
        createdAt:
          a.createdAt instanceof Date
            ? a.createdAt.toISOString()
            : new Date(a.createdAt).toISOString(),
      })),
    );
  } catch (e) {
    log.error('settings.listAccounts failure', e);
    return err(unknown('Failed to list linked accounts'));
  }
}
