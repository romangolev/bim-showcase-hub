import { describe, expect, it, vi } from 'vitest';
import type { PropertyRow } from '../../shared/types.js';
import { shapeChartData } from '../extensions/dashboardData.js';
import { summarize } from '../extensions/modelSummary.js';
import {
  ALL_MODELS,
  distinctModelCount,
  modelScopeOptions,
  resolveScope,
  scopeRows,
  tagRows,
} from './modelScope.js';
import {
  checkCapacity,
  DUPLICATE_MODEL_MESSAGE,
  loadFailureMessage,
  MAX_COMBINED_MODELS,
  MODEL_LIMIT_MESSAGE,
  type ModelInfo,
  ModelSet,
  ModelSetError,
  readySignature,
  uniqueSources,
} from './modelSet.js';

function caught(fn: () => unknown): ModelSetError {
  try {
    fn();
  } catch (err) {
    if (err instanceof ModelSetError) return err;
    throw err;
  }
  throw new Error('expected a ModelSetError');
}

describe('ModelSet', () => {
  it('adds models in order with names and loading status', () => {
    const set = new ModelSet<string>();
    set.add({ urn: 'a', name: 'Architecture.rvt' });
    set.add({ urn: 'b' });
    expect(set.list()).toEqual([
      {
        id: 'a',
        urn: 'a',
        name: 'Architecture.rvt',
        visible: true,
        status: 'loading',
      },
      { id: 'b', urn: 'b', name: 'Model 2', visible: true, status: 'loading' },
    ]);
  });

  it('caps the set at six models', () => {
    expect(MAX_COMBINED_MODELS).toBe(6);
    const set = new ModelSet<string>();
    for (let i = 0; i < 6; i++) set.add({ urn: `u${i}` });
    const err = caught(() => set.add({ urn: 'u6' }));
    expect(err.code).toBe('limit');
    expect(err.message).toBe(MODEL_LIMIT_MESSAGE);
    expect(set.size).toBe(6);
  });

  it('rejects a duplicate urn and an empty one', () => {
    const set = new ModelSet<string>();
    set.add({ urn: 'a' });
    const dup = caught(() => set.add({ urn: 'a' }));
    expect(dup.code).toBe('duplicate');
    expect(dup.message).toBe(DUPLICATE_MODEL_MESSAGE);
    expect(caught(() => set.add({ urn: '' })).code).toBe('empty');
  });

  it('lets a failed model be retried and not count toward the cap', () => {
    const set = new ModelSet<string>();
    set.add({ urn: 'bad', name: 'Bad.rvt' });
    set.add({ urn: 'b' });
    set.fail('bad', 'boom');
    for (let i = 0; i < 5; i++) set.add({ urn: `u${i}` });
    expect(set.activeCount()).toBe(6);
    expect(caught(() => set.add({ urn: 'u9' })).code).toBe('limit');
    set.remove('u4');
    const retried = set.add({ urn: 'bad' });
    expect(retried).toMatchObject({ name: 'Bad.rvt', status: 'loading' });
    expect(set.list()[0]?.id).toBe('bad');
    expect(set.size).toBe(6);
  });

  it('tracks ready and failed models independently', () => {
    const set = new ModelSet<string>();
    set.add({ urn: 'a' });
    set.add({ urn: 'b' });
    set.add({ urn: 'c' });
    set.resolve('a', 'model-a');
    set.fail('b', 'Document load failed (4): missing');
    set.resolve('c', 'model-c');
    expect(set.get('b')).toMatchObject({
      status: 'error',
      error: 'Document load failed (4): missing',
    });
    expect(set.ready().map((entry) => entry.handle)).toEqual([
      'model-a',
      'model-c',
    ]);
    expect(set.idOf('model-c')).toBe('c');
    expect(set.primaryId()).toBe('a');
    expect(readySignature(set.list())).toBe('a\nc');
    expect(set.get('a')).not.toHaveProperty('error');
  });

  it('does not resolve a model removed while loading', () => {
    const set = new ModelSet<string>();
    set.add({ urn: 'a' });
    set.remove('a');
    expect(set.resolve('a', 'late')).toBe(false);
    expect(set.size).toBe(0);
  });

  it('notifies listeners on every change and isolates their errors', () => {
    const set = new ModelSet<string>();
    const seen: ModelInfo[][] = [];
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    set.onChange(() => {
      throw new Error('listener bug');
    });
    const off = set.onChange((models) => seen.push(models));
    set.add({ urn: 'a' });
    set.resolve('a', 'm');
    expect(set.setVisible('a', false)).toBe(true);
    expect(set.setVisible('a', false)).toBe(false);
    set.remove('a');
    off();
    set.add({ urn: 'b' });
    expect(seen.map((models) => models.map((m) => m.status))).toEqual([
      ['loading'],
      ['ready'],
      ['ready'],
      [],
    ]);
    expect(seen[2]?.[0]?.visible).toBe(false);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('clears and returns loaded handles', () => {
    const set = new ModelSet<string>();
    set.add({ urn: 'a' });
    set.add({ urn: 'b' });
    set.resolve('b', 'model-b');
    expect(set.clear()).toEqual(['model-b']);
    expect(set.list()).toEqual([]);
    set.add({ urn: 'c' });
    expect(set.get('c')?.name).toBe('Model 1');
  });
});

describe('model source helpers', () => {
  it('drops repeated urns and rejects empty input', () => {
    expect(
      uniqueSources([{ urn: 'a' }, { urn: 'b' }, { urn: 'a', name: 'x' }]),
    ).toEqual([{ urn: 'a' }, { urn: 'b' }]);
    expect(caught(() => uniqueSources([])).code).toBe('empty');
    expect(caught(() => uniqueSources([{ urn: '' }])).code).toBe('empty');
  });

  it('checks capacity before loading', () => {
    expect(() => checkCapacity(0, 6)).not.toThrow();
    expect(caught(() => checkCapacity(0, 7)).code).toBe('limit');
    expect(caught(() => checkCapacity(5, 2)).code).toBe('limit');
  });

  it('describes a failed load', () => {
    const failed = (error: string): ModelInfo => ({
      id: error,
      urn: error,
      name: error,
      visible: true,
      status: 'error',
      error,
    });
    expect(loadFailureMessage([failed('boom')])).toBe('boom');
    expect(loadFailureMessage([failed('one'), failed('two')])).toBe(
      'None of the 2 models could be loaded. one',
    );
  });
});

function row(
  dbId: number,
  category: string,
  modelId: string,
  modelName = modelId,
): PropertyRow {
  return {
    dbId,
    name: `El ${dbId}`,
    properties: { Category: category },
    modelId,
    modelName,
  };
}

const models: ModelInfo[] = [
  { id: 'a', urn: 'a', name: 'Arch', visible: true, status: 'ready' },
  { id: 's', urn: 's', name: 'Struct', visible: false, status: 'ready' },
  {
    id: 'm',
    urn: 'm',
    name: 'MEP',
    visible: true,
    status: 'error',
    error: 'x',
  },
];

const combined: PropertyRow[] = [
  row(1, 'Walls', 'a'),
  row(2, 'Doors', 'a'),
  row(1, 'Walls', 's'),
  row(2, 'Columns', 's'),
];

describe('model scope', () => {
  it('offers All models plus every ready model when there are several', () => {
    expect(modelScopeOptions(models)).toEqual([
      { id: ALL_MODELS, label: 'All models' },
      { id: 'a', label: 'Arch' },
      { id: 's', label: 'Struct' },
    ]);
    expect(modelScopeOptions(models.slice(0, 1))).toEqual([]);
  });

  it('falls back to All models when the scoped model is gone', () => {
    expect(resolveScope('a', models)).toBe('a');
    expect(resolveScope('m', models)).toBe(ALL_MODELS);
    expect(resolveScope('gone', models)).toBe(ALL_MODELS);
    expect(resolveScope(ALL_MODELS, [])).toBe(ALL_MODELS);
  });

  it('filters rows by model, keeping colliding dbIds apart', () => {
    expect(scopeRows(combined, 's').map((r) => r.properties.Category)).toEqual([
      'Walls',
      'Columns',
    ]);
    expect(scopeRows(combined, ALL_MODELS)).toHaveLength(4);
    expect(distinctModelCount(combined)).toBe(2);
    expect(distinctModelCount([{ dbId: 1, name: 'x', properties: {} }])).toBe(
      0,
    );
  });

  it('sums counts by value across models for summary and dashboard', () => {
    expect(summarize(combined, ['Category'])).toEqual([
      { property: 'Category', value: 'Walls', count: 2 },
      { property: 'Category', value: 'Columns', count: 1 },
      { property: 'Category', value: 'Doors', count: 1 },
    ]);
    const chart = shapeChartData(scopeRows(combined, 'a'), 'Category');
    expect(chart.total).toBe(2);
    expect(shapeChartData(combined, 'Category').total).toBe(4);
  });

  it('tags rows with their model', () => {
    const tagged = tagRows([{ dbId: 7, name: 'n', properties: {} }], {
      id: 'a',
      name: 'Arch',
    });
    expect(tagged).toEqual([
      { dbId: 7, name: 'n', properties: {}, modelId: 'a', modelName: 'Arch' },
    ]);
  });
});
