export type ViewerRegion = 'US' | 'EU';

export interface UrnRegion {
  region: ViewerRegion;
  certain: boolean;
}

function decode(urn: string): string | null {
  try {
    const padded = urn.replace(/-/g, '+').replace(/_/g, '/');
    return atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  } catch {
    return null;
  }
}

export function regionOf(urn: string): UrnRegion {
  const decoded = decode(urn)?.toLowerCase() ?? '';
  if (decoded.includes('emea')) return { region: 'EU', certain: true };
  if (decoded.includes('wipprod')) return { region: 'US', certain: true };
  return { region: 'US', certain: false };
}

export function detectRegion(urn: string): ViewerRegion {
  return regionOf(urn).region;
}
