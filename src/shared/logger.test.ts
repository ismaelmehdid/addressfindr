import { beforeEach, describe, expect, it, vi } from 'vitest';

const pinoDebug = vi.hoisted(() => vi.fn());

vi.mock('./env', () => ({
  env: () => ({
    NODE_ENV: 'test',
    VERCEL_ENV: 'production',
    LOG_LEVEL: 'debug',
  }),
}));

vi.mock('pino', () => ({
  default: () => ({
    debug: pinoDebug,
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { DbLogger } from './logger';

const COMMENT = 'The flat is on the fourth floor, ask for Camille';
const QUERY =
  'update "listing_feedback" set "reason" = $1, "comment" = $2 where "search_id" = $3';

beforeEach(() => {
  pinoDebug.mockClear();
});

describe('DbLogger', () => {
  it('logs a production query with its parameter count, never the bound values', () => {
    new DbLogger().logQuery(QUERY, [
      'unsure',
      COMMENT,
      '7d0a3f5e-2b1c-4c8e-9f6a-1e2d3c4b5a69',
    ]);

    expect(pinoDebug).toHaveBeenCalledOnce();
    expect(pinoDebug).toHaveBeenCalledWith(
      { query: QUERY, paramCount: 3 },
      'Database query',
    );
    expect(JSON.stringify(pinoDebug.mock.calls)).not.toContain(COMMENT);
  });
});
