import { DataManagementClient } from '@aps_sdk/data-management';
import { viewableFor } from '../../shared/viewState.js';
import { HttpError, toHttpError } from '../errors.js';
import {
  mapFolderContents,
  mapHubs,
  mapProjects,
  mapTopFolders,
  mapVersions,
  type VersionResource,
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
  | 'getVersion'
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
    versionViewState: (token, projectId, itemId, versionId) =>
      guarded(async () => {
        const res = await client.getVersion(projectId, versionId, {
          accessToken: token,
        });
        const version = res.data
          ? mapVersions([res.data as VersionResource], itemId)[0]
          : undefined;
        if (!version) throw new HttpError(404, 'Version not found');
        if (!version.urn) {
          return { viewState: 'not-translated', viewable: false };
        }
        const viewState = await views.check(token, version.urn);
        return { viewState, viewable: viewableFor(viewState) };
      }),
  };
}
