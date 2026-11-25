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
import { ToggleButton } from './ToggleButton.js';

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
    file: 'IconButton',
    slot: 'icon-button',
    render: (props) => <IconButton label="label" {...props} />,
  },
  {
    file: 'ToggleButton',
    slot: 'toggle-button',
    render: (props) => <ToggleButton {...props}>label</ToggleButton>,
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
