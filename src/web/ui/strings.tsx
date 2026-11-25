import { createContext, type ReactNode, useContext } from 'react';

export interface UIStrings {
  close: string;
  dismiss: string;
  increase: string;
  decrease: string;
  loading: string;
  clear: string;
  more: string;
}

const UIStringsContext = createContext<UIStrings | null>(null);

export function UIStringsProvider({
  strings,
  children,
}: {
  strings: UIStrings;
  children: ReactNode;
}) {
  return (
    <UIStringsContext.Provider value={strings}>
      {children}
    </UIStringsContext.Provider>
  );
}

export function useUIStrings(): UIStrings {
  const strings = useContext(UIStringsContext);
  if (!strings) {
    throw new Error('useUIStrings must be used inside a UIStringsProvider');
  }
  return strings;
}
