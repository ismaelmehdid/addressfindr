import { describe, expect, it } from 'vitest';
import { ZeroEntropyError, ZeroEntropyErrorCode } from './error-codes';

describe('ZeroEntropyError', () => {
  it('captures code, statusCode, message and cause', () => {
    const cause = new Error('upstream');
    const err = new ZeroEntropyError({
      code: ZeroEntropyErrorCode.RATE_LIMITED,
      message: 'too many requests',
      statusCode: 429,
      cause,
    });
    expect(err.name).toBe('ZeroEntropyError');
    expect(err.message).toBe('too many requests');
    expect(err.code).toBe('rate_limited');
    expect(err.statusCode).toBe(429);
    expect(err.cause).toBe(cause);
    expect(err).toBeInstanceOf(Error);
  });

  it('cause is optional', () => {
    const err = new ZeroEntropyError({
      code: ZeroEntropyErrorCode.TIMEOUT,
      message: 'timed out',
      statusCode: 504,
    });
    expect(err.cause).toBeUndefined();
  });
});

describe('ZeroEntropyErrorCode', () => {
  it('exposes the expected discriminator literals', () => {
    expect(ZeroEntropyErrorCode.RATE_LIMITED).toBe('rate_limited');
    expect(ZeroEntropyErrorCode.NOT_CONFIGURED).toBe('not_configured');
    expect(ZeroEntropyErrorCode.CIRCUIT_OPEN).toBe('circuit_open');
  });
});
