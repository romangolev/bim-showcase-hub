import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_IFC_SETTINGS } from '../ifc/settings.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { STILL_LOADING_MESSAGE } from '../viewer/viewerGeometry.js';
import {
  type BatchItem,
  batchEntryNames,
  runIfcBatch,
  zipFileName,
} from './ifcBatch.js';

const item = (urn: string, file = 'Tower.rvt', version = 'v1'): BatchItem => ({
  urn,
  file,
  version,
});

vi.mock('./ifcExport.js', () => ({
  exportToIfc: vi.fn(),
}));
const { exportToIfc } = await import('./ifcExport.js');
const exportMock = vi.mocked(exportToIfc);

beforeEach(() => exportMock.mockReset());

function setup(
  behaviour: (urn: string, call: number) => 'ok' | 'loading' | string,
) {
  const calls = new Map<string, number>();
  const destroyed: string[] = [];
  const adapters: string[] = [];
  const added: string[] = [];
  exportMock.mockImplementation(async (adapter, options) => {
    const urn = adapters[adapters.length - 1] as string;
    void adapter;
    const call = (calls.get(urn) ?? 0) + 1;
    calls.set(urn, call);
    const result = behaviour(urn, call);
    if (result === 'ok') {
      options?.save?.(new Blob([`ifc ${urn}`]), options.fileName ?? '');
      return { phase: 'done' } as never;
    }
    return {
      phase: 'error',
      message: `Export failed: ${result === 'loading' ? STILL_LOADING_MESSAGE : result}`,
    };
  });
  const factory = async () =>
    ({
      load: async (urn: string) => {
        adapters.push(urn);
      },
      destroy: () => destroyed.push(adapters[adapters.length - 1] as string),
    }) as unknown as ViewerAdapter;
  const zip = () => ({
    add: async (name: string) => {
      added.push(name);
    },
    finish: () => new Blob(['zip']),
  });
  const save = vi.fn();
  return {
    destroyed,
    added,
    save,
    options: {
      settings: DEFAULT_IFC_SETTINGS,
      factory,
      zip,
      save,
      wait: async () => undefined,
    },
  };
}

describe('batchEntryNames', () => {
  it('names files and suffixes duplicates case-insensitively', () => {
    expect(
      batchEntryNames([
        item('a'),
        item('b'),
        item('c', 'tower.rvt'),
        item('d', 'Tower.rvt', 'v2'),
      ]),
    ).toEqual([
      'Tower-v1.ifc',
      'Tower-v1-2.ifc',
      'tower-v1-3.ifc',
      'Tower-v2.ifc',
    ]);
  });

  it('names the zip after the project or the date', () => {
    const now = new Date('2026-03-04T10:00:00Z');
    expect(zipFileName('My Project!', now)).toBe('My-Project-ifc-batch.zip');
    expect(zipFileName(undefined, now)).toBe('2026-03-04-ifc-batch.zip');
  });
});

describe('runIfcBatch', () => {
  it('exports every model into the zip and removes the hosts', async () => {
    const s = setup(() => 'ok');
    const result = await runIfcBatch(
      [item('a'), item('b'), item('c')],
      s.options,
    );
    expect(s.added).toEqual([
      'Tower-v1.ifc',
      'Tower-v1-2.ifc',
      'Tower-v1-3.ifc',
    ]);
    expect(result.done).toHaveLength(3);
    expect(s.destroyed).toEqual(['a', 'b', 'c']);
    expect(s.save).toHaveBeenCalledOnce();
    expect(document.body.querySelectorAll('[inert]')).toHaveLength(0);
  });

  it('continues after a failed model and reports it', async () => {
    const s = setup((urn) => (urn === 'b' ? 'boom' : 'ok'));
    const result = await runIfcBatch(
      [item('a'), item('b'), item('c')],
      s.options,
    );
    expect(result.done).toHaveLength(2);
    expect(result.failed).toEqual([{ name: 'Tower-v1-2.ifc', reason: 'boom' }]);
    expect(s.destroyed).toEqual(['a', 'b', 'c']);
  });

  it('retries while the model is still loading', async () => {
    const s = setup((_urn, call) => (call < 3 ? 'loading' : 'ok'));
    const result = await runIfcBatch([item('a')], s.options);
    expect(result.done).toHaveLength(1);
    expect(exportMock).toHaveBeenCalledTimes(3);
  });

  it('stops after the current model when aborted and keeps the partial zip', async () => {
    const controller = new AbortController();
    const s = setup((urn) => {
      if (urn === 'a') controller.abort();
      return 'ok';
    });
    const result = await runIfcBatch([item('a'), item('b')], {
      ...s.options,
      signal: controller.signal,
    });
    expect(result.cancelled).toBe(true);
    expect(result.done).toHaveLength(1);
    expect(s.save).toHaveBeenCalledOnce();
  });

  it('destroys the adapter when loading throws', async () => {
    const s = setup(() => 'ok');
    const destroyed = vi.fn();
    const result = await runIfcBatch([item('a')], {
      ...s.options,
      factory: async () =>
        ({
          load: async () => {
            throw new Error('no load');
          },
          destroy: destroyed,
        }) as unknown as ViewerAdapter,
    });
    expect(destroyed).toHaveBeenCalledOnce();
    expect(result.failed[0]?.reason).toBe('no load');
    expect(s.save).not.toHaveBeenCalled();
  });
});
