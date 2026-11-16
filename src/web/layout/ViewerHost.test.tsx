import { useCallback, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '../test/render.js';
import { MockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import type { ViewerAdapterFactory } from '../viewer/ViewerAdapter.js';
import { ViewerPane } from '../viewer/ViewerPane.js';
import { createHostStore, PaneHosts, PaneSlot } from './ViewerHost.js';

type Where = 'left' | 'right' | 'none';

function Harness({
  factory,
  where,
}: {
  factory: ViewerAdapterFactory;
  where: Where;
}) {
  const [hosts] = useState(() => createHostStore<'viewer'>());
  const [attached, setAttached] = useState(false);
  const [signal, setSignal] = useState(0);
  const onAttach = useCallback(() => {
    setAttached(true);
    setSignal((n) => n + 1);
  }, []);
  return (
    <>
      <div data-testid="left">
        {where === 'left' ? (
          <PaneSlot hosts={hosts} id="viewer" onAttach={onAttach} />
        ) : null}
      </div>
      <div data-testid="right">
        {where === 'right' ? (
          <PaneSlot hosts={hosts} id="viewer" onAttach={onAttach} />
        ) : null}
      </div>
      <PaneHosts
        hosts={hosts}
        panes={attached ? ['viewer'] : []}
        render={() => (
          <ViewerPane urn="abc" factory={factory} resizeSignal={signal} />
        )}
      />
    </>
  );
}

function spiedFactory() {
  const load = vi.spyOn(MockViewerAdapter.prototype, 'load');
  const destroy = vi.spyOn(MockViewerAdapter.prototype, 'destroy');
  const resize = vi.spyOn(MockViewerAdapter.prototype, 'resize');
  const factory: ViewerAdapterFactory = async (container) =>
    new MockViewerAdapter(container);
  return { factory, load, destroy, resize };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pane hosts', () => {
  it('keeps one viewer alive while its host moves between slots', async () => {
    const { factory, load, destroy, resize } = spiedFactory();
    const view = render(<Harness factory={factory} where="left" />);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    const scene = screen.getByLabelText('Mock building model');
    expect(screen.getByTestId('left')).toContainElement(scene);
    resize.mockClear();

    view.rerender(<Harness factory={factory} where="right" />);
    expect(screen.getByTestId('right')).toContainElement(scene);
    expect(resize).toHaveBeenCalledTimes(1);

    view.rerender(<Harness factory={factory} where="none" />);
    expect(scene.isConnected).toBe(false);
    view.rerender(<Harness factory={factory} where="left" />);
    expect(screen.getByTestId('left')).toContainElement(scene);
    expect(resize).toHaveBeenCalledTimes(2);

    expect(destroy).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(1);
    expect(screen.getAllByLabelText('Mock building model')).toHaveLength(1);
  });

  it('does not create the viewer before its host is attached', async () => {
    const { factory, load } = spiedFactory();
    const view = render(<Harness factory={factory} where="none" />);
    await act(async () => {});
    expect(load).not.toHaveBeenCalled();
    view.rerender(<Harness factory={factory} where="right" />);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  });

  it('reuses one host element per pane id', () => {
    const hosts = createHostStore<'tree' | 'viewer'>();
    expect(hosts.get('tree')).toBe(hosts.get('tree'));
    expect(hosts.get('tree')).not.toBe(hosts.get('viewer'));
    expect(hosts.get('viewer').dataset.pane).toBe('viewer');
  });
});
