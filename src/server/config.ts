import { randomBytes } from 'node:crypto';
import 'dotenv/config';

export interface ServerConfig {
  port: number;
  mock: boolean;
  production: boolean;
  sessionSecret: string;
  staticDir: string | null;
  aps: {
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
    scopes: string[];
  };
}

const PLACEHOLDER_SECRET = 'change-me';

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const production = env.NODE_ENV === 'production';
  const mock = env.MOCK_APS === '1';
  let sessionSecret = env.SESSION_SECRET;
  if (production && sessionSecret === PLACEHOLDER_SECRET) {
    throw new Error('SESSION_SECRET must not be the placeholder in production');
  }
  if (!sessionSecret) {
    if (production) {
      throw new Error('SESSION_SECRET is required in production');
    }
    sessionSecret = randomBytes(32).toString('hex');
  }
  if (production && !mock && (!env.APS_CLIENT_ID || !env.APS_CLIENT_SECRET)) {
    throw new Error('APS_CLIENT_ID and APS_CLIENT_SECRET are required');
  }
  return {
    port: Number(env.PORT ?? 3000),
    mock,
    production,
    sessionSecret,
    staticDir: production ? env.STATIC_DIR || null : null,
    aps: {
      clientId: env.APS_CLIENT_ID ?? '',
      clientSecret: env.APS_CLIENT_SECRET ?? '',
      callbackUrl:
        env.APS_CALLBACK_URL ?? 'http://localhost:3000/api/auth/callback',
      scopes: ['data:read', 'viewables:read'],
    },
  };
}
