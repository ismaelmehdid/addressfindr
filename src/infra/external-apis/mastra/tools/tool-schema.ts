import 'server-only';

import {
  type StandardJsonSchema,
  toStandardJsonSchema,
} from '@valibot/to-json-schema';
import type { BaseIssue, BaseSchema, InferInput, InferOutput } from 'valibot';
import type { AppError } from '@/core/errors';
import { log } from '@/shared/logger';

export function toolInput<
  TSchema extends BaseSchema<unknown, unknown, BaseIssue<unknown>>,
>(
  schema: TSchema,
): StandardJsonSchema<InferInput<TSchema>, InferOutput<TSchema>> {
  return toStandardJsonSchema(schema);
}

export type ToolErrorResult = {
  ok: false;
  error: { code: string; message: string };
};

export function toolError(toolId: string, error: AppError): ToolErrorResult {
  log.warn(`${toolId} tool failed`, {
    code: error.code,
    message: error.message,
  });
  return { ok: false, error: { code: error.code, message: error.message } };
}
