import { describe, expect, it } from 'vitest';
import {
  checkUrlScheme,
  isPrivateHostname,
  isPrivateIpAddress,
} from './ssrf-guard';

describe('checkUrlScheme', () => {
  it('accepts a public https URL', () => {
    const result = checkUrlScheme('https://example.com/path?q=1');
    expect(result.ok).toBe(true);
  });

  it('rejects http URLs', () => {
    const result = checkUrlScheme('http://example.com');
    expect(result.ok).toBe(false);
  });

  it('rejects URLs with credentials', () => {
    const result = checkUrlScheme('https://user:pass@example.com');
    expect(result.ok).toBe(false);
  });

  it('rejects malformed URLs', () => {
    const result = checkUrlScheme('not-a-url');
    expect(result.ok).toBe(false);
  });

  it('rejects file:// and javascript: schemes', () => {
    expect(checkUrlScheme('file:///etc/passwd').ok).toBe(false);
    expect(checkUrlScheme('javascript:alert(1)').ok).toBe(false);
  });
});

describe('isPrivateHostname', () => {
  it('flags localhost variants', () => {
    expect(isPrivateHostname('localhost')).toBe(true);
    expect(isPrivateHostname('LOCALHOST')).toBe(true);
    expect(isPrivateHostname('foo.localhost')).toBe(true);
  });

  it('flags RFC1918 private IPv4 ranges', () => {
    expect(isPrivateHostname('10.0.0.1')).toBe(true);
    expect(isPrivateHostname('192.168.1.1')).toBe(true);
    expect(isPrivateHostname('172.16.0.1')).toBe(true);
    expect(isPrivateHostname('172.31.255.255')).toBe(true);
    expect(isPrivateHostname('169.254.169.254')).toBe(true);
    expect(isPrivateHostname('127.0.0.1')).toBe(true);
  });

  it('does not flag public IPs', () => {
    expect(isPrivateHostname('8.8.8.8')).toBe(false);
    expect(isPrivateHostname('1.1.1.1')).toBe(false);
    expect(isPrivateHostname('172.15.0.1')).toBe(false);
    expect(isPrivateHostname('172.32.0.1')).toBe(false);
  });

  it('does not flag public hostnames', () => {
    expect(isPrivateHostname('example.com')).toBe(false);
    expect(isPrivateHostname('api.search.brave.com')).toBe(false);
  });

  it('flags IPv6 loopback and link-local', () => {
    expect(isPrivateHostname('::1')).toBe(true);
    expect(isPrivateHostname('fe80::1')).toBe(true);
    expect(isPrivateHostname('fc00::1')).toBe(true);
    expect(isPrivateHostname('fd12::1')).toBe(true);
  });

  it('isPrivateIpAddress mirrors isPrivateHostname', () => {
    expect(isPrivateIpAddress('127.0.0.1')).toBe(true);
    expect(isPrivateIpAddress('8.8.8.8')).toBe(false);
  });
});
