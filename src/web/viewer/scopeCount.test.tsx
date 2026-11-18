import {
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installMemoryStorage } from '../test/mockApi.js';
import { ExcelExportTool } from '../tools/excel/ExcelExportTool.js';
import { EXCEL_SETTINGS_KEY } from '../tools/excel/excelSettings.js';
import { MockViewerAdapter } from './MockViewerAdapter.js';
import { readScopedRows } from './propertyScope.js';
import { countScopedRows, useScopeCount } from './scopeCount.js';
import { deleteSet, listSets, saveSelectionSet } from './selectionSets.js';
import { forgetLeafRows } from './sharedLeafRows.js';
import { ActiveViewerContext } from './ViewerContext.js';

beforeEach(() => {
  installMemoryStorage();
});

async function combined() {
  const adapter = new MockViewerAdapter(document.createElement('div'));
  await adapter.loadModels([{ urn: 'urn-a' }, { urn: 'urn-b' }]);
  return adapter;
}

describe('countScopedRows', () => {
  it('is unknown on a cold cache and never starts a read', async () => {
    const adapter = await combined();
    const read = vi.spyOn(adapter, 'getLeafProperties');
    expect(await countScopedRows(adapter, {})).toBeNull();
    expect(read).not.toHaveBeenCalled();
    adapter.destroy();
  });

  it('matches the rows an export reads, for every scope and model choice', async () => {
    const adapter = await combined();
    const { rows: all } = await readScopedRows(adapter, {
      names: ['Category'],
    });
    const picked = all.slice(0, 3).map((row) => ({
      modelId: row.modelId ?? '',
      dbId: row.dbId,
    }));
    adapter.selectModelIds(picked);
    saveSelectionSet('Three', picked);
    const setScope = `set:${listSets()[0]?.id}` as const;
    for (const elements of ['all', 'selected', setScope] as const) {
      for (const models of ['all', 'urn-a', 'urn-b']) {
        const exported = await readScopedRows(adapter, {
          names: ['Category'],
          scope: { models, elements },
        });
        expect(await countScopedRows(adapter, { models, elements })).toBe(
          exported.rows.length,
        );
      }
    }
    forgetLeafRows(adapter);
    expect(await countScopedRows(adapter, {})).toBeNull();
    adapter.destroy();
  });
});

function settings(adapter: MockViewerAdapter) {
  window.localStorage.setItem(
    EXCEL_SETTINGS_KEY,
    JSON.stringify({ scope: 'all' }),
  );
  return render(
    <ActiveViewerContext.Provider
      value={{
        adapter,
        activeKey: 'k',
        publish: () => undefined,
        withdraw: () => undefined,
      }}
    >
      {new ExcelExportTool().renderSettings()}
    </ActiveViewerContext.Provider>,
  );
}

describe('Excel settings window count', () => {
  it('reads once on a cold cache and shows the count, then follows the model choice', async () => {
    const adapter = await combined();
    const read = vi.spyOn(adapter, 'getLeafProperties');
    settings(adapter);
    const { rows } = await act(() =>
      readScopedRows(adapter, { names: ['Category'] }),
    );
    expect(
      await screen.findByText(
        `Rows to export: ${rows.length.toLocaleString('en-US')}`,
      ),
    ).toBeTruthy();
    expect(read.mock.calls.length).toBeLessThanOrEqual(4);
    fireEvent.change(screen.getByLabelText('Models'), {
      target: { value: 'urn-a' },
    });
    expect(
      await screen.findByText(
        `Rows to export: ${(rows.length / 2).toLocaleString('en-US')}`,
      ),
    ).toBeTruthy();
    adapter.destroy();
  });

  it('says n/a when no model is shown', async () => {
    const adapter = new MockViewerAdapter(document.createElement('div'));
    settings(adapter);
    expect(await screen.findByText(/n\/a/)).toBeTruthy();
    adapter.destroy();
  });

  it('shows an error once and does not poll when the read fails', async () => {
    const adapter = await combined();
    const read = vi
      .spyOn(adapter, 'getLeafProperties')
      .mockRejectedValue(new Error('boom'));
    settings(adapter);
    expect(await screen.findByText(/could not be counted/)).toBeTruthy();
    const calls = read.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect(read.mock.calls.length).toBe(calls);
    adapter.destroy();
  }, 10000);

  it('asks before reading a large model and counts on request', async () => {
    const adapter = await combined();
    vi.spyOn(adapter, 'getModelWeight').mockReturnValue(200_000);
    const read = vi.spyOn(adapter, 'getLeafProperties');
    settings(adapter);
    expect(await screen.findByText(/model is large/)).toBeTruthy();
    expect(read).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Count now' }));
    expect(await screen.findByText(/Rows to export: \d/)).toBeTruthy();
    expect(read).toHaveBeenCalled();
    adapter.destroy();
  });

  it('aborts the read when the window closes', async () => {
    const adapter = await combined();
    const signals: (AbortSignal | undefined)[] = [];
    vi.spyOn(adapter, 'getLeafProperties').mockImplementation(
      (_names, _ids, options) => {
        signals.push(options?.signal);
        return new Promise(() => undefined);
      },
    );
    const view = settings(adapter);
    await waitFor(() => expect(signals.length).toBeGreaterThan(0));
    view.unmount();
    expect(signals.every((signal) => signal?.aborted)).toBe(true);
    adapter.destroy();
  });
});

describe('useScopeCount staleness', () => {
  it('follows isolate and hide, which do not change the selection', async () => {
    const adapter = await combined();
    const { rows } = await readScopedRows(adapter, { names: [] });
    const first = rows.slice(0, 2).map((row) => ({
      modelId: row.modelId ?? '',
      dbId: row.dbId,
    }));
    const isolated = renderHook(() =>
      useScopeCount(adapter, { elements: 'isolated' }),
    );
    const visible = renderHook(() =>
      useScopeCount(adapter, { elements: 'visible' }),
    );
    await waitFor(() =>
      expect(visible.result.current.count).toEqual({
        status: 'ready',
        count: rows.length,
      }),
    );
    act(() => adapter.isolateModelIds(first));
    await waitFor(() =>
      expect(isolated.result.current.count).toEqual({
        status: 'ready',
        count: 2,
      }),
    );
    act(() => adapter.showAll());
    act(() => adapter.hideModelIds(first));
    await waitFor(() =>
      expect(visible.result.current.count).toEqual({
        status: 'ready',
        count: rows.length - 2,
      }),
    );
    adapter.destroy();
  });

  it('notices a deleted set replaced by another of the same count', async () => {
    const adapter = await combined();
    const { rows } = await readScopedRows(adapter, { names: [] });
    const items = rows.slice(0, 3).map((row) => ({
      modelId: row.modelId ?? '',
      dbId: row.dbId,
    }));
    saveSelectionSet('One', items);
    const id = listSets()[0]?.id ?? '';
    const view = renderHook(() =>
      useScopeCount(adapter, { elements: `set:${id}` }),
    );
    await waitFor(() =>
      expect(view.result.current.count).toEqual({ status: 'ready', count: 3 }),
    );
    act(() => {
      deleteSet(id);
      saveSelectionSet('Two', items);
    });
    await waitFor(() =>
      expect(view.result.current.count).toEqual({
        status: 'ready',
        count: rows.length,
      }),
    );
    adapter.destroy();
  });
});
