import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';

export function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(value));
}

export function missingModels(adapter: ViewerAdapter): string[] {
  if (typeof adapter.getModels !== 'function') return [];
  return adapter
    .getModels()
    .filter((model) => model.status !== 'ready')
    .map((model) => model.name);
}
