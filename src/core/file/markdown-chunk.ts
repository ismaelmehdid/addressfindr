const HEADING = /^(#{1,3})\s+(.+?)\s*$/;
const MAX_CHUNK_CHARS = 4000;

type Section = {
  headingTrail: string[];
  lines: string[];
};

function splitIntoSections(markdown: string): Section[] {
  const lines = markdown.split(/\r?\n/);
  const sections: Section[] = [];
  let current: Section = { headingTrail: [], lines: [] };
  const trail: Array<{ level: number; text: string }> = [];

  for (const line of lines) {
    const match = HEADING.exec(line);
    if (!match) {
      current.lines.push(line);
      continue;
    }
    if (current.lines.some((l) => l.trim().length > 0)) {
      sections.push(current);
    }
    const level = match[1]?.length ?? 1;
    const text = match[2] ?? '';
    while (trail.length > 0 && (trail[trail.length - 1]?.level ?? 0) >= level) {
      trail.pop();
    }
    trail.push({ level, text });
    current = {
      headingTrail: trail.map((t) => t.text),
      lines: [line],
    };
  }
  if (current.lines.some((l) => l.trim().length > 0)) {
    sections.push(current);
  }
  return sections;
}

function hardWrap(text: string): string[] {
  if (text.length <= MAX_CHUNK_CHARS) return [text];
  const out: string[] = [];
  const paragraphs = text.split(/\n{2,}/);
  let buffer = '';
  for (const para of paragraphs) {
    if (
      buffer.length + para.length + 2 > MAX_CHUNK_CHARS &&
      buffer.length > 0
    ) {
      out.push(buffer.trim());
      buffer = '';
    }
    buffer += (buffer.length > 0 ? '\n\n' : '') + para;
  }
  if (buffer.trim().length > 0) out.push(buffer.trim());
  return out;
}

export function chunkMarkdownByHeadings(args: {
  markdown: string;
  sourceLabel: string;
}): string[] {
  const trimmed = args.markdown.trim();
  if (trimmed.length === 0) return [];
  const sections = splitIntoSections(trimmed);
  const prefix = `Document: ${args.sourceLabel}`;
  const pages: string[] = [];
  for (const section of sections) {
    const body = section.lines.join('\n').trim();
    if (body.length === 0) continue;
    const trail =
      section.headingTrail.length > 0
        ? `Section: ${section.headingTrail.join(' > ')}`
        : null;
    for (const part of hardWrap(body)) {
      pages.push([prefix, trail, part].filter(Boolean).join('\n'));
    }
  }
  if (pages.length === 0) return [`${prefix}\n${trimmed}`];
  return pages;
}
