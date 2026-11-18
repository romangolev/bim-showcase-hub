import { fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installMemoryStorage } from '../test/mockApi.js';
import { ExcelExportTool } from '../tools/excel/ExcelExportTool.js';
import { EXCEL_SETTINGS_KEY } from '../tools/excel/excelSettings.js';
import { MockViewerAdapter } from './MockViewerAdapter.js';
import { readScopedRows } from './propertyScope.js';
import { countScopedRows } from './scopeCount.js';
import { listSets, saveSelectionSet } from './selectionSets.js';
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

describe('Excel settings window count', () => {
  it('shows counting until rows are cached, then the live count', async () => {
    const adapter = await combined();
    window.localStorage.setItem(
      EXCEL_SETTINGS_KEY,
      JSON.stringify({ scope: 'all' }),
    );
    render(
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
    expect(await screen.findByText('Rows to export: counting…')).toBeTruthy();
    const { rows } = await act(() =>
      readScopedRows(adapter, { names: ['Category'] }),
    );
    expect(
      await screen.findByText(
        `Rows to export: ${rows.length.toLocaleString('en-US')}`,
        {},
        { timeout: 3000 },
      ),
    ).toBeTruthy();
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
});
