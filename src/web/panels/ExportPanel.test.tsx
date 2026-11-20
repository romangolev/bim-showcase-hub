import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as downloadModule from '../extensions/download.js';
import { PREVIEW_ROWS } from '../extensions/excelExport.js';
import { setStorageAdapter } from '../storage.js';
import { memoryAdapter } from '../storageAdapter.js';
import { loadedMockAdapter } from '../test/mockAdapter.js';
import { fireEvent, render, screen, within } from '../test/render.js';
import { EXCEL_SETTINGS } from '../tools/excel/excelSettings.js';
import { ExportPanel } from './ExportPanel.js';

beforeEach(() => {
  setStorageAdapter(memoryAdapter());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ExportPanel', () => {
  it('previews the first rows of the chosen columns and scope', async () => {
    const adapter = await loadedMockAdapter();
    render(<ExportPanel adapter={adapter} fileName="house-properties.xlsx" />);
    const table = await screen.findByRole('table', { name: 'Export preview' });
    expect(within(table).getAllByRole('row').length).toBeLessThanOrEqual(
      PREVIEW_ROWS + 1,
    );
    expect(screen.getByText(/^File: /)).toHaveTextContent(
      'house-properties.xlsx',
    );
    adapter.destroy();
  });

  it('exports with the current settings and shows the status', async () => {
    const adapter = await loadedMockAdapter();
    EXCEL_SETTINGS.write({ ...EXCEL_SETTINGS.read(), format: 'json' });
    const save = vi
      .spyOn(downloadModule, 'saveBlob')
      .mockImplementation(() => undefined);
    render(<ExportPanel adapter={adapter} fileName="house-properties.xlsx" />);
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    await screen.findByText(/^Exported \d+ elements/);
    expect(save).toHaveBeenCalled();
    adapter.destroy();
  });
});
