import { describe, expect, it } from 'vitest';
import { conflict, notFound, unauthorized, validation } from './errors';

describe('errors', () => {
  it('builds not_found with optional resource', () => {
    expect(notFound('User missing', 'user')).toEqual({
      code: 'not_found',
      message: 'User missing',
      resource: 'user',
    });
  });

  it('builds unauthorized with default message', () => {
    expect(unauthorized()).toEqual({
      code: 'unauthorized',
      message: 'Unauthorized',
    });
  });

  it('builds validation with field', () => {
    expect(validation('Email is invalid', 'email')).toMatchObject({
      code: 'validation',
      field: 'email',
    });
  });

  it('builds conflict', () => {
    expect(conflict('Slug taken').code).toBe('conflict');
  });
});
