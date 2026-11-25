import { type ReactNode, useMemo } from 'react';
import { type UIStrings, UIStringsProvider } from '../ui/strings.js';
import { useT } from './i18n.js';

export function CatalogUIStrings({ children }: { children: ReactNode }) {
  const t = useT();
  const strings = useMemo<UIStrings>(
    () => ({
      close: t('ui.close'),
      dismiss: t('ui.dismiss'),
      increase: t('ui.increase'),
      decrease: t('ui.decrease'),
      loading: t('ui.loading'),
      clear: t('ui.clear'),
      more: t('ui.more'),
    }),
    [t],
  );
  return <UIStringsProvider strings={strings}>{children}</UIStringsProvider>;
}
