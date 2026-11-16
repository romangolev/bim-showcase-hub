import type { TreeNode } from '../../shared/types.js';
import { type ViewState, viewableFor } from '../../shared/viewState.js';

const MANIFEST_BASE =
  'https://developer.api.autodesk.com/modelderivative/v2/designdata';
const GEOMETRY_TYPES = new Set(['svf', 'svf2']);
const SETTLED_TTL_MS = 60_000;
const VOLATILE_TTL_MS = 10_000;
const CACHE_LIMIT = 2000;

type Fetch = (
  input: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export interface ViewStateCheckerOptions {
  fetchImpl?: Fetch;
  concurrency?: number;
  timeoutMs?: number;
  now?: () => number;
}

export interface ViewStateChecker {
  check(token: string, urn: string): Promise<ViewState>;
  clear(): void;
}

function statusOf(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stateOfStatus(status: string): ViewState {
  switch (status) {
    case 'success':
    case 'partialsuccess':
      return 'ready';
    case 'pending':
    case 'inprogress':
      return 'processing';
    case 'failed':
    case 'timeout':
      return 'failed';
    default:
      return 'unknown';
  }
}

const GEOMETRY_ORDER: ViewState[] = [
  'ready',
  'processing',
  'failed',
  'unknown',
];

export function classifyManifest(body: unknown): ViewState {
  if (!isRecord(body)) {
    return 'not-translated';
  }
  const derivatives = Array.isArray(body.derivatives) ? body.derivatives : [];
  const geometry = derivatives
    .filter(isRecord)
    .filter((d) => GEOMETRY_TYPES.has(statusOf(d.outputType)))
    .map((d) => stateOfStatus(statusOf(d.status)));
  for (const candidate of GEOMETRY_ORDER) {
    if (geometry.includes(candidate)) {
      return candidate;
    }
  }
  const manifest = stateOfStatus(statusOf(body.status));
  return manifest === 'ready' ? 'no-geometry' : manifest;
}

function ttlFor(state: ViewState): number {
  return state === 'processing' || state === 'unknown'
    ? VOLATILE_TTL_MS
    : SETTLED_TTL_MS;
}

export function createViewStateChecker(
  options: ViewStateCheckerOptions = {},
): ViewStateChecker {
  const fetchImpl: Fetch = options.fetchImpl ?? (fetch as unknown as Fetch);
  const limit = options.concurrency ?? 4;
  const timeoutMs = options.timeoutMs ?? 8000;
  const now = options.now ?? Date.now;
  const cache = new Map<string, { state: ViewState; expires: number }>();
  const inflight = new Map<string, Promise<ViewState>>();
  const waiting: (() => void)[] = [];
  let active = 0;

  async function acquire(): Promise<void> {
    if (active < limit) {
      active += 1;
      return;
    }
    await new Promise<void>((resolve) => waiting.push(resolve));
  }

  function release(): void {
    const next = waiting.shift();
    if (next) {
      next();
    } else {
      active -= 1;
    }
  }

  async function fetchState(token: string, urn: string): Promise<ViewState> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(
        `${MANIFEST_BASE}/${encodeURIComponent(urn)}/manifest`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        },
      );
      if (res.status === 404) {
        return 'not-translated';
      }
      if (!res.ok) {
        return 'unknown';
      }
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      return classifyManifest(body);
    } catch {
      return 'unknown';
    } finally {
      clearTimeout(timer);
    }
  }

  async function run(token: string, urn: string): Promise<ViewState> {
    await acquire();
    try {
      const state = await fetchState(token, urn);
      if (cache.size >= CACHE_LIMIT) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) {
          cache.delete(oldest);
        }
      }
      cache.delete(urn);
      cache.set(urn, { state, expires: now() + ttlFor(state) });
      return state;
    } finally {
      release();
      inflight.delete(urn);
    }
  }

  return {
    check(token, urn) {
      const hit = cache.get(urn);
      if (hit && hit.expires > now()) {
        return Promise.resolve(hit.state);
      }
      const pending = inflight.get(urn);
      if (pending) {
        return pending;
      }
      const started = run(token, urn);
      inflight.set(urn, started);
      return started;
    },
    clear() {
      cache.clear();
    },
  };
}

export async function withViewStates(
  nodes: TreeNode[],
  token: string,
  checker: ViewStateChecker,
): Promise<TreeNode[]> {
  return Promise.all(
    nodes.map(async (node) => {
      if (node.kind !== 'version' || !node.urn) {
        return node;
      }
      const viewState = await checker.check(token, node.urn);
      return { ...node, viewState, viewable: viewableFor(viewState) };
    }),
  );
}
