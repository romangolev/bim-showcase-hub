import { fileURLToPath } from 'node:url';
import cookieSession from 'cookie-session';
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { loadConfig, type ServerConfig } from './config.js';
import { apiRouter } from './routes/index.js';

export function createApp(config: ServerConfig = loadConfig()): Express {
  const app = express();
  app.use(express.json());
  app.use(
    cookieSession({
      name: 'bim-hub-session',
      keys: [config.sessionSecret],
      maxAge: 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax',
    }),
  );
  app.use('/api', apiRouter(config));
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : 'Internal error';
    res.status(500).json({ error: message });
  });
  return app;
}

const isEntry = process.argv[1] === fileURLToPath(import.meta.url);

if (isEntry) {
  const config = loadConfig();
  createApp(config).listen(config.port, () => {
    console.log(
      `server listening on :${config.port}${config.mock ? ' (mock)' : ''}`,
    );
  });
}
