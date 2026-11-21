import { isRecord } from '../../shared/guards.js';
import { isStringArray, type ModelContext } from '../api/modelContext.js';
import {
  defineSavedKind,
  type SavedKindItem,
  useSavedKindItems,
} from './savedKinds.js';

export const MODEL_SET_KIND = 'model-set';
export const MAX_SET_MEMBERS = 24;
export const MAX_MEMBER_FILE = 260;

export interface ModelSetMember {
  urn: string;
  file?: string;
  v?: string;
  trail?: string[];
  crumbs?: string[];
  projectId?: string;
  itemId?: string;
  follow: 'pinned' | 'latest';
  [field: string]: unknown;
}

export interface ModelSetData {
  members: ModelSetMember[];
  [field: string]: unknown;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function cleanMember(raw: unknown): ModelSetMember | null {
  if (!isRecord(raw)) return null;
  const urn = typeof raw.urn === 'string' ? raw.urn.trim() : '';
  if (!urn) return null;
  const projectId = text(raw.projectId);
  const itemId = text(raw.itemId);
  const member: ModelSetMember = {
    ...raw,
    urn,
    follow:
      raw.follow === 'latest' && projectId && itemId ? 'latest' : 'pinned',
  };
  const file = text(raw.file)?.slice(0, MAX_MEMBER_FILE);
  if (file) member.file = file;
  else delete member.file;
  const v = text(raw.v);
  if (v) member.v = v;
  else delete member.v;
  if (isStringArray(raw.trail)) member.trail = [...raw.trail];
  else delete member.trail;
  if (isStringArray(raw.crumbs)) member.crumbs = [...raw.crumbs];
  else delete member.crumbs;
  if (projectId) member.projectId = projectId;
  else delete member.projectId;
  if (itemId) member.itemId = itemId;
  else delete member.itemId;
  return member;
}

export function sanitizeModelSet(raw: unknown): ModelSetData | null {
  if (!isRecord(raw) || !Array.isArray(raw.members)) return null;
  const seen = new Set<string>();
  const members: ModelSetMember[] = [];
  for (const entry of raw.members) {
    const member = cleanMember(entry);
    if (!member || seen.has(member.urn)) continue;
    seen.add(member.urn);
    members.push(member);
    if (members.length >= MAX_SET_MEMBERS) break;
  }
  if (members.length === 0) return null;
  return { ...raw, members };
}

export const MODEL_SETS = defineSavedKind<ModelSetData>({
  kind: MODEL_SET_KIND,
  version: 1,
  label: 'Model set',
  sanitize: sanitizeModelSet,
});

export function useModelSets(): SavedKindItem<ModelSetData>[] {
  return useSavedKindItems(MODEL_SETS);
}

export function memberContext(member: ModelSetMember): ModelContext {
  const context: ModelContext = {};
  if (member.file) context.file = member.file;
  if (member.v) context.v = member.v;
  if (member.trail && member.trail.length > 0)
    context.trail = [...member.trail];
  if (member.crumbs && member.crumbs.length > 0) {
    context.crumbs = [...member.crumbs];
  }
  return context;
}
