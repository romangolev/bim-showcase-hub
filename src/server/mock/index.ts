import type { SessionUser, TreeNode, ViewerToken } from '../../shared/types.js';
import { viewableFor } from '../../shared/viewState.js';
import { versionLabel } from '../data/mapping.js';
import type { DataService } from '../data/types.js';
import { HttpError } from '../errors.js';
import { encodeId } from '../ids.js';
import { buildMockData, type MockData, type MockFolder } from './fixtures.js';

export const MOCK_USER: SessionUser = { name: 'Alex Rivera', picture: null };

export const MOCK_APP_CLIENT_ID = 'MOCK-CLIENT-ID-NOT-A-REAL-KEY';

export const MOCK_VIEWER_TOKEN: ViewerToken = {
  access_token: 'mock-viewer-token',
  expires_in: 3600,
};

function notFound(what: string): HttpError {
  return new HttpError(404, `${what} not found`);
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

export function createMockDataService(
  data: MockData = buildMockData(),
  options: { emptyHubs?: boolean; personalOnly?: boolean } = {},
): DataService {
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
        return {
          id: encodeId(item.id),
          kind: 'item',
          name: item.name,
          hasChildren: item.versions.length > 0,
          viewable: false,
          parentId: encodeId(folderId),
        };
      });
      return [...folders, ...items];
    },

    async listItemVersions(_token, projectId, itemId) {
      const item = data.items.get(itemId);
      if (!item || item.projectId !== projectId) {
        throw notFound('Item');
      }
      return item.versions.map((version): TreeNode => {
        const node: TreeNode = {
          id: encodeId(version.id),
          kind: 'version',
          name: versionLabel(version.number, version.modifiedAt, version.user),
          hasChildren: false,
          viewable: viewableFor(version.viewState),
          viewState: version.viewState,
          parentId: encodeId(itemId),
        };
        if (version.hasUrn) {
          node.urn = encodeId(`urn:adsk.mock:${version.id}`);
        }
        return node;
      });
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
  };
}
