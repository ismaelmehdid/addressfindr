# Spec — Results view: precisement parity, no accounts, feedback loop

**Status:** decisions taken with the user 2026-09-26, spec awaiting review
**Builds on:** `2026-09-25-results-three-panel-layout-design.md` (merged locally on `main`, not yet on GitHub; this PR carries it).
**Reference:** precisement.fr results screen, audited live on 2026-09-26 (one search, leboncoin listing `3132785420`, Lyon 4e) plus its shipped JS for states not seen live. Their French copy is quoted verbatim where we adopt it.

---

## 1. Goal

Make the results view carry everything precisement's does for a candidate — list on the left, detail on click — keep our visual language (charcoal accent, shadcn primitives), drop accounts entirely from the UI, and collect the user's own verdict on the answer as ground truth.

## 2. Decisions

| Question | Decision |
|---|---|
| Accounts | Remove **every** account-related UI: sidebar, sign-in page, sign-out, settings page, profile edit, language switcher, paywall page. The tool is the home page. Better Auth, billing and the user tables stay in the codebase, dormant (the boilerplate's chat/files modules still use them). **No database change for auth.** |
| Feedback | Store it: "C'est ce logement" and "Aucun emplacement ne correspond" + a short reason form, in a new table through a new API route. No e-mail opt-in. |
| Map | Keep Mapbox. The Mapbox logo stays (Mapbox Product Terms §1.4.1 require it). Attribution moves bottom-right (§1.4.2 requires "Improve this map" there) and stays visible while the detail panel floats. The Next.js "N" dev bubble is hidden (`devIndicators: false`; it never ships to production anyway). |
| Pins | Still one pin — the selected result's (unchanged rule). |
| Map controls | Satellite, cadastre, points of interest, zoom buttons, scale, legend: still out of scope. |

## 3. App shell without accounts

- The dashboard layout renders a plain full-height `<main>` (`h-svh`, `min-h-0`, `overflow-hidden`) instead of `SidebarProvider`/`SidebarInset`. `DashboardHeaderBridgeProvider` and `TooltipProvider` stay.
- Deleted: `dashboard-sidebar.tsx`, `user-menu.tsx`, `edit-profile-dialog.tsx`, `language-switcher.tsx`, the `/dashboard/settings` route, the `(public)/sign-in` route, `public-language-switcher.tsx`, the `/paywall` route and its components, `src/components/ui/sidebar.tsx` and `src/hooks/use-mobile.ts` (only the sidebar used it), and every i18n key only they used.
- `/` still redirects to `/dashboard`. `proxy.ts` no longer protects `/dashboard/settings` (the route is gone); keep the file's matcher behaviour otherwise.
- The language is the default (`fr`); the `LOCALE` cookie still works if set, but nothing in the UI sets it.
- `CLAUDE.md` (UI rules: the "sidebar stays collapsed" line) and `DESIGN.md` (app shell) are updated to say there is no sidebar and no account UI.
- Backend untouched: `src/infra/auth/*`, `src/app/auth/[...all]`, billing adapters, user-scoped modules.

## 4. Left column (order, top to bottom)

1. **"Nouvelle recherche"** — full-width button, search icon (exists).
2. **"Annonce analysée"** card — the whole card is one link to the listing (new tab, `title="Ouvrir l'annonce d'origine : {displayUrl}"`), external-link icon top-right. Eyebrow "ANNONCE ANALYSÉE"; title = listing type + rooms + surface (exists, nulls dropped); recap line in precisement's order: `type · surface m² · floor · Construit en {year} · {city} ({postalCode})`, where the **listing's own** floor reads `Rez-de-chaussée` for 0 and `Étage {n}` otherwise (the listing's value is not ADEME's default-0 trap); then the display URL (host without `www.` + path, tracking parameters `utm_*`, `gclid`, `fbclid`, `msclkid`, `mc_*` stripped). No favicon (precisement fetches it from Google; we do not send the listing's domain to a third party).
3. **"Emplacements probables"** heading with a pager `‹ 1 / N ›` shown only while a detail is open and N > 1; it wraps around at the ends; aria labels "Parcourir les résultats", "Résultat précédent", "Résultat suivant".
4. **"Correspondance à vérifier"** notice (exists; rule unchanged) with precisement's body copy: « Nous n'avons pas pu confirmer le bien avec certitude. Comparez la surface, les classes énergie et l'année de construction avec l'annonce. »
5. Eyebrow "ADRESSE LA PLUS PROBABLE" + hint "Comparez la vue et le plan avec les photos de l'annonce.", the top card; eyebrow "SI CE N'EST PAS CELLE-LÀ" + "{n} autres emplacements, du plus au moins probable" (singular "{n} autre emplacement possible"), the other cards (exists).
6. **"Le bien n'est pas dans la liste ?"** box (§8).

## 5. Candidate card

- **Photo** 172 px high, full width: Street View when available (exists); otherwise an **IGN orthophoto** of ±40 m around the trusted point (Géoplateforme WMS `ORTHOIMAGERY.ORTHOPHOTOS`, free, keyless) with the chip "Satellite"; a result without a trusted point shows a placeholder (house icon), never a photo. The Street View chip reads "Street View".
- **Overlays on the photo:** rank badge top-left (circle, white number) and score pill top-right (`{score}/100`), both in the **score colour** (§7). Without a photo they sit in the card header.
- **Body:** street line (bold when selected); score bar in the score colour on a tinted track; meta line `{city} · {type} · {surface} m²` + ` · Étage {n}` only if the ADEME floor is ≥ 1 + ` · Terrain {x} m²` when known + ` · Construit en {year}` (`Construite en` for a maison).
- **Top card only:** full-width CTA "Vérifier cette adresse →" opening its detail.
- **States:** selected card has a ring in the score colour and a tinted background; while a card is selected, the other cards drop to 60 % opacity on `lg` and up. Clicking anywhere on a card, pressing Enter on it or its CTA opens its detail and flies the map (exists).

## 6. Detail panel

- **Header (44 px):** "Résultat {n}", the same wrap-around pager `‹ n / N ›`, close button (aria "Fermer le détail"). Keyboard: `Esc` closes, `←`/`→` previous/next candidate.
- **Photo area:** fixed 320 px, does not scroll with the content. Street View when available with chip "Street View" bottom-left and a chip "Explorer le panorama" bottom-right (rotate icon); clicking the photo opens the interactive panorama in a new tab (we keep the key server-side, so no embedded panorama). Otherwise the IGN orthophoto with chip "Satellite"; no trusted point → placeholder "Image indisponible".
- **Score line:** rank circle + `{score}` (score colour) `/100` + "score de correspondance"; sr text with the score label (§7).
- **Address:** h2 street line + `{postalCode} {city}` below; copy button copies `"{street line}, {postalCode} {city}"`, shows a check icon and "Adresse copiée" for 2 s (tooltip "Copier l'adresse"); a failed copy says so.
- **DPE / GES badges** with the letter in a square in precisement's official colours — DPE A `#00a06d` B `#52b153` C `#cbd934` D `#f4e70f` E `#f0b40f` F `#eb8235` G `#d7221f`; GES A `#f2e9fb` B `#e0c7f7` C `#cda6f2` D `#ba85ee` E `#a663e9` F `#9341e5` G `#7f1fe0`. Never check-marked.
- **Fact tiles** (2 columns), each only when non-null, ✓ "Conforme à l'annonce" only when the rule says so:
  | Tile | Value | ✓ when |
  |---|---|---|
  | Type de bien | Appartement / Maison | equal to the listing's type |
  | Surface | `{x} m²` | within 1 m² of the listing's |
  | Étage estimé | `1er étage` / `{n}e étage` — **only for ADEME floor ≥ 1** (floor 0 is ADEME's default, never "Rez-de-chaussée") | equal to the listing's floor |
  | Terrain cadastral | `{x} m²` | never |
  | Année de construction | year | equal to the listing's year |
  | Chauffage | energy | equal to the listing's |
  | Date du DPE | register date equal to the listing's DPE date, else the establishment date | shown date equals the listing's |
- **"Vérifier ailleurs"** (only with a trusted point, as today): Google Maps "Rue et alentours" (coordinates), Géorisques "Risques du terrain", DVF "Prix des ventes", **Villederêve "Vie de la commune"** replacing INSEE: `https://villedereve.fr/ville/{code}`, where municipal arrondissements map to their parent commune (69381–69389 → 69123, 75101–75120 → 75056, 13201–13216 → 13055) because villedereve has no arrondissement pages. Each tile: coloured icon square (precisement's hues: Google `#4f6d99`, Géorisques `#b06e4e`, DVF `#3a7480`, Villederêve `#74629b`), name, purpose, arrow.
- **"C'est ce logement"** button (§8).

## 7. Score colour

A data-encoding ramp, the same kind of exception as the DPE colours: linear interpolation clamped to 52–100 through 100 = `rgb(24,132,86)`, 86 = `rgb(90,175,96)`, 74 = `rgb(214,178,66)`, 64 = `rgb(221,141,74)`, 52 = `rgb(196,92,79)`. Tint = the colour mixed 86 % toward white. Labels: ≥ 90 "Correspondance très probable", ≥ 80 "Correspondance probable", ≥ 70 "Correspondance approximative", ≥ 60 "Correspondance incertaine", below "Correspondance peu fiable". Pure function in `core/ademe`, unit-tested.

## 8. Feedback loop

**Data.** New table `listing_feedback`, owned by the `listing` domain:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `search_id` | uuid, not null | generated in the browser once per displayed result |
| `listing_url` | text, not null | canonical URL |
| `verdict` | enum `confirmed` / `none_match` | |
| `confirmed_dpe_number` | text, null | required when `confirmed` |
| `reason` | enum `wrong_commune` / `wrong_dwellings` / `address_missing` / `unsure`, null | only for `none_match` |
| `comment` | text ≤ 1000, null | only for `none_match` |
| `candidates` | jsonb, not null | the shown candidates: `[{ dpeNumber, score }]`, for later tuning |
| `created_at` / `updated_at` | timestamptz | |

Unique on `search_id`: one verdict per displayed result. Writes are idempotent — re-sending the same verdict returns success; the reason/comment step updates the `none_match` row of that `search_id`. Migration generated with `pnpm drizzle:generate`, never hand-written.

**API.** `POST /api/listings/feedback` (open route, IP rate limit bucket `listing-feedback`), body validated with valibot: `{ searchId, listingUrl, verdict, confirmedDpeNumber?, candidates }`; `POST /api/listings/feedback/detail`: `{ searchId, reason?, comment? }`. Use cases in `application/listing/`, repository in `infra/data-access/listing-feedback/`, results as `Result<T, AppError>`, logs start/success/failure. No personal data is stored (no user id, no IP, no e-mail).

**UI.**
- Detail panel: a primary button in our accent style, "C'est ce logement" (check icon). On success it becomes "Logement confirmé, merci !" on that candidate, and every other confirm button plus the "Aucun emplacement ne correspond" button disappear (a verdict exists). On failure: "Le retour n'a pas pu être enregistré, réessayez plus tard." and the user can retry.
- Left column, last block: "Le bien n'est pas dans la liste ?" (search-x icon), body « L'annonce le décrit peut-être mal, ou il n'est pas encore référencé dans les données publiques. Le signaler affine le service, recherche après recherche. », outline button "Aucun emplacement ne correspond" (shown only while no verdict exists). After it: "Merci.", a form "Qu'est-ce qui n'allait pas ?" with radios "La commune n'est pas la bonne" / "Les logements proposés ne collent pas à l'annonce" / "Je connais la bonne adresse, elle n'était pas là" / "Je ne saurais pas dire", a textarea "Autre chose ? (facultatif)" (max 1000) with the note "N'y mettez ni nom ni coordonnées.", and "Envoyer" → "C'est noté, merci.". No "Pourquoi ça arrive →" link (we have no such page).
- The verdict state is per displayed result, in memory; a new search starts clean.

## 9. Map attribution

`AttributionControl` bottom-right, non-compact (Mapbox's own responsive collapse below 640 px is kept, which OSM allows). Between `lg` and `xl`, while the detail panel floats over the map, the bottom-right control stack shifts left by the panel's width + margin so the attribution stays visible. The Mapbox logo stays bottom-left.

## 10. Out of scope

Numbered pins for every candidate; satellite/cadastre/points-of-interest map controls, zoom buttons, scale and legend; the fold of low-score candidates; mobile tabs (Résultats / Carte / Fiche) — our bottom sheet stays; embedded Street View panorama; search history; the e-mail opt-in; any language switch.

## 11. Testing

- Unit: score colour + label, Villederêve link (arrondissement mapping, Corsica), IGN orthophoto URL, listing display URL tracking-param stripping, the new fact-agreement rules (type equal, surface within 1 m²), feedback DTO validation, feedback use cases against a fake repository (idempotency, detail only on `none_match`), repository mapping.
- `pnpm validate` green; migration generated.
- Browser check at 1440 / 1100 / 390 px with mocked extract/match responses and a mocked feedback route: no sidebar, no account UI anywhere; card overlays and colours; detail tiles and ✓; copy state; keyboard `Esc`/`←`/`→`; confirm flow and the "none match" form; attribution visible bottom-right with the panel floating.
