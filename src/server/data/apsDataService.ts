import { DataManagementClient } from '@aps_sdk/data-management';
import { APP_NOT_PROVISIONED } from '../../shared/types.js';
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
import { createThumbnailFetcher } from './thumbnails.js';
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
  ) => Promise<
    { data?: T[]; included?: unknown[]; links?: unknown } | undefined
  >,
  paged = true,
  included?: unknown[],
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetchPage(page);
    all.push(...(res?.data ?? []));
    if (included) included.push(...(res?.included ?? []));
    const next = (res?.links as { next?: unknown } | undefined)?.next;
    if (!next || !paged) return all;
  }
  throw new HttpError(502, 'list too large');
}

export function createApsDataService(
  client: Client = new DataManagementClient(),
  views: ViewStateChecker = createViewStateChecker(),
  thumbnails: ReturnType<
    typeof createThumbnailFetcher
  > = createThumbnailFetcher(),
): DataService {
  return {
    listHubs: async (token) => {
      try {
        return await guarded(async () => {
          const data = await allPages(
            () => client.getHubs({ accessToken: token }),
            false,
          );
          return mapHubs(data);
        });
      } catch (err) {
        if (err instanceof HttpError && err.status === 403) {
          throw new HttpError(403, 'App not provisioned', APP_NOT_PROVISIONED);
        }
        throw err;
      }
    },
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
        const included: VersionResource[] = [];
        const data = await allPages(
          (pageNumber) =>
            client.getFolderContents(projectId, folderId, {
              accessToken: token,
              pageNumber,
            }),
          true,
          included,
        );
        return mapFolderContents(data, folderId, included);
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
    versionThumbnail: (token, urn, size, signal) =>
      guarded(() => thumbnails.fetch(token, urn, size, signal)),
  };
}
