import { context, trace } from '@opentelemetry/api';
import type { Logger } from 'drizzle-orm';
import pino, { type LoggerOptions } from 'pino';
import { env } from './env';

const e = env();
const isTesting = e.NODE_ENV === 'test';
const isProduction = e.VERCEL_ENV === 'production';
const isPreview = e.VERCEL_ENV === 'preview';

function getTraceContext(): Record<string, string> {
  const span = trace.getSpan(context.active());
  if (!span) return {};
  const spanContext = span.spanContext();
  return {
    'otel.trace_id': spanContext.traceId,
    'otel.span_id': spanContext.spanId,
    trace_id: spanContext.traceId,
    span_id: spanContext.spanId,
    trace_flags: spanContext.traceFlags.toString(),
  };
}

const baseOptions: LoggerOptions = {
  name: 'app-api',
  level: isTesting ? 'silent' : e.LOG_LEVEL,
  redact: {
    paths: [
      'email',
      '*.email',
      'password',
      '*.password',
      'token',
      '*.token',
      '*.access_token',
      '*.refresh_token',
      'firstName',
      '*.firstName',
      'lastName',
      '*.lastName',
    ],
    censor: '[REDACTED]',
  },
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  mixin() {
    return getTraceContext();
  },
};

const logger = pino({
  ...baseOptions,
  transport:
    !isProduction && !isPreview
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss',
            ignore: 'pid,hostname',
            singleLine: false,
          },
        }
      : undefined,
});

const STANDARD_ERROR_PROPS = new Set(['name', 'message', 'stack', 'cause']);
const MAX_CAUSE_DEPTH = 5;

function serializeError(error: Error, depth = 0): Record<string, unknown> {
  const out: Record<string, unknown> = {
    message: error.message,
    stack: error.stack,
    name: error.name,
  };

  for (const key in error) {
    if (!Object.hasOwn(error, key) || STANDARD_ERROR_PROPS.has(key)) continue;
    const value = (error as unknown as Record<string, unknown>)[key];
    if (value instanceof Error) {
      out[key] = serializeError(value, depth + 1);
    } else {
      out[key] = value;
    }
  }

  if (error.cause !== undefined && depth < MAX_CAUSE_DEPTH) {
    out.cause =
      error.cause instanceof Error
        ? serializeError(error.cause, depth + 1)
        : error.cause;
  }

  return out;
}

class GenericLogger {
  debug(message: string, ctx?: Record<string, unknown>): void {
    logger.debug(ctx ?? {}, message);
  }

  info(message: string, ctx?: Record<string, unknown>): void {
    logger.info(ctx ?? {}, message);
  }

  warn(message: string, ctx?: Record<string, unknown>): void {
    logger.warn(ctx ?? {}, message);
  }

  error(message: string, error: unknown, ctx?: Record<string, unknown>): void {
    let errorObj: Record<string, unknown>;

    if (error instanceof Error) {
      errorObj = serializeError(error);
    } else if (
      typeof error === 'object' &&
      error !== null &&
      'error' in error &&
      (error as Record<string, unknown>).error instanceof Error
    ) {
      const { error: nested, ...rest } = error as Record<string, unknown>;
      errorObj = {
        ...serializeError(nested as Error),
        ...rest,
      };
    } else {
      errorObj = {
        rawError:
          typeof error === 'object' ? JSON.stringify(error) : String(error),
      };
    }

    logger.error({ ...ctx, ...errorObj }, message);
  }
}

export class DbLogger implements Logger {
  // why: bound parameters carry user input (feedback comments, session
  // tokens), so only their count reaches the logs.
  logQuery(query: string, params: unknown[]): void {
    if (isProduction) {
      logger.debug({ query, paramCount: params.length }, 'Database query');
    }
  }
}

export const log = new GenericLogger();
