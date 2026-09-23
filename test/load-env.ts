import { readFileSync } from 'node:fs';
import path from 'node:path';

// why: vitest ne charge pas `.env`, contrairement a Next. Le harnais de verite
// terrain tape des API reelles, donc il lui faut les clefs. Sans dependance
// ajoutee : le format `.env` utilise ici est une paire par ligne.
export function loadDotEnv(): void {
  let raw: string;
  try {
    raw = readFileSync(path.resolve(process.cwd(), '.env'), 'utf8');
  } catch {
    return;
  }

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    if (process.env[key] !== undefined) continue;
    const value = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (value.length > 0) process.env[key] = value;
  }
}
