import { NextResponse } from 'next/server';
import type { AppError, AppErrorCode } from '@/core/errors';

const CODE_TO_STATUS: Record<AppErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  validation: 400,
  rate_limited: 429,
  external_api: 502,
  service_unavailable: 503,
  db_error: 500,
  unknown: 500,
};

export function appErrorToStatus(code: AppErrorCode): number {
  return CODE_TO_STATUS[code];
}

export function jsonError(error: AppError): NextResponse {
  return NextResponse.json(
    { error: error.code, message: error.message },
    { status: appErrorToStatus(error.code) },
  );
}
