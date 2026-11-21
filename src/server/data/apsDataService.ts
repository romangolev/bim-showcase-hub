import { DataManagementClient } from '@aps_sdk/data-management';
import { viewableFor } from '../../shared/viewState.js';
import { HttpError, toHttpError } from '../errors.js';
import {
  mapFolderContents,
  mapHubs,
  mapProjects,
  mapTopFolders,
  mapVersions,
  markLatest,
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

const MAX_PAGES = 200;

async function allPages<T>(
  fetchPage: (
    pageNumber: number,
  ) => Promise<{ data?: T[]; links?: unknown } | undefined>,
  paged = true,
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetchPage(page);
    all.push(...(res?.data ?? []));
    const next = (res?.links as { next?: unknown } | undefined)?.next;
    if (!next || !paged) return all;
  }
  throw new HttpError(502, 'list too large');
}

export function createApsDataService(
  client: Client = new DataManagementClient(),
  views: ViewStateChecker = createViewStateChecker(),
): DataService {
  return {
    listHubs: (token) =>
      guarded(async () => {
        const data = await allPages(
          () => client.getHubs({ accessToken: token }),
          false,
        );
        return mapHubs(data);
      }),
    listProjects: (token, hubId) =>
      guarded(async () => {
        const data = await allPages((pageNumber) =>
          client.getHubProjects(hubId, { accessToken: token, pageNumber }),
        );
        return mapProjects(data, hubId);
      }),
    listTopFolders: (token, hubId, projectId) =>
      guarded(async () => {
        const data = await allPages(
          () =>
            client.getProjectTopFolders(hubId, projectId, {
              accessToken: token,
            }),
          false,
        );
        return mapTopFolders(data, projectId);
      }),
    listFolderContents: (token, projectId, folderId) =>
      guarded(async () => {
        const data = await allPages((pageNumber) =>
          client.getFolderContents(projectId, folderId, {
            accessToken: token,
            pageNumber,
          }),
        );
        return mapFolderContents(data, folderId);
      }),
    listItemVersions: (token, projectId, itemId) =>
      guarded(async () => {
        const data = await allPages((pageNumber) =>
          client.getItemVersions(projectId, itemId, {
            accessToken: token,
            pageNumber,
          }),
        );
        return withViewStates(
          markLatest(mapVersions(data, itemId)),
          token,
          views,
        );
      }),
    versionViewState: (token, projectId, itemId, versionId) =>
      guarded(async () => {
        const res = await client.getVersion(projectId, versionId, {
          accessToken: token,
        });
        const resource = res.data as VersionResource | undefined;
        const owner = resource?.relationships?.item?.data?.id;
        const version =
          resource && (!owner || owner === itemId)
            ? mapVersions([resource], itemId)[0]
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
