import { describe, expect, it } from 'vitest';
import { formatCount, formatDateTime } from './format.js';

describe('display formatting', () => {
  it('groups digits per language', () => {
    expect(formatCount(12345, 'en')).toBe('12,345');
    expect(formatCount(12345, 'ru').replace(/\s/g, ' ')).toBe('12 345');
  });

  it('formats dates per language', () => {
    const iso = '2026-11-20T10:00:00Z';
    expect(formatDateTime(iso, 'ru')).toMatch(/20\.11\.2026/);
    expect(formatDateTime(iso, 'en')).toMatch(/11\/20\/2026|Nov/);
  });
});
