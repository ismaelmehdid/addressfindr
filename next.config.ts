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
  // why: the dev bubble sits on the Mapbox logo, which must stay visible.
  devIndicators: false,
  // why: the optimizer re-fetches local URLs without browser headers, which
  // would let any page proxy the billed /api/street-view through it.
  images: { unoptimized: true },
};

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withNextIntl(nextConfig);
