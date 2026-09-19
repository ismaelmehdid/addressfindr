import { err, ok, type Result } from 'neverthrow';
import { getCurrentUser } from '@/application/me/get-current-user';
import { type AppError, forbidden } from '@/core/errors';

export type AuthorizedScope = {
  userId: string;
};

export async function requireUserScope(): Promise<
  Result<AuthorizedScope, AppError>
> {
  const me = await getCurrentUser();
  if (me.isErr()) return err(me.error);
  if (!me.value.hasRedeemedAccess) {
    return err(forbidden('Early access required'));
  }
  return ok({ userId: me.value.id });
}
