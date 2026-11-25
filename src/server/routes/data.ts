import { type Request, type RequestHandler, Router } from 'express';
import { getAccessToken, type SessionCodec } from '../auth/sessionTokens.js';
import type { ApsAuth } from '../auth/types.js';
import type { ServerConfig } from '../config.js';
import type { ThumbnailSize } from '../data/thumbnails.js';
import type { DataService } from '../data/types.js';
import { HttpError } from '../errors.js';
import { decodeId, decodeUrn } from '../ids.js';
import { clearOnRejection, sessionOf } from './session.js';

const MOCK_TOKEN = 'mock-token';
const THUMBNAIL_SIZES = new Set([100, 200, 400]);

export function dataRouter(
  config: ServerConfig,
  auth: ApsAuth,
  data: DataService,
  codec: SessionCodec,
): Router {
  const router = Router();

  async function tokenFor(req: Request): Promise<string> {
    if (config.mock) {
      return MOCK_TOKEN;
    }
    return (
      await getAccessToken(
        sessionOf(req),
        auth,
        codec,
        Date.now(),
        clearOnRejection(req),
      )
    ).accessToken;
  }

  function route<T>(
    path: string,
    load: (token: string, params: Record<string, string>) => Promise<T>,
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

  route(
    '/projects/:projectId/items/:itemId/versions/:versionId/view-state',
    (token, p) =>
      data.versionViewState(
        token,
        p.projectId as string,
        p.itemId as string,
        p.versionId as string,
      ),
    ['projectId', 'itemId', 'versionId'],
  );

  router.get('/thumbnails/:urn', async (req, res) => {
    const urn = String(req.params.urn);
    decodeUrn(urn);
    const size = req.query.size === undefined ? 200 : Number(req.query.size);
    if (!THUMBNAIL_SIZES.has(size)) {
      throw new HttpError(400, 'Invalid size');
    }
    const token = await tokenFor(req);
    const closed = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) closed.abort();
    });
    const thumb = await data.versionThumbnail(
      token,
      urn,
      size as ThumbnailSize,
      closed.signal,
    );
    if (!thumb) {
      res.status(404).json({ error: 'No thumbnail' });
      return;
    }
    res
      .set('Cache-Control', 'private, max-age=3600')
      .set('X-Content-Type-Options', 'nosniff')
      .type(thumb.contentType)
      .send(thumb.body);
  });

  return router;
}
