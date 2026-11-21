import type { TreeNode, VersionViewState } from '../../shared/types.js';
import type { Thumbnail, ThumbnailSize } from './thumbnails.js';

export interface DataService {
  listHubs(token: string): Promise<TreeNode[]>;
  listProjects(token: string, hubId: string): Promise<TreeNode[]>;
  listTopFolders(
    token: string,
    hubId: string,
    projectId: string,
  ): Promise<TreeNode[]>;
  listFolderContents(
    token: string,
    projectId: string,
    folderId: string,
  ): Promise<TreeNode[]>;
  listItemVersions(
    token: string,
    projectId: string,
    itemId: string,
  ): Promise<TreeNode[]>;
  versionViewState(
    token: string,
    projectId: string,
    itemId: string,
    versionId: string,
  ): Promise<VersionViewState>;
  versionThumbnail(
    token: string,
    urn: string,
    size: ThumbnailSize,
  ): Promise<Thumbnail | null>;
}
