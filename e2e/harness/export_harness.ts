import { exportGeometryToGlb } from '../../src/web/extensions/glbExport.js';
import { exportToIfc } from '../../src/web/extensions/ifcExport.js';
import type { GuiViewer3D } from '../../src/web/viewer/autodesk.js';
import type { ViewerAdapter } from '../../src/web/viewer/ViewerAdapter.js';
import { readViewerGeometry } from '../../src/web/viewer/viewerGeometry.js';
import { readViewerSource } from '../../src/web/viewer/viewerSource.js';

declare global {
  interface Window {
    viewer?: GuiViewer3D;
    __bshViewerReady?: boolean;
    __bshStatus?: unknown;
    __bshExportGlb?: (fileName?: string) => Promise<unknown>;
    __bshExportIfc?: (fileName?: string) => Promise<unknown>;
    __bshIfcStatus?: unknown;
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
    getIfcSource: async () => {
      const viewer = window.viewer;
      if (!viewer?.model) throw new Error('The viewer is not ready');
      return readViewerSource(
        viewer,
        new Map([[viewer.model, { id: 'revit', name, urn: 'revit' }]]),
      );
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

window.__bshExportIfc = async (fileName = 'revit-sample.ifc') => {
  const status = await exportToIfc(adapter(), { fileName });
  window.__bshIfcStatus = status;
  return status;
};

const ifcButton = document.getElementById('export-ifc');
if (ifcButton) {
  ifcButton.addEventListener('click', () => {
    ifcButton.setAttribute('aria-busy', 'true');
    void window.__bshExportIfc?.().finally(() => {
      ifcButton.setAttribute('aria-busy', 'false');
    });
  });
}
