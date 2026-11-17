import type {
  IfcMesh,
  IfcSourceRead,
  PropertyGroups,
  PropertyValue,
  SourceElement,
  SourceModel,
} from '../ifc/types.js';
import type { BulkPropertyItem, GuiViewer3D, ViewerModel } from './autodesk.js';
import { NO_MESH_MESSAGE, readViewerGeometry } from './viewerGeometry.js';

export interface SourceModelMeta {
  id: string;
  name: string;
  urn: string;
}

const CHUNK = 1000;
const OTHER_GROUP = 'Other';
const CATEGORY_GROUP = '__category__';

function propertyValue(value: unknown): PropertyValue | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean' || typeof value === 'number') return value;
  const text = typeof value === 'string' ? value : String(value);
  return text.trim() === '' ? null : text;
}

function groupsOf(item: BulkPropertyItem): PropertyGroups {
  const groups: PropertyGroups = {};
  for (const property of item.properties) {
    const raw = property.displayCategory?.trim() || OTHER_GROUP;
    const isCategory =
      raw === CATEGORY_GROUP && property.displayName === 'Category';
    if (raw.startsWith('__') && !isCategory) continue;
    const group = isCategory ? OTHER_GROUP : raw;
    const value = propertyValue(property.displayValue);
    if (value === null) continue;
    const target = groups[group] ?? {};
    target[property.displayName] = value;
    groups[group] = target;
  }
  return groups;
}

function bulkProperties(
  model: ViewerModel,
  ids: number[],
): Promise<BulkPropertyItem[]> {
  return new Promise((resolve, reject) =>
    model.getBulkProperties(ids, {}, resolve, reject),
  );
}

async function externalIdsOf(model: ViewerModel): Promise<Map<number, string>> {
  const read = model.getExternalIdMapping;
  const out = new Map<number, string>();
  if (typeof read !== 'function') return out;
  try {
    const map = await new Promise<Record<string, number>>((resolve, reject) =>
      read.call(model, resolve, reject),
    );
    for (const [externalId, dbId] of Object.entries(map)) {
      if (!out.has(dbId)) out.set(dbId, externalId);
    }
  } catch {
    return out;
  }
  return out;
}

async function readModel(
  viewer: GuiViewer3D,
  model: ViewerModel,
  meta: SourceModelMeta,
): Promise<{ source: SourceModel; skipped: number } | null> {
  let geometry: ReturnType<typeof readViewerGeometry>;
  try {
    geometry = readViewerGeometry(viewer, new Map([[model, meta.name]]));
  } catch (err) {
    if (err instanceof Error && err.message === NO_MESH_MESSAGE) return null;
    throw err;
  }
  const byDbId = new Map<number, IfcMesh[]>();
  let skipped = geometry.skipped;
  for (const part of geometry.parts) {
    if (part.dbId === undefined) {
      skipped += 1;
      continue;
    }
    const list = byDbId.get(part.dbId) ?? [];
    list.push(part);
    byDbId.set(part.dbId, list);
  }
  const ids = [...byDbId.keys()];
  const items = new Map<number, BulkPropertyItem>();
  for (let start = 0; start < ids.length; start += CHUNK) {
    const chunk = ids.slice(start, start + CHUNK);
    for (const item of await bulkProperties(model, chunk)) {
      items.set(item.dbId, item);
    }
  }
  const needsMapping = ids.some((dbId) => !items.get(dbId)?.externalId);
  const externalIds = needsMapping
    ? await externalIdsOf(model)
    : new Map<number, string>();
  const elements: SourceElement[] = ids.map((dbId) => {
    const item = items.get(dbId);
    const externalId = item?.externalId || externalIds.get(dbId);
    return {
      dbId,
      ...(externalId ? { externalId } : {}),
      name: item?.name ?? '',
      properties: item ? groupsOf(item) : {},
      parts: byDbId.get(dbId) ?? [],
    };
  });
  return {
    source: { id: meta.id, name: meta.name, urn: meta.urn, elements },
    skipped,
  };
}

export async function readViewerSource(
  viewer: GuiViewer3D,
  models: ReadonlyMap<ViewerModel, SourceModelMeta>,
): Promise<IfcSourceRead> {
  const sources: SourceModel[] = [];
  let skipped = 0;
  for (const [model, meta] of models) {
    const result = await readModel(viewer, model, meta);
    if (!result) continue;
    sources.push(result.source);
    skipped += result.skipped;
  }
  if (sources.length === 0) throw new Error(NO_MESH_MESSAGE);
  return { models: sources, skipped };
}
