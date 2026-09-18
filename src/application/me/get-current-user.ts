import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import { headers } from 'next/headers';
import { cache } from 'react';
import { hasRedeemedCode } from '@/application/early-access/has-redeemed-code';
import { type AppError, unauthorized } from '@/core/errors';
import { auth } from '@/infra/auth/auth';

export type AuthenticatedUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  image: string | null;
  locale: string;
  sessionId: string;
  hasRedeemedAccess: boolean;
};

async function getCurrentUserUncached(): Promise<
  Result<AuthenticatedUser, AppError>
> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return err(unauthorized('No active session'));

  const redeemed = await hasRedeemedCode({ userId: session.user.id });
  if (redeemed.isErr()) return err(redeemed.error);

  return ok({
    id: session.user.id,
    email: session.user.email,
    firstName: session.user.firstName,
    lastName: session.user.lastName,
    image: session.user.image ?? null,
    locale: session.user.locale ?? 'fr',
    sessionId: session.session.id,
    hasRedeemedAccess: redeemed.value,
  });
}

export const getCurrentUser = cache(getCurrentUserUncached);
