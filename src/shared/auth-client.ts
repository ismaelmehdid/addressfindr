import { inferAdditionalFields } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import type { auth } from '@/infra/auth/auth';

export const authClient = createAuthClient({
  basePath: '/auth',
  plugins: [inferAdditionalFields<typeof auth>()],
});
