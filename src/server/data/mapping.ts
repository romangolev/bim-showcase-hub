import type { HubType, TreeNode } from '../../shared/types.js';
import { encodeId } from '../ids.js';

export interface NamedResource {
  id?: string;
  links?: { self?: { href?: string } };
  attributes?: {
    name?: string;
    displayName?: string;
    extension?: { type?: string };
  };
}

const HUB_TYPES: Record<string, HubType> = {
  'hubs:autodesk.a360:PersonalHub': 'personal',
  'hubs:autodesk.core:Hub': 'team',
  'hubs:autodesk.bim360:Account': 'account',
};

export function hubTypeOf(resource: NamedResource): HubType {
  const type = resource.attributes?.extension?.type;
  return (type && HUB_TYPES[type]) || 'unknown';
}

export interface FolderContentResource {
  type?: string;
  id?: string;
  attributes?: {
    name?: string;
    displayName?: string;
    lastModifiedTime?: string;
    lastModifiedUserName?: string;
  };
}

export interface VersionResource {
  id?: string;
  attributes?: {
    versionNumber?: number;
    lastModifiedTime?: string;
    lastModifiedUserName?: string;
    storageSize?: number;
  };
  relationships?: {
    derivatives?: { data?: { id?: string } };
    item?: { data?: { id?: string } };
  };
}

export function metadataOf(
  attributes:
    | {
        lastModifiedTime?: string;
        lastModifiedUserName?: string;
        storageSize?: number;
      }
    | undefined,
): Pick<TreeNode, 'modifiedAt' | 'modifiedBy' | 'size'> {
  const time = attributes?.lastModifiedTime;
  const user = attributes?.lastModifiedUserName;
  const size = attributes?.storageSize;
  return {
    ...(time && !Number.isNaN(new Date(time).getTime())
      ? { modifiedAt: new Date(time).toISOString() }
      : {}),
    ...(user ? { modifiedBy: user } : {}),
    ...(typeof size === 'number' && size >= 0 ? { size } : {}),
  };
}

function pickName(attributes: NamedResource['attributes']): string {
  return attributes?.displayName || attributes?.name || '';
}

function requireId(resource: { id?: string }): string | null {
  return resource.id ? resource.id : null;
}

export function mapHubs(resources: NamedResource[]): TreeNode[] {
  const nodes: TreeNode[] = [];
  for (const resource of resources) {
    const id = requireId(resource);
    if (id === null) {
      continue;
    }
    nodes.push({
      id: encodeId(id),
      kind: 'hub',
      name: pickName(resource.attributes) || id,
      hasChildren: true,
      viewable: false,
      hubType: hubTypeOf(resource),
    });
  }
  return nodes;
}

export function mapProjects(
  resources: NamedResource[],
  hubId: string,
): TreeNode[] {
  const nodes: TreeNode[] = [];
  for (const resource of resources) {
    const id = requireId(resource);
    if (id === null) {
      continue;
    }
    nodes.push({
      id: encodeId(id),
      kind: 'project',
      name: pickName(resource.attributes) || id,
      hasChildren: true,
      viewable: false,
      parentId: encodeId(hubId),
    });
  }
  return nodes;
}

export function mapTopFolders(
  resources: NamedResource[],
  projectId: string,
): TreeNode[] {
  const nodes: TreeNode[] = [];
  for (const resource of resources) {
    const id = requireId(resource);
    if (id === null) {
      continue;
    }
    nodes.push({
      id: encodeId(id),
      kind: 'folder',
      name: pickName(resource.attributes) || id,
      hasChildren: true,
      viewable: false,
      parentId: encodeId(projectId),
    });
  }
  return nodes;
}

export function mapFolderContents(
  resources: FolderContentResource[],
  folderId: string,
): TreeNode[] {
  const nodes: TreeNode[] = [];
  for (const resource of resources) {
    const id = requireId(resource);
    const name = pickName(resource.attributes);
    if (id === null || name === '') {
      continue;
    }
    if (resource.type !== 'folders' && resource.type !== 'items') {
      continue;
    }
    nodes.push({
      id: encodeId(id),
      kind: resource.type === 'folders' ? 'folder' : 'item',
      name,
      hasChildren: true,
      viewable: false,
      parentId: encodeId(folderId),
      ...metadataOf(resource.attributes),
    });
  }
  return nodes;
}

export function formatVersionDate(value: string | undefined): string {
  if (!value) {
    return 'unknown date';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'unknown date';
  }
  return date.toISOString().slice(0, 16).replace('T', ' ');
}

export function versionNumberOf(resource: VersionResource): number | null {
  const fromAttributes = resource.attributes?.versionNumber;
  if (typeof fromAttributes === 'number') {
    return fromAttributes;
  }
  const match = resource.id?.match(/[?&]version=(\d+)$/);
  return match?.[1] ? Number(match[1]) : null;
}

export function versionLabel(
  number: number | null,
  date: string | undefined,
  user: string | undefined,
): string {
  const prefix = number === null ? 'v?' : `v${number}`;
  return `${prefix}: ${formatVersionDate(date)} by ${user || 'unknown user'}`;
}

export function mapVersions(
  resources: VersionResource[],
  itemId: string,
): TreeNode[] {
  const nodes: TreeNode[] = [];
  for (const resource of resources) {
    const id = requireId(resource);
    if (id === null) {
      continue;
    }
    const urn = resource.relationships?.derivatives?.data?.id;
    const node: TreeNode = {
      id: encodeId(id),
      kind: 'version',
      name: versionLabel(
        versionNumberOf(resource),
        resource.attributes?.lastModifiedTime,
        resource.attributes?.lastModifiedUserName,
      ),
      hasChildren: false,
      viewable: Boolean(urn),
      viewState: urn ? 'unknown' : 'not-translated',
      parentId: encodeId(itemId),
      ...metadataOf(resource.attributes),
    };
    if (urn) {
      node.urn = urn;
    }
    nodes.push(node);
  }
  return nodes;
}
