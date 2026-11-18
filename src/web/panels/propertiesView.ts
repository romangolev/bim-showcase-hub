import type { ElementProperty } from '../viewer/propertyReads.js';

export interface PropertyGroup {
  category: string;
  items: ElementProperty[];
}

export const MAX_SELECTED = 20;

export function valueText(value: ElementProperty['value']): string {
  return value === null ? '' : String(value);
}

export function groupProperties(
  properties: readonly ElementProperty[],
  filter: string,
): PropertyGroup[] {
  const needle = filter.trim().toLowerCase();
  const groups = new Map<string, ElementProperty[]>();
  for (const prop of properties) {
    const haystack = `${prop.category} ${prop.name} ${valueText(prop.value)}`;
    if (needle && !haystack.toLowerCase().includes(needle)) continue;
    const list = groups.get(prop.category);
    if (list) list.push(prop);
    else groups.set(prop.category, [prop]);
  }
  return [...groups]
    .map(([category, items]) => ({ category, items }))
    .sort((a, b) => a.category.localeCompare(b.category));
}
