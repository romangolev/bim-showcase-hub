import 'dotenv/config';

export interface ServerConfig {
  port: number;
  mock: boolean;
  sessionSecret: string;
  aps: {
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
    scopes: string[];
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    port: Number(env.PORT ?? 3000),
    mock: env.MOCK_APS === '1',
    sessionSecret: env.SESSION_SECRET ?? 'dev-only-insecure-secret',
    aps: {
      clientId: env.APS_CLIENT_ID ?? '',
      clientSecret: env.APS_CLIENT_SECRET ?? '',
      callbackUrl:
        env.APS_CALLBACK_URL ?? 'http://localhost:3000/api/auth/callback',
      scopes: ['data:read', 'viewables:read'],
    },
  };
}
