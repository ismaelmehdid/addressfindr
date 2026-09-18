# Step 6 — Deploy to production (Vercel)

End state: a live deployment on Vercel, hosted DB, prod OAuth, and payments in live mode. Use the
`vercel` MCP (connected in Step 2); the `vercel` CLI is the fallback.

Do this only after Step 5 is green (`pnpm validate` passed and the app ran locally).

## 6a. Decide the production URL

- If the user has a custom domain (`startup.config.json.domain`), that's the production URL.
- Otherwise use the Vercel-assigned domain (`https://<project>.vercel.app`) for now; a custom
  domain can be added later.

This URL becomes `NEXT_PUBLIC_APP_URL` and `BETTER_AUTH_URL` in production — several things key off
it (Better Auth `trustedOrigins`, secure cookies, OAuth redirects, email links).

## 6b. Create & link the Vercel project

1. Create a project named after the `slug` and link this repo to it (via the Vercel MCP, or
   `vercel link`).
2. Framework preset is Next.js (auto-detected). `vercel.json` already defines the cron
   (`/api/cron/zeroentropy-retry`, every 5 min) and disables auto-deploy on `master`
   (`git.deploymentEnabled.master=false`) — deploys are explicit/promoted, which is intended.

## 6c. Push production environment variables

`src/shared/env.ts` validates the environment **at build time**, not just at runtime — Next.js
evaluates it while collecting route data, so a single missing variable fails the Vercel *build*
with `Invalid environment variables`. Push the complete set before deploying.

### The full inventory

Vercel injects `NODE_ENV`, `VERCEL_ENV`, `VERCEL_URL` and `VERCEL_DEPLOYMENT_ID` itself — never
push those. Everything else comes from `.env`:

| Variable | Required | Where the value comes from |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | ✅ | the production URL from 6a |
| `BETTER_AUTH_URL` | ✅ | the same production URL |
| `DATABASE_URL` | ✅ | Supabase **session pooler** (see 6d) |
| `DATABASE_SSL` | — | `require` for hosted Postgres |
| `BETTER_AUTH_SECRET` | ✅ | generated in step 3 |
| `EARLY_ACCESS_PEPPER` | ✅ | generated in step 3 |
| `CRON_SECRET` | ✅ | generated in step 3; Vercel Cron sends it back as a bearer token |
| `ENCRYPTION_KEY` | — | generated in step 3 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | ✅ | Google Cloud Console (4b) |
| `OPENAI_API_KEY` | ✅ | platform.openai.com (4c) |
| `SUPABASE_URL` | ✅ | Supabase project (4a) |
| `SUPABASE_SECRET_KEY` | ✅ | must start `sb_secret_` |
| `SUPABASE_PUBLISHABLE_KEY` | ✅ | must start `sb_publishable_` |
| `SUPABASE_STORAGE_BUCKET` | ✅ | `files` |
| `ZEROENTROPY_API_KEY` | ✅ | ZeroEntropy (4d) |
| `ZEROENTROPY_API_URL` | ✅ | e.g. `https://eu-api.zeroentropy.dev/v1` |
| `AUTUMN_SECRET_KEY` | ✅ **in production** | Autumn production key (6f) — `assertBillingConfigured` fails the build without it |
| `EMAIL_PROVIDER` + its vars | ✅ | `resend` → `RESEND_API_KEY`, `RESEND_FROM_EMAIL`; `smtp` → `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_EMAIL` |
| `NEXT_PUBLIC_POSTHOG_KEY` / `_HOST` | — | PostHog (4e) |
| `UPSTASH_*`, `BRAVE_SEARCH_API_KEY`, `MICROSOFT_*`, `OTEL_*` | — | optional; leave unset to disable |

### Push them

Don't click through the dashboard one variable at a time — use the bundled script. It reads `.env`,
**refuses to run** if anything required is missing or still holds a placeholder, skips the
Vercel-managed variables, and streams each value over stdin so nothing is ever printed:

```bash
vercel link                                     # once, links this repo to the project
node scripts/push-env-to-vercel.mjs             # dry run — lists what would be pushed
node scripts/push-env-to-vercel.mjs --apply     # push to production
```

It is idempotent (removes then re-adds), so re-run it whenever `.env` changes. Use `--env preview`
or `--file .env.staging` for other environments. It also warns when `NEXT_PUBLIC_APP_URL` /
`BETTER_AUTH_URL` still point at `localhost`, or when `DATABASE_SSL` is not `require`.

Never paste secrets into `vercel.json` or any committed file — they belong in the project's env store.

## 6d. Push CI/CD secrets to GitHub Actions

Vercel and GitHub are **two separate stores holding different things**:

- **Vercel project env** (6c) — everything the *running app* needs at runtime.
- **GitHub Actions secrets** — only what *CI* needs. Do **not** mirror the whole `.env`
  here; every extra copy widens the blast radius if the repo is ever compromised.

Exactly three secrets are referenced by the workflows (grep them yourself to confirm nothing
was added: `grep -roE "secrets\.[A-Z_]+" .github/workflows`):

| Secret | Used by | Value |
| --- | --- | --- |
| `DATABASE_URL` | `ci.yml` → `migrate` job on `master` | production Postgres connection string |
| `DEV_DATABASE_URL` | `ci.yml` → `migrate` job on `dev` | dev/staging connection string (skip if there's no `dev` branch) |
| `VERCEL_DEPLOY_HOOK_URL` | `production.yml` → triggers the deploy after CI passes | Vercel → Project → Settings → Git → Deploy Hooks |

The GitHub MCP **cannot** write secrets (it only reads secret-*scanning* alerts), so use the
`gh` CLI. Pipe the value in over **stdin** so it is never printed to the terminal, never lands
in shell history, and never appears in process arguments:

```bash
grep '^DATABASE_URL=' .env | cut -d= -f2- | gh secret set DATABASE_URL
```

For the deploy hook, create it in the Vercel dashboard first, then `gh secret set
VERCEL_DEPLOY_HOOK_URL` and paste at the hidden prompt.

Two things that will bite otherwise:

- Use the **session pooler** connection string for `DATABASE_URL`: host
  `aws-<n>-<region>.pooler.supabase.com`, port **`5432`**, user **`postgres.<project-ref>`**.
  - Do **not** use the direct connection (`db.<ref>.supabase.co`). It is **IPv6-only** unless the
    project has the IPv4 add-on, and GitHub Actions runners are IPv4-only — the job hangs with no
    error until it hits the timeout.
  - Do **not** use the transaction pooler (`6543`) either: it does not reliably support the
    advisory locks and prepared statements `drizzle-kit migrate` needs. Note Supabase's own ORM
    snippet suggests `6543` — that is aimed at the serverless app runtime, not migrations.
- **Substitute the password.** Supabase's copyable strings contain a literal `[YOUR-PASSWORD]`;
  leaving it in produces an instant auth failure that drizzle-kit reports with no message at all.
  URL-encode special characters (`@` → `%40`, `#` → `%23`, `/` → `%2F`, …).
- Set these **before the first push to `master`**, or the `migrate` job fails its
  `Verify database url` guard and the release never triggers.

Verify with `gh secret list` — it prints names only, never values.

## 6e. Wire production OAuth

In Google Cloud → Credentials → the OAuth client, add the production redirect URI:
`https://<prod-domain>/auth/callback/google`. If the consent screen is still in "Testing", either
add real users as test users or publish the app. (Same for Microsoft if it was enabled:
`/auth/callback/microsoft`.)

## 6f. Switch Autumn + Stripe to live

1. In the Autumn dashboard, connect/enable **Stripe live mode** (real payouts).
2. Push the product config to production:
   ```bash
   pnpm dlx atmn push -p
   ```
3. Set the **production** `AUTUMN_SECRET_KEY` (`am_sk_live_…`) in Vercel Production env.

## 6g. Migrate the production database

If production uses a separate Supabase project from local, run migrations against it:
`DATABASE_URL=<prod> pnpm drizzle:migrate`. If it's the same project as Step 4, the schema is
already applied. Re-seed any required rows (e.g. an early-access code) for the prod DB.

## 6h. Deploy & verify

1. Deploy to production (Vercel MCP deploy, or `vercel --prod`).
2. Smoke-test on the live URL:
   - Sign in with Google (confirms prod OAuth + secure cookies + `trustedOrigins`).
   - Upload a file and send a chat message (Supabase + ZeroEntropy + OpenAI in prod).
   - Open pricing and run a real checkout in Stripe (a live small charge or a test-clock) to
     confirm Autumn end-to-end.
   - Confirm PostHog receives prod events, and that the cron endpoint runs (check logs after 5 min).
3. Report the live URL and a final per-service status checklist.

## 6i. Handover

Tell the user what's live, what's still a TODO (Upstash, Microsoft OAuth, Brave, custom domain if
not set), and where each secret lives (Vercel env + local `.env`). Remind them `.env` is
git-ignored and must never be committed.
