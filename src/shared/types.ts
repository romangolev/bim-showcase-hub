import type { ViewState } from './viewState.js';

export type TreeNodeKind = 'hub' | 'project' | 'folder' | 'item' | 'version';

export type HubType = 'personal' | 'team' | 'account' | 'unknown';

export interface TreeNode {
  id: string;
  kind: TreeNodeKind;
  name: string;
  hasChildren: boolean;
  viewable: boolean;
  hubType?: HubType;
  viewState?: ViewState;
  checked?: boolean;
  urn?: string;
  parentId?: string;
}

export interface VersionViewState {
  viewState: ViewState;
  viewable: boolean;
}

export interface SessionUser {
  id?: string;
  name: string;
  picture: string | null;
  appClientId?: string;
  expiresAt?: number;
}

export interface ViewerToken {
  access_token: string;
  expires_in: number;
}

export interface ApiError {
  error: string;
}

export interface HealthResponse {
  status: 'ok';
  mock: boolean;
}

export interface PropertyRow {
  dbId: number;
  name: string;
  properties: Record<string, string | number | boolean | null>;
  modelId?: string;
  modelName?: string;
}
