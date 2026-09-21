import * as v from 'valibot';
import {
  CHEAP_CHAT_MODELS,
  VISION_CAPABLE_CHAT_MODELS,
} from '@/core/chat/types';
import { LISTING_EXTRACTION_MODELS } from '@/core/listing/types';
import { BUCKETS } from '@/core/storage/types/bucket';

const NodeEnv = v.picklist(['development', 'test', 'production']);
const VercelEnv = v.picklist(['development', 'preview', 'production']);

const EnvSchema = v.object({
  NODE_ENV: v.optional(NodeEnv, 'development'),
  VERCEL_ENV: v.optional(VercelEnv, 'development'),
  VERCEL_DEPLOYMENT_ID: v.optional(v.pipe(v.string(), v.minLength(1))),
  LOG_LEVEL: v.optional(
    v.picklist(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']),
    'debug',
  ),
  NEXT_PUBLIC_APP_URL: v.pipe(v.string(), v.url()),

  NEXT_PUBLIC_POSTHOG_KEY: v.optional(v.pipe(v.string(), v.minLength(1))),
  NEXT_PUBLIC_POSTHOG_HOST: v.optional(
    v.pipe(v.string(), v.url()),
    'https://eu.i.posthog.com',
  ),

  DATABASE_URL: v.pipe(v.string(), v.minLength(1)),
  DATABASE_SSL: v.optional(v.picklist(['allow', 'require']), 'allow'),

  BETTER_AUTH_SECRET: v.pipe(v.string(), v.minLength(32)),
  BETTER_AUTH_URL: v.pipe(v.string(), v.url()),

  GOOGLE_CLIENT_ID: v.pipe(v.string(), v.minLength(1)),
  GOOGLE_CLIENT_SECRET: v.pipe(v.string(), v.minLength(1)),

  MICROSOFT_CLIENT_ID: v.optional(v.pipe(v.string(), v.minLength(1))),
  MICROSOFT_CLIENT_SECRET: v.optional(v.pipe(v.string(), v.minLength(1))),
  MICROSOFT_TENANT_ID: v.optional(v.pipe(v.string(), v.minLength(1)), 'common'),

  ENCRYPTION_KEY: v.optional(v.string()),

  // Optional: when unset the app still boots and every OpenAI consumer
  // catches the SDK auth error and degrades to a Result / fallback.
  OPENAI_API_KEY: v.optional(v.pipe(v.string(), v.minLength(1))),
  CHAT_MODEL: v.optional(
    v.picklist(VISION_CAPABLE_CHAT_MODELS),
    'gpt-5.4-mini',
  ),
  CHEAP_MODEL: v.optional(v.picklist(CHEAP_CHAT_MODELS), 'gpt-5.4-nano'),
  LLM_DAILY_BUDGET_USD_PER_USER: v.pipe(
    v.optional(v.string(), '2'),
    v.transform((s) => Number.parseFloat(s)),
    v.number(),
    v.minValue(0.01),
  ),
  RETRIEVAL_USE_HYDE: v.pipe(
    v.optional(v.string(), 'false'),
    v.transform((s) => s === 'true' || s === '1'),
    v.boolean(),
  ),
  RETRIEVAL_USE_CRAG: v.pipe(
    v.optional(v.string(), 'true'),
    v.transform((s) => s === 'true' || s === '1'),
    v.boolean(),
  ),
  CHAT_POST_STREAM_CRITIC: v.pipe(
    v.optional(v.string(), 'true'),
    v.transform((s) => s === 'true' || s === '1'),
    v.boolean(),
  ),

  FIRECRAWL_API_KEY: v.optional(v.pipe(v.string(), v.minLength(1))),
  FIRECRAWL_TIMEOUT_MS: v.pipe(
    v.optional(v.string(), '60000'),
    v.transform((s) => Number.parseInt(s, 10)),
    v.number(),
    v.minValue(5000),
  ),

  GROQ_API_KEY: v.optional(v.pipe(v.string(), v.minLength(1))),
  GROQ_BASE_URL: v.optional(
    v.pipe(v.string(), v.url()),
    'https://api.groq.com/openai/v1',
  ),
  LISTING_EXTRACTION_MODEL: v.optional(
    v.picklist(LISTING_EXTRACTION_MODELS),
    'openai/gpt-oss-120b',
  ),

  BRAVE_SEARCH_API_KEY: v.optional(v.pipe(v.string(), v.minLength(1))),

  SUPABASE_URL: v.pipe(v.string(), v.url()),
  SUPABASE_SECRET_KEY: v.pipe(
    v.string(),
    v.minLength(1),
    v.startsWith('sb_secret_'),
  ),
  SUPABASE_PUBLISHABLE_KEY: v.pipe(v.string(), v.startsWith('sb_publishable_')),
  SUPABASE_STORAGE_BUCKET: v.picklist(BUCKETS),
  SUPABASE_STORAGE_HOST: v.optional(v.pipe(v.string(), v.url())),

  // Optional: when unset the ZeroEntropy client fails fast with NOT_CONFIGURED
  // instead of sending an unauthenticated request.
  ZEROENTROPY_API_KEY: v.optional(v.pipe(v.string(), v.minLength(1))),
  ZEROENTROPY_API_URL: v.pipe(v.string(), v.url()),

  CRON_SECRET: v.pipe(v.string(), v.minLength(16)),

  EMAIL_PROVIDER: v.optional(v.picklist(['resend', 'smtp', 'none']), 'smtp'),

  RESEND_API_KEY: v.optional(v.pipe(v.string(), v.minLength(1))),
  RESEND_FROM_EMAIL: v.optional(v.pipe(v.string(), v.email())),

  SMTP_HOST: v.optional(v.pipe(v.string(), v.minLength(1))),
  SMTP_PORT: v.optional(
    v.pipe(
      v.string(),
      v.transform((s) => Number.parseInt(s, 10)),
      v.number(),
      v.integer(),
      v.minValue(1),
      v.maxValue(65535),
    ),
    '465',
  ),
  SMTP_USER: v.optional(v.pipe(v.string(), v.minLength(1))),
  SMTP_PASS: v.optional(v.pipe(v.string(), v.minLength(1))),
  SMTP_FROM_EMAIL: v.optional(v.pipe(v.string(), v.email())),
  SMTP_FROM_NAME: v.optional(v.pipe(v.string(), v.minLength(1))),

  UPSTASH_REDIS_REST_URL: v.optional(v.pipe(v.string(), v.url())),
  UPSTASH_REDIS_REST_TOKEN: v.optional(v.pipe(v.string(), v.minLength(1))),

  // Payments (Autumn). Optional locally (use the dev paywall-skip); required in
  // production — enforced by assertBillingConfigured below.
  AUTUMN_SECRET_KEY: v.optional(v.pipe(v.string(), v.minLength(1))),
});

export type Env = v.InferOutput<typeof EnvSchema>;

let cached: Env | null = null;

function assertEmailProviderConfigured(parsed: Env): void {
  if (parsed.EMAIL_PROVIDER === 'none') return;
  if (parsed.EMAIL_PROVIDER === 'resend') {
    const missing: string[] = [];
    if (!parsed.RESEND_API_KEY) missing.push('RESEND_API_KEY');
    if (!parsed.RESEND_FROM_EMAIL) missing.push('RESEND_FROM_EMAIL');
    if (missing.length > 0) {
      throw new Error(`EMAIL_PROVIDER=resend requires: ${missing.join(', ')}`);
    }
    return;
  }
  const missing: string[] = [];
  if (!parsed.SMTP_HOST) missing.push('SMTP_HOST');
  if (!parsed.SMTP_USER) missing.push('SMTP_USER');
  if (!parsed.SMTP_PASS) missing.push('SMTP_PASS');
  if (!parsed.SMTP_FROM_EMAIL) missing.push('SMTP_FROM_EMAIL');
  if (missing.length > 0) {
    throw new Error(`EMAIL_PROVIDER=smtp requires: ${missing.join(', ')}`);
  }
}

function assertBillingConfigured(parsed: Env): void {
  if (parsed.VERCEL_ENV === 'production' && !parsed.AUTUMN_SECRET_KEY) {
    throw new Error(
      'AUTUMN_SECRET_KEY is required in production (payments / paywall).',
    );
  }
}

// `.env` ships every optional key with an empty value, and dotenv loads those
// as '' rather than undefined — which would defeat v.optional() and fail the
// minLength/url/email checks. An empty value means "not set".
function definedEntries(source: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(source).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === 'string' && entry[1].trim() !== '',
    ),
  );
}

export function env(): Env {
  if (cached) return cached;
  const result = v.safeParse(EnvSchema, definedEntries(process.env));
  if (!result.success) {
    const issues = result.issues
      .map(
        (i) =>
          `  - ${i.path?.map((p) => p.key).join('.') ?? '<root>'}: ${i.message}`,
      )
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  assertEmailProviderConfigured(result.output);
  assertBillingConfigured(result.output);
  cached = result.output;
  return cached;
}
