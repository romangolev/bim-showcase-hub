export const NATIVE_CONTROLS = [
  { id: 'toolbar-orbitTools', label: 'Orbit' },
  { id: 'toolbar-panTool', label: 'Pan' },
  { id: 'toolbar-zoomTool', label: 'Zoom' },
  { id: 'toolbar-cameraSubmenuTool', label: 'Camera' },
  { id: 'toolbar-bimWalkTool', label: 'First person' },
  { id: 'toolbar-sectionTool', label: 'Section' },
  { id: 'toolbar-measurementSubmenuTool', label: 'Measure' },
  { id: 'toolbar-explodeTool', label: 'Explode' },
  { id: 'toolbar-modelStructureTool', label: 'Model browser' },
  { id: 'toolbar-propertiesTool', label: 'Properties' },
  { id: 'toolbar-settingsTool', label: 'Settings' },
  { id: 'toolbar-fullscreenTool', label: 'Full screen' },
] as const;

export const TOOLBAR_GROUPS = [
  'navTools',
  'modelTools',
  'settingsTools',
] as const;

export type NativeControlId = (typeof NATIVE_CONTROLS)[number]['id'];

export type ToolbarGroupId = (typeof TOOLBAR_GROUPS)[number];
