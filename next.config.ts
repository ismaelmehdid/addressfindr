import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_DEPLOYMENT_ID: process.env.VERCEL_DEPLOYMENT_ID ?? '',
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV ?? 'development',
  },
  serverExternalPackages: ['pino', 'pino-pretty', 'pdfjs-dist'],
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
};

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withNextIntl(nextConfig);
