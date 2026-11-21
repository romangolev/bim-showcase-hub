import { describe, expect, it, vi } from 'vitest';
import { MAX_COMBINED_MODELS } from '../../shared/combined.js';
import type { TreeNode } from '../../shared/types.js';
import { modelHref } from '../components/tree/rowMenu.js';
import { resolveModelSet, setLink } from './openModelSet.js';

const ver = (
  id: string,
  n: number,
  extra: Partial<TreeNode> = {},
): TreeNode => ({
  id,
  kind: 'version',
  name: `v${n}: 2025-01-01 10:00 by Sam`,
  hasChildren: false,
  viewable: true,
  viewState: 'ready',
  urn: `urn-${id}`,
  versionNumber: n,
  ...extra,
});

describe('resolveModelSet', () => {
  it('swaps latest members to the newest openable version and keeps pinned ones', async () => {
    const versions = vi.fn(async () => [
      ver('v1', 1, { urn: 'old' }),
      ver('v2', 2, { urn: 'new', latest: true }),
    ]);
    const out = await resolveModelSet(
      {
        members: [
          {
            urn: 'old',
            file: 'a.rvt',
            v: 'v1',
            projectId: 'p',
            itemId: 'i',
            follow: 'latest',
          },
          { urn: 'pin', file: 'b.rvt', follow: 'pinned' },
        ],
      },
      versions,
    );
    expect(out.models.map((model) => [model.urn, model.context.v])).toEqual([
      ['new', 'v2'],
      ['pin', undefined],
    ]);
    expect(versions).toHaveBeenCalledTimes(1);
    expect(versions).toHaveBeenCalledWith('p', 'i');
  });

  it('reports pinned members that have a newer version', async () => {
    const versions = vi.fn(async () => [
      ver('v2', 2, { urn: 'new', latest: true }),
    ]);
    const out = await resolveModelSet(
      {
        members: [
          {
            urn: 'old',
            file: 'a.rvt',
            projectId: 'p',
            itemId: 'i',
            follow: 'pinned',
          },
        ],
      },
      versions,
    );
    expect(out.stale).toEqual(['a.rvt']);
    expect(out.models[0]?.urn).toBe('old');
  });

  it('falls back to the pinned urn when versions cannot be read', async () => {
    const out = await resolveModelSet(
      {
        members: [
          {
            urn: 'old',
            file: 'a.rvt',
            projectId: 'p',
            itemId: 'i',
            follow: 'latest',
          },
        ],
      },
      vi.fn().mockRejectedValue(new Error('nope')),
    );
    expect(out.failed).toEqual(['a.rvt']);
    expect(out.models[0]?.urn).toBe('old');
  });

  it('resolves every member and leaves limits to the opener', async () => {
    const members = Array.from({ length: 10 }, (_, i) => ({
      urn: `u${i}`,
      file: `f${i}.rvt`,
      follow: 'pinned' as const,
    }));
    const out = await resolveModelSet(
      { members },
      vi.fn(async () => []),
    );
    expect(out.models).toHaveLength(10);
  });
});

describe('setLink', () => {
  it('builds a combined link for up to the combined cap and none above', () => {
    const full = Array.from({ length: MAX_COMBINED_MODELS }, (_, i) => ({
      urn: `u${i}`,
      context: { file: `f${i}` },
    }));
    expect(setLink(full, 'https://x')).toBe(
      modelHref(
        'u0',
        {
          file: 'f0',
          with: full
            .slice(1)
            .map((m) => m.urn)
            .join(','),
        },
        'https://x',
      ),
    );
    expect(
      setLink([...full, { urn: 'extra', context: {} }], 'https://x'),
    ).toBeNull();
  });

  it('returns null for an empty set', () => {
    expect(setLink([], 'https://x')).toBeNull();
  });
});
