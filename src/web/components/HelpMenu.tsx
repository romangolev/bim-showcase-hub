import { useT } from '../i18n/i18n.js';
import { useModal } from '../modal/index.js';
import { Icon } from './icons.js';
import { Menu, type MenuEntry } from './Menu.js';

export const DOCS_URL =
  'https://github.com/romangolev/bim-showcase-hub/tree/main/docs';

export function HelpMenu({ extra = () => [] }: { extra?: () => MenuEntry[] }) {
  const modal = useModal();
  const t = useT();
  return (
    <Menu
      label={t('topbar.help')}
      title={t('topbar.help')}
      trigger={<Icon name="help" size={18} />}
      triggerClassName="icon-button"
      align="end"
      items={() => [
        {
          id: 'help-shortcuts',
          label: t('help.shortcuts'),
          onSelect: () => modal.open('help.shortcuts'),
        },
        {
          id: 'help-docs',
          label: t('help.docs'),
          description: t('help.opensInNewTab'),
          onSelect: () => {
            window.open(DOCS_URL, '_blank', 'noopener');
          },
        },
        ...extra(),
      ]}
    />
  );
}
