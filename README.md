<img width="2144" height="730" alt="illustration" src="https://github.com/user-attachments/assets/41cd7b73-bd06-4aff-adcc-45c4905c1f6b" />

# Startup Boilerplate

Everything a SaaS needs on day one — auth, organizations, database, file storage, AI chat with RAG, payments, analytics — wired up and ready to deploy.

## Setup

```bash
git clone git@github.com:ismaelmehdid/startup-boilerplate.git
cd startup-boilerplate
claude
```

Then run:

```
/create-startup
```

That's it. The skill walks you through everything: naming the startup, connecting each service, filling `.env`, running the app, and deploying to production.

## Before you start

**Install:** Node (see `.nvmrc`), pnpm, git.

**Create free accounts:** [Supabase](https://supabase.com) · [Google Cloud](https://console.cloud.google.com) · [OpenAI](https://platform.openai.com) · [ZeroEntropy](https://zeroentropy.dev) · [Autumn](https://useautumn.com) + [Stripe](https://stripe.com) · [Vercel](https://vercel.com) · [PostHog](https://posthog.com)

## What the skill asks you for

Most of the setup is automatic. You only need to:

1. Give your startup a name
2. Authenticate the connectors once (`/mcp` → Authenticate)
3. Paste 4 API keys — Google OAuth, OpenAI, ZeroEntropy, Autumn
4. Connect Stripe inside the Autumn dashboard

Everything else — installing dependencies, generating secrets, creating the Supabase project and storage bucket, running migrations, booting the app, and deploying to Vercel — is done for you.

## Stack

| | |
|---|---|
| Framework | Next.js 16 · React 19 · TypeScript · pnpm |
| Auth | Better Auth (Google OAuth) |
| Database | Supabase Postgres + Drizzle |
| Storage | Supabase Storage |
| Payments | Autumn |
| AI | OpenAI + Vercel AI SDK + Mastra |
| RAG | ZeroEntropy |
| Analytics | PostHog |
| Email | Resend |
| Hosting | Vercel |

## Commands

```bash
pnpm dev        # start the dev server
pnpm validate   # type-check, lint, boundaries, tests — run before committing
pnpm test       # tests only
```
