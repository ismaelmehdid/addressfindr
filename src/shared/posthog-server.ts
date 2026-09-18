import 'server-only';

import { waitUntil } from '@vercel/functions';
import { PostHog } from 'posthog-node';
import { env } from '@/shared/env';

type PostHogPropertyValue = string | number | boolean | null;

let client: PostHog | null = null;

function getClient(): PostHog | null {
  const key = env().NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;
  if (!client) {
    client = new PostHog(key, {
      host: env().NEXT_PUBLIC_POSTHOG_HOST,
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return client;
}

export function captureServerEvent(args: {
  distinctId: string;
  event: string;
  properties?: Record<string, PostHogPropertyValue>;
}): void {
  const ph = getClient();
  if (!ph) return;
  ph.capture(args);
  waitUntil(ph.flush().catch(() => undefined));
}
