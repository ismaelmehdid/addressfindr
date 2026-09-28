# Results Precisement Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the results view everything precisement.fr shows for a candidate (list on the left, full detail on click), remove every account-related UI, keep Mapbox with compliant attribution, and store the user's own verdict ("C'est ce logement" / "Aucun emplacement ne correspond") as ground truth.

**Architecture:** Three streams with exclusive file ownership run in parallel on their own branches cut from the same commit, each task gated by a reviewer: **A** app shell without accounts, **C** results-view parity and map attribution, **D** feedback loop (table, repository, use cases, API routes, a client hook and two self-contained UI components). An integration task merges the three branches into `claude/results-precisement-parity`, mounts D's components into C's views, and a final task verifies the whole flow in the browser.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 6, Tailwind v4, shadcn on Base UI (`src/components/ui`), next-intl, valibot, neverthrow, Drizzle ORM + Postgres, mapbox-gl 3, vitest (node environment), biome, ESLint.

**Spec:** `docs/superpowers/specs/2026-09-26-results-precisement-parity-design.md`

## Global Constraints

- Node: prefix every command with `export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH";` (the shell default is Node 14).
- UI is composed only from `src/components/ui/*`; a missing primitive is added with the shadcn CLI and its diff checked (the CLI has written `import { cn } from "cn"` and installed an npm package named `cn` before — fix the import to `@/lib/utils`, revert any `package.json`/lockfile change).
- Every user-facing string goes through next-intl. `src/i18n/messages/en.json` is the type source; `fr.json` mirrors its keys exactly; the spec's French copy is used verbatim.
- Comments are English only, and only short `// why` lines.
- No new npm dependency.
- Layers and domain boundaries per `CLAUDE.md` and `scripts/boundaries/manifest.mjs`; `Result<T, AppError>` from infra/application; valibot at every boundary; logs start/success/failure; migrations generated with `pnpm drizzle:generate`, never hand-written.
- The map keeps one pin: the selected result's, only with a trusted point. The Mapbox logo stays. Attribution bottom-right and visible while the detail panel floats.
- Outbound links and photos use only a trusted point, never the address text.
- ADEME's floor `0` is a default: never shown as "Rez-de-chaussée" for a candidate. The listing's own floor may read "Rez-de-chaussée".
- No match reasoning in the UI (no agrees-on / differs-on, no supporting-record count, no inspected-rows footnote, no "Champs extraits").
- No personal data stored for feedback (no user id, no IP, no e-mail).
- Backend auth, billing and user tables are untouched; no auth-related database change.
- `pnpm validate` is the done-gate. Never commit with `--no-verify`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (or the attribution line the session's system reminder gives the committing model).

## Stream ownership and merge contract

Streams run in parallel on branches `stream/a-shell`, `stream/c-results`, `stream/d-feedback`, all cut from the spec commit on `claude/results-precisement-parity`. File ownership is exclusive:

- **A** owns the dashboard shell (`dashboard/layout.tsx`, `dashboard-wrapper`, `dashboard-sidebar`, `dashboard-main-shell`, `user-menu`, `edit-profile-dialog`, `language-switcher`), `dashboard/settings/**`, `(public)/sign-in/**`, `(public)/components/public-language-switcher.tsx`, `(public)/layout.tsx`, `(app)/paywall/**`, `components/ui/sidebar.tsx`, `hooks/use-mobile.ts`, `proxy.ts`, `next.config.ts`, `CLAUDE.md`, `DESIGN.md`, and the i18n namespaces `SignIn`, `Paywall`, `Nav`, `Settings`, `EditProfile`.
- **C** owns `dashboard/components/listing/**` except D's three new files, `core/ademe/{record-facts,score-scale}`, `core/geo/{outbound-links,aerial-image}`, `core/listing/listing-summary`, the `geo` and `ademe` public arrays of the manifest, and keys inside the i18n `Listing` namespace (appended after its current last key).
- **D** owns `core/listing/feedback`, `core/listing/ports/listing-feedback-repository.port.ts`, `infra/database/schema/listing-feedback-schema.ts`, the generated migration, `infra/data-access/listing-feedback/**`, `application/listing/{submit-feedback,submit-feedback-detail,feedback-dto}`, `app/api/listings/feedback/**`, the `listing-feedback` rate-limit bucket, the listing domain's `schemas` array, the three new files `dashboard/components/listing/{use-search-feedback.ts,confirm-listing-button.tsx,missing-listing-feedback.tsx}`, and a new i18n namespace `ListingFeedback` inserted immediately before `"Listing": {`.

D's UI contract (mounted by Task I1, never by C):

```ts
// src/core/listing/feedback.ts
export type FeedbackReason = 'wrong_commune' | 'wrong_dwellings' | 'address_missing' | 'unsure';

// src/app/(app)/dashboard/components/listing/use-search-feedback.ts
export type SearchFeedback = {
  verdict:
    | { kind: 'none' }
    | { kind: 'confirmed'; dpeNumber: string }
    | { kind: 'none_match'; detailSent: boolean };
  verdictStatus: 'idle' | 'sending' | 'failed';
  detailStatus: 'idle' | 'sending' | 'failed';
  confirm: (dpeNumber: string) => void;
  reportNoneMatch: () => void;
  sendDetail: (detail: { reason: FeedbackReason | null; comment: string }) => void;
};
export function useSearchFeedback(input: {
  listingUrl: string;
  candidates: readonly { record: { dpeNumber: string }; confidence: number }[];
}): SearchFeedback;

// confirm-listing-button.tsx
export function ConfirmListingButton(props: { feedback: SearchFeedback; dpeNumber: string }): React.ReactElement | null;
// missing-listing-feedback.tsx
export function MissingListingFeedback(props: { feedback: SearchFeedback }): React.ReactElement;
```

C leaves two mount points: the detail panel body ends with the "Vérifier ailleurs" section, and the left column's scroll content ends right after the candidate list.

## Review Focus

- **A selected candidate without a trusted point** among candidates that have one: no pin, no photo (house placeholder / "Image indisponible"), no outbound links, and its "C'est ce logement" button still works (the verdict does not need a point). Pinned by Task V1 step 4.
- **Villederêve for an arrondissement** (`69383`, `75115`, `13201`) links to the parent commune (`69123`, `75056`, `13055`), Corsica uppercases, a malformed code gives no link. Pinned by Stream C's core task tests.
- **Double submit / replay of feedback** (double click, network retry, a second verdict after the first): the same verdict is idempotent success, a different verdict is refused as a conflict, detail is accepted only after `none_match`. Pinned by Stream D's use-case and repository tests.
- **ADEME floor 0 and a listing floor 0**: the candidate tile and card never read "Rez-de-chaussée"; the analysed-listing recap reads "Rez-de-chaussée" for the listing's own 0. Pinned by Stream C's record-facts tests and Task V1 step 3.
- **Keyboard shortcuts while typing** in the feedback comment textarea: `←`/`→`/`Esc` must not switch or close the detail. Pinned by Stream C's detail-panel task (handler ignores events from inputs/textareas) and Task V1 step 6.

---

## Stream A — App shell without accounts (branch `stream/a-shell`)

### Task A1: Plain full-height shell, no sidebar

**Files:**
- Modify: `src/app/(app)/dashboard/layout.tsx` (full replacement)
- Delete: `src/app/(app)/dashboard/components/dashboard-wrapper.tsx`
- Delete: `src/app/(app)/dashboard/components/dashboard-main-shell.tsx`
- Delete: `src/app/(app)/dashboard/components/dashboard-sidebar.tsx`
- Delete: `src/app/(app)/dashboard/components/user-menu.tsx`
- Delete: `src/app/(app)/dashboard/components/language-switcher.tsx`
- Delete: `src/components/ui/sidebar.tsx`
- Delete: `src/hooks/use-mobile.ts`
- Modify: `src/i18n/messages/en.json`, `src/i18n/messages/fr.json` (namespace `Nav`: remove `settings`, `signIn`, `language`)
- Create (temporary, never committed): `.claude/launch.json`

**Interfaces:**
- Consumes: `DashboardHeaderBridgeProvider({ children }: { children: ReactNode })` from `src/app/(app)/dashboard/components/dashboard-header-bridge-context.tsx` (unchanged); `TooltipProvider(props: TooltipPrimitive.Provider.Props)` from `src/components/ui/tooltip.tsx` (unchanged); the `@header` parallel slot (`src/app/(app)/dashboard/@header/default.tsx`, unchanged).
- Produces: `export default function DashboardLayout(props: { children: ReactNode; header: ReactNode }): React.ReactElement`. It renders exactly one `<main>` that is the viewport-height flex column (`flex h-svh min-h-0 min-w-0 flex-col overflow-hidden bg-linen`), the header slot in a `shrink-0` row, and the page in a `flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden` region. `ListingUrlForm`'s root (`flex min-h-0 flex-1 …`) and the results workspace's grid (`min-h-0 flex-1`) depend on that height-bounded chain; it is the same chain `SidebarInset` + `DashboardMainShell` provided, minus the sidebar and the inset margins.

`dashboard-wrapper.tsx` and `dashboard-main-shell.tsx` are folded into the layout: with the sidebar gone they only forwarded children, and the spec puts the `<main>` in the dashboard layout. `edit-profile-dialog.tsx` stays until Task A2 because the settings page still imports it. `Nav.dashboard` and `Nav.signOut` stay until Task A2 for the same reason.

- [ ] **Step 1: Replace the dashboard layout**

Replace the whole content of `src/app/(app)/dashboard/layout.tsx` with:

```tsx
import type { ReactNode } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DashboardHeaderBridgeProvider } from './components/dashboard-header-bridge-context';

export default function DashboardLayout({
  children,
  header,
}: {
  children: ReactNode;
  header: ReactNode;
}): React.ReactElement {
  return (
    <DashboardHeaderBridgeProvider>
      <TooltipProvider delay={0}>
        <main className="flex h-svh min-h-0 min-w-0 flex-col overflow-hidden bg-linen">
          <div className="w-full shrink-0">{header}</div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {children}
          </div>
        </main>
      </TooltipProvider>
    </DashboardHeaderBridgeProvider>
  );
}
```

The layout no longer calls `getCurrentUser()`: nothing in the shell shows the user any more. The route stays dynamic because the root layout reads the `LOCALE` cookie through `getLocale()`.

- [ ] **Step 2: Delete the sidebar, user menu, language switcher and their primitives**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; git rm "src/app/(app)/dashboard/components/dashboard-wrapper.tsx" "src/app/(app)/dashboard/components/dashboard-main-shell.tsx" "src/app/(app)/dashboard/components/dashboard-sidebar.tsx" "src/app/(app)/dashboard/components/user-menu.tsx" "src/app/(app)/dashboard/components/language-switcher.tsx" src/components/ui/sidebar.tsx src/hooks/use-mobile.ts
```

Expected: seven `rm '…'` lines.

- [ ] **Step 3: Remove the `Nav` keys only the deleted files used**

Removed from `src/i18n/messages/en.json`:

```json
    "settings": "Settings",
    "signIn": "Sign in",
    "language": "Language"
```

Removed from `src/i18n/messages/fr.json`:

```json
    "settings": "Paramètres",
    "signIn": "Se connecter",
    "language": "Langue"
```

`Nav` becomes, in en.json:

```json
  "Nav": {
    "dashboard": "Dashboard",
    "signOut": "Sign out"
  },
```

and in fr.json:

```json
  "Nav": {
    "dashboard": "Tableau de bord",
    "signOut": "Se déconnecter"
  },
```

Both catalogs are in canonical `JSON.stringify(obj, null, 2) + '\n'` form (checked on the base commit: each round-trips byte for byte and contains no `\u` escape). The script below deletes the keys and refuses to write a file that is not canonical, so the diff is exactly the removed lines. Tasks A2–A4 use the same approach. Apply with:

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; node -e "const fs=require('fs');for(const f of ['src/i18n/messages/en.json','src/i18n/messages/fr.json']){const s=fs.readFileSync(f,'utf8');const o=JSON.parse(s);if(JSON.stringify(o,null,2)+'\n'!==s)throw new Error(f+': not canonical, edit by hand');for(const k of ['settings','signIn','language'])delete o.Nav[k];fs.writeFileSync(f,JSON.stringify(o,null,2)+'\n');}"
```

Then check:

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; git diff --stat src/i18n/messages
```

Expected: `2 files changed, 2 insertions(+), 8 deletions(-)` (the `signOut` line loses its trailing comma).

Check that en and fr still have identical key paths (prints the top-level namespaces, then the verdict):

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; node -e "const en=require('./src/i18n/messages/en.json'),fr=require('./src/i18n/messages/fr.json');const paths=(o,p='')=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'?paths(v,p+k+'.'):[p+k]);console.log(Object.keys(en).join(' '));console.log(JSON.stringify(paths(en))===JSON.stringify(paths(fr))?'en/fr keys match':'KEY MISMATCH')"
```

Expected:

```
Common SignIn Paywall Nav Meta Home Settings EditProfile Errors Listing
en/fr keys match
```

- [ ] **Step 4: Confirm nothing still references the deleted modules**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; grep -rnE "(\./|components/)(dashboard-sidebar|user-menu|language-switcher|dashboard-wrapper|dashboard-main-shell)'|components/ui/sidebar|hooks/use-mobile|useIsMobile|SidebarProvider|SidebarInset" src scripts
```

Expected: no output (exit code 1). The pattern anchors on `./` or `components/` right before the module name so that `(public)/layout.tsx`'s import of `public-language-switcher`, removed in Task A3, does not match.

- [ ] **Step 5: Run type-check, lint, biome, boundaries and tests**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm type-check && pnpm lint && pnpm check && pnpm check:boundaries && pnpm test
```

Expected: `tsc` and `eslint` print nothing after their headers; biome prints `No fixes applied` with warnings only (13 warnings exist on the base commit, none are errors); the checker prints `Domain boundaries OK.`; vitest reports every test file passed.

- [ ] **Step 6: Check in the browser that the page fills the viewport**

Create `.claude/launch.json` if it does not exist (if it exists, add this entry to its `configurations` array). It is a local helper for the preview tool; never commit it:

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "web-a",
      "runtimeExecutable": "/usr/bin/env",
      "runtimeArgs": ["PATH=/Users/ismaelmehdid/.nvm/versions/node/v25.2.1/bin:/usr/bin:/bin:/usr/sbin:/sbin", "node", "node_modules/next/dist/bin/next", "dev", "-p", "3111"],
      "port": 3111
    }
  ]
}
```

If the worktree has no `.env`, copy it from the main checkout (it is gitignored):

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; test -f .env || cp /Users/ismaelmehdid/Desktop/addressfindr/.env .env
```

Start the server with the preview tool (`preview_start`, name `web-a`), open `http://localhost:3111/dashboard`, set the viewport to 1440 × 900, and run in the page (browser `javascript_tool`):

```js
(() => {
  const vh = window.innerHeight;
  const main = document.querySelector('main');
  return {
    vh,
    mainHeight: Math.round(main.getBoundingClientRect().height),
    documentScrolls: document.documentElement.scrollHeight > vh,
    sidebar: document.querySelector('[data-slot="sidebar-wrapper"], [data-sidebar]') !== null,
    accountLinks: document.querySelectorAll('a[href^="/sign-in"], a[href^="/dashboard/settings"], a[href^="/paywall"]').length,
    mains: document.querySelectorAll('main').length,
  };
})()
```

Expected: `{ vh: 900, mainHeight: 900, documentScrolls: false, sidebar: false, accountLinks: 0, mains: 1 }`. Take a screenshot: no icon rail on the left, no avatar or globe button anywhere, the listing input is centred on the linen canvas edge to edge. Repeat at 390 × 844 (reload after resizing): same object with `vh: 844, mainHeight: 844`. Leave the server running for Task A5.

- [ ] **Step 7: Commit**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; git add "src/app/(app)/dashboard/layout.tsx" src/i18n/messages/en.json src/i18n/messages/fr.json && git status --short
```

Expected: the layout and both catalogs staged (`M`), the seven files staged as deleted (`D`), and `.claude/launch.json` listed as untracked (`??`), not staged.

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; git commit -m "$(cat <<'EOF'
refactor(shell): replace the sidebar with a plain full-height main

The dashboard layout renders one h-svh main with the header slot and the
page region, keeping the header bridge and tooltip providers. The sidebar,
user menu and language switcher are removed with ui/sidebar and
hooks/use-mobile, which only the sidebar used.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task A2: Remove the settings page and its guard

**Files:**
- Delete: `src/app/(app)/dashboard/settings/page.tsx`
- Delete: `src/app/(app)/dashboard/settings/components/settings-content.tsx`
- Delete: `src/app/(app)/dashboard/components/edit-profile-dialog.tsx`
- Delete: `src/app/(app)/dashboard/components/app-page-header.tsx`
- Create: `src/proxy.test.ts`
- Modify: `src/proxy.ts` (one constant)
- Modify: `scripts/boundaries/manifest.mjs` (the `auth` domain's `dirs`: remove `'src/app/(app)/dashboard/settings'`)
- Modify: `src/i18n/messages/en.json`, `src/i18n/messages/fr.json` (remove namespaces `Nav`, `Settings`, `EditProfile`)

**Interfaces:**
- Consumes: nothing new.
- Produces: `export default function proxy(req: NextRequest): NextResponse` in `src/proxy.ts` now passes every matched request through (`NextResponse.next()`); `export const config` (the matcher) is unchanged.

Kept on purpose: `dashboard-header-bridge-context.tsx`, `dashboard-header-slot.tsx`, `dashboard-page-header-bridge.tsx` and `@header/default.tsx`. The spec keeps `DashboardHeaderBridgeProvider`, and the portal half of that bridge is what makes the provider usable; removing it would leave the provider with no way to be fed. `app-page-header.tsx` goes: settings was its only consumer and the `@header` slot does not need it. Backend untouched: `src/application/settings/*` and `src/shared/auth-client.ts` stay, dormant.

- [ ] **Step 1: Write the failing proxy test**

Create `src/proxy.test.ts`:

```ts
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import proxy from './proxy';

function visitAnonymously(path: string): Response {
  return proxy(new NextRequest(`http://localhost:3000${path}`));
}

describe('proxy', () => {
  it.each([
    '/',
    '/dashboard',
    '/dashboard/settings',
  ])('lets an anonymous visitor through to %s', (path) => {
    const response = visitAnonymously(path);

    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm vitest run src/proxy.test.ts
```

Expected: 1 failed, 2 passed. The `/dashboard/settings` case fails with `AssertionError: expected 'http://localhost:3000/sign-in?next=%2Fdashboard%2Fsettings' to be null` (the proxy still redirects it to sign-in).

- [ ] **Step 3: Stop protecting `/dashboard/settings`**

In `src/proxy.ts`, replace:

```ts
const PROTECTED_PREFIXES = ['/dashboard/settings'];
```

with:

```ts
// why: the app has no account UI, so no page requires a session.
const PROTECTED_PREFIXES: readonly string[] = [];
```

Nothing else in the file changes (the session check, the redirect branch and `config.matcher` stay, per spec §3).

- [ ] **Step 4: Run the test again**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm vitest run src/proxy.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Delete the settings route, the profile dialog and the page header**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; git rm -r "src/app/(app)/dashboard/settings" "src/app/(app)/dashboard/components/edit-profile-dialog.tsx" "src/app/(app)/dashboard/components/app-page-header.tsx"
```

Expected: four `rm '…'` lines (`settings/page.tsx`, `settings/components/settings-content.tsx`, `edit-profile-dialog.tsx`, `app-page-header.tsx`).

- [ ] **Step 6: Drop the settings directory from the manifest**

In `scripts/boundaries/manifest.mjs`, in the `auth` domain, replace:

```js
      'src/app/(public)/sign-in',
      'src/app/(app)/dashboard/settings',
    ],
```

with:

```js
      'src/app/(public)/sign-in',
    ],
```

- [ ] **Step 7: Remove the `Nav`, `Settings` and `EditProfile` namespaces**

After Step 5 nothing reads them (`Nav.dashboard` and `Nav.signOut` were last used by `settings-content.tsx`). Removed from `src/i18n/messages/en.json`:

```json
  "Nav": {
    "dashboard": "Dashboard",
    "signOut": "Sign out"
  },
```

```json
  "Settings": {
    "title": "Settings",
    "placeholder": "Settings coming soon.",
    "profileSection": "Profile",
    "editProfile": "Edit",
    "sessionsSection": "Active sessions",
    "currentSession": "This device",
    "sessionMeta": "Signed in {date}",
    "sessionMetaWithIp": "Signed in {date} · {ip}",
    "revoke": "Sign out",
    "revokeOthers": "Sign out other sessions",
    "revokeSuccess": "Session signed out",
    "revokeOthersSuccess": "Other sessions signed out",
    "emptySessions": "No active sessions.",
    "accountsSection": "Linked accounts",
    "linkedOn": "Linked {date}",
    "unlink": "Unlink",
    "unlinkSuccess": "Account unlinked",
    "emptyAccounts": "No linked accounts.",
    "dangerSection": "Account",
    "signOutTitle": "Sign out of this device",
    "signOutDescription": "You'll need to sign in again to access your workspace."
  },
  "EditProfile": {
    "title": "Edit profile",
    "description": "Update your name. Avatar editing is not available yet.",
    "firstName": "First name",
    "lastName": "Last name",
    "save": "Save",
    "cancel": "Cancel",
    "avatarHint": "Avatar editing coming soon"
  },
```

Removed from `src/i18n/messages/fr.json`:

```json
  "Nav": {
    "dashboard": "Tableau de bord",
    "signOut": "Se déconnecter"
  },
```

```json
  "Settings": {
    "title": "Paramètres",
    "placeholder": "Paramètres bientôt disponibles.",
    "profileSection": "Profil",
    "editProfile": "Modifier",
    "sessionsSection": "Sessions actives",
    "currentSession": "Cet appareil",
    "sessionMeta": "Connecté le {date}",
    "sessionMetaWithIp": "Connecté le {date} · {ip}",
    "revoke": "Déconnecter",
    "revokeOthers": "Déconnecter les autres sessions",
    "revokeSuccess": "Session déconnectée",
    "revokeOthersSuccess": "Autres sessions déconnectées",
    "emptySessions": "Aucune session active.",
    "accountsSection": "Comptes liés",
    "linkedOn": "Lié le {date}",
    "unlink": "Délier",
    "unlinkSuccess": "Compte délié",
    "emptyAccounts": "Aucun compte lié.",
    "dangerSection": "Compte",
    "signOutTitle": "Se déconnecter de cet appareil",
    "signOutDescription": "Vous devrez vous reconnecter pour accéder à votre espace."
  },
  "EditProfile": {
    "title": "Modifier le profil",
    "description": "Modifiez votre nom. L'édition de l'avatar n'est pas encore disponible.",
    "firstName": "Prénom",
    "lastName": "Nom",
    "save": "Enregistrer",
    "cancel": "Annuler",
    "avatarHint": "Édition de l'avatar bientôt disponible"
  },
```

Apply with:

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; node -e "const fs=require('fs');for(const f of ['src/i18n/messages/en.json','src/i18n/messages/fr.json']){const s=fs.readFileSync(f,'utf8');const o=JSON.parse(s);if(JSON.stringify(o,null,2)+'\n'!==s)throw new Error(f+': not canonical, edit by hand');for(const k of ['Nav','Settings','EditProfile'])delete o[k];fs.writeFileSync(f,JSON.stringify(o,null,2)+'\n');}"
```

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; git diff --stat src/i18n/messages
```

Expected: `2 files changed, 72 deletions(-)`.

Check that en and fr still have identical key paths (prints the top-level namespaces, then the verdict):

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; node -e "const en=require('./src/i18n/messages/en.json'),fr=require('./src/i18n/messages/fr.json');const paths=(o,p='')=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'?paths(v,p+k+'.'):[p+k]);console.log(Object.keys(en).join(' '));console.log(JSON.stringify(paths(en))===JSON.stringify(paths(fr))?'en/fr keys match':'KEY MISMATCH')"
```

Expected:

```
Common SignIn Paywall Meta Home Errors Listing
en/fr keys match
```

`Meta.settings` stays: the `Meta` namespace is outside this stream's ownership (see Stream notes).

- [ ] **Step 8: Confirm nothing still references what was removed**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; grep -rnE "edit-profile-dialog|EditProfileDialog|app-page-header|AppPageHeader|dashboard/settings|Translations\('(Nav|Settings|EditProfile)'\)" src scripts
```

Expected: exactly one line, `src/proxy.test.ts:…:    '/dashboard/settings',` (the test case from Step 1).

- [ ] **Step 9: Run type-check, lint, biome, boundaries and tests**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm type-check && pnpm lint && pnpm check && pnpm check:boundaries && pnpm test
```

Expected: `tsc` and `eslint` print nothing after their headers; biome prints `No fixes applied` with warnings only (13 warnings exist on the base commit, none are errors); the checker prints `Domain boundaries OK.`; vitest reports every test file passed. The vitest summary now includes `src/proxy.test.ts` (3 tests).

- [ ] **Step 10: Commit**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; git add src/proxy.ts src/proxy.test.ts scripts/boundaries/manifest.mjs src/i18n/messages/en.json src/i18n/messages/fr.json && git commit -m "$(cat <<'EOF'
refactor(shell): remove the settings page and its session guard

The settings route, the profile dialog and the page header only it used
are deleted with their i18n namespaces. The proxy no longer protects any
path; a test pins that an anonymous visitor is never redirected.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task A3: Remove the sign-in page and the public language switcher

**Files:**
- Delete: `src/app/(public)/sign-in/page.tsx`
- Delete: `src/app/(public)/sign-in/components/sign-in-form.tsx`
- Delete: `src/app/(public)/components/public-language-switcher.tsx`
- Delete: `src/app/(public)/layout.tsx`
- Modify: `scripts/boundaries/manifest.mjs` (the `auth` domain's `dirs`: remove `'src/app/(public)/sign-in'`)
- Modify: `src/i18n/messages/en.json`, `src/i18n/messages/fr.json` (remove namespace `SignIn`)

**Interfaces:**
- Consumes: nothing new.
- Produces: no exports. `src/app/(public)/` keeps `page.tsx` (`/` redirects to `/dashboard`), `error.tsx` and `not-found.tsx`, rendered under the root layout.

`(public)/layout.tsx` is deleted rather than reduced to `<>{children}</>`: its only job was mounting the language switcher, and a route group needs no layout of its own. Backend untouched: `isMicrosoftAuthEnabled` in `src/infra/auth/auth.ts` and `src/shared/auth-client.ts` stay, now unused by the UI.

- [ ] **Step 1: Delete the sign-in route, the switcher and the public layout**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; git rm -r "src/app/(public)/sign-in" "src/app/(public)/components/public-language-switcher.tsx" "src/app/(public)/layout.tsx"
```

Expected: four `rm '…'` lines.

- [ ] **Step 2: Drop the sign-in directory from the manifest**

In `scripts/boundaries/manifest.mjs`, in the `auth` domain, replace:

```js
      'src/app/auth',
      'src/app/(public)/sign-in',
    ],
```

with:

```js
      'src/app/auth',
    ],
```

The `auth` domain's `dirs` are now `src/infra/auth`, `src/application/me`, `src/application/settings`, `src/app/auth`.

- [ ] **Step 3: Remove the `SignIn` namespace**

Removed from `src/i18n/messages/en.json`:

```json
  "SignIn": {
    "title": "Sign in",
    "google": "Continue with Google",
    "microsoft": "Continue with Microsoft"
  },
```

Removed from `src/i18n/messages/fr.json`:

```json
  "SignIn": {
    "title": "Connexion",
    "google": "Continuer avec Google",
    "microsoft": "Continuer avec Microsoft"
  },
```

Apply with:

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; node -e "const fs=require('fs');for(const f of ['src/i18n/messages/en.json','src/i18n/messages/fr.json']){const s=fs.readFileSync(f,'utf8');const o=JSON.parse(s);if(JSON.stringify(o,null,2)+'\n'!==s)throw new Error(f+': not canonical, edit by hand');delete o.SignIn;fs.writeFileSync(f,JSON.stringify(o,null,2)+'\n');}"
```

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; git diff --stat src/i18n/messages
```

Expected: `2 files changed, 10 deletions(-)`.

Check that en and fr still have identical key paths (prints the top-level namespaces, then the verdict):

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; node -e "const en=require('./src/i18n/messages/en.json'),fr=require('./src/i18n/messages/fr.json');const paths=(o,p='')=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'?paths(v,p+k+'.'):[p+k]);console.log(Object.keys(en).join(' '));console.log(JSON.stringify(paths(en))===JSON.stringify(paths(fr))?'en/fr keys match':'KEY MISMATCH')"
```

Expected:

```
Common Paywall Meta Home Errors Listing
en/fr keys match
```

- [ ] **Step 4: Confirm nothing still references what was removed**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; grep -rnE "sign-in|SignInForm|public-language-switcher|PublicLanguageSwitcher|set-locale-request|Translations\('SignIn'\)" src scripts
```

Expected: exactly one line, `src/proxy.ts:…: const SIGN_IN_PATH = '/sign-in';` (the dormant redirect target, unreachable since Task A2 emptied the protected list).

- [ ] **Step 5: Run type-check, lint, biome, boundaries and tests**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm type-check && pnpm lint && pnpm check && pnpm check:boundaries && pnpm test
```

Expected: `tsc` and `eslint` print nothing after their headers; biome prints `No fixes applied` with warnings only (13 warnings exist on the base commit, none are errors); the checker prints `Domain boundaries OK.`; vitest reports every test file passed.

- [ ] **Step 6: Commit**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; git add scripts/boundaries/manifest.mjs src/i18n/messages/en.json src/i18n/messages/fr.json && git commit -m "$(cat <<'EOF'
refactor(shell): remove the sign-in page and the public language switcher

The public route group keeps only the home redirect and its error pages.
The SignIn namespace goes with the page; Better Auth stays server side.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task A4: Remove the paywall page

**Files:**
- Delete: `src/app/(app)/paywall/page.tsx`
- Delete: `src/app/(app)/paywall/components/paywall-view.tsx`
- Delete: `src/app/(app)/paywall/components/dev-skip-button.tsx`
- Modify: `scripts/boundaries/manifest.mjs` (the `billing` domain's `dirs`: remove `'src/app/(app)/paywall'`)
- Modify: `src/i18n/messages/en.json`, `src/i18n/messages/fr.json` (remove namespace `Paywall`)

**Interfaces:**
- Consumes: nothing new.
- Produces: no exports. Billing backend untouched: `src/application/billing/*`, `src/core/billing/*`, `src/infra/external-apis/autumn/*`, `src/app/api/autumn/*`, `src/app/api/billing/dev-paywall-skip/route.ts` stay, dormant.

- [ ] **Step 1: Delete the paywall route**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; git rm -r "src/app/(app)/paywall"
```

Expected: three `rm '…'` lines.

- [ ] **Step 2: Drop the paywall directory from the manifest**

In `scripts/boundaries/manifest.mjs`, in the `billing` domain, replace:

```js
      'src/infra/external-apis/autumn',
      'src/app/(app)/paywall',
      'src/app/api/autumn',
```

with:

```js
      'src/infra/external-apis/autumn',
      'src/app/api/autumn',
```

- [ ] **Step 3: Remove the `Paywall` namespace**

Removed from `src/i18n/messages/en.json`:

```json
  "Paywall": {
    "title": "Choose a plan to continue",
    "subtitle": "Your workspace needs an active subscription to use the app.",
    "upgrade": "Upgrade to Pro",
    "devSkip": "Skip paywall (dev only)"
  },
```

Removed from `src/i18n/messages/fr.json`:

```json
  "Paywall": {
    "title": "Choisissez une formule pour continuer",
    "subtitle": "Votre espace de travail nécessite un abonnement actif pour utiliser l'application.",
    "upgrade": "Passer à Pro",
    "devSkip": "Ignorer le paywall (dev uniquement)"
  },
```

Apply with:

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; node -e "const fs=require('fs');for(const f of ['src/i18n/messages/en.json','src/i18n/messages/fr.json']){const s=fs.readFileSync(f,'utf8');const o=JSON.parse(s);if(JSON.stringify(o,null,2)+'\n'!==s)throw new Error(f+': not canonical, edit by hand');delete o.Paywall;fs.writeFileSync(f,JSON.stringify(o,null,2)+'\n');}"
```

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; git diff --stat src/i18n/messages
```

Expected: `2 files changed, 12 deletions(-)`.

Check that en and fr still have identical key paths (prints the top-level namespaces, then the verdict):

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; node -e "const en=require('./src/i18n/messages/en.json'),fr=require('./src/i18n/messages/fr.json');const paths=(o,p='')=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'?paths(v,p+k+'.'):[p+k]);console.log(Object.keys(en).join(' '));console.log(JSON.stringify(paths(en))===JSON.stringify(paths(fr))?'en/fr keys match':'KEY MISMATCH')"
```

Expected:

```
Common Meta Home Errors Listing
en/fr keys match
```

- [ ] **Step 4: Confirm nothing in the UI still references the paywall**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; grep -rnE "\(app\)/paywall|PaywallView|DevSkipButton|autumn-js/react|Translations\('Paywall'\)" src scripts
```

Expected: no output (exit code 1).

- [ ] **Step 5: Run type-check, lint, biome, boundaries and tests**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm type-check && pnpm lint && pnpm check && pnpm check:boundaries && pnpm test
```

Expected: `tsc` and `eslint` print nothing after their headers; biome prints `No fixes applied` with warnings only (13 warnings exist on the base commit, none are errors); the checker prints `Domain boundaries OK.`; vitest reports every test file passed.

- [ ] **Step 6: Commit**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; git add scripts/boundaries/manifest.mjs src/i18n/messages/en.json src/i18n/messages/fr.json && git commit -m "$(cat <<'EOF'
refactor(shell): remove the paywall page

The paywall route and its Paywall namespace are deleted. The billing
adapters, entitlement use case and API routes stay in place, unused by
the UI.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task A5: Hide the Next.js dev indicator

**Files:**
- Modify: `next.config.ts`

**Interfaces:**
- Consumes: `NextConfig['devIndicators']` (`false | { position?: … }`, checked in `node_modules/next/dist/server/config-shared.d.ts` for Next 16.2.6).
- Produces: `devIndicators: false` in the exported config. Development only; production builds never render the bubble.

- [ ] **Step 1: Record the baseline in the browser**

With the `web-a` preview server running (start it with `preview_start` name `web-a` if not; see Task A1 step 6), open `http://localhost:3111/dashboard` and run:

```js
!!document.querySelector('nextjs-portal')?.shadowRoot?.querySelector('[data-next-badge-root]')
```

Expected: `true` (the "N" bubble is rendered bottom-left). If it returns `false` because the shadow root is not reachable, zoom a screenshot on the bottom-left 120 × 80 px corner instead and confirm the round "N" button is visible there; use the same visual check in Step 3.

- [ ] **Step 2: Turn the indicator off**

In `next.config.ts`, replace:

```ts
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
};
```

with:

```ts
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  // why: the dev bubble sits on the Mapbox logo, which must stay visible.
  devIndicators: false,
};
```

- [ ] **Step 3: Check the bubble is gone**

Next restarts the dev server on a `next.config.ts` change (watch the preview logs for the restart, or restart `web-a`). Reload `http://localhost:3111/dashboard` and run the Step 1 expression again. Expected: `false`, and no "N" button in the bottom-left corner of a screenshot.

- [ ] **Step 4: Run type-check, lint, biome, boundaries and tests**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm type-check && pnpm lint && pnpm check && pnpm check:boundaries && pnpm test
```

Expected: `tsc` and `eslint` print nothing after their headers; biome prints `No fixes applied` with warnings only (13 warnings exist on the base commit, none are errors); the checker prints `Domain boundaries OK.`; vitest reports every test file passed.

- [ ] **Step 5: Commit**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; git add next.config.ts && git commit -m "$(cat <<'EOF'
build: hide the Next.js dev indicator

It covers the bottom-left corner where the Mapbox logo must stay visible.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task A6: Say there is no sidebar and no account UI in CLAUDE.md and DESIGN.md

**Files:**
- Modify: `CLAUDE.md` (five lines)
- Modify: `DESIGN.md` (app shell: colour role, layout list, components, surfaces, layout section, prompt guide, tokens)

**Interfaces:**
- Consumes / Produces: none (documentation only).

- [ ] **Step 1: Update CLAUDE.md**

Replace:

```markdown
Single Next.js app, built on a reusable startup boilerplate. The boilerplate provides auth and file upload + RAG indexing. **The product is built on top of that base — it does not replace it.**
```

with:

```markdown
Single Next.js app, built on a reusable startup boilerplate. The boilerplate provides auth and file upload + RAG indexing. **The product is built on top of that base — it does not replace it.** The app shows no account UI: auth and billing stay in the codebase, dormant, and the tool is the home page.
```

Replace:

```markdown
- **Auth**: Better Auth (Google + Microsoft OAuth)
```

with:

```markdown
- **Auth**: Better Auth (Google + Microsoft OAuth) — server side only, dormant: the app has no sign-in, settings or paywall UI
```

Replace:

```markdown
    (public)/        unauthenticated routes
    (app)/           authenticated routes (gated by layout.tsx)
```

with:

```markdown
    (public)/        `/` (redirects to `/dashboard`) and the public error pages
    (app)/           the dashboard — the tool itself, open to anonymous visitors
```

Replace:

```markdown
- **Sidebar stays collapsed (icon-rail only)** in this app — deliberate stylistic choice, never propose expanding it.
```

with:

```markdown
- **No sidebar and no account UI.** The dashboard layout is a plain full-height `<main>`; there is no sign-in page, sign-out, settings, profile, paywall or language switcher. Auth and billing stay in the backend, dormant — do not add account UI back unless asked.
```

Replace:

```markdown
- Default `fr`, fallback `en`. No `[locale]` in URLs — locale comes from `LOCALE` cookie.
```

with:

```markdown
- Default `fr`, fallback `en`. No `[locale]` in URLs — locale comes from `LOCALE` cookie. Nothing in the UI sets it (there is no language switcher); `/api/locale` still does if called.
```

- [ ] **Step 2: Update DESIGN.md**

Replace:

```markdown
| Mist | `#F2F1EC` | `--color-mist` | Subtle fill — table row hover, sidebar hover, secondary buttons at rest, input backgrounds. |
```

with:

```markdown
| Mist | `#F2F1EC` | `--color-mist` | Subtle fill — table row hover, secondary buttons at rest, input backgrounds. |
```

Replace:

```markdown
- **App shell:** sidebar (240px) + main content + optional inspector panel (320px)
```

with:

```markdown
- **App shell:** one full-height main region (`h-svh`) — no sidebar, no top bar, no account UI; the results view splits it into list, map and detail
```

Replace (delete the last bullet of the Layout list):

```markdown
- **Table row height:** 36px (default), 32px (dense)
- **Sidebar item height:** 28px
```

with:

```markdown
- **Table row height:** 36px (default), 32px (dense)
```

Replace (delete the Sidebar Nav Item component and fix the Section Header role):

```markdown
### Sidebar Nav Item
**Role:** Primary navigation entries in the left sidebar.

Transparent background, `Graphite` text, 13px Inter 500, 4px border-radius, padding 6px 8px, 16px icon at left in `Slate`. Hover: `Mist` background, text `Ink`, icon `Graphite`. **Active:** `Charcoal Soft` background, `Charcoal` text, `Charcoal` icon, plus a 2px `Charcoal` indicator bar at the left edge.

### Section Header
**Role:** Grouping label inside sidebar or panels.
```

with:

```markdown
### Section Header
**Role:** Grouping label inside panels and cards.
```

Replace:

```markdown
| 0 | Linen Canvas | `#FAF9F5` | Application background, sidebar background, page base. |
```

with:

```markdown
| 0 | Linen Canvas | `#FAF9F5` | Application background, panel background, page base. |
```

Replace the paragraph under `## Layout`:

```markdown
The app uses a three-region shell: a fixed 240px sidebar on `Linen`, a flexible main region on `Linen` with content cards on `Paper`, and an optional 320px inspector panel on the right (also `Linen`, with 1px `Stone` left divider). Sidebars and inspectors do not float — they are flush, full-height columns. Main content has a 24px outer padding and a max-width of 1280px for primary content lanes; tables and inspector flows may extend full-width. Within a page, vertical rhythm is set by `--section-gap` (24px) between cards, with 16px between rows inside a card. Page headers use `--text-heading` (22px) and sit directly on the canvas, not inside a card. Sticky elements (top bar, table headers) get a 1px `Stone` bottom border instead of a shadow.
```

with:

```markdown
The app shell is a single full-height region on `Linen`: no sidebar, no top bar and no account UI (no sign-in, avatar, settings, paywall or language switcher) — the tool is the home page. The page owns its layout inside that region. The listing form sits centred in one column. The results view is a three-panel workspace: listing and candidates on the left, the map in the centre, the selected result's detail on the right — floating over the map as a `Paper` card between `lg` and `xl`, a bottom sheet below `lg`. The left column and the docked detail are flush, full-height columns divided by 1px `Stone` borders. The document never scrolls; each column scrolls on its own. Within a panel, vertical rhythm is set by `--section-gap` (24px) between blocks, with 16px between rows inside a card. Sticky elements (panel headers, table headers) get a 1px `Stone` bottom border instead of a shadow.
```

Replace (delete the sidebar line of the prompt guide):

```markdown
- **Sidebar nav item (active):** `Charcoal Soft` background (#EDECE6), 2px `Charcoal` (#2F3130) left indicator bar, `Charcoal` text Inter 500 at 13px, 4px border-radius, padding 6px 8px, 16px `Charcoal` icon at left.
- **Data table row:**
```

with:

```markdown
- **Data table row:**
```

(keep the rest of the data-table line unchanged).

Replace:

```css
  /* Layout */
  --sidebar-width: 240px;
  --inspector-width: 320px;
```

with:

```css
  /* Layout */
  --inspector-width: 320px;
```

- [ ] **Step 3: Check nothing still describes a sidebar or account UI**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; grep -nE "Sidebar stays collapsed|icon-rail|authenticated routes|gated by layout" CLAUDE.md; grep -niE "sidebar" DESIGN.md
```

Expected: nothing from CLAUDE.md; from DESIGN.md exactly two lines, both saying "no sidebar" (the App shell bullet and the `## Layout` paragraph).

- [ ] **Step 4: Run type-check, lint, biome, boundaries and tests**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm type-check && pnpm lint && pnpm check && pnpm check:boundaries && pnpm test
```

Expected: `tsc` and `eslint` print nothing after their headers; biome prints `No fixes applied` with warnings only (13 warnings exist on the base commit, none are errors); the checker prints `Domain boundaries OK.`; vitest reports every test file passed.

- [ ] **Step 5: Commit**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; git add CLAUDE.md DESIGN.md && git commit -m "$(cat <<'EOF'
docs: no sidebar and no account UI in the app shell

CLAUDE.md replaces the collapsed-sidebar rule and the authenticated-route
wording; DESIGN.md describes the single full-height shell and drops the
sidebar component, token and prompt.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task A7: Stream A done-gate

**Files:**
- Delete (local, untracked): `.claude/launch.json` at the end of the task. No commit: this task changes no tracked file.

**Interfaces:**
- Consumes: the results of Tasks A1–A6.
- Produces: evidence that the stream is complete — `pnpm validate`, the production route table, HTTP status of the removed routes, and the height-bounded chain with a real results workspace at 1440, 1100 and 390 px.

- [ ] **Step 1: Run `pnpm validate`**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm validate
```

Expected: exit code 0 (type-check, biome, ESLint, boundaries and vitest all green).

- [ ] **Step 2: Build and read the route table**

Stop the `web-a` preview server first if it is running (`preview_stop`), then:

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm build
```

Expected: the build succeeds; the route table lists `/` and `ƒ /dashboard` (dynamic: the root layout reads the `LOCALE` cookie) and the API routes, and contains **no** `/sign-in`, `/paywall` or `/dashboard/settings` line.

- [ ] **Step 3: Check the removed routes over HTTP**

Start `web-a` again with the preview tool (Task A1 step 6 config), then:

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; for p in /sign-in /paywall /dashboard/settings /dashboard; do printf '%s ' "$p"; curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:3111$p"; done; curl -s -o /dev/null -w '/ %{http_code} %{redirect_url}\n' http://localhost:3111/
```

Expected:

```
/sign-in 404
/paywall 404
/dashboard/settings 404
/dashboard 200
/ 307 http://localhost:3111/dashboard
```

- [ ] **Step 4: Mock the two listing API calls**

Open `http://localhost:3111/dashboard` in the preview browser and run this in the page (browser `javascript_tool`) before submitting. It fakes `/api/listings/extract` and `/api/listings/match` with twelve candidates so the left column overflows; only #1 carries a trusted point (one Street View request at most).

```js
const names=['listingId','transactionType','propertyType','surfaceM2','landSurfaceM2','rooms','bedrooms','floor','buildingFloors','yearBuilt','dpeClass','gesClass','dpeKwhM2Year','gesKgCo2M2Year','heatingEnergy','annualEnergyCostMinEur','annualEnergyCostMaxEur','dpeDate','city','postalCode','inseeCode','streetAddress','priceEur','publishedAt'];
const values={listingId:'1',transactionType:null,propertyType:'house',surfaceM2:143,landSurfaceM2:null,rooms:5,bedrooms:null,floor:null,buildingFloors:null,yearBuilt:1895,dpeClass:'D',gesClass:'D',dpeKwhM2Year:201,gesKgCo2M2Year:41,heatingEnergy:'gas',annualEnergyCostMinEur:null,annualEnergyCostMaxEur:null,dpeDate:null,city:'Lyon',postalCode:'69003',inseeCode:'69383',streetAddress:null,priceEur:289000,publishedAt:null};
const fields={...values,portal:'leboncoin',canonicalUrl:'https://www.leboncoin.fr/ad/ventes_immobilieres/3271621783',pin:null};
const sources=Object.fromEntries(names.map(n=>[n,values[n]===null?'absent':'hydration']));
function rec(i,point){return {dpeNumber:'x'+i,dataset:'existing',banId:null,address:`${i} Rue Lavoisier 69003 Lyon`,streetNumber:String(i),street:'Rue Lavoisier',postalCode:'69003',city:'Lyon',inseeCode:'69383',propertyType:'house',surfaceM2:140,dpeClass:'D',gesClass:'D',dpeKwhM2Year:200,gesKgCo2M2Year:40,heatingEnergy:'gas',yearBuilt:1895,buildingFloors:2,landSurfaceM2:null,floor:0,buildingComplement:null,establishedOn:'2023-04-12',visitedOn:null,annualEnergyCostEur:null,geocodingScore:0.9,point};}
const match={candidates:Array.from({length:12},(_,k)=>({record:rec(k+1,k===0?{latitude:45.755599,longitude:4.858685}:null),confidence:0.9-k*0.03,matched:['surfaceM2'],diverged:[],supportingRecords:1})),inspected:141,truncated:false,refusedFor:null};
const realFetch=window.fetch;
window.fetch=async(input,init)=>{const u=typeof input==='string'?input:input.url;
 if(u.includes('/api/listings/extract'))return new Response(JSON.stringify({fields,sources}),{status:200,headers:{'content-type':'application/json'}});
 if(u.includes('/api/listings/match'))return new Response(JSON.stringify(match),{status:200,headers:{'content-type':'application/json'}});
 return realFetch(input,init);};
'mocked';
```

Type `https://www.leboncoin.fr/ad/ventes_immobilieres/3271621783` into the listing input, press Enter, and wait for the candidate cards.

- [ ] **Step 5: Check the height-bounded chain at three widths**

For each size — 1440 × 900, 1100 × 800, 390 × 844 — set the viewport, reload, rerun the Step 4 script, resubmit the URL, wait for the cards, then run:

```js
(() => {
  const vh = window.innerHeight;
  const main = document.querySelector('main');
  const list = document.querySelector('section[aria-labelledby="results-heading"]');
  const viewport = list?.querySelector('[data-slot="scroll-area-viewport"]');
  return {
    vh,
    mainHeight: Math.round(main.getBoundingClientRect().height),
    documentScrolls: document.documentElement.scrollHeight > vh,
    listBottom: list ? Math.round(list.getBoundingClientRect().bottom) : null,
    listScrollsInside: viewport ? viewport.scrollHeight > viewport.clientHeight : null,
    sidebar: document.querySelector('[data-slot="sidebar-wrapper"], [data-sidebar]') !== null,
    accountLinks: document.querySelectorAll('a[href^="/sign-in"], a[href^="/dashboard/settings"], a[href^="/paywall"]').length,
    mains: document.querySelectorAll('main').length,
  };
})()
```

Expected at every size: `mainHeight === vh`, `documentScrolls: false`, `listBottom === vh`, `listScrollsInside: true`, `sidebar: false`, `accountLinks: 0`, `mains: 1`. Take a screenshot at each size: no icon rail, no avatar, no globe button, no "N" bubble; at 1440 the three columns reach the bottom edge; at 390 the map is on top and the list below it, both inside the viewport.

- [ ] **Step 6: Clean up**

Stop the preview server (`preview_stop`), then:

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; rm -f .claude/launch.json && git status --short
```

Expected: no output (the tree is clean; nothing to commit).

---

### Stream notes

**Assumptions**

- `dashboard-wrapper.tsx` and `dashboard-main-shell.tsx` (both A-owned) are folded into `dashboard/layout.tsx` and deleted. Nothing outside the shell imports them on the base commit; Streams C and D must not start importing them.
- The header bridge is kept whole (`dashboard-header-bridge-context.tsx`, `dashboard-header-slot.tsx`, `dashboard-page-header-bridge.tsx`, `@header/default.tsx`) because spec §3 keeps `DashboardHeaderBridgeProvider`. After settings is gone nothing portals into the slot; it renders an empty `display: contents` div.
- `app-page-header.tsx` is deleted in Task A2. It is not in A's ownership list, but A's brief says to check it, settings was its only consumer, and no other stream owns or edits it. If Stream C's plan imports `AppPageHeader`, drop that deletion from A2.
- `src/proxy.ts` is kept per spec §3 with an empty `PROTECTED_PREFIXES` and an unchanged matcher, so it is now a pass-through on every page request (pinned by `src/proxy.test.ts`). Its dormant redirect still targets `/sign-in`, which no longer exists. Deleting the proxy would save one middleware invocation per request; that is a follow-up decision, not part of this spec.
- The dashboard layout no longer calls `getCurrentUser()`. `/dashboard` stays dynamically rendered because the root layout reads the `LOCALE` cookie; Task A7 step 2 checks the `ƒ` marker.
- Backend left untouched as the brief requires: `src/infra/auth/*` (including the now UI-unused `isMicrosoftAuthEnabled`), `src/app/auth/[...all]`, `src/application/{me,settings,billing}/*`, `src/core/billing/*`, `src/infra/external-apis/autumn/*`, `src/app/api/{autumn,billing,locale}/*`, `src/shared/auth-client.ts`.
- `Common` and `Home` were already unused on the base commit (no `useTranslations('Common'|'Home')` anywhere). The deleted files did not use them either, so they stay.

**Spec items this stream could not map to code within its ownership (for the integration task)**

- `Meta.signIn` and `Meta.settings` (en/fr) become unused once the sign-in and settings pages are deleted, but `Meta` is outside A's allowed namespaces. They are left in place; delete both keys in both catalogs during integration (`Meta.dashboard` stays, the dashboard page uses it).
- Now unreferenced but outside A's ownership, left in place: `src/i18n/set-locale-request.ts` (only the two deleted switchers imported it), `public/google_logo.svg` and `public/microsoft_logo.svg` (only the sign-in form), `public/logo.svg` (sidebar, sign-in and paywall only), the `.env.template` comment that says "the /paywall page shows a dev-only skip button", and the `--sidebar*` theme tokens in `src/app/globals.css` (shadcn's default theme keeps them even without the component).
- `Listing.errorSignedOut` ("Your session expired. Sign in again to continue.") and the `'signed-out'` failure in `listing-url-form.tsx` now tell the user to do something the app no longer offers. Both are Stream C's files; the integration task (or C) should map `unauthorized`/`forbidden` to the generic error and drop the key.
- `CLAUDE.md` is A's file but this stream only records the shell change. The results-view description (the "three-panel workspace" line under "Measured facts — ADEME coordinates") and a mention of the feedback loop (`listing_feedback` table, `/api/listings/feedback` routes) belong to the integration task, once C's and D's code exists.

**Expected conflicts with other streams**

- `scripts/boundaries/manifest.mjs`: A removes two lines from the `auth` domain's `dirs` (base lines 9–10) and one from the `billing` domain's `dirs` (base line 247). C edits the `ademe` and `geo` `public` arrays, D the `listing` domain's `schemas`/`dirs`. Separate hunks, no textual conflict.
- `src/i18n/messages/en.json` / `fr.json`: A removes whole namespaces at base lines 7–24 (`SignIn`, `Paywall`, `Nav`) and 55–86 (`Settings`, `EditProfile`). D inserts `ListingFeedback` before `"Listing": {` (base line 96) and C appends inside `Listing`. At least eight unchanged lines (`Errors`) separate A's last hunk from D's insertion, so git merges them cleanly.
- No other file is shared with Stream C or D.

## Stream C — Results view parity and map attribution (branch `stream/c-results`)

### Task C1: Score colour ramp, tint and band

**Files:**
- Create: `src/core/ademe/score-scale.ts`
- Create: `src/core/ademe/score-scale.test.ts`
- Modify: `scripts/boundaries/manifest.mjs` (the `ademe` domain's `public` array only)

**Interfaces:**
- Consumes: nothing.
- Produces (`src/core/ademe/score-scale.ts`):
  ```ts
  export type ScoreBand = 'veryLikely' | 'likely' | 'approximate' | 'uncertain' | 'unreliable';
  export function scoreFromConfidence(confidence: number): number; // 0..1 -> whole 0..100, NaN -> 0
  export function scoreColour(score: number): string;              // 'rgb(r, g, b)', ramp clamped to 52..100
  export function scoreTint(score: number): string;                // colour mixed 86 % toward white
  export function scoreBand(score: number): ScoreBand;             // >=90, >=80, >=70, >=60, below
  ```
  The five French labels are copy, so the band is a key; the UI maps it to `Listing.scoreVeryLikely` … `Listing.scoreUnreliable` (Task C6).

- [ ] **Step 1: Write the failing test**

Create `src/core/ademe/score-scale.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  scoreBand,
  scoreColour,
  scoreFromConfidence,
  scoreTint,
} from './score-scale';

describe('scoreFromConfidence', () => {
  it('reads a confidence as a whole score out of 100', () => {
    expect(scoreFromConfidence(0.724)).toBe(72);
    expect(scoreFromConfidence(1)).toBe(100);
    expect(scoreFromConfidence(0)).toBe(0);
  });

  it('keeps the score between 0 and 100', () => {
    expect(scoreFromConfidence(1.2)).toBe(100);
    expect(scoreFromConfidence(-0.1)).toBe(0);
    expect(scoreFromConfidence(Number.NaN)).toBe(0);
  });
});

describe('scoreColour', () => {
  it('lands exactly on every stop of the ramp', () => {
    expect(scoreColour(100)).toBe('rgb(24, 132, 86)');
    expect(scoreColour(86)).toBe('rgb(90, 175, 96)');
    expect(scoreColour(74)).toBe('rgb(214, 178, 66)');
    expect(scoreColour(64)).toBe('rgb(221, 141, 74)');
    expect(scoreColour(52)).toBe('rgb(196, 92, 79)');
  });

  it('interpolates linearly between two stops', () => {
    expect(scoreColour(93)).toBe('rgb(57, 154, 91)');
    expect(scoreColour(69)).toBe('rgb(218, 160, 70)');
  });

  it('clamps below 52 and above 100', () => {
    expect(scoreColour(30)).toBe(scoreColour(52));
    expect(scoreColour(0)).toBe(scoreColour(52));
    expect(scoreColour(120)).toBe(scoreColour(100));
  });

  it('treats a score that is not a number as the lowest one', () => {
    expect(scoreColour(Number.NaN)).toBe(scoreColour(52));
  });
});

describe('scoreTint', () => {
  it('mixes the colour 86 % toward white', () => {
    expect(scoreTint(100)).toBe('rgb(223, 238, 231)');
    expect(scoreTint(52)).toBe('rgb(247, 232, 230)');
  });

  it('follows the clamped colour', () => {
    expect(scoreTint(10)).toBe(scoreTint(52));
  });
});

describe('scoreBand', () => {
  it('names each band from its lower bound', () => {
    expect(scoreBand(100)).toBe('veryLikely');
    expect(scoreBand(90)).toBe('veryLikely');
    expect(scoreBand(89)).toBe('likely');
    expect(scoreBand(80)).toBe('likely');
    expect(scoreBand(79)).toBe('approximate');
    expect(scoreBand(70)).toBe('approximate');
    expect(scoreBand(69)).toBe('uncertain');
    expect(scoreBand(60)).toBe('uncertain');
    expect(scoreBand(59)).toBe('unreliable');
    expect(scoreBand(0)).toBe('unreliable');
  });

  it('never calls a score that is not a number reliable', () => {
    expect(scoreBand(Number.NaN)).toBe('unreliable');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm vitest run src/core/ademe/score-scale.test.ts
```

Expected: FAIL — `Error: Cannot find module './score-scale' imported from …/src/core/ademe/score-scale.test.ts`.

- [ ] **Step 3: Implement the ramp**

Create `src/core/ademe/score-scale.ts`:

```ts
export type ScoreBand =
  | 'veryLikely'
  | 'likely'
  | 'approximate'
  | 'uncertain'
  | 'unreliable';

type Rgb = readonly [number, number, number];

type RampStop = { score: number; rgb: Rgb };

// why: a data-encoding ramp, like the DPE label colours: the hue carries the
// score itself, so it is exempt from the single accent colour of DESIGN.md.
const RAMP: readonly [RampStop, ...RampStop[]] = [
  { score: 52, rgb: [196, 92, 79] },
  { score: 64, rgb: [221, 141, 74] },
  { score: 74, rgb: [214, 178, 66] },
  { score: 86, rgb: [90, 175, 96] },
  { score: 100, rgb: [24, 132, 86] },
];

const LOWEST_SCORE = 52;
const HIGHEST_SCORE = 100;
const TINT_TOWARD_WHITE = 0.86;

const BANDS: readonly { from: number; band: ScoreBand }[] = [
  { from: 90, band: 'veryLikely' },
  { from: 80, band: 'likely' },
  { from: 70, band: 'approximate' },
  { from: 60, band: 'uncertain' },
];

export function scoreFromConfidence(confidence: number): number {
  if (!Number.isFinite(confidence)) return 0;
  return Math.min(100, Math.max(0, Math.round(confidence * 100)));
}

function clampToRamp(score: number): number {
  if (!Number.isFinite(score)) return LOWEST_SCORE;
  return Math.min(HIGHEST_SCORE, Math.max(LOWEST_SCORE, score));
}

function rampRgb(score: number): Rgb {
  const clamped = clampToRamp(score);
  let lower = RAMP[0];
  for (const upper of RAMP) {
    if (clamped <= upper.score) {
      if (upper.score === lower.score) return upper.rgb;
      const ratio = (clamped - lower.score) / (upper.score - lower.score);
      return [
        lower.rgb[0] + (upper.rgb[0] - lower.rgb[0]) * ratio,
        lower.rgb[1] + (upper.rgb[1] - lower.rgb[1]) * ratio,
        lower.rgb[2] + (upper.rgb[2] - lower.rgb[2]) * ratio,
      ];
    }
    lower = upper;
  }
  return lower.rgb;
}

function css([red, green, blue]: Rgb): string {
  return `rgb(${Math.round(red)}, ${Math.round(green)}, ${Math.round(blue)})`;
}

export function scoreColour(score: number): string {
  return css(rampRgb(score));
}

export function scoreTint(score: number): string {
  const rgb = rampRgb(score);
  return css([
    rgb[0] + (255 - rgb[0]) * TINT_TOWARD_WHITE,
    rgb[1] + (255 - rgb[1]) * TINT_TOWARD_WHITE,
    rgb[2] + (255 - rgb[2]) * TINT_TOWARD_WHITE,
  ]);
}

export function scoreBand(score: number): ScoreBand {
  return BANDS.find(({ from }) => score >= from)?.band ?? 'unreliable';
}
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm vitest run src/core/ademe/score-scale.test.ts
```

Expected: PASS — 1 file, 10 tests.

- [ ] **Step 5: Make the module public to the listing UI**

In `scripts/boundaries/manifest.mjs`, in the `ademe` domain, replace:

```js
      'src/core/ademe/record-facts',
    ],
```

with:

```js
      'src/core/ademe/record-facts',
      'src/core/ademe/score-scale',
    ],
```

(`src/core/ademe/record-facts` appears once in the file, as the last entry of the `ademe` `public` array.)

- [ ] **Step 6: Verify**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm type-check && pnpm lint && pnpm check && pnpm check:boundaries && pnpm test
```

Expected: every command exits 0; biome prints only the warnings that already exist on the base commit (no error); `Domain boundaries OK.`; vitest all green.

- [ ] **Step 7: Commit**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; git add src/core/ademe/score-scale.ts src/core/ademe/score-scale.test.ts scripts/boundaries/manifest.mjs && git commit -m "$(cat <<'EOF'
feat(ademe): score colour ramp, tint and band for the results view

A pure ramp clamped to 52-100 through five stops, its tint 86 % toward
white, the five-band label key, and the confidence-to-score rounding the
cards and the detail panel share.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task C2: IGN orthophoto URL around a trusted point

**Files:**
- Create: `src/core/geo/aerial-image.ts`
- Create: `src/core/geo/aerial-image.test.ts`
- Modify: `scripts/boundaries/manifest.mjs` (the `geo` domain's `public` array only)

**Interfaces:**
- Consumes: `GeoPoint` from `src/core/geo/types.ts` (unchanged).
- Produces (`src/core/geo/aerial-image.ts`): `export function aerialImageUrl(point: GeoPoint): string;` — a WMS 1.3.0 `GetMap` URL on `https://data.geopf.fr/wms-r/wms`, layer `ORTHOIMAGERY.ORTHOPHOTOS`, `CRS=EPSG:3857`, 600 × 600 px JPEG, `BBOX` = ±40 ground metres around the point.

Research, 2026-09-26: the Géoplateforme raster WMS capabilities list `ORTHOIMAGERY.ORTHOPHOTOS` in `EPSG:3857`; the Lyon 3e box asserted in the test returned HTTP 200 `image/jpeg` (42 233 bytes, the orthophoto of rue Lavoisier), also with the parameters URL-encoded as `URLSearchParams` writes them; ten parallel requests all answered 200. EPSG:3857 axis order is easting, northing, so `BBOX=minX,minY,maxX,maxY`. Web Mercator stretches distances by `1 / cos(latitude)`, so ±40 m on the ground is `±40 / cos(lat)` projected metres; the box stays square, as does the 600 px image, which keeps pixels square. Outside imagery coverage the service answers a blank image, not an error — only trusted points (métropole) reach it.

- [ ] **Step 1: Write the failing test**

Create `src/core/geo/aerial-image.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { aerialImageUrl } from './aerial-image';

const LAVOISIER = { latitude: 45.755599, longitude: 4.858685 };

function bboxOf(href: string): number[] {
  const bbox = new URL(href).searchParams.get('BBOX');
  if (bbox === null) throw new Error('no BBOX in the URL');
  return bbox.split(',').map(Number);
}

describe('aerialImageUrl', () => {
  it('asks the Géoplateforme raster WMS for a 600 px orthophoto in Web Mercator', () => {
    const url = new URL(aerialImageUrl(LAVOISIER));
    expect(url.origin + url.pathname).toBe('https://data.geopf.fr/wms-r/wms');
    expect(url.searchParams.get('SERVICE')).toBe('WMS');
    expect(url.searchParams.get('VERSION')).toBe('1.3.0');
    expect(url.searchParams.get('REQUEST')).toBe('GetMap');
    expect(url.searchParams.get('LAYERS')).toBe('ORTHOIMAGERY.ORTHOPHOTOS');
    expect(url.searchParams.get('STYLES')).toBe('');
    expect(url.searchParams.get('CRS')).toBe('EPSG:3857');
    expect(url.searchParams.get('WIDTH')).toBe('600');
    expect(url.searchParams.get('HEIGHT')).toBe('600');
    expect(url.searchParams.get('FORMAT')).toBe('image/jpeg');
  });

  // why: at the equator Web Mercator metres are ground metres, so the box
  // reads directly as ±40 m around the origin.
  it('frames ±40 m around a point on the equator', () => {
    expect(
      new URL(aerialImageUrl({ latitude: 0, longitude: 0 })).searchParams.get(
        'BBOX',
      ),
    ).toBe('-40.00,-40.00,40.00,40.00');
  });

  // why: this box was requested live on 2026-09-26 and returned the
  // orthophoto of 16 rue Lavoisier, Lyon 3e.
  it('projects the trusted point and frames it with a square box', () => {
    expect(new URL(aerialImageUrl(LAVOISIER)).searchParams.get('BBOX')).toBe(
      '540809.01,5741212.59,540923.67,5741327.25',
    );
  });

  // why: Web Mercator stretches distances by 1 / cos(latitude); at 60° N,
  // 80 m on the ground spans 160 projected metres.
  it('widens the projected box with latitude so the ground stays 80 m wide', () => {
    const [minX = 0, minY = 0, maxX = 0, maxY = 0] = bboxOf(
      aerialImageUrl({ latitude: 60, longitude: 10 }),
    );
    expect(maxX - minX).toBeCloseTo(160, 1);
    expect(maxY - minY).toBeCloseTo(160, 1);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm vitest run src/core/geo/aerial-image.test.ts
```

Expected: FAIL — `Error: Cannot find module './aerial-image' imported from …/src/core/geo/aerial-image.test.ts`.

- [ ] **Step 3: Implement the URL builder**

Create `src/core/geo/aerial-image.ts`:

```ts
import type { GeoPoint } from './types';

// why: the IGN Géoplateforme raster WMS is free and keyless; its
// ORTHOIMAGERY.ORTHOPHOTOS layer is the national aerial photography.
const WMS_ENDPOINT = 'https://data.geopf.fr/wms-r/wms';
const ORTHOPHOTO_LAYER = 'ORTHOIMAGERY.ORTHOPHOTOS';
const IMAGE_SIZE_PX = 600;
const HALF_EXTENT_M = 40;
const WEB_MERCATOR_RADIUS_M = 6_378_137;

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function webMercator(point: GeoPoint): { x: number; y: number } {
  return {
    x: WEB_MERCATOR_RADIUS_M * radians(point.longitude),
    y:
      WEB_MERCATOR_RADIUS_M *
      Math.log(Math.tan(Math.PI / 4 + radians(point.latitude) / 2)),
  };
}

// why: Web Mercator (EPSG:3857) stretches every distance by 1 / cos(latitude),
// so ±40 m on the ground is ±40 / cos(latitude) projected metres. The box is
// square and so is the image, which keeps its pixels square.
export function aerialImageUrl(point: GeoPoint): string {
  const { x, y } = webMercator(point);
  const half = HALF_EXTENT_M / Math.cos(radians(point.latitude));
  const bbox = [x - half, y - half, x + half, y + half]
    .map((value) => value.toFixed(2))
    .join(',');
  const query = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetMap',
    LAYERS: ORTHOPHOTO_LAYER,
    STYLES: '',
    CRS: 'EPSG:3857',
    BBOX: bbox,
    WIDTH: String(IMAGE_SIZE_PX),
    HEIGHT: String(IMAGE_SIZE_PX),
    FORMAT: 'image/jpeg',
  });
  return `${WMS_ENDPOINT}?${query.toString()}`;
}
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm vitest run src/core/geo/aerial-image.test.ts
```

Expected: PASS — 1 file, 4 tests.

- [ ] **Step 5: Make the module public to the listing UI**

In `scripts/boundaries/manifest.mjs`, in the `geo` domain's `public` array, replace:

```js
      'src/core/geo/outbound-links',
```

with:

```js
      'src/core/geo/outbound-links',
      'src/core/geo/aerial-image',
```

- [ ] **Step 6: Verify**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm type-check && pnpm lint && pnpm check && pnpm check:boundaries && pnpm test
```

Expected: every command exits 0; biome shows only the pre-existing warnings; `Domain boundaries OK.`; vitest all green.

- [ ] **Step 7: Commit**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; git add src/core/geo/aerial-image.ts src/core/geo/aerial-image.test.ts scripts/boundaries/manifest.mjs && git commit -m "$(cat <<'EOF'
feat(geo): IGN orthophoto URL around a trusted point

A Géoplateforme WMS GetMap of ORTHOIMAGERY.ORTHOPHOTOS, 600 px square,
framing ±40 ground metres in Web Mercator: the photo a result shows when
Street View has no panorama or no key.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task C3: Villederêve replaces the INSEE link

**Files:**
- Modify: `src/core/geo/outbound-links.ts`
- Modify: `src/core/geo/outbound-links.test.ts`
- Modify: `src/app/(app)/dashboard/components/listing/result-detail-panel.tsx`
- Modify: `src/i18n/messages/en.json`, `src/i18n/messages/fr.json` (namespace `Listing` only)

**Interfaces:**
- Consumes: `wellFormedInseeCode` (private, unchanged) in `outbound-links.ts`.
- Produces: `export function villedereveCommuneUrl(inseeCode: string): string | null;` — `https://villedereve.fr/ville/{code}`; 69381–69389 → `69123`, 75101–75120 → `75056`, 13201–13216 → `13055`; trims and uppercases (Corsica `2A004`); `null` for a malformed code.
- Removes: `inseeCommuneUrl` (its only caller is the detail panel, switched here) and the i18n keys `Listing.linkInsee`, `Listing.linkInseeHint`.

- [ ] **Step 1: Replace the INSEE tests with Villederêve tests**

In `src/core/geo/outbound-links.test.ts`, replace:

```ts
  googleMapsUrl,
  inseeCommuneUrl,
} from './outbound-links';
```

with:

```ts
  googleMapsUrl,
  villedereveCommuneUrl,
} from './outbound-links';
```

Then replace the whole block at the end of the file:

```ts
describe('inseeCommuneUrl', () => {
  it('opens the arrondissement dossier with its own code', () => {
    expect(inseeCommuneUrl('69383')).toBe(
      'https://www.insee.fr/fr/statistiques/2011101?geo=COM-69383',
    );
  });

  // why: INSEE answers HTTP 500 to COM-2a004; only the uppercase code works.
  it('uppercases and trims a Corsican code', () => {
    expect(inseeCommuneUrl(' 2a004 ')).toBe(
      'https://www.insee.fr/fr/statistiques/2011101?geo=COM-2A004',
    );
  });

  it('gives no link for a code that is not five characters', () => {
    expect(inseeCommuneUrl('2A04')).toBeNull();
    expect(inseeCommuneUrl('693830')).toBeNull();
    expect(inseeCommuneUrl('')).toBeNull();
  });
});
```

with:

```ts
describe('villedereveCommuneUrl', () => {
  it('opens the commune page by its INSEE code', () => {
    expect(villedereveCommuneUrl('33063')).toBe(
      'https://villedereve.fr/ville/33063',
    );
  });

  // why: villedereve has no arrondissement pages, so Lyon 3e, Paris 15e and
  // Marseille 1er open their commune.
  it('opens the parent commune of a municipal arrondissement', () => {
    expect(villedereveCommuneUrl('69381')).toBe(
      'https://villedereve.fr/ville/69123',
    );
    expect(villedereveCommuneUrl('69383')).toBe(
      'https://villedereve.fr/ville/69123',
    );
    expect(villedereveCommuneUrl('69389')).toBe(
      'https://villedereve.fr/ville/69123',
    );
    expect(villedereveCommuneUrl('75101')).toBe(
      'https://villedereve.fr/ville/75056',
    );
    expect(villedereveCommuneUrl('75115')).toBe(
      'https://villedereve.fr/ville/75056',
    );
    expect(villedereveCommuneUrl('75120')).toBe(
      'https://villedereve.fr/ville/75056',
    );
    expect(villedereveCommuneUrl('13201')).toBe(
      'https://villedereve.fr/ville/13055',
    );
    expect(villedereveCommuneUrl('13216')).toBe(
      'https://villedereve.fr/ville/13055',
    );
  });

  it('keeps a neighbouring code that is not an arrondissement', () => {
    expect(villedereveCommuneUrl('69380')).toBe(
      'https://villedereve.fr/ville/69380',
    );
    expect(villedereveCommuneUrl('75121')).toBe(
      'https://villedereve.fr/ville/75121',
    );
    expect(villedereveCommuneUrl('13217')).toBe(
      'https://villedereve.fr/ville/13217',
    );
  });

  it('uppercases and trims a Corsican code', () => {
    expect(villedereveCommuneUrl(' 2a004 ')).toBe(
      'https://villedereve.fr/ville/2A004',
    );
  });

  it('gives no link for a code that is not five characters', () => {
    expect(villedereveCommuneUrl('2A04')).toBeNull();
    expect(villedereveCommuneUrl('693830')).toBeNull();
    expect(villedereveCommuneUrl('')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm vitest run src/core/geo/outbound-links.test.ts
```

Expected: FAIL — the five `villedereveCommuneUrl` tests fail with `TypeError: villedereveCommuneUrl is not a function`; the six other tests pass.

- [ ] **Step 3: Implement the Villederêve link**

In `src/core/geo/outbound-links.ts`, replace:

```ts
// why: INSEE and DVF answer an error page to a lowercase Corsican code or a
// malformed one, so a link is only built from a well-formed code.
```

with:

```ts
// why: DVF answers an error page to a lowercase Corsican code or a malformed
// one, so a link is only built from a well-formed code.
```

Then replace:

```ts
export function inseeCommuneUrl(inseeCode: string): string | null {
  const code = wellFormedInseeCode(inseeCode);
  if (code === null) return null;
  return `https://www.insee.fr/fr/statistiques/2011101?geo=COM-${code}`;
}
```

with:

```ts
// why: villedereve has no page for a municipal arrondissement, only for the
// commune that holds it (Lyon, Paris, Marseille).
const MUNICIPAL_ARRONDISSEMENTS = [
  { first: 69381, last: 69389, commune: '69123' },
  { first: 75101, last: 75120, commune: '75056' },
  { first: 13201, last: 13216, commune: '13055' },
] as const;

function communeOf(code: string): string {
  const numeric = Number(code);
  return (
    MUNICIPAL_ARRONDISSEMENTS.find(
      ({ first, last }) => numeric >= first && numeric <= last,
    )?.commune ?? code
  );
}

export function villedereveCommuneUrl(inseeCode: string): string | null {
  const code = wellFormedInseeCode(inseeCode);
  if (code === null) return null;
  return `https://villedereve.fr/ville/${communeOf(code)}`;
}
```

(`Number('2A004')` is `NaN`, so a Corsican code never falls in a range and is kept.)

- [ ] **Step 4: Run the test and watch it pass**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm vitest run src/core/geo/outbound-links.test.ts
```

Expected: PASS — 1 file, 11 tests.

- [ ] **Step 5: Point the detail panel at Villederêve**

In `src/app/(app)/dashboard/components/listing/result-detail-panel.tsx`, replace:

```tsx
  ArrowUpRight,
  BarChart3,
  Check,
```

with:

```tsx
  ArrowUpRight,
  Building2,
  Check,
```

Replace:

```tsx
  googleMapsUrl,
  inseeCommuneUrl,
} from '@/core/geo/outbound-links';
```

with:

```tsx
  googleMapsUrl,
  villedereveCommuneUrl,
} from '@/core/geo/outbound-links';
```

Replace:

```tsx
          {
            href: inseeCommuneUrl(record.inseeCode),
            title: t('linkInsee'),
            hint: t('linkInseeHint'),
            icon: BarChart3,
          },
```

with:

```tsx
          {
            href: villedereveCommuneUrl(record.inseeCode),
            title: t('linkVilledereve'),
            hint: t('linkVilledereveHint'),
            icon: Building2,
          },
```

- [ ] **Step 6: Swap the link copy**

In `src/i18n/messages/en.json`, replace:

```json
    "linkDvfHint": "Past sale prices",
    "linkInsee": "INSEE",
    "linkInseeHint": "Commune statistics",
    "mapRegionLabel": "Map"
  }
}
```

with:

```json
    "linkDvfHint": "Past sale prices",
    "mapRegionLabel": "Map",
    "linkVilledereve": "Villederêve",
    "linkVilledereveHint": "Life in the commune"
  }
}
```

In `src/i18n/messages/fr.json`, replace:

```json
    "linkDvfHint": "Prix des ventes",
    "linkInsee": "INSEE",
    "linkInseeHint": "Chiffres de la commune",
    "mapRegionLabel": "Carte"
  }
}
```

with:

```json
    "linkDvfHint": "Prix des ventes",
    "mapRegionLabel": "Carte",
    "linkVilledereve": "Villederêve",
    "linkVilledereveHint": "Vie de la commune"
  }
}
```

- [ ] **Step 7: Verify**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; grep -rn "inseeCommuneUrl\|linkInsee" src; pnpm type-check && pnpm lint && pnpm check && pnpm check:boundaries && pnpm test
```

Expected: `grep` prints nothing; every command exits 0; biome shows only the pre-existing warnings.

- [ ] **Step 8: Commit**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; git add src/core/geo/outbound-links.ts src/core/geo/outbound-links.test.ts "src/app/(app)/dashboard/components/listing/result-detail-panel.tsx" src/i18n/messages/en.json src/i18n/messages/fr.json && git commit -m "$(cat <<'EOF'
feat(geo): Villederêve commune link replaces the INSEE dossier

Municipal arrondissements of Lyon, Paris and Marseille open their parent
commune, since villedereve has no arrondissement pages; a Corsican code is
uppercased and a malformed one gives no link.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task C4: Listing display URL without tracking parameters

**Files:**
- Modify: `src/core/listing/listing-summary.ts` (full replacement)
- Modify: `src/core/listing/listing-summary.test.ts` (full replacement)

**Interfaces:**
- Consumes: nothing.
- Produces: `export function listingDisplayUrl(canonicalUrl: string): string | null;` — host without `www.` + path without trailing slash + the query string minus `utm_*`, `gclid`, `fbclid`, `msclkid`, `mc_*` (case-insensitive); never the fragment; `null` for an unparsable URL. Until now it dropped the whole query; a parameter that selects the listing (`?page=2`) is now kept.

- [ ] **Step 1: Write the failing test**

Replace the whole content of `src/core/listing/listing-summary.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { listingDisplayUrl } from './listing-summary';

describe('listingDisplayUrl', () => {
  it('shows the host without www and the path', () => {
    expect(
      listingDisplayUrl(
        'https://www.leboncoin.fr/ad/ventes_immobilieres/3271621783',
      ),
    ).toBe('leboncoin.fr/ad/ventes_immobilieres/3271621783');
  });

  it('drops a trailing slash, the tracking parameters and the fragment', () => {
    expect(
      listingDisplayUrl(
        'https://www.pap.fr/annonces/r465201632/?utm_source=x&gclid=1#top',
      ),
    ).toBe('pap.fr/annonces/r465201632');
  });

  it('strips every tracking parameter, whatever its case', () => {
    expect(
      listingDisplayUrl(
        'https://www.seloger.com/annonces/achat/x/2639Z8NG95GB?utm_medium=cpc&utm_campaign=spring&fbclid=a&msclkid=b&mc_cid=c&mc_eid=d&UTM_SOURCE=e&GCLID=f',
      ),
    ).toBe('seloger.com/annonces/achat/x/2639Z8NG95GB');
  });

  it('keeps a parameter that selects the listing', () => {
    expect(
      listingDisplayUrl(
        'https://www.pap.fr/annonces/r465201632?page=2&utm_source=x',
      ),
    ).toBe('pap.fr/annonces/r465201632?page=2');
  });

  it('shows the host alone for a bare domain', () => {
    expect(listingDisplayUrl('https://www.seloger.com/')).toBe('seloger.com');
  });

  it('has nothing to show for a URL it cannot parse', () => {
    expect(listingDisplayUrl('not a url')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm vitest run src/core/listing/listing-summary.test.ts
```

Expected: FAIL — `keeps a parameter that selects the listing`: `expected 'pap.fr/annonces/r465201632' to be 'pap.fr/annonces/r465201632?page=2'`; the five other tests pass (the old code dropped every parameter).

- [ ] **Step 3: Implement the stripping**

Replace the whole content of `src/core/listing/listing-summary.ts` with:

```ts
const TRACKING_PARAMS = new Set(['gclid', 'fbclid', 'msclkid']);
const TRACKING_PARAM_PREFIXES = ['utm_', 'mc_'];

function isTrackingParam(name: string): boolean {
  const key = name.toLowerCase();
  return (
    TRACKING_PARAMS.has(key) ||
    TRACKING_PARAM_PREFIXES.some((prefix) => key.startsWith(prefix))
  );
}

// why: the display URL names the listing, not the campaign that led to it;
// a parameter that selects the listing (a page, an id) stays.
export function listingDisplayUrl(canonicalUrl: string): string | null {
  if (!URL.canParse(canonicalUrl)) return null;
  const url = new URL(canonicalUrl);
  const host = url.hostname.replace(/^www\./, '');
  const path = url.pathname.replace(/\/+$/, '');
  const query = new URLSearchParams(
    [...url.searchParams].filter(([name]) => !isTrackingParam(name)),
  ).toString();
  return query.length > 0 ? `${host}${path}?${query}` : `${host}${path}`;
}
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm vitest run src/core/listing/listing-summary.test.ts
```

Expected: PASS — 1 file, 6 tests.

- [ ] **Step 5: Verify**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm type-check && pnpm lint && pnpm check && pnpm check:boundaries && pnpm test
```

Expected: every command exits 0.

- [ ] **Step 6: Commit**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; git add src/core/listing/listing-summary.ts src/core/listing/listing-summary.test.ts && git commit -m "$(cat <<'EOF'
feat(listing): display URL keeps the listing, drops the tracking

utm_*, gclid, fbclid, msclkid and mc_* are stripped whatever their case;
a parameter that selects the listing stays, and the fragment never shows.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task C5: Fact agreement on type and surface, copyable address

**Files:**
- Modify: `src/core/ademe/record-facts.ts` (full replacement)
- Modify: `src/core/ademe/record-facts.test.ts`
- Modify: `src/app/(app)/dashboard/components/listing/result-detail-panel.tsx`

**Interfaces:**
- Consumes: `DpeRecord` (`src/core/ademe/types.ts`), `ExtractedValues` (`src/core/listing/types.ts`), both unchanged.
- Produces (`src/core/ademe/record-facts.ts`, other exports unchanged):
  ```ts
  export type FactAgreement = Record<'propertyType' | 'surfaceM2' | 'yearBuilt' | 'heatingEnergy' | 'floor', boolean>;
  export function factAgreement(
    record: Pick<DpeRecord, 'propertyType' | 'surfaceM2' | 'yearBuilt' | 'heatingEnergy' | 'floor'>,
    listing: Pick<ExtractedValues, 'propertyType' | 'surfaceM2' | 'yearBuilt' | 'heatingEnergy' | 'floor'>,
  ): FactAgreement; // type: equal; surface: |listing - record| <= 1 m²; the rest unchanged
  export function copyableAddress(
    record: Pick<DpeRecord, 'address' | 'street' | 'streetNumber' | 'postalCode' | 'city'>,
  ): string; // "{street line}, {postalCode} {city}", nulls dropped; the full address when the street is unknown
  ```
  `shownDpeDate`, `reliableFloor`, `streetLine`, `placeLine` keep their signatures.

- [ ] **Step 1: Write the failing tests**

In `src/core/ademe/record-facts.test.ts`, replace:

```ts
import {
  factAgreement,
  placeLine,
```

with:

```ts
import {
  copyableAddress,
  factAgreement,
  placeLine,
```

Then replace:

```ts
describe('factAgreement', () => {
  const listing = {
    yearBuilt: 1990,
    heatingEnergy: 'gas' as const,
    floor: 3,
  };
  const record = {
    yearBuilt: 1990,
    heatingEnergy: 'gas' as const,
    floor: 3,
  };

  it('agrees on every fact that exactly equals the listing', () => {
    expect(factAgreement(record, listing)).toEqual({
      yearBuilt: true,
      heatingEnergy: true,
      floor: true,
    });
  });
```

with:

```ts
describe('copyableAddress', () => {
  it('joins the street line and the place with a comma', () => {
    expect(
      copyableAddress({
        address: '16 Rue Lavoisier 69003 Lyon',
        streetNumber: '16',
        street: 'Rue Lavoisier',
        postalCode: '69003',
        city: 'Lyon',
      }),
    ).toBe('16 Rue Lavoisier, 69003 Lyon');
  });

  it('keeps what is known of the place', () => {
    expect(
      copyableAddress({
        address: '16 Rue Lavoisier Lyon',
        streetNumber: '16',
        street: 'Rue Lavoisier',
        postalCode: null,
        city: 'Lyon',
      }),
    ).toBe('16 Rue Lavoisier, Lyon');
  });

  it('copies the street line alone when the place is unknown', () => {
    expect(
      copyableAddress({
        address: '16 Rue Lavoisier',
        streetNumber: '16',
        street: 'Rue Lavoisier',
        postalCode: null,
        city: null,
      }),
    ).toBe('16 Rue Lavoisier');
  });

  // why: the full address already ends with the postal code and the city;
  // appending them again would copy them twice.
  it('copies the full address as it is when the street is unknown', () => {
    expect(
      copyableAddress({
        address: '16 Rue Lavoisier 69003 Lyon',
        streetNumber: '16',
        street: null,
        postalCode: '69003',
        city: 'Lyon',
      }),
    ).toBe('16 Rue Lavoisier 69003 Lyon');
  });
});

describe('factAgreement', () => {
  const listing = {
    propertyType: 'apartment' as const,
    surfaceM2: 63,
    yearBuilt: 1990,
    heatingEnergy: 'gas' as const,
    floor: 3,
  };
  const record = {
    propertyType: 'apartment' as const,
    surfaceM2: 63,
    yearBuilt: 1990,
    heatingEnergy: 'gas' as const,
    floor: 3,
  };

  it('agrees on every fact that exactly equals the listing', () => {
    expect(factAgreement(record, listing)).toEqual({
      propertyType: true,
      surfaceM2: true,
      yearBuilt: true,
      heatingEnergy: true,
      floor: true,
    });
  });

  it('disagrees on a different property type', () => {
    expect(
      factAgreement({ ...record, propertyType: 'house' }, listing).propertyType,
    ).toBe(false);
  });

  it('disagrees on a property type the record does not know', () => {
    expect(
      factAgreement({ ...record, propertyType: null }, listing).propertyType,
    ).toBe(false);
  });

  it('agrees on a surface up to 1 m² away, on either side', () => {
    expect(factAgreement({ ...record, surfaceM2: 62 }, listing).surfaceM2).toBe(
      true,
    );
    expect(factAgreement({ ...record, surfaceM2: 64 }, listing).surfaceM2).toBe(
      true,
    );
    expect(
      factAgreement(
        { ...record, surfaceM2: 62.9 },
        { ...listing, surfaceM2: 63.9 },
      ).surfaceM2,
    ).toBe(true);
  });

  it('disagrees on a surface more than 1 m² away', () => {
    expect(
      factAgreement({ ...record, surfaceM2: 64.05 }, listing).surfaceM2,
    ).toBe(false);
    expect(
      factAgreement({ ...record, surfaceM2: 61.5 }, listing).surfaceM2,
    ).toBe(false);
  });

  it('disagrees on a surface either side does not know', () => {
    expect(
      factAgreement({ ...record, surfaceM2: null }, listing).surfaceM2,
    ).toBe(false);
    expect(
      factAgreement(record, { ...listing, surfaceM2: null }).surfaceM2,
    ).toBe(false);
  });
```

The four existing `factAgreement` tests after that block (`disagrees on a year built one year apart` … `never agrees on a floor of 0, the ADEME default`) stay as they are; they spread `record`/`listing`, which now carry the two new fields.

- [ ] **Step 2: Run them and watch them fail**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm vitest run src/core/ademe/record-facts.test.ts
```

Expected: FAIL — 10 tests: the four `copyableAddress` tests with `TypeError: copyableAddress is not a function`, `agrees on every fact…` with `expected { yearBuilt: true, …(2) } to deeply equal { propertyType: true, …(4) }`, and the five new type/surface tests with `expected undefined to be …`.

- [ ] **Step 3: Implement**

Replace the whole content of `src/core/ademe/record-facts.ts` with:

```ts
import type { ExtractedValues } from '@/core/listing/types';
import type { DpeRecord } from './types';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function streetLine(
  record: Pick<DpeRecord, 'address' | 'street' | 'streetNumber'>,
): string {
  if (record.street === null) return record.address;
  return [record.streetNumber, record.street]
    .filter((part) => part !== null)
    .join(' ');
}

export function placeLine(
  record: Pick<DpeRecord, 'postalCode' | 'city'>,
): string | null {
  const place = [record.postalCode, record.city]
    .filter((part) => part !== null)
    .join(' ');
  return place.length > 0 ? place : null;
}

// why: ADEME stores 0 as a default floor on most rows, so only a floor of 1
// or more is a real reading.
export function reliableFloor(record: Pick<DpeRecord, 'floor'>): number | null {
  const { floor } = record;
  return floor !== null && Number.isInteger(floor) && floor >= 1 ? floor : null;
}

function parseStrictIsoDate(value: string): Date | null {
  if (!ISO_DATE.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  // why: invalid month/day (e.g., 2023-13-01) produce an Invalid Date that
  // throws on toISOString(). Check NaN first.
  if (Number.isNaN(date.getTime())) return null;
  // why: `new Date` rolls 2023-02-30 over to March 2 instead of failing.
  return date.toISOString().slice(0, 10) === value ? date : null;
}

// why: a ✓ must never sit next to a value the listing does not itself print.
// `matched` (score-candidates.ts) means a signal scored above zero, which the
// DPE date does within a 3-day window — too loose to claim exact agreement.
// This reads the date actually shown against the listing's own value instead.
export function shownDpeDate(
  record: Pick<DpeRecord, 'establishedOn' | 'visitedOn'>,
  listedDpeDate: string | null,
): { date: Date; agrees: boolean } | null {
  const agrees =
    listedDpeDate !== null &&
    (record.establishedOn === listedDpeDate ||
      record.visitedOn === listedDpeDate);
  // why: when both register dates equal the listed one, establishedOn is
  // preferred; when only one matches, listedDpeDate equals that one's value.
  const shownValue = agrees ? listedDpeDate : record.establishedOn;
  const date = shownValue === null ? null : parseStrictIsoDate(shownValue);
  return date === null ? null : { date, agrees };
}

export function copyableAddress(
  record: Pick<
    DpeRecord,
    'address' | 'street' | 'streetNumber' | 'postalCode' | 'city'
  >,
): string {
  // why: without a parsed street, the full address already carries the
  // postal code and the city.
  if (record.street === null) return record.address;
  const place = placeLine(record);
  const street = streetLine(record);
  return place === null ? street : `${street}, ${place}`;
}

type AgreementFields =
  | 'propertyType'
  | 'surfaceM2'
  | 'yearBuilt'
  | 'heatingEnergy'
  | 'floor';

export type FactAgreement = Record<AgreementFields, boolean>;

const SURFACE_AGREEMENT_M2 = 1;

// why: 63.9 - 62.9 is 1.0000000000000142 in floating point, so the gap is
// compared in whole hundredths of a square metre.
function surfacesAgree(record: number | null, listing: number | null): boolean {
  return (
    record !== null &&
    listing !== null &&
    Math.round(Math.abs(listing - record) * 100) <= SURFACE_AGREEMENT_M2 * 100
  );
}

// why: CLAUDE.md — a wrong address costs more than no address, so a tile's
// checkmark must mean the shown value equals the listing's own value (the
// surface within 1 m²), never "scored above zero" (a hard-filter signal like
// surface always does).
export function factAgreement(
  record: Pick<DpeRecord, AgreementFields>,
  listing: Pick<ExtractedValues, AgreementFields>,
): FactAgreement {
  const floor = reliableFloor(record);
  return {
    propertyType:
      record.propertyType !== null &&
      listing.propertyType !== null &&
      record.propertyType === listing.propertyType,
    surfaceM2: surfacesAgree(record.surfaceM2, listing.surfaceM2),
    yearBuilt:
      record.yearBuilt !== null &&
      listing.yearBuilt !== null &&
      record.yearBuilt === listing.yearBuilt,
    heatingEnergy:
      record.heatingEnergy !== null &&
      listing.heatingEnergy !== null &&
      record.heatingEnergy === listing.heatingEnergy,
    floor: floor !== null && listing.floor !== null && floor === listing.floor,
  };
}
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm vitest run src/core/ademe/record-facts.test.ts
```

Expected: PASS — 1 file, 30 tests.

- [ ] **Step 5: Give the type and surface tiles their ✓**

In `src/app/(app)/dashboard/components/listing/result-detail-panel.tsx`, replace:

```tsx
type DetailListing = Pick<
  ExtractedValues,
  'yearBuilt' | 'heatingEnergy' | 'floor' | 'dpeDate'
>;
```

with:

```tsx
type DetailListing = Pick<
  ExtractedValues,
  | 'propertyType'
  | 'surfaceM2'
  | 'yearBuilt'
  | 'heatingEnergy'
  | 'floor'
  | 'dpeDate'
>;
```

Replace:

```tsx
  // why: type and surface are search filters, not evidence (CLAUDE.md) — a
  // signal already used to narrow the candidate pool discriminates nothing,
  // so their tiles never carry a ✓.
  const facts: Fact[] = [
```

with:

```tsx
  const facts: Fact[] = [
```

Replace:

```tsx
              ? t('addressPropertyApartment')
              : t('addressPropertyHouse'),
          agrees: false,
        },
```

with:

```tsx
              ? t('addressPropertyApartment')
              : t('addressPropertyHouse'),
          agrees: agreement.propertyType,
        },
```

Replace:

```tsx
              maximumFractionDigits: 1,
            }),
          }),
          agrees: false,
        },
```

with:

```tsx
              maximumFractionDigits: 1,
            }),
          }),
          agrees: agreement.surfaceM2,
        },
```

(`ResultsWorkspace` already passes `listing.fields`, a `ListingFields`, which carries both new fields.)

- [ ] **Step 6: Verify**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm type-check && pnpm lint && pnpm check && pnpm check:boundaries && pnpm test
```

Expected: every command exits 0.

- [ ] **Step 7: Commit**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; git add src/core/ademe/record-facts.ts src/core/ademe/record-facts.test.ts "src/app/(app)/dashboard/components/listing/result-detail-panel.tsx" && git commit -m "$(cat <<'EOF'
feat(ademe): type and surface agreement, copyable address

The type tile agrees when it equals the listing's, the surface tile when
it is within 1 m² (compared in hundredths, so float noise never drops an
exact 1 m² gap). copyableAddress writes "{street}, {postal code} {city}".

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task C6: Candidate cards with photo fallback and score colour

**Files:**
- Create: `src/app/(app)/dashboard/components/listing/score-style.ts`
- Create: `src/app/(app)/dashboard/components/listing/use-candidate-photo.ts`
- Modify: `src/app/(app)/dashboard/components/listing/address-candidate-list.tsx` (full replacement)
- Modify: `src/app/(app)/dashboard/components/listing/results-workspace.tsx`
- Modify: `src/i18n/messages/en.json`, `src/i18n/messages/fr.json` (namespace `Listing` only)

**Interfaces:**
- Consumes: `scoreColour`, `scoreTint`, `scoreBand`, `scoreFromConfidence`, `ScoreBand` (Task C1); `aerialImageUrl` (Task C2); `streetViewImagePath(point: GeoPoint): string` (`src/core/street-view/links.ts`, unchanged); `reliableFloor`, `streetLine` (`record-facts`).
- Produces:
  ```ts
  // score-style.ts
  export type ScoreStyle = CSSProperties & { '--score': string; '--score-tint': string };
  export function scoreStyle(score: number): ScoreStyle;
  export const SCORE_LABEL_KEY: { veryLikely: 'scoreVeryLikely'; likely: 'scoreLikely'; approximate: 'scoreApproximate'; uncertain: 'scoreUncertain'; unreliable: 'scoreUnreliable' };
  // use-candidate-photo.ts
  export type CandidatePhoto =
    | { kind: 'street-view'; src: string; point: GeoPoint }
    | { kind: 'aerial'; src: string }
    | { kind: 'none' };
  export function useCandidatePhoto(input: { point: GeoPoint | null; streetViewEnabled: boolean }): { photo: CandidatePhoto; onPhotoError: () => void };
  // address-candidate-list.tsx
  export function AddressCandidateList(props: {
    candidates: readonly AddressCandidate[];
    selectedDpeNumber: string | null; // was shownDpeNumber: the shown result while its detail is open, else null
    onSelect: (dpeNumber: string) => void;
    streetViewEnabled: boolean;
  }): React.ReactElement | null;
  ```

Behaviour (spec §5): photo 172 px, Street View first, then the IGN orthophoto (chip "Satellite") when Street View is disabled or its image fails (no panorama within 50 m), and a house-icon placeholder when there is no trusted point or both images fail — never a photo without a trusted point. Rank circle and `{score}/100` pill sit on the photo in the score colour; without a photo they sit in the header. Body: street line (semibold when selected), score bar in the score colour on a tinted track, meta line `{city} · {type} · {surface} m²` + `Étage {n}` only for an ADEME floor ≥ 1 + `Terrain {x} m²` + `Construit(e) en {year}`. Only the top card carries the "Vérifier cette adresse →" call to action; it is part of the card's one button, so Enter on the card or a click on it opens the detail (no nested interactive element). The selected card gets a ring and a tinted background in the score colour; while one is selected the others drop to 60 % opacity from `lg` up. "Selected" is the shown result while its detail is open: with the detail closed no card is ringed or dimmed.

The score colour is data computed per result, so it reaches Tailwind through the CSS variables `--score` and `--score-tint` set on the card (`bg-(--score)`, `ring-(--score)`, `bg-(--score-tint)`); the bar's track is `bg-(--score)/20` so it stays visible on the tinted selected card.

- [ ] **Step 1: Add the score style helper**

Create `src/app/(app)/dashboard/components/listing/score-style.ts`:

```ts
import type { CSSProperties } from 'react';
import {
  type ScoreBand,
  scoreColour,
  scoreTint,
} from '@/core/ademe/score-scale';

export type ScoreStyle = CSSProperties & {
  '--score': string;
  '--score-tint': string;
};

// why: the ramp colour is computed per result, so it reaches Tailwind as CSS
// variables (bg-(--score), ring-(--score)) rather than as class names.
export function scoreStyle(score: number): ScoreStyle {
  return { '--score': scoreColour(score), '--score-tint': scoreTint(score) };
}

export const SCORE_LABEL_KEY = {
  veryLikely: 'scoreVeryLikely',
  likely: 'scoreLikely',
  approximate: 'scoreApproximate',
  uncertain: 'scoreUncertain',
  unreliable: 'scoreUnreliable',
} as const satisfies Record<ScoreBand, string>;
```

- [ ] **Step 2: Add the photo source hook**

Create `src/app/(app)/dashboard/components/listing/use-candidate-photo.ts`:

```ts
'use client';

import { useState } from 'react';
import { aerialImageUrl } from '@/core/geo/aerial-image';
import type { GeoPoint } from '@/core/geo/types';
import { streetViewImagePath } from '@/core/street-view/links';

export type CandidatePhoto =
  | { kind: 'street-view'; src: string; point: GeoPoint }
  | { kind: 'aerial'; src: string }
  | { kind: 'none' };

type PhotoSource = Exclude<CandidatePhoto, { kind: 'none' }>;

const NO_PHOTO: CandidatePhoto = { kind: 'none' };

// why: a photo only ever points at a trusted point (CLAUDE.md). Street View
// comes first; the IGN orthophoto stands in when there is no panorama within
// 50 m or no Google key.
function photoSources({
  point,
  streetViewEnabled,
}: {
  point: GeoPoint | null;
  streetViewEnabled: boolean;
}): readonly PhotoSource[] {
  if (point === null) return [];
  const aerial: PhotoSource = { kind: 'aerial', src: aerialImageUrl(point) };
  if (!streetViewEnabled) return [aerial];
  return [
    { kind: 'street-view', src: streetViewImagePath(point), point },
    aerial,
  ];
}

export function useCandidatePhoto(input: {
  point: GeoPoint | null;
  streetViewEnabled: boolean;
}): { photo: CandidatePhoto; onPhotoError: () => void } {
  const [failed, setFailed] = useState<readonly PhotoSource['kind'][]>([]);
  const photo =
    photoSources(input).find((source) => !failed.includes(source.kind)) ??
    NO_PHOTO;

  function onPhotoError(): void {
    if (photo.kind === 'none') return;
    const { kind } = photo;
    setFailed((current) =>
      current.includes(kind) ? current : [...current, kind],
    );
  }

  return { photo, onPhotoError };
}
```

(`/api/street-view` answers a JSON 404 when Google has no panorama near the point, so the `<img>` fires `error` and the hook moves on to the orthophoto.)

- [ ] **Step 3: Rewrite the candidate list**

Replace the whole content of `src/app/(app)/dashboard/components/listing/address-candidate-list.tsx` with:

```tsx
'use client';

import { House, MapPinOff } from 'lucide-react';
import Image from 'next/image';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { reliableFloor, streetLine } from '@/core/ademe/record-facts';
import { scoreBand, scoreFromConfidence } from '@/core/ademe/score-scale';
import type { AddressCandidate } from '@/core/ademe/types';
import { cn } from '@/lib/utils';
import { SCORE_LABEL_KEY, scoreStyle } from './score-style';
import { useCandidatePhoto } from './use-candidate-photo';

type CardOptions = {
  selectedDpeNumber: string | null;
  onSelect: (dpeNumber: string) => void;
  streetViewEnabled: boolean;
};

export function AddressCandidateList({
  candidates,
  ...options
}: CardOptions & { candidates: readonly AddressCandidate[] }) {
  const t = useTranslations('Listing');
  const [top, ...others] = candidates;
  if (top === undefined) return null;

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2.5">
        <div className="px-0.5">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-graphite">
            {t('addressTopLabel')}
          </h3>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {t('addressTopHint')}
          </p>
        </div>
        <CandidateCard candidate={top} rank={1} {...options} />
      </section>
      {others.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <div className="px-0.5">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-graphite">
              {t('addressOthersLabel')}
            </h3>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {t('addressOthersHint', { count: others.length })}
            </p>
          </div>
          <ol start={2} className="flex flex-col gap-3">
            {others.map((candidate, index) => (
              <li key={candidate.record.dpeNumber}>
                <CandidateCard
                  candidate={candidate}
                  rank={index + 2}
                  {...options}
                />
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  return (
    <Badge className="size-6 rounded-full bg-(--score) p-0 text-[12px] font-semibold text-white tabular-nums shadow-sm">
      {rank}
    </Badge>
  );
}

function ScorePill({ score }: { score: number }) {
  const t = useTranslations('Listing');

  return (
    <Badge className="h-6 rounded-full bg-(--score) px-2 text-[12px] font-semibold text-white tabular-nums shadow-sm">
      {t.rich('addressScore', {
        score,
        muted: (chunks) => <span className="font-medium">{chunks}</span>,
      })}
      <span className="sr-only">{t(SCORE_LABEL_KEY[scoreBand(score)])}</span>
    </Badge>
  );
}

function CandidateCard({
  candidate,
  rank,
  selectedDpeNumber,
  onSelect,
  streetViewEnabled,
}: CardOptions & { candidate: AddressCandidate; rank: number }) {
  const t = useTranslations('Listing');
  const format = useFormatter();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const { record } = candidate;
  const { photo, onPhotoError } = useCandidatePhoto({
    point: record.point,
    streetViewEnabled,
  });
  const selected = record.dpeNumber === selectedDpeNumber;
  const dimmed = selectedDpeNumber !== null && !selected;
  const score = scoreFromConfidence(candidate.confidence);
  const floor = reliableFloor(record);
  const wasSelected = useRef(selected);

  // why: scroll only when the selection arrives on this card. On first render
  // the top card is already at the top; scrolling would hide the section title
  // on a phone, where a card is taller than the panel.
  useEffect(() => {
    if (selected && !wasSelected.current) {
      cardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    wasSelected.current = selected;
  }, [selected]);

  const meta = [
    record.city,
    record.propertyType === 'apartment'
      ? t('addressPropertyApartment')
      : record.propertyType === 'house'
        ? t('addressPropertyHouse')
        : null,
    record.surfaceM2 === null
      ? null
      : t('addressSurface', {
          surface: format.number(record.surfaceM2, {
            maximumFractionDigits: 1,
          }),
        }),
    floor === null ? null : t('addressFloor', { floor }),
    record.landSurfaceM2 === null
      ? null
      : t('addressLand', {
          surface: format.number(record.landSurfaceM2, {
            maximumFractionDigits: 0,
          }),
        }),
    record.yearBuilt === null
      ? null
      : t('cardYearBuilt', {
          year: String(record.yearBuilt),
          type: record.propertyType ?? 'unknown',
        }),
  ].filter((fact) => fact !== null);

  return (
    <Card
      ref={cardRef}
      size="sm"
      style={scoreStyle(score)}
      className={cn(
        'gap-0 py-0 transition-[opacity,background-color,box-shadow]',
        selected && 'bg-(--score-tint) ring-2 ring-(--score)',
        dimmed && 'lg:opacity-60 lg:hover:opacity-100',
      )}
    >
      <button
        type="button"
        aria-current={selected ? 'true' : undefined}
        onClick={() => {
          onSelect(record.dpeNumber);
        }}
        className="group/candidate flex w-full cursor-pointer flex-col text-left outline-none transition-colors hover:bg-foreground/3 focus-visible:bg-foreground/5"
      >
        {photo.kind === 'none' ? (
          <div className="flex h-[172px] w-full items-center justify-center bg-mist">
            <House
              aria-hidden
              className="size-8 text-pebble"
              strokeWidth={1.25}
            />
          </div>
        ) : (
          <div className="relative h-[172px] w-full overflow-hidden bg-mist">
            <Skeleton className="absolute inset-0 rounded-none" />
            <Image
              key={photo.src}
              unoptimized
              fill
              sizes="360px"
              src={photo.src}
              alt={
                photo.kind === 'street-view'
                  ? t('streetViewAlt', { address: record.address })
                  : t('aerialAlt', { address: record.address })
              }
              onError={onPhotoError}
              className="object-cover"
            />
            <span className="absolute top-2.5 left-2.5">
              <RankBadge rank={rank} />
            </span>
            <span className="absolute top-2.5 right-2.5">
              <ScorePill score={score} />
            </span>
            <Badge variant="secondary" className="absolute bottom-2.5 left-2.5">
              {photo.kind === 'street-view'
                ? t('streetViewBadge')
                : t('photoSatellite')}
            </Badge>
          </div>
        )}
        <CardHeader className="pt-3">
          {photo.kind === 'none' && (
            <div className="mb-1 flex items-center justify-between gap-2">
              <RankBadge rank={rank} />
              <ScorePill score={score} />
            </div>
          )}
          <CardTitle
            className={cn(
              'text-[15px] leading-snug text-ink',
              selected ? 'font-semibold' : 'font-medium',
            )}
          >
            {streetLine(record)}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 pt-2 pb-3">
          <Progress
            value={score}
            aria-hidden
            className="[&_[data-slot=progress-indicator]]:bg-(--score) [&_[data-slot=progress-track]]:bg-(--score)/20"
          />
          {meta.length > 0 && (
            <p className="text-[12px] text-muted-foreground">
              {meta.join(' · ')}
            </p>
          )}
          {record.point === null && (
            <p className="flex items-center gap-1 text-[12px] text-muted-foreground">
              <MapPinOff className="size-3 shrink-0" aria-hidden />
              {t('addressNoPoint')}
            </p>
          )}
          {rank === 1 && (
            <span
              className={buttonVariants({
                className: 'mt-1 w-full group-hover/candidate:bg-charcoal-deep',
              })}
            >
              {t('cardVerify')}
            </span>
          )}
        </CardContent>
      </button>
    </Card>
  );
}
```

- [ ] **Step 4: Pass the selection, not the shown result**

In `src/app/(app)/dashboard/components/listing/results-workspace.tsx`, replace:

```tsx
              shownDpeNumber={shown.record.dpeNumber}
```

with:

```tsx
              selectedDpeNumber={detailOpen ? shown.record.dpeNumber : null}
```

- [ ] **Step 5: Add the card copy**

In `src/i18n/messages/en.json`, replace:

```json
    "linkVilledereveHint": "Life in the commune"
  }
}
```

with:

```json
    "linkVilledereveHint": "Life in the commune",
    "photoSatellite": "Satellite",
    "aerialAlt": "Aerial photo around {address}",
    "cardVerify": "Check this address →",
    "addressFloor": "Floor {floor}",
    "addressLand": "Plot {surface} m²",
    "cardYearBuilt": "Built in {year}",
    "scoreVeryLikely": "Very likely match",
    "scoreLikely": "Likely match",
    "scoreApproximate": "Approximate match",
    "scoreUncertain": "Uncertain match",
    "scoreUnreliable": "Unreliable match"
  }
}
```

In `src/i18n/messages/fr.json`, replace:

```json
    "linkVilledereveHint": "Vie de la commune"
  }
}
```

with:

```json
    "linkVilledereveHint": "Vie de la commune",
    "photoSatellite": "Satellite",
    "aerialAlt": "Photo aérienne autour de {address}",
    "cardVerify": "Vérifier cette adresse →",
    "addressFloor": "Étage {floor}",
    "addressLand": "Terrain {surface} m²",
    "cardYearBuilt": "{type, select, house {Construite en {year}} other {Construit en {year}}}",
    "scoreVeryLikely": "Correspondance très probable",
    "scoreLikely": "Correspondance probable",
    "scoreApproximate": "Correspondance approximative",
    "scoreUncertain": "Correspondance incertaine",
    "scoreUnreliable": "Correspondance peu fiable"
  }
}
```

- [ ] **Step 6: Verify**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm type-check && pnpm lint && pnpm check && pnpm check:boundaries && pnpm test
```

Expected: every command exits 0; biome shows only the pre-existing warnings (run `pnpm check:fix` first if it reports a formatting difference, then re-run). The cards are checked in the browser by the final verification task (1440 / 1100 / 390 px).

- [ ] **Step 7: Commit**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; git add "src/app/(app)/dashboard/components/listing/score-style.ts" "src/app/(app)/dashboard/components/listing/use-candidate-photo.ts" "src/app/(app)/dashboard/components/listing/address-candidate-list.tsx" "src/app/(app)/dashboard/components/listing/results-workspace.tsx" src/i18n/messages/en.json src/i18n/messages/fr.json && git commit -m "$(cat <<'EOF'
feat(listing): candidate cards with photo fallback and score colour

A 172 px photo (Street View, else the IGN orthophoto, else a house
placeholder without a trusted point), rank and score overlaid in the score
colour, a tinted score bar, the meta line with floor, plot and build year,
a call to action on the top card, and a ring plus 60 % dimming while a
detail is open.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task C7: Left column — analysed listing link, wrap-around pager, notice copy

**Files:**
- Modify: `src/app/(app)/dashboard/components/listing/analysed-listing-card.tsx` (full replacement)
- Modify: `src/app/(app)/dashboard/components/listing/results-workspace.tsx`
- Modify: `src/i18n/messages/en.json`, `src/i18n/messages/fr.json` (namespace `Listing` only)

**Interfaces:**
- Consumes: `listingDisplayUrl` (Task C4); `ExtractedListing` (unchanged).
- Produces: `AnalysedListingCard({ listing }: { listing: ExtractedListing })` — same signature; the whole card is now one `<a>` (new tab, `title="Ouvrir l'annonce d'origine : {displayUrl}"`). In `ResultsWorkspace`: `total`, wrap-around `previous`/`next`, and `selectPrevious`/`selectNext: (() => void) | null` (null only when there is a single result), reused by Task C8. The heading pager `‹ n / N ›` renders only while a detail is open and N > 1, inside `role="group"` labelled "Parcourir les résultats".
- The left column's scroll content still ends with `<AddressCandidateList …/>` — the mount point for `MissingListingFeedback`.

- [ ] **Step 1: Rewrite the analysed-listing card**

Replace the whole content of `src/app/(app)/dashboard/components/listing/analysed-listing-card.tsx` with:

```tsx
'use client';

import { ExternalLink } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { listingDisplayUrl } from '@/core/listing/listing-summary';
import type { ExtractedListing } from '@/core/listing/types';

export function AnalysedListingCard({
  listing,
}: {
  listing: ExtractedListing;
}) {
  const t = useTranslations('Listing');
  const format = useFormatter();
  const { fields } = listing;

  const type =
    fields.propertyType === 'apartment'
      ? t('addressPropertyApartment')
      : fields.propertyType === 'house'
        ? t('addressPropertyHouse')
        : null;
  const rooms =
    fields.rooms === null ? null : t('listingRooms', { count: fields.rooms });
  const surface =
    fields.surfaceM2 === null
      ? null
      : t('addressSurface', {
          surface: format.number(fields.surfaceM2, {
            maximumFractionDigits: 1,
          }),
        });
  // why: this is the listing's own floor, read from the page; unlike ADEME's
  // default 0, a 0 here is a real ground floor.
  const floor =
    fields.floor === null
      ? null
      : fields.floor === 0
        ? t('listingFloorGround')
        : t('addressFloor', { floor: fields.floor });
  const place =
    fields.city === null
      ? null
      : fields.postalCode === null
        ? fields.city
        : t('listingPlace', {
            city: fields.city,
            postalCode: fields.postalCode,
          });
  const title = [type, rooms, surface]
    .filter((part) => part !== null)
    .join(' ');
  const facts = [
    type,
    surface,
    floor,
    fields.yearBuilt === null
      ? null
      : t('addressYearBuilt', { year: String(fields.yearBuilt) }),
    place,
  ].filter((fact) => fact !== null);
  const displayUrl =
    listingDisplayUrl(fields.canonicalUrl) ?? fields.canonicalUrl;

  return (
    <a
      href={fields.canonicalUrl}
      target="_blank"
      rel="noopener noreferrer"
      title={t('listingOpenTitle', { url: displayUrl })}
      className="group/listing block rounded-xl"
    >
      <Card
        size="sm"
        className="transition-colors group-hover/listing:bg-mist/60"
      >
        <CardHeader>
          <CardDescription className="text-[11px] font-semibold uppercase tracking-[0.06em]">
            {t('listingAnalysedLabel')}
          </CardDescription>
          <CardTitle className="text-[15px] font-semibold">
            {title.length > 0 ? title : t('listingUntitled')}
          </CardTitle>
          <CardAction>
            <ExternalLink
              aria-hidden
              className="size-4 text-muted-foreground transition-colors group-hover/listing:text-ink"
            />
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5">
          {facts.length > 0 && (
            <p className="text-[13px] text-muted-foreground">
              {facts.join(' · ')}
            </p>
          )}
          <p className="truncate text-[12px] text-muted-foreground underline-offset-2 group-hover/listing:underline">
            {displayUrl}
            <span className="sr-only"> {t('listingNewTab')}</span>
          </p>
        </CardContent>
      </Card>
    </a>
  );
}
```

No favicon is fetched: the card never sends the listing's domain to a third party. The global `:focus-visible` rule in `globals.css` draws the focus ring around the `rounded-xl` anchor.

- [ ] **Step 2: Wrap the pager around and share the handlers**

In `src/app/(app)/dashboard/components/listing/results-workspace.tsx`, replace:

```tsx
  const { candidates } = match;
  const index = candidates.findIndex(
    (candidate) => candidate.record.dpeNumber === shown.record.dpeNumber,
  );
  const previous = candidates[index - 1];
  const next = candidates[index + 1];
  const rank = index + 1;
  const detailOpen =
    detailPreference === 'default' ? isXl : detailPreference === 'open';
```

with:

```tsx
  const { candidates } = match;
  const total = candidates.length;
  const index = Math.max(
    0,
    candidates.findIndex(
      (candidate) => candidate.record.dpeNumber === shown.record.dpeNumber,
    ),
  );
  // why: the pagers wrap around, so as soon as there are two results every
  // one of them has a neighbour on both sides.
  const previous =
    total > 1 ? candidates[(index - 1 + total) % total] : undefined;
  const next = total > 1 ? candidates[(index + 1) % total] : undefined;
  const rank = index + 1;
  const detailOpen =
    detailPreference === 'default' ? isXl : detailPreference === 'open';
  const selectPrevious =
    previous === undefined
      ? null
      : (): void => {
          onSelect(previous.record.dpeNumber);
        };
  const selectNext =
    next === undefined
      ? null
      : (): void => {
          onSelect(next.record.dpeNumber);
        };
```

Replace:

```tsx
      rank={rank}
      onPrevious={
        previous === undefined
          ? null
          : () => {
              onSelect(previous.record.dpeNumber);
            }
      }
      onNext={
        next === undefined
          ? null
          : () => {
              onSelect(next.record.dpeNumber);
            }
      }
      onClose={closeDetail}
```

with:

```tsx
      rank={rank}
      onPrevious={selectPrevious}
      onNext={selectNext}
      onClose={closeDetail}
```

- [ ] **Step 3: Show the heading pager only while a detail is open**

In the same file, replace:

```tsx
            <div className="flex items-center justify-between gap-2">
              <h2
                id="results-heading"
                ref={headingRef}
                tabIndex={-1}
                className="text-[15px] font-semibold text-ink outline-none"
              >
                {t('addressHeading')}
              </h2>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('addressPrevious')}
                  disabled={previous === undefined}
                  focusableWhenDisabled
                  onClick={() => {
                    if (previous !== undefined) {
                      onSelect(previous.record.dpeNumber);
                    }
                  }}
                >
                  <ChevronLeft />
                </Button>
                <span className="min-w-10 text-center text-[12px] tabular-nums text-muted-foreground">
                  {t('addressPager', { index: rank, total: candidates.length })}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('addressNext')}
                  disabled={next === undefined}
                  focusableWhenDisabled
                  onClick={() => {
                    if (next !== undefined) onSelect(next.record.dpeNumber);
                  }}
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>
```

with:

```tsx
            <div className="flex min-h-7 items-center justify-between gap-2">
              <h2
                id="results-heading"
                ref={headingRef}
                tabIndex={-1}
                className="text-[15px] font-semibold text-ink outline-none"
              >
                {t('addressHeading')}
              </h2>
              {detailOpen && selectPrevious !== null && selectNext !== null && (
                <div
                  role="group"
                  aria-label={t('resultsPager')}
                  className="flex items-center gap-1"
                >
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('addressPrevious')}
                    onClick={selectPrevious}
                  >
                    <ChevronLeft />
                  </Button>
                  <span className="min-w-10 text-center text-[12px] tabular-nums text-muted-foreground">
                    {t('addressPager', { index: rank, total })}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('addressNext')}
                    onClick={selectNext}
                  >
                    <ChevronRight />
                  </Button>
                </div>
              )}
            </div>
```

(`min-h-7` keeps the heading row as tall as the pager buttons, so the list does not jump when the pager appears.)

- [ ] **Step 4: Update the left-column copy**

In `src/i18n/messages/en.json`, make these four in-place replacements inside `"Listing"`:

```json
    "addressOthersHint": "{count, plural, one {# other location} other {# other locations}}, from most to least likely",
```
→
```json
    "addressOthersHint": "{count, plural, one {# other possible location} other {# other locations, from most to least likely}}",
```

```json
    "addressPrevious": "Previous address",
    "addressNext": "Next address",
```
→
```json
    "addressPrevious": "Previous result",
    "addressNext": "Next result",
```

```json
    "listingPlace": "{city} ({postalCode})",
    "listingOpen": "Open the listing on {host} (new tab)",
```
→
```json
    "listingPlace": "{city} ({postalCode})",
```

```json
    "verifyNoticeBody": "Compare the photo and the map with the listing photos before relying on this address.",
```
→
```json
    "verifyNoticeBody": "We could not confirm the property with certainty. Compare the surface, the energy classes and the year of construction with the listing.",
```

Then append after the last key — replace:

```json
    "scoreUnreliable": "Unreliable match"
  }
}
```

with:

```json
    "scoreUnreliable": "Unreliable match",
    "resultsPager": "Browse the results",
    "listingOpenTitle": "Open the original listing: {url}",
    "listingNewTab": "(new tab)",
    "listingFloorGround": "Ground floor"
  }
}
```

In `src/i18n/messages/fr.json`, the same four in-place replacements:

```json
    "addressOthersHint": "{count, plural, one {# autre emplacement} other {# autres emplacements}}, du plus au moins probable",
```
→
```json
    "addressOthersHint": "{count, plural, one {# autre emplacement possible} other {# autres emplacements, du plus au moins probable}}",
```

```json
    "addressPrevious": "Adresse précédente",
    "addressNext": "Adresse suivante",
```
→
```json
    "addressPrevious": "Résultat précédent",
    "addressNext": "Résultat suivant",
```

```json
    "listingPlace": "{city} ({postalCode})",
    "listingOpen": "Ouvrir l’annonce sur {host} (nouvel onglet)",
```
→
```json
    "listingPlace": "{city} ({postalCode})",
```

```json
    "verifyNoticeBody": "Comparez la photo et le plan avec les photos de l’annonce avant de vous fier à cette adresse.",
```
→
```json
    "verifyNoticeBody": "Nous n'avons pas pu confirmer le bien avec certitude. Comparez la surface, les classes énergie et l'année de construction avec l'annonce.",
```

Then append — replace:

```json
    "scoreUnreliable": "Correspondance peu fiable"
  }
}
```

with:

```json
    "scoreUnreliable": "Correspondance peu fiable",
    "resultsPager": "Parcourir les résultats",
    "listingOpenTitle": "Ouvrir l'annonce d'origine : {url}",
    "listingNewTab": "(nouvel onglet)",
    "listingFloorGround": "Rez-de-chaussée"
  }
}
```

- [ ] **Step 5: Verify**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; grep -rn "listingOpen'" src; pnpm type-check && pnpm lint && pnpm check && pnpm check:boundaries && pnpm test
```

Expected: `grep` prints nothing; every command exits 0.

- [ ] **Step 6: Commit**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; git add "src/app/(app)/dashboard/components/listing/analysed-listing-card.tsx" "src/app/(app)/dashboard/components/listing/results-workspace.tsx" src/i18n/messages/en.json src/i18n/messages/fr.json && git commit -m "$(cat <<'EOF'
feat(listing): whole-card listing link and a wrap-around results pager

The analysed-listing card is one link with the listing's own floor
(Rez-de-chaussée for 0) and the tracking-free URL; the heading pager
appears only while a detail is open and wraps at both ends; the notice
reads precisement's copy.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task C8: Detail header, keyboard shortcuts and fixed photo area

**Files:**
- Create: `src/app/(app)/dashboard/components/listing/use-detail-shortcuts.ts`
- Create: `src/app/(app)/dashboard/components/listing/result-detail-photo.tsx`
- Modify: `src/app/(app)/dashboard/components/listing/result-detail-panel.tsx`
- Modify: `src/app/(app)/dashboard/components/listing/results-workspace.tsx`
- Modify: `src/i18n/messages/en.json`, `src/i18n/messages/fr.json` (namespace `Listing` only)

**Interfaces:**
- Consumes: `useCandidatePhoto` (Task C6); `streetViewPanoramaUrl(point: GeoPoint): string` (`src/core/street-view/links.ts`, unchanged); `selectPrevious`/`selectNext`/`total` (Task C7).
- Produces:
  ```ts
  // use-detail-shortcuts.ts
  export function useDetailShortcuts(input: {
    enabled: boolean;
    onClose: (() => void) | null;
    onPrevious: (() => void) | null;
    onNext: (() => void) | null;
  }): void;
  // result-detail-photo.tsx
  export function ResultDetailPhoto(props: { record: Pick<DpeRecord, 'address' | 'point'>; streetViewEnabled: boolean }): React.ReactElement;
  // result-detail-panel.tsx — one new prop
  export function ResultDetailPanel(props: {
    candidate: AddressCandidate; rank: number; total: number;
    onPrevious: (() => void) | null; onNext: (() => void) | null; onClose: () => void;
    streetViewEnabled: boolean; listing: DetailListing;
  }): React.ReactElement;
  ```

Behaviour (spec §6): a 44 px header with "Résultat {n}", the wrap-around pager `‹ n / N ›` (hidden when there is a single result) and a close button labelled "Fermer le détail". While the detail is open, `Esc` closes it (lg panel only — the mobile Sheet already closes on Escape), `←`/`→` show the previous/next result. The shortcut ignores any key with a modifier, any event already handled, and any event from an element that owns those keys: `input`, `textarea`, `select`, `contenteditable`, a `role="radiogroup"` (the feedback reasons) and the map (`role="application"`, whose arrows pan). The listener is on `document` so it also works when focus sits on `<body>`. Below the header, a fixed 320 px photo area that does not scroll: Street View with chips "Street View" (bottom-left) and "Explorer le panorama" (bottom-right, rotate icon), the whole photo a new-tab link to the Google Maps panorama; otherwise the orthophoto with "Satellite"; without a trusted point (or when both images fail) the placeholder "Image indisponible". Focus stays on the header's buttons across a selection change, as before: only the photo and the body are keyed on the shown result.

- [ ] **Step 1: Add the shortcut hook**

Create `src/app/(app)/dashboard/components/listing/use-detail-shortcuts.ts`:

```ts
'use client';

import { useEffect, useEffectEvent } from 'react';

// why: these elements already give Escape or the arrow keys a meaning (the
// text caret, a radio group, the map's own keyboard panning); a shortcut
// must never steal the key from them.
const KEY_OWNERS = [
  'input',
  'textarea',
  'select',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="radiogroup"]',
  '[role="application"]',
].join(', ');

function ownsKeys(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(KEY_OWNERS) !== null;
}

export function useDetailShortcuts({
  enabled,
  onClose,
  onPrevious,
  onNext,
}: {
  enabled: boolean;
  onClose: (() => void) | null;
  onPrevious: (() => void) | null;
  onNext: (() => void) | null;
}): void {
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }
    if (ownsKeys(event.target)) return;
    const action =
      event.key === 'Escape'
        ? onClose
        : event.key === 'ArrowLeft'
          ? onPrevious
          : event.key === 'ArrowRight'
            ? onNext
            : null;
    if (action === null) return;
    event.preventDefault();
    action();
  });

  useEffect(() => {
    if (!enabled) return;
    function handleKeyDown(event: KeyboardEvent): void {
      onKeyDown(event);
    }
    document.addEventListener('keydown', handleKeyDown);
    return (): void => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled]);
}
```

(`useEffectEvent` is stable in React 19.2, the version installed; it always reads the latest handlers, so the listener is registered once per open detail.)

- [ ] **Step 2: Add the fixed photo area**

Create `src/app/(app)/dashboard/components/listing/result-detail-photo.tsx`:

```tsx
'use client';

import { ImageOff, Rotate3d } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { DpeRecord } from '@/core/ademe/types';
import { streetViewPanoramaUrl } from '@/core/street-view/links';
import { cn } from '@/lib/utils';
import { useCandidatePhoto } from './use-candidate-photo';

const PHOTO_AREA_CLASS =
  'relative block h-[320px] shrink-0 overflow-hidden border-b border-border bg-mist';

export function ResultDetailPhoto({
  record,
  streetViewEnabled,
}: {
  record: Pick<DpeRecord, 'address' | 'point'>;
  streetViewEnabled: boolean;
}) {
  const t = useTranslations('Listing');
  const { photo, onPhotoError } = useCandidatePhoto({
    point: record.point,
    streetViewEnabled,
  });

  if (photo.kind === 'none') {
    return (
      <div
        className={cn(
          PHOTO_AREA_CLASS,
          'flex flex-col items-center justify-center gap-2',
        )}
      >
        <ImageOff
          aria-hidden
          className="size-8 text-pebble"
          strokeWidth={1.25}
        />
        <p className="text-[13px] text-muted-foreground">
          {t('photoUnavailable')}
        </p>
      </div>
    );
  }

  const image = (
    <>
      <Skeleton className="absolute inset-0 rounded-none" />
      <Image
        key={photo.src}
        unoptimized
        fill
        sizes="420px"
        src={photo.src}
        alt={
          photo.kind === 'street-view'
            ? t('streetViewAlt', { address: record.address })
            : t('aerialAlt', { address: record.address })
        }
        onError={onPhotoError}
        className="object-cover"
      />
    </>
  );

  if (photo.kind === 'aerial') {
    return (
      <div className={PHOTO_AREA_CLASS}>
        {image}
        <Badge variant="secondary" className="absolute bottom-2.5 left-2.5">
          {t('photoSatellite')}
        </Badge>
      </div>
    );
  }

  // why: the Google key stays on the server, so the interactive panorama
  // opens on Google Maps in a new tab rather than inside the panel.
  return (
    <a
      href={streetViewPanoramaUrl(photo.point)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t('detailStreetViewOpen')}
      className={PHOTO_AREA_CLASS}
    >
      {image}
      <Badge variant="secondary" className="absolute bottom-2.5 left-2.5">
        {t('streetViewBadge')}
      </Badge>
      <Badge variant="secondary" className="absolute right-2.5 bottom-2.5">
        <Rotate3d aria-hidden />
        {t('photoExplorePanorama')}
      </Badge>
    </a>
  );
}
```

- [ ] **Step 3: Rebuild the panel header and move the photo out of the scroll area**

In `src/app/(app)/dashboard/components/listing/result-detail-panel.tsx`, make these five replacements.

Replace:

```tsx
import Image from 'next/image';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
```

with:

```tsx
import { useFormatter, useTranslations } from 'next-intl';
import { toast } from 'sonner';
```

Replace:

```tsx
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
```

with:

```tsx
import { Separator } from '@/components/ui/separator';
```

Replace:

```tsx
import type {
  EnergyClass,
  ExtractedValues,
  HeatingEnergy,
} from '@/core/listing/types';
import {
  streetViewImagePath,
  streetViewPanoramaUrl,
} from '@/core/street-view/links';
```

with:

```tsx
import type {
  EnergyClass,
  ExtractedValues,
  HeatingEnergy,
} from '@/core/listing/types';
import { ResultDetailPhoto } from './result-detail-photo';
```

Replace the whole `ResultDetailPanel` function and the head of `ResultDetailBody` — from:

```tsx
export function ResultDetailPanel({
  candidate,
  rank,
  onPrevious,
  onNext,
  onClose,
  streetViewEnabled,
  listing,
}: {
  candidate: AddressCandidate;
  rank: number;
  onPrevious: (() => void) | null;
  onNext: (() => void) | null;
  onClose: () => void;
  streetViewEnabled: boolean;
  listing: DetailListing;
}) {
  const t = useTranslations('Listing');

  // why: the header (and its pager/close buttons) stays mounted across a
  // selection change, so keyboard focus on one of its buttons survives
  // "Adresse suivante"/"précédente" instead of dropping to <body>. Only the
  // body below, keyed on the shown result, resets its own state.
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h2 className="text-[13px] font-semibold text-ink">
          {t('detailTitle', { rank })}
        </h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('addressPrevious')}
            disabled={onPrevious === null}
            focusableWhenDisabled
            onClick={() => {
              onPrevious?.();
            }}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('addressNext')}
            disabled={onNext === null}
            focusableWhenDisabled
            onClick={() => {
              onNext?.();
            }}
          >
            <ChevronRight />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('detailClose')}
            onClick={onClose}
          >
            <X />
          </Button>
        </div>
      </div>
      <ResultDetailBody
        key={candidate.record.dpeNumber}
        candidate={candidate}
        rank={rank}
        streetViewEnabled={streetViewEnabled}
        listing={listing}
      />
    </div>
  );
}

function ResultDetailBody({
  candidate,
  rank,
  streetViewEnabled,
  listing,
}: {
  candidate: AddressCandidate;
  rank: number;
  streetViewEnabled: boolean;
  listing: DetailListing;
}) {
  const t = useTranslations('Listing');
  const format = useFormatter();
  const [photoFailed, setPhotoFailed] = useState(false);
  const { record } = candidate;
```

to:

```tsx
export function ResultDetailPanel({
  candidate,
  rank,
  total,
  onPrevious,
  onNext,
  onClose,
  streetViewEnabled,
  listing,
}: {
  candidate: AddressCandidate;
  rank: number;
  total: number;
  onPrevious: (() => void) | null;
  onNext: (() => void) | null;
  onClose: () => void;
  streetViewEnabled: boolean;
  listing: DetailListing;
}) {
  const t = useTranslations('Listing');

  // why: the header (and its pager/close buttons) stays mounted across a
  // selection change, so keyboard focus on one of its buttons survives
  // "Résultat suivant"/"précédent" instead of dropping to <body>. Only the
  // photo and the body below, keyed on the shown result, reset their state.
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <h2 className="text-[13px] font-semibold text-ink">
          {t('detailTitle', { rank })}
        </h2>
        <div className="flex items-center gap-1">
          {onPrevious !== null && onNext !== null && (
            <div
              role="group"
              aria-label={t('resultsPager')}
              className="flex items-center gap-0.5"
            >
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('addressPrevious')}
                onClick={onPrevious}
              >
                <ChevronLeft />
              </Button>
              <span className="min-w-10 text-center text-[12px] tabular-nums text-muted-foreground">
                {t('addressPager', { index: rank, total })}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('addressNext')}
                onClick={onNext}
              >
                <ChevronRight />
              </Button>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('detailClose')}
            onClick={onClose}
          >
            <X />
          </Button>
        </div>
      </div>
      <ResultDetailPhoto
        key={`photo:${candidate.record.dpeNumber}`}
        record={candidate.record}
        streetViewEnabled={streetViewEnabled}
      />
      <ResultDetailBody
        key={`body:${candidate.record.dpeNumber}`}
        candidate={candidate}
        rank={rank}
        listing={listing}
      />
    </div>
  );
}

function ResultDetailBody({
  candidate,
  rank,
  listing,
}: {
  candidate: AddressCandidate;
  rank: number;
  listing: DetailListing;
}) {
  const t = useTranslations('Listing');
  const format = useFormatter();
  const { record } = candidate;
```

(The two keyed siblings need distinct keys; React warns on duplicate keys among siblings.)

Replace:

```tsx
    <ScrollArea className="min-h-0 flex-1">
      {streetViewEnabled && point !== null && !photoFailed && (
        <a
          href={streetViewPanoramaUrl(point)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('detailStreetViewOpen')}
          className="relative block aspect-[2/1]"
        >
          <Skeleton className="absolute inset-0 rounded-none" />
          <Image
            unoptimized
            fill
            sizes="420px"
            src={streetViewImagePath(point)}
            alt={t('streetViewAlt', { address: record.address })}
            onError={() => {
              setPhotoFailed(true);
            }}
            className="object-cover"
          />
          <Badge variant="secondary" className="absolute bottom-2.5 left-2.5">
            {t('streetViewBadge')}
          </Badge>
        </a>
      )}
      <div className="flex flex-col gap-4 p-4">
```

with:

```tsx
    <ScrollArea className="min-h-0 flex-1">
      <div className="flex flex-col gap-4 p-4">
```

- [ ] **Step 4: Register the shortcuts and pass the total**

In `src/app/(app)/dashboard/components/listing/results-workspace.tsx`, replace:

```tsx
import { ResultDetailPanel } from './result-detail-panel';
```

with:

```tsx
import { ResultDetailPanel } from './result-detail-panel';
import { useDetailShortcuts } from './use-detail-shortcuts';
```

Replace:

```tsx
  function closeDetail(): void {
    onCloseDetail();
    requestAnimationFrame(() => {
      headingRef.current?.focus();
    });
  }
```

with:

```tsx
  function closeDetail(): void {
    onCloseDetail();
    requestAnimationFrame(() => {
      headingRef.current?.focus();
    });
  }

  // why: the mobile Sheet already closes itself on Escape; only the lg panel
  // needs the shortcut to close it.
  useDetailShortcuts({
    enabled: detailOpen,
    onClose: isLg ? closeDetail : null,
    onPrevious: selectPrevious,
    onNext: selectNext,
  });
```

Replace:

```tsx
      rank={rank}
      onPrevious={selectPrevious}
```

with:

```tsx
      rank={rank}
      total={total}
      onPrevious={selectPrevious}
```

`closeDetail` still moves focus to the results heading after `Esc`, as it does for the close button.

- [ ] **Step 5: Add the photo copy and the close label**

In `src/i18n/messages/en.json`, replace in place:

```json
    "detailClose": "Close the result",
```
→
```json
    "detailClose": "Close the detail",
```

and append — replace:

```json
    "listingFloorGround": "Ground floor"
  }
}
```

with:

```json
    "listingFloorGround": "Ground floor",
    "photoExplorePanorama": "Explore the panorama",
    "photoUnavailable": "Image unavailable"
  }
}
```

In `src/i18n/messages/fr.json`, replace in place:

```json
    "detailClose": "Fermer le résultat",
```
→
```json
    "detailClose": "Fermer le détail",
```

and append — replace:

```json
    "listingFloorGround": "Rez-de-chaussée"
  }
}
```

with:

```json
    "listingFloorGround": "Rez-de-chaussée",
    "photoExplorePanorama": "Explorer le panorama",
    "photoUnavailable": "Image indisponible"
  }
}
```

- [ ] **Step 6: Verify**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm type-check && pnpm lint && pnpm check && pnpm check:boundaries && pnpm test
```

Expected: every command exits 0. (Keyboard behaviour — `Esc`/`←`/`→`, and no hijack while typing in a textarea or moving through a radio group — is exercised by the final browser verification task.)

- [ ] **Step 7: Commit**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; git add "src/app/(app)/dashboard/components/listing/use-detail-shortcuts.ts" "src/app/(app)/dashboard/components/listing/result-detail-photo.tsx" "src/app/(app)/dashboard/components/listing/result-detail-panel.tsx" "src/app/(app)/dashboard/components/listing/results-workspace.tsx" src/i18n/messages/en.json src/i18n/messages/fr.json && git commit -m "$(cat <<'EOF'
feat(listing): detail header, keyboard shortcuts and fixed photo area

A 44 px header with the wrap-around pager and "Fermer le détail"; Esc,
left and right arrows drive the open detail but never steal keys from a
text field, a radio group or the map; the 320 px photo no longer scrolls
and falls back from Street View to the orthophoto to a placeholder.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task C9: Detail body — score line, address copy, energy labels, tiles, verify links

**Files:**
- Create: `src/app/(app)/dashboard/components/listing/use-copy-address.ts`
- Create: `src/app/(app)/dashboard/components/listing/verify-elsewhere.tsx`
- Modify: `src/app/(app)/dashboard/components/listing/result-detail-panel.tsx` (full replacement)
- Modify: `src/i18n/messages/en.json`, `src/i18n/messages/fr.json` (namespace `Listing` only)

**Interfaces:**
- Consumes: `copyableAddress`, `factAgreement` (Task C5); `scoreBand`, `scoreFromConfidence` (Task C1); `scoreStyle`, `SCORE_LABEL_KEY` (Task C6); `ResultDetailPhoto` (Task C8); `villedereveCommuneUrl`, `googleMapsUrl`, `georisquesReportUrl`, `dvfSalesUrl` (`outbound-links`); `Tooltip`, `TooltipTrigger`, `TooltipContent` (`src/components/ui/tooltip.tsx`; `TooltipProvider` stays in the dashboard layout, which Stream A keeps).
- Produces:
  ```ts
  // use-copy-address.ts
  export type CopyStatus = 'idle' | 'copied' | 'failed';
  export function useCopyAddress(address: string): { status: CopyStatus; copy: () => void }; // 'copied' reverts to 'idle' after 2 s
  // verify-elsewhere.tsx
  export function VerifyElsewhere(props: { record: Pick<DpeRecord, 'point' | 'inseeCode' | 'address' | 'city'> }): React.ReactElement | null; // null without a trusted point
  ```
  `ResultDetailPanel` keeps the Task C8 signature. **Mount point:** the scroll content of `ResultDetailBody` ends with `<VerifyElsewhere record={record} />`; the integration task appends `ConfirmListingButton` right after it.

Behaviour (spec §6): score line = rank circle and `{score}` in the score colour, `/100` muted, "score de correspondance", and an sr-only band label ("Correspondance probable" …). The street line is the panel's `h2` (the header title becomes a `<p>`; the `aside`/Sheet title still name the panel "Résultat {n}"), `{postalCode} {city}` under it. The copy button (tooltip "Copier l'adresse") copies `copyableAddress(record)`, turns its icon into a check and shows "Adresse copiée" in a `role="status"` line for 2 s; a failure shows "Impossible de copier l’adresse" in the destructive colour. The toasts go. DPE and GES labels put the letter in a square in precisement's colours, never check-marked. Fact tiles in the spec's order — Type de bien, Surface, Étage estimé (ADEME floor ≥ 1 only), Terrain cadastral (never ✓), Année de construction, Chauffage, Date du DPE — each carrying a visible "✓ Conforme à l’annonce" only when `factAgreement`/`shownDpeDate` says so. "Vérifier ailleurs" (trusted point only): Google Maps, Géorisques, DVF, Villederêve, each with its coloured icon square.

- [ ] **Step 1: Add the copy hook**

Create `src/app/(app)/dashboard/components/listing/use-copy-address.ts`:

```ts
'use client';

import { useEffect, useState } from 'react';

export type CopyStatus = 'idle' | 'copied' | 'failed';

const COPIED_FOR_MS = 2000;

async function writeToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function useCopyAddress(address: string): {
  status: CopyStatus;
  copy: () => void;
} {
  const [status, setStatus] = useState<CopyStatus>('idle');

  useEffect(() => {
    if (status !== 'copied') return;
    const timer = window.setTimeout(() => {
      setStatus('idle');
    }, COPIED_FOR_MS);
    return (): void => {
      window.clearTimeout(timer);
    };
  }, [status]);

  function copy(): void {
    void writeToClipboard(address).then((ok) => {
      setStatus(ok ? 'copied' : 'failed');
    });
  }

  return { status, copy };
}
```

- [ ] **Step 2: Extract the verify-elsewhere section**

Create `src/app/(app)/dashboard/components/listing/verify-elsewhere.tsx`:

```tsx
'use client';

import {
  ArrowUpRight,
  Building2,
  Landmark,
  type LucideIcon,
  MapPin,
  TriangleAlert,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { buttonVariants } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import type { DpeRecord } from '@/core/ademe/types';
import {
  dvfSalesUrl,
  georisquesReportUrl,
  googleMapsUrl,
  villedereveCommuneUrl,
} from '@/core/geo/outbound-links';

type OutboundLink = {
  href: string;
  title: string;
  hint: string;
  icon: LucideIcon;
  hue: string;
};

// why: one muted hue per destination tells the four tiles apart at a glance.
// Like the DPE colours they identify rather than act, so they sit outside the
// single accent colour of DESIGN.md.
const LINK_HUE = {
  googleMaps: '#4f6d99',
  georisques: '#b06e4e',
  dvf: '#3a7480',
  villedereve: '#74629b',
};

// why: every link is built from the trusted point or the commune code, never
// from the address text alone, so a result without a trusted point has none.
export function VerifyElsewhere({
  record,
}: {
  record: Pick<DpeRecord, 'point' | 'inseeCode' | 'address' | 'city'>;
}) {
  const t = useTranslations('Listing');
  const { point } = record;
  if (point === null) return null;

  const links = [
    {
      href: googleMapsUrl(point),
      title: t('linkGoogleMaps'),
      hint: t('linkGoogleMapsHint'),
      icon: MapPin,
      hue: LINK_HUE.googleMaps,
    },
    {
      href: georisquesReportUrl({
        point,
        inseeCode: record.inseeCode,
        address: record.address,
        city: record.city,
      }),
      title: t('linkGeorisques'),
      hint: t('linkGeorisquesHint'),
      icon: TriangleAlert,
      hue: LINK_HUE.georisques,
    },
    {
      href: dvfSalesUrl({ point, inseeCode: record.inseeCode }),
      title: t('linkDvf'),
      hint: t('linkDvfHint'),
      icon: Landmark,
      hue: LINK_HUE.dvf,
    },
    {
      href: villedereveCommuneUrl(record.inseeCode),
      title: t('linkVilledereve'),
      hint: t('linkVilledereveHint'),
      icon: Building2,
      hue: LINK_HUE.villedereve,
    },
  ].filter((link): link is OutboundLink => link.href !== null);

  return (
    <>
      <Separator />
      <section className="flex flex-col gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-graphite">
          {t('verifyElsewhere')}
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {links.map((link) => (
            <a
              key={link.title}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({
                variant: 'outline',
                className:
                  'h-auto justify-start gap-2.5 whitespace-normal px-2.5 py-2.5 text-left',
              })}
            >
              <span
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-white"
                style={{ backgroundColor: link.hue }}
              >
                <link.icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium">
                  {link.title}
                </span>
                <span className="block text-[11px] font-normal text-muted-foreground">
                  {link.hint}
                </span>
              </span>
              <ArrowUpRight
                className="size-3.5 shrink-0 text-muted-foreground"
                aria-hidden
              />
            </a>
          ))}
        </div>
      </section>
    </>
  );
}
```

(White icons on the four hues measure 4.05–5.30 : 1.)

- [ ] **Step 3: Rewrite the detail panel**

Replace the whole content of `src/app/(app)/dashboard/components/listing/result-detail-panel.tsx` with:

```tsx
'use client';

import { Check, ChevronLeft, ChevronRight, Copy, X } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  copyableAddress,
  factAgreement,
  placeLine,
  reliableFloor,
  shownDpeDate,
  streetLine,
} from '@/core/ademe/record-facts';
import { scoreBand, scoreFromConfidence } from '@/core/ademe/score-scale';
import type { AddressCandidate } from '@/core/ademe/types';
import type {
  EnergyClass,
  ExtractedValues,
  HeatingEnergy,
} from '@/core/listing/types';
import { cn } from '@/lib/utils';
import { ResultDetailPhoto } from './result-detail-photo';
import { SCORE_LABEL_KEY, scoreStyle } from './score-style';
import { useCopyAddress } from './use-copy-address';
import { VerifyElsewhere } from './verify-elsewhere';

type LetterColour = { background: string; letter: 'ink' | 'white' };

// why: the official DPE and GES label colours encode the letter itself; like
// the score ramp they are an exception to the single accent colour. Each
// letter is set in whichever of ink or white contrasts more with its square.
const DPE_COLOUR = {
  A: { background: '#00a06d', letter: 'ink' },
  B: { background: '#52b153', letter: 'ink' },
  C: { background: '#cbd934', letter: 'ink' },
  D: { background: '#f4e70f', letter: 'ink' },
  E: { background: '#f0b40f', letter: 'ink' },
  F: { background: '#eb8235', letter: 'ink' },
  G: { background: '#d7221f', letter: 'white' },
} as const satisfies Record<EnergyClass, LetterColour>;

const GES_COLOUR = {
  A: { background: '#f2e9fb', letter: 'ink' },
  B: { background: '#e0c7f7', letter: 'ink' },
  C: { background: '#cda6f2', letter: 'ink' },
  D: { background: '#ba85ee', letter: 'ink' },
  E: { background: '#a663e9', letter: 'white' },
  F: { background: '#9341e5', letter: 'white' },
  G: { background: '#7f1fe0', letter: 'white' },
} as const satisfies Record<EnergyClass, LetterColour>;

const HEATING_KEY = {
  gas: 'heatingGas',
  electricity: 'heatingElectricity',
  'district-heating': 'heatingDistrictHeating',
  'fuel-oil': 'heatingFuelOil',
  wood: 'heatingWood',
  lpg: 'heatingLpg',
  coal: 'heatingCoal',
} as const satisfies Record<HeatingEnergy, string>;

type Fact = {
  label: string;
  value: string;
  agrees: boolean;
};

type DetailListing = Pick<
  ExtractedValues,
  | 'propertyType'
  | 'surfaceM2'
  | 'yearBuilt'
  | 'heatingEnergy'
  | 'floor'
  | 'dpeDate'
>;

export function ResultDetailPanel({
  candidate,
  rank,
  total,
  onPrevious,
  onNext,
  onClose,
  streetViewEnabled,
  listing,
}: {
  candidate: AddressCandidate;
  rank: number;
  total: number;
  onPrevious: (() => void) | null;
  onNext: (() => void) | null;
  onClose: () => void;
  streetViewEnabled: boolean;
  listing: DetailListing;
}) {
  const t = useTranslations('Listing');

  // why: the header (and its pager/close buttons) stays mounted across a
  // selection change, so keyboard focus on one of its buttons survives
  // "Résultat suivant"/"précédent" instead of dropping to <body>. Only the
  // photo and the body below, keyed on the shown result, reset their state.
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <p className="text-[13px] font-semibold text-ink">
          {t('detailTitle', { rank })}
        </p>
        <div className="flex items-center gap-1">
          {onPrevious !== null && onNext !== null && (
            <div
              role="group"
              aria-label={t('resultsPager')}
              className="flex items-center gap-0.5"
            >
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('addressPrevious')}
                onClick={onPrevious}
              >
                <ChevronLeft />
              </Button>
              <span className="min-w-10 text-center text-[12px] tabular-nums text-muted-foreground">
                {t('addressPager', { index: rank, total })}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('addressNext')}
                onClick={onNext}
              >
                <ChevronRight />
              </Button>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('detailClose')}
            onClick={onClose}
          >
            <X />
          </Button>
        </div>
      </div>
      <ResultDetailPhoto
        key={`photo:${candidate.record.dpeNumber}`}
        record={candidate.record}
        streetViewEnabled={streetViewEnabled}
      />
      <ResultDetailBody
        key={`body:${candidate.record.dpeNumber}`}
        candidate={candidate}
        rank={rank}
        listing={listing}
      />
    </div>
  );
}

function EnergyBadge({
  label,
  letter,
}: {
  label: 'dpe' | 'ges';
  letter: EnergyClass;
}) {
  const t = useTranslations('Listing');
  const colour = label === 'dpe' ? DPE_COLOUR[letter] : GES_COLOUR[letter];
  const square = (chunks: ReactNode) => (
    <span
      className={cn(
        'flex size-5 items-center justify-center rounded-[3px] text-[12px] font-bold',
        colour.letter === 'white' ? 'text-white' : 'text-ink',
      )}
      style={{ backgroundColor: colour.background }}
    >
      {chunks}
    </span>
  );

  return (
    <Badge variant="outline" className="h-7 gap-1.5 py-0 pr-1 pl-2 text-[12px]">
      {label === 'dpe'
        ? t.rich('detailDpe', { letter, square })
        : t.rich('detailGes', { letter, square })}
    </Badge>
  );
}

function ResultDetailBody({
  candidate,
  rank,
  listing,
}: {
  candidate: AddressCandidate;
  rank: number;
  listing: DetailListing;
}) {
  const t = useTranslations('Listing');
  const format = useFormatter();
  const { record } = candidate;
  const score = scoreFromConfidence(candidate.confidence);
  const place = placeLine(record);
  const floor = reliableFloor(record);
  const date = shownDpeDate(record, listing.dpeDate);
  const agreement = factAgreement(record, listing);
  const { status: copyStatus, copy } = useCopyAddress(copyableAddress(record));

  const facts: Fact[] = [
    record.propertyType === null
      ? null
      : {
          label: t('factType'),
          value:
            record.propertyType === 'apartment'
              ? t('addressPropertyApartment')
              : t('addressPropertyHouse'),
          agrees: agreement.propertyType,
        },
    record.surfaceM2 === null
      ? null
      : {
          label: t('factSurface'),
          value: t('addressSurface', {
            surface: format.number(record.surfaceM2, {
              maximumFractionDigits: 1,
            }),
          }),
          agrees: agreement.surfaceM2,
        },
    floor === null
      ? null
      : {
          label: t('factFloor'),
          value: t('factFloorValue', { floor }),
          agrees: agreement.floor,
        },
    record.landSurfaceM2 === null
      ? null
      : {
          label: t('factLand'),
          value: t('addressSurface', {
            surface: format.number(record.landSurfaceM2, {
              maximumFractionDigits: 0,
            }),
          }),
          agrees: false,
        },
    record.yearBuilt === null
      ? null
      : {
          label: t('factYearBuilt'),
          value: String(record.yearBuilt),
          agrees: agreement.yearBuilt,
        },
    record.heatingEnergy === null
      ? null
      : {
          label: t('factHeating'),
          value: t(HEATING_KEY[record.heatingEnergy]),
          agrees: agreement.heatingEnergy,
        },
    date === null
      ? null
      : {
          label: t('factDpeDate'),
          value: format.dateTime(date.date, {
            dateStyle: 'long',
            timeZone: 'UTC',
          }),
          agrees: date.agrees,
        },
  ].filter((fact) => fact !== null);

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="flex flex-col gap-4 p-4" style={scoreStyle(score)}>
        <div className="flex items-center gap-2">
          <Badge className="size-7 rounded-full bg-(--score) p-0 text-[13px] font-semibold text-white tabular-nums">
            {rank}
          </Badge>
          <span className="text-[20px] font-semibold tabular-nums text-(--score)">
            {t.rich('addressScore', {
              score,
              muted: (chunks) => (
                <span className="text-[12px] font-medium text-muted-foreground">
                  {chunks}
                </span>
              ),
            })}
          </span>
          <span className="text-[12px] text-muted-foreground">
            {t('detailScoreLabel')}
          </span>
          <span className="sr-only">
            {t(SCORE_LABEL_KEY[scoreBand(score)])}
          </span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[20px] font-semibold leading-tight tracking-[-0.18px] text-ink">
              {streetLine(record)}
            </h2>
            {place !== null && (
              <p className="mt-0.5 text-[14px] text-graphite">{place}</p>
            )}
            <p
              role="status"
              className={cn(
                'text-[12px]',
                copyStatus !== 'idle' && 'mt-1',
                copyStatus === 'failed' ? 'text-destructive' : 'text-graphite',
              )}
            >
              {copyStatus === 'copied'
                ? t('detailCopied')
                : copyStatus === 'failed'
                  ? t('detailCopyFailed')
                  : null}
            </p>
          </div>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={t('detailCopy')}
                  onClick={copy}
                />
              }
            >
              {copyStatus === 'copied' ? <Check /> : <Copy />}
            </TooltipTrigger>
            <TooltipContent>{t('detailCopy')}</TooltipContent>
          </Tooltip>
        </div>
        {(record.dpeClass !== null || record.gesClass !== null) && (
          <div className="flex items-center gap-2">
            {record.dpeClass !== null && (
              <EnergyBadge label="dpe" letter={record.dpeClass} />
            )}
            {record.gesClass !== null && (
              <EnergyBadge label="ges" letter={record.gesClass} />
            )}
          </div>
        )}
        {facts.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {facts.map((fact) => (
              <Card key={fact.label} size="sm" className="gap-0 py-2.5">
                <CardContent className="flex flex-col">
                  <p className="text-[11px] text-muted-foreground">
                    {fact.label}
                  </p>
                  <p className="mt-0.5 text-[14px] font-medium text-ink">
                    {fact.value}
                  </p>
                  {fact.agrees && (
                    <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-graphite">
                      <Check className="size-3 shrink-0" aria-hidden />
                      {t('detailFactAgrees')}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        <VerifyElsewhere record={record} />
      </div>
    </ScrollArea>
  );
}
```

- [ ] **Step 4: Update the detail copy**

In `src/i18n/messages/en.json`, replace in place:

```json
    "detailDpe": "DPE {letter}",
    "detailGes": "GES {letter}",
```
→
```json
    "detailDpe": "DPE <square>{letter}</square>",
    "detailGes": "GES <square>{letter}</square>",
```

```json
    "factFloor": "Floor",
```
→
```json
    "factFloor": "Estimated floor",
```

and append — replace:

```json
    "photoUnavailable": "Image unavailable"
  }
}
```

with:

```json
    "photoUnavailable": "Image unavailable",
    "factLand": "Cadastral plot"
  }
}
```

In `src/i18n/messages/fr.json`, replace in place:

```json
    "detailDpe": "DPE {letter}",
    "detailGes": "GES {letter}",
```
→
```json
    "detailDpe": "DPE <square>{letter}</square>",
    "detailGes": "GES <square>{letter}</square>",
```

```json
    "factFloor": "Étage",
```
→
```json
    "factFloor": "Étage estimé",
```

and append — replace:

```json
    "photoUnavailable": "Image indisponible"
  }
}
```

with:

```json
    "photoUnavailable": "Image indisponible",
    "factLand": "Terrain cadastral"
  }
}
```

(`detailCopy` "Copier l’adresse", `detailCopied` "Adresse copiée", `detailCopyFailed`, `detailScoreLabel` "score de correspondance", `detailFactAgrees` "Conforme à l’annonce" and `factFloorValue` "1er étage" / "{n}e étage" already exist.)

- [ ] **Step 5: Verify**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; grep -n "sonner\|toast" "src/app/(app)/dashboard/components/listing/result-detail-panel.tsx"; pnpm type-check && pnpm lint && pnpm check && pnpm check:boundaries && pnpm test
```

Expected: `grep` prints nothing; every command exits 0.

- [ ] **Step 6: Commit**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; git add "src/app/(app)/dashboard/components/listing/use-copy-address.ts" "src/app/(app)/dashboard/components/listing/verify-elsewhere.tsx" "src/app/(app)/dashboard/components/listing/result-detail-panel.tsx" src/i18n/messages/en.json src/i18n/messages/fr.json && git commit -m "$(cat <<'EOF'
feat(listing): detail body with score colour, copy state and labels

The score line in the score colour with its band for screen readers, the
street line as the panel heading, an inline copy state, DPE and GES letters
in their official squares, the seven fact tiles with a visible agreement
mark, and verify-elsewhere tiles with Villederêve and coloured icons.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task C10: Map attribution bottom-right, clear of the floating panel

**Files:**
- Modify: `src/app/(app)/dashboard/components/listing/address-map.tsx`
- Modify: `src/app/(app)/dashboard/components/listing/results-workspace.tsx`

**Interfaces:**
- Consumes: `PANEL_CLEARANCE` (right 424 px, unchanged) and the lg/xl media queries in `results-workspace.tsx`.
- Produces: no new export. `AddressMap`'s props are unchanged; the one-pin rule, the camera padding, the single `new mapboxgl.Map()` and `MapErrorBoundary` are untouched.

Behaviour (spec §9): `AttributionControl` bottom-right without a `compact` option — Mapbox's own collapse at a map width of 640 px or less stays (verified in `mapbox-gl` 3.31: `_updateCompact` only runs when `compact` is `undefined`). The Mapbox logo stays bottom-left (default `logoPosition`). Between `lg` and `xl`, while the detail panel floats over the right 424 px of the map, the bottom-right control stack moves left by 424 px. `mapbox-gl.css` is unlayered (`.mapboxgl-ctrl-bottom-right{right:0;bottom:0}`), and Tailwind v4 utilities live in `@layer utilities`, which loses to unlayered rules whatever the specificity; an `!important` declaration in a layer beats a normal unlayered one, hence the trailing `!`. The class sits on the workspace's wrapper div, not on the Mapbox container, so React never rewrites the classes Mapbox adds to its own container. Verified with the Tailwind compiler: `[&_.mapboxgl-ctrl-bottom-right]:right-[424px]!` emits `& .mapboxgl-ctrl-bottom-right { right: 424px !important; }`.

- [ ] **Step 1: Move the attribution bottom-right**

In `src/app/(app)/dashboard/components/listing/address-map.tsx`, replace:

```tsx
    // why: the address panel covers the bottom-right corner, where Mapbox puts
    // its attribution by default; the attribution must stay visible.
    map.addControl(new mapboxgl.AttributionControl(), 'bottom-left');
```

with:

```tsx
    // why: Mapbox's terms want the attribution, with its "Improve this map"
    // link, bottom-right. Without a `compact` option it still collapses on its
    // own when the map is 640 px wide or less.
    map.addControl(new mapboxgl.AttributionControl(), 'bottom-right');
```

- [ ] **Step 2: Shift the bottom-right controls while the panel floats**

In `src/app/(app)/dashboard/components/listing/results-workspace.tsx`, replace:

```tsx
  const padding = isLg && !isXl && detailOpen ? PANEL_CLEARANCE : NO_CLEARANCE;
```

with:

```tsx
  const panelFloats = isLg && !isXl && detailOpen;
  const padding = panelFloats ? PANEL_CLEARANCE : NO_CLEARANCE;
```

Replace:

```tsx
            <div className="absolute inset-0">
              <MapErrorBoundary fallback={null} onError={onMapFailure}>
```

with:

```tsx
            <div
              className={cn(
                'absolute inset-0',
                // why: the floating panel covers the right 424px of the map
                // (PANEL_CLEARANCE), so the bottom-right controls, the
                // attribution among them, move clear of it. mapbox-gl.css is
                // unlayered, so only an !important utility outranks its
                // `right: 0`.
                panelFloats && '[&_.mapboxgl-ctrl-bottom-right]:right-[424px]!',
              )}
            >
              <MapErrorBoundary fallback={null} onError={onMapFailure}>
```

Replace:

```tsx
                isLg && !isXl && detailOpen
                  ? 'max-w-[calc(100%_-_448px)]'
                  : 'max-w-[calc(100%-1.5rem)]',
```

with:

```tsx
                panelFloats
                  ? 'max-w-[calc(100%_-_448px)]'
                  : 'max-w-[calc(100%-1.5rem)]',
```

- [ ] **Step 3: Verify**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm type-check && pnpm lint && pnpm check && pnpm check:boundaries && pnpm test
```

Expected: every command exits 0. The attribution's position at 1440 px (bottom-right, panel docked), 1100 px (bottom-right, 424 px left of the edge, visible beside the floating panel) and 390 px (collapsed "i" button bottom-right) is checked by the final browser verification task.

- [ ] **Step 4: Commit**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; git add "src/app/(app)/dashboard/components/listing/address-map.tsx" "src/app/(app)/dashboard/components/listing/results-workspace.tsx" && git commit -m "$(cat <<'EOF'
fix(listing): map attribution bottom-right, clear of the floating panel

Mapbox's terms place the attribution and "Improve this map" bottom-right;
between lg and xl the bottom-right control stack moves 424 px left so the
floating detail panel never covers it. The logo stays bottom-left.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Stream notes

**How this section was checked.** Every task was applied in order to a scratch copy of the base commit (with the worktree's `node_modules`): after each task `tsc --noEmit`, ESLint and biome on the touched files were clean, and after C10 the full `vitest run` (93 files, 869 tests), `biome check .` (only the 13 warnings the base commit already has), `eslint .` and `check-domain-boundaries` all passed. The failure messages quoted in the "watch it fail" steps are the ones that run produced. The Tailwind classes that carry the score colour and the attribution shift were compiled with `@tailwindcss/node` to confirm the CSS they emit. No browser run was possible here (the dashboard needs the app's env and services), so every visual claim waits for the final browser task.

**Assumptions.**
- "Selected card" = the shown result while its detail is open. With the detail closed, no card is ringed or dimmed; the map chip still names the pinned address. At `xl` the detail opens by default on #1, so #1 starts ringed and the others start at 60 %.
- The photo falls back from Street View to the orthophoto when Street View is disabled *or* its image fails (the `/api/street-view` 404 when no panorama is within 50 m), not only when the key is absent. The placeholder (house icon on the card, "Image indisponible" in the detail) also covers a trusted point whose two images both fail.
- A card without a photo shows the 172 px placeholder block and puts the rank and score in its header, as §5 says ("Without a photo they sit in the card header").
- `listingDisplayUrl` now keeps non-tracking query parameters. The spec's list of stripped parameters only makes sense if the query is otherwise shown; the old function dropped the whole query.
- Copy feedback: a check icon on the button plus a `role="status"` line under the address ("Adresse copiée" for 2 s; a failure stays until the next attempt or candidate). The panel's toasts are removed. The status line adds one line of height while it shows.
- The fact tiles show a visible "✓ Conforme à l’annonce" (it was screen-reader-only). Energy letters are set in ink or white, whichever contrasts more with the square.
- The detail header's "Résultat {n}" becomes a `<p>` so the street line can be the panel's `h2` (§6). The `aside` and the Sheet title still name the panel. The pager is also hidden in the detail header when there is only one result.
- `Esc` closes only the `lg` panel: below `lg` the Base UI Sheet already closes on Escape, and handling it twice would move focus twice.
- The card's build-year line uses a new key, `cardYearBuilt` (ICU select, "Construite en" for a maison). The analysed-listing recap keeps `addressYearBuilt` ("Construit en {year}"), which is what §4 writes.
- New French copy is quoted from the spec as written, straight apostrophes included. Existing strings with typographic apostrophes (`addressTopHint`, `detailFactAgrees`, …) are left as they are.

**Spec points I could not map cleanly, or that need a decision.**
- **Score-colour legibility.** White text on the yellow and green stops (score 74 → `rgb(214, 178, 66)`, about 2 : 1), and the detail's score number in the score colour on white, fall below WCAG AA. Built as specified; the browser check should confirm it is acceptable.
- **IGN attribution.** Licence Ouverte 2.0 asks for the source to be credited. The spec only gives the chip "Satellite", and the images are aerial photographs, not satellite images. Suggestion for the spec owner: "Satellite · IGN", or a one-line credit in the detail photo.
- **Attribution between 1024 and ~1140 px.** A 424 px shift leaves 240–316 px of map for the expanded attribution (about 250 px wide) next to the Mapbox logo, so it may wrap or touch the logo. Check it at 1100 px.
- **Villederêve could not be verified from here.** villedereve.fr answers 403 to curl, so `/ville/{code}` (and the parent-commune mapping) was not confirmed live.
- **Detail height on a phone.** The fixed 44 + 320 px leaves about 200 px of scrollable body on a 667 px-tall phone (Sheet at 85 svh). The spec fixes the 320 px.

**For the integration task (I1), all within the contract.**
- Call `useSearchFeedback({ listingUrl: listing.fields.canonicalUrl, candidates: match.candidates })` in `ResultsWorkspace`; an `AddressCandidate` satisfies the hook's candidate shape.
- Append `<MissingListingFeedback feedback={feedback} />` right after `<AddressCandidateList …/>`, the last child of the left column's scroll content.
- Add a `feedback` prop to `ResultDetailPanel` and `ResultDetailBody`, then append `<ConfirmListingButton feedback={feedback} dpeNumber={record.dpeNumber} />` right after `<VerifyElsewhere record={record} />`, the last child of the body.
- The keyboard hook already leaves D's textarea and its `role="radiogroup"` alone.
- `ResultDetailPanel` now also takes `total` (Task C8).

**Expected conflicts with other streams: none beyond the contract.**
- `scripts/boundaries/manifest.mjs`: only the `ademe` and `geo` `public` arrays. D edits the `listing` domain's `schemas`/`dirs` arrays, a separate hunk.
- `en.json` / `fr.json`: only lines inside `"Listing"`. The first line changed is `addressOthersHint` (line 125 on the base commit), and lines 1–96 (through `"Listing": {`) stay untouched. I checked that the base commit's first 95 lines are byte-identical after C10. D inserts before line 96, and A edits namespaces above it. Keys removed: `listingOpen`, `linkInsee`, `linkInseeHint`. Existing values edited in place: `addressOthersHint`, `addressPrevious`, `addressNext`, `verifyNoticeBody`, `detailClose`, `detailDpe`, `detailGes`, `factFloor`.
- Stream C imports none of D's files, and all its files are its own under `dashboard/components/listing/` and the five `core` modules.

## Stream D — Feedback loop (branch `stream/d-feedback`)

### Task D1: Feedback vocabulary, repository port, table and migration

**Files:**
- Create: `src/core/listing/feedback.ts`
- Create: `src/core/listing/feedback.test.ts`
- Create: `src/core/listing/ports/listing-feedback-repository.port.ts`
- Create: `src/infra/database/schema/listing-feedback-schema.ts`
- Create (generated, never hand-edited): `drizzle/0001_listing_feedback.sql`, `drizzle/meta/0001_snapshot.json`
- Modify (generated): `drizzle/meta/_journal.json`
- Modify: `scripts/boundaries/manifest.mjs` (the `listing` domain's `schemas` array only)

**Interfaces:**
- Consumes: `Result` from `neverthrow`; `AppError` from `src/core/errors.ts`; `pgEnum`, `pgTable`, `uuid`, `text`, `jsonb`, `timestamp`, `uniqueIndex`, `check` from `drizzle-orm/pg-core`.
- Produces, in `src/core/listing/feedback.ts`:
  ```ts
  export const FEEDBACK_VERDICTS: readonly ['confirmed', 'none_match'];
  export type FeedbackVerdict = 'confirmed' | 'none_match';
  export const FEEDBACK_REASONS: readonly ['wrong_commune', 'wrong_dwellings', 'address_missing', 'unsure'];
  export type FeedbackReason = 'wrong_commune' | 'wrong_dwellings' | 'address_missing' | 'unsure';
  export type FeedbackCandidate = { dpeNumber: string; score: number };
  export const MAX_FEEDBACK_CANDIDATES = 10;
  export const MAX_FEEDBACK_COMMENT_LENGTH = 1000;
  export const MAX_FEEDBACK_LISTING_URL_LENGTH = 2000;
  export const MAX_FEEDBACK_DPE_NUMBER_LENGTH = 64;
  export type FeedbackAnswer = { verdict: FeedbackVerdict; confirmedDpeNumber: string | null };
  export type StoredFeedback = FeedbackAnswer & { id: string; searchId: string; listingUrl: string; reason: FeedbackReason | null; comment: string | null; candidates: readonly FeedbackCandidate[]; createdAt: Date; updatedAt: Date };
  export function isSameAnswer(stored: FeedbackAnswer, requested: FeedbackAnswer): boolean;
  export function isFeedbackReason(value: unknown): value is FeedbackReason;
  export function toFeedbackCandidates(shown: readonly { record: { dpeNumber: string }; confidence: number }[]): FeedbackCandidate[];
  ```
- Produces, in `src/core/listing/ports/listing-feedback-repository.port.ts`:
  ```ts
  export type NewFeedbackVerdict = { searchId: string; listingUrl: string; verdict: FeedbackVerdict; confirmedDpeNumber: string | null; candidates: readonly FeedbackCandidate[] };
  export type FeedbackDetail = { searchId: string; reason: FeedbackReason | null; comment: string | null };
  export type SavedVerdict = { feedback: StoredFeedback; inserted: boolean };
  export type SavedDetail = { kind: 'saved'; feedback: StoredFeedback } | { kind: 'no_verdict' } | { kind: 'other_verdict'; verdict: FeedbackVerdict };
  export interface IListingFeedbackRepository {
    saveVerdict(input: NewFeedbackVerdict): Promise<Result<SavedVerdict, AppError>>;
    saveDetail(input: FeedbackDetail): Promise<Result<SavedDetail, AppError>>;
  }
  ```
- Produces, in `src/infra/database/schema/listing-feedback-schema.ts`: `listingFeedbackVerdict` (pgEnum `listing_feedback_verdict`), `listingFeedbackReason` (pgEnum `listing_feedback_reason`), `listingFeedback` (table `listing_feedback`).

The replay decision (same answer = success, different answer = conflict) lives in `isSameAnswer`, a pure function, and is taken by the use case (Task D3). The repository (Task D2) only does the atomic writes and reports what is stored. That keeps the idempotency rule unit-testable in core and makes the use-case tests against a fake repository exercise real logic instead of the fake.

- [ ] **Step 1: Write the failing core test**

Create `src/core/listing/feedback.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  FEEDBACK_REASONS,
  FEEDBACK_VERDICTS,
  isFeedbackReason,
  isSameAnswer,
  MAX_FEEDBACK_CANDIDATES,
  toFeedbackCandidates,
} from './feedback';

describe('feedback vocabulary', () => {
  it('lists the two verdicts the results view can send', () => {
    expect(FEEDBACK_VERDICTS).toEqual(['confirmed', 'none_match']);
  });

  it('lists the four reasons of the none-match form', () => {
    expect(FEEDBACK_REASONS).toEqual([
      'wrong_commune',
      'wrong_dwellings',
      'address_missing',
      'unsure',
    ]);
  });
});

describe('isSameAnswer', () => {
  it('treats a repeated confirmation of the same dwelling as a replay', () => {
    expect(
      isSameAnswer(
        { verdict: 'confirmed', confirmedDpeNumber: '2269E0123456A' },
        { verdict: 'confirmed', confirmedDpeNumber: '2269E0123456A' },
      ),
    ).toBe(true);
  });

  it('treats a repeated none-match as a replay', () => {
    expect(
      isSameAnswer(
        { verdict: 'none_match', confirmedDpeNumber: null },
        { verdict: 'none_match', confirmedDpeNumber: null },
      ),
    ).toBe(true);
  });

  it('treats a confirmation of another dwelling as a different answer', () => {
    expect(
      isSameAnswer(
        { verdict: 'confirmed', confirmedDpeNumber: '2269E0123456A' },
        { verdict: 'confirmed', confirmedDpeNumber: '2269E0999999B' },
      ),
    ).toBe(false);
  });

  it('treats none-match after a confirmation as a different answer', () => {
    expect(
      isSameAnswer(
        { verdict: 'confirmed', confirmedDpeNumber: '2269E0123456A' },
        { verdict: 'none_match', confirmedDpeNumber: null },
      ),
    ).toBe(false);
  });
});

describe('isFeedbackReason', () => {
  it('accepts every listed reason', () => {
    for (const reason of FEEDBACK_REASONS) {
      expect(isFeedbackReason(reason)).toBe(true);
    }
  });

  it('rejects anything else', () => {
    expect(isFeedbackReason('other')).toBe(false);
    expect(isFeedbackReason(null)).toBe(false);
    expect(isFeedbackReason(undefined)).toBe(false);
    expect(isFeedbackReason(1)).toBe(false);
  });
});

describe('toFeedbackCandidates', () => {
  it('keeps each shown dwelling and its score, in the shown order', () => {
    expect(
      toFeedbackCandidates([
        { record: { dpeNumber: '2269E0123456A' }, confidence: 0.93 },
        { record: { dpeNumber: '2269E0999999B' }, confidence: 0.71 },
      ]),
    ).toEqual([
      { dpeNumber: '2269E0123456A', score: 0.93 },
      { dpeNumber: '2269E0999999B', score: 0.71 },
    ]);
  });

  it('keeps at most the ten candidates a result can show', () => {
    const shown = Array.from({ length: 12 }, (_, i) => ({
      record: { dpeNumber: `2269E00000${String(i).padStart(2, '0')}A` },
      confidence: 0.5,
    }));

    const candidates = toFeedbackCandidates(shown);

    expect(candidates).toHaveLength(MAX_FEEDBACK_CANDIDATES);
    expect(candidates[9]?.dpeNumber).toBe('2269E0000009A');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm vitest run src/core/listing/feedback.test.ts
```

Expected: FAIL — `Failed to resolve import "./feedback" from "src/core/listing/feedback.test.ts". Does the file exist?`

- [ ] **Step 3: Write the core module**

Create `src/core/listing/feedback.ts`:

```ts
export const FEEDBACK_VERDICTS = ['confirmed', 'none_match'] as const;
export type FeedbackVerdict = (typeof FEEDBACK_VERDICTS)[number];

export const FEEDBACK_REASONS = [
  'wrong_commune',
  'wrong_dwellings',
  'address_missing',
  'unsure',
] as const;
export type FeedbackReason = (typeof FEEDBACK_REASONS)[number];

export type FeedbackCandidate = { dpeNumber: string; score: number };

export const MAX_FEEDBACK_CANDIDATES = 10;
export const MAX_FEEDBACK_COMMENT_LENGTH = 1000;
export const MAX_FEEDBACK_LISTING_URL_LENGTH = 2000;
export const MAX_FEEDBACK_DPE_NUMBER_LENGTH = 64;

export type FeedbackAnswer = {
  verdict: FeedbackVerdict;
  confirmedDpeNumber: string | null;
};

export type StoredFeedback = FeedbackAnswer & {
  id: string;
  searchId: string;
  listingUrl: string;
  reason: FeedbackReason | null;
  comment: string | null;
  candidates: readonly FeedbackCandidate[];
  createdAt: Date;
  updatedAt: Date;
};

// why: a replay (double click, network retry) repeats the same answer. A
// confirmation of another dwelling is a different answer, not a replay.
export function isSameAnswer(
  stored: FeedbackAnswer,
  requested: FeedbackAnswer,
): boolean {
  return (
    stored.verdict === requested.verdict &&
    stored.confirmedDpeNumber === requested.confirmedDpeNumber
  );
}

export function isFeedbackReason(value: unknown): value is FeedbackReason {
  return FEEDBACK_REASONS.some((reason) => reason === value);
}

export function toFeedbackCandidates(
  shown: readonly { record: { dpeNumber: string }; confidence: number }[],
): FeedbackCandidate[] {
  return shown.slice(0, MAX_FEEDBACK_CANDIDATES).map((candidate) => ({
    dpeNumber: candidate.record.dpeNumber,
    score: candidate.confidence,
  }));
}
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm vitest run src/core/listing/feedback.test.ts
```

Expected: `Test Files  1 passed (1)`, `Tests  10 passed (10)`.

- [ ] **Step 5: Write the repository port**

Create `src/core/listing/ports/listing-feedback-repository.port.ts`:

```ts
import type { Result } from 'neverthrow';
import type { AppError } from '@/core/errors';
import type {
  FeedbackCandidate,
  FeedbackReason,
  FeedbackVerdict,
  StoredFeedback,
} from '../feedback';

export type NewFeedbackVerdict = {
  searchId: string;
  listingUrl: string;
  verdict: FeedbackVerdict;
  confirmedDpeNumber: string | null;
  candidates: readonly FeedbackCandidate[];
};

export type FeedbackDetail = {
  searchId: string;
  reason: FeedbackReason | null;
  comment: string | null;
};

export type SavedVerdict = { feedback: StoredFeedback; inserted: boolean };

export type SavedDetail =
  | { kind: 'saved'; feedback: StoredFeedback }
  | { kind: 'no_verdict' }
  | { kind: 'other_verdict'; verdict: FeedbackVerdict };

export interface IListingFeedbackRepository {
  // why: one verdict per search. When the search already has one, that row is
  // returned untouched and the caller decides whether the request replays it.
  saveVerdict(
    input: NewFeedbackVerdict,
  ): Promise<Result<SavedVerdict, AppError>>;

  // why: reason and comment only ever complete a none_match verdict; the
  // outcome says why nothing was written otherwise.
  saveDetail(input: FeedbackDetail): Promise<Result<SavedDetail, AppError>>;
}
```

- [ ] **Step 6: Write the table schema**

Create `src/infra/database/schema/listing-feedback-schema.ts`. It does not use `columns-helpers.ts`'s `timestamps`: that helper adds a `deleted_at` column and uses `timestamp` without time zone, while the spec asks for `created_at`/`updated_at` as `timestamptz` and nothing else.

```ts
import { sql } from 'drizzle-orm';
import {
  check,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// why: the values mirror FEEDBACK_VERDICTS and FEEDBACK_REASONS in
// core/listing/feedback.ts; a schema file may not import a domain module.
// The repository test pins both lists to the core ones.
export const listingFeedbackVerdict = pgEnum('listing_feedback_verdict', [
  'confirmed',
  'none_match',
]);

export const listingFeedbackReason = pgEnum('listing_feedback_reason', [
  'wrong_commune',
  'wrong_dwellings',
  'address_missing',
  'unsure',
]);

export const listingFeedback = pgTable(
  'listing_feedback',
  {
    id: uuid().defaultRandom().primaryKey(),
    searchId: uuid().notNull(),
    listingUrl: text().notNull(),
    verdict: listingFeedbackVerdict().notNull(),
    confirmedDpeNumber: text(),
    reason: listingFeedbackReason(),
    comment: text(),
    candidates: jsonb()
      .$type<{ dpeNumber: string; score: number }[]>()
      .notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('listing_feedback_search_id_unique').on(table.searchId),
    check(
      'listing_feedback_confirmed_dpe_number_check',
      sql`(${table.verdict} = 'confirmed') = (${table.confirmedDpeNumber} is not null)`,
    ),
    check(
      'listing_feedback_detail_check',
      sql`${table.verdict} = 'none_match' or (${table.reason} is null and ${table.comment} is null)`,
    ),
    check(
      'listing_feedback_comment_length_check',
      sql`char_length(${table.comment}) <= 1000`,
    ),
  ],
).enableRLS();
```

- [ ] **Step 7: Give the schema to the `listing` domain**

In `scripts/boundaries/manifest.mjs`, replace:

```js
      'src/app/api/listings',
    ],
    schemas: [],
```

with:

```js
      'src/app/api/listings',
    ],
    schemas: ['src/infra/database/schema/listing-feedback-schema'],
```

(`'src/app/api/listings'` is the last `dirs` entry of the `listing` domain only, so the match is unique.)

- [ ] **Step 8: Generate the migration**

`drizzle-kit` loads `.env` itself (it bundles `dotenv/config`) and `generate` never connects to the database: it only diffs the schema files against `drizzle/meta/0000_snapshot.json`. The fallback URL below makes the step work in a worktree without `.env`; it is never dialled.

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; DATABASE_URL="${DATABASE_URL:-postgres://generate-only@localhost:5432/unused}" pnpm drizzle:generate --name listing_feedback
```

Expected: the table list includes `listing_feedback 10 columns 1 indexes 0 fks` and the last line is `[✓] Your SQL migration file ➜ drizzle/0001_listing_feedback.sql 🚀`. (On the base commit, the same command without the schema change prints `No schema changes, nothing to migrate` — the baseline snapshot matches the schema, so the migration holds only this table.)

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; git status --short drizzle && cat drizzle/0001_listing_feedback.sql
```

Expected:

```
 M drizzle/meta/_journal.json
?? drizzle/0001_listing_feedback.sql
?? drizzle/meta/0001_snapshot.json
```

and the SQL file reads exactly:

```sql
CREATE TYPE "public"."listing_feedback_reason" AS ENUM('wrong_commune', 'wrong_dwellings', 'address_missing', 'unsure');--> statement-breakpoint
CREATE TYPE "public"."listing_feedback_verdict" AS ENUM('confirmed', 'none_match');--> statement-breakpoint
CREATE TABLE "listing_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"search_id" uuid NOT NULL,
	"listing_url" text NOT NULL,
	"verdict" "listing_feedback_verdict" NOT NULL,
	"confirmed_dpe_number" text,
	"reason" "listing_feedback_reason",
	"comment" text,
	"candidates" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_feedback_confirmed_dpe_number_check" CHECK (("listing_feedback"."verdict" = 'confirmed') = ("listing_feedback"."confirmed_dpe_number" is not null)),
	CONSTRAINT "listing_feedback_detail_check" CHECK ("listing_feedback"."verdict" = 'none_match' or ("listing_feedback"."reason" is null and "listing_feedback"."comment" is null)),
	CONSTRAINT "listing_feedback_comment_length_check" CHECK (char_length("listing_feedback"."comment") <= 1000)
);
--> statement-breakpoint
ALTER TABLE "listing_feedback" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "listing_feedback_search_id_unique" ON "listing_feedback" USING btree ("search_id");
```

If it differs (other columns, other tables, snake_case missing in a `CHECK`), do not edit the SQL: fix the schema file, discard the three generated changes and generate again:

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; git checkout -- drizzle/meta/_journal.json && rm drizzle/0001_listing_feedback.sql drizzle/meta/0001_snapshot.json
```

The migration is not applied to any database in this task.

- [ ] **Step 9: Verify**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm type-check && pnpm lint && pnpm check && pnpm check:boundaries && pnpm test
```

Expected: `tsc` and `eslint` print nothing after their headers; biome prints `No fixes applied` with the 13 warnings that exist on the base commit and no error; `Domain boundaries OK.`; every vitest file passes (the new `feedback.test.ts` among them). Without Step 7 the checker would fail on `schema-unowned`.

- [ ] **Step 10: Commit**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; git add src/core/listing/feedback.ts src/core/listing/feedback.test.ts src/core/listing/ports/listing-feedback-repository.port.ts src/infra/database/schema/listing-feedback-schema.ts drizzle/0001_listing_feedback.sql drizzle/meta/0001_snapshot.json drizzle/meta/_journal.json scripts/boundaries/manifest.mjs && git commit -m "$(cat <<'EOF'
feat(listing): listing_feedback table and feedback vocabulary

One row per displayed result, unique on search_id: the user's verdict
(confirmed or none_match), the confirmed DPE number, an optional reason
and comment, and the candidates shown. No user id, IP or e-mail.
Migration generated with drizzle-kit. The replay rule is a pure function
in core so the use case owns the idempotency decision.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task D2: Feedback repository with idempotent writes

**Files:**
- Create: `src/infra/data-access/listing-feedback/listing-feedback-repository.ts`
- Create: `src/infra/data-access/listing-feedback/listing-feedback-repository.test.ts`
- Modify: `scripts/boundaries/manifest.mjs` (the `listing` domain's `dirs` array only)

**Interfaces:**
- Consumes: `IListingFeedbackRepository`, `NewFeedbackVerdict`, `FeedbackDetail`, `SavedVerdict`, `SavedDetail` (Task D1 port); `FEEDBACK_VERDICTS`, `FEEDBACK_REASONS`, `StoredFeedback` (Task D1 core); `listingFeedback`, `listingFeedbackVerdict`, `listingFeedbackReason` (Task D1 schema); `db` from `src/infra/database/connection.ts`; `log` from `src/shared/logger.ts`; `unknown`, `AppError` from `src/core/errors.ts`.
- Produces: `export const listingFeedbackRepository: IListingFeedbackRepository` in `src/infra/data-access/listing-feedback/listing-feedback-repository.ts`.
  - `saveVerdict(input)`: `INSERT … ON CONFLICT (search_id) DO NOTHING RETURNING *`; when nothing was inserted, reads the row stored for `searchId`. Returns `ok({ feedback, inserted })` — `inserted: false` means the stored row was left untouched, whatever it holds. A database failure returns `err({ code: 'db_error' })`; a stored row that fails validation returns `err({ code: 'unknown' })`.
  - `saveDetail(input)`: `UPDATE … SET reason, comment WHERE search_id = $1 AND verdict = 'none_match' RETURNING *`; when nothing was updated, reads the row to report `{ kind: 'no_verdict' }` or `{ kind: 'other_verdict', verdict }`.

`src/infra/database/connection.ts` is left alone: its `schema` map only feeds drizzle's relational `db.query.*` API, and this repository uses the query builder (`db.insert/select/update`), which needs no registration.

- [ ] **Step 1: Register the repository directory in the `listing` domain**

In `scripts/boundaries/manifest.mjs`, replace:

```js
      'src/infra/external-apis/groq',
      'src/app/api/listings',
```

with:

```js
      'src/infra/external-apis/groq',
      'src/infra/data-access/listing-feedback',
      'src/app/api/listings',
```

Without it, the new files fail the checker's `unassigned-file` rule and the test's import of the schema fails `schema-ownership` (only the owning domain's infra may import a schema).

- [ ] **Step 2: Write the failing repository test**

Create `src/infra/data-access/listing-feedback/listing-feedback-repository.test.ts` (same approach as `src/infra/data-access/file/file-repo.test.ts`: only `db` and the drizzle condition builders are faked):

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Only `db` and the drizzle-orm condition builders are faked (in-memory), so
// these tests run the real repository code: a missing verdict filter on the
// detail update, or an insert that overwrites, genuinely fails them.
const fake = vi.hoisted(() => {
  type FakeRow = Record<string, unknown>;
  type FakeTable = Record<string, unknown>;
  type FakeCond =
    | { kind: 'eq'; column: unknown; value: unknown }
    | { kind: 'and'; conditions: FakeCond[] };

  const store: FakeRow[] = [];
  const state = { nextId: 1, failing: false };

  function columnKey(table: FakeTable, column: unknown): string {
    const entry = Object.entries(table).find(([, value]) => value === column);
    if (!entry) throw new Error('fake db: unmapped column');
    return entry[0];
  }

  function matches(table: FakeTable, row: FakeRow, cond?: FakeCond): boolean {
    if (!cond) return true;
    if (cond.kind === 'and') {
      return cond.conditions.every((sub) => matches(table, row, sub));
    }
    return row[columnKey(table, cond.column)] === cond.value;
  }

  function guard(): void {
    if (state.failing) throw new Error('fake db: connection reset');
  }

  class FakeQuery implements PromiseLike<FakeRow[]> {
    constructor(private readonly run: () => FakeRow[]) {}
    // biome-ignore lint/suspicious/noThenProperty: mimics drizzle-orm's thenable query builder.
    then<TResult1 = FakeRow[], TResult2 = never>(
      onfulfilled?:
        | ((value: FakeRow[]) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?:
        | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
        | null,
    ): PromiseLike<TResult1 | TResult2> {
      return new Promise<FakeRow[]>((resolve) => {
        guard();
        resolve(this.run());
      }).then(onfulfilled, onrejected);
    }
  }

  const db = {
    select: () => ({
      from: (table: FakeTable) => ({
        where: (cond?: FakeCond) => ({
          limit: (n: number) =>
            new FakeQuery(() =>
              store.filter((row) => matches(table, row, cond)).slice(0, n),
            ),
        }),
      }),
    }),
    insert: (table: FakeTable) => ({
      values: (values: FakeRow) => ({
        onConflictDoNothing: ({ target }: { target: unknown }) => ({
          returning: () =>
            new FakeQuery(() => {
              const key = columnKey(table, target);
              if (store.some((row) => row[key] === values[key])) return [];
              const now = new Date();
              const row: FakeRow = {
                id: `feedback-${state.nextId++}`,
                reason: null,
                comment: null,
                createdAt: now,
                updatedAt: now,
                ...values,
              };
              store.push(row);
              return [row];
            }),
        }),
      }),
    }),
    update: (table: FakeTable) => ({
      set: (values: FakeRow) => ({
        where: (cond?: FakeCond) => ({
          returning: () =>
            new FakeQuery(() => {
              const updated: FakeRow[] = [];
              for (let i = 0; i < store.length; i += 1) {
                const row = store[i];
                if (row && matches(table, row, cond)) {
                  const next = { ...row, ...values, updatedAt: new Date() };
                  store[i] = next;
                  updated.push(next);
                }
              }
              return updated;
            }),
        }),
      }),
    }),
  };

  return {
    db,
    store,
    reset: () => {
      store.length = 0;
      state.nextId = 1;
      state.failing = false;
    },
    fail: () => {
      state.failing = true;
    },
  };
});

vi.mock('@/infra/database/connection', () => ({ db: fake.db }));

vi.mock('@/shared/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return {
    ...actual,
    eq: (column: unknown, value: unknown) => ({ kind: 'eq', column, value }),
    and: (...conditions: unknown[]) => ({
      kind: 'and',
      conditions: conditions.filter((c) => c !== undefined),
    }),
  };
});

import { FEEDBACK_REASONS, FEEDBACK_VERDICTS } from '@/core/listing/feedback';
import {
  listingFeedbackReason,
  listingFeedbackVerdict,
} from '@/infra/database/schema/listing-feedback-schema';
import { listingFeedbackRepository } from './listing-feedback-repository';

const SEARCH_ID = '6f1c2a4e-8d3b-4c5a-9e7f-0a1b2c3d4e5f';
const LISTING_URL =
  'https://www.leboncoin.fr/ad/ventes_immobilieres/3132785420';
const CANDIDATES = [
  { dpeNumber: '2269E0123456A', score: 0.93 },
  { dpeNumber: '2269E0999999B', score: 0.71 },
];

function confirmation(dpeNumber: string) {
  return {
    searchId: SEARCH_ID,
    listingUrl: LISTING_URL,
    verdict: 'confirmed' as const,
    confirmedDpeNumber: dpeNumber,
    candidates: CANDIDATES,
  };
}

const NONE_MATCH = {
  searchId: SEARCH_ID,
  listingUrl: LISTING_URL,
  verdict: 'none_match' as const,
  confirmedDpeNumber: null,
  candidates: CANDIDATES,
};

beforeEach(() => {
  fake.reset();
});

describe('listing feedback enums', () => {
  it('mirror the verdicts and reasons of core/listing/feedback', () => {
    expect(listingFeedbackVerdict.enumValues).toEqual([...FEEDBACK_VERDICTS]);
    expect(listingFeedbackReason.enumValues).toEqual([...FEEDBACK_REASONS]);
  });
});

describe('listingFeedbackRepository.saveVerdict', () => {
  it('stores a first verdict and maps the row', async () => {
    const saved = await listingFeedbackRepository.saveVerdict(
      confirmation('2269E0123456A'),
    );

    expect(saved.isOk()).toBe(true);
    if (saved.isErr()) return;
    expect(saved.value.inserted).toBe(true);
    expect(saved.value.feedback).toMatchObject({
      searchId: SEARCH_ID,
      listingUrl: LISTING_URL,
      verdict: 'confirmed',
      confirmedDpeNumber: '2269E0123456A',
      reason: null,
      comment: null,
      candidates: CANDIDATES,
    });
    expect(fake.store).toHaveLength(1);
  });

  it('returns the stored row untouched when the search already has a verdict', async () => {
    await listingFeedbackRepository.saveVerdict(confirmation('2269E0123456A'));

    const again = await listingFeedbackRepository.saveVerdict(NONE_MATCH);

    expect(again.isOk()).toBe(true);
    if (again.isErr()) return;
    expect(again.value.inserted).toBe(false);
    expect(again.value.feedback.verdict).toBe('confirmed');
    expect(again.value.feedback.confirmedDpeNumber).toBe('2269E0123456A');
    expect(fake.store).toHaveLength(1);
  });

  it('refuses a stored row whose candidates are malformed', async () => {
    fake.store.push({
      id: 'feedback-corrupt',
      searchId: SEARCH_ID,
      listingUrl: LISTING_URL,
      verdict: 'none_match',
      confirmedDpeNumber: null,
      reason: null,
      comment: null,
      candidates: [{ dpeNumber: 42 }],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const saved = await listingFeedbackRepository.saveVerdict(NONE_MATCH);

    expect(saved.isErr()).toBe(true);
    if (saved.isOk()) return;
    expect(saved.error.code).toBe('unknown');
  });

  it('returns a db_error when the database fails', async () => {
    fake.fail();

    const saved = await listingFeedbackRepository.saveVerdict(NONE_MATCH);

    expect(saved.isErr()).toBe(true);
    if (saved.isOk()) return;
    expect(saved.error.code).toBe('db_error');
  });
});

describe('listingFeedbackRepository.saveDetail', () => {
  it('completes a none_match verdict with its reason and comment', async () => {
    await listingFeedbackRepository.saveVerdict(NONE_MATCH);

    const saved = await listingFeedbackRepository.saveDetail({
      searchId: SEARCH_ID,
      reason: 'wrong_commune',
      comment: 'La maison est à Melesse.',
    });

    expect(saved.isOk()).toBe(true);
    if (saved.isErr()) return;
    expect(saved.value.kind).toBe('saved');
    expect(fake.store[0]).toMatchObject({
      reason: 'wrong_commune',
      comment: 'La maison est à Melesse.',
    });
  });

  it('never writes a detail onto a confirmation', async () => {
    await listingFeedbackRepository.saveVerdict(confirmation('2269E0123456A'));

    const saved = await listingFeedbackRepository.saveDetail({
      searchId: SEARCH_ID,
      reason: 'unsure',
      comment: null,
    });

    expect(saved.isOk()).toBe(true);
    if (saved.isErr()) return;
    expect(saved.value).toEqual({
      kind: 'other_verdict',
      verdict: 'confirmed',
    });
    expect(fake.store[0]).toMatchObject({ reason: null, comment: null });
  });

  it('reports a search that has no verdict', async () => {
    const saved = await listingFeedbackRepository.saveDetail({
      searchId: SEARCH_ID,
      reason: 'unsure',
      comment: null,
    });

    expect(saved.isOk()).toBe(true);
    if (saved.isErr()) return;
    expect(saved.value).toEqual({ kind: 'no_verdict' });
  });

  it('returns a db_error when the database fails', async () => {
    fake.fail();

    const saved = await listingFeedbackRepository.saveDetail({
      searchId: SEARCH_ID,
      reason: 'unsure',
      comment: null,
    });

    expect(saved.isErr()).toBe(true);
    if (saved.isOk()) return;
    expect(saved.error.code).toBe('db_error');
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm vitest run src/infra/data-access/listing-feedback
```

Expected: FAIL — `Failed to resolve import "./listing-feedback-repository" from "src/infra/data-access/listing-feedback/listing-feedback-repository.test.ts". Does the file exist?`

- [ ] **Step 4: Write the repository**

Create `src/infra/data-access/listing-feedback/listing-feedback-repository.ts`:

```ts
import 'server-only';

import { and, eq } from 'drizzle-orm';
import { err, ok, type Result } from 'neverthrow';
import * as v from 'valibot';
import { type AppError, unknown } from '@/core/errors';
import {
  FEEDBACK_REASONS,
  FEEDBACK_VERDICTS,
  type StoredFeedback,
} from '@/core/listing/feedback';
import type {
  FeedbackDetail,
  IListingFeedbackRepository,
  NewFeedbackVerdict,
  SavedDetail,
  SavedVerdict,
} from '@/core/listing/ports/listing-feedback-repository.port';
import { db } from '@/infra/database/connection';
import { listingFeedback } from '@/infra/database/schema/listing-feedback-schema';
import { log } from '@/shared/logger';

type ListingFeedbackRow = typeof listingFeedback.$inferSelect;

const VerdictSchema = v.picklist(FEEDBACK_VERDICTS);
const ReasonSchema = v.nullable(v.picklist(FEEDBACK_REASONS));
const CandidatesSchema = v.array(
  v.object({ dpeNumber: v.string(), score: v.number() }),
);

function dbError(message: string): AppError {
  return { code: 'db_error', message };
}

function rowToFeedback(
  row: ListingFeedbackRow,
): Result<StoredFeedback, AppError> {
  const verdict = v.safeParse(VerdictSchema, row.verdict);
  const reason = v.safeParse(ReasonSchema, row.reason);
  const candidates = v.safeParse(CandidatesSchema, row.candidates);
  if (!verdict.success || !reason.success || !candidates.success) {
    return err(unknown(`Invalid listing_feedback row ${row.id}`));
  }
  return ok({
    id: row.id,
    searchId: row.searchId,
    listingUrl: row.listingUrl,
    verdict: verdict.output,
    confirmedDpeNumber: row.confirmedDpeNumber,
    reason: reason.output,
    comment: row.comment,
    candidates: candidates.output,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

async function findBySearchId(
  searchId: string,
): Promise<ListingFeedbackRow | undefined> {
  const [row] = await db
    .select()
    .from(listingFeedback)
    .where(eq(listingFeedback.searchId, searchId))
    .limit(1);
  return row;
}

async function saveVerdict(
  input: NewFeedbackVerdict,
): Promise<Result<SavedVerdict, AppError>> {
  try {
    const inserted = await db
      .insert(listingFeedback)
      .values({
        searchId: input.searchId,
        listingUrl: input.listingUrl,
        verdict: input.verdict,
        confirmedDpeNumber: input.confirmedDpeNumber,
        candidates: [...input.candidates],
      })
      .onConflictDoNothing({ target: listingFeedback.searchId })
      .returning();
    const row = inserted[0] ?? (await findBySearchId(input.searchId));
    if (!row) {
      return err(dbError('listing_feedback row missing after insert'));
    }
    const feedback = rowToFeedback(row);
    if (feedback.isErr()) return err(feedback.error);
    return ok({ feedback: feedback.value, inserted: inserted.length > 0 });
  } catch (e) {
    log.error('listing.feedback.repository.save_verdict_crashed', e, {
      searchId: input.searchId,
    });
    return err(dbError('Failed to save the listing feedback verdict'));
  }
}

async function saveDetail(
  input: FeedbackDetail,
): Promise<Result<SavedDetail, AppError>> {
  try {
    const [updated] = await db
      .update(listingFeedback)
      .set({ reason: input.reason, comment: input.comment })
      .where(
        and(
          eq(listingFeedback.searchId, input.searchId),
          eq(listingFeedback.verdict, 'none_match'),
        ),
      )
      .returning();
    if (updated) {
      const feedback = rowToFeedback(updated);
      if (feedback.isErr()) return err(feedback.error);
      return ok({ kind: 'saved', feedback: feedback.value });
    }
    const existing = await findBySearchId(input.searchId);
    if (!existing) return ok({ kind: 'no_verdict' });
    return ok({ kind: 'other_verdict', verdict: existing.verdict });
  } catch (e) {
    log.error('listing.feedback.repository.save_detail_crashed', e, {
      searchId: input.searchId,
    });
    return err(dbError('Failed to save the listing feedback detail'));
  }
}

export const listingFeedbackRepository: IListingFeedbackRepository = {
  saveVerdict,
  saveDetail,
};
```

The `ON CONFLICT` target is the `listing_feedback_search_id_unique` unique index; Postgres infers the arbiter from it, so two concurrent first verdicts for one search store exactly one row and the loser reads it back.

- [ ] **Step 5: Run the test and watch it pass**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm vitest run src/infra/data-access/listing-feedback
```

Expected: `Test Files  1 passed (1)`, `Tests  9 passed (9)`.

- [ ] **Step 6: Verify**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm type-check && pnpm lint && pnpm check && pnpm check:boundaries && pnpm test
```

Expected: as in Task D1 Step 9 — no type or lint error, biome warnings only (13, pre-existing), `Domain boundaries OK.`, every test file passes.

- [ ] **Step 7: Commit**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; git add src/infra/data-access/listing-feedback/listing-feedback-repository.ts src/infra/data-access/listing-feedback/listing-feedback-repository.test.ts scripts/boundaries/manifest.mjs && git commit -m "$(cat <<'EOF'
feat(listing): listing feedback repository

saveVerdict inserts with ON CONFLICT (search_id) DO NOTHING and reads the
stored row back, so a replay never overwrites. saveDetail only updates a
none_match row and reports why nothing was written otherwise. Rows are
validated and mapped to StoredFeedback; failures return db_error.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task D3: Feedback use cases and DTOs

**Files:**
- Create: `src/application/listing/feedback-dto.ts`
- Create: `src/application/listing/submit-feedback.ts`
- Create: `src/application/listing/submit-feedback.test.ts`
- Create: `src/application/listing/submit-feedback-detail.ts`
- Create: `src/application/listing/submit-feedback-detail.test.ts`

**Interfaces:**
- Consumes: Task D1 core (`FEEDBACK_VERDICTS`, `FEEDBACK_REASONS`, the `MAX_FEEDBACK_*` limits, `FeedbackAnswer`, `isSameAnswer`), Task D1 port (`IListingFeedbackRepository`), Task D2 `listingFeedbackRepository`; `canonicalizeListingUrl(raw: string): string | null` from `src/core/listing/canonical-url.ts`; `parseInput`, `validation`, `conflict`, `notFound` from `src/core/errors.ts`.
- Produces, in `src/application/listing/feedback-dto.ts` (no `server-only`: the client hook of Task D6 validates responses with it):
  ```ts
  export const SubmitFeedbackInputSchema; // { searchId: uuid; listingUrl: url ≤ 2000; verdict: 'confirmed' | 'none_match'; confirmedDpeNumber?: string | null (1..64, trimmed); candidates: 1..10 × { dpeNumber: string 1..64; score: 0..1 } }, confirmedDpeNumber required iff confirmed and one of the candidates
  export type SubmitFeedbackInput = v.InferInput<typeof SubmitFeedbackInputSchema>;
  export const SubmitFeedbackDetailInputSchema; // { searchId: uuid; reason?: FeedbackReason | null; comment?: string | null (trimmed, ≤ 1000, '' → null) }, reason or comment required
  export type SubmitFeedbackDetailInput = v.InferInput<typeof SubmitFeedbackDetailInputSchema>;
  export const FeedbackReceiptSchema;       // { searchId: string; verdict: FeedbackVerdict }
  export type FeedbackReceipt = { searchId: string; verdict: FeedbackVerdict };
  export const FeedbackDetailReceiptSchema; // { searchId: string }
  export type FeedbackDetailReceipt = { searchId: string };
  ```
- Produces:
  ```ts
  export async function submitFeedback(input: SubmitFeedbackInput, deps?: { repository?: IListingFeedbackRepository }): Promise<Result<FeedbackReceipt, AppError>>;
  export async function submitFeedbackDetail(input: SubmitFeedbackDetailInput, deps?: { repository?: IListingFeedbackRepository }): Promise<Result<FeedbackDetailReceipt, AppError>>;
  ```
  Error codes: invalid input → `validation` (400); a different verdict already stored for the search → `conflict` (409); detail for a confirmed search → `conflict` (409); detail for a search without a verdict → `not_found` (404); repository failure passed through (`db_error`, 500).

- [ ] **Step 1: Write the failing use-case tests**

Create `src/application/listing/submit-feedback.test.ts`:

```ts
import { err, ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock(
  '@/infra/data-access/listing-feedback/listing-feedback-repository',
  () => ({ listingFeedbackRepository: {} }),
);

import type { AppError } from '@/core/errors';
import type { StoredFeedback } from '@/core/listing/feedback';
import type {
  IListingFeedbackRepository,
  NewFeedbackVerdict,
} from '@/core/listing/ports/listing-feedback-repository.port';
import type { SubmitFeedbackInput } from './feedback-dto';
import { submitFeedback } from './submit-feedback';

// why: mirrors the real repository contract (ON CONFLICT DO NOTHING, then
// read back), so these tests exercise the use case's own replay decision.
function inMemoryRepository(): IListingFeedbackRepository & {
  rows: Map<string, StoredFeedback>;
  calls: NewFeedbackVerdict[];
} {
  const rows = new Map<string, StoredFeedback>();
  const calls: NewFeedbackVerdict[] = [];
  return {
    rows,
    calls,
    async saveVerdict(input) {
      calls.push(input);
      const existing = rows.get(input.searchId);
      if (existing) return ok({ feedback: existing, inserted: false });
      const now = new Date();
      const feedback: StoredFeedback = {
        id: `feedback-${rows.size + 1}`,
        searchId: input.searchId,
        listingUrl: input.listingUrl,
        verdict: input.verdict,
        confirmedDpeNumber: input.confirmedDpeNumber,
        reason: null,
        comment: null,
        candidates: input.candidates,
        createdAt: now,
        updatedAt: now,
      };
      rows.set(input.searchId, feedback);
      return ok({ feedback, inserted: true });
    },
    async saveDetail() {
      return ok({ kind: 'no_verdict' });
    },
  };
}

const SEARCH_ID = '6f1c2a4e-8d3b-4c5a-9e7f-0a1b2c3d4e5f';
const CANDIDATES = [
  { dpeNumber: '2269E0123456A', score: 0.93 },
  { dpeNumber: '2269E0999999B', score: 0.71 },
];

function confirmation(
  over: Partial<SubmitFeedbackInput> = {},
): SubmitFeedbackInput {
  return {
    searchId: SEARCH_ID,
    listingUrl:
      'https://www.leboncoin.fr/ad/ventes_immobilieres/3132785420?utm_source=share',
    verdict: 'confirmed',
    confirmedDpeNumber: '2269E0123456A',
    candidates: CANDIDATES,
    ...over,
  };
}

function noneMatch(
  over: Partial<SubmitFeedbackInput> = {},
): SubmitFeedbackInput {
  return {
    searchId: SEARCH_ID,
    listingUrl: 'https://www.leboncoin.fr/ad/ventes_immobilieres/3132785420',
    verdict: 'none_match',
    candidates: CANDIDATES,
    ...over,
  };
}

describe('submitFeedback', () => {
  it('stores a confirmation with the canonical listing url', async () => {
    const repository = inMemoryRepository();

    const result = await submitFeedback(confirmation(), { repository });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value).toEqual({ searchId: SEARCH_ID, verdict: 'confirmed' });
    expect(repository.calls[0]).toEqual({
      searchId: SEARCH_ID,
      listingUrl: 'https://www.leboncoin.fr/ad/ventes_immobilieres/3132785420',
      verdict: 'confirmed',
      confirmedDpeNumber: '2269E0123456A',
      candidates: CANDIDATES,
    });
  });

  it('stores a none-match without a confirmed dwelling', async () => {
    const repository = inMemoryRepository();

    const result = await submitFeedback(noneMatch(), { repository });

    expect(result.isOk()).toBe(true);
    expect(repository.rows.get(SEARCH_ID)?.confirmedDpeNumber).toBeNull();
  });

  it('accepts a replayed confirmation of the same dwelling', async () => {
    const repository = inMemoryRepository();
    await submitFeedback(confirmation(), { repository });

    const replay = await submitFeedback(confirmation(), { repository });

    expect(replay.isOk()).toBe(true);
    expect(repository.rows.size).toBe(1);
  });

  it('refuses a none-match after a confirmation of the same search', async () => {
    const repository = inMemoryRepository();
    await submitFeedback(confirmation(), { repository });

    const second = await submitFeedback(noneMatch(), { repository });

    expect(second.isErr()).toBe(true);
    if (second.isOk()) return;
    expect(second.error.code).toBe('conflict');
    expect(repository.rows.get(SEARCH_ID)?.verdict).toBe('confirmed');
  });

  it('refuses a confirmation of another dwelling for the same search', async () => {
    const repository = inMemoryRepository();
    await submitFeedback(confirmation(), { repository });

    const second = await submitFeedback(
      confirmation({ confirmedDpeNumber: '2269E0999999B' }),
      { repository },
    );

    expect(second.isErr()).toBe(true);
    if (second.isOk()) return;
    expect(second.error.code).toBe('conflict');
  });

  it('passes a repository failure through', async () => {
    const failure: AppError = { code: 'db_error', message: 'down' };
    const repository: IListingFeedbackRepository = {
      saveVerdict: async () => err(failure),
      saveDetail: async () => err(failure),
    };

    const result = await submitFeedback(noneMatch(), { repository });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error).toEqual(failure);
  });

  it.each([
    ['a search id that is not a uuid', confirmation({ searchId: 'abc' })],
    [
      'a non-https listing url',
      confirmation({ listingUrl: 'http://www.leboncoin.fr/ad/1' }),
    ],
    [
      'a listing url over 2000 characters',
      confirmation({
        listingUrl: `https://www.leboncoin.fr/${'a'.repeat(2000)}`,
      }),
    ],
    [
      'a confirmation without a dwelling',
      confirmation({ confirmedDpeNumber: undefined }),
    ],
    [
      'a confirmation of a dwelling that was not shown',
      confirmation({ confirmedDpeNumber: '2269E0000000Z' }),
    ],
    [
      'a none-match that names a dwelling',
      noneMatch({ confirmedDpeNumber: '2269E0123456A' }),
    ],
    ['no candidates', noneMatch({ candidates: [] })],
    [
      'more than 10 candidates',
      noneMatch({
        candidates: Array.from({ length: 11 }, (_, i) => ({
          dpeNumber: `2269E00000${String(i).padStart(2, '0')}A`,
          score: 0.5,
        })),
      }),
    ],
    [
      'a score above 1',
      noneMatch({ candidates: [{ dpeNumber: '2269E0123456A', score: 93 }] }),
    ],
    [
      'a dpe number over 64 characters',
      noneMatch({ candidates: [{ dpeNumber: 'x'.repeat(65), score: 0.5 }] }),
    ],
  ])('rejects %s before any write', async (_, input) => {
    const repository = inMemoryRepository();

    const result = await submitFeedback(input, { repository });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.code).toBe('validation');
    expect(repository.calls).toHaveLength(0);
  });
});
```

Create `src/application/listing/submit-feedback-detail.test.ts`:

```ts
import { err, ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock(
  '@/infra/data-access/listing-feedback/listing-feedback-repository',
  () => ({ listingFeedbackRepository: {} }),
);

import type { AppError } from '@/core/errors';
import type { StoredFeedback } from '@/core/listing/feedback';
import type {
  FeedbackDetail,
  IListingFeedbackRepository,
  SavedDetail,
} from '@/core/listing/ports/listing-feedback-repository.port';
import { submitFeedbackDetail } from './submit-feedback-detail';

const SEARCH_ID = '6f1c2a4e-8d3b-4c5a-9e7f-0a1b2c3d4e5f';

const NONE_MATCH_ROW: StoredFeedback = {
  id: 'feedback-1',
  searchId: SEARCH_ID,
  listingUrl: 'https://www.leboncoin.fr/ad/ventes_immobilieres/3132785420',
  verdict: 'none_match',
  confirmedDpeNumber: null,
  reason: 'wrong_commune',
  comment: null,
  candidates: [{ dpeNumber: '2269E0123456A', score: 0.93 }],
  createdAt: new Date('2026-09-26T10:00:00Z'),
  updatedAt: new Date('2026-09-26T10:01:00Z'),
};

function repositoryAnswering(
  outcome: SavedDetail,
): IListingFeedbackRepository & {
  calls: FeedbackDetail[];
} {
  const calls: FeedbackDetail[] = [];
  return {
    calls,
    saveVerdict: async () => err({ code: 'unknown', message: 'not used' }),
    async saveDetail(input) {
      calls.push(input);
      return ok(outcome);
    },
  };
}

describe('submitFeedbackDetail', () => {
  it('completes a none-match verdict', async () => {
    const repository = repositoryAnswering({
      kind: 'saved',
      feedback: NONE_MATCH_ROW,
    });

    const result = await submitFeedbackDetail(
      {
        searchId: SEARCH_ID,
        reason: 'wrong_commune',
        comment: '  La maison est à Melesse.  ',
      },
      { repository },
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value).toEqual({ searchId: SEARCH_ID });
    expect(repository.calls).toEqual([
      {
        searchId: SEARCH_ID,
        reason: 'wrong_commune',
        comment: 'La maison est à Melesse.',
      },
    ]);
  });

  it('sends a blank comment as no comment', async () => {
    const repository = repositoryAnswering({
      kind: 'saved',
      feedback: NONE_MATCH_ROW,
    });

    await submitFeedbackDetail(
      { searchId: SEARCH_ID, reason: 'unsure', comment: '   ' },
      { repository },
    );

    expect(repository.calls[0]).toEqual({
      searchId: SEARCH_ID,
      reason: 'unsure',
      comment: null,
    });
  });

  it('accepts a comment without a reason', async () => {
    const repository = repositoryAnswering({
      kind: 'saved',
      feedback: NONE_MATCH_ROW,
    });

    const result = await submitFeedbackDetail(
      { searchId: SEARCH_ID, comment: 'Le bien est en viager.' },
      { repository },
    );

    expect(result.isOk()).toBe(true);
    expect(repository.calls[0]?.reason).toBeNull();
  });

  it('refuses a detail for a confirmed search', async () => {
    const repository = repositoryAnswering({
      kind: 'other_verdict',
      verdict: 'confirmed',
    });

    const result = await submitFeedbackDetail(
      { searchId: SEARCH_ID, reason: 'unsure' },
      { repository },
    );

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.code).toBe('conflict');
  });

  it('refuses a detail for a search without a verdict', async () => {
    const repository = repositoryAnswering({ kind: 'no_verdict' });

    const result = await submitFeedbackDetail(
      { searchId: SEARCH_ID, reason: 'unsure' },
      { repository },
    );

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.code).toBe('not_found');
  });

  it('passes a repository failure through', async () => {
    const failure: AppError = { code: 'db_error', message: 'down' };
    const repository: IListingFeedbackRepository = {
      saveVerdict: async () => err(failure),
      saveDetail: async () => err(failure),
    };

    const result = await submitFeedbackDetail(
      { searchId: SEARCH_ID, reason: 'unsure' },
      { repository },
    );

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error).toEqual(failure);
  });

  it.each([
    ['a search id that is not a uuid', { searchId: 'abc', reason: 'unsure' }],
    ['an unknown reason', { searchId: SEARCH_ID, reason: 'too_expensive' }],
    ['neither a reason nor a comment', { searchId: SEARCH_ID, comment: ' ' }],
    [
      'a comment over 1000 characters',
      { searchId: SEARCH_ID, comment: 'a'.repeat(1001) },
    ],
  ])('rejects %s before any write', async (_, input) => {
    const repository = repositoryAnswering({
      kind: 'saved',
      feedback: NONE_MATCH_ROW,
    });

    const result = await submitFeedbackDetail(
      input as Parameters<typeof submitFeedbackDetail>[0],
      { repository },
    );

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.code).toBe('validation');
    expect(repository.calls).toHaveLength(0);
  });
});
```

The repository module is mocked only so the test never loads `@/infra/database/connection` (which reads the environment at import); every test passes its own repository through `deps`.

- [ ] **Step 2: Run them and watch them fail**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm vitest run src/application/listing/submit-feedback
```

Expected: FAIL, both files — `Failed to resolve import "./submit-feedback" from "src/application/listing/submit-feedback.test.ts"` and `Failed to resolve import "./submit-feedback-detail" …`.

- [ ] **Step 3: Write the DTOs**

Create `src/application/listing/feedback-dto.ts`:

```ts
import * as v from 'valibot';
import {
  FEEDBACK_REASONS,
  FEEDBACK_VERDICTS,
  MAX_FEEDBACK_CANDIDATES,
  MAX_FEEDBACK_COMMENT_LENGTH,
  MAX_FEEDBACK_DPE_NUMBER_LENGTH,
  MAX_FEEDBACK_LISTING_URL_LENGTH,
} from '@/core/listing/feedback';

const SearchIdSchema = v.pipe(v.string(), v.uuid());

const DpeNumberSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(MAX_FEEDBACK_DPE_NUMBER_LENGTH),
);

const FeedbackCandidateSchema = v.object({
  dpeNumber: DpeNumberSchema,
  score: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
});

export const SubmitFeedbackInputSchema = v.pipe(
  v.object({
    searchId: SearchIdSchema,
    listingUrl: v.pipe(
      v.string(),
      v.maxLength(MAX_FEEDBACK_LISTING_URL_LENGTH),
      v.url(),
    ),
    verdict: v.picklist(FEEDBACK_VERDICTS),
    confirmedDpeNumber: v.nullish(DpeNumberSchema, null),
    candidates: v.pipe(
      v.array(FeedbackCandidateSchema),
      v.minLength(1),
      v.maxLength(MAX_FEEDBACK_CANDIDATES),
    ),
  }),
  v.forward(
    v.partialCheck(
      [['verdict'], ['confirmedDpeNumber'], ['candidates']],
      (input) =>
        input.verdict === 'confirmed'
          ? input.candidates.some(
              (candidate) => candidate.dpeNumber === input.confirmedDpeNumber,
            )
          : input.confirmedDpeNumber === null,
      'confirmedDpeNumber must name a shown candidate for a confirmation and be absent otherwise',
    ),
    ['confirmedDpeNumber'],
  ),
);

export type SubmitFeedbackInput = v.InferInput<
  typeof SubmitFeedbackInputSchema
>;

export const SubmitFeedbackDetailInputSchema = v.pipe(
  v.object({
    searchId: SearchIdSchema,
    reason: v.nullish(v.picklist(FEEDBACK_REASONS), null),
    comment: v.pipe(
      v.nullish(v.string(), ''),
      v.trim(),
      v.maxLength(MAX_FEEDBACK_COMMENT_LENGTH),
      v.transform((comment) => (comment === '' ? null : comment)),
    ),
  }),
  v.check(
    (input) => input.reason !== null || input.comment !== null,
    'A detail needs a reason or a comment',
  ),
);

export type SubmitFeedbackDetailInput = v.InferInput<
  typeof SubmitFeedbackDetailInputSchema
>;

export const FeedbackReceiptSchema = v.object({
  searchId: v.string(),
  verdict: v.picklist(FEEDBACK_VERDICTS),
});

export type FeedbackReceipt = v.InferOutput<typeof FeedbackReceiptSchema>;

export const FeedbackDetailReceiptSchema = v.object({
  searchId: v.string(),
});

export type FeedbackDetailReceipt = v.InferOutput<
  typeof FeedbackDetailReceiptSchema
>;
```

Both input schemas are idempotent on their own output (the route parses the body, the use case parses again, as `extractListing` does): `null` stays `null`, a trimmed comment stays trimmed.

- [ ] **Step 4: Write `submitFeedback`**

Create `src/application/listing/submit-feedback.ts`:

```ts
import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import { type AppError, conflict, parseInput, validation } from '@/core/errors';
import { canonicalizeListingUrl } from '@/core/listing/canonical-url';
import { type FeedbackAnswer, isSameAnswer } from '@/core/listing/feedback';
import type { IListingFeedbackRepository } from '@/core/listing/ports/listing-feedback-repository.port';
import { listingFeedbackRepository } from '@/infra/data-access/listing-feedback/listing-feedback-repository';
import { log } from '@/shared/logger';
import {
  type FeedbackReceipt,
  type SubmitFeedbackInput,
  SubmitFeedbackInputSchema,
} from './feedback-dto';

export async function submitFeedback(
  input: SubmitFeedbackInput,
  deps: { repository?: IListingFeedbackRepository } = {},
): Promise<Result<FeedbackReceipt, AppError>> {
  const parsed = parseInput(
    SubmitFeedbackInputSchema,
    input,
    'Invalid listing feedback',
  );
  if (parsed.isErr()) return err(parsed.error);

  const listingUrl = canonicalizeListingUrl(parsed.value.listingUrl);
  if (!listingUrl) {
    return err(
      validation('Listing url must be a valid https url', 'listingUrl'),
    );
  }

  const { searchId, verdict, candidates } = parsed.value;
  const answer: FeedbackAnswer = {
    verdict,
    confirmedDpeNumber: parsed.value.confirmedDpeNumber,
  };
  log.info('listing.feedback.submit.start', { searchId, verdict });

  const repository = deps.repository ?? listingFeedbackRepository;
  const saved = await repository.saveVerdict({
    searchId,
    listingUrl,
    ...answer,
    candidates,
  });
  if (saved.isErr()) {
    log.warn('listing.feedback.submit.failed', {
      searchId,
      code: saved.error.code,
    });
    return err(saved.error);
  }

  if (!isSameAnswer(saved.value.feedback, answer)) {
    log.warn('listing.feedback.submit.failed', {
      searchId,
      reason: 'conflicting_verdict',
      stored: saved.value.feedback.verdict,
      requested: verdict,
    });
    return err(conflict('This search already has a different verdict'));
  }

  log.info('listing.feedback.submit.success', {
    searchId,
    verdict,
    replayed: !saved.value.inserted,
  });
  return ok({ searchId, verdict });
}
```

- [ ] **Step 5: Write `submitFeedbackDetail`**

Create `src/application/listing/submit-feedback-detail.ts`:

```ts
import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import { type AppError, conflict, notFound, parseInput } from '@/core/errors';
import type { IListingFeedbackRepository } from '@/core/listing/ports/listing-feedback-repository.port';
import { listingFeedbackRepository } from '@/infra/data-access/listing-feedback/listing-feedback-repository';
import { log } from '@/shared/logger';
import {
  type FeedbackDetailReceipt,
  type SubmitFeedbackDetailInput,
  SubmitFeedbackDetailInputSchema,
} from './feedback-dto';

export async function submitFeedbackDetail(
  input: SubmitFeedbackDetailInput,
  deps: { repository?: IListingFeedbackRepository } = {},
): Promise<Result<FeedbackDetailReceipt, AppError>> {
  const parsed = parseInput(
    SubmitFeedbackDetailInputSchema,
    input,
    'Invalid listing feedback detail',
  );
  if (parsed.isErr()) return err(parsed.error);

  const { searchId, reason, comment } = parsed.value;
  log.info('listing.feedback.detail.start', {
    searchId,
    reason,
    hasComment: comment !== null,
  });

  const repository = deps.repository ?? listingFeedbackRepository;
  const saved = await repository.saveDetail({ searchId, reason, comment });
  if (saved.isErr()) {
    log.warn('listing.feedback.detail.failed', {
      searchId,
      code: saved.error.code,
    });
    return err(saved.error);
  }

  if (saved.value.kind === 'no_verdict') {
    log.warn('listing.feedback.detail.failed', {
      searchId,
      reason: 'no_verdict',
    });
    return err(
      notFound('No verdict was recorded for this search', 'listing_feedback'),
    );
  }

  if (saved.value.kind === 'other_verdict') {
    log.warn('listing.feedback.detail.failed', {
      searchId,
      reason: 'not_none_match',
      stored: saved.value.verdict,
    });
    return err(
      conflict('A detail only completes a none_match verdict for this search'),
    );
  }

  log.info('listing.feedback.detail.success', { searchId });
  return ok({ searchId });
}
```

The free-text comment is never logged (it may carry what the note asks users not to type); only whether one was sent.

- [ ] **Step 6: Run the tests and watch them pass**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm vitest run src/application/listing/submit-feedback
```

Expected: `Test Files  2 passed (2)`, `Tests  26 passed (26)`.

- [ ] **Step 7: Verify**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm type-check && pnpm lint && pnpm check && pnpm check:boundaries && pnpm test
```

Expected: as in Task D1 Step 9.

- [ ] **Step 8: Commit**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; git add src/application/listing/feedback-dto.ts src/application/listing/submit-feedback.ts src/application/listing/submit-feedback.test.ts src/application/listing/submit-feedback-detail.ts src/application/listing/submit-feedback-detail.test.ts && git commit -m "$(cat <<'EOF'
feat(listing): submit feedback and feedback detail use cases

Valibot DTOs for the verdict (uuid search id, https url, up to 10 shown
candidates, a confirmed DPE number that must be one of them) and for the
detail (reason and/or comment of at most 1000 characters). A replayed
answer succeeds, a different one is a conflict, and a detail is only
accepted on a none_match search.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task D4: Feedback API routes and rate-limit bucket

**Files:**
- Create: `src/app/api/listings/feedback/route.ts`
- Create: `src/app/api/listings/feedback/detail/route.ts`
- Modify: `src/application/rate-limit/apply-rate-limit.ts`
- Modify: `src/application/rate-limit/apply-rate-limit.test.ts`
- Create (temporary, never committed): `.claude/launch.json` entry `web-d`

**Interfaces:**
- Consumes: `openRoute({ req, rateLimit, event })` and `parseJsonBody(req, schema)` from `src/shared/api-route.ts`; `jsonError(error: AppError): NextResponse` from `src/shared/errors-http.ts`; Task D3's schemas and use cases.
- Produces:
  - `RateLimitBucket` gains `'listing-feedback'` (20 requests / minute, sliding window, Upstash prefix `app:ratelimit:listing-feedback`).
  - `POST /api/listings/feedback` — body `SubmitFeedbackInput`; `200 { searchId, verdict }`; errors `{ error: AppErrorCode, message }` with 400 / 409 / 429 / 500.
  - `POST /api/listings/feedback/detail` — body `SubmitFeedbackDetailInput`; `200 { searchId }`; errors 400 / 404 / 409 / 429 / 500.

Both directories sit under `src/app/api/listings`, already a `listing` domain dir in the manifest (`src/app/api/listings/match` is the only sub-path assigned to `ademe`), so the manifest does not change.

- [ ] **Step 1: Write the failing rate-limit test**

In `src/application/rate-limit/apply-rate-limit.test.ts`, replace:

```ts
  (globalThis as Record<string, unknown>).streetViewRatelimit = undefined;
  limiters.prefixes = [];
```

with:

```ts
  (globalThis as Record<string, unknown>).streetViewRatelimit = undefined;
  (globalThis as Record<string, unknown>).listingFeedbackRatelimit = undefined;
  limiters.prefixes = [];
```

and replace the end of the file:

```ts
    expect(limiters.prefixes).toEqual([
      'app:ratelimit:listing-extract',
      'app:ratelimit:street-view',
    ]);
  });
});
```

with:

```ts
    expect(limiters.prefixes).toEqual([
      'app:ratelimit:listing-extract',
      'app:ratelimit:street-view',
    ]);
  });

  it('keys listing feedback on its own counter', async () => {
    envMock.NODE_ENV = 'production';
    vi.mocked(getRedisClient).mockReturnValue(
      {} as ReturnType<typeof getRedisClient>,
    );

    const r = await applyRateLimit({
      identifier: 'ip:203.0.113.7',
      limit: 'listing-feedback',
    });

    expect(r.success).toBe(true);
    expect(limiters.prefixes).toEqual(['app:ratelimit:listing-feedback']);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm vitest run src/application/rate-limit/apply-rate-limit.test.ts
```

Expected: FAIL in `keys listing feedback on its own counter` — `expected [ 'app:ratelimit:default' ] to deeply equal [ 'app:ratelimit:listing-feedback' ]` (the unknown bucket falls through to the default limiter; vitest does not type-check).

- [ ] **Step 3: Add the bucket**

In `src/application/rate-limit/apply-rate-limit.ts`, make four edits.

Replace:

```ts
  streetViewRatelimit: Ratelimit | null | undefined;
};
```

with:

```ts
  streetViewRatelimit: Ratelimit | null | undefined;
  listingFeedbackRatelimit: Ratelimit | null | undefined;
};
```

Replace:

```ts
  const limiter = buildRatelimit('street-view', 60, '1 m');
  globalForRateLimit.streetViewRatelimit = limiter;
  return limiter;
}
```

with:

```ts
  const limiter = buildRatelimit('street-view', 60, '1 m');
  globalForRateLimit.streetViewRatelimit = limiter;
  return limiter;
}

// why: a displayed result sends at most two feedback calls, the verdict and
// its detail. 20 a minute absorbs retries without letting one caller flood
// the table.
function getListingFeedbackRatelimit(): Ratelimit | null {
  if (globalForRateLimit.listingFeedbackRatelimit !== undefined) {
    return globalForRateLimit.listingFeedbackRatelimit;
  }
  const limiter = buildRatelimit('listing-feedback', 20, '1 m');
  globalForRateLimit.listingFeedbackRatelimit = limiter;
  return limiter;
}
```

Replace:

```ts
  | 'street-view';
```

with:

```ts
  | 'street-view'
  | 'listing-feedback';
```

Replace:

```ts
  if (bucket === 'street-view') return getStreetViewRatelimit();
```

with:

```ts
  if (bucket === 'street-view') return getStreetViewRatelimit();
  if (bucket === 'listing-feedback') return getListingFeedbackRatelimit();
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm vitest run src/application/rate-limit/apply-rate-limit.test.ts
```

Expected: `Tests  4 passed (4)`.

- [ ] **Step 5: Write the verdict route**

Create `src/app/api/listings/feedback/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { SubmitFeedbackInputSchema } from '@/application/listing/feedback-dto';
import { submitFeedback } from '@/application/listing/submit-feedback';
import { openRoute, parseJsonBody } from '@/shared/api-route';
import { jsonError } from '@/shared/errors-http';
import { log } from '@/shared/logger';

export async function POST(req: Request): Promise<Response> {
  const caller = await openRoute({
    req,
    rateLimit: 'listing-feedback',
    event: 'api.listings.feedback',
  });
  if (!caller.ok) return caller.response;

  const body = await parseJsonBody(req, SubmitFeedbackInputSchema);
  if (!body.ok) return body.response;

  const result = await submitFeedback(body.value);
  if (result.isErr()) {
    log.warn('api.listings.feedback.failure', {
      code: result.error.code,
      message: result.error.message,
      authenticated: caller.caller.userId !== null,
    });
    return jsonError(result.error);
  }

  return NextResponse.json(result.value);
}
```

- [ ] **Step 6: Write the detail route**

Create `src/app/api/listings/feedback/detail/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { SubmitFeedbackDetailInputSchema } from '@/application/listing/feedback-dto';
import { submitFeedbackDetail } from '@/application/listing/submit-feedback-detail';
import { openRoute, parseJsonBody } from '@/shared/api-route';
import { jsonError } from '@/shared/errors-http';
import { log } from '@/shared/logger';

export async function POST(req: Request): Promise<Response> {
  const caller = await openRoute({
    req,
    rateLimit: 'listing-feedback',
    event: 'api.listings.feedback.detail',
  });
  if (!caller.ok) return caller.response;

  const body = await parseJsonBody(req, SubmitFeedbackDetailInputSchema);
  if (!body.ok) return body.response;

  const result = await submitFeedbackDetail(body.value);
  if (result.isErr()) {
    log.warn('api.listings.feedback.detail.failure', {
      code: result.error.code,
      message: result.error.message,
      authenticated: caller.caller.userId !== null,
    });
    return jsonError(result.error);
  }

  return NextResponse.json(result.value);
}
```

The rate limiter keys anonymous callers on their address in Redis (the existing `openRoute` behaviour); nothing about the caller is written to `listing_feedback`.

- [ ] **Step 7: Verify**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm type-check && pnpm lint && pnpm check && pnpm check:boundaries && pnpm test
```

Expected: as in Task D1 Step 9.

- [ ] **Step 8: Check the routes answer (validation paths only, no database write)**

The migration is not applied by this stream, so only requests that stop at validation are sent. If the worktree has no `.env`, copy it from the main checkout (it is gitignored):

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; test -f .env || cp /Users/ismaelmehdid/Desktop/addressfindr/.env .env
```

Add to `.claude/launch.json` (create the file with `{"version": "0.0.1", "configurations": []}` around it if it does not exist; never commit it):

```json
{
  "name": "web-d",
  "runtimeExecutable": "/usr/bin/env",
  "runtimeArgs": ["PATH=/Users/ismaelmehdid/.nvm/versions/node/v25.2.1/bin:/usr/bin:/bin:/usr/sbin:/sbin", "node", "node_modules/next/dist/bin/next", "dev", "-p", "3131"],
  "port": 3131
}
```

Start it with the preview tool (`preview_start`, name `web-d`), then:

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; curl -s -X POST http://localhost:3131/api/listings/feedback -H 'content-type: application/json' -d '{}' -w '\n%{http_code}\n'
```

Expected:

```
{"error":"validation","message":"Invalid key: Expected \"searchId\" but received undefined"}
400
```

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; curl -s -X POST http://localhost:3131/api/listings/feedback -H 'content-type: application/json' -d '{"searchId":"6f1c2a4e-8d3b-4c5a-9e7f-0a1b2c3d4e5f","listingUrl":"https://www.leboncoin.fr/ad/ventes_immobilieres/3132785420","verdict":"confirmed","confirmedDpeNumber":"2269E0000000Z","candidates":[{"dpeNumber":"2269E0123456A","score":0.93}]}' -w '\n%{http_code}\n'
```

Expected:

```
{"error":"validation","message":"confirmedDpeNumber must name a shown candidate for a confirmation and be absent otherwise"}
400
```

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; curl -s -X POST http://localhost:3131/api/listings/feedback/detail -H 'content-type: application/json' -d '{"searchId":"6f1c2a4e-8d3b-4c5a-9e7f-0a1b2c3d4e5f"}' -w '\n%{http_code}\n'
```

Expected:

```
{"error":"validation","message":"A detail needs a reason or a comment"}
400
```

A `404` means the route file is misplaced; a `429` means the bucket is live outside development (the dev server bypasses the limiter). Stop the server (`preview_stop`).

- [ ] **Step 9: Commit**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; git add src/app/api/listings/feedback/route.ts src/app/api/listings/feedback/detail/route.ts src/application/rate-limit/apply-rate-limit.ts src/application/rate-limit/apply-rate-limit.test.ts && git status --short
```

Expected: the four files staged; `.claude/launch.json` (and `.env`, ignored) not staged.

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; git commit -m "$(cat <<'EOF'
feat(listing): feedback API routes

POST /api/listings/feedback stores the verdict of a displayed result and
POST /api/listings/feedback/detail completes a none_match with a reason
and comment. Both are open routes behind a new listing-feedback rate
limit bucket (20 a minute, its own Upstash counter).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task D5: RadioGroup primitive

**Files:**
- Create: `src/components/ui/radio-group.tsx` (via the shadcn CLI, then corrected)

**Interfaces:**
- Consumes: `RadioGroup` from `@base-ui/react/radio-group` and `Radio` from `@base-ui/react/radio` (both ship in the installed `@base-ui/react` 1.4.1, no new dependency); `cn` from `src/lib/utils.ts`.
- Produces: `export function RadioGroup(props: RadioGroupPrimitive.Props): React.ReactElement` and `export function RadioGroupItem(props: RadioPrimitive.Root.Props): React.ReactElement` in `src/components/ui/radio-group.tsx`. `RadioGroupItem` renders a `<span role="radio">` plus a hidden `<input>`; wrap it with its text in a `<Label>` to label it.

`src/components/ui` has no radio primitive on the base commit (checked: alert, avatar, badge, breadcrumb, button, card, checkbox, collapsible, command, dialog, dropdown-menu, empty-state, input-group, input, label, popover, progress, scroll-area, select, separator, sheet, sidebar, skeleton, sonner, switch, table, tabs, textarea, tooltip).

- [ ] **Step 1: Add it with the shadcn CLI**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm dlx shadcn@latest add radio-group --yes
```

The `base-nova` registry item (`https://ui.shadcn.com/r/styles/base-nova/radio-group.json`, checked 2026-09-26) declares `"dependencies": ["cn"]` and its source reads `import { cn } from "cn"`, so the CLI is expected to install an npm package named `cn` and may leave that import in the file. If the CLI cannot reach the registry, skip to Step 3 and create the file from its content there; the result is identical.

- [ ] **Step 2: Check the CLI's diff and undo what it must not change**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; git status --short && git diff package.json
```

Expected: `?? src/components/ui/radio-group.tsx`, and most likely ` M package.json` / ` M pnpm-lock.yaml` with a `"cn": …` dependency added. Revert both and let pnpm prune the stray package from `node_modules`:

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; git checkout -- package.json pnpm-lock.yaml && pnpm install --frozen-lockfile
```

Expected: `git status --short` now lists only `?? src/components/ui/radio-group.tsx`. Any other file the CLI touched (`components.json`, `src/app/globals.css`, `src/lib/utils.ts`) is reverted the same way with `git checkout --`.

- [ ] **Step 3: Replace the file with the corrected primitive**

Replace the whole content of `src/components/ui/radio-group.tsx` with (the registry source, `cn` imported from `@/lib/utils`, formatted by biome):

```tsx
'use client';

import { Radio as RadioPrimitive } from '@base-ui/react/radio';
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group';
import { cn } from '@/lib/utils';

function RadioGroup({ className, ...props }: RadioGroupPrimitive.Props) {
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      className={cn('grid w-full gap-2', className)}
      {...props}
    />
  );
}

function RadioGroupItem({ className, ...props }: RadioPrimitive.Root.Props) {
  return (
    <RadioPrimitive.Root
      data-slot="radio-group-item"
      className={cn(
        'group/radio-group-item peer relative flex aspect-square size-4 shrink-0 rounded-full border border-input outline-none group-has-[:focus-visible]/field-label:ring-0 group-has-[:focus-visible]/field-label:not-data-checked:border-input after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground group-has-[:focus-visible]/field-label:data-checked:border-primary dark:data-checked:bg-primary',
        className,
      )}
      {...props}
    >
      <RadioPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="flex size-4 items-center justify-center"
      >
        <span className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-foreground" />
      </RadioPrimitive.Indicator>
    </RadioPrimitive.Root>
  );
}

export { RadioGroup, RadioGroupItem };
```

- [ ] **Step 4: Confirm no `cn` package or import survived**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; grep -rnE "from ['\"]cn['\"]" src; grep -n '"cn"' package.json; test -e node_modules/cn && echo "node_modules/cn still present"
```

Expected: no output at all.

- [ ] **Step 5: Verify**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm type-check && pnpm lint && pnpm check && pnpm check:boundaries && pnpm test
```

Expected: as in Task D1 Step 9 (biome reports no issue for the new file: it is already in the repo's format).

- [ ] **Step 6: Commit**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; git add src/components/ui/radio-group.tsx && git status --short && git commit -m "$(cat <<'EOF'
feat(ui): add the shadcn radio group primitive

Added with the shadcn CLI (base-nova style, Base UI radio). The registry
source imports cn from a package named cn; the import now points at
@/lib/utils and the package the CLI installed was removed.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

Expected from `git status --short` before the commit: only `A  src/components/ui/radio-group.tsx`.

---

### Task D6: Feedback client hook and components

**Files:**
- Create: `src/app/(app)/dashboard/components/listing/use-search-feedback.ts`
- Create: `src/app/(app)/dashboard/components/listing/confirm-listing-button.tsx`
- Create: `src/app/(app)/dashboard/components/listing/missing-listing-feedback.tsx`
- Modify: `src/i18n/messages/en.json`, `src/i18n/messages/fr.json` (new top-level namespace `ListingFeedback`, inserted immediately before `"Listing": {`)

**Interfaces:**
- Consumes: `FeedbackReceiptSchema`, `FeedbackDetailReceiptSchema` (Task D3); `FEEDBACK_REASONS`, `FeedbackReason`, `FeedbackVerdict`, `FeedbackCandidate`, `isFeedbackReason`, `toFeedbackCandidates`, `MAX_FEEDBACK_COMMENT_LENGTH` (Task D1); `RadioGroup`, `RadioGroupItem` (Task D5); `Button`, `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `Label`, `Textarea` from `src/components/ui/*`; the routes of Task D4.
- Produces (the cross-stream contract, exactly):
  ```ts
  // use-search-feedback.ts
  export type SearchFeedback = {
    verdict:
      | { kind: 'none' }
      | { kind: 'confirmed'; dpeNumber: string }
      | { kind: 'none_match'; detailSent: boolean };
    verdictStatus: 'idle' | 'sending' | 'failed';
    detailStatus: 'idle' | 'sending' | 'failed';
    confirm: (dpeNumber: string) => void;
    reportNoneMatch: () => void;
    sendDetail: (detail: { reason: FeedbackReason | null; comment: string }) => void;
  };
  export function useSearchFeedback(input: {
    listingUrl: string;
    candidates: readonly { record: { dpeNumber: string }; confidence: number }[];
  }): SearchFeedback;
  // confirm-listing-button.tsx
  export function ConfirmListingButton(props: { feedback: SearchFeedback; dpeNumber: string }): React.ReactElement | null;
  // missing-listing-feedback.tsx
  export function MissingListingFeedback(props: { feedback: SearchFeedback }): React.ReactElement;
  ```
  Behaviour: `searchId = crypto.randomUUID()` once per mount; `confirm`/`reportNoneMatch` do nothing while a verdict exists or one is in flight; `sendDetail` does nothing unless the verdict is `none_match` without a sent detail; a failure sets the status to `failed` and leaves the verdict `none` (the user can retry); responses are valibot-validated and must echo the `searchId` (and verdict).
  `ConfirmListingButton`: primary `Button` (Check icon, "C'est ce logement"), disabled while any verdict is sending; after this `dpeNumber` is confirmed it shows "Logement confirmé, merci !" (`role="status"`); renders `null` when another candidate is confirmed or the verdict is `none_match`; on failure it shows "Le retour n'a pas pu être enregistré, réessayez plus tard." under itself only.
  `MissingListingFeedback`: a `Card` titled "Le bien n'est pas dans la liste ?" (SearchX icon) with the body copy; the outline `Button` "Aucun emplacement ne correspond" only while the verdict is `none`; after `none_match`, "Merci." and the reason form; after the detail, "C'est noté, merci.". With a `confirmed` verdict only the title and body remain.

Nothing mounts these files in this stream (Task I1 does). The hook must be called once per displayed result, in the component that remounts per result (today `ResultsWorkspace`, which unmounts on "Nouvelle recherche").

- [ ] **Step 1: Add the `ListingFeedback` namespace to both catalogs**

In `src/i18n/messages/en.json`, replace the line:

```json
  "Listing": {
```

with:

```json
  "ListingFeedback": {
    "confirm": "This is the property",
    "confirmed": "Property confirmed, thank you!",
    "failed": "Your feedback could not be saved, please try again later.",
    "missingTitle": "Is the property not in the list?",
    "missingBody": "The listing may describe it poorly, or it may not be in the public data yet. Reporting it improves the service, one search at a time.",
    "noneMatch": "No location matches",
    "thanks": "Thank you.",
    "reasonLegend": "What was wrong?",
    "reasonWrongCommune": "The town is wrong",
    "reasonWrongDwellings": "The suggested homes do not fit the listing",
    "reasonAddressMissing": "I know the right address, it was not there",
    "reasonUnsure": "I could not say",
    "commentLabel": "Anything else? (optional)",
    "commentNote": "Do not include any name or contact details.",
    "send": "Send",
    "detailSent": "Noted, thank you."
  },
  "Listing": {
```

In `src/i18n/messages/fr.json`, replace the line:

```json
  "Listing": {
```

with (the spec's copy verbatim; plain spaces before `?` and `!`, straight apostrophes, as in the spec and the rest of `fr.json`):

```json
  "ListingFeedback": {
    "confirm": "C'est ce logement",
    "confirmed": "Logement confirmé, merci !",
    "failed": "Le retour n'a pas pu être enregistré, réessayez plus tard.",
    "missingTitle": "Le bien n'est pas dans la liste ?",
    "missingBody": "L'annonce le décrit peut-être mal, ou il n'est pas encore référencé dans les données publiques. Le signaler affine le service, recherche après recherche.",
    "noneMatch": "Aucun emplacement ne correspond",
    "thanks": "Merci.",
    "reasonLegend": "Qu'est-ce qui n'allait pas ?",
    "reasonWrongCommune": "La commune n'est pas la bonne",
    "reasonWrongDwellings": "Les logements proposés ne collent pas à l'annonce",
    "reasonAddressMissing": "Je connais la bonne adresse, elle n'était pas là",
    "reasonUnsure": "Je ne saurais pas dire",
    "commentLabel": "Autre chose ? (facultatif)",
    "commentNote": "N'y mettez ni nom ni coordonnées.",
    "send": "Envoyer",
    "detailSent": "C'est noté, merci."
  },
  "Listing": {
```

The anchor `  "Listing": {` (two leading spaces) occurs once per file. Check both catalogs still parse and mirror each other:

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; node -e "const en=require('./src/i18n/messages/en.json'),fr=require('./src/i18n/messages/fr.json');const paths=(o,p='')=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'?paths(v,p+k+'.'):[p+k]);console.log(Object.keys(en.ListingFeedback).length, Object.keys(en).indexOf('ListingFeedback')+1===Object.keys(en).indexOf('Listing'));console.log(JSON.stringify(paths(en))===JSON.stringify(paths(fr))?'en/fr keys match':'KEY MISMATCH')" && git diff --stat src/i18n/messages
```

Expected:

```
16 true
en/fr keys match
 src/i18n/messages/en.json | 18 ++++++++++++++++++
 src/i18n/messages/fr.json | 18 ++++++++++++++++++
 2 files changed, 36 insertions(+)
```

- [ ] **Step 2: Write the hook**

Create `src/app/(app)/dashboard/components/listing/use-search-feedback.ts`:

```ts
'use client';

import { useRef, useState } from 'react';
import * as v from 'valibot';
import {
  FeedbackDetailReceiptSchema,
  FeedbackReceiptSchema,
} from '@/application/listing/feedback-dto';
import {
  type FeedbackCandidate,
  type FeedbackReason,
  type FeedbackVerdict,
  toFeedbackCandidates,
} from '@/core/listing/feedback';

type SendStatus = 'idle' | 'sending' | 'failed';

export type SearchFeedback = {
  verdict:
    | { kind: 'none' }
    | { kind: 'confirmed'; dpeNumber: string }
    | { kind: 'none_match'; detailSent: boolean };
  verdictStatus: SendStatus;
  detailStatus: SendStatus;
  confirm: (dpeNumber: string) => void;
  reportNoneMatch: () => void;
  sendDetail: (detail: {
    reason: FeedbackReason | null;
    comment: string;
  }) => void;
};

type ShownCandidate = {
  record: { dpeNumber: string };
  confidence: number;
};

async function postForBody(path: string, payload: object): Promise<unknown> {
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function sendVerdict(payload: {
  searchId: string;
  listingUrl: string;
  verdict: FeedbackVerdict;
  confirmedDpeNumber: string | null;
  candidates: FeedbackCandidate[];
}): Promise<boolean> {
  const body = await postForBody('/api/listings/feedback', payload);
  const receipt = v.safeParse(FeedbackReceiptSchema, body);
  return (
    receipt.success &&
    receipt.output.searchId === payload.searchId &&
    receipt.output.verdict === payload.verdict
  );
}

async function sendDetailRequest(payload: {
  searchId: string;
  reason: FeedbackReason | null;
  comment: string;
}): Promise<boolean> {
  const body = await postForBody('/api/listings/feedback/detail', payload);
  const receipt = v.safeParse(FeedbackDetailReceiptSchema, body);
  return receipt.success && receipt.output.searchId === payload.searchId;
}

// why: the results workspace remounts for every displayed result, so one
// mount is one search: its id is drawn once and the verdict lives in memory.
export function useSearchFeedback(input: {
  listingUrl: string;
  candidates: readonly ShownCandidate[];
}): SearchFeedback {
  const [searchId] = useState(() => crypto.randomUUID());
  const [verdict, setVerdict] = useState<SearchFeedback['verdict']>({
    kind: 'none',
  });
  const [verdictStatus, setVerdictStatus] = useState<SendStatus>('idle');
  const [detailStatus, setDetailStatus] = useState<SendStatus>('idle');
  // why: a double click fires twice before React re-renders the disabled
  // button; the refs close that window.
  const verdictInFlight = useRef(false);
  const detailInFlight = useRef(false);

  function submitVerdict(
    answer:
      | { verdict: 'confirmed'; dpeNumber: string }
      | { verdict: 'none_match' },
  ): void {
    if (verdict.kind !== 'none' || verdictInFlight.current) return;
    verdictInFlight.current = true;
    setVerdictStatus('sending');
    void sendVerdict({
      searchId,
      listingUrl: input.listingUrl,
      verdict: answer.verdict,
      confirmedDpeNumber:
        answer.verdict === 'confirmed' ? answer.dpeNumber : null,
      candidates: toFeedbackCandidates(input.candidates),
    }).then((saved) => {
      verdictInFlight.current = false;
      if (!saved) {
        setVerdictStatus('failed');
        return;
      }
      setVerdictStatus('idle');
      setVerdict(
        answer.verdict === 'confirmed'
          ? { kind: 'confirmed', dpeNumber: answer.dpeNumber }
          : { kind: 'none_match', detailSent: false },
      );
    });
  }

  function sendDetail(detail: {
    reason: FeedbackReason | null;
    comment: string;
  }): void {
    if (
      verdict.kind !== 'none_match' ||
      verdict.detailSent ||
      detailInFlight.current
    ) {
      return;
    }
    detailInFlight.current = true;
    setDetailStatus('sending');
    void sendDetailRequest({
      searchId,
      reason: detail.reason,
      comment: detail.comment.trim(),
    }).then((saved) => {
      detailInFlight.current = false;
      if (!saved) {
        setDetailStatus('failed');
        return;
      }
      setDetailStatus('idle');
      setVerdict({ kind: 'none_match', detailSent: true });
    });
  }

  function confirm(dpeNumber: string): void {
    submitVerdict({ verdict: 'confirmed', dpeNumber });
  }

  function reportNoneMatch(): void {
    submitVerdict({ verdict: 'none_match' });
  }

  return {
    verdict,
    verdictStatus,
    detailStatus,
    confirm,
    reportNoneMatch,
    sendDetail,
  };
}
```

A retry after a lost response is safe: the same answer for the same `searchId` is accepted by the server as a replay.

- [ ] **Step 3: Write the confirm button**

Create `src/app/(app)/dashboard/components/listing/confirm-listing-button.tsx`:

```tsx
'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { SearchFeedback } from './use-search-feedback';

export function ConfirmListingButton({
  feedback,
  dpeNumber,
}: {
  feedback: SearchFeedback;
  dpeNumber: string;
}): React.ReactElement | null {
  const t = useTranslations('ListingFeedback');
  // why: one failure message, under the button that was pressed, even when
  // the panel is reused for another candidate.
  const [pressedFor, setPressedFor] = useState<string | null>(null);
  const { verdict, verdictStatus } = feedback;

  if (verdict.kind === 'confirmed') {
    if (verdict.dpeNumber !== dpeNumber) return null;
    return (
      <p
        role="status"
        className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-charcoal-soft text-[14px] font-medium text-ink"
      >
        <Check className="size-4" aria-hidden />
        {t('confirmed')}
      </p>
    );
  }
  if (verdict.kind === 'none_match') return null;

  const pressed = pressedFor === dpeNumber;
  return (
    <div className="flex flex-col gap-1.5">
      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={verdictStatus === 'sending'}
        loading={verdictStatus === 'sending' && pressed}
        onClick={() => {
          setPressedFor(dpeNumber);
          feedback.confirm(dpeNumber);
        }}
      >
        <Check />
        {t('confirm')}
      </Button>
      {verdictStatus === 'failed' && pressed && (
        <p role="alert" className="text-[13px] text-destructive">
          {t('failed')}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write the "not in the list" box**

Create `src/app/(app)/dashboard/components/listing/missing-listing-feedback.tsx`:

```tsx
'use client';

import { SearchX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, type KeyboardEvent, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import {
  FEEDBACK_REASONS,
  type FeedbackReason,
  isFeedbackReason,
  MAX_FEEDBACK_COMMENT_LENGTH,
} from '@/core/listing/feedback';
import type { SearchFeedback } from './use-search-feedback';

const REASON_KEY = {
  wrong_commune: 'reasonWrongCommune',
  wrong_dwellings: 'reasonWrongDwellings',
  address_missing: 'reasonAddressMissing',
  unsure: 'reasonUnsure',
} as const satisfies Record<FeedbackReason, string>;

const RESULTS_NAVIGATION_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Escape']);

// why: arrow keys move the radio selection and Escape belongs to the text
// field; neither may reach the results view's page-level shortcuts.
function keepKeysInForm(event: KeyboardEvent<HTMLFormElement>): void {
  if (RESULTS_NAVIGATION_KEYS.has(event.key)) event.stopPropagation();
}

export function MissingListingFeedback({
  feedback,
}: {
  feedback: SearchFeedback;
}): React.ReactElement {
  const t = useTranslations('ListingFeedback');
  const [pressed, setPressed] = useState(false);
  const [reason, setReason] = useState<FeedbackReason | null>(null);
  const [comment, setComment] = useState('');
  const reasonLabelId = useId();
  const commentId = useId();
  const commentNoteId = useId();
  const { verdict, verdictStatus, detailStatus } = feedback;
  const canSendDetail = reason !== null || comment.trim() !== '';

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!canSendDetail) return;
    feedback.sendDetail({ reason, comment });
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-[14px] font-semibold text-ink">
          <SearchX className="size-4 shrink-0" aria-hidden />
          {t('missingTitle')}
        </CardTitle>
        <CardDescription className="text-[13px]">
          {t('missingBody')}
        </CardDescription>
      </CardHeader>
      {verdict.kind === 'none' && (
        <CardContent className="flex flex-col gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full"
            disabled={verdictStatus === 'sending'}
            loading={verdictStatus === 'sending' && pressed}
            onClick={() => {
              setPressed(true);
              feedback.reportNoneMatch();
            }}
          >
            {t('noneMatch')}
          </Button>
          {verdictStatus === 'failed' && pressed && (
            <p role="alert" className="text-[13px] text-destructive">
              {t('failed')}
            </p>
          )}
        </CardContent>
      )}
      {verdict.kind === 'none_match' && verdict.detailSent && (
        <CardContent>
          <p role="status" className="text-[13px] font-medium text-ink">
            {t('detailSent')}
          </p>
        </CardContent>
      )}
      {verdict.kind === 'none_match' && !verdict.detailSent && (
        <CardContent>
          <form
            onSubmit={handleSubmit}
            onKeyDown={keepKeysInForm}
            className="flex flex-col gap-3"
          >
            <p role="status" className="text-[13px] font-medium text-ink">
              {t('thanks')}
            </p>
            <div className="flex flex-col gap-2">
              <p
                id={reasonLabelId}
                className="text-[13px] font-medium text-graphite"
              >
                {t('reasonLegend')}
              </p>
              <RadioGroup
                aria-labelledby={reasonLabelId}
                value={reason}
                onValueChange={(value) => {
                  if (isFeedbackReason(value)) setReason(value);
                }}
              >
                {FEEDBACK_REASONS.map((option) => (
                  <Label
                    key={option}
                    className="items-start gap-2.5 text-[13px] leading-snug font-normal text-ink"
                  >
                    <RadioGroupItem value={option} className="mt-px" />
                    {t(REASON_KEY[option])}
                  </Label>
                ))}
              </RadioGroup>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor={commentId}
                className="text-[13px] font-medium text-graphite"
              >
                {t('commentLabel')}
              </Label>
              <Textarea
                id={commentId}
                value={comment}
                maxLength={MAX_FEEDBACK_COMMENT_LENGTH}
                aria-describedby={commentNoteId}
                onChange={(event) => {
                  setComment(event.target.value);
                }}
              />
              <p
                id={commentNoteId}
                className="text-[12px] text-muted-foreground"
              >
                {t('commentNote')}
              </p>
            </div>
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={!canSendDetail}
              loading={detailStatus === 'sending'}
            >
              {t('send')}
            </Button>
            {detailStatus === 'failed' && (
              <p role="alert" className="text-[13px] text-destructive">
                {t('failed')}
              </p>
            )}
          </form>
        </CardContent>
      )}
    </Card>
  );
}
```

"Envoyer" stays disabled until a reason is picked or a comment typed (the detail DTO refuses an empty detail). There is no "Pourquoi ça arrive →" link (spec §8).

- [ ] **Step 5: Verify**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm type-check && pnpm lint && pnpm check && pnpm check:boundaries && pnpm test
```

Expected: as in Task D1 Step 9. `tsc` proves every `t('…')` key exists in `en.json` (next-intl's `IntlMessages` augmentation) and that the three exports match the contract types.

- [ ] **Step 6: Confirm nothing mounts the components yet**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; grep -rlE "useSearchFeedback|ConfirmListingButton|MissingListingFeedback" src
```

Expected, exactly:

```
src/app/(app)/dashboard/components/listing/use-search-feedback.ts
src/app/(app)/dashboard/components/listing/confirm-listing-button.tsx
src/app/(app)/dashboard/components/listing/missing-listing-feedback.tsx
```

(in any order). The browser check of these components happens after Task I1 mounts them.

- [ ] **Step 7: Commit**

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; git add "src/app/(app)/dashboard/components/listing/use-search-feedback.ts" "src/app/(app)/dashboard/components/listing/confirm-listing-button.tsx" "src/app/(app)/dashboard/components/listing/missing-listing-feedback.tsx" src/i18n/messages/en.json src/i18n/messages/fr.json && git commit -m "$(cat <<'EOF'
feat(listing): feedback hook, confirm button and none-match box

useSearchFeedback draws one search id per displayed result, posts the
verdict and its detail, validates each receipt and keeps the verdict in
memory. ConfirmListingButton and MissingListingFeedback render the
spec's copy from the new ListingFeedback namespace; they are mounted by
the integration task.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Stream notes

**Assumptions and decisions**

- The replay decision lives in `core/listing/feedback.ts` (`isSameAnswer`) and is taken by `submitFeedback`; the repository does the atomic writes (`ON CONFLICT (search_id) DO NOTHING` then read back; `UPDATE … WHERE verdict = 'none_match'`) and reports what is stored (`inserted`, `SavedDetail.kind`). The observable behaviour is the one asked for (same verdict → success, different verdict → `conflict`, detail only on `none_match`), but a use-case test against a fake repository then exercises real logic instead of the fake.
- A "same answer" also requires the same `confirmedDpeNumber`: confirming another candidate for the same search is a conflict, not a replay.
- The DTO also requires the confirmed DPE number to be one of the submitted candidates, at least one candidate, and a detail to carry a reason or a comment (the UI keeps "Envoyer" disabled until one is given). The spec is silent on these three; they keep the ground truth coherent.
- HTTP codes: detail on a confirmed search → 409, detail on an unknown search → 404, conflicting verdict → 409.
- The table adds three `CHECK` constraints (confirmed ⇔ DPE number present; reason/comment only on `none_match`; comment ≤ 1000) as a backstop to the DTOs. Verified in a scratch copy that drizzle-kit 0.31.10 renders them with snake_case column names.
- `created_at`/`updated_at` are declared in the schema file instead of reusing `columns-helpers.ts`'s `timestamps`, which adds `deleted_at` and has no time zone.
- The pgEnum values are written out in the schema file because a schema file importing `core/listing/feedback` would need that module in the `listing` domain's `public` array, which this stream does not own; the repository test pins them to the core lists.
- `src/infra/database/connection.ts` is not changed: the repository uses drizzle's query builder, not `db.query.*`.
- The migration is generated only (`drizzle/0001_listing_feedback.sql`, name fixed by `--name listing_feedback`). **It must be applied (`pnpm drizzle:migrate`) on each database before the routes can write**; until then a valid request returns 500 `db_error`. Task V1 mocks the feedback route (spec §11), so nothing in this plan applies it.
- `MissingListingFeedback`'s form stops `ArrowLeft`/`ArrowRight`/`Escape` keydown events from propagating, because Base UI radios are `<span role="radio">` elements that an "ignore inputs and textareas" filter does not catch. This protects Stream C's page-level shortcuts if its listener runs in the bubble phase (a React handler, or `window`/`document` `addEventListener` without `capture`). If C listens in the capture phase, its handler must also ignore targets inside `[role="radiogroup"]` and `textarea`.
- `verdictStatus` is shared by the confirm buttons and the none-match button (fixed contract), so each component remembers locally whether it was the one pressed and shows the failure message and spinner only then.

**Spec items not mapped to code in this stream**

- Mounting (the confirm button after "Vérifier ailleurs", the box after the candidate list, one `useSearchFeedback({ listingUrl: listing.fields.canonicalUrl, candidates: match.candidates })` per displayed result) is Task I1's job. If the workspace ever stops remounting per result, I1 must key it on the result so a new search starts clean (spec §8, last bullet).
- The browser check of the confirm flow and of the none-match form (spec §11) is Task V1's.

**Files that may conflict with other streams**

- `src/i18n/messages/en.json`, `src/i18n/messages/fr.json`: one insertion immediately before `  "Listing": {`, as the contract allows. Stream A's deletions end at least nine lines earlier (the `Errors` namespace lies in between) and Stream C appends at the end of `Listing`, so git sees separate hunks.
- `scripts/boundaries/manifest.mjs`: only the `listing` domain's `dirs` (one added line) and `schemas`, as the contract allows. Stream A edits the `auth` domain and Stream C the `geo`/`ademe` `public` arrays: different hunks.
- Not named in the contract, touched here, owned by no other stream: `src/application/rate-limit/apply-rate-limit.test.ts` (the test of the owned `apply-rate-limit.ts`; one reset line and one test added), `src/components/ui/radio-group.tsx` (new primitive the D5 brief asks for; Stream C must not add its own), and `drizzle/meta/0001_snapshot.json` plus `drizzle/meta/_journal.json` (generated with the migration).

## Integration and verification

Rulings on the drafters' open points (recorded here so every executor sees them):

- **Rank badge and score pill contrast:** the text on a `bg-(--score)` surface takes ink or white, whichever contrasts more, through a new `--score-ink` variable (Task I1, step 4). The score number printed in the score colour on white stays as specified (precisement does the same; the band label is also read out for screen readers).
- **IGN credit:** the aerial chip reads "Satellite · IGN" (Licence Ouverte 2.0 asks for the source) (Task I1, step 5).
- **Stale "sign in again" copy:** with no sign-in left, an `unauthorized`/`forbidden` extraction error maps to the generic error; `errorSignedOut` and the `'signed-out'` failure are removed (Task I1, step 6).
- **Leftovers of Stream A outside its ownership:** `Meta.signIn`, `Meta.settings`, `src/i18n/set-locale-request.ts`, unused `public/*_logo.svg`/`logo.svg`, the `.env.template` paywall comment and the `--sidebar*` tokens in `globals.css` are removed when unused (Task I1, step 7).
- **Migration:** generated by D1, not applied. Applying it (`pnpm drizzle:migrate`) is an operator step on each database; until then the feedback API returns 500 there (Task V1 mocks the route).

### Task I1: Merge the streams, mount the feedback, tidy leftovers

**Files:**
- Modify: `src/app/(app)/dashboard/components/listing/results-workspace.tsx`
- Modify: `src/app/(app)/dashboard/components/listing/result-detail-panel.tsx`
- Modify: `src/app/(app)/dashboard/components/listing/score-style.ts`
- Modify: `src/app/(app)/dashboard/components/listing/address-candidate-list.tsx`
- Modify: `src/app/(app)/dashboard/components/listing/listing-url-form.tsx`
- Modify: `src/core/ademe/score-scale.ts`, `src/core/ademe/score-scale.test.ts`
- Modify: `src/i18n/messages/en.json`, `src/i18n/messages/fr.json`
- Modify: `src/app/globals.css`, `.env.template`, `CLAUDE.md`
- Delete (only if unused, checked in step 7): `src/i18n/set-locale-request.ts`, `public/google_logo.svg`, `public/microsoft_logo.svg`, `public/logo.svg`

**Interfaces:**
- Consumes: `useSearchFeedback`, `SearchFeedback` (`./use-search-feedback`), `ConfirmListingButton` (`./confirm-listing-button`), `MissingListingFeedback` (`./missing-listing-feedback`) from Stream D; `ResultsWorkspace`, `ResultDetailPanel` (props `candidate, rank, total, onPrevious, onNext, onClose, streetViewEnabled, listing`), `ResultDetailBody` (props `candidate, rank, listing`), `VerifyElsewhere`, `scoreStyle`, `scoreColour` from Stream C.
- Produces: `scoreInk(score: number): 'white' | 'ink'` in `src/core/ademe/score-scale.ts`; `ScoreStyle` gains `'--score-ink': string`.

- [ ] **Step 1: Merge the three stream branches**

From the worktree of `claude/results-precisement-parity`:

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; git merge --no-ff stream/a-shell -m "Merge stream A: app shell without accounts" && git merge --no-ff stream/c-results -m "Merge stream C: results view parity and map attribution" && git merge --no-ff stream/d-feedback -m "Merge stream D: feedback loop"
```

Expected: three merge commits, no conflict (ownership is exclusive; the only shared files are `scripts/boundaries/manifest.mjs` and the two message catalogs, edited in separate hunks). If a conflict appears in those files, keep both sides' hunks, then check:

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; python3 -c "import json;e=json.load(open('src/i18n/messages/en.json'));f=json.load(open('src/i18n/messages/fr.json'));import sys;bad=[k for k in e if set(e[k])!=set(f.get(k,{}))];print(bad or 'mirror ok')" && node scripts/check-domain-boundaries.mjs
```

Expected: `mirror ok` and `Domain boundaries OK.`

- [ ] **Step 2: Hold the feedback state in the workspace and show the "missing listing" box**

In `results-workspace.tsx`, add the imports next to the other `./…` imports:

```tsx
import { MissingListingFeedback } from './missing-listing-feedback';
import { useSearchFeedback } from './use-search-feedback';
```

At the top of the `ResultsWorkspace` body, after the existing `useTranslations`/`useMediaQuery` calls:

```tsx
  const feedback = useSearchFeedback({
    listingUrl: listing.fields.canonicalUrl,
    candidates: match.candidates,
  });
```

Right after the `<AddressCandidateList … />` element (the last child of the left column's scroll content), add:

```tsx
            <MissingListingFeedback feedback={feedback} />
```

Pass the state to the detail panel: on the `<ResultDetailPanel` element add the prop `feedback={feedback}`.

- [ ] **Step 3: Put "C'est ce logement" at the end of the detail body**

In `result-detail-panel.tsx`, add:

```tsx
import { ConfirmListingButton } from './confirm-listing-button';
import type { SearchFeedback } from './use-search-feedback';
```

Add `feedback: SearchFeedback;` to the props type of `ResultDetailPanel` and of `ResultDetailBody`, destructure `feedback` in both, and pass `feedback={feedback}` where `ResultDetailPanel` renders `<ResultDetailBody … />`. In `ResultDetailBody`, right after `<VerifyElsewhere record={record} />`, add:

```tsx
      <ConfirmListingButton feedback={feedback} dpeNumber={record.dpeNumber} />
```

Run: `export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm type-check && pnpm lint`
Expected: both exit 0.

- [ ] **Step 4: Legible text on the score colour**

Add to `src/core/ademe/score-scale.test.ts`:

```ts
describe('scoreInk', () => {
  it('writes white on the dark green of a top score', () => {
    expect(scoreInk(100)).toBe('white');
  });

  // why: white on the yellow stop (score 74) is about 2:1, below WCAG AA.
  it('writes ink on the light yellow of a middling score', () => {
    expect(scoreInk(74)).toBe('ink');
  });

  it('decides on the clamped colour for out-of-range scores', () => {
    expect(scoreInk(140)).toBe(scoreInk(100));
    expect(scoreInk(10)).toBe(scoreInk(52));
  });
});
```

and add `scoreInk` to the test file's import from `./score-scale`.

Run: `export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm vitest run src/core/ademe/score-scale.test.ts`
Expected: FAIL — `scoreInk` is not exported.

Append to `src/core/ademe/score-scale.ts`:

```ts
const INK_RGB = [45, 47, 42] as const;
const WHITE_RGB = [255, 255, 255] as const;

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance([r, g, b]: readonly [number, number, number]): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function rgbOf(colour: string): readonly [number, number, number] {
  const [r = 0, g = 0, b = 0] = (colour.match(/\d+/g) ?? []).map(Number);
  return [r, g, b];
}

// why: the score colour runs from dark green to light yellow, so white text
// is only legible on part of the ramp; pick whichever contrasts more.
export function scoreInk(score: number): 'white' | 'ink' {
  const background = luminance(rgbOf(scoreColour(score)));
  return contrast(background, luminance(WHITE_RGB)) >=
    contrast(background, luminance(INK_RGB))
    ? 'white'
    : 'ink';
}
```

Run the test again. Expected: PASS.

In `score-style.ts`, import `scoreInk` alongside the existing `score-scale` imports, add `'--score-ink': string` to the `ScoreStyle` type, and in `scoreStyle` add the property:

```ts
    '--score-ink': scoreInk(score) === 'white' ? '#ffffff' : '#2d2f2a',
```

Then replace `text-white` with `text-(--score-ink)` on every element whose classes contain `bg-(--score)` in `address-candidate-list.tsx` and `result-detail-panel.tsx` (the card's rank badge and score pill, the detail's rank circle):

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; grep -n "bg-(--score)" "src/app/(app)/dashboard/components/listing/"*.tsx
```

Expected after the edit: every listed line carries `text-(--score-ink)` and none carries `text-white`.

- [ ] **Step 5: Credit IGN on the aerial photo**

In both catalogs, change the value of every `Listing` key whose value is exactly `"Satellite"` (the card and detail chips, e.g. `photoSatellite`) to `"Satellite · IGN"`:

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; python3 - <<'PY'
import json
for p in ['src/i18n/messages/en.json','src/i18n/messages/fr.json']:
    d=json.load(open(p))
    keys=[k for k,v in d['Listing'].items() if v=='Satellite']
    for k in keys: d['Listing'][k]='Satellite · IGN'
    open(p,'w').write(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
    print(p, keys)
PY
```

Expected: at least one key listed per file.

- [ ] **Step 6: No more "sign in again"**

In `listing-url-form.tsx`:
- remove `| 'signed-out'` from the `ExtractionFailure` union;
- remove the line `'signed-out': 'errorSignedOut',` from `FAILURE_KEY`;
- in `toFailure`, remove the line `if (code === 'unauthorized' || code === 'forbidden') return 'signed-out';` (those codes now fall through to `'unknown'`).

Remove the `errorSignedOut` key from `Listing` in both catalogs.

Run: `export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; grep -rn "signed-out\|errorSignedOut" src`
Expected: no output.

- [ ] **Step 7: Remove Stream A's leftovers that nothing uses**

For each candidate, delete it only if the grep prints nothing:

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; grep -rn "set-locale-request" src; grep -rn "google_logo\|microsoft_logo" src; grep -rn "/logo.svg\|logo\.svg" src; grep -rn "Meta\.signIn\|'signIn'\|Meta\.settings\|t('settings')" src; grep -rn "sidebar" src --include=*.tsx --include=*.ts
```

- delete `src/i18n/set-locale-request.ts` if unused;
- delete `public/google_logo.svg`, `public/microsoft_logo.svg`, `public/logo.svg` each if unused;
- remove `signIn` and `settings` from the `Meta` namespace of both catalogs if unused;
- in `src/app/globals.css`, remove every `--sidebar…` custom property and every `--color-sidebar…` theme mapping if no remaining `.tsx`/`.ts` uses a `sidebar` utility;
- in `.env.template`, reword the Autumn comment so it no longer mentions a `/paywall` page ("Optional locally; required in production if billing is used.").

- [ ] **Step 8: Record the feedback loop and the results view in CLAUDE.md**

In `CLAUDE.md`, under "Current state", extend the "**Built:**" bullet's last sentence with: `, and a feedback loop: "C'est ce logement" / "Aucun emplacement ne correspond" stored in the \`listing_feedback\` table through \`/api/listings/feedback\` (no personal data; one verdict per displayed result, idempotent).` Replace the bullet starting with `- **The results view is a three-panel workspace**` by:

```markdown
- **The results view is a three-panel workspace** matching precisement.fr: the analysed listing and the ranked cards on the left, the map, and the selected result's detail (photo, score, address, energy labels, fact tiles with ✓ only on an exact match, verify-elsewhere links, "C'est ce logement") on the right; the detail floats over the map between `lg` and `xl` and becomes a bottom sheet below `lg`. It never shows how a candidate was scored. There are no accounts in the UI. When no map can be drawn the map region shows a notice and the rest works.
```

- [ ] **Step 9: Gate and commit**

Run: `export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm validate`
Expected: exit 0.

```bash
export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; git add -A src CLAUDE.md .env.template public && git commit -m "$(cat <<'EOF'
feat(listing): mount the feedback loop in the results view

Integrates the three streams: the workspace holds the feedback state, the
detail ends with "C'est ce logement" and the left column with "Le bien
n'est pas dans la liste ?". Text on the score colour picks ink or white,
the aerial chip credits IGN, and leftovers of the removed account UI go.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task V1: Browser verification (controller)

Run by the controller in the shared browser pane, with mocked extract/match/feedback responses; no commit unless a check fails and a fix is dispatched through the review loop.

- [ ] **Step 1: Start the app**

Copy `.env` from the main checkout into the worktree if missing; add a local Street View stand-in if photos are wanted (`GOOGLE_MAPS_API_KEY=dev-mock`, `GOOGLE_STREET_VIEW_BASE_URL=http://127.0.0.1:3999/streetview` with a tiny server returning `{"status":"OK"}` for `/metadata` and a PNG otherwise) — remove those lines afterwards. Start `next dev -p 3107` with Node 25 on the PATH and open `http://localhost:3107/`.

- [ ] **Step 2: Mock the API calls**

In the page, override `window.fetch` so `/api/listings/extract` returns a valid `ExtractedListing` (include every field of the current `ListingFieldsSchema`, `pin: null`, listing floor `0` to check "Rez-de-chaussée", a listing surface `114`, year `1930`, heating `gas`, DPE date `2023-04-12`), `/api/listings/match` returns three candidates (#1 trusted point with DPE date `2023-04-12`, surface `114.5`, floor `0`; #2 without a point; #3 trusted point, floor `3`, score `0.6`), `/api/listings/feedback` echoes `{ searchId: body.searchId, verdict: body.verdict }` and `/api/listings/feedback/detail` echoes `{ searchId: body.searchId }`.

- [ ] **Step 3: 1440 × 900**

Check: no sidebar and no account/sign-in/settings/language control anywhere (`document.body.innerText` has no "Se connecter", "Paramètres", "Déconnexion"); `/sign-in`, `/dashboard/settings`, `/paywall` return the not-found page; left column order (Nouvelle recherche, Annonce analysée with recap `… · Rez-de-chaussée · …`, Emplacements probables, notice if triggered, cards, "Le bien n'est pas dans la liste ?"); card #1 rank badge and score pill on the photo, legible text, CTA "Vérifier cette adresse →"; detail header "Résultat 1" with `‹ 1 / 3 ›`; tiles Type ✓, Surface ✓ (114 vs 114.5), no Étage tile for floor 0, Date du DPE ✓; Villederêve link `https://villedereve.fr/ville/69123` for a `69383` candidate (open it once in a tab: the Lyon page loads); Mapbox logo bottom-left, attribution bottom-right fully visible; no Next.js "N" bubble; the detail's copy button switches to its copied state (if the pane denies the clipboard, note it as a manual check).

- [ ] **Step 4: Unpinned and floor**

Select #2: no pin, placeholder "Image indisponible", no "Vérifier ailleurs", "C'est ce logement" still present. Select #3: tile "3e étage"; card meta `· Étage 3`.

- [ ] **Step 5: Feedback**

Click "C'est ce logement" on #1: it becomes "Logement confirmé, merci !", the other candidates' confirm buttons and "Aucun emplacement ne correspond" disappear. New search, same listing: click "Aucun emplacement ne correspond" → "Merci." + the reason form; pick a reason, type a comment, "Envoyer" → "C'est noté, merci.". Make the mock return 500 once: the failure copy "Le retour n'a pas pu être enregistré, réessayez plus tard." shows and a retry works.

- [ ] **Step 6: Keyboard**

With the detail open: `→`/`←` move between results with the header pager keeping focus; `Esc` closes on `lg`; typing arrows inside the comment textarea does not switch results.

- [ ] **Step 7: 1100 × 800, 390 × 844 and 844 × 390**

1100: the detail floats over the map, the attribution sits left of it and stays readable (not overlapping the Mapbox logo). 390: map on top, list below, the detail opens as a bottom sheet with the photo and "C'est ce logement" reachable by scrolling. 844 × 390 (landscape phone, below `lg`): the bottom sheet's header and photo stay fixed, the photo is shorter than 320 px and not clipped, and the sheet body scrolls to the address, "Vérifier ailleurs" and "C'est ce logement".

- [ ] **Step 8: Clean up**

Stop the dev server and any stand-in, remove temporary `.env` lines and `.claude/launch.json`, reset the viewport.
