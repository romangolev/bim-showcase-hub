import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isRecord } from '../../../shared/guards.js';
import { readJson, writeJson } from '../../storage.js';
import { createTaskStore } from '../../tasks/taskStore.js';
import { installMemoryStorage } from '../../test/mockApi.js';
import type { ViewerAdapter } from '../../viewer/ViewerAdapter.js';
import { exportEntry, runOnce, statusReporter } from './exportKit.js';
import { migrateLegacySettings } from './migrateLegacy.js';
import { persistedSetting } from './persistedSetting.js';
import { ToolRegistry } from './ToolRegistry.js';
import { useViewerTools } from './useViewerTools.js';
import { readEnabled, type ToolContext, ViewerTool } from './ViewerTool.js';

interface FakeSettings {
  enabled: boolean;
  label: string;
}

function fakeSettings(key: string) {
  return persistedSetting<FakeSettings>(
    key,
    { enabled: true, label: 'x' },
    (raw) => ({
      enabled: readEnabled(raw),
      label: isRecord(raw) && typeof raw.label === 'string' ? raw.label : 'x',
    }),
  );
}

class FakeTool extends ViewerTool<FakeSettings> {
  readonly settings;
  readonly legacy;
  readonly disabled = vi.fn();
  constructor(
    readonly id: string,
    readonly title = id,
    readonly description = `${id} description`,
    key = `test.${id}`,
    private readonly paint = false,
  ) {
    super();
    this.settings = fakeSettings(key);
    this.legacy = {
      fields: [`${id}On`, `${id}Label`],
      read: (blob: Record<string, unknown>) => ({
        enabled: blob[`${id}On`],
        label: blob[`${id}Label`],
      }),
    };
  }

  contribute(ctx: ToolContext) {
    const exports = [
      exportEntry(
        ctx,
        this.id,
        {
          id: `export-${this.id}`,
          icon: 'i',
          tooltip: this.title,
          label: 'Exporting',
        },
        async () => undefined,
      ),
    ];
    return this.paint
      ? {
          exports,
          paint: {
            id: ctx.id('paint'),
            tooltip: 'p',
            swatches: [],
            reset: { id: ctx.id('reset'), label: 'r' },
            selectHint: '',
            resetHint: '',
            onPaint: () => true,
            onReset: () => undefined,
          },
        }
      : { exports };
  }

  override onDisabled() {
    this.disabled();
  }

  protected override renderFields() {
    return <p>fields of {this.id}</p>;
  }

  override scrub(settings: FakeSettings): FakeSettings {
    return { ...settings, label: '' };
  }
}

function context(suffix?: string): ToolContext {
  return {
    adapter: {} as ViewerAdapter,
    id: (base) => (suffix ? `${base}-${suffix}` : base),
    fileName: () => 'm',
    current: (tool) => tool.settings.initial,
  };
}

beforeEach(() => {
  installMemoryStorage();
});

describe('ToolRegistry', () => {
  it('keeps registration order and finds tools by id', () => {
    const a = new FakeTool('a');
    const b = new FakeTool('b');
    const registry = new ToolRegistry().register(a).register(b);
    expect(registry.all()).toEqual([a, b]);
    expect(registry.get('b')).toBe(b);
    expect(registry.get('nope')).toBeUndefined();
  });

  it('rejects a duplicate id or storage key', () => {
    const registry = new ToolRegistry().register(new FakeTool('a'));
    expect(() =>
      registry.register(new FakeTool('a', 'A', '', 'other')),
    ).toThrow(/id/);
    expect(() =>
      registry.register(new FakeTool('b', 'B', '', 'test.a')),
    ).toThrow(/key/);
  });

  it('builds one group from the enabled tools with suffixed ids', () => {
    const registry = new ToolRegistry()
      .register(new FakeTool('a'))
      .register(new FakeTool('b'))
      .register(new FakeTool('c'));
    const snapshot = {
      ...registry.snapshot(),
      b: { enabled: false, label: '' },
    };
    const group = registry.buildGroup(context('k'), snapshot);
    expect(group?.id).toBe('bim-showcase-hub-tools-k');
    expect(group?.exports.map((entry) => entry.id)).toEqual([
      'export-a-k',
      'export-c-k',
    ]);
  });

  it('keeps the first paint contribution', () => {
    const registry = new ToolRegistry()
      .register(new FakeTool('a', 'a', '', 'test.a', true))
      .register(new FakeTool('b', 'b', '', 'test.b', true));
    expect(registry.buildGroup(context(), registry.snapshot())?.paint?.id).toBe(
      'paint',
    );
  });

  it('builds nothing when every tool is off', () => {
    const registry = new ToolRegistry().register(new FakeTool('a'));
    expect(
      registry.buildGroup(context(), { a: { enabled: false } }),
    ).toBeNull();
  });

  it('describes one settings modal per tool', () => {
    const registry = new ToolRegistry().register(new FakeTool('a', 'Alpha'));
    expect(registry.modals()).toMatchObject([
      { id: 'tool-a-settings', title: 'Alpha settings', size: 'lg' },
    ]);
  });

  it('reads stored values through each sanitizer', () => {
    const registry = new ToolRegistry().register(new FakeTool('a'));
    writeJson('test.a', { enabled: 'yes', label: 5 });
    expect(registry.snapshot().a).toEqual({ enabled: true, label: 'x' });
  });

  it('scrubs stored tool values and skips tools with nothing stored', () => {
    const registry = new ToolRegistry()
      .register(new FakeTool('a'))
      .register(new FakeTool('b'));
    writeJson('test.a', { enabled: false, label: 'secret' });
    registry.scrubPersonal();
    expect(readJson('test.a', null)).toEqual({ enabled: false, label: '' });
    expect(window.localStorage.getItem('test.b')).toBeNull();
  });
});

describe('ViewerTool settings window', () => {
  it('shows the enable switch and the tool fields and persists a toggle', () => {
    const tool = new FakeTool('a', 'Alpha tool');
    render(tool.renderSettings());
    expect(screen.getByText('fields of a')).toBeTruthy();
    const toggle = screen.getByRole('switch', { name: 'Alpha tool' });
    expect((toggle as HTMLInputElement).checked).toBe(true);
    fireEvent.click(toggle);
    expect(readJson('test.a', null)).toMatchObject({ enabled: false });
  });

  it('defaults to a frame without fields', () => {
    class Bare extends ViewerTool<FakeSettings> {
      readonly id = 'bare';
      readonly title = 'Bare';
      readonly description = '';
      readonly settings = fakeSettings('test.bare');
      contribute() {
        return {};
      }
    }
    render(new Bare().renderSettings());
    expect(screen.getAllByRole('switch')).toHaveLength(1);
  });
});

describe('runOnce', () => {
  it('ignores a second start while the first runs and frees the slot after', async () => {
    const adapter = {} as ViewerAdapter;
    let finish: () => void = () => undefined;
    const start = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    runOnce(adapter, 'k', 'Export', start);
    runOnce(adapter, 'k', 'Export', start);
    expect(start).toHaveBeenCalledTimes(1);
    finish();
    await Promise.resolve();
    await Promise.resolve();
    runOnce(adapter, 'k', 'Export', start);
    expect(start).toHaveBeenCalledTimes(2);
  });

  it('keeps the kinds of one adapter apart and releases after a throw', () => {
    const adapter = {} as ViewerAdapter;
    const never = () => new Promise<void>(() => undefined);
    runOnce(adapter, 'a', 'Export', never);
    const other = vi.fn(never);
    runOnce(adapter, 'b', 'Export', other);
    expect(other).toHaveBeenCalledTimes(1);
    const boom = () => {
      throw new Error('boom');
    };
    expect(() => runOnce(adapter, 'c', 'Export', boom)).toThrow('boom');
    const again = vi.fn(never);
    runOnce(adapter, 'c', 'Export', again);
    expect(again).toHaveBeenCalledTimes(1);
  });
});

describe('export tasks', () => {
  it('fails the task and frees the lock when the work rejects', async () => {
    const adapter = {} as ViewerAdapter;
    const { tasks } = await import('../../tasks/taskStore.js');
    runOnce(adapter, 'r', 'Rejecting', () => Promise.reject(new Error('no')));
    await vi.waitFor(() =>
      expect(tasks.getSnapshot().tasks.at(-1)).toMatchObject({
        label: 'Rejecting',
        state: 'failed',
        detail: 'no',
      }),
    );
    const again = vi.fn(() => new Promise<void>(() => undefined));
    runOnce(adapter, 'r', 'Rejecting', again);
    expect(again).toHaveBeenCalledTimes(1);
  });

  it('offers cancel only when asked and aborts the signal', async () => {
    const adapter = {} as ViewerAdapter;
    const { tasks } = await import('../../tasks/taskStore.js');
    let signal: AbortSignal | undefined;
    runOnce(
      adapter,
      's',
      'Cancellable',
      (job) => {
        signal = job.signal;
        return new Promise<void>(() => undefined);
      },
      true,
    );
    const task = tasks.getSnapshot().tasks.at(-1);
    expect(task?.cancellable).toBe(true);
    if (task) tasks.cancel(task.id);
    expect(signal?.aborted).toBe(true);
    runOnce(adapter, 't', 'Plain', () => new Promise<void>(() => undefined));
    expect(tasks.getSnapshot().tasks.at(-1)?.cancellable).toBe(false);
  });

  it('maps statuses onto the task', () => {
    const store = createTaskStore();
    const report = (
      status: { phase: string },
      task = store.start({ label: 'x' }),
    ) => {
      statusReporter(task, (s: { phase: string }) => s.phase)(status);
      return store.getSnapshot().tasks.at(-1);
    };
    expect(report({ phase: 'reading' })).toMatchObject({
      state: 'running',
      detail: 'reading',
    });
    expect(report({ phase: 'done' })).toMatchObject({ state: 'done' });
    expect(report({ phase: 'empty' })).toMatchObject({ state: 'done' });
    expect(report({ phase: 'done', skipped: 3 } as never)).toMatchObject({
      state: 'warning',
    });
    expect(report({ phase: 'done', missing: ['Mark'] } as never)).toMatchObject(
      { state: 'warning' },
    );
    expect(
      report({ phase: 'done', levelsUnavailable: 1 } as never),
    ).toMatchObject({ state: 'warning' });
    expect(report({ phase: 'done', generatedIds: 2 } as never)).toMatchObject({
      state: 'warning',
    });
    expect(
      report({ phase: 'done', missing: [], skipped: 0 } as never),
    ).toMatchObject({ state: 'done' });
    expect(report({ phase: 'error' })).toMatchObject({ state: 'failed' });
    expect(report({ phase: 'cancelled' })).toMatchObject({
      state: 'cancelled',
    });
  });
});

describe('migrateLegacySettings', () => {
  const registry = () =>
    new ToolRegistry().register(new FakeTool('a')).register(new FakeTool('b'));
  const APP = 'test.app';

  it('moves tool fields to their keys and keeps the app fields', () => {
    writeJson(APP, { aOn: false, aLabel: 'L', bOn: true, minutes: 7 });
    migrateLegacySettings(registry(), APP);
    expect(readJson('test.a', null)).toEqual({ enabled: false, label: 'L' });
    expect(readJson('test.b', null)).toEqual({ enabled: true, label: 'x' });
    expect(readJson(APP, null)).toEqual({ minutes: 7 });
  });

  it('migrates what a partial blob has and defaults the rest', () => {
    writeJson(APP, { aLabel: 'only', minutes: 3 });
    migrateLegacySettings(registry(), APP);
    expect(readJson('test.a', null)).toEqual({ enabled: true, label: 'only' });
    expect(window.localStorage.getItem('test.b')).toBeNull();
    expect(readJson(APP, null)).toEqual({ minutes: 3 });
  });

  it('sanitizes bad legacy values', () => {
    writeJson(APP, { aOn: 'maybe', aLabel: 12 });
    migrateLegacySettings(registry(), APP);
    expect(readJson('test.a', null)).toEqual({ enabled: true, label: 'x' });
    expect(readJson(APP, null)).toEqual({});
  });

  it('is a no-op when nothing is stored', () => {
    migrateLegacySettings(registry(), APP);
    expect(window.localStorage.getItem(APP)).toBeNull();
    expect(window.localStorage.getItem('test.a')).toBeNull();
  });

  it('leaves corrupt JSON untouched', () => {
    window.localStorage.setItem(APP, '{broken');
    migrateLegacySettings(registry(), APP);
    expect(window.localStorage.getItem(APP)).toBe('{broken');
    expect(window.localStorage.getItem('test.a')).toBeNull();
  });

  it.each([['null'], ['7'], ['"text"'], ['[1,2]']])(
    'leaves a non-object blob (%s) untouched',
    (raw) => {
      window.localStorage.setItem(APP, raw);
      migrateLegacySettings(registry(), APP);
      expect(window.localStorage.getItem(APP)).toBe(raw);
      expect(window.localStorage.getItem('test.a')).toBeNull();
    },
  );

  it('is idempotent', () => {
    writeJson(APP, { aOn: false, minutes: 7 });
    migrateLegacySettings(registry(), APP);
    const first = window.localStorage.getItem(APP);
    migrateLegacySettings(registry(), APP);
    expect(window.localStorage.getItem(APP)).toBe(first);
    expect(readJson('test.a', null)).toEqual({ enabled: false, label: 'x' });
  });

  it('never overwrites a tool key that already exists', () => {
    writeJson('test.a', { enabled: true, label: 'newer' });
    writeJson(APP, { aOn: false, aLabel: 'old', minutes: 1 });
    migrateLegacySettings(registry(), APP);
    expect(readJson('test.a', null)).toEqual({ enabled: true, label: 'newer' });
    expect(readJson(APP, null)).toEqual({ minutes: 1 });
  });

  it('keeps the old blob when a tool value cannot be stored', () => {
    writeJson(APP, { aOn: false, minutes: 1 });
    const set = vi
      .spyOn(window.localStorage, 'setItem')
      .mockImplementation(() => {
        throw new Error('quota');
      });
    migrateLegacySettings(registry(), APP);
    set.mockRestore();
    expect(readJson(APP, null)).toEqual({ aOn: false, minutes: 1 });
  });
});

describe('migrateLegacySettings after a sign-out scrub', () => {
  const APP = 'test.app';
  const registry = () => new ToolRegistry().register(new FakeTool('a'));

  it('clears personal legacy values even when the tool key cannot be stored', () => {
    writeJson(APP, { aOn: false, aLabel: 'secret', minutes: 1 });
    const set = vi
      .spyOn(window.localStorage, 'setItem')
      .mockImplementationOnce(() => {
        throw new Error('quota');
      });
    migrateLegacySettings(registry(), APP, { scrub: true });
    set.mockRestore();
    expect(readJson(APP, null)).toEqual({ minutes: 1 });
    migrateLegacySettings(registry(), APP);
    expect(readJson('test.a', null)).toBeNull();
  });

  it('migrates with the personal fields scrubbed', () => {
    writeJson(APP, { aOn: false, aLabel: 'secret' });
    migrateLegacySettings(registry(), APP, { scrub: true });
    expect(readJson('test.a', null)).toEqual({ enabled: false, label: '' });
    expect(readJson(APP, null)).toEqual({});
  });
});

describe('useViewerTools', () => {
  function fakeAdapter() {
    const dispose = vi.fn();
    const registerToolGroup = vi.fn((_spec: unknown) => dispose);
    return {
      adapter: { registerToolGroup } as unknown as ViewerAdapter,
      registerToolGroup,
      dispose,
    };
  }
  const base = { fileName: () => '' };

  it('registers the group once adapter is ready and disposes it on unmount', () => {
    const { adapter, registerToolGroup, dispose } = fakeAdapter();
    const registry = new ToolRegistry().register(new FakeTool('a'));
    const { unmount } = renderHook(() =>
      useViewerTools(registry, { ...base, adapter, active: true, suffix: 'k' }),
    );
    expect(registerToolGroup).toHaveBeenCalledTimes(1);
    expect(registerToolGroup.mock.calls[0]?.[0]).toMatchObject({
      id: 'bim-showcase-hub-tools-k',
    });
    unmount();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('registers nothing without an adapter, when inactive, or with every tool off', () => {
    const { adapter, registerToolGroup } = fakeAdapter();
    const registry = new ToolRegistry().register(new FakeTool('a'));
    renderHook(() =>
      useViewerTools(registry, { ...base, adapter: null, active: true }),
    );
    renderHook(() =>
      useViewerTools(registry, { ...base, adapter, active: false }),
    );
    writeJson('test.a', { enabled: false });
    renderHook(() =>
      useViewerTools(registry, { ...base, adapter, active: true }),
    );
    expect(registerToolGroup).not.toHaveBeenCalled();
  });

  it('calls onDisabled when a tool goes from on to off', () => {
    const { adapter } = fakeAdapter();
    const tool = new FakeTool('a');
    const registry = new ToolRegistry().register(tool);
    const view = render(<Probe registry={registry} adapter={adapter} />);
    expect(tool.disabled).not.toHaveBeenCalled();
    fireEvent.click(view.getByText('off'));
    expect(tool.disabled).toHaveBeenCalledTimes(1);
  });
});

function Probe({
  registry,
  adapter,
}: {
  registry: ToolRegistry;
  adapter: ViewerAdapter;
}) {
  useViewerTools(registry, {
    adapter,
    active: true,
    fileName: () => '',
  });
  return (
    <button
      type="button"
      onClick={() => {
        writeJson('test.a', { enabled: false, label: 'x' });
        window.dispatchEvent(new StorageEvent('storage', { key: 'test.a' }));
      }}
    >
      off
    </button>
  );
}
