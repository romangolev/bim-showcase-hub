import type { SessionUser } from '../../shared/types.js';

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface ApsAuth {
  authorizeUrl(state: string): string;
  exchangeCode(code: string): Promise<TokenSet>;
  refresh(refreshToken: string): Promise<TokenSet>;
  getUser(accessToken: string): Promise<SessionUser>;
}
