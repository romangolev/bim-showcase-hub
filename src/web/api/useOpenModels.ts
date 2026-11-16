import { createContext, useContext, useSyncExternalStore } from 'react';
import {
  EMPTY_OPEN_MODELS,
  type OpenModelsState,
  type OpenModelsStore,
} from './openModels.js';

export const OpenModelsContext = createContext<OpenModelsStore | null>(null);

export function useOpenModelsStore(): OpenModelsStore | null {
  return useContext(OpenModelsContext);
}

const noop = () => () => {};
const empty = () => EMPTY_OPEN_MODELS;

export function useOpenModels(): OpenModelsState {
  const store = useContext(OpenModelsContext);
  return useSyncExternalStore(
    store?.subscribe ?? noop,
    store?.getState ?? empty,
    store?.getState ?? empty,
  );
}
