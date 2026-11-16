export type TreeNodeKind = 'hub' | 'project' | 'folder' | 'item' | 'version';

export interface TreeNode {
  id: string;
  kind: TreeNodeKind;
  name: string;
  hasChildren: boolean;
  viewable: boolean;
  urn?: string;
  parentId?: string;
}

export interface SessionUser {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string;
}

export interface HealthResponse {
  status: 'ok';
  mock: boolean;
}

export interface PropertyRow {
  dbId: number;
  name: string;
  properties: Record<string, string | number | boolean | null>;
}
