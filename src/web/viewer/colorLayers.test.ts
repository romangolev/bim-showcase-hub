import { describe, expect, it, vi } from 'vitest';
import {
  type Color,
  type ColorLayer,
  colorKey,
  colorLayersFor,
  createColorLayer,
  createColorLayerController,
  resolveLayers,
  sameColor,
  setLayerColor,
  THEMING_CHUNK_SIZE,
  type ThemingTarget,
} from './colorLayers.js';
import type { ModelDbId } from './modelSet.js';

const RED: Color = [1, 0, 0, 1];
const BLUE: Color = [0, 0, 1, 1];
const TINT: Color = [0.2, 0.4, 0.8, 0.3];

function recorder() {
  const set = vi.fn();
  const clear = vi.fn();
  const target = {
    setModelThemingColor: set,
    clearModelThemingColors: clear,
  };
  return { set, clear, target };
}

function layerWith(
  source: 'paint' | 'chart' | 'modelTint',
  entries: [string, number, Color][],
): ColorLayer {
  const layer = createColorLayer(source);
  for (const [modelId, dbId, color] of entries) {
    setLayerColor(layer, modelId, dbId, color);
  }
  return layer;
}

function ids(modelId: string, dbIds: number[]): ModelDbId[] {
  return dbIds.map((dbId) => ({ modelId, dbId }));
}

describe('resolveLayers', () => {
  it('lets paint beat chart, and chart beat the model tint', () => {
    const paint = layerWith('paint', [['a', 1, RED]]);
    const chart = layerWith('chart', [
      ['a', 1, BLUE],
      ['a', 2, BLUE],
    ]);
    const tint = layerWith('modelTint', [
      ['a', 1, TINT],
      ['a', 2, TINT],
      ['a', 3, TINT],
      ['b', 4, TINT],
    ]);
    const resolved = resolveLayers([tint, chart, paint]);
    expect(
      resolved.map((entry) => [
        entry.modelId,
        entry.dbId,
        entry.color[0],
        entry.source,
      ]),
    ).toEqual([
      ['a', 1, 1, 'paint'],
      ['a', 2, 0, 'chart'],
      ['a', 3, 0.2, 'modelTint'],
      ['b', 4, 0.2, 'modelTint'],
    ]);
  });

  it('keeps the highest-priority colour for one element', () => {
    const paint = layerWith('paint', [['a', 7, RED]]);
    const chart = layerWith('chart', [['a', 7, BLUE]]);
    expect(resolveLayers([paint, chart])).toEqual([
      { modelId: 'a', dbId: 7, color: RED, source: 'paint' },
    ]);
  });

  it('compares colours exactly', () => {
    expect(sameColor(RED, [1, 0, 0, 1])).toBe(true);
    expect(sameColor(RED, [1, 0, 0, 0.5])).toBe(false);
    expect(sameColor([0.5, 0, 0, 1], [0.5000001, 0, 0, 1])).toBe(false);
  });
});

describe('colour layer controller', () => {
  it('falls back to the next layer when the owner clears its own', () => {
    const { set, clear, target } = recorder();
    const controller = createColorLayerController(target);
    controller.setColors('modelTint', ids('a', [1]), TINT);
    controller.setColors('chart', ids('a', [1]), BLUE);
    controller.setColors('paint', ids('a', [1]), RED);
    expect(set.mock.calls.at(-1)).toEqual([ids('a', [1]), RED]);

    controller.clearSource('paint');
    expect(set.mock.calls.at(-1)).toEqual([ids('a', [1]), BLUE]);
    controller.clearSource('chart');
    expect(set.mock.calls.at(-1)).toEqual([ids('a', [1]), TINT]);
    controller.clearSource('modelTint');
    expect(clear).toHaveBeenLastCalledWith(ids('a', [1]));
    expect(set).toHaveBeenCalledTimes(5);
  });

  it('does nothing when an identical resolution is applied again', () => {
    const { set, clear, target } = recorder();
    const controller = createColorLayerController(target);
    controller.setColors('paint', ids('a', [1, 2]), RED);
    expect(set).toHaveBeenCalledTimes(1);
    controller.setColors('paint', ids('a', [1, 2]), RED);
    expect(set).toHaveBeenCalledTimes(1);
    controller.clearSource('chart');
    expect(set).toHaveBeenCalledTimes(1);
    expect(clear).not.toHaveBeenCalled();
  });

  it('rewrites only the elements whose colour changed', () => {
    const { set, target } = recorder();
    const controller = createColorLayerController(target);
    controller.setColors('paint', ids('a', [1, 2]), RED);
    controller.setColors('paint', ids('a', [2]), BLUE);
    expect(set).toHaveBeenLastCalledWith(ids('a', [2]), BLUE);
    expect(set).toHaveBeenCalledTimes(2);
  });

  it('clears only elements no lower layer covers', () => {
    const { set, clear, target } = recorder();
    const controller = createColorLayerController(target);
    controller.setColors('modelTint', ids('a', [1, 2]), TINT);
    controller.setColors('paint', ids('a', [1]), RED);
    set.mockClear();
    controller.clearSource('paint');
    expect(set).toHaveBeenCalledExactlyOnceWith(ids('a', [1]), TINT);
    expect(clear).not.toHaveBeenCalled();
  });

  it('chunks large assignment sets', () => {
    const { set, target } = recorder();
    const controller = createColorLayerController(target);
    const count = THEMING_CHUNK_SIZE * 2 + 5;
    const dbIds = Array.from({ length: count }, (_, index) => index + 1);
    controller.setColors('paint', ids('a', dbIds), RED);
    expect(set).toHaveBeenCalledTimes(3);
    const sizes = set.mock.calls.map((call) => call[0].length);
    expect(sizes.reduce((sum, size) => sum + size, 0)).toBe(count);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(THEMING_CHUNK_SIZE);
  });

  it('chunks clears the same way', () => {
    const { set, clear, target } = recorder();
    const controller = createColorLayerController(target);
    const count = THEMING_CHUNK_SIZE + 1;
    const dbIds = Array.from({ length: count }, (_, index) => index + 1);
    controller.setColors('paint', ids('a', dbIds), RED);
    set.mockClear();
    controller.clearSource('paint');
    expect(clear).toHaveBeenCalledTimes(2);
    expect(clear.mock.calls[0]?.[0]).toHaveLength(THEMING_CHUNK_SIZE);
    expect(clear.mock.calls[1]?.[0]).toHaveLength(1);
  });

  it('keeps models apart when dbIds collide', () => {
    const { set, target } = recorder();
    const controller = createColorLayerController(target);
    controller.setColors('chart', ids('a', [1, 2]), RED);
    controller.setColors('modelTint', ids('b', [1]), BLUE);
    expect(controller.hasColor('chart', 'a', 1)).toBe(true);
    expect(controller.hasColor('chart', 'b', 1)).toBe(false);
    expect(controller.hasColor('modelTint', 'b', 1)).toBe(true);
    expect(set).toHaveBeenCalledTimes(2);
  });

  it('a model tint replaces the previous colour of that model only', () => {
    const { set, clear, target } = recorder();
    const controller = createColorLayerController(target);
    controller.replaceModel('modelTint', 'a', [1, 2], RED);
    controller.replaceModel('modelTint', 'a', [3], BLUE);
    expect(clear).toHaveBeenCalledWith(ids('a', [1, 2]));
    expect(set).toHaveBeenLastCalledWith(ids('a', [3]), BLUE);
  });

  it('forgets a model without touching the viewer', () => {
    const { set, clear, target } = recorder();
    const controller = createColorLayerController(target);
    controller.setColors('paint', ids('a', [1]), RED);
    set.mockClear();
    clear.mockClear();
    controller.forgetModel('a');
    expect(set).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    expect(controller.hasModel('paint', 'a')).toBe(false);
    controller.setColors('paint', ids('a', [1]), RED);
    expect(set).toHaveBeenCalledOnce();
  });

  it('shares one controller per adapter and resets it on request', () => {
    const { set, target } = recorder();
    const controller = colorLayersFor(target);
    expect(colorLayersFor(target)).toBe(controller);
    controller.setColors('chart', ids('a', [1]), RED);
    controller.reset();
    expect(controller.hasColor('chart', 'a', 1)).toBe(false);
    set.mockClear();
    controller.setColors('chart', ids('a', [1]), RED);
    expect(set).toHaveBeenCalledOnce();
  });
});

describe('replaceSource', () => {
  const green: Color = [0, 1, 0, 1];

  function thinRecorder() {
    const calls: string[] = [];
    const target: ThemingTarget = {
      setModelThemingColor: (items, color) =>
        calls.push(`set ${items.length} ${colorKey(color)}`),
      clearModelThemingColors: (items) => calls.push(`clear ${items.length}`),
    };
    return { calls, controller: createColorLayerController(target) };
  }

  it('replaces a whole source in one settle', () => {
    const { calls, controller } = thinRecorder();
    controller.replaceSource(
      'chart',
      new Map([
        [
          'm',
          new Map([
            [1, RED],
            [2, RED],
            [3, BLUE],
          ]),
        ],
      ]),
    );
    expect(calls).toEqual(['set 2 1,0,0,1', 'set 1 0,0,1,1']);
    calls.length = 0;
    controller.replaceSource(
      'chart',
      new Map([
        [
          'm',
          new Map([
            [1, RED],
            [3, RED],
          ]),
        ],
      ]),
    );
    expect(calls).toEqual(['set 1 1,0,0,1', 'clear 1']);
  });

  it('keeps paint above the replaced chart colours', () => {
    const { controller } = thinRecorder();
    controller.setColors('paint', ids('m', [1]), green);
    controller.replaceSource(
      'chart',
      new Map([
        [
          'm',
          new Map([
            [1, RED],
            [2, RED],
          ]),
        ],
      ]),
    );
    expect(
      resolveLayers(controller.layers()).map((entry) => [
        entry.dbId,
        entry.color,
      ]),
    ).toEqual([
      [1, green],
      [2, RED],
    ]);
  });
});
