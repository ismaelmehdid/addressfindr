import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import proxy from './proxy';

function visitAnonymously(path: string): Response {
  return proxy(new NextRequest(`http://localhost:3000${path}`));
}

describe('proxy', () => {
  it.each([
    '/',
    '/dashboard',
    '/dashboard/settings',
  ])('lets an anonymous visitor through to %s', (path) => {
    const response = visitAnonymously(path);

    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });
});
