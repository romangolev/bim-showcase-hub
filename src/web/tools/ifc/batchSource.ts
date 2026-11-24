import type { QueryClient } from '@tanstack/react-query';
import type { TreeNode } from '../../../shared/types.js';
import { type ViewState, viewStateOf } from '../../../shared/viewState.js';
import type { NodeScope } from '../../api/scope.js';
import { versionLabelOf } from '../../extensions/ifcBatch.js';

export interface BatchRow {
  urn?: string;
  file: string;
  version: string;
  versionName: string;
  number: number;
  path: string;
  project?: string;
  projectId?: string;
  state: ViewState;
  checked?: boolean;
  itemScope: NodeScope;
}

export interface BatchListing {
  rows: BatchRow[];
  pendingItems: NodeScope[];
}

interface CachedLevel {
  key: readonly unknown[];
  nodes: TreeNode[];
}

function levels(client: QueryClient): CachedLevel[] {
  return client
    .getQueryCache()
    .findAll({ queryKey: ['children'] })
    .flatMap((query) => {
      const data = query.state.data;
      return Array.isArray(data)
        ? [{ key: query.queryKey, nodes: data as TreeNode[] }]
        : [];
    });
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

export function listBatchRows(client: QueryClient): BatchListing {
  const all = levels(client);
  const projects = new Map<string, string>();
  const items = new Map<string, { name: string; scope: NodeScope }>();
  for (const { key, nodes } of all) {
    for (const node of nodes) {
      if (node.kind === 'project' && key[1] === 'hub') {
        projects.set(node.id, node.name);
      }
      if (node.kind === 'item') {
        items.set(node.id, {
          name: node.name,
          scope: {
            kind: 'item',
            id: node.id,
            ...(text(key[3]) ? { hubId: text(key[3]) } : {}),
            ...(text(key[4]) ? { projectId: text(key[4]) } : {}),
          },
        });
      }
    }
  }
  const rows: BatchRow[] = [];
  const seen = new Set<string>();
  const withVersions = new Set<string>();
  for (const { key, nodes } of all) {
    if (key[1] !== 'item') continue;
    const itemId = String(key[2]);
    withVersions.add(itemId);
    const item = items.get(itemId);
    const projectId = text(key[4]);
    for (const node of nodes) {
      if (node.kind !== 'version') continue;
      if (node.urn) {
        if (seen.has(node.urn)) continue;
        seen.add(node.urn);
      }
      rows.push({
        ...(node.urn ? { urn: node.urn } : {}),
        file: item?.name ?? '',
        version: versionLabelOf(node.name, node.versionNumber),
        versionName: node.name,
        number: node.versionNumber ?? 0,
        path: (projectId && projects.get(projectId)) || '',
        ...(projectId ? { projectId } : {}),
        ...(projectId && projects.get(projectId)
          ? { project: projects.get(projectId) }
          : {}),
        state: node.urn ? viewStateOf(node) : 'not-translated',
        ...(node.checked !== undefined ? { checked: node.checked } : {}),
        itemScope: item?.scope ?? {
          kind: 'item',
          id: itemId,
          ...(projectId ? { projectId } : {}),
        },
      });
    }
  }
  rows.sort((a, b) => a.file.localeCompare(b.file) || b.number - a.number);
  const pendingItems = [...items]
    .filter(([id]) => !withVersions.has(id))
    .map(([, item]) => item.scope);
  return { rows, pendingItems };
}
