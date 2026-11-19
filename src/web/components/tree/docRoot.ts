import type { TreeNode } from '../../../shared/types.js';
import { type NodeScope, ROOT_NODE, ROOT_SCOPE } from '../../api/scope.js';
import { defineRecord } from '../../storage.js';

export const DOC_ROOT_KEY = 'bsh.pane.docs.root.v1';

export interface DocRoot {
  hubId: string;
  projectId: string | null;
}

export const ALL_HUBS: DocRoot = { hubId: '', projectId: null };

export function sanitizeDocRoot(raw: unknown): DocRoot {
  if (typeof raw !== 'object' || raw === null) return ALL_HUBS;
  const { hubId, projectId } = raw as Record<string, unknown>;
  if (typeof hubId !== 'string' || hubId === '') return ALL_HUBS;
  return {
    hubId,
    projectId: typeof projectId === 'string' && projectId ? projectId : null,
  };
}

export const DOC_ROOT = defineRecord<DocRoot>({
  key: DOC_ROOT_KEY,
  initial: ALL_HUBS,
  sanitize: sanitizeDocRoot,
});

export function hubScope(hubId: string): NodeScope {
  return { kind: 'hub', id: hubId, hubId };
}

export function effectiveDocRoot(
  stored: DocRoot,
  hubs: readonly TreeNode[] | undefined,
  projects: readonly TreeNode[] | undefined,
): DocRoot {
  if (!stored.hubId) return ALL_HUBS;
  if (hubs && !hubs.some((hub) => hub.id === stored.hubId)) return ALL_HUBS;
  if (!stored.projectId) return { hubId: stored.hubId, projectId: null };
  if (
    projects &&
    !projects.some((project) => project.id === stored.projectId)
  ) {
    return { hubId: stored.hubId, projectId: null };
  }
  return stored;
}

export interface TreeRoot {
  node: TreeNode;
  scope: NodeScope;
}

export const DEFAULT_TREE_ROOT: TreeRoot = {
  node: ROOT_NODE,
  scope: ROOT_SCOPE,
};

export function treeRootOf(
  root: DocRoot,
  hubs: readonly TreeNode[] | undefined,
  projects: readonly TreeNode[] | undefined,
): TreeRoot {
  if (!root.hubId) return DEFAULT_TREE_ROOT;
  if (root.projectId) {
    const project = projects?.find((entry) => entry.id === root.projectId);
    if (project) {
      const { parentId: _parent, ...rest } = project;
      return {
        node: rest,
        scope: {
          kind: 'project',
          id: project.id,
          hubId: root.hubId,
          projectId: project.id,
        },
      };
    }
  }
  const hub = hubs?.find((entry) => entry.id === root.hubId);
  if (hub) {
    const { parentId: _parent, ...rest } = hub;
    return { node: rest, scope: hubScope(root.hubId) };
  }
  return {
    node: {
      id: root.hubId,
      kind: 'hub',
      name: 'Hub',
      hasChildren: true,
      viewable: false,
    },
    scope: hubScope(root.hubId),
  };
}
