import { isRecord } from '../../../shared/guards.js';
import { fold } from '../../../shared/text.js';
import type { TreeNode } from '../../../shared/types.js';
import { defineSavedKind } from '../../store/savedKinds.js';
import type { SearchScope } from './treeView.js';

export const FILE_TYPES = ['rvt', 'nwd', 'nwc', 'dwg', 'ifc', 'pdf'] as const;

export interface DeepSearchFilters {
  text: string;
  types: string[];
  viewableOnly: boolean;
  from: string | null;
  to: string | null;
}

export const NO_FILTERS: DeepSearchFilters = {
  text: '',
  types: [],
  viewableOnly: false,
  from: null,
  to: null,
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const knownTypes: readonly string[] = FILE_TYPES;

function dateOf(value: unknown): string | null {
  return typeof value === 'string' && DATE.test(value) ? value : null;
}

export function sanitizeFilters(raw: unknown): DeepSearchFilters {
  const source = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<
    string,
    unknown
  >;
  const types = Array.isArray(source.types) ? source.types : [];
  return {
    text: typeof source.text === 'string' ? source.text.slice(0, 120) : '',
    types: [
      ...new Set(
        types
          .filter((entry): entry is string => typeof entry === 'string')
          .map((entry) => entry.toLowerCase())
          .filter((entry) => knownTypes.includes(entry)),
      ),
    ],
    viewableOnly: source.viewableOnly === true,
    from: dateOf(source.from),
    to: dateOf(source.to),
  };
}

export function hasFilters(filters: DeepSearchFilters): boolean {
  return (
    filters.text.trim() !== '' ||
    filters.types.length > 0 ||
    filters.viewableOnly ||
    filters.from !== null ||
    filters.to !== null
  );
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

export function matchesFilters(
  node: TreeNode,
  filters: DeepSearchFilters,
): boolean {
  if (node.kind !== 'folder' && node.kind !== 'item') return false;
  const needle = fold(filters.text.trim());
  if (needle && !fold(node.name).includes(needle)) return false;
  const narrow =
    filters.types.length > 0 ||
    filters.viewableOnly ||
    filters.from !== null ||
    filters.to !== null;
  if (!narrow) return true;
  if (node.kind !== 'item') return false;
  if (
    filters.types.length > 0 &&
    !filters.types.includes(extensionOf(node.name))
  ) {
    return false;
  }
  if (filters.viewableOnly && !node.tipUrn) return false;
  const day = node.modifiedAt?.slice(0, 10);
  if (filters.from && (!day || day < filters.from)) return false;
  if (filters.to && (!day || day > filters.to)) return false;
  return true;
}

export const DOC_SEARCH_KIND = 'doc-search';

export interface DocSearchData extends DeepSearchFilters {
  scope: SearchScope;
  [field: string]: unknown;
}

export function sanitizeSearch(raw: unknown): DocSearchData | null {
  if (!isRecord(raw)) return null;
  return {
    ...sanitizeFilters(raw),
    scope: raw.scope === 'project' ? 'project' : 'loaded',
  };
}

export const DOC_SEARCHES = defineSavedKind<DocSearchData>({
  kind: DOC_SEARCH_KIND,
  version: 1,
  label: 'Document search',
  sanitize: sanitizeSearch,
});
