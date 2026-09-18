import type { Locale } from './locales';

export async function requestLocaleChange(locale: Locale): Promise<void> {
  await fetch('/api/locale', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ locale }),
  });
}
