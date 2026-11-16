import type {
  SessionUser,
  TreeNode,
  VersionViewState,
} from '../../shared/types.js';
import { childrenPath, type NodeScope } from './scope.js';

export type Session = SessionUser;

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const unauthorizedListeners = new Set<() => void>();

export function subscribeUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

export function notifyUnauthorized(): void {
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

async function request(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: { Accept: 'application/json', ...init?.headers },
  });
  if (res.status === 401) {
    notifyUnauthorized();
  }
  if (!res.ok) {
    throw new ApiError(res.status, await readError(res));
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
