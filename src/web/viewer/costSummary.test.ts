import { describe, expect, it } from 'vitest';
import { MAX_COMBINED_MODELS } from '../../shared/combined.js';
import { formatParts, summarizeCost } from './costSummary.js';

describe('cost meter', () => {
  it('sums known weights and ignores unknown ones', () => {
    expect(summarizeCost(2, [100, null, 50]).parts).toBe(150);
    expect(summarizeCost(2, [null]).parts).toBeNull();
  });

  it('warns before the last slot and at the limit', () => {
    expect(summarizeCost(3, []).warning).toBeNull();
    expect(summarizeCost(MAX_COMBINED_MODELS - 1, []).warning).toMatch(
      /One more model fits/,
    );
    expect(summarizeCost(MAX_COMBINED_MODELS, []).warning).toMatch(
      /Limit reached/,
    );
  });

  it('formats part counts compactly', () => {
    expect(formatParts(950)).toBe('950');
    expect(formatParts(12_400)).toBe('12k');
    expect(formatParts(2_540_000)).toBe('2.5M');
  });
});
