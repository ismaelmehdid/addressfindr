# Spec — Results view: three-panel layout

**Status:** design approved 2026-09-25, spec awaiting review
**Scope:** the dashboard results view shown once address candidates are found. Extraction, matching, the Street View proxy and map billing are unchanged.

---

## 1. Goal

Reshape the results view after precisement.fr's layout — list on the left, map in the centre, the selected result's detail on the right — while keeping our visual language (`DESIGN.md`: warm off-whites, one charcoal accent, shadcn primitives from `src/components/ui`).

Success: a user can read what was analysed, scan the ranked candidates, open one result's full detail, and jump to independent public sources to check it, without the map ever showing an address other than the one named on screen.

## 2. Decisions taken with the user

| Question | Decision |
|---|---|
| Scope of this PR | Three-panel layout + detail panel, and verify-elsewhere links. |
| Out of scope | Map controls (satellite, cadastre overlay, zoom buttons, scale bar, score legend) and the "C'est ce logement" confirmation. |
| Map pins | **One pin**, as today. The map speaks for the selected result only (CLAUDE.md, `core/ademe/candidate-on-map.ts`). No numbered pin per candidate. |
| Detail photo | The existing static Street View photo, same URL as the card. No interactive embed, no browser-exposed key. |
| Commune page | INSEE "Dossier complet" (official) instead of precisement's commercial Villedereve. |
| Match reasoning | **Not shown.** No "agrees on / differs on" lines, no supporting-record count, no inspected-rows footnote. The "Champs extraits" dump is removed from every screen, not only the results view. The user wants the address and the details of the screenshot, nothing about how it was scored. |

## 3. Layout

The results view replaces today's fullscreen map + right overlay (`address-results-map.tsx`) and today's list-only fallback. It is used whenever the match returns candidates; refused matches, empty matches and the extraction/matching progress states keep the centred column they have today.

| Width | Layout |
|---|---|
| `xl` and up (≥ 1280px) | CSS grid: left column 360px · map `1fr` · detail panel 420px. The detail panel opens on result #1. Closing it gives its width to the map; selecting any card reopens it. |
| `lg` to `xl` (1024–1279px) | Left column 360px · map. The detail panel floats over the right edge of the map (as today's overlay), with the same open/close behaviour. |
| below `lg` | Map on top (45 % of the height), left-column content below it. The detail panel opens as a bottom `Sheet` when a card is selected. |

Map rules kept as they are:

- One `new mapboxgl.Map()` per displayed result, moved by `flyTo`.
- Camera padding keeps the pin centred in the visible part of the map. The obstruction now depends on whether the detail panel overlays the map (`lg`–`xl`) or sits beside it (`xl`), matched on the same CSS breakpoints through `matchMedia`, never a px constant.
- The pinned address is named above the map in a small chip at the map's top-left ("Sur la carte : …" or the no-trusted-point notice). This chip replaces today's search overlay card.
- When no map can be drawn — no Mapbox token, no candidate with a trusted point, or a map failure — the map region stays in place and shows the matching notice (`mapUnavailable`, `mapNoTrustedPoint`, `mapFailed`) instead of the map. The left column and the detail panel work unchanged.

## 4. Left column

Scrollable (`ScrollArea`), top to bottom:

1. **New search** — full-width secondary `Button` with a search icon. Clears the result and returns to the landing search, input empty and focused.
2. **Analysed listing** — `Card`:
   - overline "Annonce analysée";
   - title built from the listing: `{type} {rooms} pièces {surface} m²` through an ICU message, each part dropped when absent (never a guessed value);
   - facts line: type · surface · built in {year} · {city} ({postalCode});
   - link to `canonicalUrl`, labelled with the portal's host, opening in a new tab.
3. **Likely locations** — heading plus the `1 / N` pager (moved from the old panel header).
4. **Match to verify** — a collapsible notice (`Alert` inside `Collapsible`), shown only when `needsVerification(match)` is true (§7). Title "Correspondance à vérifier"; its body is one generic sentence ("Comparez la photo et le plan avec les photos de l'annonce avant de vous fier à cette adresse."), never the scoring reasons.
5. **Candidate cards** — photo, rank, score /100 and bar, street line, facts line (city · type · surface · year). The per-card "Vérifier cette adresse" button and the "agrees on / differs on / N DPE records" lines are removed. A card click selects the result and opens the detail panel; the selected card keeps its ring. A result without a trusted point keeps its short "no reliable map position" line, since it explains the missing photo and pin.

The "N lignes DPE évaluées" footnote is removed from the results view. The "Champs extraits" dump is deleted from the UI entirely — results view, list-only fallback and the extraction/matching states — together with `formatExtraction` and its i18n key.

## 5. Detail panel

`Card` with its own scroll area, for the selected candidate:

- **Header:** "Résultat {n}", prev/next pager (shares the left column's selection state), close button (`Button` ghost icon). Pager buttons stay focusable when disabled (`focusableWhenDisabled`).
- **Photo:** the card's exact Street View URL (`streetViewImagePath(point)`) so the browser reuses the cached image and no second image is billed. Hidden when there is no trusted point, no key, or the image fails.
- **Score:** rank `Badge` + "{score}/100 score de correspondance".
- **Address:** street line as title, "{postalCode} {city}" below, copy `Button` that writes the full address to the clipboard and confirms with a `sonner` toast.
- **Energy labels:** DPE and GES letters as `Badge`s, each with a small dot in the official A–G colour. This is the one deliberate exception to the single-accent rule: the colour is the regulatory encoding of the letter, not decoration.
- **Fact tiles** (2-column grid of small `Card`s): type, surface, year built, heating, DPE date, floor.
  - A tile shows a ✓ when its signal is in `candidate.matched`, as in the screenshot; nothing otherwise. Diverged signals are never displayed.
  - The floor tile appears only for `floor >= 1`. ADEME stores `0` as a default on most rows (CLAUDE.md), so `0` never reads as "ground floor".
  - A tile whose value is `null` is not rendered.
- **Verify elsewhere:** four outbound links (§6), rendered as outline link tiles in a 2 × 2 grid, each opening in a new tab. Only shown when the result has a trusted point.

## 6. Outbound links

Pure URL builders in `src/core/geo/outbound-links.ts`, exported through the `geo` domain's public list. Inputs: the trusted point, the INSEE code, the formatted address. Each builder is unit-tested against the formats below.

Every coordinate is written with `toFixed(6)` (as `core/street-view/links.ts` does) and every query built with `URLSearchParams`. Links are built only from a trusted point; without one, no link is rendered and nothing falls back to the address text, since that would hand the location back to a third-party geocoder.

| Link | Format | Verified 2026-09-25 |
|---|---|---|
| Google Maps | `https://www.google.com/maps/search/?api=1&query={lat},{lon}` | Documented Maps URLs Search action, no key. Opened in a browser: pin exactly on the coordinate, no re-geocoding. Query by coordinate, never by address: an address query lets Google pick its own building. |
| Géorisques | `https://www.georisques.gouv.fr/mes-risques/connaitre-les-risques-pres-de-chez-moi/rapport2?typeForm=adresse&city={city}&codeInsee={inseeCode}&lon={lon}&lat={lat}&adresse={address}` | The permalink Géorisques' own API (`/api/v1/resultats_rapport_risque`) returns in its `url` field; indexed reports confirm the report is placed from `lon`/`lat`. **Not opened live**: the site was unreachable from the dev machine during the run. Must be clicked once in a real browser before merging. |
| DVF (sale prices) | `https://explore.data.gouv.fr/fr/immobilier?onglet=carte&filtre=tous&level=commune&code={inseeCode}&lat={lat}&lng={lon}&zoom=18` | Official Etalab app (the old `app.dvf.etalab.gouv.fr` points to it). Read from the app's router source and opened in a browser: centred at zoom 18 with the commune's figures. `lat`, `lng` (not `lon`) and `zoom` are all required or the map stays on France. Works with arrondissement codes and Corsica. |
| Commune (INSEE) | `https://www.insee.fr/fr/statistiques/2011101?geo=COM-{inseeCode}` | 200 with the right title for 69383 (Lyon 3e, its own figures), 33063, 2A004, 2B033, 75115, 13201. The code must be uppercase (`COM-2a004` returns 500) and `ARM-` is not a valid prefix. |

These parameters are the sites' own URL conventions, not documented APIs; the links are best-effort outbound `<a href>`s and a broken one never affects the result. The address is always shown in our UI next to them, because the Google coordinate link shows degrees, not a street name.

## 7. Match-to-verify rule

`needsVerification(match): boolean` in `src/core/ademe/needs-verification.ts`, pure and unit-tested. True when either:

- result #1 has at least one diverged signal, or
- result #2 scores within 10 points of #1 (`confidence` difference < 0.10).

The reasons stay internal: the notice shows one generic sentence (§4). The rule only adds caution; it never hides or reorders a candidate.

## 8. State

`ListingUrlForm` keeps the submission state machine, the stale-response guard and the stable React position of the search form. New state:

- `detailOpen: boolean` — true when a result is shown on `xl`, false on smaller screens until a card is selected; set true by any selection, false by the close button.

Selection stays `{ dpeNumber, request }` so re-picking the shown result recentres the map.

## 9. Components and files

All built from `src/components/ui` primitives (`Card`, `Badge`, `Button`, `Progress`, `ScrollArea`, `Collapsible`, `Alert`, `Sheet`, `Skeleton`, `Separator`). No hand-rolled equivalents.

| File | Role |
|---|---|
| `listing/results-workspace.tsx` | Grid layout, responsive placement of the three regions, camera padding. Replaces `address-results-map.tsx`. |
| `listing/analysed-listing-card.tsx` | The analysed-listing card. |
| `listing/result-detail-panel.tsx` | Detail panel body (shared by the side panel and the mobile `Sheet`). |
| `listing/address-candidate-list.tsx` | Cards lose the CTA and the match-reasoning lines. |
| `listing/listing-url-form.tsx` | Loses `formatExtraction` and every "Champs extraits" block. |
| `core/geo/outbound-links.ts` (+ test) | §6. |
| `core/ademe/needs-verification.ts` (+ test) | §7. |
| `core/listing/listing-summary.ts` (+ test) | Parts of the analysed-listing title (type, rooms, surface), nulls dropped. |
| `scripts/boundaries/manifest.mjs` | Add `core/geo/outbound-links` and `core/ademe/needs-verification` to their domains' public lists. |
| `i18n/messages/{en,fr}.json` | All new copy. |

## 10. Error handling

- No trusted point on the selected result: no pin, map rests on the commune (`mapOverview`), no photo, no outbound links, the chip names the address with the no-pin notice.
- Map failure (WebGL, chunk download): `MapErrorBoundary` catches it and the map region shows `mapFailed`; the left column and the detail panel keep working (§3).
- Clipboard write rejected: error toast, no crash.
- No Street View key or failed image: the photo block is omitted.

## 11. Testing

- Unit: `needsVerification` (each trigger and neither), the outbound-link builders (including a Corsican and an arrondissement INSEE code), the listing-summary parts.
- `pnpm validate` green.
- Browser check with mocked extract/match responses at 1440, 1100 and 390px: selection from card and both pagers, detail open/close, sheet on mobile, copy toast, links' hrefs, unpinned result, the verify notice, and no match-reasoning text anywhere in the results view.
