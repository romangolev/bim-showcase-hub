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
  resetAppliedLinks,
  restoreLinkView,
  sharedView,
} from './shareLink.js';
import type { ViewerAdapter } from './ViewerAdapter.js';

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
    openPanes: [],
    isCollapsed: () => false,
    togglePane: vi.fn(),
    setCollapsed: vi.fn(),
    addInstance: vi.fn(() => null),
    ...overrides,
  } as unknown as LayoutApi;
}

function fakeAdapter(): ViewerAdapter {
  return {
    getCamera: () => CAMERA,
    getModelSelection: () => [{ modelId: 'urn-a', dbId: 7 }],
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
    const link = parseView(shared?.view, ['urn-a']);
    expect(link?.camera.eye).toEqual([0, 0, 10]);
    expect(link?.selection).toEqual([{ modelId: 'urn-a', dbId: 7 }]);
    expect(link?.panes?.open).toEqual(['summary']);
    expect(link?.charts?.[0]?.id).toBe('dashboard');
  });

  it('has no link before the viewer has a camera', () => {
    const adapter = { getCamera: () => null } as unknown as ViewerAdapter;
    expect(sharedView(adapter, ['urn-a'], null)).toBeNull();
  });
});

describe('share link restore', () => {
  it('opens, closes and collapses panes to match the link', () => {
    const layout = fakeLayout({ openPanes: ['dashboard'] });
    const report = applyViewLink(
      linkWith({ panes: { open: ['summary'], collapsed: ['dashboard'] } }),
      layout,
    );
    expect(report.panes).toBe(true);
    expect(layout.togglePane).toHaveBeenCalledWith('summary');
    expect(layout.togglePane).toHaveBeenCalledWith('dashboard');
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
    ).toEqual({ panes: false, charts: 0 });
  });
});
