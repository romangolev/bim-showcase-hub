import type {
  SessionUser,
  TreeNode,
  VersionViewState,
} from '../../shared/types.js';
import { childrenPath, type NodeScope } from './scope.js';

export type Session = SessionUser;

export class ApiError extends Error {
  readonly status: number;
  readonly retryAfterMs: number | null;

  constructor(
    status: number,
    message: string,
    retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

const unauthorizedListeners = new Set<() => void>();

export function subscribeUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

let knownSignedOut = false;

export function notifyUnauthorized(): void {
  knownSignedOut = true;
  for (const listener of [...unauthorizedListeners]) listener();
}

async function readError(res: Response): Promise<string> {
  const fallback = res.statusText || `Request failed with status ${res.status}`;
  try {
    const body: unknown = await res.json();
    if (body && typeof body === 'object') {
      const record = body as Record<string, unknown>;
      const message = record.error ?? record.message;
      if (typeof message === 'string') {
        return message;
      }
    }
  } catch {
    return fallback;
  }
  return fallback;
}

const SESSION_PATH = '/api/session';
export const UNAUTHORIZED_RETRY_DELAY_MS = 300;

function retryAfterMsOf(res: Response): number | null {
  const header = res.headers.get('Retry-After');
  if (!header) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds > 0
    ? Math.round(seconds * 1000)
    : null;
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const send = (extra?: Record<string, string>) =>
    fetch(path, {
      credentials: 'same-origin',
      ...init,
      headers: { Accept: 'application/json', ...init?.headers, ...extra },
    });
  let res = await send();
  const method = (init?.method ?? 'GET').toUpperCase();
  if (
    res.status === 401 &&
    path !== SESSION_PATH &&
    method === 'GET' &&
    !init?.body &&
    !knownSignedOut
  ) {
    await new Promise((resolve) =>
      setTimeout(resolve, UNAUTHORIZED_RETRY_DELAY_MS),
    );
    res = await send({ 'X-Auth-Retry': '1' });
  }
  if (res.ok) knownSignedOut = false;
  if (res.status === 401) {
    notifyUnauthorized();
  }
  if (!res.ok) {
    throw new ApiError(
      res.status,
      await readError(res),
      res.status === 429 ? retryAfterMsOf(res) : null,
    );
  }
  return res;
}

export async function fetchSession(
  signal?: AbortSignal,
): Promise<Session | null> {
  const res = await fetch('/api/session', {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (res.status === 401) {
    return null;
  }
  if (!res.ok) {
    throw new ApiError(res.status, await readError(res));
  }
  return (await res.json()) as Session;
}

export async function fetchAuthUrl(): Promise<string> {
  const res = await request('/api/auth/url');
  const body = (await res.json()) as { url: string };
  return body.url;
}

export async function postSignOut(): Promise<void> {
  await request('/api/auth/signout', { method: 'POST' });
}

export async function fetchVersionViewState(
  projectId: string,
  itemId: string,
  versionId: string,
): Promise<VersionViewState> {
  const enc = encodeURIComponent;
  const res = await request(
    `/api/projects/${enc(projectId)}/items/${enc(itemId)}/versions/${enc(versionId)}/view-state`,
  );
  return (await res.json()) as VersionViewState;
}

export async function fetchChildren(
  scope: NodeScope,
  signal?: AbortSignal,
): Promise<TreeNode[]> {
  const path = childrenPath(scope);
  if (path === null) {
    return [];
  }
  const res = await request(path, { signal });
  return (await res.json()) as TreeNode[];
}

export type ThumbnailSize = 100 | 200 | 400;

export function thumbnailPath(urn: string, size: ThumbnailSize = 200): string {
  return `/api/thumbnails/${encodeURIComponent(urn)}?size=${size}`;
}
