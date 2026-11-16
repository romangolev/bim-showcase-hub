import { afterEach, describe, expect, it } from 'vitest';
import {
  claimRegion,
  currentRegion,
  regionConflictMessage,
  resetRegion,
} from './region.js';

afterEach(() => {
  resetRegion();
});

describe('page region', () => {
  it('lets the first model claim the region and rejects the other one', () => {
    expect(currentRegion()).toBeNull();
    expect(claimRegion('US')).toBe(true);
    expect(claimRegion('US')).toBe(true);
    expect(claimRegion('EU')).toBe(false);
    expect(currentRegion()).toBe('US');
  });

  it('names the region in the message', () => {
    expect(regionConflictMessage('EU')).toBe(
      'This model is in the EU region. The viewer supports one region per page.',
    );
  });
});
