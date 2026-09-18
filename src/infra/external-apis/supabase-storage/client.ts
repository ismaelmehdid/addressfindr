import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/shared/env';

let cached: SupabaseClient | null = null;

export function supabaseStorageClient(): SupabaseClient {
  if (cached) return cached;
  const e = env();
  cached = createClient(e.SUPABASE_URL, e.SUPABASE_SECRET_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return cached;
}

export function supabaseStorageHost(): string {
  const e = env();
  if (e.SUPABASE_STORAGE_HOST) return e.SUPABASE_STORAGE_HOST;
  return e.SUPABASE_URL.replace('.supabase.co', '.storage.supabase.co');
}

export function supabaseResumableEndpoint(): string {
  return `${supabaseStorageHost()}/storage/v1/upload/resumable`;
}
