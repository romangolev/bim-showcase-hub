import { beforeEach, describe, expect, it } from 'vitest';
import { parseModelContext } from '../api/modelContext.js';
import {
  createOpenModelsStore,
  modelUrnsOf,
  type OpenModelsState,
  type OpenModelsStore,
} from '../api/openModels.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { openModels, previewOpen } from './openModels.js';

const picked = (count: number, prefix = 'p') =>
  Array.from({ length: count }, (_, index) => ({
    urn: `${prefix}${index}`,
    context: { file: `${prefix}${index}.rvt` },
  }));

function stateOf(
  urns: readonly string[],
  extras: Record<string, string[]> = {},
  active: string | null = urns.at(-1) ?? null,
): OpenModelsState {
  return {
    models: urns.map((urn) => ({
      urn,
      context: extras[urn] ? { with: extras[urn].join(',') } : {},
    })),
    active,
    live: urns,
    visible: [],
  };
}

function recording(state: OpenModelsState) {
  const calls: string[] = [];
  const base = createOpenModelsStore(null);
  const store: OpenModelsStore = {
    ...base,
    getState: () => state,
    open: (urn) => calls.push(`open ${urn}`),
    close: (urn) => calls.push(`close ${urn}`),
    addTo: (target, urn) => calls.push(`addTo ${target} ${urn}`),
  };
  return { store, calls };
}

const FULL_TABS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

beforeEach(() => {
  installMemoryStorage();
});

describe('openModels', () => {
  it('opens 6 of 8 together and names the combined cap', () => {
    const { store } = recording(stateOf([]));
    const out = openModels(store, {
      models: picked(8),
      mode: 'together',
      partial: true,
    });
    expect(out.opened).toHaveLength(6);
    expect(out.skipped.map((s) => [s.model.urn, s.reason])).toEqual([
      ['p6', 'combined-limit'],
      ['p7', 'combined-limit'],
    ]);
    expect(out.notice).toContain('Opened 6 of 8');
    expect(out.notice).toContain('holds 6');
    expect(out.notice).not.toContain('tabs hold');
    expect(out.reveal?.urn).toBe('p0');
    expect(out.reveal?.context.with).toBe('p1,p2,p3,p4,p5');
  });

  it('rejects an over-cap together request whole when not partial', () => {
    const { store, calls } = recording(stateOf([]));
    const out = openModels(store, { models: picked(7), mode: 'together' });
    expect(out.opened).toEqual([]);
    expect(out.reveal).toBeNull();
    expect(out.notice).toContain('6');
    expect(calls).toEqual([]);
  });

  it('rejects tabs whole at 7 loaded plus 3 picked', () => {
    const { store, calls } = recording(
      stateOf(['a', 'b', 'c', 'd', 'e', 'f', 'g']),
    );
    const out = openModels(store, { models: picked(3), mode: 'tabs' });
    expect(out.opened).toEqual([]);
    expect(out.skipped.every((s) => s.reason === 'tab-limit')).toBe(true);
    expect(out.notice).toContain('7 models are already loaded');
    expect(calls).toEqual([]);
  });

  it('opens a 9 member set as tabs with the first 8 and one left out', () => {
    const { store, calls } = recording(stateOf([]));
    const out = openModels(store, {
      models: picked(9),
      mode: 'tabs',
      partial: true,
    });
    expect(out.opened).toHaveLength(8);
    expect(calls).toHaveLength(8);
    expect(out.skipped).toHaveLength(1);
    expect(out.notice).toBe(
      'Opened 8 of 9 models. 1 was left out: tabs hold 8.',
    );
    expect(out.reveal?.urn).toBe('p7');
  });

  it('closes the active tab before opening in replace mode', () => {
    const { store, calls } = recording(stateOf(FULL_TABS));
    const out = openModels(store, {
      models: [{ urn: 'z', context: {} }],
      mode: 'replace',
    });
    expect(calls).toEqual(['close h', 'open z']);
    expect(out.reveal?.urn).toBe('z');
    expect(out.notice).toBeNull();
  });

  it('says how many models a replaced combined tab held', () => {
    const { store } = recording(stateOf(['a'], { a: ['b', 'c'] }));
    const out = openModels(store, {
      models: [{ urn: 'z', context: {} }],
      mode: 'replace',
    });
    expect(out.notice).toBe('Closed the combined tab and its 3 models');
  });

  it('skips add-to-active at the combined cap with the combined notice', () => {
    const { store, calls } = recording(
      stateOf(['a'], { a: ['b', 'c', 'd', 'e', 'f'] }),
    );
    const out = openModels(store, {
      models: [{ urn: 'n', context: {} }],
      mode: 'add-to-active',
    });
    expect(out.skipped.map((s) => s.reason)).toEqual(['combined-limit']);
    expect(out.notice).toContain('6 models');
    expect(calls).toEqual([]);
  });

  it('skips an already-open model without counting it toward the cap', () => {
    const { store, calls } = recording(
      stateOf(['a', 'x'], { a: ['b', 'c', 'd', 'e'] }, 'a'),
    );
    const out = openModels(store, {
      models: [
        { urn: 'x', context: {} },
        { urn: 'b', context: {} },
        { urn: 'n', context: {} },
      ],
      mode: 'add-to-active',
    });
    expect(out.skipped.map((s) => [s.model.urn, s.reason])).toEqual([
      ['x', 'already-open'],
      ['b', 'already-open'],
    ]);
    expect(out.opened.map((m) => m.urn)).toEqual(['n']);
    expect(calls).toEqual(['addTo a n']);
  });

  it('does not count an open model as fresh when opening as tabs', () => {
    const { store } = recording(stateOf(FULL_TABS));
    const out = openModels(store, {
      models: [{ urn: 'h', context: {} }],
      mode: 'tabs',
    });
    expect(out.opened).toHaveLength(1);
  });

  it('adds to the real store and reveals the active tab', () => {
    const store = createOpenModelsStore(null);
    store.open('a', {});
    const out = openModels(store, {
      models: picked(2),
      mode: 'add-to-active',
    });
    expect(modelUrnsOf(store.getState(), 'a')).toEqual(['a', 'p0', 'p1']);
    expect(out.reveal?.urn).toBe('a');
  });
});

describe('previewOpen', () => {
  const cases: [string, OpenModelsState, Parameters<typeof previewOpen>[1]][] =
    [
      [
        'together over the cap',
        stateOf([]),
        { models: picked(8), mode: 'together', partial: true },
      ],
      [
        'together strict over the cap',
        stateOf([]),
        { models: picked(7), mode: 'together' },
      ],
      [
        'tabs over the cap',
        stateOf(['a', 'b', 'c', 'd', 'e', 'f', 'g']),
        { models: picked(3), mode: 'tabs' },
      ],
      [
        'partial tabs',
        stateOf([]),
        { models: picked(9), mode: 'tabs', partial: true },
      ],
      [
        'replace',
        stateOf(['a'], { a: ['b'] }),
        { models: picked(1), mode: 'replace' },
      ],
      [
        'add at the cap',
        stateOf(['a'], { a: ['b', 'c', 'd', 'e', 'f'] }),
        { models: picked(1), mode: 'add-to-active' },
      ],
    ];

  it.each(cases)('agrees with openModels on %s', (_name, state, req) => {
    const preview = previewOpen(state, req);
    const out = openModels(recording(state).store, req);
    expect(preview.notice).toBe(out.notice);
    expect(preview.blocked).toBe(out.opened.length === 0);
    expect(preview.admitted).toBe(out.opened.length);
  });

  it('flags a blocked request and passes a fitting one', () => {
    expect(
      previewOpen(stateOf([]), { models: picked(2), mode: 'tabs' }),
    ).toEqual({ notice: null, blocked: false, admitted: 2 });
    expect(
      previewOpen(stateOf(FULL_TABS), { models: picked(1), mode: 'tabs' })
        .blocked,
    ).toBe(true);
  });
});

describe('the with clamp', () => {
  it('opens at most 6 models from a with of 20 urns without throwing', () => {
    const many = Array.from({ length: 20 }, (_, index) => `m${index}`);
    const store = createOpenModelsStore(null);
    expect(() =>
      store.open('a', parseModelContext({ with: many.join(',') })),
    ).not.toThrow();
    expect(modelUrnsOf(store.getState(), 'a')).toHaveLength(6);
  });
});
