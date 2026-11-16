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

const encode = (raw: string) =>
  btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const us = (name: string) => encode(`urn:adsk.wipprod:fs.file:vf.${name}`);
const eu = (name: string) => encode(`urn:adsk.wipemea:fs.file:vf.${name}`);

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
      states.push(await checker.check('tok', us(urn)));
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
    await checker.check('t', us('a'));
    await checker.check('t', us('b'));
    await checker.check('t', us('c'));
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    await checker.check('t', us('b'));
    await checker.check('t', us('c'));
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    await checker.check('t', us('a'));
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('does not share results or in-flight requests between tokens', async () => {
    const fetchImpl = vi.fn(
      async (_url: string, init: { headers: Record<string, string> }) =>
        init.headers.Authorization === 'Bearer alice'
          ? reply(200, {
              status: 'success',
              derivatives: [geometry('svf', 'success')],
            })
          : reply(404),
    );
    const checker = createViewStateChecker({ fetchImpl });
    const [alice, bob] = await Promise.all([
      checker.check('alice', us('u')),
      checker.check('bob', us('u')),
    ]);
    expect(alice).toBe('ready');
    expect(bob).toBe('not-translated');
    expect(await checker.check('alice', us('u'))).toBe('ready');
    expect(await checker.check('bob', us('u'))).toBe('not-translated');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('shares one request between concurrent checks of the same urn', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply(404));
    const checker = createViewStateChecker({ fetchImpl });
    await Promise.all([
      checker.check('t', us('u')),
      checker.check('t', us('u')),
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('runs at most two manifest requests per token and eight in all', async () => {
    let running = 0;
    let peak = 0;
    const perToken = new Map<string, number>();
    let tokenPeak = 0;
    const fetchImpl = vi.fn(
      async (_url: string, init: { headers: Record<string, string> }) => {
        const who = init.headers.Authorization as string;
        running += 1;
        perToken.set(who, (perToken.get(who) ?? 0) + 1);
        peak = Math.max(peak, running);
        tokenPeak = Math.max(tokenPeak, perToken.get(who) ?? 0);
        await new Promise((resolve) => setTimeout(resolve, 5));
        running -= 1;
        perToken.set(who, (perToken.get(who) ?? 1) - 1);
        return reply(404);
      },
    );
    const checker = createViewStateChecker({ fetchImpl });
    const checks = [];
    for (let user = 0; user < 6; user++) {
      for (let i = 0; i < 4; i++) {
        checks.push(checker.check(`user${user}`, us(`urn${i}`)));
      }
    }
    await Promise.all(checks);
    expect(fetchImpl).toHaveBeenCalledTimes(24);
    expect(tokenPeak).toBe(2);
    expect(peak).toBe(8);
  });

  it('does not make one user wait behind another user’s queue', async () => {
    const gates: (() => void)[] = [];
    const fetchImpl = vi.fn(
      (_url: string, init: { headers: Record<string, string> }) =>
        init.headers.Authorization === 'Bearer busy'
          ? new Promise<ReturnType<typeof reply>>((resolve) => {
              gates.push(() => resolve(reply(404)));
            })
          : Promise.resolve(reply(404)),
    );
    const checker = createViewStateChecker({ fetchImpl, concurrency: 3 });
    const busy = Array.from({ length: 10 }, (_, i) =>
      checker.check('busy', us(`b${i}`)),
    );
    expect(await checker.check('calm', us('c'))).toBe('not-translated');
    expect(gates).toHaveLength(2);
    while (gates.length > 0) {
      gates.shift()?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    await Promise.all(busy);
  });

  it('starts the request timeout only when the request leaves the queue', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise<ReturnType<typeof reply>>((resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('x')));
          setTimeout(
            () =>
              resolve(
                reply(200, {
                  status: 'success',
                  derivatives: [geometry('svf', 'success')],
                }),
              ),
            30,
          );
        }),
    );
    const checker = createViewStateChecker({
      fetchImpl,
      concurrency: 1,
      timeoutMs: 50,
    });
    const states = await Promise.all(
      ['a', 'b', 'c'].map((name) => checker.check('t', us(name))),
    );
    expect(states).toEqual(['ready', 'ready', 'ready']);
  });

  it('asks the EMEA data centre for an EU urn', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      reply(200, {
        status: 'success',
        derivatives: [geometry('svf2', 'success')],
      }),
    );
    const checker = createViewStateChecker({ fetchImpl });
    expect(await checker.check('t', eu('a'))).toBe('ready');
    const [, init] = fetchImpl.mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ];
    expect(init.headers.region).toBe('EMEA');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('uses the US data centre for a US urn and trusts its 404', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply(404));
    const checker = createViewStateChecker({ fetchImpl });
    expect(await checker.check('t', us('a'))).toBe('not-translated');
    const [, init] = fetchImpl.mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ];
    expect(init.headers.region).toBe('US');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('tries the other data centre and keeps an unclear urn openable when both answer 404', async () => {
    const fetchImpl = vi.fn(
      async (_url: string, init: { headers: Record<string, string> }) =>
        init.headers.region === 'EMEA'
          ? reply(200, {
              status: 'success',
              derivatives: [geometry('svf', 'success')],
            })
          : reply(404),
    );
    const checker = createViewStateChecker({ fetchImpl });
    expect(await checker.check('t', 'unclear')).toBe('ready');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const both404 = vi.fn().mockResolvedValue(reply(404));
    expect(
      await createViewStateChecker({ fetchImpl: both404 }).check('t', 'x'),
    ).toBe('unknown');
    expect(both404).toHaveBeenCalledTimes(2);
    const errorSecond = vi
      .fn()
      .mockResolvedValueOnce(reply(404))
      .mockResolvedValueOnce(reply(503));
    expect(
      await createViewStateChecker({ fetchImpl: errorSecond }).check('t', 'y'),
    ).toBe('unknown');
  });

  it('purges expired entries at most once per interval and on read', async () => {
    let clock = 0;
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(reply(200, { status: 'inprogress' }));
    const checker = createViewStateChecker({ fetchImpl, now: () => clock });
    await checker.check('t', us('a'));
    await checker.check('t', us('b'));
    await checker.check('t', us('c'));
    expect(checker.size?.()).toBe(3);
    clock = 11_000;
    await checker.check('t', us('d'));
    expect(checker.size?.()).toBe(4);
    await checker.check('t', us('a'));
    expect(checker.size?.()).toBe(4);
    clock = 31_000;
    await checker.check('t', us('e'));
    expect(checker.size?.()).toBe(1);
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

  it('checks only the newest versions and leaves older ones unchecked', async () => {
    const nodes = Array.from({ length: 12 }, (_, i) =>
      version(`v${i + 1}`, `u${i + 1}`),
    );
    const check = vi.fn().mockResolvedValue('ready');
    const out = await withViewStates(nodes, 't', {
      check,
      clear: () => undefined,
    });
    expect(check).toHaveBeenCalledTimes(5);
    const urns = check.mock.calls.map((call) => call[1]).sort();
    expect(urns).toEqual(['u10', 'u11', 'u12', 'u8', 'u9']);
    expect(out.filter((n) => n.viewState === 'ready')).toHaveLength(5);
    const older = out.filter((n) => n.viewState === 'unknown');
    expect(older).toHaveLength(7);
    expect(older.every((n) => n.viewable)).toBe(true);
    expect(older.every((n) => n.checked === false)).toBe(true);
    expect(out.filter((n) => n.checked === false)).toHaveLength(7);
  });

  it('returns within the budget for 150 slow versions', async () => {
    const nodes = Array.from({ length: 150 }, (_, i) =>
      version(`v${i + 1}`, `u${i + 1}`),
    );
    const check = vi.fn(() => new Promise<never>(() => undefined));
    const started = Date.now();
    const out = await withViewStates(
      nodes,
      't',
      { check, clear: () => undefined },
      { budgetMs: 30 },
    );
    expect(Date.now() - started).toBeLessThan(500);
    expect(check).toHaveBeenCalledTimes(5);
    expect(out).toHaveLength(150);
    expect(out.every((n) => n.viewState === 'unknown' && n.viewable)).toBe(
      true,
    );
    expect(out.filter((n) => n.checked !== false)).toHaveLength(5);
  });

  it('keeps unknown versions openable', async () => {
    const [node] = await withViewStates([version('a', 'u')], 't', {
      check: async () => 'unknown',
      clear: () => undefined,
    });
    expect(node?.viewable).toBe(true);
  });
});
