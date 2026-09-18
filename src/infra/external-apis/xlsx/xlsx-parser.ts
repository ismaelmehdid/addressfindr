import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import * as XLSX from 'xlsx';
import { type AppError, externalApi } from '@/core/errors';
import {
  type ParsedFileSpreadsheet,
  type ParsedFileSpreadsheetSheet,
  XLSX_MAX_ROWS_PER_SHEET,
  XLSX_MAX_SHEETS,
} from '@/core/file/types';
import { log } from '@/shared/logger';

type CellValue = string | number | boolean | Date | null | undefined;
type RawWorkbookRow = ReadonlyArray<CellValue>;

function cellToString(value: CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number')
    return Number.isFinite(value) ? value.toString() : '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) return value.toISOString();
  return '';
}

function sheetToParsed(args: {
  workbook: XLSX.WorkBook;
  sheetName: string;
  fileId: string;
}): ParsedFileSpreadsheetSheet | null {
  const sheet = args.workbook.Sheets[args.sheetName];
  if (!sheet) return null;

  const rawRows = XLSX.utils.sheet_to_json<RawWorkbookRow>(sheet, {
    header: 1,
    blankrows: false,
    defval: '',
  });
  if (rawRows.length === 0) {
    return {
      name: args.sheetName,
      headers: [],
      rows: [],
      totalRows: 0,
      truncated: false,
    };
  }

  const headerRow = rawRows[0] ?? [];
  const headers = headerRow.map(cellToString);
  const dataRows = rawRows.slice(1);
  const truncated = dataRows.length > XLSX_MAX_ROWS_PER_SHEET;
  const limited = truncated
    ? dataRows.slice(0, XLSX_MAX_ROWS_PER_SHEET)
    : dataRows;
  const rows = limited.map((row) => row.map(cellToString));

  if (truncated) {
    log.warn('xlsx.parse.truncated', {
      fileId: args.fileId,
      sheetName: args.sheetName,
      totalRows: dataRows.length,
      indexedRows: limited.length,
    });
  }

  return {
    name: args.sheetName,
    headers,
    rows,
    totalRows: dataRows.length,
    truncated,
  };
}

export function parseXlsxBuffer(args: {
  fileId: string;
  buffer: Buffer;
}): Result<ParsedFileSpreadsheet, AppError> {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(args.buffer, { type: 'buffer', cellDates: true });
  } catch (e) {
    log.error('xlsx.parse.failed', e, { fileId: args.fileId });
    return err(
      externalApi(
        'xlsx',
        `Failed to read XLSX: ${e instanceof Error ? e.message : 'unknown'}`,
      ),
    );
  }

  const sheetNames = workbook.SheetNames.slice(0, XLSX_MAX_SHEETS);
  if (workbook.SheetNames.length > XLSX_MAX_SHEETS) {
    log.warn('xlsx.parse.sheets_truncated', {
      fileId: args.fileId,
      totalSheets: workbook.SheetNames.length,
      indexedSheets: sheetNames.length,
    });
  }

  const sheets: ParsedFileSpreadsheetSheet[] = [];
  for (const name of sheetNames) {
    const parsed = sheetToParsed({
      workbook,
      sheetName: name,
      fileId: args.fileId,
    });
    if (parsed) sheets.push(parsed);
  }

  return ok({ kind: 'spreadsheet-sheets', sheets });
}
