# Remove Organization Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the B2B organization model and partition every user-owned resource on `userId`.

**Architecture:** Work leaves-first. Every consumer of `organizationId` is re-scoped before the domain that defines it is deleted, because the husky pre-commit hook runs `tsc --noEmit` and every commit must compile. The database baseline is rebased last, once the schema has settled.

**Tech Stack:** Next.js 16, React 19, TypeScript 6, Drizzle ORM + Postgres (Supabase), Better Auth, valibot, neverthrow, vitest, next-intl.

**Spec:** `docs/superpowers/specs/2026-09-18-remove-organization-b2c-design.md`

## Global Constraints

- Every commit must pass `tsc --noEmit` — the pre-commit hook enforces it. Never use `--no-verify`.
- `pnpm validate` must be green before the plan is considered done: `type-check && check && lint && check:boundaries && test`.
- No barrel files. Import modules directly.
- No code comments explaining *what*. A single `// why` line is allowed for a non-obvious constraint.
- Repositories return DTOs, never raw Drizzle rows.
- Infrastructure returns `Result<T, AppError>`; it does not throw across layers.
- `src/i18n/messages/en.json` is the type source of truth; `fr.json` mirrors its shape exactly.
- Run `pnpm check:boundaries` after each task, not only at the end.
- Branch: `feat/remove-organization-b2c`.

---

### Task 1: Re-scope the file domain to `userId`

`file` already carries a `userId` column alongside `organizationId`. This task drops the organization column and rewrites every query that filtered on it.

**Files:**
- Modify: `src/infra/database/schema/file-schema.ts`
- Modify: `src/infra/data-access/file/file-repo.ts`
- Modify: `src/application/files/finalize-upload.ts`, `initiate-upload.ts`, `get-file.ts`, `list-files.ts`, `delete-file.ts`, `rename-file.ts`
- Modify: `src/app/api/files/[id]/route.ts`, `src/app/api/files/route.ts`
- Modify: `src/application/chat/expand-attachments.ts`
- Test: `src/application/files/list-files.test.ts`, `delete-file.test.ts`, `rename-file.test.ts`, `src/application/chat/expand-attachments.test.ts`

**Interfaces:**
- Consumes: `requireOrganizationScope()` from `@/application/me/organization-scope`, still returning `{ userId, organizationId }`. Use only `userId`; the gate is renamed in Task 4.
- Produces: `getFileForUser({ fileId, userId })`, `listFilesForUser({ userId, status? })`, `createFile({ userId, … })`, `markUploaded({ fileId, userId })`, `markIndexStatus({ fileId, userId, … })`, `deleteFileRow({ fileId, userId })`, `setFileVisionDescription({ fileId, userId, … })`. Every `…ForOrg` name becomes `…ForUser`; every `organizationId` parameter is dropped.

- [ ] **Step 1: Write the failing isolation test**

This is the test that matters. The risk in this plan is not a missing column, it is a query that forgets its filter and lets one user read another's documents.

In `src/application/files/list-files.test.ts`, add:

```ts
it('never returns a file belonging to another user', async () => {
  await createFile({ userId: 'user-a', originalName: 'a.pdf', storageKey: 'k-a', mimeType: 'application/pdf', fileType: 'document', sizeBytes: 1 });
  await createFile({ userId: 'user-b', originalName: 'b.pdf', storageKey: 'k-b', mimeType: 'application/pdf', fileType: 'document', sizeBytes: 1 });

  const result = await listFilesForUser({ userId: 'user-a' });

  expect(result.isOk()).toBe(true);
  const names = result._unsafeUnwrap().map((f) => f.originalName);
  expect(names).toEqual(['a.pdf']);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/application/files/list-files.test.ts`
Expected: FAIL — `listFilesForUser` is not exported.

- [ ] **Step 3: Drop the column from the schema**

In `src/infra/database/schema/file-schema.ts`, remove the `organization` import, the `organizationId` column, and the two indexes that reference it. Replace the composite index so it still covers the list query:

```ts
index('file_user_status_created_idx').on(
  table.userId,
  table.status,
  desc(table.createdAt),
),
```

Keep `file_user_id_idx`, `file_storage_key_unique` and `file_index_status_idx`. Keep `.enableRLS()`.

- [ ] **Step 4: Rewrite the repository**

In `src/infra/data-access/file/file-repo.ts`, for each of the eight functions: drop `organizationId` from the argument object, drop `eq(file.organizationId, …)` from every `where`, and rename `getFileForOrg` → `getFileForUser` and `listFilesForOrg` → `listFilesForUser`. Drop `'organizationId'` from the DTO column union near line 29 and the `organizationId: row.organizationId` mapping near line 70.

Every `where` that loses `eq(file.organizationId, …)` must keep `eq(file.userId, args.userId)`. If a function had no user filter, add one — that is the isolation guarantee.

- [ ] **Step 5: Update the callers**

In the six `src/application/files/*.ts` use cases and the two API routes, stop destructuring `organizationId` from the scope and pass `userId` where `organizationId` was passed.

- [ ] **Step 6: Re-scope chat attachment expansion**

`src/application/chat/expand-attachments.ts` resolves attachments through the file repository and carries 4 `organizationId` references; its test carries 9. Swap both to `userId` and to the renamed `getFilesByIds` / `getFileForUser` calls.

- [ ] **Step 7: Run the tests**

Run: `pnpm vitest run src/application/files/ src/application/chat/expand-attachments.test.ts`
Expected: PASS, including the new isolation test.

- [ ] **Step 8: Verify types and boundaries**

Run: `pnpm type-check && pnpm check:boundaries`
Expected: both clean. Type errors elsewhere are expected only in ZeroEntropy code, which Task 2 handles — if so, note them and continue.

- [ ] **Step 9: Commit**

```bash
git add src/infra/database/schema/file-schema.ts src/infra/data-access/file/ src/application/files/ src/application/chat/ src/app/api/files/
git commit -m "refactor(files): partition files on userId instead of organizationId"
```

---

### Task 2: Re-scope ZeroEntropy to `userId`

**Files:**
- Modify: `src/infra/database/schema/zeroentropy-schema.ts`
- Modify: `src/infra/data-access/zeroentropy/collection-repo.ts`, `failed-sync-repo.ts`
- Modify: `src/application/zeroentropy/collection-name.ts`, `collection-service.ts`, `entity-sync-service.ts`, `entity-sync-orchestrator.ts`, `query-snippets.ts`
- Test: `src/application/zeroentropy/collection-name.test.ts`, `entity-sync-orchestrator.test.ts`

**Interfaces:**
- Consumes: `requireOrganizationScope()`, using only `userId`.
- Produces: `generateCollectionName({ userId, userName })` returning `string`.

- [ ] **Step 1: Rewrite the collection-name test**

In `src/application/zeroentropy/collection-name.test.ts`, replace every `organizationId` / `organizationName` argument with `userId` / `userName`:

```ts
it('derives a stable collection name from the user id', () => {
  const name = generateCollectionName({ userId: 'user-1234abcd', userName: null });
  expect(name).toMatch(/^app-entities-user-123-[0-9a-f]{8}$/);
});

it('prefers a slug of the user name when present', () => {
  const name = generateCollectionName({ userId: 'user-1234abcd', userName: 'Ismael Mehdid' });
  expect(name).toBe('ismael-mehdid-user-123');
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/application/zeroentropy/collection-name.test.ts`
Expected: FAIL — the function still expects `organizationId`.

- [ ] **Step 3: Rewrite `generateCollectionName`**

```ts
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
```

- [ ] **Step 4: Rename the schema columns**

In `zeroentropy-schema.ts`, rename `organizationId` to `userId` on `zeroentropyCollection` and `failedSyncOperation`, repoint the foreign keys at `user.id`, and rename the indexes: `zeroentropy_collection_org_unique` → `zeroentropy_collection_user_unique`, `failed_sync_operation_org_idx` → `failed_sync_operation_user_idx`. Keep `.enableRLS()`.

- [ ] **Step 5: Update repositories and services**

In `collection-repo.ts`, `failed-sync-repo.ts`, `collection-service.ts`, `entity-sync-service.ts`, `entity-sync-orchestrator.ts` and `query-snippets.ts`, rename every `organizationId` argument and column reference to `userId`. `entity-sync-service.ts` has the most occurrences — work through it with the type checker.

- [ ] **Step 6: Run tests, types and boundaries**

Run: `pnpm vitest run src/application/zeroentropy/ && pnpm type-check && pnpm check:boundaries`
Expected: all clean.

- [ ] **Step 7: Commit**

```bash
git add src/infra/database/schema/zeroentropy-schema.ts src/infra/data-access/zeroentropy/ src/application/zeroentropy/
git commit -m "refactor(indexing): partition ZeroEntropy collections on userId"
```

---

### Task 3: Point Autumn billing at the user

**Files:**
- Modify: `src/infra/external-apis/autumn/autumn-billing-adapter.ts`
- Modify: any caller passing `organizationId` into it (find with `grep -rn "billing" src/application`)

**Interfaces:**
- Produces: the billing adapter's input takes `userId: string` where it took `organizationId: string`; `customerId` is now the user id.

- [ ] **Step 1: Rename the field**

In `autumn-billing-adapter.ts`, rename the `organizationId` input field to `userId` at all five occurrences, including `customerId: input.userId`.

No migration concern: Autumn is not provisioned (`AUTUMN_SECRET_KEY` is empty) and no customer records exist.

- [ ] **Step 2: Update callers**

Run: `grep -rn "organizationId" src/application src/app --include='*.ts' --include='*.tsx' | grep -i billing`
Fix each hit to pass `userId`.

- [ ] **Step 3: Verify**

Run: `pnpm type-check`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/infra/external-apis/autumn/
git commit -m "refactor(billing): key Autumn customers on userId"
```

---

### Task 4: Rename the authorization gate

At this point nothing reads `scope.organizationId`, so the gate can shed it.

**Files:**
- Create: `src/application/me/user-scope.ts`
- Delete: `src/application/me/organization-scope.ts`, `src/application/me/organization-scope.test.ts`
- Test: `src/application/me/user-scope.test.ts`
- Modify: every caller — `application/files/*`, `application/storage/create-signed-upload-url.ts`, `application/zeroentropy/query-snippets.ts`, `application/transcription/transcribe-audio.ts`

**Interfaces:**
- Produces: `requireUserScope(): Promise<Result<{ userId: string }, AppError>>` and `requireUnauthorized(): AppError`.

- [ ] **Step 1: Write the test**

`src/application/me/user-scope.test.ts`:

```ts
it('returns the user id for a signed-in user', async () => {
  const result = await requireUserScope();
  expect(result.isOk()).toBe(true);
  expect(result._unsafeUnwrap()).toEqual({ userId: 'user-1' });
});

it('returns unauthorized when there is no session', async () => {
  const result = await requireUserScope();
  expect(result.isErr()).toBe(true);
  expect(result._unsafeUnwrapErr().code).toBe('unauthorized');
});
```

Mock `getCurrentUser` the way `organization-scope.test.ts` does — copy its mocking setup before deleting it.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/application/me/user-scope.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `user-scope.ts`**

```ts
import { err, ok, type Result } from 'neverthrow';
import { getCurrentUser } from '@/application/me/get-current-user';
import { type AppError, unauthorized } from '@/core/errors';

export type AuthorizedScope = {
  userId: string;
};

export async function requireUserScope(): Promise<
  Result<AuthorizedScope, AppError>
> {
  const me = await getCurrentUser();
  if (me.isErr()) return err(me.error);
  return ok({ userId: me.value.id });
}

export function requireUnauthorized(): AppError {
  return unauthorized();
}
```

Note the `forbidden` import is gone with the `Organization required` branch.

- [ ] **Step 4: Update callers and delete the old module**

Replace every `requireOrganizationScope` import and call with `requireUserScope`, then delete `organization-scope.ts` and its test.

- [ ] **Step 5: Verify**

Run: `pnpm vitest run && pnpm type-check && pnpm check:boundaries`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add src/application/me/ src/application/files/ src/application/storage/ src/application/zeroentropy/ src/application/transcription/
git commit -m "refactor(auth): replace organization scope with user scope"
```

---

### Task 5: Remove the organization UI

**Files:**
- Delete: `src/app/(app)/dashboard/organization/` (whole directory)
- Delete: `src/app/(public)/accept-invitation/` (whole directory)
- Modify: `src/app/(public)/onboarding/components/onboarding-form.tsx`
- Modify: `src/app/(app)/dashboard/components/dashboard-sidebar.tsx`
- Modify: `src/app/(app)/layout.tsx`, `src/app/(app)/dashboard/layout.tsx`, `src/app/(public)/sign-in/page.tsx`, `src/app/(public)/page.tsx`
- Modify: `src/application/me/get-current-user.ts`
- Modify: `src/infra/data-access/early-access/early-access-repo.ts`
- Modify: `src/shared/api-route.ts`
- Modify: `src/application/early-access/redeem.ts`

- [ ] **Step 1: Delete the two route directories**

```bash
rm -rf "src/app/(app)/dashboard/organization" "src/app/(public)/accept-invitation"
```

- [ ] **Step 2: Strip the organization field from onboarding**

In `onboarding-form.tsx`, remove the `orgName` input and its `autoComplete="organization"` attribute, and drop `organizationName` from the `redeemEarlyAccess` payload. The form now submits only the access code.

- [ ] **Step 3: Replace the organization gate with an early-access gate**

`get-current-user` derives `organizationId` from a membership lookup. Both go, and the redirect condition needs something real to test instead.

Add to `src/infra/data-access/early-access/early-access-repo.ts`, following the shape of `claimCode` already there:

```ts
export async function hasRedeemedCode(args: {
  userId: string;
}): Promise<Result<boolean, AppError>> {
  try {
    const [row] = await db
      .select({ id: earlyAccessCode.id })
      .from(earlyAccessCode)
      .where(eq(earlyAccessCode.usedBy, args.userId))
      .limit(1);
    return ok(Boolean(row));
  } catch (e) {
    log.error('early_access.has_redeemed.failed', e, { userId: args.userId });
    return err(unknown('Failed to read early-access status'));
  }
}
```

In `src/application/me/get-current-user.ts`, replace the `organizationId: string | null` field on the returned type with `hasRedeemedAccess: boolean`, swap the `getMembership` call for `hasRedeemedCode`, and drop the `getMembership` import:

```ts
const redeemed = await hasRedeemedCode({ userId: session.user.id });
if (redeemed.isErr()) return err(redeemed.error);
```

```ts
hasRedeemedAccess: redeemed.value,
```

Then in `(app)/layout.tsx`, `(app)/dashboard/layout.tsx` and `(public)/sign-in/page.tsx`, replace `!currentUser.value.organizationId` with `!currentUser.value.hasRedeemedAccess`.

Remove the organization link from `dashboard-sidebar.tsx`. The sidebar stays collapsed to its icon rail — do not expand it.

`src/shared/api-route.ts` is the second gate and must move in the same commit. It rejects any user without an organization (`forbidden('Organization required')`) and builds its rate-limit identifier as `` `${organizationId}:${id}` ``. Drop the organization check — `requireUserScope` already dropped its equivalent, and leaving this one in place would keep every `/api/files/*` and `/api/transcribe` route closed. The rate-limit identifier becomes the user id alone, which changes bucketing from per-organization-per-user to per-user: correct for a B2C product, and the only sane reading once organizations are gone.

- [ ] **Step 4: Simplify the redeem use case in the same commit**

The form stops sending `organizationName`, so the endpoint it posts to must stop requiring it in the same commit — otherwise onboarding posts an empty string into a `minLength(2)` check and breaks at runtime, where `tsc` cannot see it.

In `src/application/early-access/redeem.ts`: remove `organizationName` from the valibot input schema, delete the `slugify` helper, the `createOrganizationWithOwner` call, the `setActiveOrganizationOnSession` call and the `already_in_org` branch. `RedeemResult` becomes `{ success: true } | { success: false; error: … }`. Keep the code-hash lookup and the `usedBy` / `usedAt` write — that is the gate.

- [ ] **Step 5: Verify**

Run: `pnpm type-check`
Expected: errors now point only at `application/organization/*` and `infra/auth/auth.ts`, which Tasks 6 and 7 remove.

- [ ] **Step 6: Commit**

```bash
git add -A "src/app" src/application/me src/application/early-access src/infra/data-access/early-access
git commit -m "refactor(ui): remove organization screens and gate on early access"
```

---

### Task 6: Remove the Better Auth organization plugin

**Files:**
- Modify: `src/infra/auth/auth.ts`
- Delete: `src/infra/auth/active-organization.ts`
- Delete: `src/infra/email/send-organization-invitation.tsx`, `src/infra/email/templates/organization-invitation-email.tsx`
- Modify: `src/infra/database/schema/auth-schema.ts`

- [ ] **Step 1: Remove the plugin**

In `auth.ts`, delete the whole `organization({ … })` entry from `plugins`, including the `sendInvitationEmail` hook, and remove the now-unused `sendOrganizationInvitationEmail` import.

- [ ] **Step 2: Drop the session column**

In `auth-schema.ts`, remove `activeOrganizationId` from the `session` table. Delete `src/infra/auth/active-organization.ts`.

- [ ] **Step 3: Delete the invitation email**

```bash
rm src/infra/email/send-organization-invitation.tsx src/infra/email/templates/organization-invitation-email.tsx
```

`emailSender()` and the no-op adapter stay: they will serve B2C transactional mail.

- [ ] **Step 4: Verify**

Run: `pnpm type-check`
Expected: remaining errors point only at `application/organization/*`.

- [ ] **Step 5: Commit**

```bash
git add -A src/infra
git commit -m "refactor(auth): drop the Better Auth organization plugin"
```

---

### Task 7: Delete the organization domain

**Files:**
- Delete: `src/application/organization/` (whole directory)
- Delete: `src/infra/data-access/organization/` (whole directory)
- Delete: `src/infra/database/schema/organization-schema.ts`
- Modify: `src/infra/database/connection.ts`
- Modify: `scripts/boundaries/manifest.mjs`
- Modify: `src/i18n/messages/en.json`, `src/i18n/messages/fr.json`

- [ ] **Step 1: Delete the directories and schema**

```bash
rm -rf src/application/organization src/infra/data-access/organization
rm src/infra/database/schema/organization-schema.ts
```

- [ ] **Step 2: Unregister the schema**

In `src/infra/database/connection.ts`, remove the `organizationSchema` import and its spread in the `schema` object.

- [ ] **Step 3: Update the boundaries manifest**

In `scripts/boundaries/manifest.mjs`, delete the `organization` domain entry and every edge in `ALLOWED_EDGES` naming it.

Re-read this file immediately before editing — a second agent added a `listing` domain to it and may have changed it since.

- [ ] **Step 4: Remove the i18n keys**

Delete the `organization` key block from `en.json`, then make `fr.json` mirror it exactly. `IntlMessages` in `src/global.d.ts` turns any surviving `t('organization.…')` call into a type error, so the compiler finds what the grep misses.

- [ ] **Step 5: Verify**

Run: `pnpm validate`
Expected: fully green — types, biome, eslint, boundaries and tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: delete the organization domain"
```

---

### Task 8: Rebase the migration baseline

The code is settled; now the database follows. **This destroys the current database contents** — one user, one session, one unused access code. Confirm with the user before running Step 3.

**Files:**
- Delete: `drizzle/0000_equal_mysterio.sql`, `drizzle/0001_conscious_thunderbolt_ross.sql`, and their `drizzle/meta/` snapshots
- Create: a regenerated `drizzle/0000_*.sql`

- [ ] **Step 1: Clear the old migrations**

```bash
rm drizzle/0000_equal_mysterio.sql drizzle/0001_conscious_thunderbolt_ross.sql
rm -rf drizzle/meta
```

- [ ] **Step 2: Regenerate the baseline**

```bash
export DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
pnpm drizzle:generate
```

Read the generated SQL before applying it. It must contain no `organization`, `member` or `invitation` table, and an `ENABLE ROW LEVEL SECURITY` line for each of the nine remaining tables.

- [ ] **Step 3: Recreate the schema**

Via the Supabase MCP, or psql against `DATABASE_URL`:

```sql
drop schema public cascade;
create schema public;
grant usage on schema public to anon, authenticated, service_role;
drop schema if exists drizzle cascade;
```

- [ ] **Step 4: Apply the baseline**

```bash
pnpm drizzle:migrate
```

- [ ] **Step 5: Confirm RLS survived the rebase**

```sql
select count(*) filter (where rowsecurity) as rls_on, count(*) as total
from pg_tables where schemaname = 'public';
```

Expected: `rls_on` equals `total`. RLS is what keeps the tables off the public PostgREST API — if this regressed, stop and fix it before continuing.

- [ ] **Step 6: Reseed an access code**

```bash
pnpm early-access:hash ADDRESSFINDR-DEV
```

Run the `INSERT` it prints against the database.

- [ ] **Step 7: Commit**

```bash
git add drizzle/
git commit -m "chore(db): rebase migration baseline without organizations"
```

---

### Task 9: Verify end to end

- [ ] **Step 1: Pass the gate**

Run: `pnpm validate`
Expected: green.

- [ ] **Step 2: Boot the app**

Run: `pnpm dev`, then check each route responds:

```bash
for p in / /sign-in /onboarding /dashboard; do
  printf "%-12s " "$p"; curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000$p"
done
```

Expected: no 500. Unauthenticated `/dashboard` redirects with 307.

- [ ] **Step 3: Walk the real flow**

Sign in with Google, redeem `ADDRESSFINDR-DEV`, land on the dashboard, upload a file. Watch the dev log for errors. No screen should mention an organization.

- [ ] **Step 4: Prove isolation at the database**

```sql
select column_name from information_schema.columns
where table_schema = 'public' and column_name = 'organization_id';
```

Expected: zero rows.

- [ ] **Step 5: Report to the user and decide what to push**

The remote has no branches and `main` does not exist. Present the commit list and let the user decide what lands on `main`, given the branch also carries another agent's 13 `listing` commits.
