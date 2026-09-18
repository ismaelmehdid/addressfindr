import 'server-only';

import { Autumn } from 'autumn-js';

// The caller (adapter) guards on AUTUMN_SECRET_KEY being present before building
// a client, so the secret key is passed in rather than read here.
export function autumnClient(secretKey: string): Autumn {
  return new Autumn({ secretKey });
}
