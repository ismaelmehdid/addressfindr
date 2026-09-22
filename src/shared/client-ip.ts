// why: Vercel overwrites x-forwarded-for at the edge, so its first entry is the
// real client. Off Vercel the header is caller-controlled and must not be trusted.
export function clientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get('x-real-ip')?.trim();
  return real && real.length > 0 ? real : null;
}

export function rateLimitIdentifier(args: {
  req: Request;
  userId: string | null;
}): string {
  if (args.userId) return args.userId;
  // why: an unidentifiable caller shares one bucket rather than getting a free
  // lane, so a missing header cannot be used to bypass the limit.
  return `ip:${clientIp(args.req) ?? 'unknown'}`;
}
