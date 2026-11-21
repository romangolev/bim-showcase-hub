import {
  type AutodeskViewing,
  autodeskWindow,
  type BulkPropertyItem,
  type ControlButton,
  type ControlGroup,
  type DocumentNodeLoadOptions,
  type GuiViewer3D,
  type InstanceTree,
  type PlacementMatrix,
  type ViewerBox,
  type ViewerEvent,
  type ViewerModel,
  type ViewingDocument,
  type ViewportState,
} from './autodesk.js';

export const FAKE_AGGREGATE_EVENT = 'aggregate-selection-changed';
export const FAKE_SELECTION_EVENT = 'selection-changed';
export const FAKE_HIDE_EVENT = 'hide';
export const FAKE_SHOW_EVENT = 'show';
export const FAKE_ISOLATE_EVENT = 'isolate';
export const FAKE_LEAVES = [11, 12, 13];

export interface FakeModelSpec {
  unit?: string;
  offset?: { x: number; y: number; z: number };
  only2d?: boolean;
  categories?: string[];
  fail?: string;
  propsFail?: string;
  treeHang?: boolean;
  leaves?: number[];
  noGeometry?: boolean;
  center?: [number, number, number];
  size?: number;
  refPoint?: boolean;
}

let modelIds = 0;

export class FakeModel implements ViewerModel {
  globalOffset: unknown;
  readonly id = ++modelIds;

  constructor(
    readonly urn: string,
    readonly options: DocumentNodeLoadOptions,
    readonly spec: FakeModelSpec,
    readonly twoD: boolean,
  ) {
    this.globalOffset = options.globalOffset ??
      spec.offset ?? { x: 0, y: 0, z: 0 };
  }

  getBulkProperties(
    dbIds: number[],
    options: { propFilter?: string[] },
    onSuccess: (items: BulkPropertyItem[]) => void,
  ): void {
    const categories = this.spec.categories ?? ['Walls'];
    const known = new Set([1, ...(this.spec.leaves ?? FAKE_LEAVES)]);
    onSuccess(
      dbIds
        .filter((dbId) => known.has(dbId))
        .map((dbId, index) => ({
          dbId,
          name: `${this.urn} ${dbId}`,
          properties: (options.propFilter ?? []).includes('Category')
            ? [
                {
                  displayName: 'Category',
                  displayValue: categories[index % categories.length],
                },
              ]
            : [],
        })),
    );
  }

  getObjectTree(
    onSuccess: (tree: InstanceTree) => void,
    onError?: (err: unknown) => void,
  ): void {
    if (this.spec.treeHang) return;
    if (this.spec.propsFail) {
      onError?.(new Error(this.spec.propsFail));
      return;
    }
    const leaves = this.spec.leaves ?? FAKE_LEAVES;
    onSuccess({
      getRootId: () => 1,
      getChildCount: (dbId) => (dbId === 1 ? leaves.length : 0),
      enumNodeChildren: (dbId, cb) => {
        if (dbId !== 1) return;
        for (const leaf of leaves) cb(leaf);
      },
    });
  }

  getData() {
    return {
      globalOffset: this.globalOffset,
      ...(this.spec.refPoint
        ? {
            refPointTransform: {
              elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
            },
          }
        : {}),
    };
  }

  getUnitString(): string {
    return this.spec.unit ?? 'ft';
  }

  is2d(): boolean {
    return this.twoD;
  }

  placement: number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

  getPlacementTransform(): PlacementMatrix {
    const matrix = (elements: number[]): PlacementMatrix => ({
      elements,
      clone: () => matrix([...elements]),
    });
    return matrix([...this.placement]);
  }

  getBoundingBox(): ViewerBox {
    const [cx, cy, cz] = this.spec.center ?? [0, 0, 0];
    const half = (this.spec.size ?? 10) / 2;
    const [dx, dy, dz] = [
      this.placement[12] ?? 0,
      this.placement[13] ?? 0,
      this.placement[14] ?? 0,
    ];
    return {
      min: { x: cx - half + dx, y: cy - half + dy, z: cz - half + dz },
      max: { x: cx + half + dx, y: cy + half + dy, z: cz + half + dz },
    };
  }

  isLoadDone(): boolean {
    return true;
  }
}

interface FakeNode {
  is2D(): boolean;
  guid(): string;
  name(): string;
  data: { guid: string; name: string; role: string };
}

function viewNode(guid: string, name: string, twoD: boolean): FakeNode {
  return {
    is2D: () => twoD,
    guid: () => guid,
    name: () => name,
    data: { guid, name, role: twoD ? '2d' : '3d' },
  };
}

export function documentNodes(spec: FakeModelSpec): FakeNode[] {
  if (spec.noGeometry) return [];
  if (spec.only2d) return [viewNode('s1', 'Sheet', true)];
  return [viewNode('g1', '{3D}', false), viewNode('g2', 'A101 - Plans', true)];
}

export class FakeControl implements ControlButton {
  visible = true;

  constructor(readonly id: string) {}

  onClick(): void {}

  setToolTip(): void {}

  setIcon(): void {}

  setState(): boolean {
    return true;
  }

  getState(): number {
    return 0;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
  }
}

export class FakeControlGroup implements ControlGroup {
  readonly controls = new Map<string, FakeControl>();

  constructor(readonly id: string) {}

  addControl(control: ControlButton): void {
    if (control instanceof FakeControl) this.controls.set(control.id, control);
  }

  add(id: string): FakeControl {
    const control = new FakeControl(id);
    this.controls.set(id, control);
    return control;
  }

  removeControl(control: ControlButton | string): void {
    const id = typeof control === 'string' ? control : undefined;
    for (const [key, own] of this.controls) {
      if (key === id || own === control) this.controls.delete(key);
    }
  }

  getNumberOfControls(): number {
    return this.controls.size;
  }

  getControl(id: string): ControlButton | undefined {
    return this.controls.get(id);
  }
}

export class FakeToolbar {
  readonly groups = new Map<string, FakeControlGroup>();

  constructor() {
    for (const id of ['navTools', 'modelTools', 'settingsTools']) {
      this.groups.set(id, new FakeControlGroup(id));
    }
    this.control('navTools', 'toolbar-orbitTools');
    this.control('modelTools', 'toolbar-sectionTool');
    this.control('settingsTools', 'toolbar-fullscreenTool');
  }

  control(groupId: string, id: string): FakeControl {
    const group = this.groups.get(groupId);
    if (!group) throw new Error(`no group ${groupId}`);
    return group.add(id);
  }

  addControl(group: ControlGroup): void {
    const own = group as FakeControlGroup;
    this.groups.set(own.id, own);
  }

  removeControl(group: ControlGroup | string): void {
    this.groups.delete(
      typeof group === 'string' ? group : (group as FakeControlGroup).id,
    );
  }

  getControl(id: string): ControlGroup | undefined {
    return this.groups.get(id);
  }

  visible(id: string): boolean {
    for (const group of this.groups.values()) {
      const control = group.getControl(id);
      if (control) return (control as FakeControl).visible;
    }
    return false;
  }
}

export interface FakeMeasure {
  list: unknown[];
  activated: string[];
  activate(mode: string): boolean;
  getMeasurementList(): unknown[];
  deleteMeasurements(): void;
}

export function fakeMeasure(): FakeMeasure {
  const measure: FakeMeasure = {
    list: [],
    activated: [],
    activate(mode: string): boolean {
      measure.activated.push(mode);
      return true;
    },
    getMeasurementList(): unknown[] {
      return measure.list;
    },
    deleteMeasurements(): void {
      measure.list = [];
    },
  };
  return measure;
}

export interface FakeDocument extends ViewingDocument {
  urn: string;
}

export interface FakeEnvironment {
  viewers: FakeFederatedViewer[];
  specs: Map<string, FakeModelSpec>;
  gate: Map<string, Promise<void>>;
  startCode?: number;
  documentLoads: string[];
}

export class FakeFederatedViewer implements GuiViewer3D {
  container: HTMLElement;
  toolbar = new FakeToolbar();
  measure: FakeMeasure | null = fakeMeasure();
  models: FakeModel[] = [];
  nodeGuids: string[] = [];
  displayCalls: { name: string; args: unknown[] }[] = [];
  hidden = new Set<FakeModel>();
  unloaded: FakeModel[] = [];
  selections = new Map<FakeModel, number[]>();
  themed: { model: ViewerModel | undefined; dbId: number; color: unknown }[] =
    [];
  cleared: (ViewerModel | undefined)[] = [];
  fits = 0;
  ghosting = true;
  isolated = new Map<FakeModel, number[]>();
  hiddenNodes = new Map<FakeModel, number[]>();
  fitted: ViewerBox[] = [];
  fitCalls: {
    ids: number[] | null;
    model: FakeModel | null;
    immediate: boolean | undefined;
  }[] = [];
  viewport: ViewportState = {
    eye: [10, 10, 10],
    target: [0, 0, 0],
    up: [0, 0, 1],
    isOrthographic: false,
    projection: 'perspective',
  };
  cutplanes: number[][] = [];
  explodeScale = 0;
  restored: {
    state: unknown;
    filter: unknown;
    immediate: boolean | undefined;
  }[] = [];
  placed: { urn: string; elements: number[] }[] = [];
  impl = {
    setPlacementTransform: (model: ViewerModel, matrix: PlacementMatrix) => {
      const own = model as FakeModel;
      own.placement = [...matrix.elements];
      this.placed.push({ urn: own.urn, elements: [...matrix.elements] });
    },
    setCutPlanes: (planes: unknown[]) => {
      if (planes.length === 0) this.cutplanes = [];
    },
    selector: {
      setAggregateSelection: (
        entries: { model: ViewerModel; ids: number[] }[],
      ) => {
        this.selections.clear();
        for (const { model, ids } of entries) {
          this.selections.set(this.own(model), [...ids]);
        }
        this.fire();
      },
    },
  };
  navigation = {
    fitBounds: (_immediate: boolean, box: ViewerBox) => {
      this.fitted.push(box);
    },
  };
  finished = false;
  private readonly listeners = new Map<
    string,
    Set<(ev: ViewerEvent) => void>
  >();

  constructor(
    container: HTMLElement,
    private readonly env: FakeEnvironment,
  ) {
    this.container = container;
    env.viewers.push(this);
  }

  get model(): ViewerModel | undefined {
    return this.models[0];
  }

  start(): number {
    return this.env.startCode ?? 0;
  }

  resize(): void {}

  async loadExtension(): Promise<unknown> {
    return {};
  }

  unloadExtension(): boolean {
    return true;
  }

  getExtension(id: string): unknown {
    return id === 'Autodesk.Measure' ? (this.measure ?? undefined) : undefined;
  }

  private record(name: string, ...args: unknown[]): void {
    this.displayCalls.push({ name, args });
  }

  setLightPreset(preset: number): void {
    this.record('setLightPreset', preset);
  }

  setGroundShadow(value: boolean): void {
    this.record('setGroundShadow', value);
  }

  setDisplayEdges(value: boolean): void {
    this.record('setDisplayEdges', value);
  }

  setQualityLevel(ambientOcclusion: boolean, antialiasing: boolean): void {
    this.record('setQualityLevel', ambientOcclusion, antialiasing);
  }

  setOptimizeNavigation(value: boolean): void {
    this.record('setOptimizeNavigation', value);
  }

  setProgressiveRendering(value: boolean): void {
    this.record('setProgressiveRendering', value);
  }

  calls(name: string): unknown[][] {
    return this.displayCalls
      .filter((call) => call.name === name)
      .map((call) => call.args);
  }

  setTheme(): void {}

  setBackgroundColor(): void {}

  async loadDocumentNode(
    doc: ViewingDocument,
    node: unknown,
    options: DocumentNodeLoadOptions = {},
  ): Promise<ViewerModel> {
    const urn = (doc as FakeDocument).urn;
    await this.env.gate.get(urn);
    const spec = this.env.specs.get(urn) ?? {};
    const model = new FakeModel(urn, options, spec, (node as FakeNode).is2D());
    this.nodeGuids.push((node as FakeNode).guid?.() ?? '');
    this.models.push(model);
    return model;
  }

  private own(model: ViewerModel | number | undefined): FakeModel {
    const found =
      typeof model === 'number'
        ? this.models.find((m) => m.id === model)
        : this.models.find((m) => m === model);
    if (!found) throw new TypeError('expected a loaded model or its id');
    return found;
  }

  unloadModel(model: ViewerModel): void {
    if (!(model instanceof FakeModel)) {
      throw new TypeError('unloadModel takes a model');
    }
    const own = this.own(model);
    this.models = this.models.filter((m) => m !== own);
    this.selections.delete(own);
    this.unloaded.push(own);
  }

  hideModel(model: ViewerModel | number): boolean {
    this.hidden.add(this.own(model));
    return true;
  }

  select(ids: number[], model: ViewerModel): void {
    this.selections.set(this.own(model), [...ids]);
    this.fire();
  }

  isolate(ids: number[], model: ViewerModel): void {
    this.isolated.set(this.own(model), [...ids]);
    this.dispatch(FAKE_ISOLATE_EVENT);
  }

  hide(ids: number[], model: ViewerModel): void {
    const own = this.own(model);
    this.hiddenNodes.set(own, [...(this.hiddenNodes.get(own) ?? []), ...ids]);
    this.dispatch(FAKE_HIDE_EVENT);
  }

  show(ids: number[], model: ViewerModel): void {
    const own = this.own(model);
    const gone = new Set(ids);
    this.hiddenNodes.set(
      own,
      (this.hiddenNodes.get(own) ?? []).filter((id) => !gone.has(id)),
    );
    this.dispatch(FAKE_SHOW_EVENT);
  }

  getHiddenNodes(model: ViewerModel): number[] {
    return [...(this.hiddenNodes.get(this.own(model)) ?? [])];
  }

  showModel(model: ViewerModel | number): boolean {
    return this.hidden.delete(this.own(model));
  }

  getAllModels(): ViewerModel[] {
    return [...this.models];
  }

  getAggregateSelection() {
    return [...this.selections]
      .filter(([, ids]) => ids.length > 0)
      .map(([model, selection]) => ({ model, selection: [...selection] }));
  }

  fitToView(
    objectIds?: number[] | null,
    model?: ViewerModel | null,
    immediate?: boolean,
  ): void {
    this.fits += 1;
    this.fitCalls.push({
      ids: objectIds ? [...objectIds] : null,
      model: model ? this.own(model) : null,
      immediate,
    });
  }

  getCutPlanes() {
    return this.cutplanes.map(([x = 0, y = 0, z = 0, w = 0]) => ({
      x,
      y,
      z,
      w,
    }));
  }

  setGhosting(enabled: boolean): void {
    this.ghosting = enabled;
  }

  explode(scale: number): void {
    this.explodeScale = scale;
  }

  getExplodeScale(): number {
    return this.explodeScale;
  }

  getIsolatedNodes(model: ViewerModel): number[] {
    return [...(this.isolated.get(this.own(model)) ?? [])];
  }

  getState(filter?: { viewport?: boolean; cutplanes?: boolean }) {
    const state: {
      viewport?: ViewportState;
      cutplanes?: number[][];
    } = {};
    if (!filter || filter.viewport) state.viewport = { ...this.viewport };
    if (!filter || filter.cutplanes) {
      state.cutplanes = this.cutplanes.map((plane) => [...plane]);
    }
    return state;
  }

  restoreState(
    state: { viewport?: ViewportState; cutplanes?: number[][] },
    filter?: { viewport?: boolean; cutplanes?: boolean },
    immediate?: boolean,
  ): boolean {
    this.restored.push({ state, filter, immediate });
    if (state.viewport && (!filter || filter.viewport)) {
      this.viewport = { ...state.viewport };
    }
    if (state.cutplanes?.length && (!filter || filter.cutplanes)) {
      this.cutplanes = state.cutplanes.map((plane) => [...plane]);
    }
    return true;
  }

  getObjectTree(
    onSuccess: (tree: InstanceTree) => void,
    onError?: (err: unknown) => void,
  ): void {
    const first = this.models[0];
    if (first) first.getObjectTree(onSuccess);
    else onError?.(new Error('no model'));
  }

  getSelection(): number[] {
    const first = this.models[0];
    return first ? [...(this.selections.get(first) ?? [])] : [];
  }

  clearSelection(): void {
    this.selections.clear();
    this.fire();
  }

  setThemingColor(dbId: number, color: unknown, model?: ViewerModel): void {
    this.themed.push({
      model: model === undefined ? this.models[0] : this.own(model),
      dbId,
      color,
    });
  }

  clearThemingColors(model?: ViewerModel): void {
    this.cleared.push(model === undefined ? model : this.own(model));
  }

  addEventListener(type: string, cb: (ev: ViewerEvent) => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(cb);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, cb: (ev: ViewerEvent) => void): void {
    this.listeners.get(type)?.delete(cb);
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }

  tearDown(): void {}

  finish(): void {
    this.finished = true;
  }

  modelOf(urn: string): FakeModel {
    const model = this.models.find((m) => m.urn === urn);
    if (!model) throw new Error(`model ${urn} not loaded`);
    return model;
  }

  selectIn(urn: string, ids: number[]): void {
    this.selections.set(this.modelOf(urn), [...ids]);
    this.fire();
  }

  private dispatch(type: string): void {
    for (const cb of this.listeners.get(type) ?? []) cb({});
  }

  private fire(): void {
    const selections = this.getAggregateSelection().map((entry) => ({
      model: entry.model,
      dbIdArray: entry.selection,
    }));
    for (const cb of this.listeners.get(FAKE_AGGREGATE_EVENT) ?? []) {
      cb({ selections });
    }
  }
}

export function installFakeFederation(): FakeEnvironment {
  const env: FakeEnvironment = {
    viewers: [],
    specs: new Map(),
    gate: new Map(),
    documentLoads: [],
  };
  class Viewer extends FakeFederatedViewer {
    constructor(container: HTMLElement) {
      super(container, env);
    }
  }
  class Extension {
    constructor(
      readonly viewer: GuiViewer3D,
      readonly options: unknown,
    ) {}
    load(): boolean {
      return true;
    }
    unload(): boolean {
      return true;
    }
  }
  const viewing: AutodeskViewing = {
    Initializer: (_options, cb) => cb(),
    GuiViewer3D: Viewer,
    Document: {
      load: (path, onSuccess, onError) => {
        const urn = path.replace(/^urn:/, '');
        env.documentLoads.push(urn);
        const spec = env.specs.get(urn) ?? {};
        if (spec.fail) {
          onError(404, spec.fail);
          return;
        }
        const nodes = documentNodes(spec);
        const doc: FakeDocument = {
          urn,
          getRoot: () => ({
            getDefaultGeometry: () => nodes[0] ?? null,
            search: (query) =>
              nodes.filter(
                (entry) =>
                  !query.role || entry.is2D() === (query.role === '2d'),
              ),
          }),
        };
        onSuccess(doc);
      },
    },
    Extension,
    theExtensionManager: { registerExtension: () => true },
    UI: {
      ControlGroup: class {},
      Button: Object.assign(class {}, {
        State: { ACTIVE: 0, INACTIVE: 1, DISABLED: 2 },
      }),
      ComboButton: class {},
    } as unknown as AutodeskViewing['UI'],
    SELECTION_CHANGED_EVENT: FAKE_SELECTION_EVENT,
    AGGREGATE_SELECTION_CHANGED_EVENT: FAKE_AGGREGATE_EVENT,
    TOOLBAR_CREATED_EVENT: 'toolbar-created',
    HIDE_EVENT: FAKE_HIDE_EVENT,
    SHOW_EVENT: FAKE_SHOW_EVENT,
    ISOLATE_EVENT: FAKE_ISOLATE_EVENT,
  };
  autodeskWindow().Autodesk = { Viewing: viewing };
  autodeskWindow().THREE = {
    Vector4: class {
      constructor(
        readonly x: number,
        readonly y: number,
        readonly z: number,
        readonly w: number,
      ) {}
    },
  };
  return env;
}
