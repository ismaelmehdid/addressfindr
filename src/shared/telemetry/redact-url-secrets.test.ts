import { describe, expect, it } from 'vitest';
import { redactUrlSecrets } from './redact-url-secrets';

describe('redactUrlSecrets', () => {
  it('hides a key passed in the query string', () => {
    expect(
      redactUrlSecrets(
        'fetch GET https://maps.googleapis.com/maps/api/streetview/metadata?location=45.7571,4.8652&radius=50&key=AIzaSecret',
      ),
    ).toBe(
      'fetch GET https://maps.googleapis.com/maps/api/streetview/metadata?location=45.7571,4.8652&radius=50&key=REDACTED',
    );
  });

  it('hides a key that comes first and keeps the parameters after it', () => {
    expect(redactUrlSecrets('https://x.test/a?key=secret&size=640x320')).toBe(
      'https://x.test/a?key=REDACTED&size=640x320',
    );
  });

  it('hides tokens whatever their case', () => {
    expect(redactUrlSecrets('https://x.test/?Access_Token=pk.abc')).toBe(
      'https://x.test/?Access_Token=REDACTED',
    );
  });

  it('leaves parameters that merely end in "key" alone', () => {
    expect(redactUrlSecrets('https://x.test/?monkey=1&sort_key=a')).toBe(
      'https://x.test/?monkey=1&sort_key=a',
    );
  });

  it('leaves a string without a query untouched', () => {
    expect(redactUrlSecrets('GET /api/street-view')).toBe(
      'GET /api/street-view',
    );
  });
});
