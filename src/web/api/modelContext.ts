import { MAX_COMBINED_MODELS } from '../../shared/combined.js';

export interface ModelContext {
  file?: string;
  v?: string;
  trail?: string[];
  crumbs?: string[];
  with?: string;
}

export const WITH_SEPARATOR = ',';

export function parseWith(value: unknown, primary?: string): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(WITH_SEPARATOR)
      : [];
  const urns: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const urn = entry.trim();
    if (!urn || urn === primary || urns.includes(urn)) continue;
    urns.push(urn);
  }
  return urns.slice(0, MAX_COMBINED_MODELS - 1);
}

export function withUrns(context: ModelContext | null | undefined): string[] {
  return parseWith(context?.with);
}

export function joinWith(urns: readonly string[]): string | undefined {
  const list = parseWith([...urns]);
  return list.length > 0 ? list.join(WITH_SEPARATOR) : undefined;
}

export function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === 'string')
  );
}

function sameList(a?: readonly string[], b?: readonly string[]): boolean {
  if (!a || !b) return a === b;
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function sameModelContext(a: ModelContext, b: ModelContext): boolean {
  const left = parseModelContext(a);
  const right = parseModelContext(b);
  return (
    left.file === right.file &&
    left.v === right.v &&
    left.with === right.with &&
    sameList(left.crumbs, right.crumbs) &&
    sameList(left.trail, right.trail)
  );
}

export function parseModelContext(value: unknown): ModelContext {
  const context: ModelContext = {};
  if (typeof value !== 'object' || value === null) return context;
  const search = value as Record<string, unknown>;
  if (typeof search.file === 'string' && search.file) {
    context.file = search.file;
  }
  if (typeof search.v === 'string' && search.v) {
    context.v = search.v;
  }
  if (isStringArray(search.trail) && search.trail.length > 0) {
    context.trail = [...search.trail];
  }
  if (isStringArray(search.crumbs) && search.crumbs.length > 0) {
    context.crumbs = [...search.crumbs];
  }
  const extra = joinWith(parseWith(search.with));
  if (extra) context.with = extra;
  return context;
}

export function versionTag(name: string): string | undefined {
  return /^(v\S+?):/.exec(name)?.[1];
}

export interface ModelIdentity {
  title: string;
  version?: string;
  hasFile: boolean;
}

export function decodeUrn(urn: string): string | null {
  try {
    const padded = urn.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    return decoded.startsWith('urn:adsk') ? decoded : null;
  } catch {
    return null;
  }
}

export function describeModel(
  urn: string,
  file?: string,
  version?: string,
): ModelIdentity {
  if (file) {
    return { title: file, version, hasFile: true };
  }
  const decoded = decodeUrn(urn);
  const derived = decoded ? /[?&]version=(\d+)/.exec(decoded)?.[1] : undefined;
  return {
    title: 'Untitled model',
    version: version ?? (derived ? `v${derived}` : undefined),
    hasFile: false,
  };
}
