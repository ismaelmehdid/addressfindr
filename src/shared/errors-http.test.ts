import { describe, expect, it } from 'vitest';
import {
  conflict,
  externalApi,
  forbidden,
  notFound,
  serviceUnavailable,
  unauthorized,
  unknown,
  unsupportedMediaType,
  validation,
} from '@/core/errors';
import { appErrorToStatus, jsonError } from './errors-http';

describe('appErrorToStatus — M22 single source of truth', () => {
  it('maps unauthorized to 401', () => {
    expect(appErrorToStatus('unauthorized')).toBe(401);
  });
  it('maps forbidden to 403', () => {
    expect(appErrorToStatus('forbidden')).toBe(403);
  });
  it('maps not_found to 404', () => {
    expect(appErrorToStatus('not_found')).toBe(404);
  });
  it('maps conflict to 409', () => {
    expect(appErrorToStatus('conflict')).toBe(409);
  });
  it('maps validation to 400', () => {
    expect(appErrorToStatus('validation')).toBe(400);
  });
  it('maps unsupported_media_type to 415', () => {
    expect(appErrorToStatus('unsupported_media_type')).toBe(415);
  });
  it('maps external_api to 502', () => {
    expect(appErrorToStatus('external_api')).toBe(502);
  });
  it('maps service_unavailable to 503', () => {
    expect(appErrorToStatus('service_unavailable')).toBe(503);
  });
  it('maps unknown to 500', () => {
    expect(appErrorToStatus('unknown')).toBe(500);
  });
});

describe('jsonError', () => {
  it('returns expected status + body for each AppError code', async () => {
    const cases = [
      { error: unauthorized(), status: 401 },
      { error: forbidden(), status: 403 },
      { error: notFound('x'), status: 404 },
      { error: conflict('y'), status: 409 },
      { error: validation('z'), status: 400 },
      { error: unsupportedMediaType('m'), status: 415 },
      { error: externalApi('p', 'w'), status: 502 },
      { error: serviceUnavailable('s'), status: 503 },
      { error: unknown('q'), status: 500 },
    ] as const;
    for (const c of cases) {
      const res = jsonError(c.error);
      expect(res.status).toBe(c.status);
      const body = await res.json();
      expect(body).toEqual({
        error: c.error.code,
        message: c.error.message,
      });
    }
  });
});
