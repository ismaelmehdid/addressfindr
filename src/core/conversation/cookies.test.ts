import { describe, expect, it } from 'vitest';
import {
  LAST_CONVERSATION_COOKIE,
  LAST_CONVERSATION_COOKIE_MAX_AGE,
} from './cookies';

describe('conversation cookies', () => {
  it('uses a namespaced cookie key', () => {
    expect(LAST_CONVERSATION_COOKIE).toBe('app.last_conversation_id');
  });

  it('expires after 30 days', () => {
    expect(LAST_CONVERSATION_COOKIE_MAX_AGE).toBe(60 * 60 * 24 * 30);
  });
});
