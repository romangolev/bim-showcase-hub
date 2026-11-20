import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PropertyRow } from '../../shared/types.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { fireEvent, render, screen, waitFor } from '../test/render.js';
import { MockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import { abortError, type ReadOptions } from '../viewer/propertyReads.js';
import { ModelSummaryPanel } from './ModelSummaryPanel.js';

class SlowAdapter extends MockViewerAdapter {
  override getLeafProperties(
    _names: string[],
    _ids?: readonly string[],
    options?: ReadOptions,
  ): Promise<PropertyRow[]> {
    options?.onProgress?.({
      phase: 'rows',
      loaded: 2000,
      total: 8000,
      partial: true,
    });
    return new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(abortError()));
    });
  }
}

const adapters: MockViewerAdapter[] = [];

class SlowFirstAdapter extends MockViewerAdapter {
  private reads = 0;

  override getLeafProperties(
    names: string[],
    ids?: readonly string[],
    options?: ReadOptions,
  ): Promise<PropertyRow[]> {
    this.reads += 1;
    if (this.reads === 1) return super.getLeafProperties(names, ids, options);
    return new Promise((_resolve, reject) => {
      options?.onProgress?.({
        phase: 'rows',
        loaded: 1000,
        total: 3000,
        partial: true,
      });
      options?.signal?.addEventListener('abort', () => reject(abortError()));
    });
  }
}

beforeEach(() => {
  installMemoryStorage();
});

afterEach(() => {
  for (const a of adapters.splice(0)) a.destroy();
});

describe('summary progress and cancel', () => {
  it('shows progress, cancels and labels the missing data', async () => {
    const adapter = new SlowAdapter(document.createElement('div'));
    await adapter.load('urn');
    adapters.push(adapter);
    render(
      <ModelSummaryPanel adapter={adapter} propertyNames={['Category']} />,
    );
    await screen.findByText(
      'Reading element properties: 2,000 of 8,000 (partial data)',
    );
    expect(
      screen.getByRole('progressbar', { name: 'Reading element properties' }),
    ).toHaveAttribute('value', '2000');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(
        screen.getByText(/The read was cancelled, so there is nothing/),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Read again' }),
    ).toBeInTheDocument();
  });

  it('keeps the table on screen while a refresh reads again', async () => {
    const adapter = new SlowFirstAdapter(document.createElement('div'));
    await adapter.load('urn');
    adapters.push(adapter);
    render(
      <ModelSummaryPanel adapter={adapter} propertyNames={['Category']} />,
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Filter summary rows')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() =>
      expect(
        screen.getByText(/Reading element properties/),
      ).toBeInTheDocument(),
    );
    expect(screen.getByLabelText('Filter summary rows')).toBeInTheDocument();
  });
});
