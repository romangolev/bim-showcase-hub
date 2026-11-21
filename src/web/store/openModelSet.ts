import {
  MAX_COMBINED_MODELS,
  MAX_LOADED_MEMBERS,
} from '../../shared/combined.js';
import type { TreeNode } from '../../shared/types.js';
import {
  joinWith,
  type ModelContext,
  versionTag,
} from '../api/modelContext.js';
import { modelHref } from '../components/tree/rowMenu.js';
import { openableUrn, type PickedModel } from '../components/tree/treeState.js';
import { pickLatest } from '../components/tree/versionPick.js';
import {
  type ModelSetData,
  type ModelSetMember,
  memberContext,
} from './modelSets.js';

export interface ResolvedSet {
  models: PickedModel[];
  stale: string[];
  failed: string[];
}

const RESOLVE_CONCURRENCY = 4;

interface Lookup {
  ok: boolean;
  versions: TreeNode[];
}

async function readVersions(
  member: ModelSetMember,
  versions: (projectId: string, itemId: string) => Promise<TreeNode[]>,
): Promise<Lookup> {
  const { projectId, itemId } = member;
  if (!projectId || !itemId) return { ok: false, versions: [] };
  try {
    return { ok: true, versions: await versions(projectId, itemId) };
  } catch {
    return { ok: false, versions: [] };
  }
}

async function limited<T, R>(
  entries: readonly T[],
  limit: number,
  run: (entry: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(entries.length);
  let next = 0;
  const worker = async () => {
    while (next < entries.length) {
      const index = next;
      next += 1;
      results[index] = await run(entries[index] as T);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, entries.length) }, worker),
  );
  return results;
}

export async function resolveModelSet(
  data: ModelSetData,
  versions: (projectId: string, itemId: string) => Promise<TreeNode[]>,
): Promise<ResolvedSet> {
  const lookups = await limited(data.members, RESOLVE_CONCURRENCY, (member) =>
    readVersions(member, versions),
  );
  const models: PickedModel[] = [];
  const stale: string[] = [];
  const failed: string[] = [];
  data.members.forEach((member, index) => {
    const lookup = lookups[index] ?? { ok: false, versions: [] };
    const latest = pickLatest(
      lookup.versions.filter((node) => openableUrn(node) !== null),
    );
    const label = member.file || member.urn;
    if (member.follow === 'latest') {
      if (latest?.urn) {
        const context = memberContext(member);
        const tag = versionTag(latest.name);
        if (tag) context.v = tag;
        else delete context.v;
        models.push({ urn: latest.urn, context });
      } else {
        failed.push(label);
        models.push({ urn: member.urn, context: memberContext(member) });
      }
      return;
    }
    if (lookup.ok && latest?.urn && latest.urn !== member.urn) {
      stale.push(label);
    }
    models.push({ urn: member.urn, context: memberContext(member) });
  });
  return { models: models.slice(0, MAX_LOADED_MEMBERS), stale, failed };
}

export function setLink(
  models: readonly PickedModel[],
  origin?: string,
): string | null {
  const [first, ...rest] = models;
  if (!first || models.length > MAX_COMBINED_MODELS) return null;
  const context: ModelContext = { ...first.context };
  const extra = joinWith(rest.map((model) => model.urn));
  if (extra) context.with = extra;
  return modelHref(first.urn, context, origin);
}
