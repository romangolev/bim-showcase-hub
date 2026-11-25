import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import '../viewer/reportTemplates.js';
import '../extensions/colorRulePresets.js';
import './modelSets.js';
import {
  DASHBOARD_USER_PRESETS,
  DEFAULT_DASHBOARD_VIEW,
} from '../extensions/dashboardPresets.js';
import { SelectionSets } from '../panels/SelectionSets.js';
import { ViewpointsBody } from '../panels/Viewpoints.js';
import { getStorageAdapter } from '../storage.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { DEFAULT_EXCEL_TOOL_SETTINGS } from '../tools/excel/excelSettings.js';
import { EXPORT_PRESETS } from '../tools/excel/exportPresets.js';
import { publishActiveAdapter } from '../viewer/activeAdapterStore.js';
import { MockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import {
  listSets,
  SELECTION_SETS,
  saveSelectionSet,
} from '../viewer/selectionSets.js';
import type { ViewerState } from '../viewer/ViewerAdapter.js';
import { listViewpoints, VIEWPOINTS } from '../viewer/viewpoints.js';
import { getSavedKind, savedKindVersions } from './savedKindRegistry.js';
import {
  importSaved,
  readSaved,
  SAVED_KEY,
  SAVED_VERSION,
  upsertSaved,
} from './savedStore.js';

const STATE: ViewerState = {
  version: 1,
  camera: null,
  cutplanes: [],
  models: { 'urn-a': { isolated: [], hidden: [], selection: [] } },
};

beforeEach(() => {
  installMemoryStorage();
  publishActiveAdapter(null);
});

describe('production saved kinds', () => {
  it('registers each production kind at version 1', () => {
    expect(getSavedKind('viewpoint')).toMatchObject({
      version: 1,
      label: 'Viewpoint',
    });
    expect(getSavedKind('selection-set')).toMatchObject({
      version: 1,
      label: 'Selection set',
    });
    expect(getSavedKind('dashboard-preset')).toMatchObject({
      version: 1,
      label: 'Dashboard preset',
    });
    expect(getSavedKind('export-preset')).toMatchObject({
      version: 1,
      label: 'Export preset',
    });
    expect(getSavedKind('report-template')).toMatchObject({
      version: 1,
      label: 'Report template',
    });
    expect(getSavedKind('color-rules')).toMatchObject({
      version: 1,
      label: 'Colour rules',
    });
    expect(getSavedKind('model-set')).toMatchObject({
      version: 1,
      label: 'Model set',
    });
    expect(getSavedKind('federation')).toBeUndefined();
    expect(savedKindVersions()).toMatchObject({
      viewpoint: 1,
      'selection-set': 1,
      'dashboard-preset': 1,
      'export-preset': 1,
      'report-template': 1,
      'color-rules': 1,
      'model-set': 1,
    });
    expect(savedKindVersions()).not.toHaveProperty('federation');
  });

  it('saves, gets, renames, moves and removes each kind through its handle', () => {
    const first = VIEWPOINTS.save('First', { state: STATE });
    const second = VIEWPOINTS.save('Second', { state: STATE });
    expect(first?.version).toBe(1);
    expect(VIEWPOINTS.list().map((item) => item.name)).toEqual([
      'First',
      'Second',
    ]);
    expect(VIEWPOINTS.get(second?.id ?? '')?.data.state).toEqual(STATE);
    expect(VIEWPOINTS.rename(second?.id ?? '', '  Second renamed  ')).toBe(
      true,
    );
    expect(VIEWPOINTS.move(second?.id ?? '', -1)).toBe(true);
    expect(VIEWPOINTS.list().map((item) => item.name)).toEqual([
      'Second renamed',
      'First',
    ]);
    expect(VIEWPOINTS.remove(first?.id ?? '')).toBe(true);
    expect(VIEWPOINTS.remove(second?.id ?? '')).toBe(true);

    const set = SELECTION_SETS.save('Walls', { models: { a: [1, 2, 1] } });
    expect(set?.data).toEqual({ models: { a: [1, 2] } });
    expect(listSets()[0]?.items).toEqual([
      { modelId: 'a', dbId: 1 },
      { modelId: 'a', dbId: 2 },
    ]);
    expect(SELECTION_SETS.rename(set?.id ?? '', 'Floors')).toBe(true);
    expect(SELECTION_SETS.remove(set?.id ?? '')).toBe(true);

    const board = DASHBOARD_USER_PRESETS.save('Board', DEFAULT_DASHBOARD_VIEW);
    expect(board?.data).toMatchObject({
      orientation: 'horizontal',
      maxCategories: 12,
    });
    expect(DASHBOARD_USER_PRESETS.rename(board?.id ?? '', 'Board 2')).toBe(
      true,
    );
    expect(DASHBOARD_USER_PRESETS.remove(board?.id ?? '')).toBe(true);

    const preset = EXPORT_PRESETS.save('Weekly', DEFAULT_EXCEL_TOOL_SETTINGS);
    expect(preset?.data).toMatchObject({
      format: 'xlsx',
      scope: 'all',
      includeHeader: true,
    });
    expect(preset?.data).not.toHaveProperty('modelScope');
    expect(EXPORT_PRESETS.rename(preset?.id ?? '', 'Monthly')).toBe(true);
    expect(EXPORT_PRESETS.remove(preset?.id ?? '')).toBe(true);

    expect(readSaved()).toEqual([]);
  });

  it('refuses data the registered kinds do not accept', () => {
    expect(
      VIEWPOINTS.save('Bad', { state: { version: 2 } } as never),
    ).toBeNull();
    expect(SELECTION_SETS.save('Bad', 'nope' as never)).toBeNull();
    expect(VIEWPOINTS.list()).toEqual([]);
    expect(SELECTION_SETS.list()).toEqual([]);
  });

  it('rejects an entry that claims a newer kind version on write and import', () => {
    const newer = {
      id: 'vp-newer',
      kind: 'viewpoint',
      name: 'Newer',
      version: 2,
      updatedAt: 1,
      data: { state: STATE },
    };
    expect(upsertSaved(newer)).toBe(false);
    expect(
      importSaved(
        JSON.stringify({ format: 'bsh-saved', version: 2, items: [newer] }),
      ),
    ).toMatchObject({ accepted: 0, rejected: 1 });
    expect(VIEWPOINTS.list()).toEqual([]);
  });

  it('reads items written under the previous envelope and upgrades them on write', () => {
    getStorageAdapter().set(
      'local',
      SAVED_KEY,
      JSON.stringify({
        version: 1,
        items: [
          {
            id: 'vp-old',
            kind: 'viewpoint',
            name: 'Old view',
            updatedAt: 5,
            data: { state: STATE },
          },
          {
            id: 'ss-old',
            kind: 'selection-set',
            name: 'Old set',
            data: { models: { a: [1] } },
          },
          {
            id: 'dp-old',
            kind: 'dashboard-preset',
            name: 'Old board',
            data: { kind: 'bar' },
          },
        ],
      }),
    );
    expect(listViewpoints().map((point) => point.name)).toEqual(['Old view']);
    expect(VIEWPOINTS.list()[0]?.version).toBe(1);
    expect(listSets()[0]?.items).toEqual([{ modelId: 'a', dbId: 1 }]);
    expect(DASHBOARD_USER_PRESETS.list()[0]?.data.charts).toMatchObject([
      { chartType: 'bar' },
    ]);

    expect(VIEWPOINTS.rename('vp-old', 'Renamed')).toBe(true);
    const stored = JSON.parse(
      getStorageAdapter().get('local', SAVED_KEY) ?? '{}',
    ) as { version?: number; items?: Array<Record<string, unknown>> };
    expect(stored.version).toBe(SAVED_VERSION);
    expect(stored.items?.find((item) => item.id === 'vp-old')).toMatchObject({
      version: 1,
      name: 'Renamed',
    });
  });

  it('imports items from the previous envelope', () => {
    const result = importSaved(
      JSON.stringify({
        format: 'bsh-saved',
        version: 1,
        items: [
          {
            id: 'vp-import',
            kind: 'viewpoint',
            name: 'Imported view',
            data: { state: STATE },
          },
          {
            id: 'ss-import',
            kind: 'selection-set',
            name: 'Imported set',
            data: { models: { a: [3] } },
          },
        ],
      }),
    );
    expect(result).toMatchObject({ accepted: 2, rejected: 0 });
    expect(listViewpoints()[0]?.name).toBe('Imported view');
    expect(listSets()[0]?.items).toEqual([{ modelId: 'a', dbId: 3 }]);
    expect(readSaved().every((item) => item.version === 1)).toBe(true);
  });

  it('leaves unknown kinds readable', () => {
    expect(
      upsertSaved({
        id: 'future',
        kind: 'future-thing',
        name: 'Later',
        version: 7,
        updatedAt: 1,
        data: { anything: true },
      }),
    ).toBe(true);
    expect(readSaved('future-thing')[0]).toMatchObject({
      version: 7,
      data: { anything: true },
    });
    expect(VIEWPOINTS.list()).toEqual([]);
    expect(SELECTION_SETS.list()).toEqual([]);
    expect(DASHBOARD_USER_PRESETS.list()).toEqual([]);
  });
});

describe('production saved kind consumers', () => {
  it('saves, renames and deletes a viewpoint through the panel', async () => {
    const adapter = new MockViewerAdapter(document.createElement('div'));
    await adapter.loadModels([{ urn: 'urn-a' }]);
    publishActiveAdapter(adapter);
    render(<ViewpointsBody />);
    fireEvent.change(screen.getByLabelText('Viewpoint name'), {
      target: { value: 'Entrance' },
    });
    fireEvent.click(screen.getByText('Save viewpoint'));
    await waitFor(() => expect(listViewpoints()).toHaveLength(1));
    const input = await screen.findByLabelText('Rename Entrance');
    fireEvent.change(input, { target: { value: 'Lobby' } });
    fireEvent.blur(input);
    await waitFor(() => expect(listViewpoints()[0]?.name).toBe('Lobby'));
    fireEvent.click(await screen.findByLabelText('Delete Lobby'));
    await waitFor(() => expect(listViewpoints()).toHaveLength(0));
    adapter.destroy();
  });

  it('renames and deletes a selection set through the panel', async () => {
    const adapter = new MockViewerAdapter(document.createElement('div'));
    await adapter.loadModels([{ urn: 'urn-a' }]);
    saveSelectionSet('Walls', [{ modelId: 'urn-a', dbId: 1 }]);
    render(<SelectionSets adapter={adapter} />);
    const input = await screen.findByLabelText('Rename Walls');
    fireEvent.change(input, { target: { value: 'Floors' } });
    fireEvent.blur(input);
    await waitFor(() => expect(listSets()[0]?.name).toBe('Floors'));
    fireEvent.click(await screen.findByLabelText('Delete Floors'));
    await waitFor(() => expect(listSets()).toHaveLength(0));
    adapter.destroy();
  });
});
