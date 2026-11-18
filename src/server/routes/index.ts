import { Router } from 'express';
import { createSessionCodec } from '../auth/sessionTokens.js';
import type { ApsAuth } from '../auth/types.js';
import type { ServerConfig } from '../config.js';
import type { DataService } from '../data/types.js';
import { HttpError } from '../errors.js';
import { authRouter } from './auth.js';
import { cspRouter } from './csp.js';
import { dataRouter } from './data.js';
import { healthRouter } from './health.js';

export interface AppDeps {
  auth: ApsAuth;
  data: DataService;
}

export function apiRouter(config: ServerConfig, deps: AppDeps): Router {
  const router = Router();
  const codec = createSessionCodec(config.sessionSecret);
  router.use(healthRouter(config));
  router.use(cspRouter());
  router.use(authRouter(config, deps.auth, codec));
  router.use(dataRouter(config, deps.auth, deps.data, codec));
  router.use(() => {
    throw new HttpError(404, 'Not found');
  });
  return router;
}
