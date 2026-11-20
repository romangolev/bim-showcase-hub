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
});
