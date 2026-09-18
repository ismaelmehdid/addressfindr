# Observability

The app emits OpenTelemetry traces, metrics, and logs via the OTLP/HTTP exporter when `OTEL_EXPORTER_OTLP_ENDPOINT` is set. Bootstrap lives in `src/instrumentation.ts` (auto-loaded by Next.js).

## What gets traced

Automatic (via `@opentelemetry/auto-instrumentations-node`):
- HTTP requests to OpenAI, ZeroEntropy, Supabase, Brave Search, Resend
- PostgreSQL queries (Drizzle through `postgres-js`)
- Vercel runtime spans

Custom (via `withSpan` helper):
- `chat.turn` — outer span around every `POST /api/chat` request. Attrs: `chat.user_id`, `chat.thread_id`, `chat.agent_id`, `chat.routing.source`, `chat.routing.confidence`, `chat.routing.target`, `chat.message.word_count`, `chat.message.has_attachments`.
- `chat.retrieval` — wraps every ZE-backed search use-case (files / file-text). Attrs: `retrieval.engine`, `retrieval.scope`, `retrieval.query_length`, `retrieval.k_requested`, `retrieval.results_raw`, `retrieval.results_after_postprocess`, `retrieval.top_score`, `retrieval.bottom_score`.
- `chat.indexing.entity` — wraps `indexEntity` (file sync to ZE). Attrs: `entity.type`, `entity.id`, `indexing.skipped`, `indexing.skip_reason`, `indexing.doc_count`.

Via Vercel AI SDK `experimental_telemetry`:
- Router `generateObject` call → `gen_ai.*` semconv attrs + `chat.router.has_attachments`, `chat.router.user_text_length`, `functionId='chat.router.classify'`.
- Image VLM `generateText` call → `vision.image_mime_type`, `vision.image_base64_length`, `functionId='vision.describe'`.

## PII protection

Custom span attributes never include user message text, file content, snippet content, file names, or search queries verbatim. Only counts, sizes, IDs (UUIDs), model names, durations, and error codes.

The ai-sdk `experimental_telemetry` calls explicitly set `recordInputs: false, recordOutputs: false` to keep prompt/completion text out of span events.

## Local dev backends

Pick one; both are free, OSS, single-container.

### Phoenix (Arize) — simplest

```sh
docker run -p 6006:6006 arizephoenix/phoenix
```

In `.env`:

```
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:6006
```

UI at <http://localhost:6006>.

### Langfuse self-hosted — richer UI for GenAI workflows

```sh
git clone https://github.com/langfuse/langfuse.git
cd langfuse && docker compose up
```

Default OTLP endpoint after setup: `http://localhost:3000/api/public/otel`. Get API headers from Langfuse UI and put into `OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic%20<base64>`.

## Production sampling

Default OTLP exporter sends 100% of traces. For production, set:

```
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=0.1
```

= 10% sampling. Errors still go through if your backend supports tail-based on error attribute.

## Adding spans in new code

```ts
import { withSpan, addCurrentSpanAttributes } from '@/shared/telemetry/with-span';

const result = await withSpan({
  name: 'my.operation',
  attributes: { 'my.entity_id': id },
  fn: async () => {
    // ... do work
    addCurrentSpanAttributes({ 'my.result_count': items.length });
    return items;
  },
});
```

For direct ai-sdk LLM calls, pass `experimental_telemetry`:

```ts
const result = await generateText({
  model: openai(env().CHEAP_MODEL),
  // ...
  experimental_telemetry: {
    isEnabled: true,
    recordInputs: false,
    recordOutputs: false,
    functionId: 'my.feature.summarize',
    metadata: { 'my.input_size': size },
  },
});
```

Never put user content into `metadata` — only size/count/id attrs.
