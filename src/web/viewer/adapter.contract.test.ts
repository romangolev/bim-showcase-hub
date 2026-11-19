import { afterEach, describe, expect, it, vi } from 'vitest';
import { isMockViewer } from './createViewerAdapter.js';
import { MockViewerAdapter } from './MockViewerAdapter.js';
import {
  buildMockElements,
  buildMockRows,
  LARGE_FIXTURE_ROWS,
} from './mockModel.js';
import { apiForRegion, detectRegion } from './region.js';
import type { CameraState, ViewerAdapter } from './ViewerAdapter.js';

let host: HTMLElement;
let adapter: MockViewerAdapter;

async function setup(): Promise<MockViewerAdapter> {
  host = document.createElement('div');
  document.body.appendChild(host);
  adapter = new MockViewerAdapter(host);
  await adapter.load('dXJuOmFkc2s');
  return adapter;
}

afterEach(() => {
  adapter?.destroy();
  host?.remove();
  vi.unstubAllGlobals();
});

function elementNode(id: number): SVGElement {
  const node = host.querySelector<SVGElement>(`[data-dbid="${id}"]`);
  if (!node) throw new Error(`missing element ${id}`);
  return node;
}

describe('ViewerAdapter contract (mock)', () => {
  it('renders a few hundred elements and a toolbar', async () => {
    await setup();
    const count = host.querySelectorAll('[data-dbid]').length;
    expect(count).toBeGreaterThan(200);
    expect(count).toBe(buildMockElements().length);
    expect(host.querySelector('[role="toolbar"]')).not.toBeNull();
  });

  it('returns triangle parts for the GLB export', async () => {
    await setup();
    const { parts } = await adapter.getGeometryParts();
    expect(parts.length).toBeGreaterThan(0);
    for (const part of parts) {
      expect(part.positions.length).toBeGreaterThan(0);
      expect(part.positions.length % 3).toBe(0);
      expect(part.indices.length % 3).toBe(0);
      expect(part.indices.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('returns elements with properties for the IFC export', async () => {
    await setup();
    const { models } = await adapter.getIfcSource();
    expect(models.length).toBeGreaterThan(0);
    const element = models[0]?.elements[0];
    expect(element?.dbId).toBeGreaterThan(0);
    expect(element?.parts.length).toBeGreaterThan(0);
    expect(element?.properties['Identity Data']?.Category).toBe('Revit Walls');
  });

  it('rejects an empty urn', async () => {
    host = document.createElement('div');
    adapter = new MockViewerAdapter(host);
    await expect(adapter.load('')).rejects.toThrow();
  });

  it('fires onSelectionChange when an element is clicked', async () => {
    await setup();
    const seen: number[][] = [];
    adapter.onSelectionChange((items) =>
      seen.push(items.map((item) => item.dbId)),
    );
    const id = buildMockElements()[0]?.dbId ?? 0;
    elementNode(id).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(adapter.getModelSelection().map((item) => item.dbId)).toEqual([id]);
    expect(seen).toEqual([[id]]);
    expect(elementNode(id).classList.contains('bsh-mock__el--selected')).toBe(
      true,
    );
  });

  it('supports multi select and background deselect', async () => {
    await setup();
    const [a, b] = buildMockElements();
    const ids = [a?.dbId ?? 0, b?.dbId ?? 0];
    elementNode(ids[0] ?? 0).dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    elementNode(ids[1] ?? 0).dispatchEvent(
      new MouseEvent('click', { bubbles: true, shiftKey: true }),
    );
    expect(
      adapter
        .getModelSelection()
        .map((item) => item.dbId)
        .sort(),
    ).toEqual([...ids].sort());
    host
      .querySelector('svg')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(adapter.getModelSelection().map((item) => item.dbId)).toEqual([]);
  });

  it('stops notifying after unsubscribe', async () => {
    await setup();
    const cb = vi.fn();
    const off = adapter.onSelectionChange(cb);
    off();
    adapter.selectIds([buildMockElements()[0]?.dbId ?? 0]);
    expect(cb).not.toHaveBeenCalled();
  });

  it('applies and clears theming colours', async () => {
    await setup();
    const id = buildMockElements()[0]?.dbId ?? 0;
    adapter.setModelThemingColor(
      [{ modelId: 'dXJuOmFkc2s', dbId: id }],
      [1, 0, 0, 0.5],
    );
    expect(elementNode(id).style.fill).toContain('rgba(255, 0, 0');
    adapter.clearThemingColors();
    expect(elementNode(id).style.fill).toBe('');
  });

  it('maps external ids to dbIds for saved selections', async () => {
    await setup();
    const modelId = adapter.getModels()[0]?.id ?? '';
    const [first] = buildMockElements();
    const map = await adapter.getExternalIdMap(modelId);
    const dbId = first?.dbId ?? 0;
    expect(map[`mock-${dbId}`]).toBe(dbId);
    expect(await adapter.getExternalIdMap('missing-model')).toEqual({});
  });

  it('returns deterministic leaf properties filtered by name', async () => {
    await setup();
    const names = ['Name', 'Assembly Code', 'Classification Code', 'Level'];
    const first = await adapter.getLeafProperties(names);
    const second = await adapter.getLeafProperties(names);
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(200);
    expect(Object.keys(first[0]?.properties ?? {})).toEqual(names);
    const categories = new Set(
      (await adapter.getLeafProperties(['Category'])).map(
        (r) => r.properties.Category,
      ),
    );
    expect(categories).toEqual(
      new Set(['Walls', 'Doors', 'Windows', 'Slabs', 'Columns']),
    );
  });

  it('discovers the property names of the loaded model', async () => {
    await setup();
    const found = await adapter.discoverProperties();
    expect(found.map((info) => info.name).sort()).toEqual([
      'Assembly Code',
      'Category',
      'Classification Code',
      'Level',
      'Name',
    ]);
    expect(found.every((info) => info.category.length > 0)).toBe(true);
  });

  it('reports read progress and rejects once aborted', async () => {
    await setup();
    const seen: { done: number; total: number }[] = [];
    const rows = await adapter.getLeafProperties(['Name'], undefined, {
      onProgress: (progress) => seen.push(progress),
    });
    expect(seen.at(-1)).toEqual({ done: rows.length, total: rows.length });
    const controller = new AbortController();
    controller.abort();
    await expect(
      adapter.getLeafProperties(['Name'], undefined, {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    await expect(
      adapter.discoverProperties(undefined, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('reads the full property set of one element', async () => {
    await setup();
    const modelId = adapter.getModels()[0]?.id ?? '';
    const first = buildMockElements()[0];
    const read = await adapter.getElementProperties({
      modelId,
      dbId: first?.dbId ?? 0,
    });
    expect(read?.name).toBe(first?.name);
    expect(read?.properties.map((p) => p.name)).toEqual([
      'Category',
      'Name',
      'Assembly Code',
      'Classification Code',
      'Level',
    ]);
    expect(read?.properties.every((p) => p.category.length > 0)).toBe(true);
    expect(
      await adapter.getElementProperties({ modelId, dbId: -1 }),
    ).toBeNull();
    expect(
      await adapter.getElementProperties({ modelId: 'nope', dbId: 1 }),
    ).toBeNull();
  });

  it('reads several elements at once, keeping order and nulls', async () => {
    await setup();
    const modelId = adapter.getModels()[0]?.id ?? '';
    const [a, b] = buildMockElements();
    const read = await adapter.getElementsProperties([
      { modelId, dbId: b?.dbId ?? 0 },
      { modelId, dbId: -1 },
      { modelId, dbId: a?.dbId ?? 0 },
    ]);
    expect(read.map((entry) => entry?.name ?? null)).toEqual([
      b?.name,
      null,
      a?.name,
    ]);
    expect(await adapter.getElementsProperties([])).toEqual([]);
  });

  it('clears the scene on unload and removes DOM on destroy', async () => {
    await setup();
    adapter.unload();
    expect(host.querySelectorAll('[data-dbid]')).toHaveLength(0);
    expect(await adapter.getLeafProperties(['Name'])).toEqual([]);
    adapter.destroy();
    expect(host.children).toHaveLength(0);
    adapter.destroy();
  });

  it('exposes the applied theme and follows the page tokens', async () => {
    await setup();
    const root = host.querySelector<HTMLElement>('.bsh-mock');
    expect(root?.dataset.viewerTheme).toBe('dark');
    adapter.setTheme('light');
    expect(root?.dataset.viewerTheme).toBe('light');
    adapter.setTheme('dark');
    expect(root?.dataset.viewerTheme).toBe('dark');
    expect(root?.querySelector('[style*="#"]')).toBeNull();
  });

  it('satisfies the ViewerAdapter shape', async () => {
    await setup();
    const typed: ViewerAdapter = adapter;
    expect(typeof typed.load).toBe('function');
  });
});

describe('mock bulk fixture rows', () => {
  it('produces a six digit count when bulk rows are requested', () => {
    const rows = buildMockRows(['Category'], LARGE_FIXTURE_ROWS);
    const walls = rows.filter((r) => r.properties.Category === 'Walls');
    expect(walls.length).toBeGreaterThan(99999);
    expect(new Set(rows.map((r) => r.dbId)).size).toBe(rows.length);
  });
});

describe('mock switch and region helpers', () => {
  it('detects mock mode from the window flag', () => {
    expect(isMockViewer()).toBe(false);
    vi.stubGlobal('__MOCK_APS__', true);
    expect(isMockViewer()).toBe(true);
  });

  it('detects the EU region from the urn', () => {
    const eu = btoa('urn:adsk.wipemea:fs.file:abc')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    const us = btoa('urn:adsk.wipprod:fs.file:abc');
    expect(detectRegion(eu)).toBe('EU');
    expect(detectRegion(us)).toBe('US');
    expect(detectRegion('%%%')).toBe('US');
    expect(apiForRegion('EU')).toBe('derivativeV2_EU');
    expect(apiForRegion('US')).toBe('derivativeV2');
  });
});

describe('mock models far apart', () => {
  it('places a far model away, brings it together and restores it', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    adapter = new MockViewerAdapter(host);
    await adapter.loadModels([{ urn: 'urn-a' }, { urn: 'urn-far' }]);
    expect(adapter.getSpread()?.farApart).toBe(true);
    const group = () =>
      host.querySelector<SVGGElement>('[data-model-id="urn-far"]');
    expect(group()?.getAttribute('transform')).toContain('1000');
    adapter.setModelOffsets(adapter.getTogetherOffsets());
    expect(group()?.dataset.offset).toBe('moved');
    adapter.setModelVisible('urn-far', false);
    adapter.setModelVisible('urn-far', true);
    expect(group()?.dataset.offset).toBe('moved');
    adapter.setModelOffsets(null);
    expect(group()?.dataset.offset).toBe('original');
  });
});

describe('mock exports skip hidden models', () => {
  it('leaves a hidden model out of the GLB and IFC sources', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    adapter = new MockViewerAdapter(host);
    await adapter.loadModels([{ urn: 'urn-a' }, { urn: 'urn-b' }]);
    expect((await adapter.getGeometryParts()).parts).toHaveLength(2);
    expect((await adapter.getIfcSource()).models).toHaveLength(2);
    adapter.setModelVisible('urn-b', false);
    expect((await adapter.getGeometryParts()).parts).toHaveLength(1);
    const { models } = await adapter.getIfcSource();
    expect(models.map((model) => model.urn)).toEqual(['urn-a']);
  });
});

describe('mock selecting and isolating', () => {
  it('selects, isolates and restores elements', async () => {
    await setup();
    const [first, second] = buildMockElements();
    const modelId = adapter.getModels()[0]?.id ?? '';
    const items = [first, second].map((el) => ({
      modelId,
      dbId: el?.dbId ?? 0,
    }));
    adapter.selectModelIds(items);
    expect(adapter.getModelSelection()).toHaveLength(2);
    adapter.isolateModelIds(items);
    expect(adapter.getIsolated()).toHaveLength(2);
    expect(await adapter.getVisible()).toHaveLength(2);
    expect(host.querySelectorAll('.bsh-mock__el--dim').length).toBe(
      buildMockElements().length - 2,
    );
    adapter.isolateModelIds([]);
    expect(adapter.getIsolated()).toEqual([]);
    expect(await adapter.getVisible()).toHaveLength(buildMockElements().length);
    expect(host.querySelectorAll('.bsh-mock__el--dim')).toHaveLength(0);
  });

  it('hides elements and shows all again', async () => {
    await setup();
    const [first] = buildMockElements();
    const modelId = adapter.getModels()[0]?.id ?? '';
    const total = buildMockElements().length;
    adapter.hideModelIds([{ modelId, dbId: first?.dbId ?? 0 }]);
    expect(await adapter.getVisible()).toHaveLength(total - 1);
    expect(host.querySelectorAll('.bsh-mock__el--hidden')).toHaveLength(1);
    adapter.showAll();
    expect(await adapter.getVisible()).toHaveLength(total);
    expect(host.querySelectorAll('.bsh-mock__el--hidden')).toHaveLength(0);
  });
});

describe('mock fitting, screenshot and state', () => {
  it('records what a fit targets', async () => {
    await setup();
    const modelId = adapter.getModels()[0]?.id ?? '';
    adapter.fitToView();
    expect(host.querySelector<HTMLElement>('[data-fit]')?.dataset.fit).toBe(
      'null',
    );
    adapter.fitToView([{ modelId, dbId: 3 }]);
    expect(host.querySelector<HTMLElement>('[data-fit]')?.dataset.fit).toBe(
      JSON.stringify([{ modelId, dbId: 3 }]),
    );
  });

  it('reads and sets the camera', async () => {
    await setup();
    const camera: CameraState = {
      eye: [1, 2, 3],
      target: [0, 0, 0],
      up: [0, 1, 0],
      ortho: true,
    };
    adapter.setCamera(camera);
    expect(adapter.getCamera()).toEqual(camera);
  });

  it('rejects a screenshot once the viewer is destroyed', async () => {
    await setup();
    adapter.destroy();
    await expect(adapter.getScreenshot()).rejects.toThrow();
  });

  it('captures and restores camera, hidden, isolated and selected nodes', async () => {
    await setup();
    const [a, b] = buildMockElements();
    const modelId = adapter.getModels()[0]?.id ?? '';
    const at = (el?: { dbId: number }) => ({ modelId, dbId: el?.dbId ?? 0 });
    adapter.isolateModelIds([at(a), at(b)]);
    adapter.hideModelIds([at(b)]);
    adapter.selectModelIds([at(a)]);
    adapter.setCamera({
      eye: [4, 5, 6],
      target: [0, 0, 0],
      up: [0, 0, 1],
      ortho: false,
    });
    const saved = adapter.getState();
    expect(JSON.parse(JSON.stringify(saved))).toEqual(saved);
    expect(saved.models[modelId]).toEqual({
      isolated: [a?.dbId, b?.dbId],
      hidden: [b?.dbId],
      selection: [a?.dbId],
    });
    adapter.showAll();
    adapter.clearSelection();
    adapter.setCamera({
      eye: [0, 0, 1],
      target: [0, 0, 0],
      up: [0, 0, 1],
      ortho: false,
    });
    await adapter.restoreState(saved);
    expect(adapter.getState()).toEqual(saved);
    expect(await adapter.getVisible()).toEqual([at(a)]);
  });

  it('skips unknown models and ids and ignores garbage', async () => {
    await setup();
    const [a] = buildMockElements();
    const modelId = adapter.getModels()[0]?.id ?? '';
    const state = adapter.getState();
    state.models.gone = { isolated: [1], hidden: [2], selection: [3] };
    state.models[modelId] = {
      isolated: [-5],
      hidden: [999999],
      selection: [a?.dbId ?? 0, 999999],
    };
    await adapter.restoreState(state);
    expect(adapter.getState().models[modelId]).toEqual({
      isolated: [],
      hidden: [],
      selection: [a?.dbId],
    });
    expect(adapter.getState().models.gone).toBeUndefined();
    await expect(
      adapter.restoreState(null as unknown as typeof state),
    ).resolves.toEqual({ skippedModels: [], viewerFailed: false });
    await expect(
      adapter.restoreState({ version: 9 } as unknown as typeof state),
    ).resolves.toEqual({ skippedModels: [], viewerFailed: false });
  });
});
