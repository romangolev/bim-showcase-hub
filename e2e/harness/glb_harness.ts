import { exportGeometryToGlb } from '../../src/web/extensions/glbExport.js';
import type { GuiViewer3D } from '../../src/web/viewer/autodesk.js';
import type { ViewerAdapter } from '../../src/web/viewer/ViewerAdapter.js';
import { readViewerGeometry } from '../../src/web/viewer/viewerGeometry.js';

declare global {
  interface Window {
    viewer?: GuiViewer3D;
    __bshViewerReady?: boolean;
    __bshStatus?: unknown;
    __bshExportGlb?: (fileName?: string) => Promise<unknown>;
  }
}

const name = 'rac_advanced_sample_project.rvt';

function adapter(): ViewerAdapter {
  return {
    getGeometryParts: async () => {
      const viewer = window.viewer;
      if (!viewer) throw new Error('The viewer is not ready');
      return readViewerGeometry(viewer);
    },
    getModels: () => [
      {
        id: 'revit',
        urn: 'revit',
        name,
        visible: true,
        status: 'ready',
      },
    ],
  } as unknown as ViewerAdapter;
}

window.__bshExportGlb = async (fileName = 'revit-sample-geometry.glb') => {
  const status = await exportGeometryToGlb(adapter(), { fileName });
  window.__bshStatus = status;
  return status;
};

const button = document.getElementById('export');
if (button) {
  button.addEventListener('click', () => {
    button.setAttribute('aria-busy', 'true');
    void window.__bshExportGlb?.().finally(() => {
      button.setAttribute('aria-busy', 'false');
    });
  });
}
