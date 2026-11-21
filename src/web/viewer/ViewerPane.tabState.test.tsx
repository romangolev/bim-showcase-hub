import { describe, expect, it } from 'vitest';
import { installMemoryStorage } from '../test/mockApi.js';
import { act, fireEvent, render, waitFor } from '../test/render.js';
import { createMockViewerAdapter } from './MockViewerAdapter.js';
import type { ViewerAdapter, ViewerState } from './ViewerAdapter.js';
import { ViewerPane } from './ViewerPane.js';

const URN = 'dXJuOmFkc2s';
const DB_ID = 100;

interface PaneProps {
  savedState?: ViewerState | null;
  initialView?: string | null;
  onSaveState?: (state: ViewerState) => void;
}

async function renderPane(props: PaneProps = {}) {
  installMemoryStorage();
  let ready: (adapter: ViewerAdapter) => void = () => {};
  const loaded = new Promise<ViewerAdapter>((resolve) => {
    ready = resolve;
  });
  const view = render(
    <ViewerPane
      urn={URN}
      factory={async (host) => createMockViewerAdapter(host)}
      tools={false}
      onReady={(adapter) => ready(adapter)}
      {...props}
    />,
  );
  const adapter = await loaded;
  await act(async () => {});
  return { ...view, adapter };
}

describe('ViewerPane tab state', () => {
  it('saves the state before the adapter is destroyed and restores it on the next mount', async () => {
    const saved: ViewerState[] = [];
    const first = await renderPane({
      onSaveState: (state) => saved.push(state),
    });
    act(() => {
      first.adapter.hideModelIds([{ modelId: URN, dbId: DB_ID }]);
    });
    first.unmount();
    expect(saved.at(-1)?.models[URN]?.hidden).toContain(DB_ID);
    const second = await renderPane({ savedState: saved.at(-1) ?? null });
    await waitFor(() =>
      expect(second.adapter.getState().models[URN]?.hidden).toContain(DB_ID),
    );
  });

  it('saves the state on pagehide', async () => {
    const saved: ViewerState[] = [];
    const pane = await renderPane({
      onSaveState: (state) => saved.push(state),
    });
    act(() => {
      pane.adapter.hideModelIds([{ modelId: URN, dbId: DB_ID }]);
      fireEvent(window, new Event('pagehide'));
    });
    expect(saved.at(-1)?.models[URN]?.hidden).toContain(DB_ID);
    pane.unmount();
  });

  it('does not restore when a share link is waiting', async () => {
    const state: ViewerState = {
      version: 1,
      camera: null,
      cutplanes: [],
      models: { [URN]: { isolated: [], hidden: [DB_ID], selection: [] } },
    };
    const pane = await renderPane({ savedState: state, initialView: '1~x' });
    expect(pane.adapter.getState().models[URN]?.hidden ?? []).not.toContain(
      DB_ID,
    );
    pane.unmount();
  });

  it('does not save when the adapter never finished loading', async () => {
    const saved: ViewerState[] = [];
    const view = render(
      <ViewerPane
        urn={URN}
        factory={() => new Promise<ViewerAdapter>(() => {})}
        tools={false}
        onSaveState={(state) => saved.push(state)}
      />,
    );
    view.unmount();
    expect(saved).toEqual([]);
  });
});
