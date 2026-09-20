# addressfindr — Engineering Guide

You are a **senior engineer working in production**.
This is a real system with real users.

> Build code that is **correct, simple, and maintainable**.
> **Correctness > cleverness · Simplicity > abstraction · Explicitness > magic · Consistency > preference.**

Single Next.js app, built on a reusable startup boilerplate. The boilerplate provides auth and file upload + RAG indexing. **The product is built on top of that base — it does not replace it.**

The user-facing brand is still undecided, so **never hard-code a product name in user-visible copy**; everything user-facing goes through `next-intl`.

---

## What we are building

**Given the URL of a French property listing, return the exact postal address of the property.**

Listing portals deliberately hide the address — they show "Lyon 3e", a photo and a price. The product recovers it.

### Why it is possible at all

French listings are legally required to display the **DPE** (energy) and **GES** labels. ADEME publishes **every DPE issued in France as open data, with the full postal address**, plus surface, construction year, dwelling type and floor.

So the listing leaks a fingerprint of itself. We do **no geolocation**. We do **record linkage**: match the listing's attributes to a row in the ADEME base, and read the address off that row.

The discriminating fields, roughly in order of value: **DPE class**, surface m², commune (INSEE code, not postal code — a postal code can span several communes), rooms, floor, construction year, property type.

`precisement.fr` is the existing player and the reference implementation to study. Their declared sources: ADEME (DPE base), IGN/Géoplateforme (address reference, basemaps), DGFiP (cadastre), CSTB (BDNB), plus a commune reference.

### The rule that governs every design decision here

**A wrong address costs far more than no address.** The matching produces a *confident* answer; if the inputs are wrong, the output is confidently wrong, and the product's entire credibility is the claim "this is the address". Whenever a choice is between a plausible guess and an absent field, **choose the absent field.**

This is why, throughout the `listing` domain:

- **The LLM localises; deterministic code parses.** The model never returns a value. It returns the *exact quote* from the page where the value can be read. The quote is verified to exist literally in the source, then a deterministic parser extracts the value from it. A hallucinated value is structurally impossible because the value never comes from the model.
- **Structured data beats prose, always.** Precedence is `hydration` → `json-ld` → `llm` → `absent`, first non-null wins, nothing later overwrites.
- Out-of-bounds values become `null`, never clamped and never guessed.

### Pipeline

1. **Ingest** — user pastes a listing URL; the backend scrapes it via Firecrawl, asking for `markdown` + `rawHtml` in one call.
2. **Extract** — structured first (`__NEXT_DATA__` / `__NUXT__`, then JSON-LD), LLM on the markdown only for fields still empty.
3. **Normalise** — commune resolution, surface conventions (habitable/Carrez vs terrain), French number formats.
4. **Candidates** — filter the ADEME base on commune + type + surface range + DPE. *(not built yet)*
5. **Score and disambiguate** — return an address with a confidence, or nothing. *(not built yet)*

### Current state

- **Built:** the `listing` domain — ingestion + extraction. `URL → normalised fields + per-field provenance`.
- **Not started:** everything ADEME — data access, candidate generation, scoring, and the UI.
- Spec: `docs/superpowers/specs/2026-09-17-listing-ingestion-extraction.md`
- Plan: `docs/superpowers/plans/2026-09-17-listing-ingestion-extraction.md`

### Measured facts — do not re-derive these

Verified 2026-09-17 against one real listing per portal via the Firecrawl API. A strong signal, not a census.

| Portal | Usable structured source | DPE in it? |
|---|---|---|
| `leboncoin.fr` | `__NEXT_DATA__` — the complete record | **yes** (`energy_rate`, `ges`) |
| `immobilier.lefigaro.fr` | `__NUXT__` (paths not yet mapped) | yes, plus `inseeCode` |
| `proprietes.lefigaro.fr` | `__NUXT__` (paths not yet mapped) | yes, plus `inseeCode` |
| `iadfrance.fr` | JSON-LD `Apartment` | partial; has `yearBuilt` |
| `seloger.com` | JSON-LD `RealEstateListing` | no |
| `pap.fr` | JSON-LD `Product` | no — but exposes **`streetAddress`** outright |
| `century21.fr`, `orpi.com`, `logic-immo.com`, `bellesdemeures.com` | none | — |

- **No portal exposes the DPE in JSON-LD.** The most discriminating field is never in the standard markup. It comes from hydration payloads or from the page text.
- **Firecrawl gets past DataDome on leboncoin** (verified in both `basic` and `stealth` modes). Do not assume it is blocked.
- `logic-immo.com` returns a JS shell even with `waitFor: 8000`.
- The DPE survives Firecrawl's markdown conversion only by accident: clean on seloger, present on century21 only because the agent typed it in free text, present on orpi only in an image `alt`, and **entirely absent on pap.fr**.
- A listing page's markdown contains neighbouring properties ("biens similaires") and nearby metro stations. On the pap.fr listing measured, the markdown lists `Rue des Boulets` (a metro stop) while the real street `Rue Guénot` appears only in the JSON-LD. **Never trust a street name that came from page prose.**

### Traps that have already bitten us

- Invisible Unicode spaces (U+00A0, U+202F, U+2009, U+2007) are everywhere in French listings, especially in prices. A `\uXXXX` escape written into a TypeScript string literal has been flattened to an ordinary space **three times** in this repo, twice producing a test that passed while asserting nothing. **Build these characters with `String.fromCharCode` and assert their presence before using them.**
- `parsePostalCode` grabs the first standalone 5-digit run. A price under €100 000 in a listing title (`89000 € Lyon (69001)`) looks exactly like a postal code. Free-text heuristics must run *after* structured fields, never before.
- INSEE commune codes are 5 characters, and Corsica uses `2A`/`2B` (`2A004`). `\d{5}` alone rejects Corsica; `[0-9AB]\d{4}` also rejects it.

---

## Commands (pnpm 10)

- `pnpm dev` — Next.js dev server (Turbopack)
- `pnpm build` — production build
- `pnpm type-check` — `tsc --noEmit`
- `pnpm test` / `pnpm test:watch` — vitest (unit + co-located tests)
- `pnpm check` / `pnpm check:fix` — **biome** (format + organize-imports + light lint)
- `pnpm lint` / `pnpm lint:fix` — **ESLint** (`eslint-config-next` + `react-hooks`)
- `pnpm format` / `pnpm format:check` — biome format only
- `pnpm check:boundaries` — domain-isolation checker (`scripts/check-domain-boundaries.mjs`)
- `pnpm validate` — `type-check && check && lint && check:boundaries && test`
- `pnpm drizzle:generate` / `migrate` / `push` / `pull` / `drop` — Drizzle migrations

**Done-gate before claiming work complete:** `pnpm validate`.

**Husky pre-commit:** `tsc --noEmit` → `lint-staged` (eslint + biome on `*.{js,jsx,ts,tsx}`, biome format on JSON except `drizzle/**`) → `scripts/check-domain-boundaries.mjs` (layer purity, no barrels, and the domain-isolation rules below). Do **not** bypass with `--no-verify` unless explicitly asked.

**Pre-push** blocks direct push to `main`/`master`/`prod`. Use a feature branch + PR.

**Migrations are generated, never hand-written.** Edit schema in `src/infra/database/schema/*`, then `pnpm drizzle:generate` (writes to `drizzle/`).

---

## Stack — what's actually here

- **Runtime**: Next.js 16 (App Router) · React 19 · TypeScript 6
- **DB / data**: Drizzle ORM + Postgres · Supabase Storage (file objects) · ZeroEntropy (RAG vector store) · Upstash Redis (rate-limit / cache)
- **Auth**: Better Auth (Google + Microsoft OAuth)
- **Validation**: **valibot 1.x** (schemas at every boundary)
- **Errors**: **neverthrow** `Result<T, AppError>`
- **i18n**: **next-intl** — keys in `src/i18n/messages/{en,fr}.json`; `t('missing.key')` is a compile error via `IntlMessages` augmentation in `src/global.d.ts`
- **AI**: **Mastra** agents (`@mastra/core` + `memory` + `pg` + `ai-sdk` + `observability` + `posthog`) on top of Vercel AI SDK v6; **OpenAI-only** (`@ai-sdk/openai`)
- **UI**: shadcn / Radix / Base UI · Tailwind v4 · `lucide-react` · `motion` · `sonner` · `next-themes`
- **Email**: provider-switchable (Resend or SMTP), `react-email` for templates
- **Observability**: OpenTelemetry (OTLP) + PostHog (product analytics + Mastra exporter) · `pino` logger
- **Background work**: `@vercel/functions` `waitUntil` for fire-and-forget; **cron only for retry / stuck-state**, never as a primary work queue

---

## Codebase map

Single alias: `@/*` → `src/*`. There is **no `lib/` at repo root**; utilities live under `src/lib`, `src/shared`, `src/hooks`.

```
src/
  core/              Pure domain. NO infra/app/application/shared/i18n imports.
    errors.ts        AppError discriminated union + helper constructors
    ports/           Port interfaces (*.port.ts) the domain depends on
    <context>/       agents, chat, conversation, file, storage, retrieval, …
    types/           cross-context types
  application/       Use cases — orchestration, called from route handlers
    <feature>/
      <action>.ts    one verb per file
      dto.ts         DTOs co-located with the use case
  infra/             IO only. Implements core ports. Returns Result.
    database/        Drizzle schema + connection
    data-access/     Repositories — map DB rows → DTOs (never raw rows out)
    external-apis/   Mastra agents + tools, OpenAI, ZeroEntropy, Brave, …
    auth/            Better Auth (server + client)
  app/               Next.js App Router UI
    (public)/        unauthenticated routes
    (app)/           authenticated routes (gated by layout.tsx)
    api/             route handlers — the ONLY server entry point (chat stream, files, conversations, cron, …)
    auth/[...all]/   Better Auth handler
  shared/            logger, env, telemetry, errors-http, utils
  i18n/              messages + request config
  components/ui/     shadcn primitives (Button, Dialog, …)
  hooks/             cross-cutting React hooks
  lib/               small client-side utilities (cn, etc.)

drizzle/             Generated migrations + meta snapshots (don't hand-edit)
src/instrumentation.ts          OpenTelemetry + Mastra observability boot
src/instrumentation-client.ts   PostHog client init
```

---

## Architecture — YOU uphold these (checker-enforced where noted, the rest by discipline)

### Never

- Import into `core/` from outside `core/`
- **Write a server action.** The `'use server'` directive is banned (ESLint `no-server-actions/no-use-server`). Every client→server call goes through a route handler under `src/app/api/*`, invoked with `fetch` from the client. Register the new route's directory in its domain in `scripts/boundaries/manifest.mjs`.
- Import `infra/` from `app/` UI (go through `application/`). Server-side wiring required by Next.js — route handlers, layout session checks — may import `@/infra/auth/auth`.
- Call infrastructure from domain — use ports (`core/ports/*.port.ts` → adapter in `infra/` → wired in `application/`)
- **Throw across layers from infrastructure** → return `Result<T, AppError>`. Internal pure helpers may throw; the calling adapter catches and converts.
- Return raw DB rows → map to DTOs in `infra/data-access/*`
- Create circular dependencies
- Use barrel files (`index.ts` re-exports) — import modules directly
- Write code comments — self-documenting names instead. (One short `// why` line is OK when the why is non-obvious — a hidden constraint, subtle invariant, or workaround.)
- Hard-code user-facing strings — `next-intl` (`useTranslations` / `getTranslations`)
- Read `process.env.X` outside `shared/env.ts` and `instrumentation.ts`
- Expose `unknown` from any layer — validate at the boundary, return strictly-typed `Result`. `any` is forbidden by lint; `unknown` is allowed only as a narrow boundary input that gets immediately validated.

### Always

- **Schemas first** — define valibot, types, ports before writing the use case
- **Layers**: `core/` (pure logic, domain services) → `application/` (use cases, entry points, DTOs) → `infra/` (IO, implements ports, returns `Result`) → `app/` (UI only)
- **`≥3 params → object param`** — convention; old call sites with positional triples are debt, don't copy them
- **Idempotent writes; retry-safe external calls**
- **Validate every boundary** with valibot (use-case input, API route body, env, external API response)
- **Log start / success / failure** with structured context — `shared/logger` (pino). No `console.log`. PII auto-redacted.

```ts
import { log } from '@/shared/logger';
log.info('feature.action.start', { userId, threadId });
log.info('feature.action.success', { rowsAffected });
log.warn('feature.action.failed', { reason });   // recoverable
log.error('feature.action.crashed', err, { userId });  // unexpected
```

---

## Domain isolation — manifest-driven, enforced at every layer

The codebase is partitioned into **domains** declared in `scripts/boundaries/manifest.mjs`. Every `src/` file belongs to exactly one domain (or the shared bucket / generic UI). The rule engine lives in `scripts/boundaries/evaluate.mjs` and is consumed by **independent enforcement layers** — client-side hooks are convenience, CI is the authority:

1. **ESLint** — the inline `domain-boundaries/enforce` rule (in `eslint.config.mjs`) reports violations live in the editor, in `lint-staged`, and in `pnpm lint`.
2. **Whole-tree checker** — `scripts/check-domain-boundaries.mjs` (`pnpm check:boundaries`) adds file-level rules (unassigned files, unowned schemas, barrels) and scans everything including regex-level dynamic-import detection. Runs in husky pre-commit and `pnpm validate`.
3. **Vitest** — `scripts/domain-boundaries.test.ts` runs the same checker inside `pnpm test`, so the CI `test` job enforces it too.
4. **CI** — a dedicated `boundaries` job runs on every push and pull request.
5. **Branch protection (do this once per clone)** — in GitHub settings, protect `main` and require the `boundaries`, `test`, and `type-check` checks. That is the only gate a developer cannot bypass locally; everything above is fast feedback for it.

Domains and their tables:

| Domain | Owns tables | Public entry points (examples) |
|---|---|---|
| `auth` | `user`, `session`, `account`, `verification` | `infra/auth/auth`, `application/me/get-current-user`, `application/me/user-scope` |
| `early-access` | `early_access_code` | `application/early-access/redeem`, `application/early-access/has-redeemed-code` |
| `files` | `file` | `application/files/*` use cases, `core/file/types` |
| `indexing` | `zeroentropy_*`, `failed_sync_operation` | `entity-sync-orchestrator`, `query-snippets` |
| `chat` | none (Mastra runtime owns its PG tables) | — |
| `transcription` / `url-fetch` / `web-search` | none | their single `application/<domain>/*` use case |
| `listing` | none | `application/listing/*` use cases, `core/listing/types` |
| `rate-limit` / `email` | none (platform, open to all) | `apply-rate-limit`, `llm-cost-limiter`, `email-sender` |

Rules the checker enforces:

1. **Table ownership** — a drizzle schema file may only be imported from its owning domain's `infra/` layer (plus `infra/database/*`). The application layer never imports schema.
2. **DB access** — `@/infra/database/connection` is importable only from `infra/data-access/**`, `infra/auth/**`, `infra/database/**`. Use cases never touch `db` directly.
3. **Repository privacy** — `infra/data-access/<ctx>/**` is private to its domain. Other domains go through application entry points.
4. **Entry points** — a cross-domain import must target a module listed in the target domain's `public` array. Everything else is internal.
5. **Declared edges** — domain-to-domain dependencies must be listed in `ALLOWED_EDGES` (platform domains `auth`, `rate-limit`, `email` are open to all). Undeclared coupling fails.
6. **Layer purity + no barrels** — `core/` imports nothing from `application`/`infra`/`shared`/`app`; no `index.ts` anywhere.

**Adding a domain**: create its dirs (`core/<x>`, `application/<x>`, `infra/data-access/<x>`, schema file), register it in `scripts/boundaries/manifest.mjs` with dirs, owned schemas, and public entry points, and declare any edges it needs. The checker's `unassigned-file` rule will remind you if you forget.

**Extending a domain's API deliberately**: add the module to its `public` list (or add an edge). That diff on `scripts/boundaries/manifest.mjs` is the reviewable contract change — never work around the checker by moving files between domains to dodge a rule.

---

## Stack-specific rules

### LLM / AI

- **OpenAI-only**. Never propose Anthropic / Claude / Mistral / any other LLM. Tier by OpenAI models.
- Defaults live in `shared/env.ts`:
  - `CHAT_MODEL` — Generalist + Knowledge agents
  - `CHEAP_MODEL` — router, post-stream critic, HyDE, retrieval critic, Help agent
- **Allowed model picklists are pinned** (`core/chat/types.ts`). Adding a model = update the picklist + `core/rate-limit/llm-cost-config.ts` pricing row.
- **Use Mastra built-ins** before writing custom processors: `TokenLimiterProcessor`, working-memory schema, input/output processors. Don't reinvent.
- Mastra agents are defined in `src/infra/external-apis/mastra/instance.ts` (definitions in `agent-definitions.ts`). Routing in `src/application/chat/route-agent.ts`. Add a new tool under `mastra/tools/` + register in the right agent's `tools` map.
- **Prompt caching** is automatic on OpenAI models for stable prefixes ≥ 1024 tokens. Keep system prompt + tool registry stable across turns; observe `cacheHitPct` in `chat.timing/stream_finished` logs.
- Capture usage via Mastra `onFinish` callback in `defaultOptions` (the `finish` stream chunk does **not** carry usage in this AI-SDK version).
- Fire-and-forget post-stream critics / cost recording / vision describe → **`waitUntil` from `@vercel/functions`**. Bare `void asyncFn()` dies on Vercel.

### RAG

- **ZeroEntropy is locked.** Never propose pgvector / qdrant / Weaviate / any other vector store. Build on top of ZE.
- Retrieval feature flags live in env: `RETRIEVAL_USE_HYDE`, `RETRIEVAL_USE_CRAG`, `CHAT_POST_STREAM_CRITIC`.
- **Evals are hard.** Don't require manual golden queries; default to auto-generated evals or skip the eval gate.

### UI

- **Sidebar stays collapsed (icon-rail only)** in this app — deliberate stylistic choice, never propose expanding it.
- shadcn primitives in `src/components/ui/*` — copy patterns from there. Reuse `cn()` from `src/lib/utils.ts`.
- Design language lives in `DESIGN.md` — light-mode, layered off-whites, one accent color.
- No emojis in code/files unless the user asks.

### Cross-app rule

- **Respect another agent's deletions.** If code was removed, replan around the deletion — never silently restore it.

### Infra constraints

- **No new infra / SaaS subscriptions.** Stick to the existing stack: OpenAI, ZeroEntropy, Supabase, Upstash, Vercel, PostHog. If you think you need something else, raise it explicitly first.
  - **Approved additions (raised and accepted 2026-09-17), scoped to the `listing` domain:**
    - **Firecrawl** — scraping des annonces immobilières. Retenu après mesure : il passe DataDome sur leboncoin là où un `fetch` direct ne passe pas. Appelé en REST via `fetch`, aucun paquet npm ajouté.
    - **Groq** — hébergeur d'inférence pour l'extraction de champs depuis le markdown d'annonce. Le modèle reste un modèle OpenAI (`openai/gpt-oss-120b`), donc la règle « OpenAI-only » tient sur le fond ; seul l'hôte d'inférence change. API compatible OpenAI, donc `@ai-sdk/openai` avec un `baseURL` — aucun paquet npm ajouté, et le repli vers OpenAI est un changement de config.
    - Rationale et mesures : `docs/superpowers/specs/2026-09-17-listing-ingestion-extraction.md` §3 et §4.1.
- **Cron is only for retry / stuck-state cleanup.** Primary work runs in-request (or via `waitUntil`).

---

## i18n

- Default `fr`, fallback `en`. No `[locale]` in URLs — locale comes from `LOCALE` cookie.
- **Type-source-of-truth: `src/i18n/messages/en.json`.** All other locales must mirror its shape.
- `IntlMessages` augmentation in `src/global.d.ts` turns missing keys into compile errors.

---

## Done =

- Types strict (no `any`; no leaking `unknown`)
- Validates at every boundary (valibot)
- Errors handled (`Result<T, AppError>`)
- Logs added (start / success / failure with context)
- Architecture respected (no forbidden imports)
- Tests added for domain + critical logic
- Code is clear (small functions, no dead `// what` comments)
- `pnpm validate` is green

---

## Mindset

Write code that:

- **scales** — domain stays pure, infra stays swappable
- **is easy to change** — small focused modules, no premature abstraction
- **fails safely** — `Result` over throw, idempotent writes, retry-safe externals
- **other engineers understand** — boring patterns over clever ones
