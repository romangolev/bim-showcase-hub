import { ApiError } from './client.js';

export interface FriendlyError {
  message: string;
  detail?: string;
  code?: string;
}

export function friendlyError(
  error: unknown,
  fallback = 'Something went wrong. Try again.',
): FriendlyError {
  const detail =
    error instanceof Error && error.message ? error.message : undefined;
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return {
        message: 'Your session has expired. Sign in again to continue.',
        detail,
      };
    }
    if (error.status === 403) {
      return {
        message: 'Your account does not have access to this.',
        detail,
        code: error.code,
      };
    }
    if (error.status === 404) {
      return { message: 'We could not find this. It may have moved.', detail };
    }
    if (error.status === 429) {
      return {
        message: 'Too many requests. Wait a moment and try again.',
        detail,
      };
    }
    if (error.status >= 500) {
      return {
        message: 'The service had a problem. Try again in a moment.',
        detail,
      };
    }
    return { message: fallback, detail };
  }
  if (error instanceof TypeError) {
    return {
      message: 'Cannot reach the server. Check your connection and try again.',
      detail,
    };
  }
  return { message: fallback, detail };
}
