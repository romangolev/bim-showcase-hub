import { MAX_COMBINED_MODELS, type Vec3 } from '../../shared/combined.js';
import { isRecord } from '../../shared/guards.js';
import { fetchChildren } from '../api/client.js';
import {
  joinWith,
  type ModelContext,
  parseModelContext,
  withUrns,
} from '../api/modelContext.js';
import { type OpenModel, sanitizeOffsets } from '../api/openModels.js';
import type { Command } from '../commands/types.js';
import { openableUrn } from '../components/tree/treeState.js';
import { pickLatest } from '../components/tree/versionPick.js';
import {
  type ModelTint,
  type ModelTintState,
  sanitizeTint,
  tintFor,
  withModelTint,
} from '../panels/modelTint.js';
import { defineSavedKind } from '../store/savedKinds.js';

export const FEDERATION_KIND = 'federation';

export type FederationMember = {
  urn: string;
  context: ModelContext;
  latest: boolean;
  hidden: boolean;
  tint?: ModelTint;
};

export type FederationData = {
  members: FederationMember[];
  offsets?: Record<string, Vec3>;
};

export const FEDERATIONS = defineSavedKind<FederationData>({
  kind: FEDERATION_KIND,
  version: 1,
  label: 'Combination',
  sanitize: (raw) => sanitizeFederation(raw),
});

function withoutWith(value: unknown): ModelContext {
  const { with: _with, ...rest } = parseModelContext(value);
  return rest;
}

function hasTrail(context: ModelContext): boolean {
  return Array.isArray(context.trail) && context.trail.length >= 3;
}

function sanitizeMember(value: unknown): FederationMember | null {
  if (!isRecord(value)) return null;
  const urn = typeof value.urn === 'string' ? value.urn.trim() : '';
  if (!urn) return null;
  const member: FederationMember = {
    urn,
    context: withoutWith(value.context),
    latest: value.latest === true,
    hidden: value.hidden === true,
  };
  const tint = sanitizeTint(value.tint);
  if (tint) member.tint = tint;
  return member;
}

export function sanitizeFederation(raw: unknown): FederationData | null {
  if (!isRecord(raw) || !Array.isArray(raw.members)) return null;
  const members: FederationMember[] = [];
  const seen = new Set<string>();
  for (const entry of raw.members) {
    if (members.length >= MAX_COMBINED_MODELS) break;
    const member = sanitizeMember(entry);
    if (!member || seen.has(member.urn)) continue;
    seen.add(member.urn);
    members.push(member);
  }
  if (members.length < 2) return null;
  const data: FederationData = { members };
  const offsets = sanitizeOffsets(raw.offsets);
  if (offsets) data.offsets = offsets;
  return data;
}

export function captureFederation(
  entry: OpenModel,
  contextFor: (urn: string) => ModelContext,
  tints: ModelTintState,
  hidden: readonly string[],
): FederationData | null {
  const urns = [entry.urn, ...withUrns(entry.context)].slice(
    0,
    MAX_COMBINED_MODELS,
  );
  if (urns.length < 2) return null;
  const members = urns.map((urn, index): FederationMember => {
    const context = withoutWith(
      index === 0 ? { ...contextFor(urn), ...entry.context } : contextFor(urn),
    );
    const member: FederationMember = {
      urn,
      context,
      latest: hasTrail(context),
      hidden: hidden.includes(urn),
    };
    const tint = tintFor(tints, urn);
    if (tint) member.tint = tint;
    return member;
  });
  const data: FederationData = { members };
  const offsets = sanitizeOffsets(entry.offsets);
  if (offsets) data.offsets = offsets;
  return data;
}

export async function resolveFederation(
  data: FederationData,
  latest: (member: FederationMember) => Promise<string | null>,
): Promise<{ data: FederationData; stale: string[] }> {
  const taken = new Set(data.members.map((member) => member.urn));
  const remapped = new Map<string, string>();
  const stale: string[] = [];
  let changed = false;
  const members: FederationMember[] = [];
  for (const member of data.members) {
    let urn = member.urn;
    if (member.latest) {
      const found = await latest(member);
      if (!found) {
        stale.push(member.context.file ?? member.urn);
      } else if (found !== member.urn && !taken.has(found)) {
        taken.delete(member.urn);
        taken.add(found);
        remapped.set(member.urn, found);
        urn = found;
        changed = true;
      }
    }
    members.push(urn === member.urn ? member : { ...member, urn });
  }
  const offsets: Record<string, Vec3> = {};
  for (const [id, value] of Object.entries(data.offsets ?? {})) {
    const mapped = remapped.get(id) ?? id;
    if (mapped !== id) changed = true;
    offsets[mapped] = value;
  }
  if (!changed) return { data, stale };
  const next: FederationData = { members };
  if (Object.keys(offsets).length > 0) next.offsets = offsets;
  return { data: next, stale };
}

export interface FederationOpenPlan {
  urn: string;
  context: ModelContext;
  offsets?: Record<string, Vec3>;
  tints: Record<string, ModelTint>;
  hidden: string[];
}

export function federationOpenPlan(data: FederationData): FederationOpenPlan {
  const [primary, ...others] = data.members;
  if (!primary) {
    return { urn: '', context: {}, tints: {}, hidden: [] };
  }
  const withOthers = joinWith(others.map((member) => member.urn));
  const context: ModelContext = withOthers
    ? { ...primary.context, with: withOthers }
    : { ...primary.context };
  const plan: FederationOpenPlan = {
    urn: primary.urn,
    context,
    tints: {},
    hidden: [],
  };
  for (const member of data.members) {
    if (member.tint) plan.tints[member.urn] = member.tint;
    if (member.hidden) plan.hidden.push(member.urn);
  }
  const offsets = sanitizeOffsets(data.offsets);
  if (offsets) plan.offsets = offsets;
  return plan;
}

export function withFederationTints(
  state: ModelTintState,
  data: FederationData,
): ModelTintState {
  const tints = federationOpenPlan(data).tints;
  return data.members.reduce(
    (current, member) =>
      withModelTint(current, member.urn, tints[member.urn] ?? null),
    state,
  );
}

export function withFederationHidden(
  current: readonly string[],
  data: FederationData,
  limit: number,
): string[] {
  const hidden = new Set(federationOpenPlan(data).hidden);
  const next = new Set(current);
  for (const member of data.members) {
    if (hidden.has(member.urn)) next.add(member.urn);
    else next.delete(member.urn);
  }
  return [...next].slice(-limit);
}

export async function latestVersionUrn(
  member: FederationMember,
): Promise<string | null> {
  const trail = member.context.trail;
  if (!trail || trail.length < 3) return null;
  const [hubId, projectId] = trail;
  const item = trail[trail.length - 1];
  if (!hubId || !projectId || !item) return null;
  try {
    const versions = await fetchChildren({
      kind: 'item',
      id: item,
      hubId,
      projectId,
    });
    const found = pickLatest(
      versions.filter((node) => openableUrn(node) !== null),
    );
    return found?.urn ?? null;
  } catch {
    return null;
  }
}

let opener: ((id: string) => void) | null = null;

export function setFederationOpener(
  next: ((id: string) => void) | null,
): () => void {
  opener = next;
  return () => {
    if (opener === next) opener = null;
  };
}

export function openSavedFederation(id: string): void {
  opener?.(id);
}

export function nextCombinationName(): string {
  const used = new Set(
    FEDERATIONS.list().map(
      (item) => /^Combination (\d+)$/.exec(item.name)?.[1],
    ),
  );
  let number = 1;
  while (used.has(String(number))) number += 1;
  return `Combination ${number}`;
}

export function federationCommands(): Command[] {
  return FEDERATIONS.list().map((item) => ({
    id: `federation.open.${item.id}`,
    title: `Open combination: ${item.name}`,
    group: 'Combinations',
    keywords: 'saved combination models federation',
    menu: 'hook',
    ...(opener ? {} : { disabled: 'Open the Models pane first' }),
    run: () => openSavedFederation(item.id),
  }));
}
