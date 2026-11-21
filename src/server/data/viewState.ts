import { createHash } from 'node:crypto';
import { isRecord } from '../../shared/guards.js';
import { regionOf, type ViewerRegion } from '../../shared/region.js';
import type { TreeNode } from '../../shared/types.js';
import { type ViewState, viewableFor } from '../../shared/viewState.js';

const MANIFEST_BASE =
  'https://developer.api.autodesk.com/modelderivative/v2/designdata';
const GEOMETRY_TYPES = new Set(['svf', 'svf2']);
const SETTLED_TTL_MS = 60_000;
const VOLATILE_TTL_MS = 10_000;
const CACHE_LIMIT = 2000;
export const PURGE_INTERVAL_MS = 30_000;

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
  perTokenConcurrency?: number;
  timeoutMs?: number;
  now?: () => number;
  cacheLimit?: number;
}

export interface ViewStateChecker {
  check(token: string, urn: string): Promise<ViewState>;
  clear(): void;
  size?(): number;
}

function statusOf(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase() : '';
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

function ownerOf(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function keyFor(owner: string, urn: string): string {
  const { region, certain } = regionOf(urn);
  return `${owner}:${certain ? region : 'any'}:${urn}`;
}

const MISSING = Symbol('missing');

const REGION_HEADER: Record<ViewerRegion, string> = {
  US: 'US',
  EU: 'EMEA',
};

function ttlFor(state: ViewState): number {
  return state === 'processing' || state === 'unknown'
    ? VOLATILE_TTL_MS
    : SETTLED_TTL_MS;
}

export function createViewStateChecker(
  options: ViewStateCheckerOptions = {},
): ViewStateChecker {
  const fetchImpl: Fetch = options.fetchImpl ?? (fetch as unknown as Fetch);
  const limit = options.concurrency ?? 8;
  const perToken = options.perTokenConcurrency ?? 2;
  const timeoutMs = options.timeoutMs ?? 8000;
  const now = options.now ?? Date.now;
  const cacheLimit = options.cacheLimit ?? CACHE_LIMIT;
  const cache = new Map<string, { state: ViewState; expires: number }>();
  const inflight = new Map<string, Promise<ViewState>>();
  const waiting: { owner: string; start: () => void }[] = [];
  const running = new Map<string, number>();
  let active = 0;

  function canStart(owner: string): boolean {
    return active < limit && (running.get(owner) ?? 0) < perToken;
  }

  function start(owner: string): void {
    active += 1;
    running.set(owner, (running.get(owner) ?? 0) + 1);
  }

  async function acquire(owner: string): Promise<void> {
    if (canStart(owner)) {
      start(owner);
      return;
    }
    await new Promise<void>((resolve) =>
      waiting.push({
        owner,
        start: () => {
          start(owner);
          resolve();
        },
      }),
    );
  }

  function release(owner: string): void {
    active -= 1;
    const left = (running.get(owner) ?? 1) - 1;
    if (left > 0) running.set(owner, left);
    else running.delete(owner);
    let index = waiting.findIndex((entry) => canStart(entry.owner));
    while (index !== -1) {
      const [next] = waiting.splice(index, 1);
      next?.start();
      index = waiting.findIndex((entry) => canStart(entry.owner));
    }
  }

  async function fetchRegion(
    token: string,
    urn: string,
    region: ViewerRegion,
  ): Promise<ViewState | typeof MISSING> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(
        `${MANIFEST_BASE}/${encodeURIComponent(urn)}/manifest`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            region: REGION_HEADER[region],
          },
          signal: controller.signal,
        },
      );
      if (res.status === 404) {
        return MISSING;
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

  async function fetchState(token: string, urn: string): Promise<ViewState> {
    const { region, certain } = regionOf(urn);
    const first = await fetchRegion(token, urn, region);
    if (first !== MISSING) return first;
    if (certain) return 'not-translated';
    const other = await fetchRegion(token, urn, region === 'US' ? 'EU' : 'US');
    return other === MISSING ? 'unknown' : other;
  }

  let lastPurge = Number.NEGATIVE_INFINITY;

  function store(key: string, state: ViewState): void {
    const time = now();
    if (time - lastPurge >= PURGE_INTERVAL_MS) {
      lastPurge = time;
      for (const [existing, entry] of cache) {
        if (entry.expires <= time) {
          cache.delete(existing);
        }
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
    owner: string,
    urn: string,
    key: string,
  ): Promise<ViewState> {
    await acquire(owner);
    try {
      const state = await fetchState(token, urn);
      store(key, state);
      return state;
    } finally {
      release(owner);
      inflight.delete(key);
    }
  }

  return {
    check(token, urn) {
      const owner = ownerOf(token);
      const key = keyFor(owner, urn);
      const hit = cache.get(key);
      if (hit && hit.expires > now()) {
        return Promise.resolve(hit.state);
      }
      if (hit) cache.delete(key);
      const pending = inflight.get(key);
      if (pending) {
        return pending;
      }
      const started = run(token, owner, urn, key);
      inflight.set(key, started);
      return started;
    },
    clear() {
      cache.clear();
    },
    size() {
      return cache.size;
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
  if (node.versionNumber !== undefined) return node.versionNumber;
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
