# Remove the organization model — B2C tenancy

Date: 2026-09-18
Status: approved, not yet implemented
Branch: `feat/remove-organization-b2c`

## Goal

The product is B2C. The boilerplate ships a B2B tenancy model — organizations,
members, invitations — and uses `organizationId` as the partition key for every
user-owned resource. Remove the model entirely and partition on `userId`.

This is a full removal, not a hidden-UI change. The decision was taken with the
cost known: 97 files reference `organizationId`.

## Non-goals

- The early-access gate stays. `early_access_code.usedBy` already references
  `user.id`, so it is unaffected. Onboarding keeps the code field and loses the
  organization-name field.
- Chat is untouched. Mastra already partitions on `resourceId: userId`.
- The `email` domain stays in the tree even though removing invitations leaves
  it with no caller. It will serve B2C transactional mail.

## Scope

### Removed

| Thing | Location |
| --- | --- |
| `organization`, `member`, `invitation` tables | `infra/database/schema/organization-schema.ts` |
| `organization` domain | `core/`, `application/organization/`, `infra/data-access/organization/` |
| Better Auth `organization` plugin | `infra/auth/auth.ts` |
| `session.activeOrganizationId` | `infra/database/schema/auth-schema.ts`, `infra/auth/active-organization.ts` |
| Organization settings screen | `app/(app)/dashboard/organization/` |
| Invitation accept screen | `app/(public)/accept-invitation/[id]/` |
| Invitation email + its Better Auth hook | `infra/email/send-organization-invitation.tsx`, `auth.ts` |
| `organization.*` message keys | `i18n/messages/{en,fr}.json` |

### Re-scoped from `organizationId` to `userId`

- `file` — column, indexes, `file-repo`, `finalize-upload`, `api/files/*`
- `zeroentropy_collection`, `zeroentropy_entity`, `failed_sync_operation`
- `collection-service` / `collection-name` — the ZeroEntropy collection name is
  derived from the user instead of the organization
- `entity-sync-service`, `entity-sync-orchestrator`
- Autumn billing: `customerId: organizationId` becomes `customerId: userId`
  (`infra/external-apis/autumn/autumn-billing-adapter.ts`). No migration
  concern — Autumn is not provisioned and has no customers.
- `application/me/organization-scope` → `application/me/user-scope`.
  `requireOrganizationScope()` becomes `requireUserScope()` returning
  `{ userId }`. It is **not** deleted: it is the shared authorization gate for
  `files`, `storage`, `zeroentropy` and `transcription`, and it carries the
  unauthorized check those callers depend on. Only the `Organization required`
  branch and the `organizationId` field go.

## Database strategy — rebase the baseline

The repository's first commit is an initial import and the hosted database holds
one unused early-access code. There is no history or data to protect.

1. Delete `drizzle/0000_equal_mysterio.sql` and
   `drizzle/0001_conscious_thunderbolt_ross.sql`, and their `meta/` snapshots.
2. Regenerate a single `0000` from the post-removal schema.
3. Drop and recreate the schema on Supabase, then apply the new baseline.
4. Re-insert an early-access code.

Row-level security is carried by `.enableRLS()` on every table in the schema, so
the regenerated baseline includes it. No separate RLS migration survives.

**This destroys the current database.** Acceptable because it holds only the
unused code. Confirm no real account exists before running it.

## Boundaries

`scripts/boundaries/manifest.mjs` loses the `organization` domain and every edge
pointing at it. The `files` and `indexing` domains keep their tables but their
public entry points change shape. The checker's `unassigned-file` and
`undeclared-edge` rules are the safety net — run `pnpm check:boundaries` after
each removal rather than at the end.

## i18n

`IntlMessages` in `src/global.d.ts` turns a missing key into a compile error, and
`en.json` is the type source of truth. Removing a key from `en.json` therefore
surfaces every stale `t('organization.…')` call as a type error. `fr.json` must
mirror `en.json` exactly.

## Testing

- `list-members.test.ts` and `list-invitations.test.ts` are deleted with their
  use cases.
- File and ZeroEntropy tests are rewritten against `userId`:
  `collection-name.test.ts`, `expand-attachments.test.ts`.
- `pnpm validate` must be green at each checkpoint, not only at the end.
- Manual: boot the app, sign in with Google, redeem the access code, land on the
  dashboard, upload a file.

## Risks

**A second agent shares this working tree.** It committed 13 `listing` commits
onto `feat/listing-ingestion-extraction` and swept earlier uncommitted work into
its initial import. Both agents touch `scripts/boundaries/manifest.mjs`. Work on
`feat/remove-organization-b2c` and re-check the file before committing it.

**The tenancy swap is the dangerous part**, not the deletions. A missed
`organizationId` on a file query is a data-isolation bug: one user reading
another's documents. The type system covers renamed columns; it does not cover a
query that forgot its `where` clause. Every repository function that filters on
the old key gets a test that proves it filters on the new one.

## Open question

Is this clone still "the boilerplate"? `CLAUDE.md` describes a reusable base for
several startups; removing B2B makes it single-purpose. Assumed: this clone is
addressfindr and the generic boilerplate lives elsewhere.
