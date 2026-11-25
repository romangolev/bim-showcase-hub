import { render } from '@testing-library/react';
import type { ReactElement, Ref } from 'react';
import { describe, expect, it } from 'vitest';
import { Button } from './Button.js';
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './Dialog.js';
import { IconButton } from './IconButton.js';
import {
  Menu,
  MenuCheckboxItem,
  MenuGroup,
  MenuGroupLabel,
  MenuHint,
  MenuInertItem,
  MenuItem,
  MenuItemIndicator,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from './Menu.js';
import {
  Popover,
  PopoverPopup,
  PopoverTitle,
  PopoverTrigger,
} from './Popover.js';
import { Tab, TabPanel, Tabs, TabsList } from './Tabs.js';
import { ToggleButton } from './ToggleButton.js';
import { Tooltip, TooltipPopup, TooltipTrigger } from './Tooltip.js';

interface ContractProps {
  className: string;
  effect: string;
  ref: Ref<never>;
  'data-probe': string;
}

interface Entry {
  file: string;
  slot: string;
  render: (props: ContractProps) => ReactElement;
}

const ENTRIES: Entry[] = [
  {
    file: 'Button',
    slot: 'button',
    render: (props) => <Button {...props}>label</Button>,
  },
  {
    file: 'Dialog',
    slot: 'dialog',
    render: (props) => (
      <Dialog onClose={() => undefined} aria-label="label" {...props} />
    ),
  },
  ...(
    [
      ['dialog-header', DialogHeader],
      ['dialog-title', DialogTitle],
      ['dialog-body', DialogBody],
      ['dialog-footer', DialogFooter],
    ] as const
  ).map(
    ([slot, Part]): Entry => ({
      file: 'Dialog',
      slot,
      render: (props) => (
        <Dialog onClose={() => undefined} aria-label="label">
          <Part {...props} />
        </Dialog>
      ),
    }),
  ),
  {
    file: 'Menu',
    slot: 'menu-trigger',
    render: (props) => (
      <Menu>
        <MenuTrigger {...props}>label</MenuTrigger>
      </Menu>
    ),
  },
  {
    file: 'Menu',
    slot: 'menu-popup',
    render: (props) => (
      <Menu open>
        <MenuPopup {...props} />
      </Menu>
    ),
  },
  ...(
    [
      ['menu-item', MenuItem],
      ['menu-checkbox-item', MenuCheckboxItem],
      ['menu-separator', MenuSeparator],
      ['menu-hint', MenuHint],
      ['menu-inert-item', MenuInertItem],
      ['menu-item-indicator', MenuItemIndicator],
    ] as const
  ).map(
    ([slot, Part]): Entry => ({
      file: 'Menu',
      slot,
      render: (props) => (
        <Menu open>
          <MenuPopup>
            <Part {...props} />
          </MenuPopup>
        </Menu>
      ),
    }),
  ),
  {
    file: 'Menu',
    slot: 'menu-group-label',
    render: (props) => (
      <Menu open>
        <MenuPopup>
          <MenuGroup>
            <MenuGroupLabel {...props}>label</MenuGroupLabel>
          </MenuGroup>
        </MenuPopup>
      </Menu>
    ),
  },
  {
    file: 'Popover',
    slot: 'popover-trigger',
    render: (props) => (
      <Popover>
        <PopoverTrigger {...props}>label</PopoverTrigger>
      </Popover>
    ),
  },
  {
    file: 'Popover',
    slot: 'popover-popup',
    render: (props) => (
      <Popover open>
        <PopoverPopup {...props} />
      </Popover>
    ),
  },
  {
    file: 'Popover',
    slot: 'popover-title',
    render: (props) => (
      <Popover open>
        <PopoverPopup>
          <PopoverTitle {...props}>label</PopoverTitle>
        </PopoverPopup>
      </Popover>
    ),
  },
  {
    file: 'Tooltip',
    slot: 'tooltip-trigger',
    render: (props) => (
      <Tooltip>
        <TooltipTrigger {...props}>label</TooltipTrigger>
      </Tooltip>
    ),
  },
  {
    file: 'Tooltip',
    slot: 'tooltip-popup',
    render: (props) => (
      <Tooltip open>
        <TooltipTrigger>label</TooltipTrigger>
        <TooltipPopup {...props}>label</TooltipPopup>
      </Tooltip>
    ),
  },
  {
    file: 'IconButton',
    slot: 'icon-button',
    render: (props) => <IconButton label="label" {...props} />,
  },
  {
    file: 'ToggleButton',
    slot: 'toggle-button',
    render: (props) => <ToggleButton {...props}>label</ToggleButton>,
  },
  {
    file: 'Tabs',
    slot: 'tabs',
    render: (props) => <Tabs defaultValue="a" {...props} />,
  },
  ...(
    [
      ['tabs-list', (props: ContractProps) => <TabsList {...props} />],
      [
        'tab',
        (props: ContractProps) => (
          <TabsList>
            <Tab value="a" {...props}>
              label
            </Tab>
          </TabsList>
        ),
      ],
      [
        'tab-panel',
        (props: ContractProps) => <TabPanel value="a" {...props} />,
      ],
    ] as const
  ).map(
    ([slot, part]): Entry => ({
      file: 'Tabs',
      slot,
      render: (props) => <Tabs defaultValue="a">{part(props)}</Tabs>,
    }),
  ),
];

describe('primitive contract', () => {
  for (const entry of ENTRIES) {
    it(`${entry.slot} has a slot, merges className, writes the effect, forwards the ref and spreads data attributes`, () => {
      const ref = { current: null as Element | null };
      render(
        entry.render({
          className: 'contract-class',
          effect: 'glow',
          ref: ref as Ref<never>,
          'data-probe': 'spread',
        }),
      );
      const element = document.querySelector(`[data-slot="${entry.slot}"]`);
      expect(element).not.toBeNull();
      expect(element).toHaveClass('contract-class');
      expect(element).toHaveAttribute('data-effect', 'glow');
      expect(element).toHaveAttribute('data-probe', 'spread');
      expect(ref.current).toBe(element);
    });

    it(`${entry.slot} writes no effect attribute by default`, () => {
      render(
        entry.render({ 'data-probe': 'plain' } as unknown as ContractProps),
      );
      const element = document.querySelector('[data-probe="plain"]');
      expect(element).toHaveAttribute('data-slot', entry.slot);
      expect(element).not.toHaveAttribute('data-effect');
    });
  }
});
