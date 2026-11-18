import { isRecord } from '../../../shared/guards.js';
import type { PersistedRecord } from '../../storage.js';
import type { ToolRegistry } from './ToolRegistry.js';

function has(blob: Record<string, unknown>, field: string): boolean {
  return Object.hasOwn(blob, field);
}

export function migrateLegacySettings(
  registry: ToolRegistry,
  appBlob: PersistedRecord<unknown>,
  { scrub = false }: { scrub?: boolean } = {},
): void {
  const blob = appBlob.read();
  if (!isRecord(blob)) return;
  const legacyFields = new Set<string>();
  let stored = true;
  for (const tool of registry.all()) {
    const { legacy } = tool;
    if (!legacy) continue;
    for (const field of legacy.fields) legacyFields.add(field);
    const present = legacy.fields.some((field) => has(blob, field));
    if (present && !tool.settings.has()) {
      const clean = tool.settings.sanitize(legacy.read(blob));
      const value = scrub ? tool.scrub(clean) : clean;
      stored = tool.settings.write(value) && stored;
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
  appBlob.write(rest);
}
