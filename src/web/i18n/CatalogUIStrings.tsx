import { type ReactNode, useMemo } from 'react';
import { type UIStrings, UIStringsProvider } from '../ui/strings.js';
import type { MessageId } from './en.js';
import { translateNow, useT } from './i18n.js';

function uiStrings(t: (id: MessageId) => string): UIStrings {
  return {
    close: t('ui.close'),
    dismiss: t('ui.dismiss'),
    increase: t('ui.increase'),
    decrease: t('ui.decrease'),
    loading: t('ui.loading'),
    clear: t('ui.clear'),
    more: t('ui.more'),
  };
}

export function CatalogUIStrings({ children }: { children: ReactNode }) {
  const t = useT();
  const strings = useMemo(() => uiStrings(t), [t]);
  return <UIStringsProvider strings={strings}>{children}</UIStringsProvider>;
}

export function DetachedUIStrings({ children }: { children: ReactNode }) {
  return (
    <UIStringsProvider strings={uiStrings(translateNow)}>
      {children}
    </UIStringsProvider>
  );
}
