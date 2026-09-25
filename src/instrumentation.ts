import { DiagConsoleLogger, DiagLogLevel, diag } from '@opentelemetry/api';
import type { Configuration } from '@vercel/otel';
import { redactUrlSecrets } from '@/shared/telemetry/redact-url-secrets';

type SpanProcessor = Exclude<
  NonNullable<Configuration['spanProcessors']>[number],
  'auto'
>;
type StartedSpan = Parameters<SpanProcessor['onStart']>[0];
type EndedSpan = Parameters<SpanProcessor['onEnd']>[0];

function redactedAttributes(
  span: StartedSpan | EndedSpan,
): Array<[string, string]> {
  return Object.entries(span.attributes).flatMap(([key, value]) => {
    if (typeof value !== 'string') return [];
    const redacted = redactUrlSecrets(value);
    return redacted === value ? [] : [[key, redacted]];
  });
}

// why: placed first among the processors, it cleans the span before the
// export processor queues it. onEnd covers attributes set after start,
// which the API no longer lets us change.
const redactUrlSecretsProcessor: SpanProcessor = {
  onStart(span) {
    const name = redactUrlSecrets(span.name);
    if (name !== span.name) span.updateName(name);
    for (const [key, value] of redactedAttributes(span)) {
      span.setAttribute(key, value);
    }
  },
  onEnd(span) {
    for (const [key, value] of redactedAttributes(span)) {
      span.attributes[key] = value;
    }
  },
  forceFlush: async () => {},
  shutdown: async () => {},
};

const isDebugEnabled = process.env.OTEL_LOG_LEVEL === 'debug';

if (isDebugEnabled) {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
}

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return;

  try {
    const { registerOTel } = await import('@vercel/otel');
    const { getNodeAutoInstrumentations } = await import(
      '@opentelemetry/auto-instrumentations-node'
    );
    const { OTLPTraceExporter } = await import(
      '@opentelemetry/exporter-trace-otlp-http'
    );
    const { OTLPMetricExporter } = await import(
      '@opentelemetry/exporter-metrics-otlp-http'
    );
    const { OTLPLogExporter } = await import(
      '@opentelemetry/exporter-logs-otlp-http'
    );
    const { PeriodicExportingMetricReader } = await import(
      '@opentelemetry/sdk-metrics'
    );
    const { BatchLogRecordProcessor } = await import('@opentelemetry/sdk-logs');

    const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    const headers = process.env.OTEL_EXPORTER_OTLP_HEADERS;
    const parsedHeaders = headers ? parseHeaders(headers) : undefined;
    const exporterTimeoutMillis = 5000;

    const traceExporter = new OTLPTraceExporter({
      url: endpoint ? `${endpoint}/v1/traces` : undefined,
      headers: parsedHeaders,
      timeoutMillis: exporterTimeoutMillis,
    });

    const metricExporter = new OTLPMetricExporter({
      url: endpoint ? `${endpoint}/v1/metrics` : undefined,
      headers: parsedHeaders,
      timeoutMillis: exporterTimeoutMillis,
    });

    const logExporter = new OTLPLogExporter({
      url: endpoint ? `${endpoint}/v1/logs` : undefined,
      headers: parsedHeaders,
      timeoutMillis: exporterTimeoutMillis,
    });

    registerOTel({
      serviceName: process.env.OTEL_SERVICE_NAME ?? 'startup-boilerplate',
      attributes: {
        'service.version': process.env.OTEL_SERVICE_VERSION,
      },
      traceExporter,
      spanProcessors: [redactUrlSecretsProcessor, 'auto'],
      logRecordProcessors: [new BatchLogRecordProcessor(logExporter)],
      metricReaders: [
        new PeriodicExportingMetricReader({
          exporter: metricExporter,
          exportIntervalMillis: 60000,
          exportTimeoutMillis: exporterTimeoutMillis,
        }),
      ],
      instrumentations: [
        ...getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-fs': { enabled: false },
          '@opentelemetry/instrumentation-dns': { enabled: false },
          '@opentelemetry/instrumentation-net': { enabled: false },
          '@opentelemetry/instrumentation-pino': { enabled: true },
        }),
      ],
    });
  } catch (error) {
    // shared/logger may not be initialized yet during OTel bootstrap; console is the safe fallback here.
    console.error('[instrumentation] OTel init failed:', error);
  }
}

function parseHeaders(headersString: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const pair of headersString.split(',')) {
    const [key, ...valueParts] = pair.split('=');
    if (key && valueParts.length > 0) {
      headers[key.trim()] = valueParts.join('=').trim();
    }
  }
  return headers;
}
