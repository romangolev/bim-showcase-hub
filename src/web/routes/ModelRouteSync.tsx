import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import type { ModelContext } from '../api/modelContext.js';
import { contextOf } from '../api/openModels.js';
import { useModelContext } from '../api/useModelContext.js';
import { useOpenModels, useOpenModelsStore } from '../api/useOpenModels.js';
import { useDocumentTitle } from '../components/useDocumentTitle.js';
import { useModelUrn } from '../layout/panes.js';
import { modelDocumentTitle } from './ModelPage.js';

export function ModelRouteSync() {
  const store = useOpenModelsStore();
  const state = useOpenModels();
  const navigate = useNavigate();
  const urn = useModelUrn();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const context = useModelContext(urn ?? undefined, search);
  const contextKey = JSON.stringify(context);
  const routeUrn = useRef(urn);
  routeUrn.current = urn;

  const go = useRef<(target: string | null, next: ModelContext | null) => void>(
    () => {},
  );
  go.current = (target, next) => {
    if (target) {
      void navigate({
        to: '/model/$urn',
        params: { urn: target },
        search: next ?? {},
        replace: true,
      });
    } else {
      void navigate({ to: '/', replace: true });
    }
  };

  useEffect(() => {
    if (!store) return;
    if (urn) {
      store.open(urn, JSON.parse(contextKey) as ModelContext);
      return;
    }
    const current = store.getState();
    if (current.active) {
      go.current(current.active, contextOf(current, current.active));
    }
  }, [store, urn, contextKey]);

  const seen = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const first = seen.current === undefined;
    const changed = seen.current !== state.active;
    seen.current = state.active;
    if (first || !changed || state.active === routeUrn.current) return;
    if (!state.active && !routeUrn.current) return;
    go.current(
      state.active,
      state.active ? contextOf(state, state.active) : null,
    );
  }, [state]);

  const routeWith = context.with ?? '';
  const activeWith =
    urn && state.active === urn ? (contextOf(state, urn)?.with ?? '') : '';
  const seenWith = useRef<{ route: string; store: string } | null>(null);
  useEffect(() => {
    const previous = seenWith.current;
    seenWith.current = { route: routeWith, store: activeWith };
    if (!store || !urn) return;
    const routeChanged = !previous || previous.route !== routeWith;
    const storeChanged = !previous || previous.store !== activeWith;
    const follow = routeChanged
      ? !routeWith && Boolean(activeWith)
      : storeChanged && activeWith !== routeWith;
    if (!follow) return;
    const entry = contextOf(store.getState(), urn);
    if (entry) go.current(urn, entry);
  }, [store, urn, routeWith, activeWith]);

  const activeContext = state.active ? contextOf(state, state.active) : null;
  useDocumentTitle(
    state.active
      ? modelDocumentTitle(state.active, activeContext?.file, activeContext?.v)
      : null,
  );
  return null;
}
