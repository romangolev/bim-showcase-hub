import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TreeNode } from '../../shared/types.js';
import type { OpenModel } from '../api/openModels.js';
import { paneById } from '../layout/paneRegistry.js';
import { INITIAL_MODEL_TINTS } from '../panels/modelTint.js';
import { resolveModelSet } from '../store/openModelSet.js';
import {
  installMemoryStorage,
  mockFetch,
  plainVersion,
  treeRoutes,
  viewableVersion,
} from '../test/mockApi.js';
import {
  captureFederation,
  FEDERATION_KIND,
  FEDERATIONS,
  type FederationData,
  federationCommands,
  federationOpenPlan,
  latestVersionUrn,
  openSavedFederation,
  resolveFederation,
  sanitizeFederation,
  setFederationOpener,
  withFederationHidden,
  withFederationTints,
} from './savedFederations.js';

const base = (urn: string, patch: Partial<OpenModel> = {}): OpenModel => ({
  urn,
  context: {},
  ...patch,
});

describe('captureFederation', () => {
  it('captures members in order with tints, hidden flags and offsets', () => {
    const entry = base('a', {
      context: { file: 'A.rvt', with: 'b,c' },
      offsets: { b: [1, 0, 0] },
    });
    const data = captureFederation(
      entry,
      (urn) => ({ file: `${urn.toUpperCase()}.rvt` }),
      {
        ...INITIAL_MODEL_TINTS,
        tints: { b: { color: '#ff0000', strength: 0.5 } },
      },
      ['c'],
    );
    expect(data?.members.map((m) => [m.urn, m.hidden, m.tint?.color])).toEqual([
      ['a', false, undefined],
      ['b', false, '#ff0000'],
      ['c', true, undefined],
    ]);
    expect(data?.members[0]?.context).toEqual({ file: 'A.rvt' });
    expect(data?.offsets).toEqual({ b: [1, 0, 0] });
  });

  it('marks a member with an item trail as latest and one without it as fixed', () => {
    const entry = base('a', { context: { file: 'A.rvt', with: 'b' } });
    const data = captureFederation(
      entry,
      (urn) =>
        urn === 'a'
          ? { file: 'A.rvt', trail: ['h1', 'p1', 'f1', 'i1'] }
          : { file: 'B.rvt' },
      INITIAL_MODEL_TINTS,
      [],
    );
    expect(data?.members.map((m) => m.latest)).toEqual([true, false]);
  });

  it('refuses a single model and caps a long combination', () => {
    expect(
      captureFederation(base('a'), () => ({}), INITIAL_MODEL_TINTS, []),
    ).toBeNull();
    const context = {
      with: ['b', 'c', 'd', 'e', 'f', 'g', 'h'].join(','),
    };
    expect(
      captureFederation(
        base('a', { context }),
        () => ({}),
        INITIAL_MODEL_TINTS,
        [],
      )?.members,
    ).toHaveLength(6);
  });
});

describe('sanitizeFederation', () => {
  it('refuses garbage and keeps at most six members', () => {
    expect(sanitizeFederation({ members: [{ urn: 1 }] })).toBeNull();
    expect(sanitizeFederation({ members: [] })).toBeNull();
    expect(sanitizeFederation(null)).toBeNull();
    expect(
      sanitizeFederation({
        members: Array.from({ length: 9 }, (_, index) => ({
          urn: `u${index}`,
          context: {},
          latest: false,
          hidden: false,
        })),
      })?.members,
    ).toHaveLength(6);
  });

  it('drops with, duplicate urns and invalid tints but keeps the rest', () => {
    expect(
      sanitizeFederation({
        members: [
          {
            urn: ' a ',
            context: { file: 'A.rvt', with: 'b', trail: ['h', 'p', 'i'] },
            latest: true,
            hidden: true,
            tint: { color: '#00FF00', strength: 2 },
          },
          { urn: 'a', context: { file: 'dup' } },
          { urn: 'b', context: {}, tint: { color: 'red' } },
        ],
        offsets: { a: [0, 1, 2], b: 'nope' },
      }),
    ).toEqual({
      members: [
        {
          urn: 'a',
          context: { file: 'A.rvt', trail: ['h', 'p', 'i'] },
          latest: true,
          hidden: true,
          tint: { color: '#00ff00', strength: 1 },
        },
        { urn: 'b', context: {}, latest: false, hidden: false },
      ],
      offsets: { a: [0, 1, 2] },
    });
  });
});

describe('resolveFederation', () => {
  const data: FederationData = {
    members: [
      { urn: 'a1', context: { file: 'A.rvt' }, latest: false, hidden: false },
      {
        urn: 'b1',
        context: { file: 'B.rvt' },
        latest: true,
        hidden: true,
        tint: { color: '#00ff00', strength: 0.5 },
      },
    ],
    offsets: { b1: [0, 2, 0] },
  };

  it('remaps a latest member to its newest version and moves its offsets', async () => {
    const { data: next, stale } = await resolveFederation(
      data,
      async (member) => (member.urn === 'b1' ? 'b2' : null),
    );
    expect(stale).toEqual([]);
    expect(federationOpenPlan(next)).toEqual({
      urn: 'a1',
      context: { file: 'A.rvt', with: 'b2' },
      offsets: { b2: [0, 2, 0] },
      tints: { b2: { color: '#00ff00', strength: 0.5 } },
      hidden: ['b2'],
    });
  });

  it('keeps the saved urn and reports a latest that another member already holds', async () => {
    const twins: FederationData = {
      members: [
        { urn: 'a1', context: { file: 'A.rvt' }, latest: true, hidden: false },
        { urn: 'b1', context: { file: 'B.rvt' }, latest: false, hidden: false },
      ],
    };
    const { data: next, stale } = await resolveFederation(
      twins,
      async () => 'b1',
    );
    expect(stale).toEqual(['A.rvt']);
    expect(next.members.map((member) => member.urn)).toEqual(['a1', 'b1']);
  });

  it('keeps the saved urn and reports a failed latest lookup', async () => {
    const first: FederationData = {
      members: [
        { urn: 'a1', context: { file: 'A.rvt' }, latest: true, hidden: false },
        { urn: 'b1', context: {}, latest: false, hidden: false },
      ],
    };
    const { data: next, stale } = await resolveFederation(
      first,
      async () => null,
    );
    expect(next.members[0]?.urn).toBe('a1');
    expect(stale).toEqual(['A.rvt']);
  });

  it('leaves a lookup that finds the saved version alone', async () => {
    const { data: next, stale } = await resolveFederation(
      data,
      async () => 'b1',
    );
    expect(stale).toEqual([]);
    expect(next).toBe(data);
  });
});

describe('federationOpenPlan', () => {
  it('omits with, offsets and tints that are empty', () => {
    expect(
      federationOpenPlan({
        members: [
          {
            urn: 'a',
            context: { file: 'A.rvt' },
            latest: false,
            hidden: false,
          },
          { urn: 'b', context: {}, latest: false, hidden: false },
        ],
      }),
    ).toEqual({
      urn: 'a',
      context: { file: 'A.rvt', with: 'b' },
      tints: {},
      hidden: [],
    });
  });
});

describe('withFederationTints', () => {
  it('sets the saved tint on each member and clears the others', () => {
    const next = withFederationTints(
      {
        ...INITIAL_MODEL_TINTS,
        tints: { a: { color: '#0000ff', strength: 0.5 } },
      },
      {
        members: [
          {
            urn: 'a',
            context: {},
            latest: false,
            hidden: false,
          },
          {
            urn: 'b',
            context: {},
            latest: false,
            hidden: false,
            tint: { color: '#ff0000', strength: 0.8 },
          },
        ],
      },
    );
    expect(next.tints).toEqual({ b: { color: '#ff0000', strength: 0.8 } });
  });
});

describe('withFederationHidden', () => {
  it('hides saved members and shows the others, keeping the cap', () => {
    const data: FederationData = {
      members: [
        { urn: 'a', context: {}, latest: false, hidden: false },
        { urn: 'b', context: {}, latest: false, hidden: true },
      ],
    };
    expect(withFederationHidden(['a', 'c'], data, 200)).toEqual(['c', 'b']);
    expect(withFederationHidden(['a', 'c'], data, 1)).toEqual(['b']);
  });
});

describe('latestVersionUrn', () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the item versions and takes the first viewable one', async () => {
    mockFetch({
      ...treeRoutes,
      '/api/projects/p1/items/i1/versions': [
        { ...viewableVersion, versionNumber: 2 },
        { ...plainVersion, versionNumber: 1 },
      ],
    });
    await expect(
      latestVersionUrn({
        urn: 'old',
        context: { trail: ['h1', 'p1', 'f1', 'i1'] },
        latest: true,
        hidden: false,
      }),
    ).resolves.toBe('dXJuOmFkc2s');
  });

  it('returns null without a trail or when the lookup fails', async () => {
    mockFetch({});
    await expect(
      latestVersionUrn({
        urn: 'old',
        context: {},
        latest: true,
        hidden: false,
      }),
    ).resolves.toBeNull();
    await expect(
      latestVersionUrn({
        urn: 'old',
        context: { trail: ['h1', 'p1', 'i9'] },
        latest: true,
        hidden: false,
      }),
    ).resolves.toBeNull();
  });
});

describe('latest version rule shared by model sets and combinations', () => {
  const version = (n: number, patch: Partial<TreeNode> = {}): TreeNode => ({
    id: `v${n}`,
    kind: 'version',
    name: `v${n}: 2025-01-01 10:00 by Sam`,
    hasChildren: false,
    viewable: true,
    viewState: 'ready',
    urn: `u${n}`,
    versionNumber: n,
    ...patch,
  });
  const unviewable = version(4, {
    viewable: false,
    viewState: 'not-translated',
  });
  const fixtures: Record<string, TreeNode[]> = {
    'newest first': [version(3), version(2), version(1)],
    shuffled: [version(1), version(3), version(2)],
    'unviewable newest': [unviewable, version(3), version(2)],
    'unviewable newest, shuffled': [version(2), unviewable, version(3)],
  };

  beforeEach(() => {
    installMemoryStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(Object.entries(fixtures))('agree for %s', async (_name, versions) => {
    mockFetch({ '/api/projects/p1/items/i1/versions': versions });
    const set = await resolveModelSet(
      {
        members: [
          {
            urn: 'u0',
            follow: 'latest',
            projectId: 'p1',
            itemId: 'i1',
          },
        ],
      },
      async () => versions,
    );
    const combined = await latestVersionUrn({
      urn: 'u0',
      context: { trail: ['h1', 'p1', 'i1'] },
      latest: true,
      hidden: false,
    });
    expect(combined).toBe('u3');
    expect(set.models[0]?.urn).toBe('u3');
  });
});

describe('the federation opener', () => {
  afterEach(() => {
    setFederationOpener(null);
  });

  it('does nothing without a mounted opener', () => {
    expect(() => openSavedFederation('x')).not.toThrow();
  });

  it('routes to the last registered opener and survives an earlier cleanup', () => {
    const first = vi.fn();
    const second = vi.fn();
    const clearFirst = setFederationOpener(first);
    const clearSecond = setFederationOpener(second);
    openSavedFederation('x');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('x');
    clearFirst();
    openSavedFederation('y');
    expect(second).toHaveBeenCalledWith('y');
    clearSecond();
    openSavedFederation('z');
    expect(second).not.toHaveBeenCalledWith('z');
  });
});

describe('the federation saved kind', () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  afterEach(() => {
    setFederationOpener(null);
  });

  it('registers at version 1 and saves and lists combinations', () => {
    expect(FEDERATION_KIND).toBe('federation');
    expect(FEDERATIONS.version).toBe(1);
    const saved = FEDERATIONS.save('Site', {
      members: [
        { urn: 'a', context: {}, latest: false, hidden: false },
        { urn: 'b', context: {}, latest: false, hidden: false },
      ],
    });
    expect(saved?.data.members).toHaveLength(2);
    expect(
      FEDERATIONS.save('One', {
        members: [{ urn: 'a', context: {}, latest: false, hidden: false }],
      }),
    ).toBeNull();
  });

  it('lists one palette command per saved combination that opens it', () => {
    const saved = FEDERATIONS.save('Site', {
      members: [
        { urn: 'a', context: {}, latest: false, hidden: false },
        { urn: 'b', context: {}, latest: false, hidden: false },
      ],
    });
    expect(federationCommands()[0]?.disabled).toBe(
      'Open the Models pane first',
    );
    const open = vi.fn();
    setFederationOpener(open);
    const commands = federationCommands();
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      id: `federation.open.${saved?.id}`,
      title: 'Open combination: Site',
      group: 'Combinations',
    });
    commands[0]?.run({ openModal: () => {} });
    expect(open).toHaveBeenCalledWith(saved?.id);
  });

  it('offers the commands through the Models pane hook', () => {
    const saved = FEDERATIONS.save('Site', {
      members: [
        { urn: 'a', context: {}, latest: false, hidden: false },
        { urn: 'b', context: {}, latest: false, hidden: false },
      ],
    });
    const commands =
      paneById('models').commands?.({
        isOpen: () => false,
        toggle: () => {},
        create: () => {},
        focus: () => {},
      }) ?? [];
    expect(commands.map((command) => command.id)).toEqual([
      `federation.open.${saved?.id}`,
    ]);
  });
});
