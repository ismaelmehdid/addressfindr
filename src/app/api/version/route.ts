import { NextResponse } from 'next/server';
import { env } from '@/shared/env';

export const dynamic = 'force-dynamic';

export function GET(): NextResponse<{ deploymentId: string | null }> {
  return NextResponse.json({
    deploymentId: env().VERCEL_DEPLOYMENT_ID ?? null,
  });
}
