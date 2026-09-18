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
  userId: string;
  userName: string | null;
}): string {
  const userIdShort = args.userId.slice(0, 8);
  if (args.userName) {
    const slug = slugify(args.userName, SLUG_MAX_LENGTH);
    if (slug.length > 0) return `${slug}-${userIdShort}`;
  }
  const hash = createHash('sha256')
    .update(`${args.userId}-entities`)
    .digest('hex')
    .slice(0, 8);
  return `app-entities-${userIdShort}-${hash}`;
}
