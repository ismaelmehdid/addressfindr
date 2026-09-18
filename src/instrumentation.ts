import { DiagConsoleLogger, DiagLogLevel, diag } from '@opentelemetry/api';

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
