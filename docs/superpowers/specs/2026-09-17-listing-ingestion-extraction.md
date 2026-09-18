# Spec — Ingestion & extraction d'annonces immobilières

**Statut :** validé pour implémentation
**Périmètre :** ingestion + extraction uniquement. Le matching ADEME fait l'objet d'une spec séparée.

---

## 1. Problème

Pour retrouver l'adresse d'un bien à partir d'une annonce, on doit d'abord transformer une URL d'annonce en un enregistrement structuré et fiable. Les champs extraits ici sont l'entrée du futur moteur de matching (record linkage contre la base DPE de l'ADEME).

**Livrable de cette spec :** `URL d'annonce → ListingFields validé, avec provenance par champ`.

**Hors périmètre :** base ADEME, génération de candidats, scoring, désambiguïsation, UI, extension navigateur.

---

## 2. Contrainte dominante : l'erreur silencieuse

Le mode d'échec qui compte n'est pas l'hallucination classique (inventer une valeur absente), devenue marginale sur une tâche extractive. C'est **la sélection** : choisir une valeur plausible mais fausse, qui existe réellement dans la page.

Preuve mesurée sur `pap.fr` (annonce `r465201632`) :

- Le markdown contient `- Rue des Boulets | - Avron | - Nation` — ce sont des **stations de métro**.
- La vraie rue est `Rue Guénot`, et elle n'apparaît que dans le JSON-LD.

Un modèle à qui l'on demande la rue depuis le markdown a toutes les chances de répondre « Rue des Boulets ». Valeur plausible, présente dans la page, fausse.

**Conséquence produit :** une adresse fausse coûte beaucoup plus cher qu'une absence de réponse. Le matching en aval produirait un résultat *confiant* et faux. Toute la crédibilité du produit tient là-dessus.

**Règle de conception qui en découle :** *le LLM localise, le code déterministe parse.* Le modèle ne produit jamais une valeur — il produit la **citation exacte** de la page où il l'a lue. Le code vérifie que la citation existe littéralement dans la source, puis en extrait la valeur avec un parser déterministe unique pour tous les portails. L'hallucination sur la valeur devient structurellement impossible.

---

## 3. Recherche préalable — ce qui est mesuré

Vérifié le 2026-09-17, **une annonce réelle par portail** via l'API Firecrawl. Signal fort, pas un recensement.

### 3.1 Disponibilité des données structurées

| Portail | Source | DPE | Surface | Pièces | Étage | Année | Commune |
|---|---|---|---|---|---|---|---|
| `leboncoin.fr` | `__NEXT_DATA__` | ✅ `energy_rate` | ✅ `square` | ✅ `rooms` | ✅ `floor_number` | ✅ `building_year` | ✅ + lat/lng |
| `immobilier.lefigaro.fr` | `__NUXT__` | ✅ `dpe` | ✅ `area` | ✅ `roomCount` | — | — | ✅ + `inseeCode` |
| `proprietes.lefigaro.fr` | `__NUXT__` | ✅ `dpe` | ✅ `area` | ✅ `roomCount` | — | ✅ `anneeConstruction` | ✅ + `inseeCode` |
| `iadfrance.fr` | JSON-LD `Apartment` | ⚠️ à confirmer | ✅ `floorSize` | ✅ `numberOfRooms` | — | ✅ `yearBuilt` | ✅ |
| `seloger.com` | JSON-LD `RealEstateListing` | ❌ | ✅ `floorSize` | ✅ `numberOfRooms` | ❌ | ❌ | partiel (dans `name`) |
| `pap.fr` | JSON-LD `Product` | ❌ | ✅ `additionalProperty` | ✅ | ❌ | ❌ | ✅ + **`streetAddress`** |
| `century21.fr` | aucune | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `orpi.com` | aucune | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `logic-immo.com` | aucune (shell JS) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `bellesdemeures.com` | quasi aucune | ❌ | ❌ | ❌ | ❌ | ❌ | partiel |

**Lecture :** le JSON-LD seul est faible (3/10 exploitables, et **jamais le DPE**). Les payloads d'hydratation sont le vrai gisement. `leboncoin` — de loin le premier portail français en volume — expose l'enregistrement complet, DPE compris.

### 3.2 Accès

- **Firecrawl passe DataDome sur leboncoin**, en mode `basic` comme en `stealth`. Vérifié : titre `<head>` = `Duplex 4 pièces 102 m² - Ventes immobilières`, contenu complet.
- `logic-immo.com` renvoie un shell JS (titre = l'identifiant brut) même avec `waitFor: 8000`. Traité comme portail sans structuré.

### 3.3 Fragilité du DPE dans le markdown

Mesuré sur 4 pages :

| Portail | DPE dans le markdown |
|---|---|
| `seloger` | ✅ propre — `### Diagnostic de performance énergétique (DPE) | C` |
| `century21` | ⚠️ le widget est aplati sans la lettre ; sauvé uniquement par `DPE C · GES C` écrit en texte libre par l'agent |
| `orpi` | ⚠️ la lettre n'existe que dans l'`alt` d'une image : `![Consommation énergétique C](…/dpe/3.svg)` |
| `pap` | ❌ **absent** — seulement « Bonne isolation (DPE conforme) », de la prose commerciale |

**Conséquence :** le DPE est le champ le plus discriminant pour le matching ADEME, et c'est le plus fragile à extraire. Il doit être marqué absent plutôt que deviné.

---

## 4. Décisions

| Décision | Choix | Raison |
|---|---|---|
| Ingestion | **Scraping serveur via Firecrawl** | Décidé par l'utilisateur ; l'extension navigateur est écartée. DataDome ne bloque pas. |
| Formats demandés | **`["markdown", "rawHtml"]` dans le même appel** | Même fetch, même coût. Le sniff structuré tourne sur `rawHtml`, le markdown va au modèle. |
| Extraction primaire | **Structuré** — JSON-LD + `__NEXT_DATA__` / `__NUXT__` | Exact, déterministe, cachable, gratuit. Couvre les plus gros volumes. |
| Extraction secondaire | **LLM sur markdown, avec citations obligatoires** | Couvre `century21`, `orpi`, `logic-immo` et toute la longue traîne. Pas de parser par portail. |
| Fournisseur LLM | **Groq**, modèle `openai/gpt-oss-120b` | Inférence très rapide, coût faible. Le modèle reste un modèle OpenAI ; seul l'hébergeur d'inférence change. |
| Client LLM | **`@ai-sdk/openai` avec `baseURL` Groq** | API compatible OpenAI → **aucune nouvelle dépendance npm**, et le repli vers OpenAI est un changement de config. |
| Client Firecrawl | **`fetch` sur leur API REST** | Aucune nouvelle dépendance npm ; même style que `url-fetcher-adapter`. |
| Mapping par portail | **Dictionnaire clé → champ** | ~15 lignes par portail. Ce n'est pas un parser DOM : c'est le contrat interne back/front du portail, qui ne casse pas à la refonte graphique. |

### 4.1 Écarts assumés par rapport à `CLAUDE.md`

Deux règles du repo sont touchées. Elles sont levées explicitement par l'utilisateur, pas contournées.

1. **« OpenAI-only »** — respectée sur le fond : `gpt-oss-120b` est un modèle open-weight d'OpenAI. Seul l'hébergeur d'inférence (Groq) est nouveau. Le picklist de modèles reste épinglé, dans `src/core/listing/types.ts`.
2. **« Pas de nouveau SaaS »** — deux fournisseurs ajoutés, **Firecrawl** et **Groq**. Soulevés et validés explicitement. Aucun paquet npm ajouté.

---

## 5. Contrat de sortie

```ts
type EnergyClass = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
type FieldSource = 'json-ld' | 'hydration' | 'llm' | 'absent';

type ListingFields = {
  portal: PortalId;
  listingId: string | null;
  canonicalUrl: string;
  transactionType: 'sale' | 'rent' | null;
  propertyType: 'apartment' | 'house' | null;
  surfaceM2: number | null;
  rooms: number | null;
  bedrooms: number | null;
  floor: number | null;
  buildingFloors: number | null;
  yearBuilt: number | null;
  dpeClass: EnergyClass | null;
  gesClass: EnergyClass | null;
  city: string | null;
  postalCode: string | null;
  inseeCode: string | null;
  streetAddress: string | null;
  priceEur: number | null;
  publishedAt: string | null;
};

type ExtractedListing = {
  fields: ListingFields;
  sources: Record<keyof ListingFields, FieldSource>;
};
```

`sources` est obligatoire, pas optionnel. Il permet de mesurer quelle couche produit quoi, et de voir la couche structurée se dégrader **avant** qu'elle ne casse.

---

## 6. Règles de validité

Tout champ hors bornes est ramené à `null` avec `source: 'absent'`. Jamais deviné, jamais corrigé.

| Champ | Borne |
|---|---|
| `surfaceM2` | `5 ≤ x ≤ 2000` |
| `rooms` | `1 ≤ x ≤ 20` |
| `bedrooms` | `0 ≤ x ≤ 15` |
| `floor` | `-2 ≤ x ≤ 60` |
| `buildingFloors` | `0 ≤ x ≤ 60` |
| `yearBuilt` | `1700 ≤ x ≤ année courante + 2` |
| `dpeClass`, `gesClass` | `A`–`G` |
| `postalCode` | `^\d{5}$` |
| `inseeCode` | `^[0-9AB]\d{4}$` |
| `priceEur` | `1000 ≤ x ≤ 100_000_000` |

**Conventions de parsing français, appliquées par le code, jamais par le modèle :**

- virgule décimale : `68,5` → `68.5`
- séparateurs de milliers : espace, espace insécable, espace fine insécable, point
- unités : `m²`, `m2`, `M²`
- la surface retenue est la **surface habitable / Carrez**. `terrain`, `séjour`, `balcon`, `terrasse`, `jardin`, `cave`, `garage` sont exclus explicitement.

---

## 7. Précédence des sources

Pour chaque champ, dans l'ordre, premier gagnant :

1. `hydration` — le plus riche et le plus typé
2. `json-ld` — standard, non ambigu sur le sujet de la page
3. `llm` — seulement si les deux précédents laissent le champ vide
4. `absent`

Le LLM n'est **jamais** appelé si tous les champs requis sont déjà remplis par le structuré. C'est ce qui garde le coût marginal à zéro sur les gros portails.

**Champs requis** (déclenchent l'appel LLM s'ils manquent) : `surfaceM2`, `rooms`, `dpeClass`, `city`, `propertyType`.

---

## 8. Contrat du LLM

Le modèle reçoit le markdown et rend, **par champ**, une citation — jamais une valeur :

```json
{
  "surfaceM2":   { "quote": "Surface habitable : 68,5 m²" },
  "dpeClass":    { "quote": "DPE : D" },
  "rooms":       { "quote": "4 pièces" },
  "city":        { "quote": "Hardricourt (78250)" },
  "propertyType":{ "quote": "Appartement" }
}
```

Pipeline de vérification, pour chaque champ rendu :

1. `quote` doit exister **littéralement** dans le markdown source (après normalisation des espaces). Sinon → rejeté.
2. La valeur est extraite de `quote` par le parser déterministe du champ. Échec de parsing → rejeté.
3. La valeur passe les bornes du §6. Hors bornes → rejeté.

Un champ rejeté vaut `null` / `'absent'`. **On ne retente pas**, on ne demande pas au modèle de se corriger.

Le modèle est appelé en `structured output` (schéma JSON), température `0`.

---

## 9. Codes d'échec exposés

Repris de la taxonomie observée chez précisément.fr, qui couvre les cas réels :

| Code | Sens | `AppError` |
|---|---|---|
| `unsupported_portal` | domaine non reconnu | `validation` |
| `unreachable` | Firecrawl n'a pas joint la page | `external_api` |
| `blocked` | anti-bot / CAPTCHA détecté | `external_api` |
| `unreadable` | page jointe mais aucun champ requis extrait | `validation` |
| `unsupported_category` | ni vente ni location de logement | `validation` |

---

## 10. Sécurité & abus

- **SSRF** : l'URL entrante doit être `https`, et son domaine doit appartenir au registre des portails. On ne scrape jamais un domaine arbitraire. C'est une allowlist, pas une denylist — plus strict que `url-fetch`, et suffisant pour se passer du contrôle DNS.
- **Rate limit** : nouveau bucket `listing-extract`, appliqué par `requireAuthedRoute`.
- **Coût** : le markdown envoyé au modèle est tronqué à 40 000 caractères.
- **Contenu non fiable** : le markdown est du contenu tiers. Il est passé au modèle comme **données**, jamais comme instructions.

---

## 11. Ce que cette spec ne fait pas

- Aucune écriture en base. L'extraction est sans état ; le cache et la persistance viendront avec le matching, qui définira les clés.
- Aucun mapping `__NUXT__` pour lefigaro : seuls les **noms** de clés sont observés (`dpe`, `area`, `roomCount`, `inseeCode`), pas leur chemin dans le payload. Nécessite une étape d'inspection, documentée en suivi.
- Aucune récupération du DPE depuis le nom de fichier SVG d'orpi (`dpe/3.svg` → `C`). L'`alt` de l'image porte déjà la lettre et le LLM la lit. Optimisation possible, non retenue en v1.
