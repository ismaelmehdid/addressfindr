const NEXT_DATA_PATTERN =
  /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i;
const NUXT_PATTERN =
  /window\.__NUXT__\s*=\s*(\{[\s\S]*?\})\s*(?:;|<\/script>)/i;

function safeParse(raw: string): unknown | null {
  try {
    return JSON.parse(raw.trim());
  } catch {
    return null;
  }
}

export function extractHydrationPayload(html: string): unknown | null {
  const next = NEXT_DATA_PATTERN.exec(html);
  if (next?.[1]) {
    const parsed = safeParse(next[1]);
    if (parsed !== null) return parsed;
  }
  const nuxt = NUXT_PATTERN.exec(html);
  if (nuxt?.[1]) {
    const parsed = safeParse(nuxt[1]);
    if (parsed !== null) return parsed;
  }
  return null;
}
