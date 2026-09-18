import 'server-only';

import mammoth from 'mammoth';
import { err, ok, type Result } from 'neverthrow';
import { type AppError, externalApi } from '@/core/errors';
import { log } from '@/shared/logger';

type MammothMessage = {
  readonly type: string;
  readonly message: string;
};

type MammothMarkdownResult = {
  readonly value: string;
  readonly messages: ReadonlyArray<MammothMessage>;
};

type MammothWithMarkdown = {
  convertToMarkdown(input: { buffer: Buffer }): Promise<MammothMarkdownResult>;
};

const mammothApi = mammoth as unknown as MammothWithMarkdown;

export async function docxToMarkdown(
  buffer: Buffer,
): Promise<Result<string, AppError>> {
  try {
    const result = await mammothApi.convertToMarkdown({ buffer });
    if (result.messages.length > 0) {
      const warnings = result.messages
        .filter((m) => m.type === 'warning' || m.type === 'error')
        .slice(0, 5)
        .map((m) => m.message);
      if (warnings.length > 0) {
        log.warn('docx.convert.warnings', {
          warningCount: warnings.length,
          sample: warnings,
        });
      }
    }
    return ok(result.value);
  } catch (e) {
    log.error('docx.convert.failed', e);
    return err(
      externalApi(
        'mammoth',
        `Failed to convert DOCX to markdown: ${e instanceof Error ? e.message : 'unknown'}`,
      ),
    );
  }
}
