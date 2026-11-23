import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseView } from '../api/viewLink.js';
import {
  chartsFromProperties,
  DEFAULT_DASHBOARD_VIEW,
} from '../extensions/dashboardPresets.js';
import { chartSetting } from '../layout/instanceSettings.js';
import type { LayoutApi } from '../layout/layoutContext.js';
import { PANE_SETTINGS } from '../settings/paneSettings.js';
import { setStorageAdapter } from '../storage.js';
import { memoryAdapter } from '../storageAdapter.js';
import { captureCharts, capturePanes, sharedView } from './shareLink.js';
import type { ViewerAdapter, ViewerState } from './ViewerAdapter.js';

const CAMERA = {
  eye: [0, 0, 10] as const,
  target: [0, 0, 0] as const,
  up: [0, 1, 0] as const,
  ortho: false,
};

function fakeLayout(overrides: Partial<LayoutApi> = {}): LayoutApi {
  return {
    mode: 'dock',
    openPanes: [],
    isCollapsed: () => false,
    togglePane: vi.fn(),
    setCollapsed: vi.fn(),
    addInstance: vi.fn(() => null),
    ...overrides,
  } as unknown as LayoutApi;
}

function fakeAdapter(state?: ViewerState): ViewerAdapter {
  return {
    getCamera: () => CAMERA,
    getModelSelection: () => [{ modelId: 'urn-a', dbId: 7 }],
    getState: () =>
      state ?? { version: 1, camera: null, cutplanes: [], models: {} },
  } as unknown as ViewerAdapter;
}

beforeEach(() => {
  setStorageAdapter(memoryAdapter());
});

describe('share link capture', () => {
  it('has no panes without a layout', () => {
    expect(capturePanes(null)).toBeUndefined();
    expect(capturePanes(fakeLayout())).toBeUndefined();
  });

  it('records the open and collapsed panes of the layout', () => {
    const layout = fakeLayout({
      openPanes: ['summary', 'dashboard'],
      isCollapsed: (id) => id === 'dashboard',
    });
    expect(capturePanes(layout)).toEqual({
      open: ['summary', 'dashboard'],
      collapsed: ['dashboard'],
    });
  });

  it('always carries the dashboard view and drops a personal selection set', () => {
    PANE_SETTINGS.dashboard.view.write({
      ...DEFAULT_DASHBOARD_VIEW,
      charts: chartsFromProperties(['Level']),
      properties: ['Level'],
      maxCategories: 8,
      pngTitle: false,
      pngLegend: false,
      elements: 'set:abc',
    });
    const charts = captureCharts();
    expect(charts[0]?.id).toBe('dashboard');
    expect(charts[0]?.view).toMatchObject({
      charts: [{ property: 'Level', chartType: 'bar' }],
    });
    expect(charts[0]?.view).not.toHaveProperty('elements');
  });

  it('includes every chart pane in order', () => {
    for (const [instance, property] of [
      ['chart:2', 'Category'],
      ['chart:1', 'Type Name'],
    ] as const) {
      chartSetting(instance).write({
        ...DEFAULT_DASHBOARD_VIEW,
        charts: chartsFromProperties([property]),
        properties: [property],
        maxCategories: 6,
        pngTitle: true,
        pngLegend: true,
      });
    }
    expect(captureCharts().map((chart) => chart.id)).toEqual([
      'dashboard',
      'chart:1',
      'chart:2',
    ]);
  });

  it('builds a link that parses back with the panes and charts', () => {
    const layout = fakeLayout({ openPanes: ['summary'] });
    const shared = sharedView(fakeAdapter(), ['urn-a'], layout);
    expect(shared?.degraded).toBe(false);
    expect(shared?.trimmed).toBe(false);
    const link = parseView(shared?.view, ['urn-a']);
    expect(link?.camera.eye).toEqual([0, 0, 10]);
    expect(link?.selection).toEqual([{ modelId: 'urn-a', dbId: 7 }]);
    expect(link?.panes?.open).toEqual(['summary']);
    expect(link?.charts?.[0]?.id).toBe('dashboard');
  });

  it('says when a chart pane does not fit in the link', () => {
    for (let i = 1; i <= 4; i += 1) {
      chartSetting(`chart:${i}`).write({
        ...DEFAULT_DASHBOARD_VIEW,
        charts: chartsFromProperties([`Level ${i}`]),
        properties: [`Level ${i}`],
        maxCategories: 6,
        pngTitle: false,
        pngLegend: false,
      });
    }
    expect(captureCharts().map((chart) => chart.id)).toEqual([
      'dashboard',
      'chart:1',
      'chart:2',
      'chart:3',
    ]);
    expect(sharedView(fakeAdapter(), ['urn-a'], fakeLayout())?.trimmed).toBe(
      true,
    );
  });

  it('has no link before the viewer has a camera', () => {
    const adapter = { getCamera: () => null } as unknown as ViewerAdapter;
    expect(sharedView(adapter, ['urn-a'], null)).toBeNull();
  });

  it('leaves out the parts the include options turn off', () => {
    const layout = fakeLayout({ openPanes: ['summary'] });
    const shared = sharedView(fakeAdapter(), ['urn-a'], layout, {
      selection: false,
      panes: false,
      nodes: false,
    });
    expect(shared?.link.selection).toEqual([]);
    expect(shared?.link.panes).toBeUndefined();
    expect(shared?.link.charts).toBeUndefined();
    expect(shared?.link.nodes).toBeUndefined();
    expect(shared?.link.camera).toBeDefined();
  });

  it('includes everything by default', () => {
    const shared = sharedView(fakeAdapter(), ['urn-a'], fakeLayout());
    expect(shared?.link.charts?.length).toBeGreaterThan(0);
  });

  it('carries the hidden and isolated elements of the viewer', () => {
    const state: ViewerState = {
      version: 1,
      camera: null,
      cutplanes: [],
      models: {
        'urn-a': { hidden: [3, 4], isolated: [5], selection: [] },
        'urn-b': { hidden: [], isolated: [], selection: [] },
      },
    };
    const shared = sharedView(fakeAdapter(state), ['urn-a', 'urn-b'], null);
    expect(parseView(shared?.view, ['urn-a', 'urn-b'])?.nodes).toEqual([
      { modelId: 'urn-a', hidden: [3, 4], isolated: [5] },
    ]);
  });
});

describe('share link chart order', () => {
  it('sorts chart ids that are not numeric without NaN', () => {
    for (const id of ['chart:b', 'chart:10', 'chart:2', 'chart:a']) {
      chartSetting(id as never).write({
        property: 'P',
        properties: ['P'],
      } as never);
    }
    expect(captureCharts().map((c) => c.id)).toEqual([
      'dashboard',
      'chart:2',
      'chart:10',
      'chart:a',
    ]);
  });
});
