# Step 3 — Install & bootstrap the environment

**Do this yourself — nothing here requires the user.** No accounts, no keys, no commands handed
over for someone else to run. Execute it, report what happened, move on. Asking the user to paste
`openssl` output is a failure of this step.

## 3a. Install toolchain & dependencies

1. Use the Node version in `.nvmrc` (`nvm use` if available).
2. `pnpm install` — this also runs husky's `prepare` and builds the allowed native deps
   (`sharp`, `esbuild`, …). Expect it to take a bit on first run.

## 3b. Create and populate `.env`

One command creates `.env` from the template, generates every secret, and fills the constants:

```bash
node scripts/init-env.mjs --apply
```

For a production environment, pass the real URL so the app and auth URLs aren't left on localhost:

```bash
node scripts/init-env.mjs --apply --app-url https://<prod-domain>
```

What it does:

| | |
| --- | --- |
| **Generates** | `BETTER_AUTH_SECRET`, `EARLY_ACCESS_PEPPER`, `CRON_SECRET`, `ENCRYPTION_KEY` — via `crypto.randomBytes`, lengths well above the `env.ts` minimums |
| **Sets** | `NEXT_PUBLIC_APP_URL`, `BETTER_AUTH_URL`, plus constants (`ZEROENTROPY_API_URL`, `SUPABASE_STORAGE_BUCKET`, `NEXT_PUBLIC_POSTHOG_HOST`, `EMAIL_PROVIDER`, `SMTP_HOST`, `SMTP_PORT`) |
| **Leaves alone** | any key that already holds a real value |

It is **idempotent** — safe to re-run at any point, including after Step 4, because it never
overwrites a value that is already set. Omit `--apply` to preview first.

It also accepts `--supabase-ref <ref>`, which derives `SUPABASE_URL`; Step 4a passes that once the
Supabase project exists.

Secrets are generated in-process and written straight to `.env` — never echoed, so they never reach
the terminal, the transcript, or shell history.

## 3c. What is deliberately *not* done here

These require an external account and cannot be generated. Step 4 obtains them — several
automatically over MCP, the rest by asking the user once:

`SUPABASE_URL` · `SUPABASE_SECRET_KEY` · `SUPABASE_PUBLISHABLE_KEY` · `DATABASE_URL` ·
`GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` · `OPENAI_API_KEY` · `ZEROENTROPY_API_KEY` ·
`AUTUMN_SECRET_KEY` · the email provider credentials

Be honest with the user about this boundary rather than implying full automation — there is no way
to mint someone else's OAuth client or API key.

## 3d. Sanity check

The app cannot boot yet (service keys unset) — that is expected. Do **not** run `pnpm dev` here;
that is Step 5, after provisioning. Confirm `.env` exists and the four secrets are populated, then
move to Step 4.
