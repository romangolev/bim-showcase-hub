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

export function mockRowVariant(urn: string): number {
  let hash = 0;
  for (const char of urn) hash = (hash * 31 + char.charCodeAt(0)) % 9973;
  return hash % 997;
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
  private selection = new Set<number>();
  private readonly nodes = new Map<number, SVGPolygonElement>();
  private readonly themed = new Map<number, Rgba>();
  private readonly listeners = new Set<(ids: number[]) => void>();
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
  private urn = '';

  constructor(private readonly container: HTMLElement) {
    this.build();
  }

  async load(urn: string): Promise<void> {
    if (this.destroyed) return;
    if (!urn) throw new Error('A model URN is required');
    this.unload();
    this.urn = urn;
    const elements = buildMockElements();
    this.renderScene(elements);
    this.loaded = true;
    if (this.status) this.status.textContent = 'Mock viewer, fixture model';
  }

  unload(): void {
    this.svg?.replaceChildren();
    this.nodes.clear();
    this.themed.clear();
    this.bounds = null;
    this.loaded = false;
    this.setSelection([]);
    this.controller?.clearPainted();
  }

  resize(): void {
    this.fit();
  }

  getSelection(): number[] {
    return [...this.selection];
  }

  clearSelection(): void {
    this.setSelection([]);
  }

  selectIds(ids: number[]): void {
    this.setSelection(ids.filter((id) => this.nodes.has(id)));
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
    if (this.root) this.root.dataset.viewerTheme = theme;
  }

  setThemingColor(ids: number[], color: Rgba): void {
    for (const id of ids) {
      const node = this.nodes.get(id);
      if (!node) continue;
      this.themed.set(id, color);
      node.style.fill = rgbaCss(color);
      node.classList.add('bsh-mock__el--themed');
    }
  }

  clearThemingColors(): void {
    for (const id of this.themed.keys()) {
      const node = this.nodes.get(id);
      node?.style.removeProperty('fill');
      node?.classList.remove('bsh-mock__el--themed');
    }
    this.themed.clear();
  }

  async getLeafProperties(propertyNames: string[]): Promise<PropertyRow[]> {
    if (!this.loaded) return [];
    return buildMockRows(
      propertyNames,
      import.meta.env.MODE === 'test'
        ? 0
        : LARGE_FIXTURE_ROWS + mockRowVariant(this.urn),
    );
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
    this.nodes.clear();
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
        if (tool.id === 'home') this.setSelection([]);
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
        iconSpan(swatchIconClass(swatch.icon)),
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

  private renderScene(elements: MockElement[]): void {
    const svg = this.svg;
    if (!svg) return;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
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
      svg.appendChild(polygon);
      this.nodes.set(element.dbId, polygon);
      for (const [x, y] of element.points) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
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

  private readonly onSceneClick = (event: MouseEvent): void => {
    const target = (event.target as Element | null)?.closest('[data-dbid]');
    const id = target ? Number((target as SVGElement).dataset.dbid) : null;
    if (id === null) {
      this.setSelection([]);
      return;
    }
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      const next = new Set(this.selection);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      this.setSelection([...next]);
      return;
    }
    this.setSelection([id]);
  };

  private setSelection(ids: number[]): void {
    const next = new Set(ids);
    const unchanged =
      next.size === this.selection.size &&
      [...next].every((id) => this.selection.has(id));
    if (unchanged) return;
    for (const id of this.selection) {
      this.nodes.get(id)?.classList.remove('bsh-mock__el--selected');
    }
    this.selection = next;
    for (const id of next) {
      this.nodes.get(id)?.classList.add('bsh-mock__el--selected');
    }
    const snapshot = [...next];
    for (const cb of this.listeners) cb([...snapshot]);
  }
}

export async function createMockViewerAdapter(
  container: HTMLElement,
): Promise<ViewerAdapter> {
  return new MockViewerAdapter(container);
}
