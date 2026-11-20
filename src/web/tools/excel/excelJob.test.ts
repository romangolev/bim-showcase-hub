import { describe, expect, it, vi } from 'vitest';
import type { PropertyRow } from '../../../shared/types.js';
import { loadedMockAdapter } from '../../test/mockAdapter.js';
import type { ViewerAdapter } from '../../viewer/ViewerAdapter.js';
import { excelJob } from './excelJob.js';
import { DEFAULT_EXCEL_TOOL_SETTINGS } from './excelSettings.js';
import { lastExcelStatus } from './excelStatus.js';

function task() {
  return {
    progress: vi.fn(),
    finish: vi.fn(),
    warn: vi.fn(),
    fail: vi.fn(),
    cancel: vi.fn(),
  };
}

function rowsAdapter(count: number): ViewerAdapter {
  const rows: PropertyRow[] = Array.from({ length: count }, (_, index) => ({
    dbId: index + 1,
    name: `E${index + 1}`,
    modelId: 'm',
    properties: { Name: `E${index + 1}` },
  }));
  return {
    getLeafProperties: () => Promise.resolve(rows),
    getModels: () => [
      { id: 'm', urn: 'm', name: 'm', visible: true, status: 'ready' },
    ],
  } as unknown as ViewerAdapter;
}

describe('excelJob', () => {
  it('publishes every status of the export for the adapter', async () => {
    const adapter = await loadedMockAdapter();
    const job = task();
    const status = await excelJob(
      adapter,
      { ...DEFAULT_EXCEL_TOOL_SETTINGS, format: 'json' },
      'house.rvt',
      { task: job as never, signal: new AbortController().signal },
      { save: vi.fn() },
    );
    expect(status.phase).toBe('done');
    expect(lastExcelStatus(adapter)?.phase).toBe('done');
    expect(job.finish).toHaveBeenCalled();
    adapter.destroy();
  });

  it('names the file from the settings and saves through the override', async () => {
    const adapter = await loadedMockAdapter();
    const save = vi.fn();
    const status = await excelJob(
      adapter,
      { ...DEFAULT_EXCEL_TOOL_SETTINGS, format: 'csv' },
      'House.rvt',
      { task: task() as never, signal: new AbortController().signal },
      { save },
    );
    expect(status).toMatchObject({
      phase: 'done',
      fileName: 'House.rvt-properties.csv',
    });
    expect(save.mock.calls[0]?.[1]).toBe('House.rvt-properties.csv');
    adapter.destroy();
  });

  it('asks before exporting over the confirmation threshold', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const job = () => ({
      task: task() as never,
      signal: new AbortController().signal,
    });
    await excelJob(
      rowsAdapter(1500),
      { ...DEFAULT_EXCEL_TOOL_SETTINGS, confirmAbove: 1000, format: 'json' },
      'big.rvt',
      job(),
      { save: vi.fn() },
    );
    expect(confirm).toHaveBeenCalledTimes(1);
    await excelJob(
      rowsAdapter(1500),
      { ...DEFAULT_EXCEL_TOOL_SETTINGS, confirmAbove: 0, format: 'json' },
      'big.rvt',
      job(),
      { save: vi.fn() },
    );
    expect(confirm).toHaveBeenCalledTimes(1);
    confirm.mockRestore();
  });
});
