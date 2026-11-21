import type { NativeControlId } from '../../viewer/nativeControls.js';

export const TOOLBAR_PROFILES = {
  full: [],
  review: ['toolbar-bimWalkTool', 'toolbar-cameraSubmenuTool'],
  present: [
    'toolbar-sectionTool',
    'toolbar-measurementSubmenuTool',
    'toolbar-explodeTool',
    'toolbar-modelStructureTool',
    'toolbar-propertiesTool',
    'toolbar-settingsTool',
  ],
  minimal: [
    'toolbar-panTool',
    'toolbar-zoomTool',
    'toolbar-cameraSubmenuTool',
    'toolbar-bimWalkTool',
    'toolbar-sectionTool',
    'toolbar-measurementSubmenuTool',
    'toolbar-explodeTool',
    'toolbar-modelStructureTool',
    'toolbar-propertiesTool',
    'toolbar-settingsTool',
  ],
} as const satisfies Record<string, readonly NativeControlId[]>;

export type ToolbarProfileId = keyof typeof TOOLBAR_PROFILES | 'custom';
