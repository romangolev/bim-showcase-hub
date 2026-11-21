import { beforeEach, describe, expect, it } from 'vitest';
import { installMemoryStorage } from '../test/mockApi.js';
import {
  MAX_SET_MEMBERS,
  MODEL_SETS,
  memberContext,
  sanitizeModelSet,
} from './modelSets.js';

beforeEach(() => {
  installMemoryStorage();
});

describe('sanitizeModelSet', () => {
  it('drops members without an urn, dedupes by urn and keeps order', () => {
    const out = sanitizeModelSet({
      members: [
        { urn: 'b', follow: 'latest', projectId: 'p', itemId: 'i' },
        { file: 'x' },
        { urn: 'a' },
        { urn: 'b' },
      ],
    });
    expect(out?.members.map((member) => [member.urn, member.follow])).toEqual([
      ['b', 'latest'],
      ['a', 'pinned'],
    ]);
  });

  it('downgrades latest to pinned when the item is unknown', () => {
    const out = sanitizeModelSet({ members: [{ urn: 'a', follow: 'latest' }] });
    expect(out?.members[0]?.follow).toBe('pinned');
  });

  it('keeps unknown fields for newer builds', () => {
    const out = sanitizeModelSet({
      tints: { a: '#f00' },
      members: [{ urn: 'a', offset: [1, 0, 0] }],
    });
    expect(out?.tints).toEqual({ a: '#f00' });
    expect(out?.members[0]?.offset).toEqual([1, 0, 0]);
  });

  it('keeps only string trails and crumbs and caps the file name', () => {
    const out = sanitizeModelSet({
      members: [
        {
          urn: 'a',
          file: 'x'.repeat(300),
          trail: ['h', 3],
          crumbs: ['Files'],
        },
        { urn: 'b', trail: ['h', 'i'], crumbs: ['Files', 2] },
      ],
    });
    expect(out?.members[0]?.trail).toBeUndefined();
    expect(out?.members[0]?.crumbs).toEqual(['Files']);
    expect(out?.members[0]?.file).toHaveLength(260);
    expect(out?.members[1]?.trail).toEqual(['h', 'i']);
    expect(out?.members[1]?.crumbs).toBeUndefined();
  });

  it('rejects an empty set and caps members', () => {
    expect(sanitizeModelSet({ members: [] })).toBeNull();
    expect(sanitizeModelSet({})).toBeNull();
    const many = Array.from({ length: 40 }, (_, i) => ({ urn: `u${i}` }));
    expect(sanitizeModelSet({ members: many })?.members).toHaveLength(
      MAX_SET_MEMBERS,
    );
  });
});

describe('memberContext', () => {
  it('carries file, version, trail and crumbs without empty keys', () => {
    expect(
      memberContext({ urn: 'a', file: 'a.rvt', v: 'v2', follow: 'pinned' }),
    ).toEqual({ file: 'a.rvt', v: 'v2' });
    expect(
      memberContext({ urn: 'a', trail: ['h'], crumbs: [], follow: 'pinned' }),
    ).toEqual({ trail: ['h'] });
  });
});

describe('MODEL_SETS', () => {
  it('saves, renames, moves and removes through the handle', () => {
    const a = MODEL_SETS.save('Level 3 coordination', {
      members: [{ urn: 'u1', follow: 'pinned' }],
    });
    const b = MODEL_SETS.save('MEP', {
      members: [{ urn: 'u2', follow: 'pinned' }],
    });
    expect(MODEL_SETS.list().map((item) => item.name)).toEqual([
      'Level 3 coordination',
      'MEP',
    ]);
    expect(MODEL_SETS.move(b?.id ?? '', -1)).toBe(true);
    expect(MODEL_SETS.list()[0]?.name).toBe('MEP');
    expect(MODEL_SETS.rename(a?.id ?? '', 'L3')).toBe(true);
    expect(MODEL_SETS.remove(a?.id ?? '')).toBe(true);
    expect(MODEL_SETS.list().map((item) => item.name)).toEqual(['MEP']);
  });

  it('refuses a set with no members', () => {
    expect(MODEL_SETS.save('Empty', { members: [] })).toBeNull();
  });
});
