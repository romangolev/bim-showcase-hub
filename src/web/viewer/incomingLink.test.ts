import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  encodeView,
  fitView,
  parseView,
  type ViewLink,
} from '../api/viewLink.js';
import { chartSetting } from '../layout/instanceSettings.js';
import type { LayoutApi } from '../layout/layoutContext.js';
import { PANE_SETTINGS } from '../settings/paneSettings.js';
import { setStorageAdapter } from '../storage.js';
import { memoryAdapter } from '../storageAdapter.js';
import {
  applyViewLink,
  createIncomingLink,
  type IncomingAdapter,
  LINK_RESTORED_TEXT,
  linkViewerState,
} from './incomingLink.js';
import type { ModelInfo } from './modelSet.js';
import type { ViewerState } from './ViewerAdapter.js';

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

function fakeAdapter() {
  return {
    setCamera: vi.fn(),
    selectModelIds: vi.fn(),
    restoreState: vi.fn(async (_state: ViewerState) => ({
      skippedModels: [],
      viewerFailed: false,
    })),
  } satisfies IncomingAdapter;
}

function model(id: string, status: ModelInfo['status']): ModelInfo {
  return { id, urn: id, name: id, visible: true, status };
}

function viewOf(link: ViewLink): string {
  return encodeView(link, ['urn-a']);
}

beforeEach(() => {
  setStorageAdapter(memoryAdapter());
});

describe('incoming link module', () => {
  function setup() {
    const incoming = createIncomingLink();
    const adapter = fakeAdapter();
    const layout = fakeLayout();
    const clear = vi.fn();
    const onResult = vi.fn();
    const offer = (raw: string | null) =>
      incoming.offer(raw, ['urn-a'], layout, clear, onResult);
    return { incoming, adapter, clear, onResult, offer, layout };
  }

  it('applies a link once even when offered again before the address clears', () => {
    const { incoming, adapter, clear, onResult, offer, layout } = setup();
    const raw = viewOf(
      linkWith({
        selection: [{ modelId: 'urn-a', dbId: 4 }],
        panes: { open: ['summary'], collapsed: [] },
      }),
    );
    offer(raw);
    offer(raw);
    incoming.settle(adapter, [model('urn-a', 'ready')]);
    incoming.settle(adapter, [model('urn-a', 'ready')]);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(layout.togglePane).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith(LINK_RESTORED_TEXT, false);
    expect(adapter.setCamera).toHaveBeenCalledTimes(1);
    expect(adapter.setCamera).toHaveBeenCalledWith(CAMERA);
    expect(adapter.selectModelIds).toHaveBeenCalledWith([
      { modelId: 'urn-a', dbId: 4 },
    ]);
  });

  it('applies a link again once the address was cleared and it comes back', () => {
    const { incoming, adapter, offer, layout } = setup();
    const raw = viewOf(
      linkWith({ panes: { open: ['summary'], collapsed: [] } }),
    );
    offer(raw);
    incoming.settle(adapter, [model('urn-a', 'ready')]);
    offer(null);
    offer(raw);
    expect(layout.togglePane).toHaveBeenCalledTimes(2);
  });

  it('clears a malformed link without applying anything', () => {
    const { incoming, adapter, clear, onResult, offer, layout } = setup();
    offer('garbage');
    incoming.settle(adapter, [model('urn-a', 'ready')]);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(onResult).not.toHaveBeenCalled();
    expect(layout.togglePane).not.toHaveBeenCalled();
    expect(adapter.setCamera).not.toHaveBeenCalled();
  });

  it('does nothing without a link', () => {
    const { incoming, adapter, clear, offer } = setup();
    offer(null);
    incoming.settle(adapter, [model('urn-a', 'ready')]);
    expect(clear).not.toHaveBeenCalled();
    expect(adapter.setCamera).not.toHaveBeenCalled();
  });

  it('waits until the models are listed and none is loading', () => {
    const { incoming, adapter, offer } = setup();
    offer(viewOf(linkWith({})));
    incoming.settle(adapter, []);
    incoming.settle(adapter, [model('urn-a', 'loading')]);
    incoming.settle(adapter, [
      model('urn-a', 'ready'),
      model('urn-b', 'loading'),
    ]);
    expect(adapter.setCamera).not.toHaveBeenCalled();
    incoming.settle(adapter, [model('urn-a', 'ready')]);
    expect(adapter.setCamera).toHaveBeenCalledTimes(1);
  });

  it('keeps the hidden and isolated elements until the models are listed', () => {
    const { incoming, adapter, offer } = setup();
    offer(
      viewOf(
        linkWith({
          nodes: [{ modelId: 'urn-a', hidden: [3], isolated: [4] }],
        }),
      ),
    );
    incoming.settle(adapter, []);
    expect(adapter.restoreState).not.toHaveBeenCalled();
    incoming.settle(adapter, [model('urn-a', 'ready')]);
    incoming.settle(adapter, [model('urn-a', 'ready')]);
    expect(adapter.restoreState).toHaveBeenCalledTimes(1);
    const state = adapter.restoreState.mock.calls[0]?.[0];
    expect(state?.models['urn-a']).toMatchObject({
      hidden: [3],
      isolated: [4],
    });
  });

  it('restores no viewer state for a link without nodes', () => {
    const { incoming, adapter, offer } = setup();
    offer(viewOf(linkWith({})));
    incoming.settle(adapter, [model('urn-a', 'ready')]);
    expect(adapter.restoreState).not.toHaveBeenCalled();
  });

  it('restores panes and charts additively and reports it', () => {
    const { offer, onResult, layout } = setup();
    offer(
      viewOf(
        linkWith({
          panes: { open: ['summary'], collapsed: [] },
          charts: [
            {
              id: 'dashboard',
              view: { property: 'Level', properties: ['Level'] },
            },
          ],
        }),
      ),
    );
    expect(layout.togglePane).toHaveBeenCalledWith('summary');
    expect(PANE_SETTINGS.dashboard.view.read().charts[0]?.property).toBe(
      'Level',
    );
    expect(onResult).toHaveBeenCalledWith(LINK_RESTORED_TEXT, false);
  });

  it('applies the camera of a crafted link that names an unknown pane', () => {
    const { incoming, adapter, onResult, offer, layout } = setup();
    offer('2~1,2,3~0,0,0~0,0,1~p~~|foo');
    incoming.settle(adapter, [model('urn-a', 'ready')]);
    expect(layout.togglePane).not.toHaveBeenCalled();
    expect(layout.setCollapsed).not.toHaveBeenCalled();
    expect(onResult).not.toHaveBeenCalled();
    expect(adapter.setCamera).toHaveBeenCalledWith(
      expect.objectContaining({ eye: [1, 2, 3] }),
    );
  });

  it('keeps an old link to the camera only', () => {
    const { incoming, adapter, onResult, offer } = setup();
    offer('1~1,2,3~0,0,0~0,0,1~p~');
    incoming.settle(adapter, [model('urn-a', 'ready')]);
    expect(onResult).not.toHaveBeenCalled();
    expect(adapter.setCamera).toHaveBeenCalledTimes(1);
  });

  it('does not apply to a scene that holds none of the link models', () => {
    const { incoming, adapter, offer } = setup();
    offer(viewOf(linkWith({})));
    incoming.settle(adapter, [model('urn-b', 'ready')]);
    expect(adapter.setCamera).not.toHaveBeenCalled();
  });
});

describe('incoming link restore', () => {
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
    expect(chartSetting('chart:1').read().charts[0]?.property).toBe('Level');
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
    expect(PANE_SETTINGS.dashboard.view.read().charts[0]?.property).toBe(
      'Level',
    );
    expect(chartSetting('chart:1').read().charts[0]?.property).toBe(
      'Type Name',
    );
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
    expect(chartSetting('chart:1').read().charts[0]?.property).toBe('Mine');
    expect(chartSetting('chart:2').read().charts[0]?.property).toBe('Level');
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
    expect(chartSetting('chart:1').read().charts[0]?.property).toBe('Category');
  });
});
