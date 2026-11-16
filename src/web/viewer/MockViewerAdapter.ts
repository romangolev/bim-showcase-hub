import type { PropertyRow } from '../../shared/types.js';
import type { Theme } from '../theme/theme.js';
import {
  EXPORT_ICON_CLASS,
  PAINT_ICON_CLASS,
  RESET_ICON_CLASS,
  swatchIconClass,
} from './autodeskTools.js';
import {
  buildMockElements,
  buildMockRows,
  LARGE_FIXTURE_ROWS,
  type MockElement,
  type Point,
} from './mockModel.js';
import { tagRows } from './modelScope.js';
import {
  checkCapacity,
  loadFailureMessage,
  type ModelDbId,
  type ModelInfo,
  ModelSet,
  ModelSetError,
  type ModelSource,
  modelIdFor,
  uniqueSources,
} from './modelSet.js';
import {
  ToolGroupController,
  type ToolGroupState,
} from './toolGroupController.js';
import type { Rgba, ToolGroupSpec, ViewerAdapter } from './ViewerAdapter.js';
import './viewer.css';

const SVG_NS = 'http://www.w3.org/2000/svg';

const FAKE_TOOLS: { id: string; label: string; icon: string }[] = [
  {
    id: 'home',
    label: 'Home',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  },
  {
    id: 'orbit',
    label: 'Orbit',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18"><ellipse cx="12" cy="12" rx="9" ry="4" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>',
  },
  {
    id: 'measure',
    label: 'Measure',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 15l12-12 6 6-12 12z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  },
];

function pointsAttr(points: Point[]): string {
  return points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
}

interface MockToolGroup {
  element: HTMLElement;
  dispose: () => void;
}

function iconSpan(iconClass: string): string {
  return `<span class="bsh-mock__icon ${iconClass}" aria-hidden="true"></span>`;
}

function setDisabled(
  button: HTMLButtonElement,
  disabled: boolean,
  tooltip: string,
): void {
  button.title = tooltip;
  if (disabled) button.setAttribute('aria-disabled', 'true');
  else button.removeAttribute('aria-disabled');
}

export const MOCK_BROKEN_MARKER = 'broken';
export const MOCK_LOAD_ERROR = 'Mock model failed to load';
export const MOCK_NO_PROPERTIES_MARKER = 'noprops';
export const MOCK_PROPERTIES_ERROR = 'Properties could not be read: mock';
const MODEL_GAP = 48;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface MockScene {
  group: SVGGElement;
  nodes: Map<number, SVGPolygonElement>;
  box: Box;
}

function selectionKey(modelId: string, dbId: number): string {
  return `${dbId}\u0000${modelId}`;
}

function parseKey(key: string): ModelDbId {
  const split = key.indexOf('\u0000');
  return { dbId: Number(key.slice(0, split)), modelId: key.slice(split + 1) };
}

function boxOf(elements: readonly MockElement[]): Box {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const element of elements) {
    for (const [x, y] of element.points) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function statusText(ready: number): string {
  if (ready > 1) return `Mock viewer, ${ready} models`;
  if (ready === 1) return 'Mock viewer, fixture model';
  return 'Mock viewer';
}

function rgbaCss([r, g, b, a]: Rgba): string {
  const to = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);
  return `rgba(${to(r)}, ${to(g)}, ${to(b)}, ${a})`;
}

export class MockViewerAdapter implements ViewerAdapter {
  private root: HTMLDivElement | null = null;
  private svg: SVGSVGElement | null = null;
  private toolbar: HTMLDivElement | null = null;
  private status: HTMLDivElement | null = null;
  private selection = new Set<string>();
  private readonly models = new ModelSet<MockScene>();
  private readonly themed = new Map<string, Rgba>();
  private readonly listeners = new Set<(ids: number[]) => void>();
  private placed = 0;
  private bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null = null;
  private controller: ToolGroupController | null = null;
  private disposeGroup: (() => void) | null = null;
  private theme: Theme = 'dark';
  private loaded = false;
  private destroyed = false;

  constructor(private readonly container: HTMLElement) {
    this.build();
  }

  async load(urn: string): Promise<void> {
    await this.loadModels([{ urn }]);
  }

  async loadModels(sources: readonly ModelSource[]): Promise<ModelInfo[]> {
    if (this.destroyed) return [];
    const unique = uniqueSources(sources);
    checkCapacity(0, unique.length);
    this.unload();
    for (const source of unique) this.models.add(source);
    for (const source of unique) this.loadOne(source);
    const models = this.models.list();
    if (!models.some((model) => model.status === 'ready')) {
      throw new Error(loadFailureMessage(models));
    }
    return models;
  }

  async addModel(source: ModelSource): Promise<ModelInfo> {
    if (this.destroyed) {
      throw new ModelSetError('empty', 'The viewer is closed');
    }
    const info = this.models.add(source);
    this.loadOne(source);
    return this.models.get(info.id) ?? info;
  }

  removeModel(modelId: string): void {
    const removed = this.models.remove(modelId);
    if (!removed) return;
    removed.handle?.group.remove();
    this.forgetModel(modelId);
    this.refresh();
  }

  getModels(): ModelInfo[] {
    return this.models.list();
  }

  setModelVisible(modelId: string, visible: boolean): void {
    if (!this.models.setVisible(modelId, visible)) return;
    const scene = this.models.handle(modelId);
    if (!scene) return;
    if (visible) {
      scene.group.removeAttribute('display');
    } else {
      scene.group.setAttribute('display', 'none');
      this.dropSelectionOf(modelId);
    }
    this.refresh();
  }

  onModelsChange(cb: (models: ModelInfo[]) => void): () => void {
    return this.models.onChange(cb);
  }

  getModelSelection(): ModelDbId[] {
    return [...this.selection].map(parseKey);
  }

  selectModelIds(items: readonly ModelDbId[]): void {
    this.setSelectionKeys(
      items
        .filter((item) => this.nodeOf(item.modelId, item.dbId))
        .map((item) => selectionKey(item.modelId, item.dbId)),
    );
  }

  setModelThemingColor(items: readonly ModelDbId[], color: Rgba): void {
    for (const { modelId, dbId } of items) {
      const node = this.nodeOf(modelId, dbId);
      if (!node) continue;
      this.themed.set(selectionKey(modelId, dbId), color);
      node.style.fill = rgbaCss(color);
      node.classList.add('bsh-mock__el--themed');
    }
  }

  unload(): void {
    for (const scene of this.models.clear()) scene.group.remove();
    this.svg?.replaceChildren();
    this.themed.clear();
    this.bounds = null;
    this.loaded = false;
    this.placed = 0;
    this.setSelectionKeys([]);
    this.controller?.clearPainted();
    this.refresh();
  }

  resize(): void {
    this.fit();
  }

  getSelection(): number[] {
    return this.getModelSelection().map((item) => item.dbId);
  }

  clearSelection(): void {
    this.setSelectionKeys([]);
  }

  selectIds(ids: number[]): void {
    const primary = this.models.primaryId();
    if (!primary) return;
    this.selectModelIds(ids.map((dbId) => ({ modelId: primary, dbId })));
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
    if (this.root) this.root.dataset.viewerTheme = theme;
  }

  setThemingColor(ids: number[], color: Rgba): void {
    const primary = this.models.primaryId();
    if (!primary) return;
    this.setModelThemingColor(
      ids.map((dbId) => ({ modelId: primary, dbId })),
      color,
    );
  }

  clearThemingColors(): void {
    for (const key of this.themed.keys()) {
      const { modelId, dbId } = parseKey(key);
      const node = this.nodeOf(modelId, dbId);
      node?.style.removeProperty('fill');
      node?.classList.remove('bsh-mock__el--themed');
    }
    this.themed.clear();
  }

  async getLeafProperties(propertyNames: string[]): Promise<PropertyRow[]> {
    if (!this.loaded) return [];
    const bulk = import.meta.env.MODE === 'test' ? 0 : LARGE_FIXTURE_ROWS;
    const rows: PropertyRow[] = [];
    let failed = false;
    for (const { info } of this.models.shown()) {
      if (info.urn.includes(MOCK_NO_PROPERTIES_MARKER)) {
        failed = true;
        this.models.setPropertiesError(info.id, MOCK_PROPERTIES_ERROR);
        continue;
      }
      this.models.setPropertiesError(info.id);
      rows.push(...tagRows(buildMockRows(propertyNames, bulk), info));
    }
    if (failed && rows.length === 0) throw new Error(MOCK_PROPERTIES_ERROR);
    return rows;
  }

  registerToolGroup(spec: ToolGroupSpec): () => void {
    const toolbar = this.toolbar;
    if (!toolbar || this.destroyed) return () => {};
    this.disposeGroup?.();
    this.controller?.dispose();
    const controller = new ToolGroupController(spec, this);
    const group = this.buildToolGroup(controller);
    toolbar.appendChild(group.element);
    this.controller = controller;
    this.disposeGroup = group.dispose;
    return () => {
      if (this.controller !== controller) return;
      group.dispose();
      controller.dispose();
      this.controller = null;
      this.disposeGroup = null;
    };
  }

  onSelectionChange(cb: (ids: number[]) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.listeners.clear();
    this.models.clear();
    this.models.dispose();
    this.themed.clear();
    this.disposeGroup?.();
    this.disposeGroup = null;
    this.controller?.dispose();
    this.controller = null;
    this.selection.clear();
    this.root?.remove();
    this.root = null;
    this.svg = null;
    this.toolbar = null;
    this.status = null;
  }

  private build(): void {
    const root = document.createElement('div');
    root.className = 'bsh-mock';
    root.dataset.testid = 'mock-viewer';
    root.dataset.viewerTheme = this.theme;

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'bsh-mock__scene');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Mock building model');
    svg.addEventListener('click', this.onSceneClick);

    const status = document.createElement('div');
    status.className = 'bsh-mock__status';
    status.textContent = 'Mock viewer';

    const toolbar = document.createElement('div');
    toolbar.className = 'bsh-mock__toolbar';
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Viewer toolbar');
    for (const tool of FAKE_TOOLS) {
      const button = this.createToolbarButton(tool.id, tool.label, tool.icon);
      button.addEventListener('click', () => {
        if (tool.id === 'home') this.setSelectionKeys([]);
      });
      toolbar.appendChild(button);
    }
    root.append(svg, status, toolbar);
    this.container.appendChild(root);
    this.root = root;
    this.svg = svg;
    this.status = status;
    this.toolbar = toolbar;
  }

  private createToolbarButton(
    id: string,
    tooltip: string,
    icon: string,
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'bsh-mock__button';
    button.dataset.buttonId = id;
    button.title = tooltip;
    button.setAttribute('aria-label', tooltip);
    button.innerHTML = icon;
    return button;
  }

  private buildToolGroup(controller: ToolGroupController): MockToolGroup {
    const { spec } = controller;
    const group = document.createElement('div');
    group.className = 'bsh-mock__group';
    group.dataset.groupId = spec.id;
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', spec.title);

    const separator = document.createElement('span');
    separator.className = 'bsh-mock__separator';

    const combo = document.createElement('div');
    combo.className = 'bsh-mock__combo';
    const trigger = this.createToolbarButton(
      spec.paint.id,
      spec.paint.tooltip,
      iconSpan(PAINT_ICON_CLASS),
    );
    trigger.setAttribute('aria-haspopup', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    const flyout = document.createElement('div');
    flyout.className = 'bsh-mock__flyout';
    flyout.hidden = true;
    flyout.setAttribute('role', 'group');
    flyout.setAttribute('aria-label', spec.paint.tooltip);

    const swatches = spec.paint.swatches.map((swatch) => {
      const button = this.createToolbarButton(
        swatch.id,
        swatch.label,
        iconSpan(swatchIconClass(swatch.id)),
      );
      button.addEventListener('click', () => {
        if (!controller.state.hasSelection) return;
        controller.paint(swatch.color);
        setOpen(false);
      });
      flyout.appendChild(button);
      return { swatch, button };
    });
    const reset = this.createToolbarButton(
      spec.paint.reset.id,
      spec.paint.reset.label,
      iconSpan(RESET_ICON_CLASS),
    );
    reset.addEventListener('click', () => {
      if (!controller.state.painted) return;
      controller.reset();
      setOpen(false);
    });
    flyout.appendChild(reset);
    combo.append(trigger, flyout);

    const exportButton = this.createToolbarButton(
      spec.export.id,
      spec.export.tooltip,
      iconSpan(EXPORT_ICON_CLASS),
    );
    exportButton.addEventListener('click', () => controller.export());

    const onOutside = (event: Event) => {
      if (!combo.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      trigger.focus();
    };
    const setOpen = (open: boolean) => {
      flyout.hidden = !open;
      trigger.setAttribute('aria-expanded', String(open));
      if (open) {
        document.addEventListener('pointerdown', onOutside);
        document.addEventListener('keydown', onKey);
      } else {
        document.removeEventListener('pointerdown', onOutside);
        document.removeEventListener('keydown', onKey);
      }
    };
    trigger.addEventListener('click', () => setOpen(Boolean(flyout.hidden)));

    const apply = (state: ToolGroupState) => {
      for (const { swatch, button } of swatches) {
        setDisabled(
          button,
          !state.hasSelection,
          state.hasSelection ? swatch.label : spec.paint.selectHint,
        );
      }
      setDisabled(
        reset,
        !state.painted,
        state.painted ? spec.paint.reset.label : spec.paint.resetHint,
      );
    };
    apply(controller.state);
    const stop = controller.subscribe(apply);
    group.append(separator, combo, exportButton);
    return {
      element: group,
      dispose: () => {
        stop();
        setOpen(false);
        group.remove();
      },
    };
  }

  private fit(): void {
    const svg = this.svg;
    const bounds = this.bounds;
    if (!svg || !bounds) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;
    const aspect = width / height;
    let viewWidth = bounds.width;
    let viewHeight = bounds.height;
    if (viewWidth / viewHeight < aspect) viewWidth = viewHeight * aspect;
    else viewHeight = viewWidth / aspect;
    const x = bounds.x + (bounds.width - viewWidth) / 2;
    const y = bounds.y + (bounds.height - viewHeight) / 2;
    svg.setAttribute('viewBox', `${x} ${y} ${viewWidth} ${viewHeight}`);
    svg.dataset.fitWidth = String(width);
    svg.dataset.fitHeight = String(height);
  }

  private loadOne(source: ModelSource): void {
    const id = modelIdFor(source.urn);
    if (source.urn.includes(MOCK_BROKEN_MARKER)) {
      this.models.fail(id, MOCK_LOAD_ERROR);
      return;
    }
    const scene = this.renderModel(id, buildMockElements());
    if (!scene) return;
    if (!this.models.resolve(id, scene)) {
      scene.group.remove();
      return;
    }
    if (!this.models.get(id)?.visible) {
      scene.group.setAttribute('display', 'none');
    }
    this.refresh();
  }

  private renderModel(
    modelId: string,
    elements: MockElement[],
  ): MockScene | null {
    const svg = this.svg;
    if (!svg) return null;
    const box = boxOf(elements);
    const shift = this.placed * (box.width + MODEL_GAP);
    this.placed += 1;
    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('class', 'bsh-mock__model');
    group.dataset.modelId = modelId;
    if (shift) group.setAttribute('transform', `translate(${shift} 0)`);
    const nodes = new Map<number, SVGPolygonElement>();
    for (const element of elements) {
      const polygon = document.createElementNS(SVG_NS, 'polygon');
      polygon.setAttribute('points', pointsAttr(element.points));
      polygon.setAttribute(
        'class',
        `bsh-mock__el bsh-mock__el--${element.category.toLowerCase()}`,
      );
      polygon.dataset.dbid = String(element.dbId);
      const title = document.createElementNS(SVG_NS, 'title');
      title.textContent = `${element.category}: ${element.name} (${element.level})`;
      polygon.appendChild(title);
      group.appendChild(polygon);
      nodes.set(element.dbId, polygon);
    }
    svg.appendChild(group);
    return { group, nodes, box: { ...box, x: box.x + shift } };
  }

  private refresh(): void {
    const ready = this.models.ready();
    this.loaded = ready.length > 0;
    if (this.status) this.status.textContent = statusText(ready.length);
    const visible = ready.filter(({ info }) => info.visible);
    const svg = this.svg;
    if (!svg || visible.length === 0) {
      this.bounds = null;
      return;
    }
    const boxes = visible.map(({ handle }) => handle.box);
    const minX = Math.min(...boxes.map((b) => b.x));
    const minY = Math.min(...boxes.map((b) => b.y));
    const maxX = Math.max(...boxes.map((b) => b.x + b.width));
    const maxY = Math.max(...boxes.map((b) => b.y + b.height));
    const pad = 24;
    this.bounds = {
      x: minX - pad,
      y: minY - pad,
      width: maxX - minX + pad * 2,
      height: maxY - minY + pad * 2,
    };
    svg.setAttribute(
      'viewBox',
      `${this.bounds.x} ${this.bounds.y} ${this.bounds.width} ${this.bounds.height}`,
    );
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    this.fit();
  }

  private nodeOf(modelId: string, dbId: number): SVGPolygonElement | undefined {
    return this.models.handle(modelId)?.nodes.get(dbId);
  }

  private dropSelectionOf(modelId: string): void {
    this.setSelectionKeys(
      [...this.selection].filter((key) => parseKey(key).modelId !== modelId),
    );
  }

  private forgetModel(modelId: string): void {
    for (const key of [...this.themed.keys()]) {
      if (parseKey(key).modelId === modelId) this.themed.delete(key);
    }
    this.dropSelectionOf(modelId);
  }

  private readonly onSceneClick = (event: MouseEvent): void => {
    const target = (event.target as Element | null)?.closest<SVGElement>(
      '[data-dbid]',
    );
    const modelId =
      target?.closest<SVGElement>('[data-model-id]')?.dataset.modelId;
    if (!target || modelId === undefined) {
      this.setSelectionKeys([]);
      return;
    }
    const key = selectionKey(modelId, Number(target.dataset.dbid));
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      const next = new Set(this.selection);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      this.setSelectionKeys([...next]);
      return;
    }
    this.setSelectionKeys([key]);
  };

  private setSelectionKeys(keys: string[]): void {
    const next = new Set(keys);
    const unchanged =
      next.size === this.selection.size &&
      [...next].every((key) => this.selection.has(key));
    if (unchanged) return;
    for (const key of this.selection) {
      const { modelId, dbId } = parseKey(key);
      this.nodeOf(modelId, dbId)?.classList.remove('bsh-mock__el--selected');
    }
    this.selection = next;
    for (const key of next) {
      const { modelId, dbId } = parseKey(key);
      this.nodeOf(modelId, dbId)?.classList.add('bsh-mock__el--selected');
    }
    const ids = this.getSelection();
    for (const cb of [...this.listeners]) {
      try {
        cb([...ids]);
      } catch (err) {
        console.error(err);
      }
    }
  }
}

export async function createMockViewerAdapter(
  container: HTMLElement,
): Promise<ViewerAdapter> {
  return new MockViewerAdapter(container);
}
