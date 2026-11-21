import { fold } from '../../shared/text.js';
import type { TreeNode } from '../../shared/types.js';
import { viewableFor } from '../../shared/viewState.js';
import { type ModelContext, versionTag } from '../api/modelContext.js';
import { viewStateOf } from '../components/tree/viewStateCopy.js';
import { defineRecord, type PersistedRecord } from '../storage.js';

export interface VersionTarget {
  projectId: string;
  itemId: string;
  file: string;
  trail: string[];
  crumbs: string[];
}

export interface VersionHistoryView {
  filter: string;
  viewableOnly: boolean;
}

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];

export function sanitizeVersionTarget(raw: unknown): VersionTarget | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const source = raw as Record<string, unknown>;
  if (typeof source.projectId !== 'string' || !source.projectId) return null;
  if (typeof source.itemId !== 'string' || !source.itemId) return null;
  return {
    projectId: source.projectId,
    itemId: source.itemId,
    file: typeof source.file === 'string' ? source.file : '',
    trail: strings(source.trail),
    crumbs: strings(source.crumbs),
  };
}

export const VERSION_TARGET: PersistedRecord<VersionTarget | null> =
  defineRecord<VersionTarget | null>({
    key: 'bsh.pane.versions.target.v1',
    initial: null,
    sanitize: sanitizeVersionTarget,
  });

export const VERSION_HISTORY_VIEW: PersistedRecord<VersionHistoryView> =
  defineRecord<VersionHistoryView>({
    key: 'bsh.pane.versions.view.v1',
    initial: { filter: '', viewableOnly: false },
    sanitize: (raw) => {
      const source = (
        typeof raw === 'object' && raw !== null ? raw : {}
      ) as Record<string, unknown>;
      return {
        filter:
          typeof source.filter === 'string' ? source.filter.slice(0, 120) : '',
        viewableOnly: source.viewableOnly === true,
      };
    },
  });

export function visibleVersions(
  versions: readonly TreeNode[],
  view: VersionHistoryView,
): TreeNode[] {
  const needle = fold(view.filter.trim());
  return [...versions]
    .filter(
      (node) =>
        !view.viewableOnly ||
        (Boolean(node.urn) && viewableFor(viewStateOf(node))),
    )
    .filter(
      (node) =>
        !needle ||
        fold(`${node.name} ${node.modifiedBy ?? ''}`).includes(needle),
    )
    .sort((a, b) => (b.versionNumber ?? -1) - (a.versionNumber ?? -1));
}

export function versionContext(
  target: VersionTarget,
  version: TreeNode,
): ModelContext {
  const context: ModelContext = {
    file: target.file,
    trail: target.trail,
    crumbs: target.crumbs,
  };
  const tag = versionTag(version.name);
  if (tag) context.v = tag;
  return context;
}
