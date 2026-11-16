import { autodeskWindow } from './autodesk.js';
import type { ViewerAdapter } from './ViewerAdapter.js';

export function isMockViewer(): boolean {
  return (
    import.meta.env.VITE_MOCK_APS === '1' ||
    autodeskWindow().__MOCK_APS__ === true
  );
}

export async function createViewerAdapter(
  container: HTMLElement,
): Promise<ViewerAdapter> {
  if (isMockViewer()) {
    const { createMockViewerAdapter } = await import('./MockViewerAdapter.js');
    return createMockViewerAdapter(container);
  }
  const { createRealViewerAdapter } = await import('./RealViewerAdapter.js');
  return createRealViewerAdapter(container);
}
