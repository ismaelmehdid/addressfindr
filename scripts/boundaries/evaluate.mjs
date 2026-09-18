import {
  ALLOWED_EDGES,
  DOMAINS,
  DYNAMIC_IMPORT_ALLOWLIST,
  SHARED_PREFIXES,
} from './manifest.mjs';

export const SCHEMA_PREFIX = 'src/infra/database/schema/';
const DB_CONNECTION = 'src/infra/database/connection';
const DB_INTERNAL_MODULES = new Set([
  'src/infra/database/connection',
  'src/infra/database/local-seed',
]);
const CORE_FORBIDDEN_TARGETS = [
  'src/application/',
  'src/infra/',
  'src/shared/',
  'src/app/',
];

const SCHEMA_OWNERS = new Map();
for (const domain of DOMAINS) {
  for (const schema of domain.schemas) {
    const list = SCHEMA_OWNERS.get(schema) ?? [];
    list.push(domain.name);
    SCHEMA_OWNERS.set(schema, list);
  }
}

export function stripExtension(modulePath) {
  return modulePath.replace(/\.(ts|tsx|js|jsx|mjs|cjs|css)$/, '');
}

function posixNormalize(path) {
  const parts = [];
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') parts.pop();
    else parts.push(segment);
  }
  return parts.join('/');
}

export function resolveImport(importerRepoPath, spec) {
  if (spec.startsWith('@/')) return stripExtension(`src/${spec.slice(2)}`);
  if (spec.startsWith('.')) {
    const dir = importerRepoPath.split('/').slice(0, -1).join('/');
    return stripExtension(posixNormalize(`${dir}/${spec}`));
  }
  return null;
}

export function domainOf(repoPath) {
  let best = null;
  for (const domain of DOMAINS) {
    for (const dir of domain.dirs) {
      if (repoPath === dir || repoPath.startsWith(`${dir}/`)) {
        if (!best || dir.length > best.len) {
          best = { name: domain.name, len: dir.length };
        }
      }
    }
  }
  return best ? best.name : null;
}

export function isShared(repoPath) {
  const modulePath = stripExtension(repoPath);
  return SHARED_PREFIXES.some(
    (p) =>
      modulePath === p ||
      modulePath.startsWith(`${p}/`) ||
      modulePath.startsWith(`${p}.`),
  );
}

export function isDbInternal(repoPath) {
  const modulePath = stripExtension(repoPath);
  return (
    DB_INTERNAL_MODULES.has(modulePath) || modulePath.startsWith(SCHEMA_PREFIX)
  );
}

export function isDynamicImportAllowed(repoPath) {
  return DYNAMIC_IMPORT_ALLOWLIST.includes(repoPath);
}

function publicModulesOf(domainName) {
  const domain = DOMAINS.find((d) => d.name === domainName);
  return domain ? domain.public : [];
}

function isOpenToAll(domainName) {
  const domain = DOMAINS.find((d) => d.name === domainName);
  return domain ? domain.openToAll === true : false;
}

function edgeAllowed(from, to) {
  return ALLOWED_EDGES.some(([a, b]) => a === from && b === to);
}

export function evaluateFilePlacement(repoPath) {
  const violations = [];
  const modulePath = stripExtension(repoPath);
  const basename = repoPath.split('/').pop() ?? '';

  if (/^index\.(ts|tsx|js|jsx|mjs|cjs)$/.test(basename)) {
    violations.push({
      rule: 'no-barrels',
      message:
        'Barrel files (index.ts) are forbidden — import modules directly.',
    });
  }

  if (
    modulePath.startsWith(SCHEMA_PREFIX) &&
    modulePath.endsWith('-schema') &&
    !SCHEMA_OWNERS.has(modulePath)
  ) {
    violations.push({
      rule: 'schema-unowned',
      message:
        'Every table schema must be owned by a domain — add it to that domain’s `schemas` array in scripts/boundaries/manifest.mjs.',
    });
  }

  const covered =
    domainOf(repoPath) !== null ||
    isShared(repoPath) ||
    isDbInternal(repoPath) ||
    repoPath.startsWith('src/app/');
  if (!covered) {
    violations.push({
      rule: 'unassigned-file',
      message:
        'File is not covered by the domain manifest. Assign its directory to a domain (or shared) in scripts/boundaries/manifest.mjs.',
    });
  }

  return violations;
}

export function evaluateImport(importerRepoPath, spec) {
  const target = resolveImport(importerRepoPath, spec);
  const modulePath = stripExtension(importerRepoPath);
  if (!target || target === modulePath) return null;

  const fromDomain = domainOf(importerRepoPath);
  const fromShared = isShared(importerRepoPath);
  const fromDbInternal = isDbInternal(importerRepoPath);

  if (importerRepoPath.startsWith('src/core/')) {
    const forbidden = CORE_FORBIDDEN_TARGETS.find((p) => target.startsWith(p));
    if (forbidden) {
      return {
        rule: 'core-purity',
        message: `core/ must not import ${forbidden} (imported '${spec}').`,
      };
    }
  }

  if (target.startsWith(SCHEMA_PREFIX)) {
    const owners = SCHEMA_OWNERS.get(target) ?? [];
    const importerIsOwningInfra =
      fromDomain !== null &&
      owners.includes(fromDomain) &&
      importerRepoPath.startsWith('src/infra/');
    if (!fromDbInternal && !importerIsOwningInfra) {
      return {
        rule: 'schema-ownership',
        message: `Table schema '${target}' is owned by [${owners.join(', ')}] and may only be imported from that domain's infra layer (imported '${spec}').`,
      };
    }
    return null;
  }

  if (target === DB_CONNECTION) {
    const importerAllowed =
      importerRepoPath.startsWith('src/infra/data-access/') ||
      importerRepoPath.startsWith('src/infra/auth/') ||
      fromDbInternal;
    if (!importerAllowed) {
      return {
        rule: 'db-access',
        message: `Direct db access is limited to infra/data-access, infra/auth and infra/database internals (imported '${spec}').`,
      };
    }
    return null;
  }

  const toDomain = domainOf(target);
  if (!toDomain) return null;

  if (target.startsWith('src/infra/data-access/') && fromDomain !== toDomain) {
    return {
      rule: 'repo-privacy',
      message: `Repository '${target}' belongs to domain '${toDomain}' — cross-domain access must go through its application entry points (imported '${spec}').`,
    };
  }

  if (fromDomain === toDomain) return null;

  if (!publicModulesOf(toDomain).includes(target)) {
    return {
      rule: 'entry-point',
      message: `'${target}' is internal to domain '${toDomain}'. Import one of its declared entry points, or declare this module public in scripts/boundaries/manifest.mjs (imported '${spec}').`,
    };
  }

  if (fromShared || fromDbInternal || fromDomain === null) return null;

  if (!isOpenToAll(toDomain) && !edgeAllowed(fromDomain, toDomain)) {
    return {
      rule: 'edge-not-allowed',
      message: `Domain '${fromDomain}' does not declare a dependency on '${toDomain}'. Add the edge to ALLOWED_EDGES in scripts/boundaries/manifest.mjs if this coupling is intended (imported '${spec}').`,
    };
  }

  return null;
}
