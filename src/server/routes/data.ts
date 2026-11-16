import { type Request, type RequestHandler, Router } from 'express';
import type { TreeNode } from '../../shared/types.js';
import { getAccessToken } from '../auth/sessionTokens.js';
import type { ApsAuth } from '../auth/types.js';
import type { ServerConfig } from '../config.js';
import type { DataService } from '../data/types.js';
import { decodeId } from '../ids.js';
import { sessionOf } from './session.js';

const MOCK_TOKEN = 'mock-token';

export function dataRouter(
  config: ServerConfig,
  auth: ApsAuth,
  data: DataService,
): Router {
  const router = Router();

  async function tokenFor(req: Request): Promise<string> {
    if (config.mock) {
      return MOCK_TOKEN;
    }
    return (await getAccessToken(sessionOf(req), auth)).accessToken;
  }

  function route(
    path: string,
    load: (
      token: string,
      params: Record<string, string>,
    ) => Promise<TreeNode[]>,
    paramNames: string[],
  ): void {
    const handler: RequestHandler = async (req, res) => {
      const params: Record<string, string> = {};
      for (const name of paramNames) {
        params[name] = decodeId(String(req.params[name]));
      }
      const token = await tokenFor(req);
      res.json(await load(token, params));
    };
    router.get(path, handler);
  }

  route('/hubs', (token) => data.listHubs(token), []);
  route(
    '/hubs/:hubId/projects',
    (token, p) => data.listProjects(token, p.hubId as string),
    ['hubId'],
  );
  route(
    '/hubs/:hubId/projects/:projectId/folders',
    (token, p) =>
      data.listTopFolders(token, p.hubId as string, p.projectId as string),
    ['hubId', 'projectId'],
  );
  route(
    '/projects/:projectId/folders/:folderId/contents',
    (token, p) =>
      data.listFolderContents(
        token,
        p.projectId as string,
        p.folderId as string,
      ),
    ['projectId', 'folderId'],
  );
  route(
    '/projects/:projectId/items/:itemId/versions',
    (token, p) =>
      data.listItemVersions(token, p.projectId as string, p.itemId as string),
    ['projectId', 'itemId'],
  );

  const viewState: RequestHandler = async (req, res) => {
    const token = await tokenFor(req);
    res.json(
      await data.versionViewState(
        token,
        decodeId(String(req.params.projectId)),
        decodeId(String(req.params.itemId)),
        decodeId(String(req.params.versionId)),
      ),
    );
  };
  router.get(
    '/projects/:projectId/items/:itemId/versions/:versionId/view-state',
    viewState,
  );

  return router;
}
