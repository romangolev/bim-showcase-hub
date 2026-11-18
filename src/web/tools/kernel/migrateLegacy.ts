import { isRecord } from '../../../shared/guards.js';
import { readJson, writeJson } from '../../storage.js';
import type { ToolRegistry } from './ToolRegistry.js';

function has(blob: Record<string, unknown>, field: string): boolean {
  return Object.hasOwn(blob, field);
}

export function migrateLegacySettings(
  registry: ToolRegistry,
  appKey: string,
  { scrub = false }: { scrub?: boolean } = {},
): void {
  const blob = readJson<unknown>(appKey, undefined);
  if (!isRecord(blob)) return;
  const legacyFields = new Set<string>();
  let stored = true;
  for (const tool of registry.all()) {
    const { legacy } = tool;
    if (!legacy) continue;
    for (const field of legacy.fields) legacyFields.add(field);
    const present = legacy.fields.some((field) => has(blob, field));
    const taken = readJson<unknown>(tool.settings.key, undefined) !== undefined;
    if (present && !taken) {
      const clean = tool.settings.sanitize(legacy.read(blob));
      const value = scrub ? tool.scrub(clean) : clean;
      stored = writeJson(tool.settings.key, value) && stored;
    }
  }
  if (
    (!stored && !scrub) ||
    ![...legacyFields].some((field) => has(blob, field))
  )
    return;
  const rest = Object.fromEntries(
    Object.entries(blob).filter(([field]) => !legacyFields.has(field)),
  );
  writeJson(appKey, rest);
}
