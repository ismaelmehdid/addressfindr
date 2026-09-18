import { err, ok, type Result } from 'neverthrow';
import { getCurrentUser } from '@/application/me/get-current-user';
import { type AppError, forbidden, unauthorized } from '@/core/errors';

export type AuthorizedScope = {
  userId: string;
  organizationId: string;
};

export async function requireOrganizationScope(): Promise<
  Result<AuthorizedScope, AppError>
> {
  const me = await getCurrentUser();
  if (me.isErr()) return err(me.error);
  if (!me.value.organizationId) {
    return err(forbidden('Organization required'));
  }
  return ok({
    userId: me.value.id,
    organizationId: me.value.organizationId,
  });
}

export function requireUnauthorized(): AppError {
  return unauthorized();
}
