import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeView, parseView } from '../api/viewLink.js';
import { DEFAULT_DASHBOARD_VIEW } from '../extensions/dashboardPresets.js';
import * as excel from '../extensions/download.js';
import { chartSetting } from '../layout/instanceSettings.js';
import { type LayoutApi, LayoutContext } from '../layout/layoutContext.js';
import { PANE_SETTINGS } from '../settings/paneSettings.js';
import { setStorageAdapter } from '../storage.js';
import { memoryAdapter } from '../storageAdapter.js';
import { notifications } from '../tasks/notifications.js';
import { fireEvent, render, screen, waitFor } from '../test/render.js';
import { createMockViewerAdapter } from './MockViewerAdapter.js';
import { REPORT_TEMPLATES } from './reportTemplates.js';
import {
  REPORT_BLOCKED_TEXT,
  REPORT_READY_TEXT,
  SHARE_ACCESS_HINT,
  ShareMenu,
  snapshotName,
} from './ShareMenu.js';
import { SHARE_INCLUDE } from './shareInclude.js';
import { LINK_DEGRADED_TEXT, LINK_TRIMMED_TEXT } from './shareLink.js';
import { SNAPSHOT, SNAPSHOT_DEFAULTS } from './snapshot.js';
import type { ViewerAdapter, ViewerAdapterFactory } from './ViewerAdapter.js';
import { ViewerPane } from './ViewerPane.js';

const BASE = 'https://app.test/model/urn-a?with=urn-b';

function setup() {
  let adapter: ViewerAdapter | null = null;
  const factory: ViewerAdapterFactory = async (container) => {
    adapter = await createMockViewerAdapter(container);
    return adapter;
  };
  return { factory, adapter: () => adapter as ViewerAdapter | null };
}

let restoreStorage: ReturnType<typeof setStorageAdapter>;
beforeEach(() => {
  restoreStorage = setStorageAdapter(memoryAdapter());
  notifications.clear();
  notifications.clearHistory();
  window.history.replaceState({}, '', '/');
});

function announced(text: string): boolean {
  return notifications
    .getSnapshot()
    .items.some((item) => item.message === text);
}
afterEach(() => {
  vi.restoreAllMocks();
  setStorageAdapter(restoreStorage);
});

describe('Share menu', () => {
  it('copies a link with the camera and selection', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: write } });
    const { factory, adapter } = setup();
    render(
      <ViewerPane
        urn="urn-a"
        factory={factory}
        shareHref={BASE}
        members={[{ urn: 'urn-b' }]}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }));
    adapter()?.selectModelIds?.([{ modelId: 'urn-a', dbId: 100 }]);
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Copy link to this view' }),
    );
    await waitFor(() => expect(write).toHaveBeenCalled());
    const url = new URL(write.mock.calls[0]?.[0] as string);
    expect(url.searchParams.get('with')).toBe('urn-b');
    const link = parseView(url.searchParams.get('view'), ['urn-a', 'urn-b']);
    expect(link?.camera).toEqual({
      eye: [0, 0, 10],
      target: [0, 0, 0],
      up: [0, 1, 0],
      ortho: false,
    });
    expect(link?.selection).toEqual([{ modelId: 'urn-a', dbId: 100 }]);
    expect(link?.charts?.[0]?.id).toBe('dashboard');
    await waitFor(() => expect(announced('Link copied')).toBe(true));
  });

  it('copies a link without a view', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: write } });
    const { factory } = setup();
    render(
      <ViewerPane urn="urn-a" factory={factory} shareHref={`${BASE}&view=x`} />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }));
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Copy link to this model' }),
    );
    await waitFor(() => expect(write).toHaveBeenCalledWith(BASE));
  });

  it('restores camera, selection and panes from the link once and hands the address back', async () => {
    const { factory, adapter } = setup();
    const layout = fakeLayout();
    const onViewConsumed = vi.fn();
    render(
      <LayoutContext.Provider value={layout}>
        <ViewerPane
          urn="urn-a"
          factory={factory}
          initialView={encodeView(
            {
              camera: {
                eye: [5, 6, 7],
                target: [0, 0, 0],
                up: [0, 1, 0],
                ortho: true,
              },
              selection: [{ modelId: 'urn-a', dbId: 101 }],
              panes: { open: ['summary'], collapsed: [] },
            },
            ['urn-a'],
          )}
          onViewConsumed={onViewConsumed}
        />
      </LayoutContext.Provider>,
    );
    await waitFor(() =>
      expect(adapter()?.getCamera?.()).toEqual({
        eye: [5, 6, 7],
        target: [0, 0, 0],
        up: [0, 1, 0],
        ortho: true,
      }),
    );
    expect(adapter()?.getModelSelection()).toEqual([
      { modelId: 'urn-a', dbId: 101 },
    ]);
    await waitFor(() => expect(layout.togglePane).toHaveBeenCalled());
    expect(layout.togglePane).toHaveBeenCalledTimes(1);
    expect(layout.togglePane).toHaveBeenCalledWith('summary');
    expect(onViewConsumed).toHaveBeenCalledTimes(1);
    expect(
      announced(
        'Restored the panes and charts from the link; the summary columns stay local',
      ),
    ).toBe(true);
  });
});

describe('Share menu snapshots', () => {
  it('names the file after the model', () => {
    expect(snapshotName('Tower-v2-properties.xlsx')).toBe(
      'Tower-v2-snapshot.png',
    );
    expect(snapshotName('model-properties.xlsx')).toBe('model-snapshot.png');
    expect(snapshotName()).toBe('model-snapshot.png');
  });

  it('copies and saves the image the adapter returns', async () => {
    const blob = new Blob(['png'], { type: 'image/png' });
    const items: unknown[] = [];
    class Item {
      constructor(readonly data: unknown) {
        items.push(data);
      }
    }
    vi.stubGlobal('ClipboardItem', Item);
    const write = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { write } });
    const save = vi.spyOn(excel, 'saveBlob').mockImplementation(() => {});
    const { factory, adapter } = setup();
    render(
      <ViewerPane
        urn="urn-a"
        factory={factory}
        exportName="Tower-properties.xlsx"
      />,
    );
    await screen.findByRole('button', { name: 'Share' });
    const current = adapter();
    if (current) current.getScreenshot = async () => blob;
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy image' }));
    await waitFor(() => expect(write).toHaveBeenCalled());
    await waitFor(() => expect(announced('Image copied')).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save image (PNG)' }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(blob, 'Tower-snapshot.png'),
    );
    vi.unstubAllGlobals();
  });

  it('reports a failed snapshot', async () => {
    Object.assign(navigator, { clipboard: { write: vi.fn() } });
    const { factory, adapter } = setup();
    render(<ViewerPane urn="urn-a" factory={factory} />);
    await screen.findByRole('button', { name: 'Share' });
    const current = adapter();
    if (current) {
      current.getScreenshot = async () => {
        throw new Error('no');
      };
    }
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save image (PNG)' }));
    await waitFor(() =>
      expect(announced('Could not take the snapshot')).toBe(true),
    );
  });

  it('applies the saved resolution to copy and save', async () => {
    SNAPSHOT.write({ ...SNAPSHOT_DEFAULTS, resolution: '2x' });
    const blob = new Blob(['png'], { type: 'image/png' });
    const getScreenshot = vi.fn().mockResolvedValue(blob);
    const save = vi.spyOn(excel, 'saveBlob').mockImplementation(() => {});
    const onResult = vi.fn();
    render(
      <ShareMenu
        adapter={partialAdapter({ getScreenshot })}
        modelIds={['urn-a']}
        combined={false}
        frameSize={() => ({ width: 800, height: 400 })}
        onResult={onResult}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save image (PNG)' }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(getScreenshot).toHaveBeenCalledWith(1600, 800);
    SNAPSHOT.remove();
  });

  it('fails visibly when a larger size is chosen but the frame is unknown', async () => {
    SNAPSHOT.write({ ...SNAPSHOT_DEFAULTS, resolution: '2x' });
    const getScreenshot = vi.fn();
    const onResult = vi.fn();
    render(
      <ShareMenu
        adapter={partialAdapter({ getScreenshot })}
        modelIds={['urn-a']}
        combined={false}
        frameSize={() => null}
        onResult={onResult}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save image (PNG)' }));
    await waitFor(() =>
      expect(onResult).toHaveBeenCalledWith(
        expect.stringContaining('size of the viewer'),
        true,
      ),
    );
    expect(getScreenshot).not.toHaveBeenCalled();
    SNAPSHOT.remove();
  });

  it('fails visibly when the size is over the cap', async () => {
    SNAPSHOT.write({ ...SNAPSHOT_DEFAULTS, resolution: '2x' });
    const getScreenshot = vi.fn();
    const onResult = vi.fn();
    render(
      <ShareMenu
        adapter={partialAdapter({ getScreenshot })}
        modelIds={['urn-a']}
        combined={false}
        frameSize={() => ({ width: 5000, height: 3000 })}
        onResult={onResult}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save image (PNG)' }));
    await waitFor(() =>
      expect(onResult).toHaveBeenCalledWith(
        expect.stringContaining('Snapshot too large'),
        true,
      ),
    );
    expect(getScreenshot).not.toHaveBeenCalled();
    SNAPSHOT.remove();
  });

  it('saves a viewpoint and lists it, with manage and present entries', async () => {
    const onPresent = vi.fn();
    const onManage = vi.fn();
    const onResult = vi.fn();
    const { factory } = setup();
    const live = await factory(document.createElement('div'));
    render(
      <ShareMenu
        adapter={live}
        modelIds={['urn-a']}
        combined={false}
        onManageViewpoints={onManage}
        onPresent={onPresent}
        onResult={onResult}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save viewpoint' }));
    expect(onResult).toHaveBeenCalledWith('Viewpoint saved', false);
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }));
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Go to Viewpoint 1' }),
    );
    await waitFor(() =>
      expect(onResult).toHaveBeenCalledWith('Viewpoint 1', false),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Present' }));
    expect(onPresent).toHaveBeenCalled();
  });
});

const CAMERA = {
  eye: [0, 0, 10] as const,
  target: [0, 0, 0] as const,
  up: [0, 1, 0] as const,
  ortho: false,
};

function linkAdapter(): ViewerAdapter {
  return partialAdapter({
    getCamera: () => CAMERA,
    getModelSelection: () => [],
  });
}

function partialAdapter(overrides: Partial<ViewerAdapter>): ViewerAdapter {
  return {
    getModels: () => [],
    onModelsChange: () => () => undefined,
    getCamera: () => CAMERA,
    getModelSelection: () => [],
    getState: () => ({ version: 1, camera: null, cutplanes: [], models: {} }),
    restoreState: async () => ({ skippedModels: [], viewerFailed: false }),
    ...overrides,
  } as unknown as ViewerAdapter;
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

function renderShareMenu(adapter: ViewerAdapter) {
  render(
    <ShareMenu
      adapter={adapter}
      modelIds={['urn-a']}
      baseHref="https://app.test/model/urn-a"
      combined={false}
      onResult={vi.fn()}
    />,
  );
}

function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'Share' }));
}

describe('Share menu links', () => {
  it('says the link needs Autodesk access to the files', () => {
    render(
      <ShareMenu
        adapter={linkAdapter()}
        modelIds={['urn-a']}
        baseHref="https://app.test/model/urn-a"
        combined={false}
        onResult={vi.fn()}
      />,
    );
    expect(screen.queryByText(SHARE_ACCESS_HINT)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    const hint = screen.getByRole('menuitem', { name: SHARE_ACCESS_HINT });
    expect(hint).toBeVisible();
    expect(hint).toBeDisabled();
  });

  it('offers the full view as a JSON file when the link is too long', async () => {
    const save = vi.spyOn(excel, 'saveBlob').mockImplementation(() => {});
    PANE_SETTINGS.dashboard.view.write({
      ...DEFAULT_DASHBOARD_VIEW,
      properties: Array.from(
        { length: 200 },
        (_, i) => `Level ${'x'.repeat(60)} ${i}`,
      ),
    });
    const onResult = vi.fn();
    render(
      <ShareMenu
        adapter={linkAdapter()}
        modelIds={['urn-a']}
        baseHref="https://app.test/model/urn-a"
        combined={false}
        onResult={onResult}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Save view data (JSON)' }),
    );
    await waitFor(() => expect(save).toHaveBeenCalled());
    const [blob, name] = save.mock.calls[0] as [Blob, string];
    expect(name).toBe('model-view.json');
    const file = JSON.parse(await blob.text()) as {
      kind: string;
      models: string[];
      view: { camera: unknown; charts: unknown[] };
    };
    expect(file.kind).toBe('bsh-view');
    expect(file.models).toEqual(['urn-a']);
    expect(file.view.camera).toEqual(CAMERA);
    expect(file.view.charts?.length).toBeGreaterThan(0);
    expect(onResult).toHaveBeenCalledWith('View data saved', false);
  });

  it('offers no view file when the whole view fits the link', async () => {
    render(
      <ShareMenu
        adapter={linkAdapter()}
        modelIds={['urn-a']}
        baseHref="https://app.test/model/urn-a"
        combined={false}
        onResult={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(
      screen.queryByRole('menuitem', { name: 'Save view data (JSON)' }),
    ).toBeNull();
  });

  it('copies the panes and charts of the layout', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: write } });
    const layout = fakeLayout({ openPanes: ['summary'] });
    render(
      <LayoutContext.Provider value={layout}>
        <ShareMenu
          adapter={linkAdapter()}
          modelIds={['urn-a']}
          baseHref="https://app.test/model/urn-a"
          combined={false}
          onResult={vi.fn()}
        />
      </LayoutContext.Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Copy link to this view' }),
    );
    await waitFor(() => expect(write).toHaveBeenCalled());
    const link = parseView(
      new URL(write.mock.calls[0]?.[0] as string).searchParams.get('view'),
      ['urn-a'],
    );
    expect(link?.panes?.open).toEqual(['summary']);
    expect(link?.charts?.[0]?.id).toBe('dashboard');
  });

  it('copies a camera-only link and says why when the view is too long', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: write } });
    PANE_SETTINGS.dashboard.view.write({
      ...DEFAULT_DASHBOARD_VIEW,
      properties: Array.from(
        { length: 200 },
        (_, i) => `Level ${'x'.repeat(60)} ${i}`,
      ),
    });
    const onResult = vi.fn();
    render(
      <ShareMenu
        adapter={linkAdapter()}
        modelIds={['urn-a']}
        baseHref="https://app.test/model/urn-a"
        combined={false}
        onResult={onResult}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Copy link to this view' }),
    );
    await waitFor(() =>
      expect(onResult).toHaveBeenCalledWith(LINK_DEGRADED_TEXT, false),
    );
    const view = new URL(write.mock.calls[0]?.[0] as string).searchParams.get(
      'view',
    );
    expect(view?.startsWith('1~')).toBe(true);
    expect(parseView(view, ['urn-a'])?.charts).toBeUndefined();
  });

  it('says which chart panes did not fit in the link', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: write } });
    for (let i = 1; i <= 4; i += 1) {
      chartSetting(`chart:${i}`).write({
        ...DEFAULT_DASHBOARD_VIEW,
        property: `Level ${i}`,
        properties: [`Level ${i}`],
      });
    }
    const onResult = vi.fn();
    render(
      <ShareMenu
        adapter={linkAdapter()}
        modelIds={['urn-a']}
        baseHref="https://app.test/model/urn-a"
        combined={false}
        onResult={onResult}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Copy link to this view' }),
    );
    await waitFor(() =>
      expect(onResult).toHaveBeenCalledWith(LINK_TRIMMED_TEXT, false),
    );
  });
});

describe('Share menu include options', () => {
  function selectionAdapter(): ViewerAdapter {
    return partialAdapter({
      getCamera: () => CAMERA,
      getModelSelection: () => [{ modelId: 'urn-a', dbId: 7 }],
    });
  }

  it('copies a link without the selection when Include selection is off', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: write } });
    renderShareMenu(selectionAdapter());
    await openMenu();
    fireEvent.click(
      screen.getByRole('menuitemcheckbox', { name: 'Include selection' }),
    );
    await openMenu();
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Copy link to this view' }),
    );
    await waitFor(() => expect(write).toHaveBeenCalled());
    const href = String(write.mock.calls.at(-1)?.[0]);
    const parsed = parseView(new URL(href).searchParams.get('view') ?? '', [
      'urn-a',
    ]);
    expect(parsed?.selection).toEqual([]);
    expect(SHARE_INCLUDE.read().selection).toBe(false);
  });
});

describe('Share menu report', () => {
  function fakeWindow() {
    const write = vi.fn();
    const print = vi.fn();
    const win = {
      document: {
        readyState: 'complete',
        open: vi.fn(),
        write,
        close: vi.fn(),
      },
      print,
      addEventListener: vi.fn(),
    };
    return { win: win as unknown as Window, write, print };
  }

  function openReportDialog() {
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Print report...' }));
  }

  it('prints the snapshot, the title and the summary of the model', async () => {
    const blob = new Blob(['png'], { type: 'image/png' });
    const getScreenshot = vi.fn().mockResolvedValue(blob);
    const { win, write, print } = fakeWindow();
    vi.spyOn(window, 'open').mockReturnValue(win);
    const onResult = vi.fn();
    const { factory } = setup();
    const live = await factory(document.createElement('div'));
    await live.load('urn-a');
    live.getScreenshot = getScreenshot;
    render(
      <ShareMenu
        adapter={live}
        modelIds={['urn-a']}
        combined={false}
        caption={{ name: 'Tower', version: 'v2' }}
        onResult={onResult}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Print report...' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Print' }));
    await waitFor(() => expect(print).toHaveBeenCalled());
    expect(getScreenshot).toHaveBeenCalledTimes(1);
    const html = String(write.mock.calls.at(-1)?.[0]);
    expect(html).toContain('<h1>Tower</h1>');
    expect(html).toContain('v2');
    expect(html).toContain('data:image/png;base64,cG5n');
    expect(html).toContain('<h2>Summary</h2>');
    expect(onResult).toHaveBeenCalledWith(REPORT_READY_TEXT, false);
  });

  it('prints only the sections, title, notes and orientation of the report', async () => {
    const blob = new Blob(['png'], { type: 'image/png' });
    const getScreenshot = vi.fn().mockResolvedValue(blob);
    const { win, write, print } = fakeWindow();
    vi.spyOn(window, 'open').mockReturnValue(win);
    const { factory } = setup();
    const live = await factory(document.createElement('div'));
    await live.load('urn-a');
    live.getScreenshot = getScreenshot;
    render(
      <ShareMenu
        adapter={live}
        modelIds={['urn-a']}
        combined={false}
        caption={{ name: 'Tower', version: 'v2' }}
        onResult={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Print report...' }));
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Level 3 review' },
    });
    fireEvent.change(screen.getByLabelText('Notes'), {
      target: { value: 'Checked <b>on site</b>' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Snapshot' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Orientation' }), {
      target: { value: 'landscape' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    await waitFor(() => expect(print).toHaveBeenCalled());
    const html = String(write.mock.calls.at(-1)?.[0]);
    expect(html).toContain('<h1>Level 3 review</h1>');
    expect(html).toContain('Checked &lt;b&gt;on site&lt;/b&gt;');
    expect(html).not.toContain('<img');
    expect(html).toContain('<h2>Summary</h2>');
    expect(html).toContain('@page { size: landscape }');
    expect(getScreenshot).not.toHaveBeenCalled();
  });

  it('closes the report options without printing', async () => {
    const { print } = fakeWindow();
    const { factory } = setup();
    const live = await factory(document.createElement('div'));
    await live.load('urn-a');
    render(
      <ShareMenu
        adapter={live}
        modelIds={['urn-a']}
        combined={false}
        onResult={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Print report...' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(print).not.toHaveBeenCalled();
  });

  it('saves the report options as a template and applies it next time', async () => {
    renderShareMenu(linkAdapter());
    await openReportDialog();
    fireEvent.change(screen.getByLabelText('Notes'), {
      target: { value: 'Weekly' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Dashboard' }));
    fireEvent.change(screen.getByLabelText('Template name'), {
      target: { value: 'Weekly' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    expect(REPORT_TEMPLATES.list().map((item) => item.name)).toEqual([
      'Weekly',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await openReportDialog();
    fireEvent.change(screen.getByLabelText('Template'), {
      target: { value: REPORT_TEMPLATES.list()[0]?.id },
    });
    expect(screen.getByLabelText('Notes')).toHaveValue('Weekly');
    expect(
      screen.getByRole('checkbox', { name: 'Dashboard' }),
    ).not.toBeChecked();
  });

  it('asks for pop-ups when the report window is blocked', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const onResult = vi.fn();
    const { factory } = setup();
    const live = await factory(document.createElement('div'));
    await live.load('urn-a');
    live.getScreenshot = async () => new Blob(['png'], { type: 'image/png' });
    render(
      <ShareMenu
        adapter={live}
        modelIds={['urn-a']}
        combined={false}
        onResult={onResult}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Print report...' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Print' }));
    await waitFor(() =>
      expect(onResult).toHaveBeenCalledWith(REPORT_BLOCKED_TEXT, true),
    );
  });
});
