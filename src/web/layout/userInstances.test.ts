import { describe, expect, it } from 'vitest';
import {
  addUserInstance,
  removeUserInstance,
  sanitizeUserInstances,
  userInstanceIds,
} from './userInstances.js';

describe('user pane instances', () => {
  it('adds stable, non-reused ids and titles', () => {
    const first = addUserInstance({}, 'chart');
    expect(first?.id).toBe('chart:1');
    const second = addUserInstance(first?.state ?? {}, 'chart');
    expect(second?.id).toBe('chart:2');
    const trimmed = removeUserInstance(second?.state ?? {}, 'chart:1');
    expect(userInstanceIds(trimmed)).toEqual(['chart:2']);
    expect(addUserInstance(trimmed, 'chart')?.id).toBe('chart:1');
  });

  it('refuses families that are not user created', () => {
    expect(addUserInstance({}, 'viewer')).toBeNull();
    expect(addUserInstance({}, 'tree')).toBeNull();
  });

  it('drops the family key when the last instance closes', () => {
    const one = addUserInstance({}, 'chart');
    expect(removeUserInstance(one?.state ?? {}, 'chart:1')).toEqual({});
  });

  it('sanitizes persisted data per family', () => {
    const clean = sanitizeUserInstances({
      chart: [
        { id: 'chart:1', title: 'Cost' },
        { id: 'chart:1', title: 'dup' },
        { id: 'chart:2' },
        { id: 'summary:9', title: 'wrong family' },
        { id: 'chart', title: 'plain' },
        'junk',
      ],
      viewer: [{ id: 'viewer:x', title: 'model' }],
      nope: [{ id: 'nope:1' }],
    });
    expect(clean).toEqual({
      chart: [
        { id: 'chart:1', title: 'Cost' },
        { id: 'chart:2', title: 'Chart' },
      ],
    });
    expect(sanitizeUserInstances(null)).toEqual({});
    expect(sanitizeUserInstances('x')).toEqual({});
  });
});
