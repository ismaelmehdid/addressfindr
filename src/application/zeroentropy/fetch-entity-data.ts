import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import Papa from 'papaparse';
import { downloadFileBuffer } from '@/application/files/download-file-buffer';
import { getFileEntityForUser } from '@/application/files/get-file-entity';
import { type AppError, validation } from '@/core/errors';
import {
  CSV_MAX_ROWS,
  FileType,
  type ParsedFile,
  type ParsedFileContent,
} from '@/core/file/types';
import type { IEntitySerializer } from '@/core/zeroentropy/ports/entity-serializer.port';
import { IndexableEntityType } from '@/core/zeroentropy/types';
import { docxToMarkdown } from '@/infra/external-apis/mammoth/mammoth-markdown';
import { parseXlsxBuffer } from '@/infra/external-apis/xlsx/xlsx-parser';
import { log } from '@/shared/logger';
import { getFileSerializer } from './serializers/registry';

export type FetchedEntity = {
  kind: typeof IndexableEntityType.FILE;
  entity: ParsedFile;
  serializer: IEntitySerializer<ParsedFile>;
};

async function parseFileBuffer(args: {
  fileType: FileType;
  fileId: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<Result<ParsedFileContent, AppError>> {
  switch (args.fileType) {
    case FileType.PDF:
      return ok({ kind: 'binary', base64: args.buffer.toString('base64') });
    case FileType.PNG:
    case FileType.JPEG:
    case FileType.WEBP:
      return ok({ kind: 'image', base64: args.buffer.toString('base64') });
    case FileType.XLSX: {
      const result = parseXlsxBuffer({
        fileId: args.fileId,
        buffer: args.buffer,
      });
      if (result.isErr()) return err(result.error);
      return ok(result.value);
    }
    case FileType.TXT:
      return ok({ kind: 'text', text: args.buffer.toString('utf-8') });
    case FileType.JSON: {
      const raw = args.buffer.toString('utf-8');
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return err(validation('File is not valid JSON', 'content'));
      }
      return ok({ kind: 'text', text: JSON.stringify(parsed, null, 2) });
    }
    case FileType.DOCX: {
      const md = await docxToMarkdown(args.buffer);
      if (md.isErr()) {
        return err(
          validation(
            `Failed to extract DOCX markdown: ${md.error.message}`,
            'content',
          ),
        );
      }
      return ok({ kind: 'text', text: md.value });
    }
    case FileType.CSV: {
      const parsed = Papa.parse<Record<string, string>>(
        args.buffer.toString('utf-8'),
        { header: true, skipEmptyLines: true },
      );
      if (parsed.errors.length > 0) {
        const first = parsed.errors[0];
        return err(
          validation(
            `CSV parse error: ${first?.message ?? 'unknown'}`,
            'content',
          ),
        );
      }
      const totalRows = parsed.data.length;
      const rows = parsed.data.slice(0, CSV_MAX_ROWS);
      if (totalRows > CSV_MAX_ROWS) {
        log.warn('CSV row count exceeds cap, truncating', {
          fileId: args.fileId,
          totalRows,
          indexedRows: rows.length,
        });
      }
      return ok({ kind: 'csv-rows', rows, totalRows });
    }
  }
}

export async function fetchEntityData(args: {
  entityType: string;
  entityId: string;
  userId: string;
}): Promise<Result<FetchedEntity, AppError>> {
  if (args.entityType === IndexableEntityType.FILE) {
    const fileResult = await getFileEntityForUser({
      fileId: args.entityId,
      userId: args.userId,
    });
    if (fileResult.isErr()) return err(fileResult.error);
    const file = fileResult.value;

    const buffer = await downloadFileBuffer(file);
    if (buffer.isErr()) return err(buffer.error);

    const parsed = await parseFileBuffer({
      fileType: file.fileType,
      fileId: file.id,
      mimeType: file.mimeType,
      buffer: buffer.value,
    });
    if (parsed.isErr()) return err(parsed.error);

    return ok({
      kind: IndexableEntityType.FILE,
      entity: { ...file, parsed: parsed.value },
      serializer: getFileSerializer(file.fileType),
    });
  }
  return err(
    validation(`Unsupported entity type: ${args.entityType}`, 'entityType'),
  );
}
