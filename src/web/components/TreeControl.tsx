import { createContext, useContext } from 'react';

export interface TreeControl {
  reveal: () => void;
}

export const TreeControlContext = createContext<TreeControl | null>(null);

export function useTreeControl(): TreeControl | null {
  return useContext(TreeControlContext);
}
