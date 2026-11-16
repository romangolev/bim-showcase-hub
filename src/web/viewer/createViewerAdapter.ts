import { autodeskWindow } from './autodesk.js';
import type { ViewerAdapter } from './ViewerAdapter.js';

export function isMockViewer(): boolean {
  if (!import.meta.env.DEV) {
    return false;
  }
  return (
    import.meta.env.VITE_MOCK_APS === '1' ||
    autodeskWindow().__MOCK_APS__ === true
  );
}

export async function createViewerAdapter(
  container: HTMLElement,
): Promise<ViewerAdapter> {
  if (import.meta.env.DEV && isMockViewer()) {
    const { createMockViewerAdapter } = await import('./MockViewerAdapter.js');
    return createMockViewerAdapter(container);
  }
  const { createRealViewerAdapter } = await import('./RealViewerAdapter.js');
  return createRealViewerAdapter(container);
}
