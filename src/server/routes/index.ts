import { Router } from 'express';
import type { ApsAuth } from '../auth/types.js';
import type { ServerConfig } from '../config.js';
import type { DataService } from '../data/types.js';
import { HttpError } from '../errors.js';
import { authRouter } from './auth.js';
import { dataRouter } from './data.js';
import { healthRouter } from './health.js';

export interface AppDeps {
  auth: ApsAuth;
  data: DataService;
}

export function apiRouter(config: ServerConfig, deps: AppDeps): Router {
  const router = Router();
  router.use(healthRouter(config));
  router.use(authRouter(config, deps.auth));
  router.use(dataRouter(config, deps.auth, deps.data));
  router.use(() => {
    throw new HttpError(404, 'Not found');
  });
  return router;
}
