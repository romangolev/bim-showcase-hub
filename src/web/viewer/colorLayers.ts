import type { ModelDbId } from './modelSet.js';

export type Color = readonly [
  red: number,
  green: number,
  blue: number,
  alpha: number,
];

export type ColorSource = 'paint' | 'chart' | 'modelTint';

export const COLOR_SOURCE_ORDER: readonly ColorSource[] = [
  'paint',
  'chart',
  'modelTint',
];

export const THEMING_CHUNK_SIZE = 2048;

export interface ColorLayer {
  readonly source: ColorSource;
  readonly assignments: Map<string, Map<number, Color>>;
}

export interface ResolvedColor extends ModelDbId {
  color: Color;
  source: ColorSource;
}

export interface ThemingTarget {
  setModelThemingColor(items: readonly ModelDbId[], color: Color): void;
  clearModelThemingColors(items: readonly ModelDbId[]): void;
}

export interface ColorLayerController {
  layer(source: ColorSource): ColorLayer;
  layers(): readonly ColorLayer[];
  setColors(
    source: ColorSource,
    items: readonly ModelDbId[],
    color: Color,
  ): void;
  replaceModel(
    source: ColorSource,
    modelId: string,
    dbIds: readonly number[],
    color: Color,
  ): void;
  replaceSource(
    source: ColorSource,
    assignments: ReadonlyMap<string, ReadonlyMap<number, Color>>,
  ): void;
  clearModel(source: ColorSource, modelId: string): void;
  clearSource(source: ColorSource): void;
  clearAll(): void;
  hasModel(source: ColorSource, modelId: string): boolean;
  hasColor(source: ColorSource, modelId: string, dbId: number): boolean;
  forgetModel(modelId: string): void;
  reset(): void;
}

export function sameColor(left: Color, right: Color): boolean {
  return (
    left[0] === right[0] &&
    left[1] === right[1] &&
    left[2] === right[2] &&
    left[3] === right[3]
  );
}

export function colorKey(color: Color): string {
  return `${color[0]},${color[1]},${color[2]},${color[3]}`;
}

export function createColorLayer(source: ColorSource): ColorLayer {
  return { source, assignments: new Map() };
}

function modelColors(layer: ColorLayer, modelId: string): Map<number, Color> {
  let colors = layer.assignments.get(modelId);
  if (!colors) {
    colors = new Map();
    layer.assignments.set(modelId, colors);
  }
  return colors;
}

export function setLayerColor(
  layer: ColorLayer,
  modelId: string,
  dbId: number,
  color: Color,
): void {
  modelColors(layer, modelId).set(dbId, color);
}

export function setLayerColors(
  layer: ColorLayer,
  items: readonly ModelDbId[],
  color: Color,
): void {
  for (const { modelId, dbId } of items) {
    setLayerColor(layer, modelId, dbId, color);
  }
}

export function replaceLayerModel(
  layer: ColorLayer,
  modelId: string,
  dbIds: readonly number[],
  color: Color,
): void {
  layer.assignments.delete(modelId);
  if (dbIds.length === 0) return;
  const colors = modelColors(layer, modelId);
  for (const dbId of dbIds) colors.set(dbId, color);
}

export function clearLayerModel(layer: ColorLayer, modelId: string): boolean {
  return layer.assignments.delete(modelId);
}

export function clearLayer(layer: ColorLayer): void {
  layer.assignments.clear();
}

export function isEmptyLayer(layer: ColorLayer): boolean {
  return layer.assignments.size === 0;
}

export function layerHasModel(layer: ColorLayer, modelId: string): boolean {
  return layer.assignments.has(modelId);
}

function sourceRank(source: ColorSource): number {
  const rank = COLOR_SOURCE_ORDER.indexOf(source);
  return rank === -1 ? COLOR_SOURCE_ORDER.length : rank;
}

export function resolveLayers(layers: readonly ColorLayer[]): ResolvedColor[] {
  const ordered = [...layers].sort(
    (left, right) => sourceRank(left.source) - sourceRank(right.source),
  );
  const seen = new Map<string, Set<number>>();
  const resolved: ResolvedColor[] = [];
  for (const layer of ordered) {
    for (const [modelId, colors] of layer.assignments) {
      let ids = seen.get(modelId);
      if (!ids) {
        ids = new Set();
        seen.set(modelId, ids);
      }
      const claimed = ids;
      for (const [dbId, color] of colors) {
        if (claimed.has(dbId)) continue;
        claimed.add(dbId);
        resolved.push({ modelId, dbId, color, source: layer.source });
      }
    }
  }
  return resolved;
}

type AppliedColors = Map<string, Map<number, Color>>;

function appliedFrom(resolved: readonly ResolvedColor[]): AppliedColors {
  const applied: AppliedColors = new Map();
  applyResolved(applied, resolved);
  return applied;
}

function applyResolved(
  applied: AppliedColors,
  resolved: readonly ResolvedColor[],
): void {
  for (const { modelId, dbId, color } of resolved) {
    let colors = applied.get(modelId);
    if (!colors) {
      colors = new Map();
      applied.set(modelId, colors);
    }
    colors.set(dbId, color);
  }
}

function settle(
  target: ThemingTarget,
  applied: AppliedColors,
  next: AppliedColors,
): AppliedColors {
  const sets = new Map<string, { color: Color; items: ModelDbId[] }>();
  const clears: ModelDbId[] = [];
  for (const [modelId, colors] of applied) {
    const wanted = next.get(modelId);
    for (const [dbId, color] of colors) {
      const replacement = wanted?.get(dbId);
      if (!replacement) clears.push({ modelId, dbId });
      else if (!sameColor(color, replacement)) {
        addSet(sets, { modelId, dbId }, replacement);
      }
    }
  }
  for (const [modelId, colors] of next) {
    const current = applied.get(modelId);
    for (const [dbId, color] of colors) {
      if (!current?.has(dbId)) addSet(sets, { modelId, dbId }, color);
    }
  }
  for (const { color, items } of sets.values()) {
    for (let i = 0; i < items.length; i += THEMING_CHUNK_SIZE) {
      target.setModelThemingColor(
        items.slice(i, i + THEMING_CHUNK_SIZE),
        color,
      );
    }
  }
  for (let i = 0; i < clears.length; i += THEMING_CHUNK_SIZE) {
    target.clearModelThemingColors(clears.slice(i, i + THEMING_CHUNK_SIZE));
  }
  return next;
}

function addSet(
  sets: Map<string, { color: Color; items: ModelDbId[] }>,
  item: ModelDbId,
  color: Color,
): void {
  const key = colorKey(color);
  const entry = sets.get(key);
  if (entry) entry.items.push(item);
  else sets.set(key, { color, items: [item] });
}

export function createColorLayerController(
  target: ThemingTarget,
): ColorLayerController {
  const layers = new Map<ColorSource, ColorLayer>(
    COLOR_SOURCE_ORDER.map((source) => [source, createColorLayer(source)]),
  );
  let applied: AppliedColors = new Map();
  const layerOf = (source: ColorSource): ColorLayer => {
    const layer = layers.get(source);
    if (!layer) throw new Error(`Unknown colour source: ${source}`);
    return layer;
  };
  const list = () => COLOR_SOURCE_ORDER.map((source) => layerOf(source));
  const sync = (): void => {
    const next = appliedFrom(resolveLayers(list()));
    applied = settle(target, applied, next);
  };
  return {
    layer: layerOf,
    layers: () => list(),
    setColors(source, items, color) {
      setLayerColors(layerOf(source), items, color);
      sync();
    },
    replaceModel(source, modelId, dbIds, color) {
      replaceLayerModel(layerOf(source), modelId, dbIds, color);
      sync();
    },
    replaceSource(source, assignments) {
      const layer = layerOf(source);
      clearLayer(layer);
      for (const [modelId, colors] of assignments) {
        if (colors.size > 0) layer.assignments.set(modelId, new Map(colors));
      }
      sync();
    },
    clearModel(source, modelId) {
      if (!clearLayerModel(layerOf(source), modelId)) return;
      sync();
    },
    clearSource(source) {
      const layer = layerOf(source);
      if (isEmptyLayer(layer)) return;
      clearLayer(layer);
      sync();
    },
    clearAll() {
      for (const layer of layers.values()) clearLayer(layer);
      sync();
    },
    hasModel: (source, modelId) => layerHasModel(layerOf(source), modelId),
    hasColor: (source, modelId, dbId) =>
      layerOf(source).assignments.get(modelId)?.has(dbId) === true,
    forgetModel(modelId) {
      for (const layer of layers.values()) clearLayerModel(layer, modelId);
      applied.delete(modelId);
    },
    reset() {
      for (const layer of layers.values()) clearLayer(layer);
      applied = new Map();
    },
  };
}

const controllers = new WeakMap<ThemingTarget, ColorLayerController>();

export function colorLayersFor(target: ThemingTarget): ColorLayerController {
  let controller = controllers.get(target);
  if (!controller) {
    controller = createColorLayerController(target);
    controllers.set(target, controller);
  }
  return controller;
}

export function resetColorLayers(target: ThemingTarget): void {
  controllers.get(target)?.reset();
}
