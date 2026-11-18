import type { PropertyInfo } from './propertyReads.js';

export interface CatalogGroup {
  category: string;
  properties: PropertyInfo[];
}

export function groupCatalog(
  catalog: readonly PropertyInfo[],
  query = '',
): CatalogGroup[] {
  const needle = query.trim().toLowerCase();
  const groups = new Map<string, PropertyInfo[]>();
  for (const info of catalog) {
    const hit =
      !needle ||
      info.name.toLowerCase().includes(needle) ||
      info.category.toLowerCase().includes(needle);
    if (!hit) continue;
    const list = groups.get(info.category) ?? [];
    list.push(info);
    groups.set(info.category, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, properties]) => ({
      category,
      properties: properties.sort((a, b) => a.name.localeCompare(b.name)),
    }));
}
