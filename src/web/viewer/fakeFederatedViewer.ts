import {
  type AutodeskViewing,
  autodeskWindow,
  type BulkPropertyItem,
  type DocumentNodeLoadOptions,
  type GuiViewer3D,
  type InstanceTree,
  type ViewerEvent,
  type ViewerModel,
  type ViewingDocument,
} from './autodesk.js';

export const FAKE_AGGREGATE_EVENT = 'aggregate-selection-changed';
export const FAKE_SELECTION_EVENT = 'selection-changed';
export const FAKE_LEAVES = [11, 12, 13];

export interface FakeModelSpec {
  unit?: string;
  offset?: { x: number; y: number; z: number };
  only2d?: boolean;
  categories?: string[];
  fail?: string;
  propsFail?: string;
  noGeometry?: boolean;
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
    onSuccess(
      dbIds.map((dbId, index) => ({
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
    if (this.spec.propsFail) {
      onError?.(new Error(this.spec.propsFail));
      return;
    }
    onSuccess({
      getRootId: () => 1,
      getChildCount: (dbId) => (dbId === 1 ? FAKE_LEAVES.length : 0),
      enumNodeChildren: (_dbId, cb) => {
        for (const leaf of FAKE_LEAVES) cb(leaf);
      },
    });
  }

  getData() {
    return { globalOffset: this.globalOffset };
  }

  getUnitString(): string {
    return this.spec.unit ?? 'ft';
  }

  is2d(): boolean {
    return this.twoD;
  }

  isLoadDone(): boolean {
    return true;
  }
}

interface FakeNode {
  is2D(): boolean;
}

interface FakeDocument extends ViewingDocument {
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
  models: FakeModel[] = [];
  hidden = new Set<FakeModel>();
  unloaded: FakeModel[] = [];
  selections = new Map<FakeModel, number[]>();
  themed: { model: ViewerModel | undefined; dbId: number }[] = [];
  cleared: (ViewerModel | undefined)[] = [];
  fits = 0;
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

  fitToView(): void {
    this.fits += 1;
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

  setThemingColor(dbId: number, _color: unknown, model?: ViewerModel): void {
    this.themed.push({
      model: model === undefined ? this.models[0] : this.own(model),
      dbId,
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
  const node = (twoD: boolean): FakeNode => ({ is2D: () => twoD });
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
        const doc: FakeDocument = {
          urn,
          getRoot: () => ({
            getDefaultGeometry: () =>
              spec.noGeometry ? null : node(Boolean(spec.only2d)),
            search: (query) =>
              spec.noGeometry || (spec.only2d && query.role === '3d')
                ? []
                : [node(query.role === '2d')],
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
