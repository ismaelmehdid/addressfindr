import { describe, expect, it } from 'vitest';
import { redactPii } from './redact-pii';

describe('redactPii', () => {
  it('redacts email addresses', () => {
    expect(redactPii('contact me at alice@example.com please')).toBe(
      'contact me at [redacted-email] please',
    );
  });

  it('redacts multiple emails in one string', () => {
    expect(redactPii('a@x.io and b@y.org')).toBe(
      '[redacted-email] and [redacted-email]',
    );
  });

  it('redacts IBAN', () => {
    expect(redactPii('IBAN FR7630006000011234567890189 here')).toBe(
      'IBAN [redacted-iban] here',
    );
  });

  it('redacts credit card numbers (with and without spaces/dashes)', () => {
    expect(redactPii('4111 1111 1111 1111')).toBe('[redacted-card]');
    expect(redactPii('4111-1111-1111-1111')).toBe('[redacted-card]');
    expect(redactPii('4111111111111111')).toBe('[redacted-card]');
  });

  it('redacts phone numbers with 7+ digits', () => {
    expect(redactPii('call +33 1 23 45 67 89')).toContain('[redacted-phone]');
  });

  it('leaves short numbers alone (less than 7 digits)', () => {
    expect(redactPii('room 234')).toBe('room 234');
  });

  it('returns text untouched when nothing matches', () => {
    expect(redactPii('plain words only')).toBe('plain words only');
  });

  it('truncates after redaction when maxLength given', () => {
    const long = 'x'.repeat(500);
    const out = redactPii(long, { maxLength: 10 });
    expect(out).toBe(`${'x'.repeat(10)}…`);
  });

  it('does not append ellipsis when below maxLength', () => {
    expect(redactPii('short', { maxLength: 100 })).toBe('short');
  });
});
