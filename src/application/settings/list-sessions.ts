import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import { headers } from 'next/headers';
import { getCurrentUser } from '@/application/me/get-current-user';
import { type AppError, unknown } from '@/core/errors';
import { auth } from '@/infra/auth/auth';
import { log } from '@/shared/logger';
import type { SessionDto } from './dto';

function toIso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

export async function listUserSessions(): Promise<
  Result<SessionDto[], AppError>
> {
  const me = await getCurrentUser();
  if (me.isErr()) return err(me.error);

  try {
    const reqHeaders = await headers();
    const sessions = await auth.api.listSessions({ headers: reqHeaders });
    return ok(
      sessions.map((s) => ({
        id: s.id,
        token: s.token,
        createdAt: toIso(s.createdAt),
        expiresAt: toIso(s.expiresAt),
        ipAddress: s.ipAddress ?? null,
        userAgent: s.userAgent ?? null,
        isCurrent: s.id === me.value.sessionId,
      })),
    );
  } catch (e) {
    log.error('settings.listSessions failure', e);
    return err(unknown('Failed to list sessions'));
  }
}
