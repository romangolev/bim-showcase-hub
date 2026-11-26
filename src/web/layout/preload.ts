import { sessionQueryOptions } from '../api/hooks.js';
import { queryClient } from '../queryClient.js';
import { BSH_KEYS, getStorageAdapter } from '../storage.js';

export const loadLayoutProvider = () => import('./LayoutProvider.js');
export const loadDockLayout = () => import('./DockLayout.js');

export function preloadApp(): void {
  void queryClient.prefetchQuery(sessionQueryOptions);
  if (getStorageAdapter().get('local', BSH_KEYS.personal.layout) === null) {
    return;
  }
  void loadLayoutProvider().catch(() => {});
  void loadDockLayout().catch(() => {});
}
