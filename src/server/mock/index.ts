import type { SessionUser, TreeNode, ViewerToken } from '../../shared/types.js';
import { viewableFor } from '../../shared/viewState.js';
import { markLatest, versionLabel } from '../data/mapping.js';
import type { DataService } from '../data/types.js';
import { HttpError } from '../errors.js';
import { decodeId, encodeId } from '../ids.js';
import {
  buildMockData,
  type MockData,
  type MockFolder,
  type MockItem,
  type MockVersion,
} from './fixtures.js';

export const MOCK_USER: SessionUser = {
  id: 'mock-user',
  name: 'Alex Rivera',
  picture: null,
};

export const MOCK_APP_CLIENT_ID = 'MOCK-CLIENT-ID-NOT-A-REAL-KEY';

export const MOCK_VIEWER_TOKEN: ViewerToken = {
  access_token: 'mock-viewer-token',
  expires_in: 3600,
};

function notFound(what: string): HttpError {
  return new HttpError(404, `${what} not found`);
}

function latestMeta(
  item: MockItem,
): Pick<TreeNode, 'modifiedAt' | 'modifiedBy'> {
  const latest = item.versions[item.versions.length - 1];
  return latest
    ? { modifiedAt: latest.modifiedAt, modifiedBy: latest.user }
    : {};
}

function folderNode(folder: MockFolder): TreeNode {
  return {
    id: encodeId(folder.id),
    kind: 'folder',
    name: folder.name,
    hasChildren: folder.folderIds.length + folder.itemIds.length > 0,
    viewable: false,
    parentId: encodeId(folder.parentId),
  };
}

function xmlEscape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function thumbnailSvg(name: string): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">',
    '<rect width="200" height="200" fill="#2b5f75"/>',
    `<text x="100" y="118" font-family="sans-serif" font-size="56" fill="#ffffff" text-anchor="middle">${xmlEscape(name.slice(0, 3))}</text>`,
    '</svg>',
  ].join('');
}

export function createMockDataService(
  data: MockData = buildMockData(),
  options: { emptyHubs?: boolean; personalOnly?: boolean } = {},
): DataService {
  const versionsById = new Map<
    string,
    { version: MockVersion; name: string }
  >();
  for (const item of data.items.values()) {
    for (const version of item.versions) {
      versionsById.set(version.id, { version, name: item.name });
    }
  }

  return {
    async listHubs() {
      if (options.emptyHubs) {
        return [];
      }
      const hubs = [...data.hubs.values()];
      const shown = options.personalOnly ? hubs.slice(0, 1) : hubs;
      return shown.map((hub) => ({
        id: encodeId(hub.id),
        kind: 'hub',
        name: hub.name,
        hasChildren: hub.projectIds.length > 0,
        viewable: false,
        hubType: options.personalOnly ? 'personal' : hub.hubType,
      }));
    },

    async listProjects(_token, hubId) {
      const hub = data.hubs.get(hubId);
      if (!hub) {
        throw notFound('Hub');
      }
      return hub.projectIds.map((projectId) => {
        const project = data.projects.get(projectId);
        if (!project) {
          throw notFound('Project');
        }
        return {
          id: encodeId(project.id),
          kind: 'project',
          name: project.name,
          hasChildren: project.topFolderIds.length > 0,
          viewable: false,
          parentId: encodeId(hubId),
        };
      });
    },

    async listTopFolders(_token, hubId, projectId) {
      const project = data.projects.get(projectId);
      if (!project || project.hubId !== hubId) {
        throw notFound('Project');
      }
      return project.topFolderIds.map((id) => {
        const folder = data.folders.get(id);
        if (!folder) {
          throw notFound('Folder');
        }
        return folderNode(folder);
      });
    },

    async listFolderContents(_token, projectId, folderId) {
      const folder = data.folders.get(folderId);
      if (!folder || folder.projectId !== projectId) {
        throw notFound('Folder');
      }
      const folders = folder.folderIds.map((id) => {
        const child = data.folders.get(id);
        if (!child) {
          throw notFound('Folder');
        }
        return folderNode(child);
      });
      const items = folder.itemIds.map((id): TreeNode => {
        const item = data.items.get(id);
        if (!item) {
          throw notFound('Item');
        }
        const latest = item.versions[item.versions.length - 1];
        return {
          id: encodeId(item.id),
          kind: 'item',
          name: item.name,
          hasChildren: item.versions.length > 0,
          viewable: false,
          parentId: encodeId(folderId),
          ...latestMeta(item),
          ...(latest ? { versionNumber: latest.number } : {}),
          ...(latest?.hasUrn
            ? { tipUrn: encodeId(`urn:adsk.mock:${latest.id}`) }
            : {}),
        };
      });
      return [...folders, ...items];
    },

    async listItemVersions(_token, projectId, itemId) {
      const item = data.items.get(itemId);
      if (!item || item.projectId !== projectId) {
        throw notFound('Item');
      }
      const nodes = item.versions.map((version): TreeNode => {
        const node: TreeNode = {
          id: encodeId(version.id),
          kind: 'version',
          name: versionLabel(version.number, version.modifiedAt, version.user),
          hasChildren: false,
          viewable: viewableFor(version.viewState),
          viewState: version.viewState,
          parentId: encodeId(itemId),
          modifiedAt: version.modifiedAt,
          modifiedBy: version.user,
          size: version.size,
          versionNumber: version.number,
        };
        if (version.hasUrn) {
          node.urn = encodeId(`urn:adsk.mock:${version.id}`);
        }
        return node;
      });
      return markLatest(nodes);
    },

    async versionViewState(_token, projectId, itemId, versionId) {
      const item = data.items.get(itemId);
      if (!item || item.projectId !== projectId) {
        throw notFound('Item');
      }
      const version = item.versions.find((entry) => entry.id === versionId);
      if (!version) {
        throw notFound('Version');
      }
      return {
        viewState: version.viewState,
        viewable: viewableFor(version.viewState),
      };
    },

    async versionThumbnail(_token, urn) {
      const id = decodeId(urn).replace(/^urn:adsk\.mock:/, '');
      const entry = versionsById.get(id);
      if (entry?.version.viewState !== 'ready') {
        return null;
      }
      return {
        contentType: 'image/svg+xml',
        body: Buffer.from(thumbnailSvg(entry.name), 'utf8'),
      };
    },
  };
}
