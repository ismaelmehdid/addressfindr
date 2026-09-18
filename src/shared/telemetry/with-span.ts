import 'server-only';

import type { AttributeValue } from '@opentelemetry/api';
import { SpanStatusCode, trace } from '@opentelemetry/api';

const TRACER_NAME = 'startup-boilerplate';

export type SpanAttributes = Record<string, AttributeValue>;

export async function withSpan<T>(args: {
  name: string;
  attributes?: SpanAttributes;
  fn: () => Promise<T>;
}): Promise<T> {
  const tracer = trace.getTracer(TRACER_NAME);
  return tracer.startActiveSpan(args.name, async (span) => {
    if (args.attributes) span.setAttributes(args.attributes);
    try {
      const result = await args.fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'unknown';
      span.setStatus({ code: SpanStatusCode.ERROR, message });
      span.recordException(e instanceof Error ? e : new Error(message));
      throw e;
    } finally {
      span.end();
    }
  });
}

export function addCurrentSpanAttributes(attributes: SpanAttributes): void {
  const span = trace.getActiveSpan();
  if (span) span.setAttributes(attributes);
}

export function addCurrentSpanEvent(
  name: string,
  attributes?: SpanAttributes,
): void {
  const span = trace.getActiveSpan();
  if (span) span.addEvent(name, attributes);
}
