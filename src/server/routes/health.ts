import { Router } from 'express';
import type { HealthResponse } from '../../shared/types.js';
import type { ServerConfig } from '../config.js';

export function healthRouter(config: ServerConfig): Router {
  const router = Router();
  router.get('/health', (_req, res) => {
    const body: HealthResponse = { status: 'ok', mock: config.mock };
    res.json(body);
  });
  return router;
}
