import { describe, expect, it } from 'vitest';
import { chunkMarkdownByHeadings } from './markdown-chunk';

describe('chunkMarkdownByHeadings', () => {
  it('returns empty for blank input', () => {
    expect(
      chunkMarkdownByHeadings({ markdown: '   ', sourceLabel: 'f' }),
    ).toEqual([]);
  });

  it('splits by headings and prefixes each chunk with the document label', () => {
    const md = [
      '# Intro',
      'Hello world.',
      '## Details',
      'Some detail text.',
    ].join('\n');
    const pages = chunkMarkdownByHeadings({
      markdown: md,
      sourceLabel: 'Guide.docx',
    });
    expect(pages).toHaveLength(2);
    expect(pages[0]).toContain('Document: Guide.docx');
    expect(pages[0]).toContain('# Intro');
    expect(pages[0]).toContain('Hello world.');
    expect(pages[1]).toContain('Section: Intro > Details');
    expect(pages[1]).toContain('Some detail text.');
  });

  it('keeps a markdown table intact within its section chunk', () => {
    const md = [
      '## Tanks',
      '| Tank | pH |',
      '| --- | --- |',
      '| T7 | 3.4 |',
      '| T8 | 3.6 |',
    ].join('\n');
    const pages = chunkMarkdownByHeadings({ markdown: md, sourceLabel: 'x' });
    expect(pages).toHaveLength(1);
    expect(pages[0]).toContain('| T7 | 3.4 |');
    expect(pages[0]).toContain('| T8 | 3.6 |');
  });

  it('captures preamble before the first heading', () => {
    const md = ['Top matter.', '# Section', 'Body.'].join('\n');
    const pages = chunkMarkdownByHeadings({ markdown: md, sourceLabel: 'x' });
    expect(pages[0]).toContain('Top matter.');
    expect(pages[1]).toContain('# Section');
  });

  it('falls back to a single labeled chunk when there are no headings', () => {
    const pages = chunkMarkdownByHeadings({
      markdown: 'Just a flat paragraph with no headings.',
      sourceLabel: 'flat.docx',
    });
    expect(pages).toHaveLength(1);
    expect(pages[0]).toContain('Document: flat.docx');
    expect(pages[0]).toContain('flat paragraph');
  });

  it('builds nested heading trails correctly', () => {
    const md = ['# A', 'a body', '## B', 'b body', '# C', 'c body'].join('\n');
    const pages = chunkMarkdownByHeadings({ markdown: md, sourceLabel: 'x' });
    expect(pages[1]).toContain('Section: A > B');
    expect(pages[2]).toContain('Section: C');
  });
});
