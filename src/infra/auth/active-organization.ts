import 'server-only';

import { eq } from 'drizzle-orm';
import { err, ok, type Result } from 'neverthrow';
import { type AppError, unknown } from '@/core/errors';
import { db } from '@/infra/database/connection';
import { session } from '@/infra/database/schema/auth-schema';
import { log } from '@/shared/logger';

export async function setActiveOrganizationOnSession(args: {
  sessionId: string;
  organizationId: string;
}): Promise<Result<void, AppError>> {
  try {
    await db
      .update(session)
      .set({ activeOrganizationId: args.organizationId })
      .where(eq(session.id, args.sessionId));
    return ok(undefined);
  } catch (e) {
    log.error('auth.session.set_active_organization_failed', e, {
      sessionId: args.sessionId,
      organizationId: args.organizationId,
    });
    return err(unknown('Failed to activate organization on session'));
  }
}
