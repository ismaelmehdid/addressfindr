import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  evaluateFilePlacement,
  evaluateImport,
  isDynamicImportAllowed,
} from './boundaries/evaluate.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const IMPORT_RE = /(?:from\s+|import\s*\(\s*|^\s*import\s+)['"]([^'"]+)['"]/gm;
const VI_MOCK_RE = /vi\.mock\(\s*['"]([^'"]+)['"]/g;
const DYNAMIC_CALL_RE = /\b(?:import|require)\s*\(\s*(.)/g;
const IMPORT_META_RESOLVE_RE = /import\.meta\.resolve\s*\(/g;

function walk(dir, out) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue;
      walk(full, out);
    } else if (
      /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry) &&
      !entry.endsWith('.d.ts')
    ) {
      out.push(full);
    }
  }
}

function lineOfIndex(source, index) {
  return source.slice(0, index).split('\n').length;
}

export function checkDomainBoundaries() {
  const violations = [];
  const files = [];
  walk(join(REPO_ROOT, 'src'), files);

  for (const absPath of files) {
    const repoPath = relative(REPO_ROOT, absPath).split(sep).join('/');
    const source = readFileSync(absPath, 'utf-8');

    const placement = evaluateFilePlacement(repoPath);
    for (const violation of placement) {
      violations.push({ file: repoPath, line: 1, ...violation });
    }
    if (placement.some((v) => v.rule === 'unassigned-file')) continue;

    if (!isDynamicImportAllowed(repoPath)) {
      for (const match of source.matchAll(DYNAMIC_CALL_RE)) {
        const firstArgChar = match[1];
        if (firstArgChar === "'" || firstArgChar === '"') continue;
        violations.push({
          file: repoPath,
          line: lineOfIndex(source, match.index ?? 0),
          rule: 'unanalyzable-import',
          message:
            'Dynamic import()/require() with a non-literal argument cannot be checked against domain boundaries. Use a static string literal, or allowlist the file in scripts/boundaries/manifest.mjs with a justification.',
        });
      }
      for (const match of source.matchAll(IMPORT_META_RESOLVE_RE)) {
        violations.push({
          file: repoPath,
          line: lineOfIndex(source, match.index ?? 0),
          rule: 'unanalyzable-import',
          message:
            'import.meta.resolve() cannot be checked against domain boundaries — use static imports.',
        });
      }
    }

    for (const re of [IMPORT_RE, VI_MOCK_RE]) {
      for (const match of source.matchAll(re)) {
        const spec = match[1];
        if (!spec) continue;
        const violation = evaluateImport(repoPath, spec);
        if (violation) {
          violations.push({
            file: repoPath,
            line: lineOfIndex(source, match.index ?? 0),
            ...violation,
          });
        }
      }
    }
  }

  return violations;
}

function main() {
  const violations = checkDomainBoundaries();
  if (violations.length === 0) {
    console.error('Domain boundaries OK.');
    return;
  }
  console.error(`Found ${violations.length} domain-boundary violation(s):\n`);
  for (const violation of violations) {
    console.error(
      `  ${violation.file}:${violation.line} [${violation.rule}]\n    ${violation.message}\n`,
    );
  }
  process.exit(1);
}

if (
  process.argv[1] &&
  process.argv[1].endsWith('check-domain-boundaries.mjs')
) {
  main();
}
