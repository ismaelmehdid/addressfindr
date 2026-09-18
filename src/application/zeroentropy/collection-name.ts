import { createHash } from 'node:crypto';

const SLUG_MAX_LENGTH = 30;

function slugify(input: string, maxLength: number): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
}

export function generateCollectionName(args: {
  organizationId: string;
  organizationName: string | null;
}): string {
  const orgIdShort = args.organizationId.slice(0, 8);
  if (args.organizationName) {
    const slug = slugify(args.organizationName, SLUG_MAX_LENGTH);
    if (slug.length > 0) return `${slug}-${orgIdShort}`;
  }
  const hash = createHash('sha256')
    .update(`${args.organizationId}-entities`)
    .digest('hex')
    .slice(0, 8);
  return `app-entities-${orgIdShort}-${hash}`;
}
