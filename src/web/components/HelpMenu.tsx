import { useModal } from '../modal/index.js';
import { Icon } from './icons.js';
import { Menu, type MenuEntry } from './Menu.js';

export const DOCS_URL =
  'https://github.com/romangolev/bim-showcase-hub/tree/main/docs';

export function HelpMenu({ extra = () => [] }: { extra?: () => MenuEntry[] }) {
  const modal = useModal();
  return (
    <Menu
      label="Help"
      title="Help"
      trigger={<Icon name="help" size={18} />}
      triggerClassName="icon-button"
      align="end"
      items={() => [
        {
          id: 'help-shortcuts',
          label: 'Keyboard shortcuts',
          onSelect: () => modal.open('help.shortcuts'),
        },
        {
          id: 'help-docs',
          label: 'Documentation',
          description: 'Opens in a new tab',
          onSelect: () => {
            window.open(DOCS_URL, '_blank', 'noopener');
          },
        },
        ...extra(),
      ]}
    />
  );
}
