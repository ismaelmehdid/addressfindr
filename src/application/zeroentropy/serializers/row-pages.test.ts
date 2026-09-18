import { describe, expect, it } from 'vitest';

import { buildSheetPages, type SerializableRow } from './row-pages';

function rows(): SerializableRow[] {
  return [
    {
      rowLabel: 1,
      pairs: [
        { key: 'Client', value: 'Acme' },
        { key: 'Amount', value: '200' },
      ],
    },
    {
      rowLabel: 2,
      pairs: [
        { key: 'Client', value: 'Globex' },
        { key: 'Amount', value: '50' },
      ],
    },
  ];
}

describe('buildSheetPages', () => {
  it('returns no pages for an empty sheet', () => {
    expect(
      buildSheetPages({
        sheetName: 'S',
        headers: ['Client'],
        rows: [],
        totalRows: 0,
      }),
    ).toEqual([]);
  });

  it('emits an overview page followed by one page per row', () => {
    const pages = buildSheetPages({
      sheetName: 'Invoices',
      headers: ['Client', 'Amount'],
      rows: rows(),
      totalRows: 2,
    });
    expect(pages.length).toBe(3);
    expect(pages[0]).toContain('Sheet: Invoices');
    expect(pages[0]).toContain('Columns: Client, Amount');
    expect(pages[0]).toContain('Total rows: 2');
    expect(pages[0]).toContain('Sample rows:');
    expect(pages[0]).toContain('| Client | Amount |');
    expect(pages[0]).toContain('| Acme | 200 |');
    expect(pages[1]).toBe('Sheet: Invoices | Row 1\nClient: Acme\nAmount: 200');
    expect(pages[2]).toBe(
      'Sheet: Invoices | Row 2\nClient: Globex\nAmount: 50',
    );
  });

  it('flags truncation in the overview page', () => {
    const pages = buildSheetPages({
      sheetName: 'Big',
      headers: ['Client'],
      rows: [rows()[0] as SerializableRow],
      totalRows: 9000,
      truncated: true,
    });
    expect(pages[0]).toContain('Total rows: 9000 (truncated for indexing)');
  });

  it('drops empty values but keeps the row when it has any value', () => {
    const pages = buildSheetPages({
      sheetName: 'S',
      headers: ['A', 'B'],
      rows: [
        {
          rowLabel: 1,
          pairs: [
            { key: 'A', value: '' },
            { key: 'B', value: 'x' },
          ],
        },
      ],
      totalRows: 1,
    });
    expect(pages.length).toBe(2);
    expect(pages[1]).toBe('Sheet: S | Row 1\nB: x');
  });

  it('omits a row page that has no values at all', () => {
    const pages = buildSheetPages({
      sheetName: 'S',
      headers: ['A'],
      rows: [{ rowLabel: 1, pairs: [{ key: 'A', value: '' }] }],
      totalRows: 1,
    });
    expect(pages.length).toBe(1);
    expect(pages[0]).toContain('Sheet: S');
  });

  it('flattens newlines inside values', () => {
    const pages = buildSheetPages({
      sheetName: 'S',
      headers: ['Note'],
      rows: [{ rowLabel: 1, pairs: [{ key: 'Note', value: 'line1\nline2' }] }],
      totalRows: 1,
    });
    expect(pages[1]).toBe('Sheet: S | Row 1\nNote: line1 line2');
  });

  it('prefixes overview and rows with the source label when provided', () => {
    const pages = buildSheetPages({
      sourceLabel: 'Cuverie.xlsx',
      sheetName: 'Invoices',
      headers: ['Client', 'Amount'],
      rows: rows(),
      totalRows: 2,
    });
    expect(pages[0]).toContain('Cuverie.xlsx | Sheet: Invoices');
    expect(pages[0]).toContain('Columns: Client, Amount');
    expect(pages[1]).toBe(
      'Cuverie.xlsx | Sheet: Invoices | Row 1\nClient: Acme\nAmount: 200',
    );
  });

  it('includes a markdown sample table (capped at 5 rows) in the overview', () => {
    const many: SerializableRow[] = Array.from({ length: 8 }, (_, i) => ({
      rowLabel: i + 1,
      pairs: [
        { key: 'Client', value: `C${i}` },
        { key: 'Amount', value: String(i) },
      ],
    }));
    const pages = buildSheetPages({
      sheetName: 'S',
      headers: ['Client', 'Amount'],
      rows: many,
      totalRows: 8,
    });
    const overview = pages[0] ?? '';
    expect(overview).toContain('| Client | Amount |');
    expect(overview).toContain('| --- | --- |');
    expect(overview).toContain('| C0 | 0 |');
    expect(overview).toContain('| C4 | 4 |');
    expect(overview).not.toContain('| C5 | 5 |');
  });

  it('escapes pipe characters in sample cells', () => {
    const pages = buildSheetPages({
      sheetName: 'S',
      headers: ['Note'],
      rows: [{ rowLabel: 1, pairs: [{ key: 'Note', value: 'a|b' }] }],
      totalRows: 1,
    });
    expect(pages[0]).toContain('a\\|b');
  });
});
