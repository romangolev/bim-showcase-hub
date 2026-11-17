import type { ModelDbId } from '../viewer/modelSet.js';

export interface ViewCamera {
  eye: readonly [number, number, number];
  target: readonly [number, number, number];
  up: readonly [number, number, number];
  ortho: boolean;
}

export interface ViewLink {
  camera: ViewCamera;
  selection: ModelDbId[];
}

export const VIEW_VERSION = '1';
export const VIEW_SELECTION_CAP = 200;

const SEPARATOR = '~';

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function vec(values: readonly number[]): string {
  return values.map((value) => round(value)).join(',');
}

function parseVec(raw: string | undefined): [number, number, number] | null {
  const parts = (raw ?? '').split(',');
  if (parts.length !== 3) return null;
  const numbers = parts.map((part) =>
    part === '' ? Number.NaN : Number(part),
  );
  if (!numbers.every(Number.isFinite)) return null;
  return numbers as [number, number, number];
}

export function encodeView(
  link: ViewLink,
  modelIds: readonly string[],
): string {
  const byModel = new Map<number, number[]>();
  let count = 0;
  for (const { modelId, dbId } of link.selection) {
    const index = modelIds.indexOf(modelId);
    if (index === -1 || count >= VIEW_SELECTION_CAP) continue;
    count += 1;
    const ids = byModel.get(index);
    if (ids) ids.push(dbId);
    else byModel.set(index, [dbId]);
  }
  const selection = [...byModel]
    .map(([index, ids]) => `${index}:${ids.join(',')}`)
    .join(';');
  return [
    VIEW_VERSION,
    vec(link.camera.eye),
    vec(link.camera.target),
    vec(link.camera.up),
    link.camera.ortho ? 'o' : 'p',
    selection,
  ].join(SEPARATOR);
}

export function parseView(
  raw: unknown,
  modelIds: readonly string[],
): ViewLink | null {
  if (typeof raw !== 'string') return null;
  const [version, eye, target, up, projection, selection = ''] =
    raw.split(SEPARATOR);
  if (version !== VIEW_VERSION) return null;
  const camera = [parseVec(eye), parseVec(target), parseVec(up)];
  if (camera.some((entry) => entry === null)) return null;
  if (projection !== 'o' && projection !== 'p') return null;
  const items: ModelDbId[] = [];
  for (const group of selection ? selection.split(';') : []) {
    const [indexRaw, idsRaw = ''] = group.split(':');
    const modelId = modelIds[Number(indexRaw)];
    if (modelId === undefined) continue;
    for (const part of idsRaw.split(',')) {
      const dbId = Number(part);
      if (part !== '' && Number.isInteger(dbId) && dbId >= 0) {
        items.push({ modelId, dbId });
      }
    }
  }
  return {
    camera: {
      eye: camera[0] as [number, number, number],
      target: camera[1] as [number, number, number],
      up: camera[2] as [number, number, number],
      ortho: projection === 'o',
    },
    selection: items.slice(0, VIEW_SELECTION_CAP),
  };
}

export function withViewParam(href: string, view: string | null): string {
  const url = new URL(href);
  url.searchParams.delete('view');
  if (view) url.searchParams.set('view', view);
  return url.toString();
}
