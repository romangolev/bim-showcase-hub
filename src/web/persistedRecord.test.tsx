import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { instanceSettingKey } from './layout/instanceSettings.js';
import {
  BSH_KEYS,
  BSH_PERSONAL_PREFIXES,
  defineRecord,
  defineRecordFamily,
  forgetPersonal,
  RAW_STRING,
  setStorageAdapter,
  usePersisted,
} from './storage.js';
import './tools/index.js';
import { memoryAdapter, type StorageAdapter } from './storageAdapter.js';
import { EXCEL_SETTINGS_KEY } from './tools/excel/excelSettings.js';
import { GLB_SETTINGS_KEY } from './tools/glb/GlbExportTool.js';
import { IFC_SETTINGS_KEY } from './tools/ifc/ifcSettings.js';
import { PAINT_SETTINGS_KEY } from './tools/paint/paintSettings.js';

let adapter: StorageAdapter;
let previous: StorageAdapter;

beforeEach(() => {
  adapter = memoryAdapter();
  previous = setStorageAdapter(adapter);
});

afterEach(() => {
  setStorageAdapter(previous);
});

const count = defineRecord<number>({
  key: 'test.count',
  initial: 1,
  sanitize: (raw) => (typeof raw === 'number' ? raw : 0),
});

describe('storage keys', () => {
  it('keeps every key string and version suffix', () => {
    expect(BSH_KEYS).toEqual({
      personal: {
        layout: 'bsh.layout.v2',
        openModels: 'bsh.models.open',
        modelOwner: 'bsh.models.owner',
        recentModels: 'bsh.models.recent',
        pinned: 'bsh.docs.pinned',
        hiddenModels: 'bsh.models.hidden',
        modelTints: 'bsh.models.tints.v1',
        modelViews: 'bsh.models.views.v1',
        hubHint: 'bsh.hint.hubs.dismissed.v1',
        summaryView: 'bsh.summary.view.v1',
        summaryProperties: 'bsh.summary.properties.v1',
        summaryScope: 'bsh.summary.scope.v1',
        summaryAction: 'bsh.summary.action.v1',
        dashboardAction: 'bsh.dashboard.action.v1',
        dashboardView: 'bsh.dashboard.view.v1',
        saved: 'bsh.saved.v1',
        recentCommands: 'bsh.commands.recent.v1',
        layoutInstances: 'bsh.layout.instances.v1',
        workspaces: 'bsh.workspaces.v1',
        lastSession: 'bsh.models.session.v1',
      },
      preference: {
        settings: 'bsh-settings-v1',
        layoutLocked: 'bsh.layout.locked',
        treeView: 'bsh.tree.view',
        snapshot: 'bsh.snapshot.v1',
        notifications: 'bsh.notify.v1',
        commandPins: 'bsh.commands.pinned.v1',
        viewerKeys: 'bsh.commands.viewer.keys.v1',
        shareInclude: 'bsh.share.v1',
        charts: 'bsh.charts.v1',
      },
    });
    expect(BSH_PERSONAL_PREFIXES).toEqual(['bsh.pane.', 'bsh.paint.']);
    expect(instanceSettingKey('chart:2')).toBe('bsh.pane.chart.2.v1');
    expect([
      PAINT_SETTINGS_KEY,
      EXCEL_SETTINGS_KEY,
      GLB_SETTINGS_KEY,
      IFC_SETTINGS_KEY,
    ]).toEqual([
      'bsh.tool.paint.v1',
      'bsh.tool.excel.v1',
      'bsh.tool.glb.v1',
      'bsh.tool.ifc.v1',
    ]);
  });
});

describe('records', () => {
  it('falls back to the default and sanitizes what it reads', () => {
    expect(count.read()).toBe(1);
    expect(count.has()).toBe(false);
    adapter.set('local', 'test.count', '{');
    expect(count.read()).toBe(1);
    adapter.set('local', 'test.count', '"x"');
    expect(count.read()).toBe(0);
    expect(count.write(7)).toBe(true);
    expect(adapter.get('local', 'test.count')).toBe('7');
    expect(count.has()).toBe(true);
    count.remove();
    expect(count.read()).toBe(1);
  });

  it('keeps raw strings and the session area apart', () => {
    const raw = defineRecord<string>({
      key: 'test.raw',
      initial: '',
      sanitize: (value) => String(value),
      area: 'session',
      codec: RAW_STRING,
    });
    raw.write('plain');
    expect(adapter.get('session', 'test.raw')).toBe('plain');
    expect(adapter.get('local', 'test.raw')).toBeNull();
    expect(raw.read()).toBe('plain');
  });

  it('syncs two mounted hooks and a cross-tab change', async () => {
    const a = renderHook(() => usePersisted(count));
    const b = renderHook(() => usePersisted(count));
    await act(async () => {
      a.result.current[1](5);
      await Promise.resolve();
    });
    expect(b.result.current[0]).toBe(5);
    act(() => {
      adapter.set('local', 'test.count', '9');
      window.dispatchEvent(new StorageEvent('storage', { key: 'test.count' }));
    });
    expect(a.result.current[0]).toBe(9);
  });

  it('does not notify subscribers of a write that storage rejected', async () => {
    adapter.set = () => false;
    const seen = renderHook(() => usePersisted(count));
    await act(async () => {
      expect(count.write(5)).toBe(false);
      await Promise.resolve();
    });
    expect(seen.result.current[0]).toBe(1);
    expect(count.read()).toBe(1);
  });

  it('keeps a rejected update in memory for the session across mounted hooks', async () => {
    adapter.set = () => false;
    const a = renderHook(() => usePersisted(count));
    const b = renderHook(() => usePersisted(count));
    await act(async () => {
      a.result.current[1](5);
      await Promise.resolve();
    });
    expect(a.result.current[0]).toBe(5);
    expect(b.result.current[0]).toBe(5);
    expect(count.read()).toBe(1);
  });

  it('applies consecutive functional updates exactly once each', () => {
    const view = renderHook(() => usePersisted(count));
    const updater = vi.fn((n: number) => n + 1);
    act(() => {
      view.result.current[1](updater);
      view.result.current[1](updater);
    });
    expect(view.result.current[0]).toBe(3);
    expect(updater).toHaveBeenCalledTimes(2);
    expect(adapter.get('local', 'test.count')).toBe('3');
  });

  it('follows the record when its key changes and keeps the other key intact', () => {
    const a = defineRecord<number>({
      key: 'test.a',
      initial: 0,
      sanitize: Number,
    });
    const b = defineRecord<number>({
      key: 'test.b',
      initial: 0,
      sanitize: Number,
    });
    a.write(1);
    b.write(2);
    const view = renderHook(({ record }) => usePersisted(record), {
      initialProps: { record: a },
    });
    expect(view.result.current[0]).toBe(1);
    view.rerender({ record: b });
    expect(view.result.current[0]).toBe(2);
    act(() => view.result.current[1]((n) => n + 1));
    expect(a.read()).toBe(1);
    expect(b.read()).toBe(3);
  });

  it('refuses a family key outside its prefix', () => {
    const family = defineRecordFamily<number, string>({
      prefix: 'bsh.pane.',
      keyOf: (arg) => `elsewhere.${arg}`,
      initial: 0,
      sanitize: Number,
    });
    expect(() => family.get('x')).toThrow();
    expect(() => family.forget('x')).toThrow();
  });

  it('rejects a family outside the registered prefixes', () => {
    expect(() =>
      defineRecordFamily({
        prefix: 'other.',
        keyOf: String,
        initial: 0,
        sanitize: Number,
      }),
    ).toThrow();
  });
});

describe('forget', () => {
  it('removes personal keys in both areas and prefixed keys, keeps preferences', () => {
    for (const key of Object.values(BSH_KEYS.personal)) {
      adapter.set('local', key, '"x"');
      adapter.set('session', key, '"x"');
    }
    for (const key of Object.values(BSH_KEYS.preference)) {
      adapter.set('local', key, '"x"');
    }
    adapter.set('local', 'bsh.pane.chart.9.v1', '{}');
    adapter.set('session', 'bsh.pane.chart.9.v1', '{}');
    adapter.set('local', 'unrelated', '1');
    forgetPersonal();
    expect(adapter.keys('session')).toEqual([]);
    expect(adapter.keys('local').sort()).toEqual(
      [
        ...Object.values(BSH_KEYS.preference).filter(
          (key) => key !== BSH_KEYS.preference.settings,
        ),
        'unrelated',
      ].sort(),
    );
  });

  it.each([
    ['truncated JSON with an author', '{"ifc":{"author":"Ada'],
    ['a number', '7'],
    ['a string', '"x"'],
    ['an array', '["Ada"]'],
  ])('drops a corrupt app-settings blob: %s', (_name, blob) => {
    adapter.set('local', BSH_KEYS.preference.settings, blob);
    forgetPersonal();
    expect(adapter.get('local', BSH_KEYS.preference.settings)).toBeNull();
  });

  it('trims a valid app-settings blob to the app fields', () => {
    adapter.set(
      'local',
      BSH_KEYS.preference.settings,
      '{"recentsLength":3,"ifc":{"author":"Ada"}}',
    );
    forgetPersonal();
    expect(adapter.get('local', BSH_KEYS.preference.settings)).toBe(
      '{"recentsLength":3}',
    );
  });
});
