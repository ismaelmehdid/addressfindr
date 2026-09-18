import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import { headers } from 'next/headers';
import { cache } from 'react';
import { getMembership } from '@/application/organization/get-membership';
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
  organizationId: string | null;
};

async function getCurrentUserUncached(): Promise<
  Result<AuthenticatedUser, AppError>
> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return err(unauthorized('No active session'));

  const membership = await getMembership(session.user.id);
  if (membership.isErr()) return err(membership.error);

  return ok({
    id: session.user.id,
    email: session.user.email,
    firstName: session.user.firstName,
    lastName: session.user.lastName,
    image: session.user.image ?? null,
    locale: session.user.locale ?? 'fr',
    sessionId: session.session.id,
    organizationId: membership.value?.organizationId ?? null,
  });
}

export const getCurrentUser = cache(getCurrentUserUncached);
