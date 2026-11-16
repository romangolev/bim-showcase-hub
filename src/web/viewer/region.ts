export type ViewerRegion = 'US' | 'EU';

export function detectRegion(urn: string): ViewerRegion {
  try {
    const padded = urn.replace(/-/g, '+').replace(/_/g, '/');
    return atob(padded).includes('emea') ? 'EU' : 'US';
  } catch {
    return 'US';
  }
}

export function apiForRegion(region: ViewerRegion): string {
  return region === 'EU' ? 'derivativeV2_EU' : 'derivativeV2';
}

let pageRegion: ViewerRegion | null = null;

export function claimRegion(region: ViewerRegion): boolean {
  if (pageRegion === null) pageRegion = region;
  return pageRegion === region;
}

export function regionAvailable(region: ViewerRegion): boolean {
  return pageRegion === null || pageRegion === region;
}

export function currentRegion(): ViewerRegion | null {
  return pageRegion;
}

export function resetRegion(): void {
  pageRegion = null;
}

export function regionConflictMessage(region: ViewerRegion): string {
  return `This model is in the ${region} region. The viewer supports one region per page.`;
}

export class RegionConflictError extends Error {
  constructor(readonly region: ViewerRegion) {
    super(regionConflictMessage(region));
    this.name = 'RegionConflictError';
  }
}

export const page = {
  reload: () => window.location.reload(),
};
