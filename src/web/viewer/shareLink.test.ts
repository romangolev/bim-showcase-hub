import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fitView, parseView, type ViewLink } from '../api/viewLink.js';
import { chartSetting } from '../layout/instanceSettings.js';
import type { LayoutApi } from '../layout/layoutContext.js';
import { PANE_SETTINGS } from '../settings/paneSettings.js';
import { setStorageAdapter } from '../storage.js';
import { memoryAdapter } from '../storageAdapter.js';
import {
  applyViewLink,
  captureCharts,
  capturePanes,
  linkViewerState,
  resetAppliedLinks,
  restoreLinkView,
  sharedView,
} from './shareLink.js';
import type { ViewerAdapter, ViewerState } from './ViewerAdapter.js';

const CAMERA = {
  eye: [0, 0, 10] as const,
  target: [0, 0, 0] as const,
  up: [0, 1, 0] as const,
  ortho: false,
};

function linkWith(extra: Partial<ViewLink>): ViewLink {
  return { camera: CAMERA, selection: [], ...extra };
}

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
  resetAppliedLinks();
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
      preset: null,
      property: 'Level',
      properties: ['Level'],
      maxCategories: 8,
      kind: 'bar',
      pngTitle: false,
      pngLegend: false,
      elements: 'set:abc',
    });
    const charts = captureCharts();
    expect(charts[0]?.id).toBe('dashboard');
    expect(charts[0]?.view).toMatchObject({ property: 'Level', kind: 'bar' });
    expect(charts[0]?.view).not.toHaveProperty('elements');
  });

  it('includes every chart pane in order', () => {
    for (const [instance, property] of [
      ['chart:2', 'Category'],
      ['chart:1', 'Type Name'],
    ] as const) {
      chartSetting(instance).write({
        preset: null,
        property,
        properties: [property],
        maxCategories: 6,
        kind: 'both',
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
        preset: null,
        property: `Level ${i}`,
        properties: [`Level ${i}`],
        maxCategories: 6,
        kind: 'bar',
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

  it('builds the viewer state that restores the link', () => {
    const link = parseView(
      fitView(
        {
          camera: CAMERA,
          selection: [{ modelId: 'urn-a', dbId: 7 }],
          nodes: [{ modelId: 'urn-a', hidden: [3], isolated: [-1] }],
        },
        ['urn-a'],
      ).view,
      ['urn-a'],
    );
    if (!link) throw new Error('no link');
    expect(linkViewerState(link, ['urn-a'])).toEqual({
      version: 1,
      camera: CAMERA,
      cutplanes: [],
      models: {
        'urn-a': { hidden: [3], isolated: [-1], selection: [7] },
      },
    });
  });

  it('keeps the selection of the models without hidden elements', () => {
    const link = parseView(
      fitView(
        {
          camera: CAMERA,
          selection: [{ modelId: 'urn-b', dbId: 9 }],
          nodes: [{ modelId: 'urn-a', hidden: [3], isolated: [] }],
        },
        ['urn-a', 'urn-b'],
      ).view,
      ['urn-a', 'urn-b'],
    );
    if (!link) throw new Error('no link');
    expect(linkViewerState(link, ['urn-a', 'urn-b'])?.models['urn-b']).toEqual({
      hidden: [],
      isolated: [],
      selection: [9],
    });
  });

  it('has no viewer state to restore without nodes', () => {
    expect(linkViewerState(linkWith({}), ['urn-a'])).toBeNull();
  });
});

describe('share link restore', () => {
  it('opens and collapses panes without closing the others', () => {
    const layout = fakeLayout({ openPanes: ['dashboard', 'models'] });
    const report = applyViewLink(
      linkWith({ panes: { open: ['summary'], collapsed: ['dashboard'] } }),
      layout,
    );
    expect(report.panes).toBe(true);
    expect(layout.togglePane).toHaveBeenCalledTimes(1);
    expect(layout.togglePane).toHaveBeenCalledWith('summary');
    expect(layout.setCollapsed).toHaveBeenCalledWith('dashboard', true);
    expect(layout.setCollapsed).toHaveBeenCalledTimes(1);
  });

  it('expands a pane the link leaves open', () => {
    const layout = fakeLayout({ isCollapsed: (id) => id === 'tree' });
    applyViewLink(linkWith({ panes: { open: [], collapsed: [] } }), layout);
    expect(layout.setCollapsed).toHaveBeenCalledWith('tree', false);
  });

  it('leaves panes alone when the layout has no changes to make', () => {
    const layout = fakeLayout({ openPanes: ['summary'] });
    expect(
      applyViewLink(
        linkWith({ panes: { open: ['summary'], collapsed: [] } }),
        layout,
      ).panes,
    ).toBe(false);
    expect(layout.togglePane).not.toHaveBeenCalled();
  });

  it('ignores a pane id this build does not know', () => {
    const layout = fakeLayout();
    const link = parseView('2~1,2,3~0,0,0~0,0,1~p~~|foo', ['urn-a']);
    if (!link) throw new Error('no link');
    expect(link.camera.eye).toEqual([1, 2, 3]);
    expect(applyViewLink(link, layout)).toEqual({ panes: false, charts: 0 });
    expect(layout.togglePane).not.toHaveBeenCalled();
    expect(layout.setCollapsed).not.toHaveBeenCalled();
  });

  it('leaves an instance-only pane to the charts', () => {
    const layout = fakeLayout({
      openPanes: [],
      addInstance: vi.fn(() => 'chart:1'),
    });
    const report = applyViewLink(
      linkWith({
        panes: { open: ['chart'], collapsed: [] },
        charts: [
          { id: 'chart:1', view: { property: 'Level', properties: ['Level'] } },
        ],
      }),
      layout,
    );
    expect(layout.togglePane).not.toHaveBeenCalled();
    expect(layout.addInstance).toHaveBeenCalledWith('chart');
    expect(layout.addInstance).toHaveBeenCalledTimes(1);
    expect(report.charts).toBe(1);
    expect(chartSetting('chart:1').read().property).toBe('Level');
  });

  it('leaves the stored panes alone in the stacked layout', () => {
    const layout = fakeLayout({ mode: 'stacked' });
    const report = applyViewLink(
      linkWith({ panes: { open: ['summary'], collapsed: ['dashboard'] } }),
      layout,
    );
    expect(report.panes).toBe(false);
    expect(layout.togglePane).not.toHaveBeenCalled();
    expect(layout.setCollapsed).not.toHaveBeenCalled();
  });

  it('writes the dashboard and chart views from the link', () => {
    const layout = fakeLayout({ addInstance: vi.fn(() => 'chart:1') });
    const report = applyViewLink(
      linkWith({
        charts: [
          {
            id: 'dashboard',
            view: { property: 'Level', properties: ['Level'] },
          },
          {
            id: 'chart:1',
            view: { property: 'Type Name', properties: ['Type Name'] },
          },
        ],
      }),
      layout,
    );
    expect(report).toEqual({ panes: false, charts: 2 });
    expect(PANE_SETTINGS.dashboard.view.read().property).toBe('Level');
    expect(chartSetting('chart:1').read().property).toBe('Type Name');
  });

  it('puts link charts in new panes and keeps the local ones', () => {
    chartSetting('chart:1').write({
      property: 'Mine',
      properties: ['Mine'],
    } as never);
    const layout = fakeLayout({ addInstance: vi.fn(() => 'chart:2') });
    applyViewLink(
      linkWith({
        charts: [
          { id: 'chart:1', view: { property: 'Level', properties: ['Level'] } },
        ],
      }),
      layout,
    );
    expect(chartSetting('chart:1').read().property).toBe('Mine');
    expect(chartSetting('chart:2').read().property).toBe('Level');
  });

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

  it('retries a link that failed to parse', () => {
    expect(restoreLinkView('?view=junk', ['urn-a'], fakeLayout())).toBeNull();
    const view = fitView(linkWith({}), ['urn-a']).view;
    expect(
      restoreLinkView(`?view=${view}`, ['urn-a'], fakeLayout()),
    ).not.toBeNull();
  });

  it('does not create a chart pane when the layout refuses', () => {
    const report = applyViewLink(
      linkWith({
        charts: [
          {
            id: 'chart:1',
            view: { property: 'Type Name', properties: ['Type Name'] },
          },
        ],
      }),
      fakeLayout(),
    );
    expect(report.charts).toBe(0);
    expect(chartSetting('chart:1').read().property).toBe('Category');
  });

  it('restores a link from the search once', () => {
    const view = fitView(
      linkWith({ panes: { open: ['summary'], collapsed: [] } }),
      ['urn-a'],
    ).view;
    const layout = fakeLayout();
    const search = `?view=${encodeURIComponent(view)}`;
    expect(restoreLinkView(search, ['urn-a'], layout)?.panes).toBe(true);
    expect(layout.togglePane).toHaveBeenCalledTimes(1);
    expect(restoreLinkView(search, ['urn-a'], layout)).toBeNull();
    expect(layout.togglePane).toHaveBeenCalledTimes(1);
  });

  it('keeps an old link to the camera only', () => {
    expect(
      restoreLinkView('?view=1~1,2,3~0,0,0~0,0,1~p~', ['urn-a'], fakeLayout()),
    ).toMatchObject({ panes: false, charts: 0 });
  });
});
