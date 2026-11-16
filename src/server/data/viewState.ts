import { createHash } from 'node:crypto';
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
  cacheLimit?: number;
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

function keyFor(token: string, urn: string): string {
  const owner = createHash('sha256').update(token).digest('hex');
  return `${owner}:${urn}`;
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
  const cacheLimit = options.cacheLimit ?? CACHE_LIMIT;
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

  function store(key: string, state: ViewState): void {
    const time = now();
    for (const [existing, entry] of cache) {
      if (entry.expires <= time) {
        cache.delete(existing);
      }
    }
    if (!cache.has(key) && cache.size >= cacheLimit) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) {
        cache.delete(oldest);
      }
    }
    cache.delete(key);
    cache.set(key, { state, expires: time + ttlFor(state) });
  }

  async function run(
    token: string,
    urn: string,
    key: string,
  ): Promise<ViewState> {
    await acquire();
    try {
      const state = await fetchState(token, urn);
      store(key, state);
      return state;
    } finally {
      release();
      inflight.delete(key);
    }
  }

  return {
    check(token, urn) {
      const key = keyFor(token, urn);
      const hit = cache.get(key);
      if (hit && hit.expires > now()) {
        return Promise.resolve(hit.state);
      }
      const pending = inflight.get(key);
      if (pending) {
        return pending;
      }
      const started = run(token, urn, key);
      inflight.set(key, started);
      return started;
    },
    clear() {
      cache.clear();
    },
  };
}

export const CHECKED_VERSIONS = 5;
export const LIST_BUDGET_MS = 6000;

export interface WithViewStatesOptions {
  limit?: number;
  budgetMs?: number;
}

function versionNumber(node: TreeNode): number {
  const match = /^v(\d+)/.exec(node.name);
  return match?.[1] ? Number(match[1]) : -1;
}

export async function withViewStates(
  nodes: TreeNode[],
  token: string,
  checker: ViewStateChecker,
  options: WithViewStatesOptions = {},
): Promise<TreeNode[]> {
  const limit = options.limit ?? CHECKED_VERSIONS;
  const budgetMs = options.budgetMs ?? LIST_BUDGET_MS;
  const checked = new Set(
    nodes
      .map((node, index) => ({ node, index }))
      .filter(({ node }) => node.kind === 'version' && node.urn)
      .sort(
        (a, b) =>
          versionNumber(b.node) - versionNumber(a.node) || a.index - b.index,
      )
      .slice(0, limit)
      .map(({ node }) => node),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<ViewState>((resolve) => {
    timer = setTimeout(() => resolve('unknown'), budgetMs);
  });
  try {
    return await Promise.all(
      nodes.map(async (node) => {
        if (!node.urn) {
          return node;
        }
        if (!checked.has(node)) {
          return { ...node, checked: false };
        }
        const viewState = await Promise.race([
          checker.check(token, node.urn),
          deadline,
        ]);
        return { ...node, viewState, viewable: viewableFor(viewState) };
      }),
    );
  } finally {
    clearTimeout(timer);
  }
}
