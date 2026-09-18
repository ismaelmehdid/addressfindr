import { err, ok, type Result } from 'neverthrow';
import { getCurrentUser } from '@/application/me/get-current-user';
import { type AppError, unauthorized } from '@/core/errors';

export type AuthorizedScope = {
  userId: string;
};

export async function requireUserScope(): Promise<
  Result<AuthorizedScope, AppError>
> {
  const me = await getCurrentUser();
  if (me.isErr()) return err(me.error);
  return ok({ userId: me.value.id });
}

export function requireUnauthorized(): AppError {
  return unauthorized();
}
