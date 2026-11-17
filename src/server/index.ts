import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieSession from 'cookie-session';
import express, { type Express } from 'express';
import { createApsAuth } from './auth/apsAuth.js';
import { SESSION_MAX_AGE_MS } from './auth/sessionTokens.js';
import { loadConfig, type ServerConfig } from './config.js';
import { REPORT_ONLY_CSP } from './csp.js';
import { createApsDataService } from './data/apsDataService.js';
import { errorHandler } from './errors.js';
import { createMockDataService } from './mock/index.js';
import { type AppDeps, apiRouter } from './routes/index.js';

function defaultDeps(config: ServerConfig): AppDeps {
  return {
    auth: createApsAuth(config),
    data: config.mock
      ? createMockDataService(undefined, {
          emptyHubs: process.env.MOCK_EMPTY_HUBS === '1',
          personalOnly: process.env.MOCK_PERSONAL_ONLY === '1',
        })
      : createApsDataService(),
  };
}

function defaultStaticDir(): string {
  return fileURLToPath(new URL('../web', import.meta.url));
}

export function createApp(
  config: ServerConfig = loadConfig(),
  deps: AppDeps = defaultDeps(config),
): Express {
  const app = express();
  app.disable('x-powered-by');
  if (config.production) {
    app.set('trust proxy', 1);
  }
  app.use(
    cookieSession({
      name: 'bim-hub-session',
      keys: [config.sessionSecret],
      maxAge: SESSION_MAX_AGE_MS,
      httpOnly: true,
      sameSite: 'lax',
    }),
  );
  app.use('/api', apiRouter(config, deps));
  if (config.production) {
    const staticDir = config.staticDir ?? defaultStaticDir();
    app.use((_req, res, next) => {
      res.set('Content-Security-Policy-Report-Only', REPORT_ONLY_CSP);
      next();
    });
    app.use(express.static(staticDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }
  app.use(errorHandler);
  return app;
}

const isEntry = process.argv[1] === fileURLToPath(import.meta.url);

if (isEntry) {
  const config = loadConfig();
  const app = createApp(config);
  app.listen(config.port, () => {
    console.log(
      `server listening on :${config.port}${config.mock ? ' (mock)' : ''}`,
    );
  });
}
