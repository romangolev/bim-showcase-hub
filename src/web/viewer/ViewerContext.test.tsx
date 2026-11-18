import { act, render } from '@testing-library/react';
import { useContext, useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePublishedAdapter } from './activeAdapterStore.js';
import type { ViewerAdapter } from './ViewerAdapter.js';
import { ActiveViewerContext, ViewerProvider } from './ViewerContext.js';

const history: (ViewerAdapter | null)[] = [];

vi.mock('./activeAdapterStore.js', async (original) => {
  const real = await original<typeof import('./activeAdapterStore.js')>();
  const record =
    <A extends unknown[]>(fn: (...args: A) => void) =>
    (...args: A) => {
      fn(...args);
      history.push(real.currentAdapter());
    };
  return {
    ...real,
    publishActiveAdapter: record(real.publishActiveAdapter),
    releaseActiveAdapter: record(real.releaseActiveAdapter),
  };
});

const first = { name: 'first' } as unknown as ViewerAdapter;
const second = { name: 'second' } as unknown as ViewerAdapter;

function Publisher({ id, adapter }: { id: string; adapter: ViewerAdapter }) {
  const ctx = useContext(ActiveViewerContext);
  useEffect(() => {
    ctx?.publish(id, adapter);
  }, [ctx, id, adapter]);
  return null;
}

const seen: (ViewerAdapter | null)[] = [];

function Spy() {
  seen.push(usePublishedAdapter());
  return null;
}

afterEach(() => {
  seen.length = 0;
  history.length = 0;
});

describe('ViewerProvider', () => {
  it('never publishes null while the adapter changes', () => {
    const tree = (active: string) => (
      <ViewerProvider active={active}>
        <Publisher id="a" adapter={first} />
        <Publisher id="b" adapter={second} />
        <Spy />
      </ViewerProvider>
    );
    const { rerender } = render(tree('a'));
    expect(seen.at(-1)).toBe(first);
    history.length = 0;
    rerender(tree('b'));
    expect(seen.at(-1)).toBe(second);
    expect(history).not.toContain(null);
  });

  it('keeps the adapter another provider owns when one unmounts', () => {
    const owner = render(
      <ViewerProvider active="a">
        <Publisher id="a" adapter={first} />
        <Spy />
      </ViewerProvider>,
    );
    const other = render(<ViewerProvider>{null}</ViewerProvider>);
    act(() => other.unmount());
    expect(seen.at(-1)).toBe(first);
    owner.unmount();
  });

  it('clears the adapter when its own provider unmounts', () => {
    const owner = render(
      <ViewerProvider active="a">
        <Publisher id="a" adapter={first} />
      </ViewerProvider>,
    );
    const spy = render(<Spy />);
    expect(seen.at(-1)).toBe(first);
    owner.unmount();
    spy.rerender(<Spy />);
    expect(seen.at(-1)).toBeNull();
  });
});
