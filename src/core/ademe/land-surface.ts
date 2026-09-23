export type ParcelKey = {
  inseeCode: string;
  section: string;
  number: string;
};

export type ParcelArea = {
  parcelId: string;
  areaM2: number | null;
};

// why: l'identifiant cadastral fait 14 caracteres — INSEE sur 5, prefixe de
// commune absorbee sur 3, section sur 2, numero sur 4 (ex. 69204000AD0022).
// L'API cadastre ne prend pas l'identifiant entier, il faut le decouper.
// why: la Corse ecrit sa commune 2A004 / 2B033, la lettre en DEUXIEME
// position. [0-9AB]\d{4} la rejette, exactement comme \d{5}.
const PARCEL_ID_PATTERN = /^(\d[AB]\d{3}|\d{5})(\d{3})([0-9A-Z]{2})(\d{4})$/;

export function parcelKeyOf(parcelId: string): ParcelKey | null {
  const match = PARCEL_ID_PATTERN.exec(parcelId.trim().toUpperCase());
  if (!match) return null;
  const [, inseeCode, , section, number] = match;
  if (!inseeCode || !section || !number) return null;
  return { inseeCode, section, number };
}

// why: un groupe de batiments peut couvrir plusieurs parcelles, et rien ne dit
// que le terrain annonce les couvre toutes. Additionner inventerait une
// surface que personne n'a mesuree, donc on ne rend une valeur que lorsque le
// batiment tient sur une parcelle et une seule.
export function totalLandSurface(
  parcels: readonly ParcelArea[],
): number | null {
  if (parcels.length !== 1) return null;
  return parcels[0]?.areaM2 ?? null;
}
