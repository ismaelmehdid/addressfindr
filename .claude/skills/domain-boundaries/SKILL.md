---
name: domain-boundaries
description: Use when adding a new domain to the codebase, widening a domain's public API, declaring a new cross-domain edge, or setting up branch protection on a fresh clone. Covers the manifest-driven workflow in scripts/boundaries/manifest.mjs. The enforced rules themselves live in CLAUDE.md and are always loaded; this skill is the how-to for changing them.
---

# Changing domain boundaries

The rules the checker enforces are in `CLAUDE.md` under *Domain isolation* and are always in context. This file is the procedure for the three tasks that change those boundaries.

## Adding a domain

Create its dirs (`core/<x>`, `application/<x>`, `infra/data-access/<x>`, schema file), register it in `scripts/boundaries/manifest.mjs` with dirs, owned schemas, and public entry points, and declare any edges it needs. The checker's `unassigned-file` rule will remind you if you forget.

## Extending a domain's API deliberately

Add the module to its `public` list (or add an edge). That diff on `scripts/boundaries/manifest.mjs` is the reviewable contract change — never work around the checker by moving files between domains to dodge a rule.

## Branch protection (do this once per clone)

In GitHub settings, protect `master` and require the `boundaries`, `test`, and `type-check` checks. That is the only gate a developer cannot bypass locally; the ESLint rule, the whole-tree checker, and the vitest run are fast feedback for it.
