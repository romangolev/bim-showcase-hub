import { describe, expect, it } from 'vitest';
import type { TreeNode } from '../../shared/types.js';
import {
  sanitizeVersionTarget,
  versionContext,
  visibleVersions,
} from './versionHistory.js';

const version = (n: number, extra: Partial<TreeNode> = {}): TreeNode => ({
  id: `v${n}`,
  kind: 'version',
  name: `v${n}: 2025-01-0${n} 10:00 by ${n % 2 ? 'Sam' : 'Mei'}`,
  hasChildren: false,
  viewable: true,
  viewState: 'ready',
  urn: `urn-${n}`,
  versionNumber: n,
  modifiedBy: n % 2 ? 'Sam' : 'Mei',
  ...extra,
});

describe('visibleVersions', () => {
  it('sorts newest first', () => {
    const out = visibleVersions([version(1), version(3), version(2)], {
      filter: '',
      viewableOnly: false,
    });
    expect(out.map((v) => v.versionNumber)).toEqual([3, 2, 1]);
  });

  it('filters by author or label, ignoring case and accents', () => {
    const out = visibleVersions([version(1), version(2)], {
      filter: 'mÉi',
      viewableOnly: false,
    });
    expect(out.map((v) => v.id)).toEqual(['v2']);
  });

  it('hides versions that cannot open when asked', () => {
    const out = visibleVersions(
      [
        version(1),
        version(2, { viewState: 'failed', viewable: false, urn: undefined }),
      ],
      { filter: '', viewableOnly: true },
    );
    expect(out.map((v) => v.id)).toEqual(['v1']);
  });
});

describe('sanitizeVersionTarget', () => {
  it('rejects a target without project or item', () => {
    expect(sanitizeVersionTarget({ itemId: 'i' })).toBeNull();
    expect(sanitizeVersionTarget(null)).toBeNull();
  });

  it('keeps string trails and crumbs only', () => {
    const target = sanitizeVersionTarget({
      projectId: 'p',
      itemId: 'i',
      file: 'a.rvt',
      trail: ['h', 3, 'i'],
      crumbs: ['Files'],
    });
    expect(target).toEqual({
      projectId: 'p',
      itemId: 'i',
      file: 'a.rvt',
      trail: ['h', 'i'],
      crumbs: ['Files'],
    });
  });
});

describe('versionContext', () => {
  it('builds the same context the tree builds for a version', () => {
    const target = {
      projectId: 'p',
      itemId: 'i',
      file: 'a.rvt',
      trail: ['h', 'p', 'f', 'i'],
      crumbs: ['Hub', 'Proj', 'Files'],
    };
    expect(versionContext(target, version(2))).toEqual({
      file: 'a.rvt',
      v: 'v2',
      trail: ['h', 'p', 'f', 'i'],
      crumbs: ['Hub', 'Proj', 'Files'],
    });
  });
});
