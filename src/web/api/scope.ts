import type { TreeNode, TreeNodeKind } from '../../shared/types.js';

export const ROOT_ID = 'root';

export type NodeScope =
  | { kind: 'root' }
  | {
      kind: TreeNodeKind;
      id: string;
      hubId?: string;
      projectId?: string;
    };

export const ROOT_SCOPE: NodeScope = { kind: 'root' };

export const ROOT_NODE: TreeNode = {
  id: ROOT_ID,
  kind: 'hub',
  name: 'Hubs',
  hasChildren: true,
  viewable: false,
};

export function childScope(parent: NodeScope, child: TreeNode): NodeScope {
  if (parent.kind === 'root') {
    return { kind: child.kind, id: child.id, hubId: child.id };
  }
  if (parent.kind === 'hub') {
    return {
      kind: child.kind,
      id: child.id,
      hubId: parent.hubId,
      projectId: child.id,
    };
  }
  return {
    kind: child.kind,
    id: child.id,
    hubId: parent.hubId,
    projectId: parent.projectId,
  };
}

const enc = encodeURIComponent;

function requireId(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing ${name} for tree request`);
  }
  return value;
}

export function childrenPath(scope: NodeScope): string | null {
  switch (scope.kind) {
    case 'root':
      return '/api/hubs';
    case 'hub':
      return `/api/hubs/${enc(requireId(scope.hubId, 'hubId'))}/projects`;
    case 'project':
      return `/api/hubs/${enc(requireId(scope.hubId, 'hubId'))}/projects/${enc(
        requireId(scope.projectId, 'projectId'),
      )}/folders`;
    case 'folder':
      return `/api/projects/${enc(requireId(scope.projectId, 'projectId'))}/folders/${enc(
        scope.id,
      )}/contents`;
    case 'item':
      return `/api/projects/${enc(requireId(scope.projectId, 'projectId'))}/items/${enc(
        scope.id,
      )}/versions`;
    case 'version':
      return null;
  }
}

export function scopeKey(scope: NodeScope): readonly unknown[] {
  if (scope.kind === 'root') {
    return ['children', 'root'];
  }
  return [
    'children',
    scope.kind,
    scope.id,
    scope.hubId ?? null,
    scope.projectId ?? null,
  ];
}
