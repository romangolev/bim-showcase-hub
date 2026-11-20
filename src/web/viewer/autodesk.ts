export interface AggregateSelectionEntry {
  model: ViewerModel;
  dbIdArray?: number[];
}

export interface ViewerEvent {
  dbIdArray?: number[];
  selections?: AggregateSelectionEntry[];
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
  externalId?: string;
  name: string;
  properties: {
    displayName: string;
    displayValue: unknown;
    displayCategory?: string;
  }[];
}

export interface ViewerModel {
  getExternalIdMapping?(
    onSuccess: (map: Record<string, number>) => void,
    onError?: (err: unknown) => void,
  ): void;
  getBulkProperties(
    dbIds: number[],
    options: { propFilter?: string[] },
    onSuccess: (items: BulkPropertyItem[]) => void,
    onError?: (err: unknown) => void,
  ): void;
  getObjectTree?(
    onSuccess: (tree: InstanceTree) => void,
    onError?: (err: unknown) => void,
  ): void;
  getData?(): { globalOffset?: unknown } | undefined;
  getUnitString?(): string | null | undefined;
  getUnitScale?(): number | null | undefined;
  is2d?(): boolean;
  isLoadDone?(): boolean;
  getBoundingBox?(): ViewerBox;
  getPlacementTransform?(): PlacementMatrix;
  getFragmentList?(): FragmentList;
  setThemingColor?(dbId: number, color: unknown, recursive?: boolean): void;
}

export interface ViewerGeometry {
  vb?: Float32Array;
  vbstride?: number;
  ib?: Uint16Array | Uint32Array;
  polyCount?: number;
  attributes?: Record<
    string,
    { offset?: number; itemOffset?: number; itemSize?: number }
  >;
  offsets?: { start: number; count: number; index: number }[];
}

export interface ViewerMaterial {
  color?: {
    r?: number;
    g?: number;
    b?: number;
    getHexString?(): string;
  };
  opacity?: number;
  transparent?: boolean;
  name?: string;
}

export interface ViewerMesh {
  geometry?: ViewerGeometry | null;
  material?: ViewerMaterial;
  matrixWorld?: { elements: ArrayLike<number> };
  dbId?: number | number[];
}

export interface FragmentList {
  getCount(): number;
  getDbIds?(fragId: number): number | number[];
  getGeometry?(fragId: number): ViewerGeometry | null;
  getVizmesh?(fragId: number): ViewerMesh;
  isLine?(fragId: number): boolean;
  isPoint?(fragId: number): boolean;
  isNotLoaded?(fragId: number): boolean;
}

export interface ViewerBox {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

export interface PlacementMatrix {
  elements: number[] | Float64Array | Float32Array;
  clone(): PlacementMatrix;
}

export interface BubbleNode {
  is2D?(): boolean;
  is3D?(): boolean;
}

export interface ViewingDocument {
  getRoot(): {
    data?: { status?: string };
    getDefaultGeometry(): unknown;
    search?(query: { type: string; role?: string }): unknown[];
  };
}

export interface DocumentNodeLoadOptions {
  keepCurrentModels?: boolean;
  applyRefPoint?: boolean;
  globalOffset?: unknown;
  applyScaling?: string;
}

export interface ViewportState {
  eye: number[];
  target: number[];
  up: number[];
  isOrthographic?: boolean;
  projection?: string;
  [key: string]: unknown;
}

export interface AggregateSelection {
  model: ViewerModel;
  selection: number[];
}

export interface GuiViewer3D {
  toolbar?: Toolbar;
  model?: ViewerModel;
  container?: HTMLElement;
  canvas?: HTMLCanvasElement;
  impl?: {
    resize?(width: number, height: number): void;
    setPlacementTransform?(model: ViewerModel, matrix: PlacementMatrix): void;
    setCutPlanes?(planes: unknown[]): void;
    invalidate?(hard?: boolean, force?: boolean, updateRender?: boolean): void;
    selector?: {
      setAggregateSelection?(
        entries: { model: ViewerModel; ids: number[] }[],
      ): void;
    };
  };
  navigation?: { fitBounds(immediate: boolean, bounds: ViewerBox): void };
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
  loadDocumentNode(
    doc: ViewingDocument,
    node: unknown,
    options?: DocumentNodeLoadOptions,
  ): Promise<ViewerModel>;
  unloadModel?(model: ViewerModel): void;
  hideModel?(model: ViewerModel | number): boolean;
  showModel?(model: ViewerModel | number, preserveTools?: boolean): boolean;
  getAllModels?(): ViewerModel[];
  select?(ids: number[], model?: ViewerModel): void;
  getAggregateSelection?(): AggregateSelection[];
  getIsolatedNodes?(model?: ViewerModel): number[];
  getHiddenNodes?(model?: ViewerModel): number[];
  isolate?(ids: number[], model?: ViewerModel): void;
  hide?(ids: number[], model?: ViewerModel): void;
  show?(ids: number[], model?: ViewerModel): void;
  fitToView?(
    objectIds?: number[] | null,
    model?: ViewerModel | null,
    immediate?: boolean,
  ): void;
  getScreenShot?(
    width: number,
    height: number,
    onDone: (url: string) => void,
  ): void;
  getState?(filter?: { viewport?: boolean; cutplanes?: boolean }): {
    viewport?: ViewportState;
    cutplanes?: number[][];
  };
  restoreState?(
    state: { viewport?: ViewportState; cutplanes?: number[][] },
    filter?: { viewport?: boolean; cutplanes?: boolean },
    immediate?: boolean,
  ): boolean;
  getCutPlanes?(): { x: number; y: number; z: number; w: number }[];
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
  AGGREGATE_SELECTION_CHANGED_EVENT?: string;
  TOOLBAR_CREATED_EVENT: string;
  FULLSCREEN_MODE_EVENT?: string;
  HIDE_EVENT?: string;
  SHOW_EVENT?: string;
  ISOLATE_EVENT?: string;
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
