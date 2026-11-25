import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isRecord } from '../../../shared/guards.js';
import { defineRecord } from '../../storage.js';
import { createTaskStore } from '../../tasks/taskStore.js';
import { installMemoryStorage } from '../../test/mockApi.js';
import { readJson, writeJson } from '../../test/storageJson.js';
import type { ViewerAdapter } from '../../viewer/ViewerAdapter.js';
import { exportEntry, runOnce, statusReporter } from './exportKit.js';
import { ToolRegistry } from './ToolRegistry.js';
import { useViewerTools } from './useViewerTools.js';
import { readEnabled, type ToolContext, ViewerTool } from './ViewerTool.js';

interface FakeSettings {
  enabled: boolean;
  label: string;
}

function fakeSettings(key: string) {
  return defineRecord<FakeSettings>({
    key,
    initial: { enabled: true, label: 'x' },
    sanitize: (raw) => ({
      enabled: readEnabled(raw),
      label: isRecord(raw) && typeof raw.label === 'string' ? raw.label : 'x',
    }),
  });
}

class FakeTool extends ViewerTool<FakeSettings> {
  readonly settings;
  readonly disabled = vi.fn();
  readonly changed = vi.fn();
  readonly ready = vi.fn();
  constructor(
    readonly id: string,
    readonly title = id,
    readonly description = `${id} description`,
    key = `test.${id}`,
    private readonly paint = false,
  ) {
    super();
    this.settings = fakeSettings(key);
  }

  override onSettingsChanged(
    adapter: ViewerAdapter,
    previous: FakeSettings | undefined,
    next: FakeSettings,
  ) {
    this.changed(adapter, previous, next);
  }

  override onModelsReady(adapter: ViewerAdapter, settings: FakeSettings) {
    this.ready(adapter, settings);
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

  it('removes a stored tool record when the scrubbed write fails', () => {
    const registry = new ToolRegistry().register(new FakeTool('a'));
    writeJson('test.a', { enabled: false, label: 'secret' });
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    registry.scrubPersonal();
    expect(window.localStorage.getItem('test.a')).toBeNull();
  });
});

describe('ViewerTool settings window', () => {
  it('shows the tool fields and no enable switch', () => {
    const tool = new FakeTool('a', 'Alpha tool');
    render(tool.renderSettings());
    expect(screen.getByText('fields of a')).toBeTruthy();
    expect(tool.hasSettings).toBe(true);
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('has no settings window without fields', () => {
    class Bare extends ViewerTool<FakeSettings> {
      readonly id = 'bare';
      readonly title = 'Bare';
      readonly description = '';
      readonly settings = fakeSettings('test.bare');
      contribute() {
        return {};
      }
    }
    expect(new Bare().hasSettings).toBe(false);
    expect(new Bare().renderSettings()).toBeNull();
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

  it('keeps the kinds of one adapter apart and releases after a throw', async () => {
    const { tasks } = await import('../../tasks/taskStore.js');
    const adapter = {} as ViewerAdapter;
    const never = () => new Promise<void>(() => undefined);
    runOnce(adapter, 'a', 'Export', never);
    const other = vi.fn(never);
    runOnce(adapter, 'b', 'Export', other);
    expect(other).toHaveBeenCalledTimes(1);
    const boom = () => {
      throw new Error('boom');
    };
    expect(() => runOnce(adapter, 'c', 'Export', boom)).not.toThrow();
    expect(tasks.getSnapshot().tasks.at(-1)).toMatchObject({
      state: 'failed',
      detail: 'boom',
    });
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
    const { notifications } = await import('../../tasks/notifications.js');
    expect(notifications.getSnapshot().items.at(-1)).toMatchObject({
      message: 'Rejecting failed',
      tone: 'error',
      detail: 'no',
    });
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

  it('fails a task whose exporter resolves without a terminal status', async () => {
    const { tasks } = await import('../../tasks/taskStore.js');
    const adapter = {} as ViewerAdapter;
    runOnce(adapter, 'quiet', 'Quiet', async (job) => {
      job.task.progress(null, 'Working');
    });
    await Promise.resolve();
    expect(tasks.getSnapshot().tasks.at(-1)).toMatchObject({
      state: 'failed',
      detail: 'Export ended without a result',
    });
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
      report({ phase: 'done', missingColumns: ['Ghost'] } as never),
    ).toMatchObject({ state: 'warning' });
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

  it('calls onSettingsChanged with no previous snapshot first, then on each change', () => {
    const { adapter } = fakeAdapter();
    const tool = new FakeTool('a');
    const registry = new ToolRegistry().register(tool);
    const view = render(<Probe registry={registry} adapter={adapter} />);
    expect(tool.changed).toHaveBeenCalledTimes(1);
    expect(tool.changed.mock.calls[0]?.[1]).toBeUndefined();
    fireEvent.click(view.getByText('off'));
    expect(tool.changed).toHaveBeenCalledTimes(2);
    expect(tool.changed.mock.calls[1]?.[1]).toMatchObject({ enabled: true });
    expect(tool.changed.mock.calls[1]?.[2]).toMatchObject({ enabled: false });
  });

  it('calls onModelsReady once per ready model signature', () => {
    const models: Array<{
      id: string;
      urn: string;
      name: string;
      version: string;
      visible: boolean;
      status: 'ready';
    }> = [];
    let listener: ((next: typeof models) => void) | undefined;
    const adapter = {
      registerToolGroup: () => () => undefined,
      getModels: () => models,
      onModelsChange: (cb: (next: typeof models) => void) => {
        listener = cb;
        return () => undefined;
      },
    } as unknown as ViewerAdapter;
    const tool = new FakeTool('a');
    const registry = new ToolRegistry().register(tool);
    renderHook(() =>
      useViewerTools(registry, { ...base, adapter, active: true }),
    );
    expect(tool.ready).not.toHaveBeenCalled();
    act(() => {
      models.push({
        id: 'm',
        urn: 'm',
        name: 'M',
        version: '1',
        visible: true,
        status: 'ready',
      });
      listener?.(models);
    });
    expect(tool.ready).toHaveBeenCalledOnce();
    act(() => {
      listener?.(models);
    });
    expect(tool.ready).toHaveBeenCalledOnce();
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
