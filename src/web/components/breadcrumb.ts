import type { ModelContext } from '../api/modelContext.js';
import { modelTabTitle } from '../api/modelTitles.js';

export type BreadcrumbMode = 'full' | 'file' | 'off';

export interface Crumb {
  label: string;
  current: boolean;
}

export const BREADCRUMB_TAIL = 2;

function shorten(path: readonly string[]): string[] {
  if (path.length <= BREADCRUMB_TAIL + 1) return [...path];
  return [...path.slice(0, 1), '…', ...path.slice(-BREADCRUMB_TAIL)];
}

export function breadcrumbOf(
  urn: string,
  context: ModelContext | null,
  mode: BreadcrumbMode,
): Crumb[] {
  if (mode === 'off') return [];
  const current: Crumb = {
    label: modelTabTitle(urn, context ?? {}).label,
    current: true,
  };
  if (mode === 'file') return [current];
  const path = shorten(context?.crumbs ?? []);
  return [...path.map((label) => ({ label, current: false })), current];
}
