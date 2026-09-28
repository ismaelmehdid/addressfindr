# ZeroEntropy + Files — production deployment checklist

Everything required to ship the file-indexing pipeline. Do these in order; each step depends on the previous.

---

## 1. Database migration

The migration generated when the schema landed:

```
drizzle/0003_plain_doorman.sql
```

It adds four tables:

| Table | Purpose |
| --- | --- |
| `file` | User-uploaded files, lifecycle, `indexStatus` |
| `zeroentropy_collection` | One per organization, mirror of remote collection |
| `zeroentropy_entity` | Per-document tracking (collectionId + entityType + entityId + docType), with `contentHash` for dedupe |
| `failed_sync_operation` | Retry queue, `nextRetryAt`, exp backoff up to 10 attempts |

It uses `gen_random_uuid()` — confirm the `pgcrypto` extension is enabled on the target DB:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

### Apply

**Dev / staging (fast iteration, no migration history):**

```bash
pnpm drizzle-kit push
```

**Production (use generated migration files, tracks history in `__drizzle_migrations`):**

```bash
pnpm drizzle-kit migrate
```

Pick *one* of these — don't mix `push` and `migrate` against the same database, or migration state will drift.

### Verify

```sql
\dt file zeroentropy_collection zeroentropy_entity failed_sync_operation
```

All four should appear with the expected indexes (`file_storage_key_unique`, `zeroentropy_collection_org_unique`, `zeroentropy_entity_unique`, `failed_sync_operation_event_unique`).

---

## 2. Upstash Redis

Used by the [circuit breaker](../src/infra/external-apis/zeroentropy/circuit-breaker.ts) to share `closed/open/half-open` state across serverless function instances. Without it, breaker state resets per cold start (fallback in-memory kicks in but cross-instance coordination is lost — acceptable but not ideal).

### Create

1. Go to [console.upstash.com](https://console.upstash.com).
2. **Create Database** → Redis.
3. Region: pick the one closest to your Vercel deployment region. For EU Vercel + EU ZeroEntropy → `eu-west-1` or `eu-central-1`. Co-location matters; an US→EU round trip on every breaker check adds ~80ms.
4. Tier: **Free** is fine to start (500k commands/day, 256 MB). The breaker uses ~3 reads + occasional 3 writes per ZE call — well within free tier.

### Copy credentials

In the Upstash dashboard for the new DB:

- **REST API** tab → copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. Use the REST credentials, not the native Redis credentials (the `@upstash/redis` package speaks REST).

---

## 3. ZeroEntropy API key

Source-of-truth for semantic search and document parsing.

### Sign up

1. [dashboard.zeroentropy.dev](https://dashboard.zeroentropy.dev) → create account.
2. Create an API key. Scope it to the project; if multi-tenant separation matters, create one key per environment (prod / preview / dev).
3. Note the API host. EU endpoint: `https://eu-api.zeroentropy.dev/v1` (this is the default in [`.env.template`](../.env.template) and matches what the [client](../src/infra/external-apis/zeroentropy/client.ts) expects). US endpoint exists; use only if explicitly required (latency + data-residency implications).

### Quota sanity check

ZE bills on documents indexed and queries. Watch:

- File uploads → 1 document per file (PDF/image/TXT/JSON), or N per CSV (1 per row, capped at 5000 — see [`csv-serializer.ts`](../src/application/zeroentropy/serializers/csv-serializer.ts)).
- Chat queries → 1 `queryTopSnippets` call per agent invocation that uses the `searchUserFiles` tool. Default `k=10`.

Set a soft alert in the ZE dashboard for unexpected spikes (a 1000-row CSV upload would single-handedly produce 1000 docs).

---

## 4. CRON_SECRET

Protects the [`/api/cron/zeroentropy-retry`](../src/app/api/cron/zeroentropy-retry/route.ts) endpoint from public invocation. Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`; the route refuses anything else.

Generate:

```bash
openssl rand -hex 32
```

The variable is optional in [`shared/env.ts`](../src/shared/env.ts) — if unset, the route accepts unauthenticated requests (do **not** ship to prod without it).

---

## 5. Env vars in Vercel

In **Vercel → Project → Settings → Environment Variables**, add for each environment (Production, Preview, Development):

| Variable | Example | Notes |
| --- | --- | --- |
| `ZEROENTROPY_API_KEY` | `ze_live_…` | From step 3 |
| `ZEROENTROPY_API_URL` | `https://eu-api.zeroentropy.dev/v1` | EU by default |
| `UPSTASH_REDIS_REST_URL` | `https://eu1-…upstash.io` | From step 2, REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | `Ax…` (long base64) | From step 2, REST token |
| `CRON_SECRET` | `<32-byte hex>` | From step 4 |

All five are required by [`shared/env.ts`](../src/shared/env.ts) except `CRON_SECRET` (optional but strongly recommended). The app will fail to boot if `ZEROENTROPY_API_KEY`, `ZEROENTROPY_API_URL`, `UPSTASH_REDIS_REST_URL`, or `UPSTASH_REDIS_REST_TOKEN` are missing — env is validated via valibot at first `env()` call.

After adding, **redeploy** so the new values take effect. Vercel does not hot-reload env.

---

## 6. Verify cron registration

The cron is declared in [`vercel.json`](../vercel.json):

```json
{
  "crons": [{ "path": "/api/cron/zeroentropy-retry", "schedule": "0 3 * * *" }]
}
```

**Why daily, and not `*/5 * * * *`?** Vercel **Hobby** accounts only allow cron jobs that run
**once per day**. A more frequent expression does not merely get throttled — it makes the
**deployment fail** with `Hobby accounts are limited to daily cron jobs. This cron expression
would run more than once per day.` Hobby also carries ±59 min scheduling jitter.

The trade-off is real: this cron is what recovers *stuck indexing*, so on Hobby a file whose
indexing failed transiently can stay unsearchable for up to ~24 h. Two ways to get the tight
loop back:

- **Upgrade to Pro** (once-per-minute intervals, per-minute precision) and restore:
  ```json
  { "path": "/api/cron/zeroentropy-retry", "schedule": "*/5 * * * *" }
  ```
- **Stay on Hobby** and drive the endpoint from an external scheduler (Upstash QStash fits —
  Upstash is already in the stack) sending `Authorization: Bearer <CRON_SECRET>` every 5 min.
  Avoid GitHub Actions for this: on a private repo each run bills a full minute, so a 5-minute
  cadence burns ~288 min/day and exhausts the free tier in about a week.

After deploy, in **Vercel → Project → Cron Jobs**, confirm the job is listed and the next run time is shown. If it's missing, the deployment didn't pick up `vercel.json` — typically because the file wasn't in the deployed commit.

Manually trigger once to smoke-test:

```bash
curl -i -H "Authorization: Bearer <CRON_SECRET>" \
  https://<app-host>/api/cron/zeroentropy-retry
```

Expected: `200` with body `{"attempted":0,"succeeded":0}` (queue starts empty).

---

## 7. End-to-end smoke test (post-deploy)

Once the steps above are done, validate the full pipeline:

1. **Upload** — open `/dashboard/files`, drag a PDF (≤10 MB). It should appear in the list with `indexStatus: indexed` within ~5 s.
2. **Inspect ZE** — Dashboard → Collections. A collection named `{orgSlug}-{8-char-orgId}` should exist, with the document at path `entities/{orgId}/file/{fileId}/content`.
3. **Search via chat** — in the dashboard chat, ask "what does my [PDF topic] file say about …". The agent should call `searchUserFiles`, return a snippet, and cite the file name.
4. **Delete** — delete the file from the UI. Confirm:
   - `file` row gone (`SELECT * FROM file WHERE id = '…'`).
   - Storage object gone (Supabase dashboard → Storage).
   - ZE document gone (ZE Dashboard → Collections → look up by path).
5. **Failure recovery** — temporarily set `ZEROENTROPY_API_KEY` to a bad value, upload a file (will fail indexing, row inserted into `failed_sync_operation`). Restore the key, then **trigger the retry endpoint manually** rather than waiting for the schedule (it runs daily on Hobby — see §6):

   ```bash
   curl -i -H "Authorization: Bearer <CRON_SECRET>" \
     https://<app-host>/api/cron/zeroentropy-retry
   ```

   The row should clear and the file's `indexStatus` should flip to `indexed`.

If any of those fail, check logs:

```bash
vercel logs --follow
```

Filter for `ZeroEntropy:` and `Cron retry`.

---

## Rollback

To remove the feature cleanly:

1. Drop the cron from `vercel.json`.
2. Remove the `/dashboard/files` page if one exists (the app has no sidebar, so there is no navigation link to disable).
3. Remove the `searchUserFiles` tool from the chat agent in [`mastra/instance.ts`](../src/infra/external-apis/mastra/instance.ts) (the agent will stop calling it; ZE collections remain intact).
4. Optionally drop the four tables and the ZE collections — but keeping them around costs nothing and preserves indexed history for a future re-enable.
