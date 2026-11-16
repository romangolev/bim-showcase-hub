import { decodeBase64Url } from './urn.js';

export type ViewerRegion = 'US' | 'EU';

export interface UrnRegion {
  region: ViewerRegion;
  certain: boolean;
}

export function regionOf(urn: string): UrnRegion {
  const decoded = decodeBase64Url(urn)?.toLowerCase() ?? '';
  if (decoded.includes('emea')) return { region: 'EU', certain: true };
  if (decoded.includes('wipprod')) return { region: 'US', certain: true };
  return { region: 'US', certain: false };
}

export function detectRegion(urn: string): ViewerRegion {
  return regionOf(urn).region;
}
