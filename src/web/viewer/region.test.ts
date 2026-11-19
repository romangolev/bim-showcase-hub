import { afterEach, describe, expect, it } from 'vitest';
import {
  claimRegion,
  regionAvailable,
  regionConflictMessage,
  resetRegion,
} from './region.js';

afterEach(() => {
  resetRegion();
});

describe('page region', () => {
  it('lets the first model claim the region and rejects the other one', () => {
    expect(regionAvailable('US')).toBe(true);
    expect(regionAvailable('EU')).toBe(true);
    expect(claimRegion('US')).toBe(true);
    expect(claimRegion('US')).toBe(true);
    expect(claimRegion('EU')).toBe(false);
    expect(regionAvailable('US')).toBe(true);
    expect(regionAvailable('EU')).toBe(false);
  });

  it('names the region in the message', () => {
    expect(regionConflictMessage('EU')).toBe(
      'This model is in the EU region. The viewer supports one region per page.',
    );
  });
});
