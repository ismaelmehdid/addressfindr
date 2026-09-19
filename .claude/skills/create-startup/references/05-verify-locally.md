# Step 5 — Verify locally

The app must run and pass the repo's done-gate before you deploy. `CLAUDE.md` defines the gate as
`pnpm validate`.

## 5a. Apply the database schema

Migrations are generated and committed under `drizzle/`. Apply them to the Supabase Postgres from
Step 4:

```bash
pnpm drizzle:migrate
```

If it can't connect, re-check `DATABASE_URL` and `DATABASE_SSL=require` (hosted Supabase needs
SSL). `drizzle.config.ts` reads the same env, so a good `.env` is enough.

## 5b. Early-access code (if the sign-up flow gates on it)

The boilerplate has an early-access gate (`early_access_code` table, `application/early-access/redeem`).
To let yourself in, generate a code hash and insert it per the repo's flow:

```bash
pnpm early-access:hash
```

Follow the script's output. Skip only if the user confirms the gate is disabled for their setup.

## 5c. Boot and smoke-test

1. `pnpm dev` (Next 16 + Turbopack). The `next-devtools` MCP connects automatically now — use it
   (`get_errors`, `get_routes`) to diagnose anything that fails.
2. Open `http://localhost:3000`.
3. Sign in with **Google** (email/password is disabled — Google is the only provider unless
   Microsoft was configured).
4. Exercise the core surface: redeem an early-access code at onboarding, then upload a file
   (Supabase Storage + ZeroEntropy indexing). Watch the dev logs for errors.
5. If PostHog was configured, confirm events land in the PostHog project.
6. If Autumn is wired, open the pricing/paywall surface and confirm the `useCustomer` state loads
   (a checkout can be tested in Step 6 against Stripe test mode).

## 5d. Pass the gate

```bash
pnpm validate
```

This runs `type-check && check (biome) && lint && check:boundaries && test`. It must be green
before deploying. If the domain-boundaries checker complains (e.g. after the Autumn integration),
fix the ownership/edges in `scripts/boundaries/manifest.mjs` rather than working around it — see
`CLAUDE.md`.

Report what you verified (with evidence — the actual command output), then proceed to Step 6.
