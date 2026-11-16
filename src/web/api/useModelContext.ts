import { useEffect, useMemo } from 'react';
import { type ModelContext, parseModelContext } from './modelContext.js';
import { hasModelContext, recallModel, rememberModel } from './modelStore.js';

export function useModelContext(
  urn: string | undefined,
  search: Record<string, unknown>,
): ModelContext {
  const fromSearch = useMemo(() => parseModelContext(search), [search]);
  const explicit = hasModelContext(fromSearch);

  useEffect(() => {
    if (urn && explicit) {
      rememberModel(urn, fromSearch);
    }
  }, [urn, explicit, fromSearch]);

  return useMemo(() => {
    if (explicit || !urn) {
      return fromSearch;
    }
    return recallModel(urn) ?? fromSearch;
  }, [urn, explicit, fromSearch]);
}
