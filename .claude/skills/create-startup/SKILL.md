---
name: create-startup
description: >-
  Bootstrap a new startup / SaaS project from this boilerplate end-to-end, all the way to a
  production deployment. Use this skill whenever the user wants to start, scaffold, initialize,
  provision, or ship a new startup from this repo — name their company, wire up and configure
  every service (Supabase, Google OAuth, OpenAI, ZeroEntropy, Autumn payments, PostHog, Resend,
  Vercel), fill the environment, run the app locally, and deploy it live. Trigger on phrases
  like "set up my startup", "initialize the boilerplate", "create a new startup", "let's start
  the project", "connect the services", or "deploy it to prod", even when the skill is not
  named explicitly.
---

# Create Startup

Take a fresh clone of this boilerplate and drive it to a **production-ready, deployed** startup:
named, every service provisioned and configured, environment filled, running locally, then live
on Vercel — with as little manual dashboard work by the user as possible.

## How this skill works

Setup is a **hybrid**. Some services expose an MCP that lets you configure them directly
(create the project, mint keys, push config); others have no MCP and need a short guided
paste-back where the user creates something in a console and hands you the key. Your job is to
do everything you can automatically and make the manual parts a tight, well-signposted flow —
never a vague "go set up X yourself".

Two hard rules that keep this reliable:

- **`src/shared/env.ts` is the source of truth for configuration.** It validates every variable
  at boot (via valibot). Before filling `.env`, read it — required vs optional, formats
  (e.g. `SUPABASE_SECRET_KEY` must start with `sb_secret_`, `BETTER_AUTH_SECRET` ≥ 32 chars),
  and cross-field rules (the email provider check). If a value doesn't satisfy `env.ts`, the app
  won't start. Treat that file as the contract, not this skill.
- **Secrets live in `.env` only, which is git-ignored. Never commit a key.** Project-level MCP
  config (URLs, no secrets) lives in `.mcp.json` and *is* committed. `.env.template` is the
  committed, empty shape.

## The stack (what's actually in this repo)

| Concern | Choice | Configured in |
| --- | --- | --- |
| Framework | Next.js 16 (App Router) · React 19 · TS 6 · pnpm | — |
| Auth | Better Auth — Google OAuth (required), Microsoft (optional), org plugin | `src/infra/auth/auth.ts` |
| Database | Supabase Postgres + Drizzle ORM | `DATABASE_URL` |
| File storage | Supabase Storage (private `files` bucket) | `SUPABASE_*` |
| Payments | **Autumn** (over Stripe) — see the billing integration | `AUTUMN_SECRET_KEY`, `autumn.config.ts` |
| AI | OpenAI via Vercel AI SDK + Mastra agents | `OPENAI_API_KEY` |
| RAG | ZeroEntropy (locked) | `ZEROENTROPY_API_KEY` |
| Analytics | PostHog | `NEXT_PUBLIC_POSTHOG_KEY` |
| Tracing / logs | OpenTelemetry (+ PostHog exporter) · pino | `OTEL_*` (optional) |
| Email | Resend **or** SMTP (provider-switchable) | `EMAIL_PROVIDER` + provider vars |
| Rate limit / cache | Upstash Redis (optional) | `UPSTASH_*` |
| Hosting | Vercel (+ cron) | Step 6 |

Do **not** hard-code the startup's brand name in user-facing copy — the boilerplate is
brand-neutral by design (see `CLAUDE.md`). The name captured in Step 1 is for project/config
identifiers, not for baking into UI strings.

## What this run decided (per the repo owner)

- **Payments: Autumn is integrated for real** (code + provisioning), not deferred.
- **End state: production.** A full run ends with a live Vercel deployment, hosted DB, and
  payments configured.
- **Optional services: PostHog is set up.** Upstash Redis, Microsoft OAuth, and Brave Search
  are left as clearly-marked `TODO` lines in `.env` (the app degrades gracefully without them).

## The flow

Execute in order. Each step is detailed in its own reference file — **read the file when you
reach that step** and follow it; don't run ahead. Keep a todo per step.

1. **Name the startup** → `references/01-name-startup.md`
   Capture the name, derive identifiers, persist `startup.config.json`.
2. **Connect the connectors** → `references/02-connect-connectors.md`
   Add every service MCP so you can configure them from here; authenticate each.
3. **Install & bootstrap env** → `references/03-install-and-secrets.md`
   `pnpm install`, generate the local secrets, create `.env` from the template.
4. **Provision & configure services** → `references/04-provision-services.md`
   Supabase, Google OAuth, OpenAI, ZeroEntropy, Autumn, PostHog, email — fill every `.env` value.
5. **Verify locally** → `references/05-verify-locally.md`
   Run migrations, boot `pnpm dev`, sign in, and pass the `pnpm validate` gate.
6. **Deploy to production** → `references/06-deploy-production.md`
   Create the Vercel project, push production env, set the GitHub Actions secrets CI needs,
   wire prod OAuth + Autumn + Stripe, deploy.

At the end, report a per-service status checklist (configured / needs user action / skipped) and
the live URL.

## Prerequisites to tell the user up front

They'll need accounts (free tiers are fine to start) for: **Supabase, Google Cloud** (OAuth),
**OpenAI** (with billing), **ZeroEntropy**, **Autumn** (+ a **Stripe** account to connect for
real payments), **Vercel**, and **PostHog**. Everything else is optional. Surface this list at
the start of Step 4 so they can create any missing accounts before the guided parts.
