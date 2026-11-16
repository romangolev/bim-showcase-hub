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
import {
  RealViewerAdapter,
  SCREEN_MODE_SETTLE_MS,
} from './RealViewerAdapter.js';
import { resetRegion } from './region.js';
import type { ToolGroupSpec } from './ViewerAdapter.js';

const STATE: ButtonStates = { ACTIVE: 0, INACTIVE: 1, DISABLED: 2 };
const SELECTION_EVENT = 'selection-changed';
const SCREEN_MODE_EVENT = 'fullScreenMode';

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
const mainLoop: FakeViewer[] = [];
const startPlan: { code?: number; error?: Error } = {};

class FakeViewer implements GuiViewer3D {
  toolbar = new FakeToolbar();
  model: ViewerModel = {
    getBulkProperties: (_ids, _opts, ok) => ok([]),
  };
  selection: number[] = [];
  resizeCalls = 0;
  canvas?: HTMLCanvasElement;
  impl?: { resize?(width: number, height: number): void };
  themed: { id: number; color: unknown }[] = [];
  clearThemingCalls = 0;
  extensions = new Map<string, ViewerExtension>();
  private readonly listeners = new Map<
    string,
    Set<(ev: ViewerEvent) => void>
  >();

  constructor(public container: HTMLElement) {
    viewers.push(this);
  }

  finishCalls = 0;

  start(): number | undefined {
    if (startPlan.error) throw startPlan.error;
    if (startPlan.code) return startPlan.code;
    mainLoop.push(this);
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

  finish(): void {
    this.finishCalls += 1;
    mainLoop.splice(mainLoop.indexOf(this), 1);
  }

  select(ids: number[]): void {
    this.selection = ids;
    for (const cb of this.listeners.get(SELECTION_EVENT) ?? []) {
      cb({ dbIdArray: ids });
    }
  }

  emit(type: string): void {
    for (const cb of this.listeners.get(type) ?? []) cb({});
  }
}

function installFakeAutodesk(): void {
  registry.clear();
  registerSpy.mockClear();
  viewers.length = 0;
  mainLoop.length = 0;
  delete startPlan.code;
  delete startPlan.error;
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
    FULLSCREEN_MODE_EVENT: SCREEN_MODE_EVENT,
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

let fullscreenElement: Element | null = null;

function setFullscreenElement(el: Element | null): void {
  fullscreenElement = el;
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => fullscreenElement,
  });
}

function makeAdapter(): RealViewerAdapter {
  container = document.createElement('div');
  document.body.appendChild(container);
  adapter = new RealViewerAdapter(container);
  return adapter;
}

function fullSpec() {
  const base = buildToolGroupSpec(adapter);
  if (!base.paint || !base.export) throw new Error('tool spec incomplete');
  return { ...base, paint: base.paint, export: base.export };
}

function specWith(
  overrides: Partial<NonNullable<ToolGroupSpec['paint']>> = {},
) {
  const base = fullSpec();
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
  resetRegion();
  installFakeAutodesk();
});

afterEach(() => {
  setFullscreenElement(null);
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
    const base = fullSpec();
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

  it('clears fixed pixel sizes on the viewer element before resizing', async () => {
    makeAdapter();
    await adapter.load('dXJu');
    const viewer = viewers[0] as FakeViewer;
    const inner = document.createElement('div');
    inner.className = 'adsk-viewing-viewer';
    inner.style.width = '663px';
    inner.style.height = '569px';
    container.appendChild(inner);
    sized(container, 900, 569);
    adapter.resize();
    expect(inner.style.width).toBe('');
    expect(inner.style.height).toBe('');
    expect(viewer.resizeCalls).toBeGreaterThan(0);
  });

  it('forces the render canvas to the container size when viewer.resize leaves it stale', async () => {
    makeAdapter();
    await adapter.load('dXJu');
    const viewer = viewers[0] as FakeViewer;
    const canvas = document.createElement('canvas');
    sized(canvas, 663, 569);
    viewer.canvas = canvas;
    viewer.impl = { resize: vi.fn() };
    sized(container, 900, 569);
    adapter.resize();
    expect(viewer.impl.resize).toHaveBeenCalledWith(900, 569);
  });

  it('does not force the canvas when it already matches the container', async () => {
    makeAdapter();
    await adapter.load('dXJu');
    const viewer = viewers[0] as FakeViewer;
    const canvas = document.createElement('canvas');
    sized(canvas, 900, 569);
    viewer.canvas = canvas;
    viewer.impl = { resize: vi.fn() };
    sized(container, 900, 569);
    adapter.resize();
    expect(viewer.impl.resize).not.toHaveBeenCalled();
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

describe('RealViewerAdapter fullscreen', () => {
  async function loadWithFrame() {
    makeAdapter();
    await adapter.load('dXJu');
    const viewer = viewers[0] as FakeViewer;
    const frame = document.createElement('div');
    frame.className = 'adsk-viewing-viewer';
    container.appendChild(frame);
    viewer.container = frame;
    const canvas = document.createElement('canvas');
    viewer.canvas = canvas;
    const implResize = vi.fn();
    viewer.impl = { resize: implResize };
    sized(container, 800, 600);
    sized(frame, 800, 600);
    return { viewer, frame, canvas, implResize };
  }

  it('keeps the canvas at the fullscreen size instead of forcing it back to the host size', async () => {
    const { frame, canvas, implResize } = await loadWithFrame();
    setFullscreenElement(frame);
    sized(frame, 1440, 900);
    sized(canvas, 1440, 900);
    adapter.resize();
    expect(implResize).not.toHaveBeenCalled();
  });

  it('forces a stale canvas to the fullscreen element size', async () => {
    const { frame, canvas, implResize } = await loadWithFrame();
    setFullscreenElement(frame);
    sized(frame, 1440, 900);
    sized(canvas, 800, 600);
    adapter.resize();
    expect(implResize).toHaveBeenCalledWith(1440, 900);
  });

  it('measures the host again once fullscreen ends', async () => {
    const { frame, canvas, implResize } = await loadWithFrame();
    setFullscreenElement(null);
    sized(frame, 1440, 900);
    sized(canvas, 1440, 900);
    adapter.resize();
    expect(implResize).toHaveBeenCalledWith(800, 600);
  });

  it('ignores a fullscreen element outside the viewer host', async () => {
    const { canvas, implResize } = await loadWithFrame();
    const other = document.createElement('div');
    document.body.appendChild(other);
    sized(other, 1440, 900);
    setFullscreenElement(other);
    sized(canvas, 800, 600);
    adapter.resize();
    expect(implResize).not.toHaveBeenCalled();
    other.remove();
  });

  it.each(['fullscreenchange', 'webkitfullscreenchange'])(
    'resizes on %s when entering and leaving fullscreen',
    async (type) => {
      const { viewer, frame, canvas, implResize } = await loadWithFrame();
      setFullscreenElement(frame);
      sized(frame, 1440, 900);
      sized(canvas, 800, 600);
      const before = viewer.resizeCalls;
      document.dispatchEvent(new Event(type));
      expect(viewer.resizeCalls).toBe(before + 1);
      expect(implResize).toHaveBeenLastCalledWith(1440, 900);
      setFullscreenElement(null);
      sized(canvas, 1440, 900);
      document.dispatchEvent(new Event(type));
      expect(viewer.resizeCalls).toBe(before + 2);
      expect(implResize).toHaveBeenLastCalledWith(800, 600);
    },
  );

  it('resizes again after the screen mode change has settled', async () => {
    const { viewer } = await loadWithFrame();
    vi.useFakeTimers();
    try {
      viewer.emit(SCREEN_MODE_EVENT);
      const before = viewer.resizeCalls;
      vi.advanceTimersByTime(SCREEN_MODE_SETTLE_MS);
      expect(viewer.resizeCalls).toBeGreaterThan(before);
    } finally {
      vi.useRealTimers();
    }
  });

  it('coalesces layout and screen mode resizes into one scheduler', async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const { viewer } = await loadWithFrame();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      for (const pending of frames.splice(0)) pending(0);
      vi.runOnlyPendingTimers();
      const before = viewer.resizeCalls;
      adapter.scheduleResize(250);
      viewer.emit(SCREEN_MODE_EVENT);
      adapter.scheduleResize(250);
      expect(frames).toHaveLength(1);
      frames[0]?.(0);
      expect(viewer.resizeCalls).toBe(before + 1);
      vi.advanceTimersByTime(SCREEN_MODE_SETTLE_MS);
      expect(viewer.resizeCalls).toBe(before + 2);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('drops the fill-browser class and resizes when the fullscreen request fails', async () => {
    const { viewer, frame } = await loadWithFrame();
    frame.classList.add('viewer-fill-browser');
    const before = viewer.resizeCalls;
    document.dispatchEvent(new Event('fullscreenerror'));
    expect(frame.classList.contains('viewer-fill-browser')).toBe(false);
    expect(viewer.resizeCalls).toBe(before + 1);
  });

  it('stops listening for fullscreen changes after unload', async () => {
    const { viewer } = await loadWithFrame();
    adapter.unload();
    const before = viewer.resizeCalls;
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(viewer.resizeCalls).toBe(before);
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
    await expect(adapter.load(EU_URN)).rejects.toThrow(
      'This model is in the EU region',
    );
    expect(initializer).toHaveBeenCalledTimes(1);
  });
});

describe('RealViewerAdapter with several viewers', () => {
  function second(): RealViewerAdapter {
    const host = document.createElement('div');
    document.body.appendChild(host);
    return new RealViewerAdapter(host);
  }

  it('never unregisters another viewer when start fails', async () => {
    const healthy = second();
    await healthy.load('urn-b');
    const failing = makeAdapter();
    startPlan.code = 5;
    await expect(failing.load('urn-a')).rejects.toThrow('failed to start');
    failing.destroy();
    failing.destroy();
    expect(mainLoop).toEqual([viewers[0]]);
    expect(viewers[1]?.finishCalls).toBe(0);
    healthy.destroy();
    expect(mainLoop).toEqual([]);
  });

  it('never unregisters another viewer when start throws', async () => {
    const healthy = second();
    await healthy.load('urn-b');
    const failing = makeAdapter();
    startPlan.error = new Error('no webgl');
    await expect(failing.load('urn-a')).rejects.toThrow('no webgl');
    failing.destroy();
    expect(mainLoop).toEqual([viewers[0]]);
  });

  it('finishes a started viewer exactly once', async () => {
    const one = makeAdapter();
    await one.load('urn-a');
    const viewer = viewers[0];
    one.unload();
    one.unload();
    one.destroy();
    expect(viewer?.finishCalls).toBe(1);
  });

  it('keeps the other viewer when one model fails to load', async () => {
    const healthy = second();
    await healthy.load('urn-b');
    const viewing = autodeskWindow().Autodesk?.Viewing;
    if (!viewing) throw new Error('viewing missing');
    viewing.Document.load = (_urn, _ok, onError) => onError?.(4, 'missing');
    const failing = makeAdapter();
    await expect(failing.load('urn-a')).rejects.toThrow('Document load failed');
    failing.destroy();
    expect(mainLoop).toEqual([viewers[0]]);
    expect(viewers[0]?.finishCalls).toBe(0);
  });

  it('keeps an exception in a selection listener out of the viewer', async () => {
    const one = makeAdapter();
    await one.load('urn-a');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const later = vi.fn();
    one.onSelectionChange(() => {
      throw new Error('listener broke');
    });
    one.onSelectionChange(later);
    expect(() => viewers[0]?.select([7])).not.toThrow();
    expect(later).toHaveBeenCalledWith([{ modelId: 'urn-a', dbId: 7 }]);
    expect(error).toHaveBeenCalled();
  });
});
