import { Icon } from './icons.js';
import { Menu, type MenuEntry } from './Menu.js';

export type PaneAction = MenuEntry;

export interface PaneActionsMenuProps {
  label: string;
  actions: () => PaneAction[];
  title?: string;
  text?: string;
  align?: 'start' | 'end';
}

export function PaneActionsMenu({
  label,
  actions,
  title,
  text,
  align,
}: PaneActionsMenuProps) {
  return (
    <Menu
      label={label}
      title={title}
      align={align}
      triggerVariant={text ? 'button' : 'icon'}
      trigger={
        <>
          <Icon name="more" size={16} />
          {text ? <span>{text}</span> : null}
        </>
      }
      items={actions}
    />
  );
}
