import 'server-only';

import { env } from './env';

export function buildAppUrl(path: string): string {
  const base = env().NEXT_PUBLIC_APP_URL.replace(/\/+$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}
