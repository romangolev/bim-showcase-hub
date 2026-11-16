export interface ViewerEvent {
  dbIdArray?: number[];
}

export interface ButtonStates {
  ACTIVE: number;
  INACTIVE: number;
  DISABLED: number;
}

export interface ControlButton {
  onClick: (ev?: unknown) => void;
  setToolTip(text: string): void;
  setIcon(iconClass: string): void;
  setState(state: number): boolean;
  getState(): number;
  icon?: HTMLElement;
  container?: HTMLElement;
}

export interface ComboButton extends ControlButton {
  addControl(control: ControlButton): void;
  removeControl(control: ControlButton): void;
}

export interface ControlGroup {
  addControl(control: ControlButton | ComboButton): void;
  removeControl(control: ControlButton | ComboButton | string): void;
  getNumberOfControls(): number;
}

export interface ViewerExtension {
  viewer: GuiViewer3D;
  options: unknown;
  load(): boolean | Promise<boolean>;
  unload(): boolean;
}

export type ViewerExtensionClass = new (
  viewer: GuiViewer3D,
  options?: unknown,
) => ViewerExtension;

export interface ExtensionManager {
  registerExtension(id: string, extension: ViewerExtensionClass): boolean;
}

export interface Toolbar {
  addControl(group: ControlGroup): void;
  removeControl(group: ControlGroup | string): void;
  getControl(id: string): ControlGroup | undefined;
}

export interface InstanceTree {
  getRootId(): number;
  getChildCount(dbId: number): number;
  enumNodeChildren(
    dbId: number,
    cb: (dbId: number) => void,
    recursive?: boolean,
  ): void;
}

export interface BulkPropertyItem {
  dbId: number;
  name: string;
  properties: { displayName: string; displayValue: unknown }[];
}

export interface ViewerModel {
  getBulkProperties(
    dbIds: number[],
    options: { propFilter?: string[] },
    onSuccess: (items: BulkPropertyItem[]) => void,
    onError?: (err: unknown) => void,
  ): void;
}

export interface ViewingDocument {
  getRoot(): { getDefaultGeometry(): unknown };
}

export interface GuiViewer3D {
  toolbar?: Toolbar;
  model?: ViewerModel;
  start(): number | undefined;
  resize(): void;
  loadExtension(id: string, options?: unknown): Promise<unknown>;
  unloadExtension(id: string): boolean;
  setTheme(theme: string): void;
  setBackgroundColor(
    red: number,
    green: number,
    blue: number,
    red2: number,
    green2: number,
    blue2: number,
  ): void;
  loadDocumentNode(doc: ViewingDocument, node: unknown): Promise<ViewerModel>;
  getObjectTree(
    onSuccess: (tree: InstanceTree) => void,
    onError?: (err: unknown) => void,
  ): void;
  getSelection(): number[];
  clearSelection(): void;
  setThemingColor(dbId: number, color: unknown, model?: ViewerModel): void;
  clearThemingColors(model?: ViewerModel): void;
  addEventListener(type: string, cb: (ev: ViewerEvent) => void): void;
  removeEventListener(type: string, cb: (ev: ViewerEvent) => void): void;
  tearDown(): void;
  finish(): void;
}

export interface InitializerOptions {
  env: string;
  api: string;
  getAccessToken: (cb: (token: string, expiresIn: number) => void) => void;
}

export interface AutodeskViewing {
  Initializer(options: InitializerOptions, cb: () => void): void;
  GuiViewer3D: new (
    container: HTMLElement,
    config?: { extensions?: string[] },
  ) => GuiViewer3D;
  Document: {
    load(
      urn: string,
      onSuccess: (doc: ViewingDocument) => void,
      onError: (code: number, message: string) => void,
    ): void;
  };
  Extension: ViewerExtensionClass;
  theExtensionManager: ExtensionManager;
  UI: {
    ControlGroup: new (id: string) => ControlGroup;
    Button: (new (id: string) => ControlButton) & { State: ButtonStates };
    ComboButton: new (id: string) => ComboButton;
  };
  SELECTION_CHANGED_EVENT: string;
  TOOLBAR_CREATED_EVENT: string;
}

interface AutodeskWindow {
  Autodesk?: { Viewing?: AutodeskViewing };
  THREE?: {
    Vector4: new (x: number, y: number, z: number, w: number) => unknown;
  };
  __MOCK_APS__?: boolean;
}

export function autodeskWindow(): AutodeskWindow {
  return window as unknown as AutodeskWindow;
}

export function getViewing(): AutodeskViewing {
  const viewing = autodeskWindow().Autodesk?.Viewing;
  if (!viewing) throw new Error('Autodesk Viewer failed to load');
  return viewing;
}
