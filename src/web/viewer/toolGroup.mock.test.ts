import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExportStatus } from '../extensions/excelExport.js';
import { buildToolGroupSpec } from '../extensions/viewerTools.js';
import { MockViewerAdapter } from './MockViewerAdapter.js';
import { buildMockElements } from './mockModel.js';

let host: HTMLElement;
let adapter: MockViewerAdapter;

async function setup(): Promise<MockViewerAdapter> {
  host = document.createElement('div');
  document.body.appendChild(host);
  adapter = new MockViewerAdapter(host);
  await adapter.load('dXJu');
  return adapter;
}

afterEach(() => {
  adapter?.destroy();
  host?.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function button(id: string): HTMLButtonElement {
  const el = host.querySelector<HTMLButtonElement>(`[data-button-id="${id}"]`);
  if (!el) throw new Error(`missing button ${id}`);
  return el;
}

const SWATCHES = ['paint-red', 'paint-green', 'paint-blue'];

describe('mock toolbar tool group', () => {
  it('renders the paint combo with swatches and reset plus the export button', async () => {
    await setup();
    adapter.registerToolGroup(buildToolGroupSpec(adapter));
    const group = host.querySelector('[role="toolbar"] [role="group"]');
    expect(group).not.toBeNull();
    expect(group?.getAttribute('aria-label')).toBe('BIM Showcase Hub tools');
    const trigger = button('paint');
    expect(trigger).toHaveAttribute('aria-haspopup', 'true');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger.title).toBe('Paint selection');
    for (const id of SWATCHES) {
      expect(button(id).querySelector('.bsh-mock__icon')).not.toBeNull();
      expect(button(id).className).toContain('bsh-mock__button');
    }
    expect(button('paint-red').getAttribute('aria-label')).toBe(
      'Paint selected items in red',
    );
    expect(button('paint-reset').getAttribute('aria-label')).toBe(
      'Reset appearance',
    );
    expect(button('export-xlsx').title).toBe('Export to Excel');
    expect(
      button('export-xlsx').querySelector('.bsh-ico-export'),
    ).not.toBeNull();
    expect(button('export-glb').title).toBe('Export geometry (GLB)');
    expect(button('export-glb').querySelector('.bsh-ico-glb')).not.toBeNull();
  });

  it('sits after the fake native tools in the toolbar', async () => {
    await setup();
    adapter.registerToolGroup(buildToolGroupSpec(adapter));
    const toolbar = host.querySelector('[role="toolbar"]');
    const children = [...(toolbar?.children ?? [])];
    expect(children.at(-1)?.className).toBe('bsh-mock__group');
    expect(
      children.slice(0, 3).map((c) => (c as HTMLElement).dataset.buttonId),
    ).toEqual(['home', 'orbit', 'measure']);
  });

  it('opens and closes the flyout with click, escape and outside press', async () => {
    await setup();
    adapter.registerToolGroup(buildToolGroupSpec(adapter));
    const trigger = button('paint');
    const flyout = host.querySelector<HTMLElement>('.bsh-mock__flyout');
    expect(flyout?.hidden).toBe(true);
    trigger.click();
    expect(flyout?.hidden).toBe(false);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(flyout?.hidden).toBe(true);
    trigger.click();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(flyout?.hidden).toBe(true);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('disables swatches until the selection is non-empty and reset until something is painted', async () => {
    await setup();
    const spy = vi.spyOn(adapter, 'setModelThemingColor');
    const clear = vi.spyOn(adapter, 'clearThemingColors');
    adapter.registerToolGroup(buildToolGroupSpec(adapter));
    for (const id of SWATCHES) {
      expect(button(id)).toHaveAttribute('aria-disabled', 'true');
      expect(button(id).title).toBe('Select elements to paint');
    }
    expect(button('paint-reset')).toHaveAttribute('aria-disabled', 'true');
    expect(button('paint-reset').title).toBe('Nothing painted yet');
    button('paint-red').click();
    button('paint-reset').click();
    expect(spy).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();

    const ids = buildMockElements()
      .slice(0, 2)
      .map((e) => e.dbId);
    adapter.selectIds(ids);
    for (const id of SWATCHES) {
      expect(button(id)).not.toHaveAttribute('aria-disabled');
    }
    expect(button('paint-green').title).toBe('Paint selected items in green');

    button('paint').click();
    button('paint-blue').click();
    expect(spy).toHaveBeenCalledWith(
      ids.map((dbId) => ({ modelId: 'dXJu', dbId })),
      [0, 0, 1, 0.5],
    );
    expect(adapter.getModelSelection().map((item) => item.dbId)).toEqual([]);
    expect(host.querySelector<HTMLElement>('.bsh-mock__flyout')?.hidden).toBe(
      true,
    );
    for (const id of SWATCHES) {
      expect(button(id)).toHaveAttribute('aria-disabled', 'true');
    }
    expect(button('paint-reset')).not.toHaveAttribute('aria-disabled');
    expect(button('paint-reset').title).toBe('Reset appearance');

    button('paint-reset').click();
    expect(clear).toHaveBeenCalledTimes(1);
    expect(button('paint-reset')).toHaveAttribute('aria-disabled', 'true');
  });

  it('removes the group on dispose and on destroy', async () => {
    await setup();
    const dispose = adapter.registerToolGroup(buildToolGroupSpec(adapter));
    expect(host.querySelector('[data-group-id]')).not.toBeNull();
    dispose();
    expect(host.querySelector('[data-group-id]')).toBeNull();
    adapter.registerToolGroup(buildToolGroupSpec(adapter));
    adapter.destroy();
    expect(host.querySelector('[data-group-id]')).toBeNull();
  });

  it('renders only the features present in the spec', async () => {
    await setup();
    const dispose = adapter.registerToolGroup(
      buildToolGroupSpec(adapter, {
        features: { paint: false, export: true, geometry: false },
      }),
    );
    expect(host.querySelector('[data-button-id="paint"]')).toBeNull();
    expect(host.querySelector('[data-button-id="paint-red"]')).toBeNull();
    expect(button('export-xlsx')).not.toBeNull();
    dispose();
    adapter.registerToolGroup(
      buildToolGroupSpec(adapter, {
        features: { paint: true, export: false, geometry: false },
      }),
    );
    expect(host.querySelector('[data-button-id="export-xlsx"]')).toBeNull();
    expect(button('paint')).not.toBeNull();
  });

  it('leaves exactly one group after dispose then register', async () => {
    await setup();
    const dispose = adapter.registerToolGroup(buildToolGroupSpec(adapter));
    dispose();
    adapter.registerToolGroup(buildToolGroupSpec(adapter));
    expect(host.querySelectorAll('[data-group-id]')).toHaveLength(1);
    expect(host.querySelectorAll('[data-button-id="paint"]')).toHaveLength(1);
    expect(
      host.querySelectorAll('[data-button-id="export-xlsx"]'),
    ).toHaveLength(1);
  });

  it('runs the export through the toolbar button and reports status', async () => {
    await setup();
    const phases: ExportStatus['phase'][] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: () => 'blob:x',
      revokeObjectURL: () => {},
    });
    adapter.registerToolGroup(
      buildToolGroupSpec(adapter, { onStatus: (s) => phases.push(s.phase) }),
    );
    button('export-xlsx').click();
    button('export-xlsx').click();
    await vi.waitFor(() => expect(phases).toContain('done'));
    expect(phases).toEqual(['reading', 'building', 'done']);
  });

  it('runs the GLB export through the toolbar button and reports status', async () => {
    await setup();
    const phases: string[] = [];
    const saved: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: () => 'blob:glb',
      revokeObjectURL: () => {},
    });
    adapter.registerToolGroup(
      buildToolGroupSpec(adapter, {
        onGeometryStatus: (status) => {
          phases.push(status.phase);
          if (status.phase === 'done') saved.push(status.fileName);
        },
      }),
    );
    button('export-glb').click();
    button('export-glb').click();
    await vi.waitFor(() => expect(phases).toContain('done'));
    expect(phases).toEqual(['reading', 'building', 'done']);
    expect(saved).toEqual(['model-geometry.glb']);
  });
});

describe('mock adapter resize', () => {
  function sized(width: number, height: number) {
    Object.defineProperty(host, 'clientWidth', {
      configurable: true,
      value: width,
    });
    Object.defineProperty(host, 'clientHeight', {
      configurable: true,
      value: height,
    });
  }

  function viewBox(): number[] {
    const svg = host.querySelector('svg');
    return (svg?.getAttribute('viewBox') ?? '').split(' ').map(Number);
  }

  it('refits the scene to the new container aspect without distortion', async () => {
    await setup();
    sized(1000, 500);
    adapter.resize();
    const wide = viewBox();
    expect((wide[2] ?? 0) / (wide[3] ?? 1)).toBeCloseTo(2, 5);
    sized(400, 800);
    adapter.resize();
    const tall = viewBox();
    expect((tall[2] ?? 0) / (tall[3] ?? 1)).toBeCloseTo(0.5, 5);
    const svg = host.querySelector('svg');
    expect(svg?.dataset.fitWidth).toBe('400');
    expect(svg?.dataset.fitHeight).toBe('800');
  });

  it('keeps every element inside the fitted view box', async () => {
    await setup();
    const elements = buildMockElements();
    for (const [w, h] of [
      [1200, 700],
      [600, 700],
      [300, 700],
    ] as const) {
      sized(w, h);
      adapter.resize();
      const [x = 0, y = 0, vw = 0, vh = 0] = viewBox();
      for (const el of elements) {
        for (const [px, py] of el.points) {
          expect(px).toBeGreaterThanOrEqual(x);
          expect(px).toBeLessThanOrEqual(x + vw);
          expect(py).toBeGreaterThanOrEqual(y);
          expect(py).toBeLessThanOrEqual(y + vh);
        }
      }
    }
  });

  it('does nothing for a zero-size container or before load', async () => {
    host = document.createElement('div');
    adapter = new MockViewerAdapter(host);
    expect(() => adapter.resize()).not.toThrow();
    await adapter.load('dXJu');
    const before = viewBox();
    sized(0, 0);
    adapter.resize();
    expect(viewBox()).toEqual(before);
  });
});
