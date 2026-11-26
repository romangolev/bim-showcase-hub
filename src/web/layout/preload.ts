import { sessionQueryOptions } from '../api/hooks.js';
import { queryClient } from '../queryClient.js';
import { STACKED_QUERY } from './breakpoint.js';

export const loadLayoutProvider = () => import('./LayoutProvider.js');
export const loadDockLayout = () => import('./DockLayout.js');

export function preloadDockLayout(): void {
  if (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(STACKED_QUERY).matches
  ) {
    return;
  }
  void loadDockLayout().catch(() => {});
}

export function preloadApp(): void {
  void loadLayoutProvider().catch(() => {});
  void queryClient.prefetchQuery(sessionQueryOptions).then(() => {
    if (!queryClient.getQueryData(sessionQueryOptions.queryKey)) return;
    preloadDockLayout();
  });
}
