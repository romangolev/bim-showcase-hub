import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildToolGroupSpec } from '../extensions/viewerTools.js';
import {
  type AutodeskViewing,
  autodeskWindow,
  type ButtonStates,
  type ComboButton,
  type ControlButton,
  type ControlGroup,
  type GuiViewer3D,
  type InstanceTree,
  type Toolbar,
  type ViewerEvent,
  type ViewerExtension,
  type ViewerExtensionClass,
  type ViewerModel,
} from './autodesk.js';
import { RealViewerAdapter } from './RealViewerAdapter.js';
import type { ToolGroupSpec } from './ViewerAdapter.js';

const STATE: ButtonStates = { ACTIVE: 0, INACTIVE: 1, DISABLED: 2 };
const SELECTION_EVENT = 'selection-changed';

class FakeButton implements ControlButton {
  state = STATE.INACTIVE;
  tooltip = '';
  iconClass = '';
  onClick: (ev?: unknown) => void = () => {};

  constructor(readonly id: string) {}

  setToolTip(text: string): void {
    this.tooltip = text;
  }

  setIcon(iconClass: string): void {
    this.iconClass = iconClass;
  }

  setState(state: number): boolean {
    this.state = state;
    return true;
  }

  getState(): number {
    return this.state;
  }

  click(): void {
    if (this.state !== STATE.DISABLED) this.onClick();
  }
}

class FakeCombo extends FakeButton implements ComboButton {
  controls: FakeButton[] = [];

  addControl(control: ControlButton): void {
    this.controls.push(control as FakeButton);
  }

  removeControl(control: ControlButton): void {
    this.controls = this.controls.filter((c) => c !== control);
  }
}

class FakeGroup implements ControlGroup {
  controls: (FakeButton | FakeCombo)[] = [];

  constructor(readonly id: string) {}

  addControl(control: ControlButton | ComboButton): void {
    this.controls.push(control as FakeButton);
  }

  removeControl(control: ControlButton | ComboButton | string): void {
    this.controls = this.controls.filter(
      (c) => c !== control && c.id !== control,
    );
  }

  getNumberOfControls(): number {
    return this.controls.length;
  }
}

class FakeToolbar implements Toolbar {
  groups: FakeGroup[] = [];

  addControl(group: ControlGroup): void {
    this.groups.push(group as FakeGroup);
  }

  removeControl(group: ControlGroup | string): void {
    this.groups = this.groups.filter((g) => g !== group && g.id !== group);
  }

  getControl(id: string): ControlGroup | undefined {
    return this.groups.find((g) => g.id === id);
  }
}

class FakeExtension implements ViewerExtension {
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

const registry = new Map<string, ViewerExtensionClass>();
const registerSpy = vi.fn();
const viewers: FakeViewer[] = [];

class FakeViewer implements GuiViewer3D {
  toolbar = new FakeToolbar();
  model: ViewerModel = {
    getBulkProperties: (_ids, _opts, ok) => ok([]),
  };
  selection: number[] = [];
  resizeCalls = 0;
  themed: { id: number; color: unknown }[] = [];
  clearThemingCalls = 0;
  extensions = new Map<string, ViewerExtension>();
  private readonly listeners = new Map<
    string,
    Set<(ev: ViewerEvent) => void>
  >();

  constructor(readonly container: HTMLElement) {
    viewers.push(this);
  }

  start(): number | undefined {
    return 0;
  }

  setTheme(): void {}

  setBackgroundColor(): void {}

  resize(): void {
    this.resizeCalls += 1;
  }

  async loadDocumentNode(): Promise<ViewerModel> {
    return this.model;
  }

  async loadExtension(id: string, options?: unknown): Promise<unknown> {
    const Extension = registry.get(id);
    if (!Extension) throw new Error(`unknown extension ${id}`);
    const extension = new Extension(this, options);
    await extension.load();
    this.extensions.set(id, extension);
    return extension;
  }

  unloadExtension(id: string): boolean {
    const extension = this.extensions.get(id);
    if (!extension) return false;
    extension.unload();
    this.extensions.delete(id);
    return true;
  }

  getObjectTree(onSuccess: (tree: InstanceTree) => void): void {
    onSuccess({
      getRootId: () => 1,
      getChildCount: () => 0,
      enumNodeChildren: () => {},
    });
  }

  getSelection(): number[] {
    return this.selection;
  }

  clearSelection(): void {
    this.select([]);
  }

  setThemingColor(dbId: number, color: unknown): void {
    this.themed.push({ id: dbId, color });
  }

  clearThemingColors(): void {
    this.clearThemingCalls += 1;
  }

  addEventListener(type: string, cb: (ev: ViewerEvent) => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(cb);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, cb: (ev: ViewerEvent) => void): void {
    this.listeners.get(type)?.delete(cb);
  }

  tearDown(): void {
    for (const id of [...this.extensions.keys()]) this.unloadExtension(id);
  }

  finish(): void {}

  select(ids: number[]): void {
    this.selection = ids;
    for (const cb of this.listeners.get(SELECTION_EVENT) ?? []) {
      cb({ dbIdArray: ids });
    }
  }
}

function installFakeAutodesk(): void {
  registry.clear();
  registerSpy.mockClear();
  viewers.length = 0;
  const manager = {
    registerExtension: (id: string, extension: ViewerExtensionClass) => {
      registerSpy(id);
      registry.set(id, extension);
      return true;
    },
  };
  const viewing: AutodeskViewing = {
    Initializer: (_options, cb) => cb(),
    GuiViewer3D: FakeViewer,
    Document: {
      load: (_urn, onSuccess) =>
        onSuccess({ getRoot: () => ({ getDefaultGeometry: () => ({}) }) }),
    },
    Extension: FakeExtension,
    theExtensionManager: manager,
    UI: {
      ControlGroup: FakeGroup,
      Button: Object.assign(FakeButton, { State: STATE }),
      ComboButton: FakeCombo,
    },
    SELECTION_CHANGED_EVENT: SELECTION_EVENT,
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
}

let container: HTMLElement;
let adapter: RealViewerAdapter;

function sized(el: HTMLElement, width: number, height: number): void {
  Object.defineProperty(el, 'clientWidth', {
    configurable: true,
    value: width,
  });
  Object.defineProperty(el, 'clientHeight', {
    configurable: true,
    value: height,
  });
}

function makeAdapter(): RealViewerAdapter {
  container = document.createElement('div');
  document.body.appendChild(container);
  adapter = new RealViewerAdapter(container);
  return adapter;
}

function specWith(overrides: Partial<ToolGroupSpec['paint']> = {}) {
  const base = buildToolGroupSpec(adapter);
  return {
    ...base,
    paint: { ...base.paint, ...overrides },
  };
}

function currentGroup(viewer: FakeViewer): FakeGroup {
  const group = viewer.toolbar.groups[0];
  if (!group) throw new Error('tool group missing');
  return group;
}

function parts(viewer: FakeViewer) {
  const group = currentGroup(viewer);
  const combo = group.controls[0] as FakeCombo;
  const exportButton = group.controls[1] as FakeButton;
  const reset = combo.controls[combo.controls.length - 1] as FakeButton;
  const swatches = combo.controls.slice(0, -1) as FakeButton[];
  return { group, combo, exportButton, reset, swatches };
}

beforeEach(() => {
  installFakeAutodesk();
});

afterEach(() => {
  adapter?.destroy();
  container?.remove();
  autodeskWindow().Autodesk = undefined;
  autodeskWindow().THREE = undefined;
});

describe('RealViewerAdapter tool group extension', () => {
  it('registers an Autodesk extension and mounts one control group after the model loads', async () => {
    makeAdapter();
    adapter.registerToolGroup(buildToolGroupSpec(adapter));
    await adapter.load('dXJu');
    const viewer = viewers[0] as FakeViewer;
    expect(registerSpy).toHaveBeenCalledTimes(1);
    expect(registerSpy).toHaveBeenCalledWith('BimShowcaseHub.Tools');
    expect(viewer.extensions.has('BimShowcaseHub.Tools')).toBe(true);
    expect(viewer.toolbar.groups).toHaveLength(1);
    const { group, combo, exportButton, reset, swatches } = parts(viewer);
    expect(group.id).toBe('bim-showcase-hub-tools');
    expect(group.controls).toHaveLength(2);
    expect(combo).toBeInstanceOf(FakeCombo);
    expect(combo.tooltip).toBe('Paint selection');
    expect(combo.iconClass).toBe('bsh-ico-paint');
    expect(swatches.map((s) => s.tooltip)).toEqual([
      'Select elements to paint',
      'Select elements to paint',
      'Select elements to paint',
    ]);
    expect(swatches.map((s) => s.iconClass)).toEqual([
      'bsh-ico-paint-red',
      'bsh-ico-paint-green',
      'bsh-ico-paint-blue',
    ]);
    expect(reset.iconClass).toBe('bsh-ico-reset');
    expect(exportButton.tooltip).toBe('Export to Excel');
    expect(exportButton.iconClass).toBe('bsh-ico-export');
  });

  it('mounts immediately when registered after the model is loaded', async () => {
    makeAdapter();
    await adapter.load('dXJu');
    const viewer = viewers[0] as FakeViewer;
    expect(viewer.toolbar.groups).toHaveLength(0);
    adapter.registerToolGroup(buildToolGroupSpec(adapter));
    await vi.waitFor(() => expect(viewer.toolbar.groups).toHaveLength(1));
  });

  it('registers the extension class once across adapters', async () => {
    makeAdapter();
    adapter.registerToolGroup(buildToolGroupSpec(adapter));
    await adapter.load('dXJu');
    const second = new RealViewerAdapter(document.createElement('div'));
    second.registerToolGroup(buildToolGroupSpec(second));
    await second.load('dXJu');
    expect(registerSpy).toHaveBeenCalledTimes(1);
    expect(viewers[1]?.toolbar.groups).toHaveLength(1);
    second.destroy();
  });

  it('keeps swatches disabled until the selection is non-empty and enables reset after painting', async () => {
    makeAdapter();
    const onReset = vi.fn();
    adapter.registerToolGroup(specWith({ onReset }));
    await adapter.load('dXJu');
    const viewer = viewers[0] as FakeViewer;
    const { reset, swatches } = parts(viewer);
    for (const swatch of swatches) expect(swatch.state).toBe(STATE.DISABLED);
    expect(reset.state).toBe(STATE.DISABLED);
    expect(reset.tooltip).toBe('Nothing painted yet');

    swatches[0]?.click();
    expect(viewer.themed).toHaveLength(0);

    viewer.select([11, 12]);
    for (const swatch of swatches) expect(swatch.state).toBe(STATE.INACTIVE);
    expect(swatches[0]?.tooltip).toBe('Paint selected items in red');

    swatches[0]?.click();
    expect(viewer.themed.map((t) => t.id)).toEqual([11, 12]);
    expect(viewer.selection).toEqual([]);
    for (const swatch of swatches) expect(swatch.state).toBe(STATE.DISABLED);
    expect(reset.state).toBe(STATE.INACTIVE);
    expect(reset.tooltip).toBe('Reset appearance');

    reset.click();
    expect(viewer.clearThemingCalls).toBe(0);
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(reset.state).toBe(STATE.DISABLED);
  });

  it('resets through the adapter and invokes export from the toolbar button', async () => {
    makeAdapter();
    const onExport = vi.fn();
    const base = buildToolGroupSpec(adapter);
    adapter.registerToolGroup({
      ...base,
      export: { ...base.export, onExport },
    });
    await adapter.load('dXJu');
    const viewer = viewers[0] as FakeViewer;
    const { exportButton, reset, swatches } = parts(viewer);
    viewer.select([5]);
    swatches[1]?.click();
    reset.click();
    expect(viewer.clearThemingCalls).toBe(1);
    exportButton.click();
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it('unloads cleanly when the registration is disposed', async () => {
    makeAdapter();
    const dispose = adapter.registerToolGroup(buildToolGroupSpec(adapter));
    await adapter.load('dXJu');
    const viewer = viewers[0] as FakeViewer;
    expect(viewer.toolbar.groups).toHaveLength(1);
    dispose();
    expect(viewer.extensions.size).toBe(0);
    expect(viewer.toolbar.groups).toHaveLength(0);
    viewer.select([1]);
  });

  it('removes the group when the adapter is destroyed', async () => {
    makeAdapter();
    adapter.registerToolGroup(buildToolGroupSpec(adapter));
    await adapter.load('dXJu');
    const viewer = viewers[0] as FakeViewer;
    adapter.destroy();
    expect(viewer.extensions.size).toBe(0);
    expect(viewer.toolbar.groups).toHaveLength(0);
  });

  it('resizes the viewer only when the container has a size', async () => {
    makeAdapter();
    await adapter.load('dXJu');
    const viewer = viewers[0] as FakeViewer;
    sized(container, 0, 0);
    const before = viewer.resizeCalls;
    adapter.resize();
    expect(viewer.resizeCalls).toBe(before);
    sized(container, 800, 600);
    adapter.resize();
    expect(viewer.resizeCalls).toBe(before + 1);
  });

  it('ignores resize before a viewer exists', () => {
    makeAdapter();
    expect(() => adapter.resize()).not.toThrow();
  });

  it('disables the swatches again after the model is replaced', async () => {
    makeAdapter();
    adapter.registerToolGroup(buildToolGroupSpec(adapter));
    await adapter.load('dXJu');
    const first = viewers[0] as FakeViewer;
    first.select([11]);
    for (const swatch of parts(first).swatches) {
      expect(swatch.state).toBe(STATE.INACTIVE);
    }
    await adapter.load('dXJu');
    const second = viewers[1] as FakeViewer;
    for (const swatch of parts(second).swatches) {
      expect(swatch.state).toBe(STATE.DISABLED);
    }
  });
});

describe('RealViewerAdapter initialization', () => {
  const EU_URN = btoa('urn:adsk.wipemea:fs.file:vf.x').replace(/=+$/, '');

  function spyOnInitializer() {
    const viewing = autodeskWindow().Autodesk?.Viewing;
    if (!viewing) throw new Error('fake viewing missing');
    const initializer = vi.fn((_options: unknown, cb: () => void) => {
      setTimeout(cb, 0);
    });
    viewing.Initializer = initializer;
    return initializer;
  }

  it('runs the initializer once for concurrent loads', async () => {
    const initializer = spyOnInitializer();
    const other = new RealViewerAdapter(document.createElement('div'));
    makeAdapter();
    await Promise.all([adapter.load('dXJu'), other.load('dXJu')]);
    expect(initializer).toHaveBeenCalledTimes(1);
    other.destroy();
  });

  it('refuses a model from another region instead of re-initializing', async () => {
    const initializer = spyOnInitializer();
    makeAdapter();
    await adapter.load('dXJu');
    await expect(adapter.load(EU_URN)).rejects.toThrow(/another region/);
    expect(initializer).toHaveBeenCalledTimes(1);
  });
});
