import { Router } from 'express';
import type { ServerConfig } from '../config.js';
import { healthRouter } from './health.js';

export function apiRouter(config: ServerConfig): Router {
  const router = Router();
  router.use(healthRouter(config));
  return router;
}
