import type { PortalId } from './types';

const DOMAIN_TO_PORTAL: Readonly<Record<string, PortalId>> = {
  'leboncoin.fr': 'leboncoin',
  'seloger.com': 'seloger',
  'pap.fr': 'pap',
  'bienici.com': 'bienici',
  'century21.fr': 'century21',
  'orpi.com': 'orpi',
  'logic-immo.com': 'logic-immo',
  'immobilier.lefigaro.fr': 'lefigaro-immobilier',
  'proprietes.lefigaro.fr': 'lefigaro-proprietes',
  'iadfrance.fr': 'iadfrance',
  'bellesdemeures.com': 'bellesdemeures',
  'ouestfrance-immo.com': 'ouestfrance-immo',
  'paruvendu.fr': 'paruvendu',
  'green-acres.fr': 'green-acres',
  'immonot.com': 'immonot',
  'immobilier.notaires.fr': 'notaires',
};

export function resolvePortal(hostname: string): PortalId | null {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  for (const [domain, portal] of Object.entries(DOMAIN_TO_PORTAL)) {
    if (host === domain || host.endsWith(`.${domain}`)) return portal;
  }
  return null;
}

export function portalDomain(portal: PortalId): string | null {
  for (const [domain, candidate] of Object.entries(DOMAIN_TO_PORTAL)) {
    if (candidate === portal) return domain;
  }
  return null;
}
