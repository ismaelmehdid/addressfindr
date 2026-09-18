import { err, ok, type Result } from 'neverthrow';
import * as v from 'valibot';

export type AppError =
  | { code: 'not_found'; message: string; resource?: string }
  | { code: 'unauthorized'; message: string }
  | { code: 'forbidden'; message: string }
  | { code: 'validation'; message: string; field?: string }
  | { code: 'conflict'; message: string }
  | { code: 'rate_limited'; message: string; retryAfterSeconds?: number }
  | { code: 'external_api'; message: string; provider: string }
  | { code: 'db_error'; message: string }
  | { code: 'unknown'; message: string };

export type AppErrorCode = AppError['code'];

export function notFound(message: string, resource?: string): AppError {
  return { code: 'not_found', message, resource };
}

export function unauthorized(message = 'Unauthorized'): AppError {
  return { code: 'unauthorized', message };
}

export function forbidden(message = 'Forbidden'): AppError {
  return { code: 'forbidden', message };
}

export function validation(message: string, field?: string): AppError {
  return { code: 'validation', message, field };
}

export function rateLimited(
  message: string,
  retryAfterSeconds?: number,
): AppError {
  return { code: 'rate_limited', message, retryAfterSeconds };
}

export function conflict(message: string): AppError {
  return { code: 'conflict', message };
}

export function externalApi(provider: string, message: string): AppError {
  return { code: 'external_api', provider, message };
}

export function unknown(message: string): AppError {
  return { code: 'unknown', message };
}

export function validationFromIssues(
  issues: ReadonlyArray<v.BaseIssue<unknown>>,
  fallbackMessage: string,
): AppError {
  const first = issues[0];
  return validation(
    first?.message ?? fallbackMessage,
    String(first?.path?.[0]?.key ?? ''),
  );
}

export function parseInput<
  TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>,
>(
  schema: TSchema,
  input: unknown,
  fallbackMessage: string,
): Result<v.InferOutput<TSchema>, AppError> {
  const parsed = v.safeParse(schema, input);
  if (!parsed.success) {
    return err(validationFromIssues(parsed.issues, fallbackMessage));
  }
  return ok(parsed.output);
}
