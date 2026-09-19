import type { FilePath, MimeType } from '@/core/storage/types/file';

export const FileType = {
  PDF: 'pdf',
  DOCX: 'docx',
  XLSX: 'xlsx',
  PNG: 'png',
  JPEG: 'jpeg',
  WEBP: 'webp',
  TXT: 'txt',
  CSV: 'csv',
  JSON: 'json',
} as const;
export type FileType = (typeof FileType)[keyof typeof FileType];

export const FILE_TYPES = [
  FileType.PDF,
  FileType.DOCX,
  FileType.XLSX,
  FileType.PNG,
  FileType.JPEG,
  FileType.WEBP,
  FileType.TXT,
  FileType.CSV,
  FileType.JSON,
] as const;

export const FileStatus = {
  UPLOADING: 'uploading',
  UPLOADED: 'uploaded',
} as const;
export type FileStatus = (typeof FileStatus)[keyof typeof FileStatus];

export const FILE_STATUSES = [
  FileStatus.UPLOADING,
  FileStatus.UPLOADED,
] as const;

export const FileIndexStatus = {
  PENDING: 'pending',
  INDEXING: 'indexing',
  INDEXED: 'indexed',
  ERROR: 'error',
} as const;
export type FileIndexStatus =
  (typeof FileIndexStatus)[keyof typeof FileIndexStatus];

export const FILE_INDEX_STATUSES = [
  FileIndexStatus.PENDING,
  FileIndexStatus.INDEXING,
  FileIndexStatus.INDEXED,
  FileIndexStatus.ERROR,
] as const;

export type FileEntity = {
  id: string;
  userId: string;
  originalName: string;
  storageKey: FilePath;
  mimeType: MimeType;
  fileType: FileType;
  sizeBytes: number;
  status: FileStatus;
  indexStatus: FileIndexStatus;
  visionDescription: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export const CSV_MAX_ROWS = 5000;
export const XLSX_MAX_ROWS_PER_SHEET = 5000;
export const XLSX_MAX_SHEETS = 20;

export type ParsedFileBinary = { kind: 'binary'; base64: string };
export type ParsedFileText = { kind: 'text'; text: string };
export type ParsedFileCsvRows = {
  kind: 'csv-rows';
  rows: ReadonlyArray<Record<string, string>>;
  totalRows: number;
};
export type ParsedFileImage = {
  kind: 'image';
  base64: string;
};
export type ParsedFileSpreadsheet = {
  kind: 'spreadsheet-sheets';
  sheets: ReadonlyArray<ParsedFileSpreadsheetSheet>;
};
export type ParsedFileSpreadsheetSheet = {
  readonly name: string;
  readonly headers: ReadonlyArray<string>;
  readonly rows: ReadonlyArray<ReadonlyArray<string>>;
  readonly totalRows: number;
  readonly truncated: boolean;
};

export type ParsedFileContent =
  | ParsedFileBinary
  | ParsedFileText
  | ParsedFileCsvRows
  | ParsedFileImage
  | ParsedFileSpreadsheet;

export type ParsedFile = FileEntity & {
  parsed: ParsedFileContent;
};
