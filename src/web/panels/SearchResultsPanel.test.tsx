import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifications } from '../tasks/notifications.js';
import { installMemoryStorage, stubLayout } from '../test/mockApi.js';
import { MockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import { buildMockElements } from '../viewer/mockModel.js';
import type { ModelDbId } from '../viewer/modelSet.js';
import { SELECTION_SETS } from '../viewer/selectionSets.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { SearchResultsPanel } from './SearchResultsPanel.js';

const adapters: MockViewerAdapter[] = [];

async function loaded(): Promise<MockViewerAdapter> {
  const adapter = new MockViewerAdapter(document.createElement('div'));
  await adapter.load('urn');
  adapters.push(adapter);
  return adapter;
}

const name = buildMockElements()[0]?.name ?? '';

async function search(adapter: ViewerAdapter, text = name) {
  render(<SearchResultsPanel adapter={adapter} />);
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search elements' }), {
    target: { value: text },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  await waitFor(() =>
    expect(
      screen.getByRole('listbox', { name: 'Search results' }),
    ).toBeInTheDocument(),
  );
}

beforeEach(() => {
  installMemoryStorage();
  stubLayout();
});

afterEach(() => {
  for (const adapter of adapters.splice(0)) adapter.destroy();
  vi.unstubAllGlobals();
});

describe('SearchResultsPanel', () => {
  it('lists the elements whose name matches the search', async () => {
    const adapter = await loaded();
    await search(adapter);
    expect((await screen.findAllByText(name)).length).toBeGreaterThan(0);
  });

  it('selects every result from Select all', async () => {
    const adapter = await loaded();
    const expected = (await adapter.searchElements(name)).items;
    const select = vi.spyOn(adapter, 'selectModelIds');
    await search(adapter);
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
    expect(select).toHaveBeenCalledWith(expected);
  });

  it('selects and fits one element from a result row', async () => {
    const adapter = await loaded();
    const expected = (await adapter.searchElements(name)).items[0] as ModelDbId;
    const fit = vi.spyOn(adapter, 'fitToView');
    await search(adapter);
    fireEvent.click((await screen.findAllByRole('option'))[0] as HTMLElement);
    expect(adapter.getModelSelection()).toEqual([expected]);
    expect(fit).toHaveBeenCalledWith([expected]);
  });

  it('saves the results as a named selection set', async () => {
    notifications.clear();
    notifications.clearHistory();
    const adapter = await loaded();
    await search(adapter);
    fireEvent.click(
      screen.getByRole('button', { name: 'Save as selection set' }),
    );
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Selection set name' }),
      {
        target: { value: 'Walls' },
      },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(SELECTION_SETS.list().map((set) => set.name)).toContain('Walls'),
    );
    expect(notifications.getSnapshot().items.at(-1)?.message).toContain(
      'Saved the selection set "Walls"',
    );
  });

  it('says when the results are capped', async () => {
    const items = Array.from({ length: 5005 }, (_, dbId) => ({
      modelId: 'm',
      dbId,
    }));
    const adapter = {
      searchElements: vi.fn().mockResolvedValue({ items, failedModels: [] }),
      getElementsProperties: vi.fn(async (list: ModelDbId[]) =>
        list.map((item) => ({
          dbId: item.dbId,
          name: `E${item.dbId}`,
          properties: [],
        })),
      ),
      getModels: () => [
        {
          id: 'm',
          urn: 'm',
          name: 'Tower.rvt',
          visible: true,
          status: 'ready',
        },
      ],
      getModelSelection: () => [],
      selectModelIds: vi.fn(),
      isolateModelIds: vi.fn(),
      fitToView: vi.fn(),
      onModelsChange: () => () => undefined,
    } as unknown as ViewerAdapter;
    await search(adapter, 'door');
    expect(
      await screen.findByText('Showing the first 5,000 results'),
    ).toBeInTheDocument();
  });
});
