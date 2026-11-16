import { detectRegion, type ViewerRegion } from '../../shared/region.js';

export { detectRegion, type ViewerRegion };

export function apiForRegion(region: ViewerRegion): string {
  return region === 'EU' ? 'derivativeV2_EU' : 'derivativeV2';
}

let pageRegion: ViewerRegion | null = null;
const regionListeners = new Set<() => void>();

function notifyRegion(): void {
  for (const listener of [...regionListeners]) listener();
}

export function onRegionChange(listener: () => void): () => void {
  regionListeners.add(listener);
  return () => {
    regionListeners.delete(listener);
  };
}

export function claimRegion(region: ViewerRegion): boolean {
  if (pageRegion === null) {
    pageRegion = region;
    notifyRegion();
  }
  return pageRegion === region;
}

export function regionAvailable(region: ViewerRegion): boolean {
  return pageRegion === null || pageRegion === region;
}

export function currentRegion(): ViewerRegion | null {
  return pageRegion;
}

export function resetRegion(): void {
  if (pageRegion === null) return;
  pageRegion = null;
  notifyRegion();
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
  go: (href: string) => window.location.assign(href),
};
