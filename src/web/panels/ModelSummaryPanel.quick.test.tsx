import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMemoryStorage } from '../test/mockApi.js';
import { fireEvent, render, screen } from '../test/render.js';
import { withSummaryProperties } from '../test/summaryProperties.js';
import { MockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import { ModelSummaryPanel } from './ModelSummaryPanel.js';

type Listener = (
  entries: { borderBoxSize: { inlineSize: number; blockSize: number }[] }[],
) => void;
const listeners: Listener[] = [];
const adapters: MockViewerAdapter[] = [];

function resize(width: number, height: number) {
  act(() => {
    for (const listener of listeners) {
      listener([{ borderBoxSize: [{ inlineSize: width, blockSize: height }] }]);
    }
  });
}

async function open() {
  const adapter = new MockViewerAdapter(document.createElement('div'));
  await adapter.load('urn');
  adapters.push(adapter);
  render(
    <ModelSummaryPanel
      adapter={adapter}
      {...withSummaryProperties(['Category'])}
      onOpenSettings={vi.fn()}
    />,
  );
  await screen.findByRole('cell', { name: 'Walls' });
}

const toggle = () => screen.getByRole('button', { name: 'Summary controls' });
const refresh = () => screen.queryByRole('button', { name: 'Refresh' });

beforeEach(() => {
  installMemoryStorage();
  listeners.length = 0;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(listener: Listener) {
        listeners.push(listener);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  for (const adapter of adapters.splice(0)) adapter.destroy();
  vi.unstubAllGlobals();
});

describe('ModelSummaryPanel quick settings', () => {
  it('hides the header controls in a narrow pane and keeps the filter', async () => {
    await open();
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(refresh()).toBeInTheDocument();
    resize(338, 800);
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(refresh()).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Summary settings' }),
    ).toBeNull();
    const panel = document.getElementById(
      toggle().getAttribute('aria-controls') ?? '',
    );
    expect(panel).toHaveAttribute('inert');
    expect(screen.getByLabelText('Filter summary rows')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Summary actions' }),
    ).toBeInTheDocument();
  });

  it('shows the controls on demand and moves focus back when they hide', async () => {
    await open();
    resize(338, 800);
    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    resize(300, 800);
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    refresh()?.focus();
    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    resize(900, 800);
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    refresh()?.focus();
    resize(300, 800);
    expect(toggle()).toHaveFocus();
  });
});
