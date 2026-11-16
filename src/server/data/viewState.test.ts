import { describe, expect, it, vi } from 'vitest';
import type { TreeNode } from '../../shared/types.js';
import {
  classifyManifest,
  createViewStateChecker,
  withViewStates,
} from './viewState.js';

const geometry = (outputType: string, status: string) => ({
  outputType,
  status,
});

function reply(status: number, body?: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (body === undefined) {
        throw new Error('empty');
      }
      return body;
    },
  };
}

describe('classifyManifest', () => {
  const manifestStatuses = [
    'success',
    'partialsuccess',
    'pending',
    'inprogress',
    'failed',
    'timeout',
    'weird',
  ];
  const derivativeStatuses = [...manifestStatuses];
  const fromStatus: Record<string, string> = {
    success: 'ready',
    partialsuccess: 'ready',
    pending: 'processing',
    inprogress: 'processing',
    failed: 'failed',
    timeout: 'failed',
    weird: 'unknown',
  };

  for (const manifest of manifestStatuses) {
    for (const derivative of derivativeStatuses) {
      it(`manifest ${manifest} with svf ${derivative}`, () => {
        expect(
          classifyManifest({
            status: manifest,
            derivatives: [
              geometry('thumbnail', 'success'),
              geometry('svf', derivative),
            ],
          }),
        ).toBe(fromStatus[derivative]);
      });
    }
    it(`manifest ${manifest} without geometry`, () => {
      const expected =
        fromStatus[manifest] === 'ready' ? 'no-geometry' : fromStatus[manifest];
      expect(
        classifyManifest({
          status: manifest,
          derivatives: [geometry('thumbnail', 'success')],
        }),
      ).toBe(expected);
    });
  }

  it('accepts svf2 and prefers a usable derivative among several', () => {
    expect(
      classifyManifest({
        status: 'failed',
        derivatives: [
          geometry('svf', 'failed'),
          geometry('svf2', 'partialsuccess'),
        ],
      }),
    ).toBe('ready');
  });

  it('is not-translated for an empty body', () => {
    expect(classifyManifest(null)).toBe('not-translated');
    expect(classifyManifest('')).toBe('not-translated');
    expect(classifyManifest([])).toBe('not-translated');
  });
});

describe('createViewStateChecker', () => {
  it('maps http outcomes to states without throwing', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(reply(404, { code: 'x' }))
      .mockResolvedValueOnce(reply(200, null))
      .mockResolvedValueOnce(reply(401))
      .mockResolvedValueOnce(reply(403))
      .mockResolvedValueOnce(reply(429))
      .mockResolvedValueOnce(reply(503))
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(reply(200));
    const checker = createViewStateChecker({ fetchImpl });
    const states = [];
    for (const urn of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      states.push(await checker.check('tok', urn));
    }
    expect(states).toEqual([
      'not-translated',
      'not-translated',
      'unknown',
      'unknown',
      'unknown',
      'unknown',
      'unknown',
      'not-translated',
    ]);
  });

  it('sends the bearer token to the manifest endpoint for the urn', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply(200, { status: 'x' }));
    await createViewStateChecker({ fetchImpl }).check('tok', 'dXJu');
    const [url, init] = fetchImpl.mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ];
    expect(url).toBe(
      'https://developer.api.autodesk.com/modelderivative/v2/designdata/dXJu/manifest',
    );
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  it('caches settled states for 60s and volatile ones for 10s', async () => {
    let clock = 1000;
    const fetchImpl = vi.fn().mockResolvedValue(
      reply(200, {
        status: 'success',
        derivatives: [geometry('svf', 'success')],
      }),
    );
    fetchImpl.mockResolvedValueOnce(reply(200, { status: 'inprogress' }));
    const checker = createViewStateChecker({ fetchImpl, now: () => clock });

    await checker.check('t', 'volatile');
    await checker.check('t', 'volatile');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    clock += 10_001;
    expect(await checker.check('t', 'volatile')).toBe('ready');
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    clock += 30_000;
    await checker.check('t', 'volatile');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    clock += 30_001;
    await checker.check('t', 'volatile');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('keeps live entries when an expired key is rewritten and purges expired ones', async () => {
    let clock = 0;
    const fetchImpl = vi.fn(async (url: string) =>
      reply(
        200,
        url.includes('/busy/')
          ? { status: 'inprogress' }
          : { status: 'success', derivatives: [geometry('svf', 'success')] },
      ),
    );
    const checker = createViewStateChecker({
      fetchImpl,
      now: () => clock,
      cacheLimit: 2,
    });
    await checker.check('t', 'stable');
    await checker.check('t', 'busy');
    clock += 11_000;
    await checker.check('t', 'busy');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    await checker.check('t', 'stable');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('evicts the oldest live entry only when inserting a new key at the limit', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply(404));
    const checker = createViewStateChecker({ fetchImpl, cacheLimit: 2 });
    await checker.check('t', 'a');
    await checker.check('t', 'b');
    await checker.check('t', 'c');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    await checker.check('t', 'b');
    await checker.check('t', 'c');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    await checker.check('t', 'a');
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('shares one request between concurrent checks of the same urn', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply(404));
    const checker = createViewStateChecker({ fetchImpl });
    await Promise.all([checker.check('t', 'u'), checker.check('t', 'u')]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('limits concurrent manifest requests to four', async () => {
    let running = 0;
    let peak = 0;
    const fetchImpl = vi.fn(async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return reply(404);
    });
    const checker = createViewStateChecker({ fetchImpl });
    const urns = Array.from({ length: 12 }, (_, i) => `urn${i}`);
    await Promise.all(urns.map((urn) => checker.check('t', urn)));
    expect(fetchImpl).toHaveBeenCalledTimes(12);
    expect(peak).toBe(4);
  });

  it('aborts slow requests and reports unknown', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise<never>((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('x')));
        }),
    );
    const checker = createViewStateChecker({ fetchImpl, timeoutMs: 10 });
    expect(await checker.check('t', 'slow')).toBe('unknown');
  });
});

describe('withViewStates', () => {
  const version = (id: string, urn?: string): TreeNode => ({
    id,
    kind: 'version',
    name: id,
    hasChildren: false,
    viewable: Boolean(urn),
    viewState: urn ? 'unknown' : 'not-translated',
    ...(urn ? { urn } : {}),
  });

  it('checks only versions with a urn and derives viewable', async () => {
    const check = vi
      .fn()
      .mockResolvedValueOnce('no-geometry')
      .mockResolvedValueOnce('ready');
    const nodes = await withViewStates(
      [version('a', 'u1'), version('b'), version('c', 'u2')],
      'tok',
      { check, clear: () => undefined },
    );
    expect(check).toHaveBeenCalledTimes(2);
    expect(nodes.map((n) => [n.viewState, n.viewable])).toEqual([
      ['no-geometry', false],
      ['not-translated', false],
      ['ready', true],
    ]);
  });

  it('keeps unknown versions openable', async () => {
    const [node] = await withViewStates([version('a', 'u')], 't', {
      check: async () => 'unknown',
      clear: () => undefined,
    });
    expect(node?.viewable).toBe(true);
  });
});
