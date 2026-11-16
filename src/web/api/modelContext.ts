export interface ModelContext {
  file?: string;
  v?: string;
  trail?: string[];
  crumbs?: string[];
}

export function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === 'string')
  );
}

export function parseModelContext(
  search: Record<string, unknown>,
): ModelContext {
  const context: ModelContext = {};
  if (typeof search.file === 'string' && search.file) {
    context.file = search.file;
  }
  if (typeof search.v === 'string' && search.v) {
    context.v = search.v;
  }
  if (isStringArray(search.trail) && search.trail.length > 0) {
    context.trail = search.trail;
  }
  if (isStringArray(search.crumbs) && search.crumbs.length > 0) {
    context.crumbs = search.crumbs;
  }
  return context;
}

export function versionTag(name: string): string | undefined {
  return /^(v\S+?):/.exec(name)?.[1];
}
