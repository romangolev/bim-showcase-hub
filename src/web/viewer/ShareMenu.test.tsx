import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as excel from '../extensions/excelExport.js';
import { setStorageAdapter } from '../storage.js';
import { memoryAdapter } from '../storageAdapter.js';
import { fireEvent, render, screen, waitFor } from '../test/render.js';
import { createMockViewerAdapter } from './MockViewerAdapter.js';
import { ShareMenu, snapshotName } from './ShareMenu.js';
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
});
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
    expect(url.searchParams.get('view')).toBe('1~0,0,10~0,0,0~0,1,0~p~0:100');
    expect(await screen.findByText('Link copied')).toBeInTheDocument();
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

  it('restores the camera and selection from the link once loaded', async () => {
    const { factory, adapter } = setup();
    render(
      <ViewerPane
        urn="urn-a"
        factory={factory}
        initialView="1~5,6,7~0,0,0~0,1,0~o~0:101"
      />,
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
    expect(await screen.findByText('Image copied')).toBeInTheDocument();
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
    expect(
      await screen.findByText('Could not take the snapshot'),
    ).toBeInTheDocument();
  });

  it('applies the saved resolution to copy and save', async () => {
    SNAPSHOT.write({ ...SNAPSHOT_DEFAULTS, resolution: '2x' });
    const blob = new Blob(['png'], { type: 'image/png' });
    const getScreenshot = vi.fn().mockResolvedValue(blob);
    const save = vi.spyOn(excel, 'saveBlob').mockImplementation(() => {});
    const onResult = vi.fn();
    render(
      <ShareMenu
        adapter={{ getScreenshot } as unknown as ViewerAdapter}
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
        adapter={{ getScreenshot } as unknown as ViewerAdapter}
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
        adapter={{ getScreenshot } as unknown as ViewerAdapter}
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
