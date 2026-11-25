import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IconButton } from './IconButton.js';
import { Tooltip, TooltipPopup, TooltipTrigger } from './Tooltip.js';

describe('Tooltip', () => {
  it('shows its text when the trigger takes keyboard focus and hides on blur', async () => {
    render(
      <Tooltip>
        <TooltipTrigger>Refresh</TooltipTrigger>
        <TooltipPopup>Reload the list</TooltipPopup>
      </Tooltip>,
    );
    const trigger = screen.getByRole('button', { name: 'Refresh' });
    expect(trigger).toHaveAttribute('data-slot', 'tooltip-trigger');
    expect(screen.queryByText('Reload the list')).toBeNull();
    await act(async () => {
      trigger.focus();
      fireEvent.focus(trigger);
    });
    const popup = await screen.findByText('Reload the list');
    expect(popup).toHaveAttribute('data-slot', 'tooltip-popup');
    expect(popup).toHaveClass('bg-surface-raised');
    await act(async () => {
      fireEvent.blur(trigger);
      trigger.blur();
    });
  });

  it('gives an IconButton its label as a tooltip without changing its name or slot', async () => {
    render(<IconButton label="Close" tooltip />);
    const button = screen.getByRole('button', { name: 'Close' });
    expect(button).toHaveAttribute('data-slot', 'icon-button');
    expect(button).not.toHaveAttribute('title');
    await act(async () => {
      button.focus();
      fireEvent.focus(button);
    });
    expect(await screen.findByText('Close')).toHaveAttribute(
      'data-slot',
      'tooltip-popup',
    );
  });

  it('renders a plain IconButton when the tooltip is off', () => {
    render(<IconButton label="Close" />);
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
    expect(document.querySelector('[data-slot="tooltip-popup"]')).toBeNull();
  });
});
