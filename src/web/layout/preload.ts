import { sessionQueryOptions } from '../api/hooks.js';
import { queryClient } from '../queryClient.js';

export const loadLayoutProvider = () => import('./LayoutProvider.js');
export const loadDockLayout = () => import('./DockLayout.js');

export function preloadApp(): void {
  void queryClient.prefetchQuery(sessionQueryOptions).then(() => {
    if (!queryClient.getQueryData(sessionQueryOptions.queryKey)) return;
    void loadLayoutProvider().catch(() => {});
    void loadDockLayout().catch(() => {});
  });
}
