import type { Request } from 'express';
import type { SessionStore } from '../auth/sessionTokens.js';
import { HttpError } from '../errors.js';

export function sessionOf(req: Request): SessionStore {
  const session = req.session;
  if (!session) {
    throw new HttpError(401, 'Not signed in');
  }
  return session as SessionStore;
}

export function clearOnRejection(req: Request): { clearOnRejection: boolean } {
  return { clearOnRejection: req.get('X-Auth-Retry') === '1' };
}
