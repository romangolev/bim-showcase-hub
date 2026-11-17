import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '../test/render.js';
import { createMockViewerAdapter } from './MockViewerAdapter.js';
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

afterEach(() => vi.restoreAllMocks());

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
