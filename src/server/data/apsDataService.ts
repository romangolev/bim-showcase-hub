import { DataManagementClient } from '@aps_sdk/data-management';
import { toHttpError } from '../errors.js';
import {
  mapFolderContents,
  mapHubs,
  mapProjects,
  mapTopFolders,
  mapVersions,
} from './mapping.js';
import type { DataService } from './types.js';
import {
  createViewStateChecker,
  type ViewStateChecker,
  withViewStates,
} from './viewState.js';

type Client = Pick<
  DataManagementClient,
  | 'getHubs'
  | 'getHubProjects'
  | 'getProjectTopFolders'
  | 'getFolderContents'
  | 'getItemVersions'
>;

async function guarded<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    throw toHttpError(err);
  }
}

export function createApsDataService(
  client: Client = new DataManagementClient(),
  views: ViewStateChecker = createViewStateChecker(),
): DataService {
  return {
    listHubs: (token) =>
      guarded(async () => {
        const res = await client.getHubs({ accessToken: token });
        return mapHubs(res.data ?? []);
      }),
    listProjects: (token, hubId) =>
      guarded(async () => {
        const res = await client.getHubProjects(hubId, { accessToken: token });
        return mapProjects(res.data ?? [], hubId);
      }),
    listTopFolders: (token, hubId, projectId) =>
      guarded(async () => {
        const res = await client.getProjectTopFolders(hubId, projectId, {
          accessToken: token,
        });
        return mapTopFolders(res.data ?? [], projectId);
      }),
    listFolderContents: (token, projectId, folderId) =>
      guarded(async () => {
        const res = await client.getFolderContents(projectId, folderId, {
          accessToken: token,
        });
        return mapFolderContents(res.data ?? [], folderId);
      }),
    listItemVersions: (token, projectId, itemId) =>
      guarded(async () => {
        const res = await client.getItemVersions(projectId, itemId, {
          accessToken: token,
        });
        return withViewStates(
          mapVersions(res.data ?? [], itemId),
          token,
          views,
        );
      }),
  };
}
