import { describe, expect, it } from 'vitest';
import { clientIp, rateLimitIdentifier } from './client-ip';

function request(headers: Record<string, string>): Request {
  return new Request('https://app.test/x', { headers });
}

describe('clientIp', () => {
  it('reads the first entry of x-forwarded-for', () => {
    expect(clientIp(request({ 'x-forwarded-for': '203.0.113.7' }))).toBe(
      '203.0.113.7',
    );
  });

  it('takes the client, not the proxies, from a forwarded chain', () => {
    const req = request({
      'x-forwarded-for': '203.0.113.7, 70.41.3.18, 150.172.238.178',
    });
    expect(clientIp(req)).toBe('203.0.113.7');
  });

  it('falls back to x-real-ip', () => {
    expect(clientIp(request({ 'x-real-ip': '198.51.100.4' }))).toBe(
      '198.51.100.4',
    );
  });

  it('returns null when no header carries an address', () => {
    expect(clientIp(request({}))).toBeNull();
  });

  it('returns null for a header holding only whitespace', () => {
    expect(clientIp(request({ 'x-forwarded-for': '  ' }))).toBeNull();
  });
});

describe('rateLimitIdentifier', () => {
  it('keys a signed-in caller on the user id', () => {
    const id = rateLimitIdentifier({
      req: request({ 'x-forwarded-for': '203.0.113.7' }),
      userId: 'user-1',
    });
    expect(id).toBe('user-1');
  });

  it('keys an anonymous caller on the client address', () => {
    const id = rateLimitIdentifier({
      req: request({ 'x-forwarded-for': '203.0.113.7' }),
      userId: null,
    });
    expect(id).toBe('ip:203.0.113.7');
  });

  it('puts every unidentifiable caller in one bucket', () => {
    const id = rateLimitIdentifier({ req: request({}), userId: null });
    expect(id).toBe('ip:unknown');
  });

  it('never lets an anonymous caller collide with a user id bucket', () => {
    const anonymous = rateLimitIdentifier({
      req: request({ 'x-forwarded-for': 'user-1' }),
      userId: null,
    });
    expect(anonymous).toBe('ip:user-1');
    expect(anonymous).not.toBe('user-1');
  });
});
