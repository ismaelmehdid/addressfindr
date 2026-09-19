import 'server-only';

import { betterAuth, type LogLevel } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '@/infra/database/connection';
import {
  account,
  session,
  user,
  verification,
} from '@/infra/database/schema/auth-schema';
import { env } from '@/shared/env';
import { log } from '@/shared/logger';

const e = env();
const isProduction = e.VERCEL_ENV === 'production';
const isSecure = isProduction || e.NEXT_PUBLIC_APP_URL.startsWith('https://');

const trustedOrigins = [e.NEXT_PUBLIC_APP_URL];
if (!isProduction) trustedOrigins.push('http://localhost:3000');

const microsoftClientId = e.MICROSOFT_CLIENT_ID;
const microsoftClientSecret = e.MICROSOFT_CLIENT_SECRET;
export const isMicrosoftAuthEnabled =
  Boolean(microsoftClientId) && Boolean(microsoftClientSecret);
if (Boolean(microsoftClientId) !== Boolean(microsoftClientSecret)) {
  log.warn('auth.microsoft.partial_config', {
    hasClientId: Boolean(microsoftClientId),
    hasClientSecret: Boolean(microsoftClientSecret),
  });
}

export const auth = betterAuth({
  secret: e.BETTER_AUTH_SECRET,
  rateLimit: { window: 10, max: 100 },
  basePath: '/auth',
  baseURL: e.BETTER_AUTH_URL,
  trustedOrigins,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user,
      session,
      account,
      verification,
    },
  }),
  user: {
    additionalFields: {
      locale: { type: 'string', required: false, defaultValue: 'fr' },
      firstName: { type: 'string', required: true, defaultValue: '' },
      lastName: { type: 'string', required: true, defaultValue: '' },
    },
  },
  emailAndPassword: { enabled: false },
  socialProviders: {
    google: {
      clientId: e.GOOGLE_CLIENT_ID,
      clientSecret: e.GOOGLE_CLIENT_SECRET,
      accessType: 'offline',
      prompt: 'select_account consent',
      scope: [
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/userinfo.email',
      ],
      mapProfileToUser: (profile) => ({
        firstName: profile.given_name ?? '',
        lastName: profile.family_name ?? '',
      }),
    },
    ...(isMicrosoftAuthEnabled && microsoftClientId && microsoftClientSecret
      ? {
          microsoft: {
            clientId: microsoftClientId,
            clientSecret: microsoftClientSecret,
            tenantId: e.MICROSOFT_TENANT_ID,
            prompt: 'select_account',
            scope: ['openid', 'profile', 'email'],
            mapProfileToUser: (
              profile,
            ): { firstName: string; lastName: string } => {
              const fullName =
                typeof profile.name === 'string' ? profile.name : '';
              const parts = fullName.split(' ').filter(Boolean);
              const givenName =
                (typeof profile.given_name === 'string' &&
                  profile.given_name) ||
                parts[0] ||
                '';
              const familyName =
                (typeof profile.family_name === 'string' &&
                  profile.family_name) ||
                parts.slice(1).join(' ') ||
                '';
              return { firstName: givenName, lastName: familyName };
            },
          },
        }
      : {}),
  },
  advanced: {
    useSecureCookies: isSecure,
    defaultCookieAttributes: {
      sameSite: isSecure ? 'none' : 'lax',
      secure: isSecure,
      httpOnly: true,
      path: '/',
    },
  },
  logger: {
    disabled: false,
    level: 'info',
    log: logBetterAuth,
  },
});

function logBetterAuth(
  level: Exclude<LogLevel, 'success'>,
  message: string,
  ...args: unknown[]
): void {
  if (level === 'error') {
    log.error(message, new Error(message), { args });
  } else if (level === 'warn') {
    log.warn(message, { args });
  } else {
    log.info(message, { args });
  }
}
