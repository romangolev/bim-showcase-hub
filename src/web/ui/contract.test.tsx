import { render } from '@testing-library/react';
import type { ReactElement, Ref } from 'react';
import { describe, expect, it } from 'vitest';
import { Alert, AlertDescription } from './Alert.js';
import { Badge } from './Badge.js';
import { Button } from './Button.js';
import { Card, CardHeader, CardTitle } from './Card.js';
import { Checkbox } from './Checkbox.js';
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './Dialog.js';
import { Drawer, DrawerBody, DrawerHeader } from './Drawer.js';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from './Empty.js';
import {
  Field,
  FieldContent,
  FieldError,
  FieldHint,
  FieldLabel,
  FieldTitle,
} from './Field.js';
import { IconButton } from './IconButton.js';
import { Input } from './Input.js';
import { Kbd } from './Kbd.js';
import { List, ListItem } from './List.js';
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
import { NumberField } from './NumberField.js';
import {
  Popover,
  PopoverPopup,
  PopoverTitle,
  PopoverTrigger,
} from './Popover.js';
import { Progress } from './Progress.js';
import { Radio, RadioGroup } from './Radio.js';
import { Select, SelectOption } from './Select.js';
import { Skeleton } from './Skeleton.js';
import { Slider } from './Slider.js';
import { Spinner } from './Spinner.js';
import { Switch } from './Switch.js';
import { Tab, TabPanel, Tabs, TabsList } from './Tabs.js';
import { Textarea } from './Textarea.js';
import { Toast, Toaster } from './Toast.js';
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
  {
    file: 'Badge',
    slot: 'badge',
    render: (props) => <Badge {...props}>label</Badge>,
  },
  {
    file: 'Kbd',
    slot: 'kbd',
    render: (props) => <Kbd {...props}>label</Kbd>,
  },
  {
    file: 'Spinner',
    slot: 'spinner',
    render: (props) => <Spinner {...props} />,
  },
  ...(
    [
      ['card', Card],
      ['card-header', CardHeader],
      ['card-title', CardTitle],
    ] as const
  ).map(
    ([slot, Part]): Entry => ({
      file: 'Card',
      slot,
      render: (props) => <Part {...props} />,
    }),
  ),
  ...(
    [
      ['drawer', Drawer],
      ['drawer-header', DrawerHeader],
      ['drawer-body', DrawerBody],
    ] as const
  ).map(
    ([slot, Part]): Entry => ({
      file: 'Drawer',
      slot,
      render: (props) => <Part {...props} />,
    }),
  ),
  ...(
    [
      ['empty', Empty],
      ['empty-media', EmptyMedia],
      ['empty-content', EmptyContent],
      ['empty-title', EmptyTitle],
      ['empty-description', EmptyDescription],
    ] as const
  ).map(
    ([slot, Part]): Entry => ({
      file: 'Empty',
      slot,
      render: (props) => <Part {...props} />,
    }),
  ),
  {
    file: 'Skeleton',
    slot: 'skeleton',
    render: (props) => <Skeleton {...props} />,
  },
  ...(
    [
      ['alert', Alert],
      ['alert-description', AlertDescription],
    ] as const
  ).map(
    ([slot, Part]): Entry => ({
      file: 'Alert',
      slot,
      render: (props) => <Part {...props} />,
    }),
  ),
  {
    file: 'List',
    slot: 'list',
    render: (props) => <List {...props} />,
  },
  {
    file: 'List',
    slot: 'list-item',
    render: (props) => (
      <ul>
        <ListItem {...props} />
      </ul>
    ),
  },
  ...(
    [
      ['field', Field],
      ['field-label', FieldLabel],
      ['field-content', FieldContent],
      ['field-title', FieldTitle],
      ['field-hint', FieldHint],
      ['field-error', FieldError],
    ] as const
  ).map(
    ([slot, Part]): Entry => ({
      file: 'Field',
      slot,
      render: (props) => <Part {...props}>label</Part>,
    }),
  ),
  {
    file: 'Input',
    slot: 'input',
    render: (props) => <Input aria-label="label" {...props} />,
  },
  {
    file: 'Textarea',
    slot: 'textarea',
    render: (props) => <Textarea aria-label="label" {...props} />,
  },
  {
    file: 'Switch',
    slot: 'switch',
    render: (props) => <Switch aria-label="label" {...props} />,
  },
  {
    file: 'Checkbox',
    slot: 'checkbox',
    render: (props) => <Checkbox aria-label="label" {...props} />,
  },
  {
    file: 'Radio',
    slot: 'radio',
    render: (props) => <Radio aria-label="label" {...props} />,
  },
  {
    file: 'Radio',
    slot: 'radio-group',
    render: (props) => <RadioGroup aria-label="label" {...props} />,
  },
  {
    file: 'NumberField',
    slot: 'number-field',
    render: (props) => (
      <NumberField
        aria-label="label"
        value={1}
        min={0}
        onValueCommitted={() => undefined}
        {...props}
      />
    ),
  },
  {
    file: 'Select',
    slot: 'select',
    render: (props) => <Select aria-label="label" {...props} />,
  },
  {
    file: 'Select',
    slot: 'select-option',
    render: (props) => (
      <Select aria-label="label">
        <SelectOption {...props}>label</SelectOption>
      </Select>
    ),
  },
  {
    file: 'Slider',
    slot: 'slider',
    render: (props) => <Slider aria-label="label" {...props} />,
  {
    file: 'Progress',
    slot: 'progress',
    render: (props) => <Progress label="label" value={50} {...props} />,
  },
  {
    file: 'Toast',
    slot: 'toast',
    render: (props) => <Toast title="label" {...props} />,
  },
  {
    file: 'Toast',
    slot: 'toaster',
    render: (props) => <Toaster label="label" {...props} />,
  },
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
