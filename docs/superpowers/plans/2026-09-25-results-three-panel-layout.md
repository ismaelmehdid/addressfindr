# Results Three-Panel Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reshape the dashboard results view into a precisement-style three-panel workspace (listing + candidates on the left, map in the centre, selected result's detail on the right) with verify-elsewhere links, without showing any match reasoning.

**Architecture:** Pure helpers go in `core/` (outbound links, verification rule, record facts, listing URL display) with unit tests. The UI is recomposed from shadcn primitives in `src/app/(app)/dashboard/components/listing/`: a new `ResultsWorkspace` (CSS grid, responsive placement) replaces `AddressResultsMap`; a new `ResultDetailPanel` and `AnalysedListingCard` are added; `ListingUrlForm` keeps the submission state machine and switches between the centred column and the workspace.

**Tech Stack:** Next.js 16, React 19, TypeScript 6, Tailwind v4, shadcn on Base UI (`src/components/ui`), next-intl, mapbox-gl 3, vitest (node environment), biome, ESLint.

**Spec:** `docs/superpowers/specs/2026-09-25-results-three-panel-layout-design.md`

## Global Constraints

- Node: run every command with `export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"` (the shell default is Node 14, which breaks pnpm, Turbopack's PostCSS and the husky hooks).
- UI is composed only from `src/components/ui/*` (`Card`, `Badge`, `Button`/`buttonVariants`, `Progress`, `ScrollArea`, `Collapsible`, `Alert`, `Sheet`, `Skeleton`, `EmptyState`). No hand-rolled equivalent of a component that exists there.
- Every user-facing string goes through next-intl, namespace `Listing`. `src/i18n/messages/en.json` is the type source; `fr.json` mirrors its keys exactly.
- Comments are English only, and only a short `// why` line where the reason is not obvious. No French comment is added.
- No new npm dependency.
- The map keeps one pin: the selected result's, only when it has a trusted point (`core/ademe/candidate-on-map.ts`). One `new mapboxgl.Map()` per displayed result, moved by `flyTo`.
- Never display match reasoning: no agrees-on / differs-on lines, no supporting-record count, no inspected-rows footnote, no "Champs extraits" anywhere.
- Outbound links are built only from a trusted point, never from the address text.
- `pnpm validate` is the done-gate. Never commit with `--no-verify`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- A selected candidate **without a trusted point** in a list where others have one: no pin (map rests on the commune), no photo, no outbound links, the map chip names that address with the no-pin notice. Pinned by the browser check in Task 8, step 5.
- **Malformed or lowercase INSEE codes** (`2a004`, `2A04`, `' 69383 '`): links needing the code are omitted or normalised, never broken. Pinned by Task 1 tests.
- **A listing missing rooms, type or surface**: the analysed-listing title drops the missing part and never prints `null`, `NaN` or an empty title. Pinned by the Task 8 browser fixture with `rooms: null`.
- **ADEME's floor `0` and impossible dates** (`2023-02-30`, `12/04/2023`): no floor tile, no DPE-date tile. Pinned by Task 2 tests.
- **A single candidate**: the verify notice depends only on its own divergence, both pagers are disabled and focusable, the "Si ce n'est pas celle-là" section is absent. Pinned by Task 2 tests and the Task 8 browser check.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/core/geo/outbound-links.ts` | create | Google Maps, Géorisques, DVF, INSEE URL builders. |
| `src/core/geo/outbound-links.test.ts` | create | Their formats. |
| `src/core/ademe/needs-verification.ts` | create | Whether the match should be double-checked. |
| `src/core/ademe/needs-verification.test.ts` | create | Each trigger, neither, single candidate. |
| `src/core/ademe/record-facts.ts` | create | `streetLine`, `placeLine`, `reliableFloor`, `dpeDate`. |
| `src/core/ademe/record-facts.test.ts` | create | Floor-0 trap, impossible dates, street/place lines. |
| `src/core/listing/listing-summary.ts` | create | `listingDisplayUrl`. |
| `src/core/listing/listing-summary.test.ts` | create | Host + path, `www.` stripped, unparsable URL. |
| `src/hooks/use-media-query.ts` | create | `useMediaQuery(query)`. |
| `src/app/(app)/dashboard/components/listing/address-candidate-list.tsx` | modify | Cards: no CTA, no reasoning, uses `record-facts`; `onSelect` required. |
| `src/app/(app)/dashboard/components/listing/analysed-listing-card.tsx` | create | "Annonce analysée" card. |
| `src/app/(app)/dashboard/components/listing/result-detail-panel.tsx` | create | Detail panel body. |
| `src/app/(app)/dashboard/components/listing/results-workspace.tsx` | create | Grid layout, left column, map region, detail placement, camera padding. |
| `src/app/(app)/dashboard/components/listing/address-results-map.tsx` | delete | Replaced by `results-workspace.tsx`. |
| `src/app/(app)/dashboard/components/listing/listing-url-form.tsx` | modify | State machine + column layout; switches to the workspace; new search; no extraction dump. |
| `src/i18n/messages/en.json`, `fr.json` | modify | New copy; unused keys removed. |
| `scripts/boundaries/manifest.mjs` | modify | Public entries for the new core modules. |

---

### Task 1: Outbound link builders

**Files:**
- Create: `src/core/geo/outbound-links.ts`
- Test: `src/core/geo/outbound-links.test.ts`
- Modify: `scripts/boundaries/manifest.mjs` (the `geo` domain's `public` array)

**Interfaces:**
- Consumes: `GeoPoint` from `src/core/geo/types.ts` (`{ latitude: number; longitude: number }`).
- Produces:
  - `googleMapsUrl(point: GeoPoint): string`
  - `georisquesReportUrl(input: { point: GeoPoint; inseeCode: string; address: string; city: string | null }): string | null`
  - `dvfSalesUrl(input: { point: GeoPoint; inseeCode: string }): string | null`
  - `inseeCommuneUrl(inseeCode: string): string | null`

- [ ] **Step 1: Write the failing test**

Create `src/core/geo/outbound-links.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  dvfSalesUrl,
  georisquesReportUrl,
  googleMapsUrl,
  inseeCommuneUrl,
} from './outbound-links';

const LAVOISIER = { latitude: 45.755599, longitude: 4.858685 };

describe('googleMapsUrl', () => {
  // why: a coordinate query pins the point we trust; an address query lets
  // Google's geocoder pick its own building.
  it('searches the trusted coordinate, never the address', () => {
    expect(googleMapsUrl(LAVOISIER)).toBe(
      'https://www.google.com/maps/search/?api=1&query=45.755599%2C4.858685',
    );
  });
});

describe('georisquesReportUrl', () => {
  it('opens the address report placed on the trusted point', () => {
    const href = georisquesReportUrl({
      point: LAVOISIER,
      inseeCode: '69383',
      address: '16 Rue Lavoisier 69003 Lyon',
      city: 'Lyon',
    });
    expect(href).not.toBeNull();
    if (href === null) return;
    const url = new URL(href);
    expect(url.origin + url.pathname).toBe(
      'https://www.georisques.gouv.fr/mes-risques/connaitre-les-risques-pres-de-chez-moi/rapport2',
    );
    expect(url.searchParams.get('typeForm')).toBe('adresse');
    expect(url.searchParams.get('codeInsee')).toBe('69383');
    expect(url.searchParams.get('lat')).toBe('45.755599');
    expect(url.searchParams.get('lon')).toBe('4.858685');
    expect(url.searchParams.get('adresse')).toBe('16 Rue Lavoisier 69003 Lyon');
    expect(url.searchParams.get('city')).toBe('Lyon');
  });

  it('sends an empty city rather than the text "null"', () => {
    const href = georisquesReportUrl({
      point: LAVOISIER,
      inseeCode: '69383',
      address: '16 Rue Lavoisier 69003 Lyon',
      city: null,
    });
    expect(href).not.toBeNull();
    if (href === null) return;
    expect(new URL(href).searchParams.get('city')).toBe('');
  });

  it('gives no link for a malformed commune code', () => {
    expect(
      georisquesReportUrl({
        point: LAVOISIER,
        inseeCode: '2A04',
        address: 'x',
        city: null,
      }),
    ).toBeNull();
  });
});

describe('dvfSalesUrl', () => {
  // why: the DVF app ignores the point unless lat, lng and zoom are all set,
  // and it reads `lng`, not `lon`.
  it('centres the sales map on the trusted point at street zoom', () => {
    const href = dvfSalesUrl({ point: LAVOISIER, inseeCode: '69383' });
    expect(href).not.toBeNull();
    if (href === null) return;
    const url = new URL(href);
    expect(url.origin + url.pathname).toBe(
      'https://explore.data.gouv.fr/fr/immobilier',
    );
    expect(url.searchParams.get('level')).toBe('commune');
    expect(url.searchParams.get('code')).toBe('69383');
    expect(url.searchParams.get('lat')).toBe('45.755599');
    expect(url.searchParams.get('lng')).toBe('4.858685');
    expect(url.searchParams.get('zoom')).toBe('18');
  });

  it('uppercases a Corsican code', () => {
    const href = dvfSalesUrl({ point: LAVOISIER, inseeCode: '2a004' });
    expect(href).not.toBeNull();
    if (href === null) return;
    expect(new URL(href).searchParams.get('code')).toBe('2A004');
  });
});

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

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="$HOME/.nvm/versions/node/v25.2.1/bin:$PATH"; pnpm vitest run src/core/geo/outbound-links.test.ts`
Expected: FAIL — `Failed to resolve import "./outbound-links"`.

- [ ] **Step 3: Write the implementation**

Create `src/core/geo/outbound-links.ts`:

```ts
import type { GeoPoint } from './types';

const INSEE_CODE = /^(\d{5}|2[AB]\d{3})$/;

function coordinate(value: number): string {
  return value.toFixed(6);
}

// why: INSEE and DVF answer an error page to a lowercase Corsican code or a
// malformed one, so a link is only built from a well-formed code.
function wellFormedInseeCode(value: string): string | null {
  const code = value.trim().toUpperCase();
  return INSEE_CODE.test(code) ? code : null;
}

export function googleMapsUrl(point: GeoPoint): string {
  const query = new URLSearchParams({
    api: '1',
    query: `${coordinate(point.latitude)},${coordinate(point.longitude)}`,
  });
  return `https://www.google.com/maps/search/?${query.toString()}`;
}

export function georisquesReportUrl({
  point,
  inseeCode,
  address,
  city,
}: {
  point: GeoPoint;
  inseeCode: string;
  address: string;
  city: string | null;
}): string | null {
  const code = wellFormedInseeCode(inseeCode);
  if (code === null) return null;
  const query = new URLSearchParams({
    typeForm: 'adresse',
    city: city ?? '',
    codeInsee: code,
    lon: coordinate(point.longitude),
    lat: coordinate(point.latitude),
    adresse: address,
  });
  return `https://www.georisques.gouv.fr/mes-risques/connaitre-les-risques-pres-de-chez-moi/rapport2?${query.toString()}`;
}

export function dvfSalesUrl({
  point,
  inseeCode,
}: {
  point: GeoPoint;
  inseeCode: string;
}): string | null {
  const code = wellFormedInseeCode(inseeCode);
  if (code === null) return null;
  const query = new URLSearchParams({
    onglet: 'carte',
    filtre: 'tous',
    level: 'commune',
    code,
    lat: coordinate(point.latitude),
    lng: coordinate(point.longitude),
    zoom: '18',
  });
  return `https://explore.data.gouv.fr/fr/immobilier?${query.toString()}`;
}

export function inseeCommuneUrl(inseeCode: string): string | null {
  const code = wellFormedInseeCode(inseeCode);
  if (code === null) return null;
  return `https://www.insee.fr/fr/statistiques/2011101?geo=COM-${code}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/core/geo/outbound-links.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Expose the module to the listing UI**

In `scripts/boundaries/manifest.mjs`, in the `geo` domain's `public` array, add after `'src/core/geo/resolve-mappable-point',`:

```js
      'src/core/geo/outbound-links',
```

Run: `node scripts/check-domain-boundaries.mjs`
Expected: `Domain boundaries OK.`

- [ ] **Step 6: Commit**

```bash
git add src/core/geo/outbound-links.ts src/core/geo/outbound-links.test.ts scripts/boundaries/manifest.mjs
git commit -m "feat(geo): build verify-elsewhere links from the trusted point

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Verification rule and record facts

**Files:**
- Create: `src/core/ademe/needs-verification.ts`, `src/core/ademe/needs-verification.test.ts`
- Create: `src/core/ademe/record-facts.ts`, `src/core/ademe/record-facts.test.ts`
- Modify: `scripts/boundaries/manifest.mjs` (the `ademe` domain's `public` array)

**Interfaces:**
- Consumes: `AddressMatch`, `AddressCandidate`, `DpeRecord` from `src/core/ademe/types.ts`.
- Produces:
  - `needsVerification(match: Pick<AddressMatch, 'candidates'>): boolean`
  - `streetLine(record: Pick<DpeRecord, 'address' | 'street' | 'streetNumber'>): string`
  - `placeLine(record: Pick<DpeRecord, 'postalCode' | 'city'>): string | null`
  - `reliableFloor(record: Pick<DpeRecord, 'floor'>): number | null`
  - `dpeDate(record: Pick<DpeRecord, 'establishedOn'>): Date | null` (UTC midnight)

- [ ] **Step 1: Write the failing tests**

Create `src/core/ademe/needs-verification.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { needsVerification } from './needs-verification';
import type { AddressCandidate, DpeRecord, MatchSignal } from './types';

function record(dpeNumber: string): DpeRecord {
  return {
    dpeNumber,
    dataset: 'existing',
    banId: null,
    address: '16 Rue Lavoisier 69003 Lyon',
    streetNumber: '16',
    street: 'Rue Lavoisier',
    postalCode: '69003',
    city: 'Lyon',
    inseeCode: '69383',
    propertyType: 'apartment',
    surfaceM2: 63,
    dpeClass: 'D',
    gesClass: 'D',
    dpeKwhM2Year: 200,
    gesKgCo2M2Year: 40,
    heatingEnergy: null,
    yearBuilt: null,
    landSurfaceM2: null,
    buildingFloors: null,
    floor: null,
    buildingComplement: null,
    establishedOn: null,
    visitedOn: null,
    annualEnergyCostEur: null,
    geocodingScore: 0.9,
    point: null,
  };
}

function candidate(
  dpeNumber: string,
  confidence: number,
  diverged: readonly MatchSignal[] = [],
): AddressCandidate {
  return {
    record: record(dpeNumber),
    confidence,
    matched: ['surfaceM2'],
    diverged,
    supportingRecords: 1,
  };
}

describe('needsVerification', () => {
  it('is quiet for a clear first answer that agrees on everything', () => {
    expect(
      needsVerification({
        candidates: [candidate('a', 0.91), candidate('b', 0.66)],
      }),
    ).toBe(false);
  });

  it('asks for a check when the first answer differs on a signal', () => {
    expect(
      needsVerification({
        candidates: [candidate('a', 0.91, ['heatingEnergy']), candidate('b', 0.4)],
      }),
    ).toBe(true);
  });

  // why: scores are shown rounded to /100, so the gap is measured on what the
  // user sees: 84 against 81 is a close call even if the raw gap is 0.034.
  it('asks for a check when the runner-up is within 10 points', () => {
    expect(
      needsVerification({
        candidates: [candidate('a', 0.84), candidate('b', 0.806)],
      }),
    ).toBe(true);
  });

  it('is quiet when the runner-up is exactly 10 points behind', () => {
    expect(
      needsVerification({
        candidates: [candidate('a', 0.9), candidate('b', 0.8)],
      }),
    ).toBe(false);
  });

  it('judges a single candidate on its own divergence only', () => {
    expect(needsVerification({ candidates: [candidate('a', 0.5)] })).toBe(
      false,
    );
    expect(
      needsVerification({ candidates: [candidate('a', 0.9, ['floor'])] }),
    ).toBe(true);
  });

  it('is quiet without candidates', () => {
    expect(needsVerification({ candidates: [] })).toBe(false);
  });
});
```

Create `src/core/ademe/record-facts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { dpeDate, placeLine, reliableFloor, streetLine } from './record-facts';

describe('streetLine', () => {
  it('joins the house number and the street', () => {
    expect(
      streetLine({
        address: '16 Rue Lavoisier 69003 Lyon',
        streetNumber: '16',
        street: 'Rue Lavoisier',
      }),
    ).toBe('16 Rue Lavoisier');
  });

  it('keeps the street alone when there is no number', () => {
    expect(
      streetLine({
        address: 'Rue Lavoisier 69003 Lyon',
        streetNumber: null,
        street: 'Rue Lavoisier',
      }),
    ).toBe('Rue Lavoisier');
  });

  it('falls back to the full address when the street is unknown', () => {
    expect(
      streetLine({
        address: '16 Rue Lavoisier 69003 Lyon',
        streetNumber: '16',
        street: null,
      }),
    ).toBe('16 Rue Lavoisier 69003 Lyon');
  });
});

describe('placeLine', () => {
  it('joins the postal code and the city', () => {
    expect(placeLine({ postalCode: '69003', city: 'Lyon' })).toBe(
      '69003 Lyon',
    );
  });

  it('keeps what is known', () => {
    expect(placeLine({ postalCode: null, city: 'Lyon' })).toBe('Lyon');
  });

  it('has nothing to say when both are unknown', () => {
    expect(placeLine({ postalCode: null, city: null })).toBeNull();
  });
});

describe('reliableFloor', () => {
  // why: ADEME stores 0 as a default floor on most rows (85 of 89 measured),
  // so 0 never means "ground floor".
  it('ignores floor 0', () => {
    expect(reliableFloor({ floor: 0 })).toBeNull();
  });

  it('keeps a real floor', () => {
    expect(reliableFloor({ floor: 3 })).toBe(3);
  });

  it('ignores a missing, negative or fractional floor', () => {
    expect(reliableFloor({ floor: null })).toBeNull();
    expect(reliableFloor({ floor: -1 })).toBeNull();
    expect(reliableFloor({ floor: 2.5 })).toBeNull();
  });
});

describe('dpeDate', () => {
  it('reads an ISO date as UTC midnight', () => {
    expect(dpeDate({ establishedOn: '2023-04-12' })?.toISOString()).toBe(
      '2023-04-12T00:00:00.000Z',
    );
  });

  it('rejects a date that does not exist', () => {
    expect(dpeDate({ establishedOn: '2023-02-30' })).toBeNull();
  });

  it('rejects any other format', () => {
    expect(dpeDate({ establishedOn: '12/04/2023' })).toBeNull();
    expect(dpeDate({ establishedOn: '2023-04-12T10:00:00Z' })).toBeNull();
    expect(dpeDate({ establishedOn: null })).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/core/ademe/needs-verification.test.ts src/core/ademe/record-facts.test.ts`
Expected: FAIL — both imports unresolved.

- [ ] **Step 3: Write the implementations**

Create `src/core/ademe/needs-verification.ts`:

```ts
import type { AddressMatch } from './types';

// why: scores are shown rounded to /100, so the gap is measured on what the
// user sees.
const CLOSE_RUNNER_UP_POINTS = 10;

function points(confidence: number): number {
  return Math.round(confidence * 100);
}

export function needsVerification(
  match: Pick<AddressMatch, 'candidates'>,
): boolean {
  const [top, runnerUp] = match.candidates;
  if (top === undefined) return false;
  if (top.diverged.length > 0) return true;
  if (runnerUp === undefined) return false;
  return (
    points(top.confidence) - points(runnerUp.confidence) <
    CLOSE_RUNNER_UP_POINTS
  );
}
```

Create `src/core/ademe/record-facts.ts`:

```ts
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
export function reliableFloor(
  record: Pick<DpeRecord, 'floor'>,
): number | null {
  const { floor } = record;
  return floor !== null && Number.isInteger(floor) && floor >= 1 ? floor : null;
}

export function dpeDate(
  record: Pick<DpeRecord, 'establishedOn'>,
): Date | null {
  const value = record.establishedOn;
  if (value === null || !ISO_DATE.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  // why: `new Date` rolls 2023-02-30 over to March 2 instead of failing.
  return date.toISOString().slice(0, 10) === value ? date : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/core/ademe/needs-verification.test.ts src/core/ademe/record-facts.test.ts`
Expected: PASS, 6 + 13 tests.

- [ ] **Step 5: Expose the modules to the listing UI**

In `scripts/boundaries/manifest.mjs`, in the `ademe` domain's `public` array, add after `'src/core/ademe/candidate-on-map',`:

```js
      'src/core/ademe/needs-verification',
      'src/core/ademe/record-facts',
```

Run: `node scripts/check-domain-boundaries.mjs`
Expected: `Domain boundaries OK.`

- [ ] **Step 6: Commit**

```bash
git add src/core/ademe/needs-verification.ts src/core/ademe/needs-verification.test.ts src/core/ademe/record-facts.ts src/core/ademe/record-facts.test.ts scripts/boundaries/manifest.mjs
git commit -m "feat(ademe): verification rule and display facts for a DPE record

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: New copy, and cards without reasoning

**Files:**
- Modify: `src/i18n/messages/en.json`, `src/i18n/messages/fr.json`
- Modify: `src/app/(app)/dashboard/components/listing/address-candidate-list.tsx` (full rewrite below)

**Interfaces:**
- Consumes: `streetLine`, `placeLine` (Task 2); `streetViewImagePath` from `src/core/street-view/links.ts`.
- Produces: `AddressCandidateList({ candidates, shownDpeNumber, onSelect, streetViewEnabled })` with `onSelect?: (dpeNumber: string) => void` (still optional until Task 7). The i18n keys listed below, used by Tasks 4–7.

- [ ] **Step 1: Add the new copy**

In both files, inside the `"Listing"` object, add these keys (after the last existing key, keeping valid JSON). `en.json`:

```json
    "resultsNewSearch": "New search",
    "listingAnalysedLabel": "Analysed listing",
    "listingUntitled": "Listing",
    "listingRooms": "{count, plural, one {# room} other {# rooms}}",
    "listingPlace": "{city} ({postalCode})",
    "listingOpen": "Open the listing on {host} (new tab)",
    "verifyNoticeTitle": "Match to verify",
    "verifyNoticeBody": "Compare the photo and the map with the listing photos before relying on this address.",
    "detailTitle": "Result {rank}",
    "detailClose": "Close the result",
    "detailScoreLabel": "match score",
    "detailCopy": "Copy the address",
    "detailCopied": "Address copied",
    "detailCopyFailed": "Could not copy the address",
    "detailStreetViewOpen": "Open in Google Street View (new tab)",
    "detailDpe": "DPE {letter}",
    "detailGes": "GES {letter}",
    "detailFactAgrees": "Matches the listing",
    "factType": "Property type",
    "factSurface": "Surface",
    "factYearBuilt": "Year built",
    "factHeating": "Heating",
    "factDpeDate": "DPE date",
    "factFloor": "Floor",
    "factFloorValue": "{floor, selectordinal, one {#st} two {#nd} few {#rd} other {#th}} floor",
    "heatingGas": "Gas",
    "heatingElectricity": "Electricity",
    "heatingDistrictHeating": "District heating",
    "heatingFuelOil": "Fuel oil",
    "heatingWood": "Wood",
    "heatingLpg": "LPG",
    "heatingCoal": "Coal",
    "verifyElsewhere": "Check elsewhere",
    "linkGoogleMaps": "Google Maps",
    "linkGoogleMapsHint": "Street and surroundings",
    "linkGeorisques": "Géorisques",
    "linkGeorisquesHint": "Site risks",
    "linkDvf": "DVF",
    "linkDvfHint": "Past sale prices",
    "linkInsee": "INSEE",
    "linkInseeHint": "Commune statistics",
    "mapRegionLabel": "Map"
```

`fr.json`:

```json
    "resultsNewSearch": "Nouvelle recherche",
    "listingAnalysedLabel": "Annonce analysée",
    "listingUntitled": "Annonce",
    "listingRooms": "{count, plural, one {# pièce} other {# pièces}}",
    "listingPlace": "{city} ({postalCode})",
    "listingOpen": "Ouvrir l'annonce sur {host} (nouvel onglet)",
    "verifyNoticeTitle": "Correspondance à vérifier",
    "verifyNoticeBody": "Comparez la photo et le plan avec les photos de l'annonce avant de vous fier à cette adresse.",
    "detailTitle": "Résultat {rank}",
    "detailClose": "Fermer le résultat",
    "detailScoreLabel": "score de correspondance",
    "detailCopy": "Copier l'adresse",
    "detailCopied": "Adresse copiée",
    "detailCopyFailed": "Impossible de copier l'adresse",
    "detailStreetViewOpen": "Ouvrir dans Google Street View (nouvel onglet)",
    "detailDpe": "DPE {letter}",
    "detailGes": "GES {letter}",
    "detailFactAgrees": "Conforme à l'annonce",
    "factType": "Type de bien",
    "factSurface": "Surface",
    "factYearBuilt": "Année de construction",
    "factHeating": "Chauffage",
    "factDpeDate": "Date du DPE",
    "factFloor": "Étage",
    "factFloorValue": "{floor, selectordinal, one {#er} other {#e}} étage",
    "heatingGas": "Gaz",
    "heatingElectricity": "Électricité",
    "heatingDistrictHeating": "Réseau de chaleur",
    "heatingFuelOil": "Fioul",
    "heatingWood": "Bois",
    "heatingLpg": "GPL",
    "heatingCoal": "Charbon",
    "verifyElsewhere": "Vérifier ailleurs",
    "linkGoogleMaps": "Google Maps",
    "linkGoogleMapsHint": "Rue et alentours",
    "linkGeorisques": "Géorisques",
    "linkGeorisquesHint": "Risques du terrain",
    "linkDvf": "DVF",
    "linkDvfHint": "Prix des ventes",
    "linkInsee": "INSEE",
    "linkInseeHint": "Chiffres de la commune",
    "mapRegionLabel": "Carte"
```

Remove from both files the keys only the reasoning lines and the card button used: `addressSupport`, `addressMatchedOn`, `addressDivergedOn`, `addressVerify`, `addressVerifyLabel`, and every key starting with `signal` (`signalSurface`, `signalDpeClass`, `signalGesClass`, `signalDpeValue`, `signalGesValue`, `signalYearBuilt`, `signalFloor`, `signalHeating`, `signalBuildingFloors`, `signalLandSurface`, `signalEnergyCost`, `signalDpeDate`, `signalPin`).

Check the two files still mirror each other:

```bash
python3 -c "import json;e=set(json.load(open('src/i18n/messages/en.json'))['Listing']);f=set(json.load(open('src/i18n/messages/fr.json'))['Listing']);print(e^f or 'mirror ok')"
```

Expected: `mirror ok`.

- [ ] **Step 2: Rewrite the cards**

Replace the whole content of `src/app/(app)/dashboard/components/listing/address-candidate-list.tsx` with:

```tsx
'use client';

import { MapPinOff } from 'lucide-react';
import Image from 'next/image';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { streetLine } from '@/core/ademe/record-facts';
import type { AddressCandidate } from '@/core/ademe/types';
import { streetViewImagePath } from '@/core/street-view/links';
import { cn } from '@/lib/utils';

type CardOptions = {
  shownDpeNumber: string | null;
  onSelect?: (dpeNumber: string) => void;
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

function CandidateCard({
  candidate,
  rank,
  shownDpeNumber,
  onSelect,
  streetViewEnabled,
}: CardOptions & { candidate: AddressCandidate; rank: number }) {
  const t = useTranslations('Listing');
  const format = useFormatter();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const { record } = candidate;
  const isShown = record.dpeNumber === shownDpeNumber;
  const emphasised = rank === 1 || isShown;
  const selectable = onSelect !== undefined;
  const score = Math.round(candidate.confidence * 100);
  const wasShown = useRef(isShown);

  // why: scroll only when the selection arrives on this card. On first render
  // the top card is already at the top; scrolling would hide the section title
  // on a phone, where a card is taller than the panel.
  useEffect(() => {
    if (isShown && !wasShown.current && selectable) {
      cardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    wasShown.current = isShown;
  }, [isShown, selectable]);

  const facts = [
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
    record.yearBuilt === null
      ? null
      : t('addressYearBuilt', { year: String(record.yearBuilt) }),
  ].filter((fact) => fact !== null);

  const body = (
    <>
      {streetViewEnabled && record.point !== null && !photoFailed && (
        <div className="relative aspect-[2/1]">
          <Skeleton className="absolute inset-0 rounded-none" />
          <Image
            unoptimized
            fill
            sizes="360px"
            src={streetViewImagePath(record.point)}
            alt={t('streetViewAlt', { address: record.address })}
            onError={() => {
              setPhotoFailed(true);
            }}
            className={cn('object-cover', !emphasised && 'saturate-50')}
          />
          <Badge variant="secondary" className="absolute bottom-2.5 left-2.5">
            {t('streetViewBadge')}
          </Badge>
        </div>
      )}
      <CardHeader className="pt-3">
        <CardTitle className="flex items-center gap-2 text-[15px] font-semibold">
          <Badge variant={emphasised ? 'default' : 'secondary'}>{rank}</Badge>
          {streetLine(record)}
        </CardTitle>
        {facts.length > 0 && (
          <CardDescription>{facts.join(' · ')}</CardDescription>
        )}
        <CardAction>
          <Badge variant="outline" className="tabular-nums">
            {t.rich('addressScore', {
              score,
              muted: (chunks) => (
                <span className="text-muted-foreground">{chunks}</span>
              ),
            })}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 pb-3">
        <Progress value={score} aria-hidden />
        {record.point === null && (
          <p className="flex items-center gap-1 text-[12px] text-muted-foreground">
            <MapPinOff className="size-3 shrink-0" aria-hidden />
            {t('addressNoPoint')}
          </p>
        )}
      </CardContent>
    </>
  );

  return (
    <Card
      ref={cardRef}
      size="sm"
      className={cn('gap-0 py-0', isShown && 'ring-2 ring-primary')}
    >
      {onSelect === undefined ? (
        body
      ) : (
        <button
          type="button"
          aria-current={isShown ? 'true' : undefined}
          onClick={() => {
            onSelect(record.dpeNumber);
          }}
          className="flex w-full cursor-pointer flex-col text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted"
        >
          {body}
        </button>
      )}
    </Card>
  );
}
```

- [ ] **Step 3: Verify it compiles and nothing still uses the removed keys**

Run: `pnpm type-check && pnpm lint && pnpm check`
Expected: all three exit 0. A `t('signal…')` or `t('addressSupport')` left anywhere fails `type-check` (missing key is a compile error).

- [ ] **Step 4: Commit**

```bash
git add src/i18n/messages/en.json src/i18n/messages/fr.json "src/app/(app)/dashboard/components/listing/address-candidate-list.tsx"
git commit -m "feat(listing): address cards show the address, not how it was scored

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Analysed-listing card

**Files:**
- Create: `src/core/listing/listing-summary.ts`, `src/core/listing/listing-summary.test.ts`
- Create: `src/app/(app)/dashboard/components/listing/analysed-listing-card.tsx`

**Interfaces:**
- Consumes: `ExtractedListing` from `src/core/listing/types.ts`; i18n keys from Task 3.
- Produces:
  - `listingDisplayUrl(canonicalUrl: string): string | null`
  - `AnalysedListingCard({ listing }: { listing: ExtractedListing })`

- [ ] **Step 1: Write the failing test**

Create `src/core/listing/listing-summary.test.ts`:

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

  it('drops a trailing slash, the query and the fragment', () => {
    expect(
      listingDisplayUrl('https://www.pap.fr/annonces/r465201632/?utm=x#top'),
    ).toBe('pap.fr/annonces/r465201632');
  });

  it('shows the host alone for a bare domain', () => {
    expect(listingDisplayUrl('https://www.seloger.com/')).toBe('seloger.com');
  });

  it('has nothing to show for a URL it cannot parse', () => {
    expect(listingDisplayUrl('not a url')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/core/listing/listing-summary.test.ts`
Expected: FAIL — `Failed to resolve import "./listing-summary"`.

- [ ] **Step 3: Write the implementation**

Create `src/core/listing/listing-summary.ts`:

```ts
export function listingDisplayUrl(canonicalUrl: string): string | null {
  if (!URL.canParse(canonicalUrl)) return null;
  const url = new URL(canonicalUrl);
  const host = url.hostname.replace(/^www\./, '');
  const path = url.pathname.replace(/\/+$/, '');
  return `${host}${path}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/core/listing/listing-summary.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the card**

Create `src/app/(app)/dashboard/components/listing/analysed-listing-card.tsx`:

```tsx
'use client';

import { ExternalLink } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { buttonVariants } from '@/components/ui/button';
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
    fields.yearBuilt === null
      ? null
      : t('addressYearBuilt', { year: String(fields.yearBuilt) }),
    place,
  ].filter((fact) => fact !== null);
  const displayUrl = listingDisplayUrl(fields.canonicalUrl);
  const openLabel = t('listingOpen', {
    host: displayUrl ?? fields.canonicalUrl,
  });

  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription className="text-[11px] font-semibold uppercase tracking-[0.06em]">
          {t('listingAnalysedLabel')}
        </CardDescription>
        <CardTitle className="text-[15px] font-semibold">
          {title.length > 0 ? title : t('listingUntitled')}
        </CardTitle>
        <CardAction>
          <a
            href={fields.canonicalUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={openLabel}
            className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
          >
            <ExternalLink aria-hidden />
          </a>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        {facts.length > 0 && (
          <p className="text-[13px] text-muted-foreground">
            {facts.join(' · ')}
          </p>
        )}
        {displayUrl !== null && (
          <a
            href={fields.canonicalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-[12px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {displayUrl}
          </a>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: Verify and commit**

Run: `pnpm type-check && pnpm lint && pnpm check`
Expected: all exit 0 (the card is not rendered yet; Task 6 mounts it).

```bash
git add src/core/listing/listing-summary.ts src/core/listing/listing-summary.test.ts "src/app/(app)/dashboard/components/listing/analysed-listing-card.tsx"
git commit -m "feat(listing): analysed-listing card for the results view

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Result detail panel

**Files:**
- Create: `src/app/(app)/dashboard/components/listing/result-detail-panel.tsx`

**Interfaces:**
- Consumes: `streetLine`, `placeLine`, `reliableFloor`, `dpeDate` (Task 2); `googleMapsUrl`, `georisquesReportUrl`, `dvfSalesUrl`, `inseeCommuneUrl` (Task 1); `streetViewImagePath`, `streetViewPanoramaUrl` from `src/core/street-view/links.ts`; i18n keys (Task 3).
- Produces: `ResultDetailPanel({ candidate, rank, onPrevious, onNext, onClose, streetViewEnabled })`:
  - `candidate: AddressCandidate`, `rank: number` (1-based),
  - `onPrevious: (() => void) | null`, `onNext: (() => void) | null` (null disables the button),
  - `onClose: () => void`, `streetViewEnabled: boolean`.
  - Renders a `flex min-h-0 flex-1 flex-col` body without its own card chrome; the caller wraps it (Task 6) and must key it by `candidate.record.dpeNumber` so the photo state and scroll reset per result.

- [ ] **Step 1: Write the panel**

Create `src/app/(app)/dashboard/components/listing/result-detail-panel.tsx`:

```tsx
'use client';

import {
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Landmark,
  MapPin,
  TriangleAlert,
  X,
} from 'lucide-react';
import Image from 'next/image';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  dpeDate,
  placeLine,
  reliableFloor,
  streetLine,
} from '@/core/ademe/record-facts';
import type { AddressCandidate, MatchSignal } from '@/core/ademe/types';
import {
  dvfSalesUrl,
  georisquesReportUrl,
  googleMapsUrl,
  inseeCommuneUrl,
} from '@/core/geo/outbound-links';
import type { EnergyClass, HeatingEnergy } from '@/core/listing/types';
import {
  streetViewImagePath,
  streetViewPanoramaUrl,
} from '@/core/street-view/links';

// why: the official DPE and GES label colours encode the letter itself; they
// are the one deliberate exception to the single accent colour.
const DPE_COLOUR = {
  A: '#319834',
  B: '#33CC31',
  C: '#CBFC34',
  D: '#FBFE06',
  E: '#FBCC05',
  F: '#FC9935',
  G: '#FC0205',
} as const satisfies Record<EnergyClass, string>;

const GES_COLOUR = {
  A: '#F6EDFD',
  B: '#E4C7FA',
  C: '#D5AAF6',
  D: '#CB95F3',
  E: '#BA72EF',
  F: '#A74DEB',
  G: '#8A19DF',
} as const satisfies Record<EnergyClass, string>;

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
  signal: MatchSignal | null;
};

type OutboundLink = {
  href: string;
  title: string;
  hint: string;
  icon: typeof MapPin;
};

async function copied(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function ResultDetailPanel({
  candidate,
  rank,
  onPrevious,
  onNext,
  onClose,
  streetViewEnabled,
}: {
  candidate: AddressCandidate;
  rank: number;
  onPrevious: (() => void) | null;
  onNext: (() => void) | null;
  onClose: () => void;
  streetViewEnabled: boolean;
}) {
  const t = useTranslations('Listing');
  const format = useFormatter();
  const [photoFailed, setPhotoFailed] = useState(false);
  const { record } = candidate;
  const { point } = record;
  const score = Math.round(candidate.confidence * 100);
  const place = placeLine(record);
  const floor = reliableFloor(record);
  const date = dpeDate(record);

  const facts: Fact[] = [
    record.propertyType === null
      ? null
      : {
          label: t('factType'),
          value:
            record.propertyType === 'apartment'
              ? t('addressPropertyApartment')
              : t('addressPropertyHouse'),
          signal: null,
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
          signal: 'surfaceM2' as const,
        },
    record.yearBuilt === null
      ? null
      : {
          label: t('factYearBuilt'),
          value: String(record.yearBuilt),
          signal: 'yearBuilt' as const,
        },
    record.heatingEnergy === null
      ? null
      : {
          label: t('factHeating'),
          value: t(HEATING_KEY[record.heatingEnergy]),
          signal: 'heatingEnergy' as const,
        },
    date === null
      ? null
      : {
          label: t('factDpeDate'),
          value: format.dateTime(date, { dateStyle: 'long', timeZone: 'UTC' }),
          signal: 'dpeDate' as const,
        },
    floor === null
      ? null
      : {
          label: t('factFloor'),
          value: t('factFloorValue', { floor }),
          signal: 'floor' as const,
        },
  ].filter((fact) => fact !== null);

  const links: OutboundLink[] =
    point === null
      ? []
      : [
          {
            href: googleMapsUrl(point),
            title: t('linkGoogleMaps'),
            hint: t('linkGoogleMapsHint'),
            icon: MapPin,
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
          },
          {
            href: dvfSalesUrl({ point, inseeCode: record.inseeCode }),
            title: t('linkDvf'),
            hint: t('linkDvfHint'),
            icon: Landmark,
          },
          {
            href: inseeCommuneUrl(record.inseeCode),
            title: t('linkInsee'),
            hint: t('linkInseeHint'),
            icon: BarChart3,
          },
        ].filter((link): link is OutboundLink => link.href !== null);

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
            <Badge
              variant="secondary"
              className="absolute bottom-2.5 left-2.5"
            >
              {t('streetViewBadge')}
            </Badge>
          </a>
        )}
        <div className="flex flex-col gap-4 p-4">
          <div className="flex items-center gap-2">
            <Badge>{rank}</Badge>
            <span className="text-[20px] font-semibold tabular-nums text-ink">
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
          </div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[20px] font-semibold leading-tight tracking-[-0.18px] text-ink">
                {streetLine(record)}
              </p>
              {place !== null && (
                <p className="mt-0.5 text-[14px] text-graphite">{place}</p>
              )}
            </div>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={t('detailCopy')}
              onClick={() => {
                void copied(record.address).then((ok) => {
                  if (ok) toast.success(t('detailCopied'));
                  else toast.error(t('detailCopyFailed'));
                });
              }}
            >
              <Copy />
            </Button>
          </div>
          {(record.dpeClass !== null || record.gesClass !== null) && (
            <div className="flex items-center gap-2">
              {record.dpeClass !== null && (
                <Badge variant="outline">
                  <span
                    aria-hidden
                    className="size-2 rounded-full"
                    style={{ backgroundColor: DPE_COLOUR[record.dpeClass] }}
                  />
                  {t('detailDpe', { letter: record.dpeClass })}
                </Badge>
              )}
              {record.gesClass !== null && (
                <Badge variant="outline">
                  <span
                    aria-hidden
                    className="size-2 rounded-full"
                    style={{ backgroundColor: GES_COLOUR[record.gesClass] }}
                  />
                  {t('detailGes', { letter: record.gesClass })}
                </Badge>
              )}
            </div>
          )}
          {facts.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {facts.map((fact) => (
                <Card key={fact.label} size="sm" className="gap-0 py-2.5">
                  <CardContent className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] text-muted-foreground">
                        {fact.label}
                      </p>
                      <p className="mt-0.5 text-[14px] font-medium text-ink">
                        {fact.value}
                      </p>
                    </div>
                    {fact.signal !== null &&
                      candidate.matched.includes(fact.signal) && (
                        <span className="shrink-0 text-ink">
                          <Check className="size-3.5" aria-hidden />
                          <span className="sr-only">
                            {t('detailFactAgrees')}
                          </span>
                        </span>
                      )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          {links.length > 0 && (
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
                          'h-auto justify-start gap-2.5 whitespace-normal px-3 py-2.5 text-left',
                      })}
                    >
                      <link.icon className="size-4 shrink-0" aria-hidden />
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
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm type-check && pnpm lint && pnpm check`
Expected: all exit 0. If `format.dateTime` rejects `timeZone` in `DateTimeFormatOptions`, check `node_modules/use-intl/dist/types` — `timeZone` is a standard `Intl.DateTimeFormatOptions` field and is accepted.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/dashboard/components/listing/result-detail-panel.tsx"
git commit -m "feat(listing): detail panel for the selected result

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Results workspace

**Files:**
- Create: `src/hooks/use-media-query.ts`
- Create: `src/app/(app)/dashboard/components/listing/results-workspace.tsx`

**Interfaces:**
- Consumes: `AddressCandidateList` (Task 3), `AnalysedListingCard` (Task 4), `ResultDetailPanel` (Task 5), `needsVerification` (Task 2), `mapOverview` from `src/core/ademe/candidate-on-map.ts`, `MapErrorBoundary` from `./map-error-boundary`, `AddressMap` from `./address-map` (props `point`, `overview`, `focusRequest`, `padding`, `accessToken`).
- Produces:
  - `useMediaQuery(query: string): boolean` (server snapshot `false`).
  - `type DetailPreference = 'default' | 'open' | 'closed'`
  - `type MapAvailability = { kind: 'ready'; overview: GeoPoint } | { kind: 'unavailable' } | { kind: 'no-trusted-point' } | { kind: 'failed' }`
  - `mapAvailability(input: { candidates: readonly AddressCandidate[]; mapboxAccessToken: string; mapFailed: boolean }): MapAvailability`
  - `ResultsWorkspace(props)` with props:
    `listing: ExtractedListing; match: AddressMatch; shown: AddressCandidate; focusRequest: number; detailPreference: DetailPreference; map: MapAvailability; accessToken: string; streetViewEnabled: boolean; onSelect: (dpeNumber: string) => void; onCloseDetail: () => void; onMapFailure: () => void; onNewSearch: () => void`

- [ ] **Step 1: Write the hook**

Create `src/hooks/use-media-query.ts`:

```ts
'use client';

import { useCallback, useSyncExternalStore } from 'react';

function serverSnapshot(): boolean {
  return false;
}

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  const snapshot = useCallback(
    () => window.matchMedia(query).matches,
    [query],
  );
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
```

- [ ] **Step 2: Write the workspace**

Create `src/app/(app)/dashboard/components/listing/results-workspace.tsx`:

```tsx
'use client';

import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Info,
  MapPin,
  MapPinOff,
  Search,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { EmptyState } from '@/components/ui/empty-state';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { mapOverview } from '@/core/ademe/candidate-on-map';
import { needsVerification } from '@/core/ademe/needs-verification';
import type { AddressCandidate, AddressMatch } from '@/core/ademe/types';
import type { GeoPoint } from '@/core/geo/types';
import type { ExtractedListing } from '@/core/listing/types';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';
import { AddressCandidateList } from './address-candidate-list';
import { AnalysedListingCard } from './analysed-listing-card';
import { MapErrorBoundary } from './map-error-boundary';
import { ResultDetailPanel } from './result-detail-panel';

// why: mapbox-gl weighs about 500 KB compressed. It is only downloaded the
// first time a map is shown, not on every dashboard visit.
const AddressMap = dynamic(
  () => import('./address-map').then((module) => module.AddressMap),
  {
    ssr: false,
    loading: () => <Skeleton className="h-full w-full rounded-none" />,
  },
);

// why: same thresholds as Tailwind's `lg:` (64rem) and `xl:` (80rem), which
// lay the regions out; a px threshold would diverge when a user enlarges the
// browser's default font size.
const LG_QUERY = '(min-width: 64rem)';
const XL_QUERY = '(min-width: 80rem)';

// why: between lg and xl the detail panel (400px plus a 12px margin on each
// side) floats over the right of the map; the pin is centred in what stays
// visible. Every side is explicit because Mapbox keeps the ones left out.
const PANEL_CLEARANCE = { top: 0, right: 424, bottom: 0, left: 0 };
const NO_CLEARANCE = { top: 0, right: 0, bottom: 0, left: 0 };

export type DetailPreference = 'default' | 'open' | 'closed';

export type MapAvailability =
  | { kind: 'ready'; overview: GeoPoint }
  | { kind: 'unavailable' }
  | { kind: 'no-trusted-point' }
  | { kind: 'failed' };

export function mapAvailability({
  candidates,
  mapboxAccessToken,
  mapFailed,
}: {
  candidates: readonly AddressCandidate[];
  mapboxAccessToken: string;
  mapFailed: boolean;
}): MapAvailability {
  if (mapboxAccessToken.length === 0) return { kind: 'unavailable' };
  if (mapFailed) return { kind: 'failed' };
  const overview = mapOverview(candidates);
  return overview === null
    ? { kind: 'no-trusted-point' }
    : { kind: 'ready', overview };
}

export function ResultsWorkspace({
  listing,
  match,
  shown,
  focusRequest,
  detailPreference,
  map,
  accessToken,
  streetViewEnabled,
  onSelect,
  onCloseDetail,
  onMapFailure,
  onNewSearch,
}: {
  listing: ExtractedListing;
  match: AddressMatch;
  shown: AddressCandidate;
  focusRequest: number;
  detailPreference: DetailPreference;
  map: MapAvailability;
  accessToken: string;
  streetViewEnabled: boolean;
  onSelect: (dpeNumber: string) => void;
  onCloseDetail: () => void;
  onMapFailure: () => void;
  onNewSearch: () => void;
}) {
  const t = useTranslations('Listing');
  const isLg = useMediaQuery(LG_QUERY);
  const isXl = useMediaQuery(XL_QUERY);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const { candidates } = match;
  const index = candidates.findIndex(
    (candidate) => candidate.record.dpeNumber === shown.record.dpeNumber,
  );
  const previous = candidates[index - 1];
  const next = candidates[index + 1];
  const rank = index + 1;
  const detailOpen =
    detailPreference === 'default' ? isXl : detailPreference === 'open';
  const padding =
    isLg && !isXl && detailOpen ? PANEL_CLEARANCE : NO_CLEARANCE;

  // why: the search form is not part of this view, so keyboard focus would
  // fall to <body> when it appears; it lands on the results heading instead.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const detail = (
    <ResultDetailPanel
      key={shown.record.dpeNumber}
      candidate={shown}
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
      onClose={onCloseDetail}
      streetViewEnabled={streetViewEnabled}
    />
  );

  return (
    <div
      className={cn(
        'relative grid min-h-0 flex-1 grid-rows-[45%_minmax(0,1fr)] lg:grid-cols-[360px_minmax(0,1fr)] lg:grid-rows-1',
        detailOpen && 'xl:grid-cols-[360px_minmax(0,1fr)_420px]',
      )}
    >
      <section
        aria-labelledby="results-heading"
        className="order-2 flex min-h-0 flex-col border-t border-border bg-linen lg:order-none lg:border-t-0 lg:border-r"
      >
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-4 p-3">
            <Button variant="outline" className="w-full" onClick={onNewSearch}>
              <Search />
              {t('resultsNewSearch')}
            </Button>
            <AnalysedListingCard listing={listing} />
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
            {needsVerification(match) && (
              <Alert role="status">
                <Info />
                <Collapsible className="col-start-2">
                  <CollapsibleTrigger className="group/verify flex w-full cursor-pointer items-center justify-between gap-2 text-left font-medium">
                    {t('verifyNoticeTitle')}
                    <ChevronDown
                      aria-hidden
                      className="size-4 transition-transform group-data-[panel-open]/verify:rotate-180"
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <AlertDescription className="mt-1">
                      {t('verifyNoticeBody')}
                    </AlertDescription>
                  </CollapsibleContent>
                </Collapsible>
              </Alert>
            )}
            <AddressCandidateList
              candidates={candidates}
              shownDpeNumber={shown.record.dpeNumber}
              onSelect={onSelect}
              streetViewEnabled={streetViewEnabled}
            />
          </div>
        </ScrollArea>
      </section>

      <div
        role="region"
        aria-label={t('mapRegionLabel')}
        className="relative order-1 min-h-0 lg:order-none"
      >
        {map.kind === 'ready' ? (
          <>
            <div className="absolute inset-0">
              <MapErrorBoundary fallback={null} onError={onMapFailure}>
                <AddressMap
                  point={shown.record.point}
                  overview={map.overview}
                  focusRequest={focusRequest}
                  padding={padding}
                  accessToken={accessToken}
                />
              </MapErrorBoundary>
            </div>
            <Badge
              variant="outline"
              aria-live="polite"
              className="absolute top-3 left-3 z-10 h-auto max-w-[calc(100%-1.5rem)] gap-1.5 bg-paper py-1 whitespace-normal shadow-sm"
            >
              {shown.record.point === null ? (
                <MapPinOff aria-hidden />
              ) : (
                <MapPin aria-hidden />
              )}
              {shown.record.point === null
                ? t('mapNoTrustedPoint', { address: shown.record.address })
                : t('mapPinned', { address: shown.record.address })}
            </Badge>
          </>
        ) : (
          <EmptyState
            icon={MapPinOff}
            title={
              map.kind === 'unavailable'
                ? t('mapUnavailable')
                : map.kind === 'failed'
                  ? t('mapFailed')
                  : t('mapNoTrustedPoint', { address: shown.record.address })
            }
            className="h-full bg-mist"
          />
        )}
      </div>

      {isLg && detailOpen && (
        <aside
          aria-label={t('detailTitle', { rank })}
          className="absolute inset-y-3 right-3 z-20 flex w-[400px] min-h-0 xl:static xl:inset-auto xl:z-auto xl:w-auto"
        >
          <Card className="min-h-0 flex-1 gap-0 py-0 shadow-lg xl:rounded-none xl:border-l xl:shadow-none xl:ring-0">
            {detail}
          </Card>
        </aside>
      )}

      {!isLg && (
        <Sheet
          open={detailOpen}
          onOpenChange={(open) => {
            if (!open) onCloseDetail();
          }}
        >
          <SheetContent
            side="bottom"
            showCloseButton={false}
            className="flex max-h-[85svh] flex-col gap-0 p-0"
          >
            <SheetTitle className="sr-only">
              {t('detailTitle', { rank })}
            </SheetTitle>
            {detail}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm type-check && pnpm lint && pnpm check`
Expected: all exit 0 (not mounted yet; Task 7 mounts it). If `Alert` does not forward `role` (it spreads `...props` after its own `role="alert"`, so the override works), keep `role="status"`: a notice that appears with the results must not interrupt the screen reader as `alert` would.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/use-media-query.ts "src/app/(app)/dashboard/components/listing/results-workspace.tsx"
git commit -m "feat(listing): three-panel results workspace

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Wire the workspace into the form

**Files:**
- Modify: `src/app/(app)/dashboard/components/listing/listing-url-form.tsx`
- Modify: `src/app/(app)/dashboard/components/listing/address-candidate-list.tsx` (make `onSelect` required)
- Delete: `src/app/(app)/dashboard/components/listing/address-results-map.tsx`
- Modify: `src/i18n/messages/en.json`, `fr.json` (remove `resultHeading`, `addressInspected`, `addressTruncated`)

**Interfaces:**
- Consumes: `ResultsWorkspace`, `mapAvailability`, `DetailPreference` (Task 6); `candidateOnMap` from `src/core/ademe/candidate-on-map.ts`.
- Produces: `ListingUrlForm({ mapboxAccessToken, streetViewEnabled })` — unchanged public signature (the page `src/app/(app)/dashboard/page.tsx` needs no edit).

- [ ] **Step 1: Replace the imports and helpers**

In `listing-url-form.tsx`:

1. Replace the import block's lines

```tsx
import { ArrowRight, MapPin, MapPinOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useRef, useState } from 'react';
```

with

```tsx
import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useRef, useState } from 'react';
```

2. Delete the imports of `Card`, `CardContent`, `mapOverview`, `GeoPoint`, `EXTRACTED_FIELD_NAMES`, `AddressCandidateList` and the whole `./address-results-map` import. Change `import type { AddressCandidate, AddressMatch } from '@/core/ademe/types';` to `import type { AddressMatch } from '@/core/ademe/types';` (the `firstAddress` helper that used `AddressCandidate` is removed in Step 2). Change `import { candidateOnMap, mapOverview } from '@/core/ademe/candidate-on-map';` to `import { candidateOnMap } from '@/core/ademe/candidate-on-map';` and `import { EXTRACTED_FIELD_NAMES, type ExtractedListing } from '@/core/listing/types';` to `import type { ExtractedListing } from '@/core/listing/types';`. Add:

```tsx
import {
  type DetailPreference,
  mapAvailability,
  ResultsWorkspace,
} from './results-workspace';
```

3. Delete `NAME_WIDTH`, `VALUE_WIDTH`, `formatExtraction`, the `MappedResult` type and `mappedResult` (with its `// why` comment). Put in their place:

```tsx
type FoundResult = { listing: ExtractedListing; match: AddressMatch };

function foundResult(status: Status): FoundResult | null {
  if (status.kind !== 'extracted' || status.match.kind !== 'found') {
    return null;
  }
  const { match } = status.match;
  if (match.refusedFor !== null || match.candidates.length === 0) return null;
  return { listing: status.listing, match };
}
```

4. Replace `const COLUMN_LAYOUT_CLASS = ...;` with:

```tsx
const COLUMN_LAYOUT_CLASS =
  'flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 py-8';
const WORKSPACE_LAYOUT_CLASS = 'relative flex min-h-0 flex-1 flex-col';
```

- [ ] **Step 2: Replace the component body**

Replace everything from `export function ListingUrlForm({` to the end of the file with:

```tsx
export function ListingUrlForm({
  mapboxAccessToken,
  streetViewEnabled,
}: {
  mapboxAccessToken: string;
  streetViewEnabled: boolean;
}) {
  const t = useTranslations('Listing');
  const [url, setUrl] = useState('');
  const [rejection, setRejection] = useState<ListingUrlRejection | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [selection, setSelection] = useState<Selection>(INITIAL_SELECTION);
  const [detailPreference, setDetailPreference] =
    useState<DetailPreference>('default');
  const [mapFailed, setMapFailed] = useState(false);
  const [searchFocusRequest, setSearchFocusRequest] = useState(0);
  const latestSubmission = useRef(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (searchFocusRequest > 0) inputRef.current?.focus();
  }, [searchFocusRequest]);

  function resetResult(): void {
    setSelection(INITIAL_SELECTION);
    setDetailPreference('default');
    setMapFailed(false);
  }

  function startNewSearch(): void {
    latestSubmission.current += 1;
    resetResult();
    setUrl('');
    setRejection(null);
    setStatus({ kind: 'idle' });
    setSearchFocusRequest((current) => current + 1);
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (status.kind === 'pending') return;

    const validated = validateListingUrl(url);
    if (!validated.ok) {
      setRejection(validated.reason);
      return;
    }

    // why: a search still in flight can answer after a newer one. Its response
    // must never replace the result of the listing on screen.
    latestSubmission.current += 1;
    const submission = latestSubmission.current;
    setRejection(null);
    resetResult();
    setStatus({ kind: 'pending' });

    const outcome = await requestExtraction(validated.canonicalUrl);
    if (submission !== latestSubmission.current) return;
    if (!outcome.ok) {
      setStatus({ kind: 'failed', failure: outcome.failure });
      return;
    }

    setStatus({
      kind: 'extracted',
      listing: outcome.listing,
      match: { kind: 'pending' },
    });

    const matched = await requestMatch(outcome.listing);
    if (submission !== latestSubmission.current) return;
    setStatus({
      kind: 'extracted',
      listing: outcome.listing,
      match: matched.ok
        ? { kind: 'found', match: matched.match }
        : { kind: 'failed', failure: matched.failure },
    });
  }

  const isError = rejection !== null || status.kind === 'failed';
  const message =
    rejection !== null
      ? t(REJECTION_KEY[rejection])
      : status.kind === 'failed'
        ? t(FAILURE_KEY[status.failure])
        : status.kind === 'pending'
          ? t('analyzing')
          : null;

  const found = foundResult(status);
  const shown =
    found === null
      ? null
      : candidateOnMap(found.match.candidates, selection.dpeNumber);

  // why: the live region is the last child of the same root element in both
  // layouts, so it never unmounts and the result is announced when it lands.
  return (
    <div
      className={
        found !== null && shown !== null
          ? WORKSPACE_LAYOUT_CLASS
          : COLUMN_LAYOUT_CLASS
      }
    >
      {found !== null && shown !== null ? (
        <ResultsWorkspace
          listing={found.listing}
          match={found.match}
          shown={shown}
          focusRequest={selection.request}
          detailPreference={detailPreference}
          map={mapAvailability({
            candidates: found.match.candidates,
            mapboxAccessToken,
            mapFailed,
          })}
          accessToken={mapboxAccessToken}
          streetViewEnabled={streetViewEnabled}
          onSelect={(dpeNumber) => {
            setSelection((current) => ({
              dpeNumber,
              request: current.request + 1,
            }));
            setDetailPreference('open');
          }}
          onCloseDetail={() => {
            setDetailPreference('closed');
          }}
          onMapFailure={() => {
            setMapFailed(true);
          }}
          onNewSearch={startNewSearch}
        />
      ) : (
        <div className="w-full max-w-xl">
          <h1 className="text-center text-[22px] font-semibold leading-[1.3] tracking-[-0.18px] text-ink">
            {t('heading')}
          </h1>
          <div className="mt-6">
            <form
              onSubmit={(event) => {
                void handleSubmit(event);
              }}
              className="flex items-start gap-2"
            >
              <div className="flex-1">
                <Input
                  ref={inputRef}
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  value={url}
                  onChange={(event) => {
                    setUrl(event.target.value);
                    setRejection(null);
                    setStatus((current) =>
                      current.kind === 'failed' ? { kind: 'idle' } : current,
                    );
                  }}
                  placeholder={t('placeholder')}
                  aria-label={t('heading')}
                  aria-invalid={isError}
                  aria-describedby={
                    message === null ? undefined : 'listing-url-status'
                  }
                  className="h-9"
                />
              </div>
              <Button
                type="submit"
                size="sm"
                loading={status.kind === 'pending'}
                className="h-9 shrink-0"
              >
                {t('submit')}
                <ArrowRight className="size-3.5" />
              </Button>
            </form>
            {message !== null && (
              <p
                id="listing-url-status"
                aria-live="polite"
                className={
                  isError
                    ? 'mt-2 text-[13px] tracking-[-0.08px] text-destructive'
                    : 'mt-2 text-[13px] tracking-[-0.08px] text-slate-neutral'
                }
              >
                {message}
              </p>
            )}
          </div>
          {status.kind === 'extracted' && <AddressSection state={status.match} />}
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {found !== null
          ? t('addressFoundAnnouncement', {
              count: found.match.candidates.length,
              address: found.match.candidates[0]?.record.address ?? '',
            })
          : ''}
      </p>
    </div>
  );
}

function AddressSection({ state }: { state: MatchState }) {
  const t = useTranslations('Listing');

  return (
    <section aria-live="polite" className="mt-6">
      <h2 className="text-[13px] font-medium tracking-[-0.08px] text-slate-neutral">
        {t('addressHeading')}
      </h2>
      {state.kind === 'pending' && (
        <p className="mt-2 text-[13px] tracking-[-0.08px] text-slate-neutral">
          {t('addressSearching')}
        </p>
      )}
      {state.kind === 'failed' && (
        <p className="mt-2 text-[13px] tracking-[-0.08px] text-destructive">
          {t(MATCH_FAILURE_KEY[state.failure])}
        </p>
      )}
      {state.kind === 'found' && (
        <p className="mt-2 text-[13px] tracking-[-0.08px] text-slate-neutral">
          {state.match.refusedFor === 'insufficient-evidence'
            ? t('addressInsufficientEvidence')
            : t('addressNone')}
        </p>
      )}
    </section>
  );
}
```

Note: the workspace and the column are different elements in the same child slot, so switching layouts remounts them; the live region stays mounted because it is the root's last child in both.

- [ ] **Step 3: Make card selection required and delete the old view**

In `address-candidate-list.tsx`:
- change `onSelect?: (dpeNumber: string) => void;` to `onSelect: (dpeNumber: string) => void;`
- delete `const selectable = onSelect !== undefined;`, change `if (isShown && !wasShown.current && selectable)` to `if (isShown && !wasShown.current)`, and the effect's dependency list to `[isShown]`
- replace the `{onSelect === undefined ? ( body ) : ( <button …>{body}</button> )}` expression with just the `<button …>{body}</button>` element.

Then:

```bash
git rm "src/app/(app)/dashboard/components/listing/address-results-map.tsx"
```

Remove the now-unused keys `resultHeading`, `addressInspected` and `addressTruncated` from both `en.json` and `fr.json`, then re-run the mirror check from Task 3 Step 1 (expected `mirror ok`).

- [ ] **Step 4: Run the full gate**

Run: `pnpm validate`
Expected: exit 0; `Domain boundaries OK.`; all test files pass. `grep -rn "formatExtraction\|resultHeading\|address-results-map" src` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add -A "src/app/(app)/dashboard/components/listing" src/i18n/messages
git commit -m "feat(listing): results open in the three-panel workspace

New search returns to the landing input with focus in it. The extraction
dump is gone from every screen.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Browser verification and docs

**Files:**
- Create (temporary, not committed): `.claude/launch.json`
- Modify: `CLAUDE.md` (the "results view" line under "Measured facts — ADEME coordinates")

- [ ] **Step 1: Start the dev server**

Create `.claude/launch.json` (the preview tool needs it; Node 25 must be on the PATH of Turbopack's PostCSS workers):

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "web",
      "runtimeExecutable": "/usr/bin/env",
      "runtimeArgs": ["PATH=/Users/ismaelmehdid/.nvm/versions/node/v25.2.1/bin:/usr/bin:/bin:/usr/sbin:/sbin", "node", "node_modules/next/dist/bin/next", "dev", "-p", "3107"],
      "port": 3107
    }
  ]
}
```

Copy `.env` from the main checkout if the worktree has none (`cp ../../../.env .env`; it is gitignored). Start with the preview tool (`preview_start` name `web`), open `http://localhost:3107/dashboard`.

- [ ] **Step 2: Mock the two API calls**

Run in the page (browser `javascript_tool`) before submitting. It fakes `/api/listings/extract` and `/api/listings/match` with three candidates: #1 with a point and a diverged signal (triggers the notice), #2 without a point, #3 with a point.

```js
const names=['listingId','transactionType','propertyType','surfaceM2','landSurfaceM2','rooms','bedrooms','floor','buildingFloors','yearBuilt','dpeClass','gesClass','dpeKwhM2Year','gesKgCo2M2Year','heatingEnergy','annualEnergyCostMinEur','annualEnergyCostMaxEur','dpeDate','city','postalCode','inseeCode','streetAddress','priceEur','publishedAt'];
const values={listingId:'1',transactionType:null,propertyType:'house',surfaceM2:143,landSurfaceM2:null,rooms:null,bedrooms:null,floor:null,buildingFloors:null,yearBuilt:1895,dpeClass:'D',gesClass:'D',dpeKwhM2Year:201,gesKgCo2M2Year:41,heatingEnergy:'gas',annualEnergyCostMinEur:null,annualEnergyCostMaxEur:null,dpeDate:null,city:'Lyon',postalCode:'69003',inseeCode:'69383',streetAddress:null,priceEur:289000,publishedAt:null};
const fields={...values,portal:'leboncoin',canonicalUrl:'https://www.leboncoin.fr/ad/ventes_immobilieres/3271621783'};
const sources=Object.fromEntries(names.map(n=>[n,values[n]===null?'absent':'hydration']));
function rec(i,address,num,street,point,extra={}){return {dpeNumber:'x'+i,dataset:'existing',banId:null,address,streetNumber:num,street,postalCode:'69003',city:'Lyon',inseeCode:'69383',propertyType:'house',surfaceM2:114,dpeClass:'D',gesClass:'D',dpeKwhM2Year:200,gesKgCo2M2Year:40,heatingEnergy:'gas',yearBuilt:1930,buildingFloors:2,landSurfaceM2:null,floor:0,buildingComplement:null,establishedOn:'2023-04-12',visitedOn:null,annualEnergyCostEur:null,geocodingScore:0.9,point,...extra};}
const match={candidates:[
 {record:rec(1,'16 Rue Lavoisier 69003 Lyon','16','Rue Lavoisier',{latitude:45.755599,longitude:4.858685}),confidence:0.84,matched:['surfaceM2','heatingEnergy','dpeDate'],diverged:['yearBuilt'],supportingRecords:3},
 {record:rec(2,'42 Rue Paul Bert 69003 Lyon','42','Rue Paul Bert',null),confidence:0.81,matched:['surfaceM2'],diverged:[],supportingRecords:1},
 {record:rec(3,'7 Cours Gambetta 69003 Lyon','7','Cours Gambetta',{latitude:45.7535,longitude:4.8497},{floor:3}),confidence:0.6,matched:['surfaceM2'],diverged:[],supportingRecords:2}],
 inspected:141,truncated:false,refusedFor:null};
const realFetch=window.fetch;
window.fetch=async(input,init)=>{const u=typeof input==='string'?input:input.url;
 if(u.includes('/api/listings/extract'))return new Response(JSON.stringify({fields,sources}),{status:200,headers:{'content-type':'application/json'}});
 if(u.includes('/api/listings/match'))return new Response(JSON.stringify(match),{status:200,headers:{'content-type':'application/json'}});
 return realFetch(input,init);};
'mocked';
```

Type `https://www.leboncoin.fr/ad/ventes_immobilieres/3271621783` into the input and press Enter.

- [ ] **Step 3: Check 1440 × 900 (three columns)**

Set the viewport to 1440 × 900 and check:
- left column: "Nouvelle recherche", "Annonce analysée" titled `Maison 143 m²` (rooms is `null`: no "null pièces"), facts `Maison · 143 m² · Construit en 1895 · Lyon (69003)`, link text `leboncoin.fr/ad/ventes_immobilieres/3271621783`;
- "Correspondance à vérifier" notice present (collapsed; opening it shows the generic sentence only);
- cards show no "Concorde sur", "Diverge sur", "DPE à cette adresse", "lignes DPE évaluées", "Champs extraits" text (`document.body.innerText` contains none of them);
- detail panel "Résultat 1" open on the right: score `84/100`, `16 Rue Lavoisier` / `69003 Lyon`, DPE D and GES D badges, tiles Type, Surface ✓, Année de construction (no ✓), Chauffage ✓, Date du DPE ✓, **no Étage tile** (floor 0), four links whose `href`s match Task 1's formats for 45.755599, 4.858685 and 69383;
- keyboard focus is on the "Emplacements probables" heading (`document.activeElement.id === 'results-heading'`).

- [ ] **Step 4: Check selection, close and copy**

- Click card #3: map flies, chip reads "Sur la carte : 7 Cours Gambetta…", detail shows "Résultat 3" with an Étage tile `3e étage`.
- Detail pager next is disabled but still focusable (`aria-disabled="true"`, no `disabled` attribute).
- Close the detail panel: the map widens (grid has two columns). Click card #1: panel reopens.
- Click the copy button: a toast "Adresse copiée" appears.

- [ ] **Step 5: Check the unpinned result**

Click card #2 (no point): no pin, map at commune zoom, chip shows the no-reliable-coordinate notice naming `42 Rue Paul Bert`, detail panel has no photo and **no "Vérifier ailleurs" section**.

- [ ] **Step 6: Check 1100 × 800 and 390 × 844**

- 1100 × 800: two columns; the detail panel floats over the right of the map; the pin sits centred in the uncovered part.
- 390 × 844: map on top, list below; tapping a card opens the bottom sheet with the detail; its close button closes the sheet.
- Click "Nouvelle recherche": back to the landing input, empty, focused.

- [ ] **Step 7: Click the Géorisques link once for real**

Open the Géorisques link from the detail panel in a normal browser tab. It must open the risk report for the address, not an error page. (The site was unreachable from the dev machine when the format was researched; this is the only live confirmation.) If it errors, stop and report instead of merging.

- [ ] **Step 8: Update CLAUDE.md**

In `CLAUDE.md`, replace the line starting with `- **The results view is a fullscreen map**` with:

```markdown
- **The results view is a three-panel workspace** (listing and candidates on the left, map, selected result's detail on the right; the detail floats over the map between `lg` and `xl` and becomes a bottom sheet below `lg`). It never shows how a candidate was scored. When no map can be drawn (no token, no trusted point, map failure) the map region shows a notice and the rest works.
```

- [ ] **Step 9: Clean up and commit**

Stop the dev server, delete `.claude/launch.json`, reset the viewport. Then:

```bash
git add CLAUDE.md
git commit -m "docs: describe the three-panel results view

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Run: `pnpm validate`
Expected: exit 0.
