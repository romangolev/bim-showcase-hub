import { afterEach, describe, expect, it, vi } from 'vitest';
import { isMockViewer } from './createViewerAdapter.js';
import { installFakeFederation } from './fakeFederatedViewer.js';
import { MockViewerAdapter } from './MockViewerAdapter.js';
import {
  buildMockElements,
  buildMockRows,
  LARGE_FIXTURE_ROWS,
} from './mockModel.js';
import { RealViewerAdapter } from './RealViewerAdapter.js';
import { apiForRegion, detectRegion, resetRegion } from './region.js';
import type { CameraState, ViewerAdapter } from './ViewerAdapter.js';

interface Harness {
  create(host: HTMLElement): ViewerAdapter;
}

const HARNESSES: [string, () => Harness][] = [
  ['mock', () => ({ create: (host) => new MockViewerAdapter(host) })],
  [
    'real (fake viewer)',
    () => {
      resetRegion();
      installFakeFederation();
      return { create: (host) => new RealViewerAdapter(host) };
    },
  ],
];

describe.each(HARNESSES)(
  'ViewerAdapter shared contract (%s)',
  (_name, make) => {
    let shared: HTMLElement;
    let subject: ViewerAdapter;

    async function ready(urns: string[] = ['urn-a']): Promise<ViewerAdapter> {
      const harness = make();
      shared = document.createElement('div');
      document.body.appendChild(shared);
      subject = harness.create(shared);
      await subject.loadModels(urns.map((urn) => ({ urn })));
      return subject;
    }

    async function firstItems(count: number) {
      const rows = await subject.getLeafProperties(['Name']);
      const modelId = subject.getModels()[0]?.id ?? '';
      return rows.slice(0, count).map((row) => ({ modelId, dbId: row.dbId }));
    }

    afterEach(() => {
      subject?.destroy();
      shared?.remove();
    });

    it('rejects an empty urn', async () => {
      const harness = make();
      shared = document.createElement('div');
      subject = harness.create(shared);
      await expect(subject.load('')).rejects.toThrow();
    });

    it('selects, notifies and stops notifying after unsubscribe', async () => {
      await ready();
      const [a, b] = await firstItems(2);
      const seen: number[][] = [];
      const off = subject.onSelectionChange((items) =>
        seen.push(items.map((item) => item.dbId)),
      );
      subject.selectModelIds(a ? [a] : []);
      expect(subject.getModelSelection().map((item) => item.dbId)).toEqual([
        a?.dbId,
      ]);
      expect(seen.at(-1)).toEqual([a?.dbId]);
      subject.selectModelIds([a, b].flatMap((item) => (item ? [item] : [])));
      expect(
        subject
          .getModelSelection()
          .map((item) => item.dbId)
          .sort(),
      ).toEqual([a?.dbId, b?.dbId].sort());
      subject.clearSelection();
      expect(subject.getModelSelection()).toEqual([]);
      off();
      const count = seen.length;
      subject.selectModelIds(a ? [a] : []);
      expect(seen).toHaveLength(count);
    });

    it('isolates, hides and shows elements', async () => {
      await ready();
      const items = await firstItems(2);
      const total = (await subject.getVisible()).length;
      expect(total).toBeGreaterThanOrEqual(2);
      subject.isolateModelIds(items);
      expect(subject.getIsolated()).toHaveLength(2);
      expect(await subject.getVisible()).toHaveLength(2);
      subject.isolateModelIds([]);
      expect(subject.getIsolated()).toEqual([]);
      expect(await subject.getVisible()).toHaveLength(total);
      subject.hideModelIds(items);
      expect(await subject.getVisible()).toHaveLength(total - 2);
      subject.showModelIds(items.slice(0, 1));
      expect(await subject.getVisible()).toHaveLength(total - 1);
      subject.showAll();
      expect(await subject.getVisible()).toHaveLength(total);
    });

    it('returns deterministic leaf properties filtered by name', async () => {
      await ready();
      const first = await subject.getLeafProperties(['Name', 'Category']);
      const second = await subject.getLeafProperties(['Name', 'Category']);
      expect(first).toEqual(second);
      expect(first.length).toBeGreaterThan(0);
      expect(Object.keys(first[0]?.properties ?? {}).sort()).toEqual([
        'Category',
        'Name',
      ]);
    });

    it('reports read progress and rejects once aborted', async () => {
      await ready();
      const seen: { loaded: number; total: number; partial: boolean }[] = [];
      const rows = await subject.getLeafProperties(['Name'], undefined, {
        onProgress: (progress) => seen.push(progress),
      });
      expect(seen.at(-1)).toMatchObject({
        loaded: rows.length,
        total: rows.length,
        partial: false,
      });
      const controller = new AbortController();
      controller.abort();
      await expect(
        subject.getLeafProperties(['Name'], undefined, {
          signal: controller.signal,
        }),
      ).rejects.toMatchObject({ name: 'AbortError' });
      await expect(
        subject.discoverProperties(undefined, { signal: controller.signal }),
      ).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('reports the rows of each chunk while the read runs', async () => {
      await ready();
      const sizes: number[] = [];
      const rows = await subject.getLeafProperties(['Category'], undefined, {
        onRows: (part) => sizes.push(part.length),
      });
      expect(sizes.length).toBeGreaterThan(0);
      expect(sizes.reduce((sum, size) => sum + size, 0)).toBe(rows.length);
    });

    it('keeps order and nulls when reading several elements', async () => {
      await ready();
      const [a, b] = await firstItems(2);
      const modelId = a?.modelId ?? '';
      const read = await subject.getElementsProperties([
        b ?? { modelId, dbId: 0 },
        { modelId, dbId: -1 },
        { modelId: 'nope', dbId: 1 },
        a ?? { modelId, dbId: 0 },
      ]);
      expect(read).toHaveLength(4);
      expect(read[0]).not.toBeNull();
      expect(read[1]).toBeNull();
      expect(read[2]).toBeNull();
      expect(read[3]).not.toBeNull();
      expect(await subject.getElementsProperties([])).toEqual([]);
    });

    it('answers unknown model ids with empty results', async () => {
      await ready();
      expect(await subject.getExternalIdMap?.('missing-model')).toEqual({});
      expect(await subject.listViews('gone')).toEqual([]);
    });

    it('clears rows on unload and tolerates a second destroy', async () => {
      await ready();
      subject.unload();
      expect(await subject.getLeafProperties(['Name'])).toEqual([]);
      subject.destroy();
      subject.destroy();
    });

    it('reads and sets the camera', async () => {
      await ready();
      const camera: CameraState = {
        eye: [1, 2, 3],
        target: [0, 0, 0],
        up: [0, 1, 0],
        ortho: true,
      };
      subject.setCamera(camera);
      expect(subject.getCamera()).toMatchObject(camera);
    });

    it('captures and restores hidden, isolated and selected nodes', async () => {
      await ready();
      const [a, b] = await firstItems(2);
      const modelId = a?.modelId ?? '';
      subject.isolateModelIds([a, b].flatMap((item) => (item ? [item] : [])));
      subject.hideModelIds(b ? [b] : []);
      subject.selectModelIds(a ? [a] : []);
      const saved = subject.getState();
      expect(JSON.parse(JSON.stringify(saved))).toEqual(saved);
      expect(saved.models[modelId]).toEqual({
        isolated: [a?.dbId, b?.dbId],
        hidden: [b?.dbId],
        selection: [a?.dbId],
      });
      subject.showAll();
      subject.isolateModelIds([]);
      subject.clearSelection();
      await subject.restoreState(saved);
      expect(subject.getState().models[modelId]).toEqual(saved.models[modelId]);
    });

    it('ignores garbage state', async () => {
      await ready();
      await expect(
        subject.restoreState(
          null as unknown as ReturnType<typeof subject.getState>,
        ),
      ).resolves.toEqual({ skippedModels: [], viewerFailed: false });
      await expect(
        subject.restoreState({ version: 9 } as unknown as ReturnType<
          typeof subject.getState
        >),
      ).resolves.toEqual({ skippedModels: [], viewerFailed: false });
    });

    it('places the anchor first and reports others by distance', async () => {
      await ready(['urn-a', 'urn-b']);
      const info = subject.getPlacementInfo();
      expect(info).toHaveLength(2);
      expect(info.map((model) => model.anchor)).toEqual([true, false]);
      expect(info[0]?.distanceMeters).toBe(0);
    });
  },
);

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

describe('MockViewerAdapter specifics', () => {
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

  it('applies and clears theming colours', async () => {
    await setup();
    const ids = buildMockElements()
      .slice(0, 2)
      .map((element) => element.dbId);
    const modelId = adapter.getModels()[0]?.id ?? '';
    adapter.setModelThemingColor(
      ids.map((dbId) => ({ modelId, dbId })),
      [1, 0, 0, 0.5],
    );
    for (const dbId of ids) {
      expect(elementNode(dbId).style.fill).toContain('rgba(255, 0, 0');
    }
    adapter.clearModelThemingColors([{ modelId, dbId: ids[0] ?? 0 }]);
    expect(elementNode(ids[0] ?? 0).style.fill).toBe('');
    expect(elementNode(ids[1] ?? 0).style.fill).toContain('rgba(255, 0, 0');
    adapter.clearThemingColors();
    expect(elementNode(ids[1] ?? 0).style.fill).toBe('');
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
    const seen: {
      phase: string;
      loaded: number;
      total: number;
      partial: boolean;
    }[] = [];
    const rows = await adapter.getLeafProperties(['Name'], undefined, {
      onProgress: (progress) => seen.push(progress),
    });
    expect(seen.at(-1)).toMatchObject({
      loaded: rows.length,
      total: rows.length,
      partial: false,
    });
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

  it('reports the rows of each chunk while the read runs', async () => {
    await setup();
    const sizes: number[] = [];
    const rows = await adapter.getLeafProperties(['Category'], undefined, {
      onRows: (part) => sizes.push(part.length),
    });
    expect(sizes.length).toBeGreaterThan(0);
    expect(sizes.reduce((sum, size) => sum + size, 0)).toBe(rows.length);
  });

  it('reads the full property set of one element', async () => {
    await setup();
    const modelId = adapter.getModels()[0]?.id ?? '';
    const first = buildMockElements()[0];
    const [read] = await adapter.getElementsProperties([
      { modelId, dbId: first?.dbId ?? 0 },
    ]);
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
      await adapter.getElementsProperties([
        { modelId, dbId: -1 },
        { modelId: 'nope', dbId: 1 },
      ]),
    ).toEqual([null, null]);
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
    expect(typeof typed.setGhosting).toBe('function');
  });

  it('lists, notifies and clears measurements', async () => {
    await setup();
    const seen = vi.fn();
    const off = adapter.onMeasurementsChange(seen);
    expect(adapter.listMeasurements()).toEqual([]);
    expect(await adapter.startMeasure('distance')).toBe(true);
    expect(adapter.listMeasurements()).toEqual([
      { id: '1', type: 'distance', value: '3.50 m' },
    ]);
    adapter.clearMeasurements();
    expect(adapter.listMeasurements()).toEqual([]);
    expect(seen).toHaveBeenCalledTimes(2);
    off();
    await adapter.startMeasure('area');
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it('drops measurements on unload and destroy', async () => {
    await setup();
    await adapter.startMeasure('angle');
    adapter.unload();
    expect(adapter.listMeasurements()).toEqual([]);
    await adapter.load('dXJuOmFkc2s');
    await adapter.startMeasure('area');
    adapter.destroy();
    expect(adapter.listMeasurements()).toEqual([]);
  });

  it('applies and records display settings', async () => {
    await setup();
    const settings = {
      lightPreset: 2,
      groundShadow: false,
      groundReflection: true,
      edges: true,
      ambientOcclusion: false,
      antialiasing: true,
      performance: true,
    };
    expect(adapter.applyDisplaySettings(settings)).toEqual([]);
    const root = host.querySelector<HTMLElement>('.bsh-mock');
    expect(JSON.parse(root?.dataset.display ?? 'null')).toEqual(settings);
  });

  it('hides native controls by id and reports unknown ids', async () => {
    await setup();
    expect(
      adapter.setHiddenControls(['toolbar-orbitTools', 'toolbar-nope']),
    ).toEqual(['toolbar-nope']);
    expect(
      host.querySelector<HTMLElement>('[data-native-id="toolbar-orbitTools"]')
        ?.hidden,
    ).toBe(true);
    adapter.setHiddenControls([]);
    expect(
      host.querySelector<HTMLElement>('[data-native-id="toolbar-orbitTools"]')
        ?.hidden,
    ).toBe(false);
    expect(
      host.querySelector<HTMLElement>('[data-native-id="toolbar-orbitTools"]')
        ?.style.display,
    ).toBe('');
  });

  it('keeps hidden controls hidden after a later model load', async () => {
    await setup();
    adapter.setHiddenControls(['toolbar-measurementSubmenuTool']);
    await adapter.addModel({ urn: 'urn-second' });
    expect(
      host.querySelector<HTMLElement>(
        '[data-native-id="toolbar-measurementSubmenuTool"]',
      )?.hidden,
    ).toBe(true);
  });

  it('lists two views and follows the chosen one', async () => {
    await setup();
    const modelId = adapter.getModels()[0]?.id ?? '';
    expect(await adapter.listViews(modelId)).toEqual([
      { id: 'mock-3d', name: '{3D}', role: '3d', current: true },
      { id: 'mock-a101', name: 'A101 - Plans', role: '2d', current: false },
    ]);
    await adapter.loadModels([{ urn: 'dXJuOmFkc2s', view: 'mock-a101' }]);
    expect(adapter.getModels()[0]?.view).toBe('mock-a101');
    expect(await adapter.listViews(modelId)).toEqual([
      { id: 'mock-3d', name: '{3D}', role: '3d', current: false },
      { id: 'mock-a101', name: 'A101 - Plans', role: '2d', current: true },
    ]);
    expect(host.querySelector<HTMLElement>('.bsh-mock')?.dataset.view).toBe(
      'mock-a101',
    );
    expect(await adapter.listViews('gone')).toEqual([]);
  });

  it('reports placement info with the anchor distance in metres', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    adapter = new MockViewerAdapter(host);
    await adapter.loadModels([{ urn: 'urn-a' }, { urn: 'urn-far' }]);
    const info = adapter.getPlacementInfo();
    expect(info.map((model) => model.anchor)).toEqual([true, false]);
    expect(info[0]?.unit).toBe('m');
    expect(info[0]?.sharedCoordinates).toBeNull();
    expect(info[0]?.distanceMeters).toBe(0);
    expect(info[1]?.distanceMeters ?? 0).toBeGreaterThan(0);
    adapter.setModelOffsets(adapter.getTogetherOffsets());
    expect(adapter.getPlacementInfo()[1]?.distanceMeters).toBeCloseTo(0, 5);
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
    const total = buildMockElements().length;
    expect(host.querySelectorAll('.bsh-mock__el--dim')).toHaveLength(total - 2);
    expect(host.querySelectorAll('.bsh-mock__el--hidden')).toHaveLength(0);
    adapter.setGhosting(false);
    expect(host.querySelectorAll('.bsh-mock__el--dim')).toHaveLength(0);
    expect(host.querySelectorAll('.bsh-mock__el--hidden')).toHaveLength(
      total - 2,
    );
    adapter.setGhosting(true);
    expect(host.querySelectorAll('.bsh-mock__el--dim')).toHaveLength(total - 2);
    adapter.isolateModelIds([]);
    expect(adapter.getIsolated()).toEqual([]);
    expect(await adapter.getVisible()).toHaveLength(total);
    expect(host.querySelectorAll('.bsh-mock__el--dim')).toHaveLength(0);
    expect(host.querySelectorAll('.bsh-mock__el--hidden')).toHaveLength(0);
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

  it('shows hidden elements again one group at a time', async () => {
    await setup();
    const [first, second] = buildMockElements();
    const modelId = adapter.getModels()[0]?.id ?? '';
    const total = buildMockElements().length;
    const a = { modelId, dbId: first?.dbId ?? 0 };
    const b = { modelId, dbId: second?.dbId ?? 0 };
    adapter.hideModelIds([a, b]);
    adapter.showModelIds([a]);
    expect(await adapter.getVisible()).toHaveLength(total - 1);
    expect(host.querySelectorAll('.bsh-mock__el--hidden')).toHaveLength(1);
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
    expect(saved.explode ?? 0).toBe(0);
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
    await adapter.restoreState({ ...saved, explode: 0.5 });
    expect(adapter.getState().explode).toBe(0.5);
    await adapter.restoreState(saved);
    expect(adapter.getState().explode).toBeUndefined();
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
