// why: certaines lignes ADEME sont stockees en double encodage — les octets
// UTF-8 d'un caractere ont ete relus en latin-1 puis re-encodes. Mesure du
// 2026-09-22 : "58 Rue de lâ€™Abondance" cote a cote avec
// "70 Rue de l'Abondance", meme rue. L'adresse est l'affirmation du produit,
// elle ne peut pas s'afficher abimee.
//
// La reparation n'est pas une supposition : elle n'est appliquee que si les
// octets se relisent exactement en UTF-8 valide. Sinon la chaine est rendue
// telle quelle.
const MOJIBAKE_MARKERS = /[ÂÃ][\u0080-¿]|â€[\u0098-\u009d™“”]/;

const LATIN1_MAX = 0xff;

export function repairMojibake(raw: string): string {
  if (!MOJIBAKE_MARKERS.test(raw)) return raw;

  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    const code = decodeCp1252(raw.charCodeAt(i));
    if (code === null || code > LATIN1_MAX) return raw;
    bytes[i] = code;
  }

  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return decoded.length > 0 ? decoded : raw;
  } catch {
    return raw;
  }
}

// why: le tour par latin-1 a traverse cp1252, ou 0x80-0x9f portent des
// caracteres imprimables. Sans cette table inverse, l'apostrophe typographique
// ne se reconstruit pas.
const CP1252_EXTRAS: Record<number, number> = {
  8364: 0x80,
  8218: 0x82,
  402: 0x83,
  8222: 0x84,
  8230: 0x85,
  8224: 0x86,
  8225: 0x87,
  710: 0x88,
  8240: 0x89,
  352: 0x8a,
  8249: 0x8b,
  338: 0x8c,
  381: 0x8e,
  8216: 0x91,
  8217: 0x92,
  8220: 0x93,
  8221: 0x94,
  8226: 0x95,
  8211: 0x96,
  8212: 0x97,
  732: 0x98,
  8482: 0x99,
  353: 0x9a,
  8250: 0x9b,
  339: 0x9c,
  382: 0x9e,
  376: 0x9f,
};

function decodeCp1252(charCode: number): number | null {
  if (charCode <= LATIN1_MAX) return charCode;
  return CP1252_EXTRAS[charCode] ?? null;
}
