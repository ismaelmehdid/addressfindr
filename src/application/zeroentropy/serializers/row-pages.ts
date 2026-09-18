import 'server-only';

export type RowPair = {
  key: string;
  value: string;
};

export type SerializableRow = {
  rowLabel: number;
  pairs: ReadonlyArray<RowPair>;
};

export type SheetPagesInput = {
  sheetName: string;
  headers: ReadonlyArray<string>;
  rows: ReadonlyArray<SerializableRow>;
  totalRows: number;
  truncated?: boolean;
  sourceLabel?: string;
};

const OVERVIEW_SAMPLE_ROWS = 5;

function flatten(value: string): string {
  return value.replace(/\r?\n/g, ' ').trim();
}

function escapeCell(value: string): string {
  return flatten(value).replace(/\|/g, '\\|');
}

function sampleMarkdownTable(
  headers: ReadonlyArray<string>,
  rows: ReadonlyArray<SerializableRow>,
): string | null {
  const cols = headers.map(flatten).filter((h) => h.length > 0);
  if (cols.length === 0) return null;
  const sample = rows.slice(0, OVERVIEW_SAMPLE_ROWS);
  if (sample.length === 0) return null;

  const headerLine = `| ${cols.join(' | ')} |`;
  const dividerLine = `| ${cols.map(() => '---').join(' | ')} |`;
  const bodyLines = sample.map((row) => {
    const byHeader = new Map(
      row.pairs.map((p) => [flatten(p.key), escapeCell(p.value)]),
    );
    const cells = cols.map((c) => byHeader.get(c) ?? '');
    return `| ${cells.join(' | ')} |`;
  });
  return [headerLine, dividerLine, ...bodyLines].join('\n');
}

function locator(sourceLabel: string | undefined, sheetName: string): string {
  const sheet = `Sheet: ${flatten(sheetName)}`;
  const source = sourceLabel ? flatten(sourceLabel) : '';
  return source.length > 0 ? `${source} | ${sheet}` : sheet;
}

function overviewPage(args: {
  sourceLabel?: string;
  sheetName: string;
  headers: ReadonlyArray<string>;
  rows: ReadonlyArray<SerializableRow>;
  totalRows: number;
  truncated: boolean;
}): string {
  const columns = args.headers
    .map(flatten)
    .filter((h) => h.length > 0)
    .join(', ');
  const lines = [locator(args.sourceLabel, args.sheetName)];
  if (columns.length > 0) lines.push(`Columns: ${columns}`);
  lines.push(
    `Total rows: ${args.totalRows}${
      args.truncated ? ' (truncated for indexing)' : ''
    }`,
  );
  const preview = sampleMarkdownTable(args.headers, args.rows);
  if (preview) {
    lines.push(`Sample rows:\n${preview}`);
  }
  return lines.join('\n');
}

function rowPage(args: {
  sourceLabel?: string;
  sheetName: string;
  row: SerializableRow;
}): string {
  const lines = [
    `${locator(args.sourceLabel, args.sheetName)} | Row ${args.row.rowLabel}`,
  ];
  for (const pair of args.row.pairs) {
    const key = flatten(pair.key);
    const value = flatten(pair.value);
    if (value.length === 0) continue;
    lines.push(`${key}: ${value}`);
  }
  return lines.join('\n');
}

export function buildSheetPages(input: SheetPagesInput): string[] {
  if (input.rows.length === 0) return [];
  const pages: string[] = [
    overviewPage({
      sourceLabel: input.sourceLabel,
      sheetName: input.sheetName,
      headers: input.headers,
      rows: input.rows,
      totalRows: input.totalRows,
      truncated: input.truncated ?? false,
    }),
  ];
  for (const row of input.rows) {
    const page = rowPage({
      sourceLabel: input.sourceLabel,
      sheetName: input.sheetName,
      row,
    });
    const hasValues = page.includes('\n');
    if (hasValues) pages.push(page);
  }
  return pages;
}
