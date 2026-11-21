import { describe, expect, it } from 'vitest';
import type { TreeNode } from '../../../shared/types.js';
import { installMemoryStorage } from '../../test/mockApi.js';
import {
  DOC_SEARCHES,
  matchesFilters,
  NO_FILTERS,
  sanitizeFilters,
  sanitizeSearch,
} from './deepSearch.js';

const file = (name: string, extra: Partial<TreeNode> = {}): TreeNode => ({
  id: name,
  kind: 'item',
  name,
  hasChildren: true,
  viewable: false,
  ...extra,
});

describe('matchesFilters', () => {
  it('matches names without case or accents, including Cyrillic', () => {
    expect(
      matchesFilters(file('Café-Plan.rvt'), { ...NO_FILTERS, text: 'cafe' }),
    ).toBe(true);
    expect(
      matchesFilters(file('ФАСАД.rvt'), { ...NO_FILTERS, text: 'фасад' }),
    ).toBe(true);
  });

  it('filters by type, viewable and date range', () => {
    const f = {
      ...NO_FILTERS,
      types: ['nwd'],
      viewableOnly: true,
      from: '2025-02-01',
      to: '2025-02-28',
    };
    expect(
      matchesFilters(
        file('a.nwd', {
          tipUrn: 'u',
          modifiedAt: '2025-02-28T23:00:00.000Z',
        }),
        f,
      ),
    ).toBe(true);
    expect(
      matchesFilters(
        file('a.rvt', {
          tipUrn: 'u',
          modifiedAt: '2025-02-10T00:00:00.000Z',
        }),
        f,
      ),
    ).toBe(false);
    expect(
      matchesFilters(
        file('a.nwd', { modifiedAt: '2025-02-10T00:00:00.000Z' }),
        f,
      ),
    ).toBe(false);
    expect(
      matchesFilters(
        file('a.nwd', {
          tipUrn: 'u',
          modifiedAt: '2025-03-01T00:00:00.000Z',
        }),
        f,
      ),
    ).toBe(false);
  });

  it('never matches versions and matches folders only for text alone', () => {
    const folder = { ...file('Coordination'), kind: 'folder' as const };
    const version = {
      ...file('v2: 2025 by Coordination'),
      kind: 'version' as const,
    };
    expect(matchesFilters(folder, { ...NO_FILTERS, text: 'coord' })).toBe(true);
    expect(
      matchesFilters(folder, { ...NO_FILTERS, text: 'coord', types: ['rvt'] }),
    ).toBe(false);
    expect(matchesFilters(version, { ...NO_FILTERS, text: 'coord' })).toBe(
      false,
    );
  });
});

describe('sanitizeFilters', () => {
  it('sanitizes stored filters', () => {
    expect(
      sanitizeFilters({
        types: ['RVT', 'exe', 3],
        from: 'nope',
        viewableOnly: 'yes',
      }),
    ).toEqual({ ...NO_FILTERS, types: ['rvt'] });
  });
});

describe('saved searches', () => {
  it('saves and reloads the same filters and scope', () => {
    installMemoryStorage();
    const filters = {
      ...NO_FILTERS,
      text: 'facade',
      types: ['nwd'],
      viewableOnly: true,
      from: '2025-01-01',
      scope: 'project' as const,
    };
    expect(DOC_SEARCHES.save('Facades', filters)?.data).toEqual(filters);
    expect(DOC_SEARCHES.list()[0]?.data).toEqual(filters);
    expect(DOC_SEARCHES.list()[0]?.name).toBe('Facades');
  });

  it('sanitizes an imported search with bad types and scope', () => {
    expect(
      sanitizeSearch({ types: ['EXE', 'RVT'], from: 'nope', scope: 'nope' }),
    ).toEqual({ ...NO_FILTERS, types: ['rvt'], scope: 'loaded' });
    expect(sanitizeSearch(null)).toBeNull();
  });
});
