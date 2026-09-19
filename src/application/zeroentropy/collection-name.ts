import { createHash } from 'node:crypto';

export function generateCollectionName(args: { userId: string }): string {
  const userIdShort = args.userId.slice(0, 8);
  const hash = createHash('sha256')
    .update(`${args.userId}-entities`)
    .digest('hex')
    .slice(0, 8);
  return `app-entities-${userIdShort}-${hash}`;
}
