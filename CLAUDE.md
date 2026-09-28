# addressfindr — Engineering Guide

You are a **senior engineer working in production**.
This is a real system with real users.

> Build code that is **correct, simple, and maintainable**.
> **Correctness > cleverness · Simplicity > abstraction · Explicitness > magic · Consistency > preference.**

Single Next.js app, built on a reusable startup boilerplate. The boilerplate provides auth and file upload + RAG indexing. **The product is built on top of that base — it does not replace it.** The app shows no account UI: auth and billing stay in the codebase, dormant, and the tool is the home page.

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
4. **Candidates** — filter the ADEME base on commune + type + surface range + DPE.
5. **Score and disambiguate** — return a ranked shortlist of addresses with a confidence each, or nothing.

### Current state

- **Built:** the whole pipeline. `listing` (ingestion + extraction, `URL → normalised fields + per-field provenance`), `commune` (postal code / INSEE → commune, via geo.api.gouv.fr), `ademe` (candidate generation + scoring over both DPE registers, via data.ademe.fr), and the dashboard UI that chains extract → match, and a feedback loop: "C'est ce logement" / "Aucun emplacement ne correspond" stored in the `listing_feedback` table through `/api/listings/feedback` (no personal data; one verdict per displayed result, idempotent).
- **Sources:** ADEME (both DPE registers), geo.api.gouv.fr (commune), BDNB/CSTB (building year and floors), DGFiP cadastre via apicarto IGN (plot area), the BAN geocoder of the IGN Géoplateforme (`data.geopf.fr/geocodage`, to verify addresses ADEME never geocoded). All free, public, keyless. Display only: Mapbox (map) and Google Street View (card photos), both keyed and billed, and the IGN Géoplateforme orthophoto (WMS `ORTHOIMAGERY.ORTHOPHOTOS`, free, keyless) as the photo fallback around a trusted point, and the listing portal's favicon from Google's s2 favicon endpoint (`www.google.com/s2/favicons`, free, keyless), sent the portal's registered domain only, never the listing URL. Outbound link only: villedereve.fr ("Vie de la commune", a municipal arrondissement links to its parent commune). Otherwise the BAN is consumed through ADEME's `*_ban` columns.
- **Ground truth:** `pnpm eval:address` runs the pipeline over live pap.fr listings, hides their published street and reports at what rank it comes back. It hits Firecrawl, Groq and the public APIs for real, so it is excluded from `pnpm test` and from CI. Last run: 6/6 correctly refused for lack of a discriminating signal — **but that run predates the Groq schema fix below, so the model never answered; re-measure it.**
- **Market benchmark:** `pnpm eval:precisement` runs the listings in `test/fixtures/precisement-benchmark-urls.txt` through our pipeline and through precisement.fr's public search API, and reports whether both return the same first address. Scraped pages and their answers are cached in `.benchmark/` (gitignored), so reruns cost no Firecrawl credit and send them no request. Manual only, never in CI. Model quotes are cached there too, so a rerun spends Groq tokens only on sources it has not read. Last complete run (2026-09-24, 25 leboncoin listings): **21/25 same #1**, up from 6/25 — with 6 extractions lost to the Groq schema failure below, since retried. Later runs that day were invalidated by a data.ademe.fr outage and then by the exhausted Groq daily quota.
- **Not started:** the `__NUXT__` mapping for the two lefigaro portals. Needs one real listing URL to inspect — Firecrawl only ever returns lefigaro's search page as nav chrome, so the payload paths cannot be mapped without one.
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
| `pap.fr` | JSON-LD `Product` | no — but exposes **`streetAddress`**, street only, no house number |
| `century21.fr`, `orpi.com`, `logic-immo.com`, `bellesdemeures.com` | none | — |

- **No portal exposes the DPE in JSON-LD.** The most discriminating field is never in the standard markup. It comes from hydration payloads or from the page text.
- **Firecrawl gets past DataDome on leboncoin** (verified in both `basic` and `stealth` modes). Do not assume it is blocked.
- `logic-immo.com` returns a JS shell even with `waitFor: 8000`.
- The DPE survives Firecrawl's markdown conversion only by accident: clean on seloger, present on century21 only because the agent typed it in free text, present on orpi only in an image `alt`, and **entirely absent on pap.fr**.
- A listing page's markdown contains neighbouring properties ("biens similaires") and nearby metro stations. On the pap.fr listing measured, the markdown lists `Rue des Boulets` (a metro stop) while the real street `Rue Guénot` appears only in the JSON-LD. **Never trust a street name that came from page prose.**

### Measured facts — ADEME and commune resolution (2026-09-22)

Verified against the live `dpe03existant` dataset (15 604 436 rows) and geo.api.gouv.fr. Both APIs are free, public and keyless.

- **The DPE letter does not identify a property.** Lyon 3e (`69383`), apartment, exact 63 m², DPE `D`, GES `D` still leaves **28** rows. The letter narrows, it never resolves.
- **The numeric DPE does.** `conso_5_usages_par_m2_ep` and `emission_ges_5_usages_par_m2` are populated on **141/141** sampled rows, and a ±5 kWh window cuts 141 candidates to **3**. Both numbers are printed on the label every French listing must display. This is why `dpeKwhM2Year` / `gesKgCo2M2Year` are extracted.
- **`typologie_logement` (T1…T7) is empty in practice** — 0 of 94 sampled rows. **Rooms cannot be matched against ADEME**, whatever the field list suggests.
- **`numero_etage_appartement` is a trap.** Populated on 89/94 rows, but **85 of those are `0`**. It is a default, not a ground floor. Never hard-filter on it.
- **ADEME keys on the arrondissement, not the commune.** `69383` holds 36 709 rows, `69123` (Lyon) holds 61. `75115` holds 94 389, `75056` (Paris) holds 419.
- **geo.api.gouv.fr `/communes` returns the parent commune by default** — `codePostal=69003` gives `69123 Lyon`, not `69383`. Pass `type=commune-actuelle,arrondissement-municipal`.
- **Commune name search is not usable as a key.** Querying `nom=Lyon 3e` returns `Beauvoir-en-Lyons` and `Beauficel-en-Lyons`. A name may only break a tie, never select on its own.
- **A postal code can span many communes** — `01400` covers 10.
- **1266 of Lyon 3e's 35 311 apartment rows carry no street number** (559 of 3198 in Saint-Genis-Laval). They match every other criterion and rank at 100%, so they are excluded at the query.
- **Some ADEME rows are stored double-encoded** — `58 Rue de l<mojibake>Abondance` beside a clean `70 Rue de l'Abondance` on the same street.
- `size` on `/lines` accepts up to **10000**; 10001 returns 400.
- **A signal already used as a hard search filter discriminates nothing.** Surface is a range filter, so rows differ on it; the DPE letter is an equality filter, so every returned row carries the same one. Neither may count as evidence that an answer is supported. The GES letter is never filtered on, so it does.
- **BDNB (CSTB) joins to ADEME exactly.** Its `cle_interop_adr` is the same BAN key ADEME publishes as `identifiant_ban`. Two hops: `rel_batiment_groupe_adresse` maps the key to a `batiment_groupe_id`, `batiment_groupe_complet` carries the values. Free Open API, no key, at `api.bdnb.io/v1/bdnb/donnees/...`. Measured at Lyon 3e: it resolves **32%** of addresses, and on those it supplies `annee_construction` and `nb_niveau` every time — against 58% coverage for ADEME's own `annee_construction`.
- **The cadastre is reachable through BDNB, not separately.** `l_parcelle_id` is the DGFiP identifier; `apicarto.ign.fr/api/cadastre/parcelle` returns its `contenance` given `code_insee` + `section` + `numero` split out of the 14-character id. Verified: `69204000AD0022` → 1261 m². Only usable when a building sits on exactly one parcel, and only for houses.
- **The new-dwelling register is a second dataset.** `DPE Logements neufs`, 1 429 026 rows. Its readable slug does not resolve — `dpe03neuf` returns 404; only `g3cgx7jb3cmys5voxz1mrm22` answers. Field schema is identical to the existing register, checked field by field. For Lyon 3e apartments it holds 42 rows in class A, 337 in B, 573 in C — the classes a new build advertises.
- **`identifiant_ban` beats the address string as a grouping key.** Populated on 34 045/34 045 rows. On one 600-row sample: 365 identifiers against 372 distinct spellings, 6 identifiers carrying more than one spelling, and no address carrying more than one identifier. Format `69383_4180_00016`.
- **Rows are not addresses.** 600 Lyon 3e rows carry only 372 distinct addresses; one address appears 15 times, and a Saint-Genis-Laval building carries 35.
- **`type_energie_principale_chauffage` is fully populated** and splits a pool roughly three ways (gas 334, electricity 218, district heating 45 on one realistic filter). Its vocabulary has 15 values; `Non affecté` means unrecorded and `Réseau de Froid Urbain` is not heating.
- **`score_ban` is mostly mid-range**: only 5 069 of 34 045 Lyon 3e rows reach 0.8, and 372 fall below 0.5.
- **pap.fr's ground truth is street-level.** Measured on 6 real listings: `streetAddress` reads `Rue Tholozé 75018 Paris`, `Rue Brancion` — the street without the number. Useful as an eval reference, not as a full address.
- **pap.fr shows no energy label at all**, so extraction there yields only commune, type and surface. Since surface is already a hard filter, every returned row agreed on the only comparable signal and scored 100%. This is why the matcher now refuses without a discriminating signal.

### Measured facts — ADEME coordinates (2026-09-23)

Verified on 7000 `dpe03existant` rows across `69383`, `75115`, `13201`, `33063`, `59350`, `2A004`, `31555`, plus the DOM communes.

- **`_geopoint` is always populated — 7000/7000 — and that is the trap.** It is a `"lat,lon"` WGS84 string, so Mapbox needs it reversed to `[lon, lat]`. It is present even when the row was never geocoded.
- **`statut_geocodage` is the only usable gate.** 23.4% of rows say `adresse non géocodée ban car aucune correspondance trouvée` while still carrying a coordinate. Only two distinct values were observed in 5000 rows, but anything other than the exact `adresse géocodée ban à l'adresse` must be refused — fail closed.
- **`score_ban` cannot gate anything.** Geocoded rows span `0.00–0.99`, non-geocoded rows span `0.17–0.99`. The distributions overlap; no threshold separates them.
- **Overseas coordinates are systematically wrong while claiming success.** ADEME stores DOM coordinates in the local projection (UTM 40S for Réunion) and unprojects them as Lambert-93, so `97411` lands at `56.13,-2.66` in the North Sea with `statut_geocodage` reporting success. Martinique, Guyane and Mayotte land in the Gulf of Guinea.
- **Métropole has sentinels too.** 24 Lyon rows sit at `-5.98,-1.36` (Atlantic off Ghana) with `adresse_ban = null` and `score_ban = 0.88`. 0.5% of all rows fall outside France.
- The gate that follows lives in `core/geo/resolve-mappable-point.ts`: status, then overseas postal code, then a métropole bounding box. **No pin beats a wrong pin.**
- **The map speaks for the top-ranked candidate only** (`core/ademe/candidate-on-map.ts`). When #1 has no trusted point, no pin is shown — pinning #2 by default would put a different address on the map than the answer. Another candidate is pinned only when the user picks it, and the pinned address is always named above the map. A picked candidate without a trusted point is honoured too: the pin disappears and the map rests on the commune (`mapOverview`), it never stays on the previous address.
- **The results view is a three-panel workspace** matching precisement.fr: the analysed listing and the ranked cards on the left, the map, and the selected result's detail (photo, score, address, energy labels, fact tiles with ✓ only when the value agrees with the listing's own (surface within 1 m²), verify-elsewhere links, "C'est ce logement") on the right; the detail floats over the map between `lg` and `xl` and becomes a bottom sheet below `lg`. It never shows how a candidate was scored. There are no accounts in the UI. When no map can be drawn the map region shows a notice and the rest works.
- **Street View photos only ever point at a trusted point.** A candidate without one gets no photo. The free metadata call runs first, so an image is only billed when a panorama exists within 50 m; without `heading`, Google aims the camera at the point.

---

### Measured facts — precisement.fr benchmark on leboncoin (2026-09-24)

Measured on 25 live leboncoin listings (Lyon, Bordeaux, Nantes, houses around Toulouse and Rennes), taking precisement.fr's first answer as the reference. Their frontend calls `POST https://api.precisement.fr/search` with `{ "url": … }`.

- **The DPE date is the strongest single signal, and it lives only in the description.** 18/22 leboncoin descriptions carry `Date de réalisation du diagnostic énergétique : 14/04/2022`; ADEME's `date_etablissement_dpe` or `date_visite_diagnostiqueur` equals it to the day. Firecrawl's markdown cuts the description at "Voir plus", so the full text is read from `__NEXT_DATA__` `ad.body`.
- **leboncoin's `annual_energy_budget_min/max` pins ADEME's `cout_total_5_usages`.** The label prints a range rounded to ten euros around the cost; the midpoint lands within 0.5 % on every row checked (1540 vs 1536.4, 720 vs 719.5, 1760 vs 1763.3, 3900 vs 3897.7). Structured, no model needed.
- **A 3 % surface window missed 6 of their 25 answers.** ADEME's surface sat at 0.89–1.08 × the listed one (133.8 m² for 150, 110 for 123, 193.8 for 210): listings count annexes. The window is 12 %; at that width Paris 15e (40 m², DPE D) returns 3936 rows in 3.6 s, hence the 5000-row limit.
- **Before any fix, 17/25 answers were a wrong address at 100 %**, on surface and two letters that hundreds of rows share. Confidence now never exceeds `awarded / max(available, 12)`.
- **A listing can name the wrong commune.** One "Rennes" listing describes a house in Melesse. Department + exact DPE date + type + letter leaves 8 rows in Ille-et-Vilaine, so the department is searched on the date when no row of the commune carries it.
- **leboncoin's pin is precise only when `location.source === 'address'` and `is_shape === false`.** Their answer sat 3 m, 13 m, 94 m and 393 m from such a pin, and 1 km on a listing they flag as ambiguous. A `source: 'city'` pin is the town centre.
- **`heating_mode` values seen: `gas`, `electric`, `other`.** `other` covers heat pumps and wood alike, so it maps to nothing.
- **Rows ADEME never geocoded carry no `code_insee_ban`** — only `adresse_brut`, `code_postal_brut` (stored as a number: `01500` arrives as `1500`), `nom_commune_brut`. They are invisible to a commune query: 1.1–2.7 % of rows in Lyon, Nantes, Bordeaux and Paris, **10.8 % in Rennes**. They are now searched on the commune's postal codes, and the ones that would reach the shortlist are sent to the BAN geocoder.
- **The geocoder score cannot verify an address.** On 60 raw rows it was wrong at 0.51–0.59 (`19 rue du Champs de la Vigne` → `19 Rue de la Poterie`, `2 rue Monseigneur Vincent` → `2 Rue Monseigneur Duchesne`) and right at 0.37–0.50 when the raw text carried a building name or a floor. `core/geo/verify-geocoded-address.ts` checks word by word instead: one numbered line, same house number, same commune, same street type, every significant raw word present in the answer. A row that fails is dropped, never shown with its typed address.
- **Divergences left after the fixes:** the listing's DPE (2026-09-23) is newer than the register, and they flag it themselves; their answer contradicts the listing's own DPE date and cost and has no house number; they flag the ranking as ambiguous.

### Traps that have already bitten us

- **Groq's strict structured output rejects a JSON schema whose `required` does not list every property.** The listing extractor sent `required: []`, so every quote extraction failed on every portal, and the failure only reached a `log.warn`. Absent fields are now `null`, never missing keys.
- **data.ademe.fr has outages, and a 5000-row read is heavy.** On 2026-09-24 it timed out and then reset every connection for about 17 minutes; the same searches answered normally afterwards. One 5000-row read is 4.6 MB and takes 7–9 s. Transient failures (timeout, network, 429, 5xx) get one retry; a malformed query never does.
- **Even with strict mode, `openai/gpt-oss-120b` on Groq sometimes omits a required key** ("Generated JSON does not match the expected schema … missing properties"): 6 calls out of 25 on 2026-09-24, each succeeding when replayed. A failed call loses every quote, the DPE date included, so the extractor makes up to 3 attempts. A call uses about 1 800 tokens.
- **Groq's `on_demand` tier allows 200 000 tokens per day — about 110 listing extractions at ~1 800 tokens each — and 8000 tokens per minute.** Past the daily quota every extraction fails until tokens age out, and a failed extraction loses the DPE date: the match quietly degrades. A 429 is never retried by the extractor (the SDK already did). Production traffic needs the paid tier.
- **The per-minute limit also bites on long pages.** A 20 000-character French page is about 7000 tokens, so one long page fails the call outright. Portals whose hydration carries the description send only that; the others still send up to `MAX_MARKDOWN_CHARS` and need either a paid tier or a smaller window.

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
- `pnpm eval:address` — ground-truth harness against live pap.fr listings. **Costs Firecrawl and Groq credits, hits the public APIs, never runs in CI.**
- `pnpm eval:precisement` — benchmark against precisement.fr on the listings in `test/fixtures/precisement-benchmark-urls.txt`. Same costs; pages and their answers are cached in `.benchmark/`. **Never runs in CI.**
- `pnpm drizzle:generate` / `migrate` / `push` / `pull` / `drop` — Drizzle migrations

**Done-gate before claiming work complete:** `pnpm validate`.

**Husky pre-commit:** `tsc --noEmit` → `lint-staged` (eslint + biome on `*.{js,jsx,ts,tsx}`, biome format on JSON except `drizzle/**`) → `scripts/check-domain-boundaries.mjs` (layer purity, no barrels, and the domain-isolation rules below). Do **not** bypass with `--no-verify` unless explicitly asked.

**Pre-push** blocks direct push to `main`/`master`/`prod`. Use a feature branch + PR.

**Migrations are generated, never hand-written.** Edit schema in `src/infra/database/schema/*`, then `pnpm drizzle:generate` (writes to `drizzle/`).

---

## Stack — what's actually here

- **Runtime**: Next.js 16 (App Router) · React 19 · TypeScript 6
- **DB / data**: Drizzle ORM + Postgres · Supabase Storage (file objects) · ZeroEntropy (RAG vector store) · Upstash Redis (rate-limit / cache)
- **Auth**: Better Auth (Google + Microsoft OAuth) — server side only, dormant: the app has no sign-in, settings or paywall UI
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
    (public)/        `/` (redirects to `/dashboard`) and the public error pages
    (app)/           the dashboard — the tool itself, open to anonymous visitors
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
- Write a code comment in French. **Comments are English only**, including `// why` lines, test comments and test names. Existing French comments are debt: translate one when you touch it, never add a new one.
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
| `files` | `file` | `application/files/*` use cases, `core/file/types` |
| `indexing` | `zeroentropy_*`, `failed_sync_operation` | `entity-sync-orchestrator`, `query-snippets` |
| `chat` | none (Mastra runtime owns its PG tables) | — |
| `transcription` / `url-fetch` / `web-search` | none | their single `application/<domain>/*` use case |
| `listing` | `listing_feedback` | `application/listing/*` use cases, `core/listing/types` |
| `commune` | none | `application/commune/resolve-commune`, `core/commune/types` |
| `ademe` | none | `application/ademe/find-address-candidates`, `application/ademe/dto`, `core/ademe/types` |
| `street-view` | none | `core/street-view/links` (the UI builds the `/api/street-view` photo URL and the outbound Google Maps panorama link) |
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

- **No sidebar and no account UI.** The dashboard layout is a plain full-height `<main>`; there is no sign-in page, sign-out, settings, profile, paywall or language switcher. Auth and billing stay in the backend, dormant — do not add account UI back unless asked.
- shadcn primitives in `src/components/ui/*` — copy patterns from there. Reuse `cn()` from `src/lib/utils.ts`.
- Design language lives in `DESIGN.md` — light-mode, layered off-whites, one accent color.
- No emojis in code/files unless the user asks.

### Cross-app rule

- **Respect another agent's deletions.** If code was removed, replan around the deletion — never silently restore it.

### Infra constraints

- **No new infra / SaaS subscriptions.** Stick to the existing stack: OpenAI, ZeroEntropy, Supabase, Upstash, Vercel, PostHog. If you think you need something else, raise it explicitly first.
  - **Approved additions (raised and accepted 2026-09-17), scoped to the `listing` domain:**
    - **Firecrawl** — scraping des annonces immobilières. Retenu après mesure : il passe DataDome sur leboncoin là où un `fetch` direct ne passe pas. Appelé en REST via `fetch`, aucun paquet npm ajouté.
    - **Mapbox GL JS** — carte 3D qui montre l'adresse trouvée (demandé explicitement le 2026-09-23). Paquet npm `mapbox-gl`, jeton public `pk.` restreint par URL dans `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`. Facturé au chargement de carte : 50 000/mois offerts, puis 5 $/1000 — d'où une seule `new mapboxgl.Map()` par résultat affiché, déplacée ensuite par `flyTo` d'un candidat à l'autre ; une nouvelle recherche en recrée une. Le paquet n'est téléchargé qu'au premier affichage d'une carte (`next/dynamic`). Jeton absent = carte absente, le reste du produit continue.
    - **Groq** — hébergeur d'inférence pour l'extraction de champs depuis le markdown d'annonce. Le modèle reste un modèle OpenAI (`openai/gpt-oss-120b`), donc la règle « OpenAI-only » tient sur le fond ; seul l'hôte d'inférence change. API compatible OpenAI, donc `@ai-sdk/openai` avec un `baseURL` — aucun paquet npm ajouté, et le repli vers OpenAI est un changement de config.
    - **Google Street View Static API** — photo de rue de chaque adresse candidate (demandé explicitement le 2026-09-24). Appelé en REST via `fetch` depuis `/api/street-view`, clé serveur `GOOGLE_MAPS_API_KEY` jamais servie au navigateur, aucun paquet npm ajouté. Métadonnées gratuites, image facturée seulement si un panorama existe. Clé absente = fiches sans photo.
      - **Compatible avec la carte Mapbox.** Afficher l'imagerie Street View sur le même écran que la carte Mapbox a été confirmé acceptable par Google (2026-09-28, question posée par le propriétaire du projet). Ce n'est plus un bloquant pour la prod.
    - Rationale et mesures : `docs/superpowers/specs/2026-09-17-listing-ingestion-extraction.md` §3 et §4.1.
- **Cron is only for retry / stuck-state cleanup.** Primary work runs in-request (or via `waitUntil`).

---

## i18n

- Default `fr`, fallback `en`. No `[locale]` in URLs — locale comes from `LOCALE` cookie. Nothing in the UI sets it (there is no language switcher); `/api/locale` still does if called.
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
