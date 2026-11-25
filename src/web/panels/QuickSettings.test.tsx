import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QuickSettings } from './QuickSettings.js';

describe('QuickSettings', () => {
  it('names its toggle and shows that name as a tooltip', async () => {
    render(
      <QuickSettings label="Summary controls" open onToggle={vi.fn()}>
        <span>Controls</span>
      </QuickSettings>,
    );
    const toggle = screen.getByRole('button', { name: 'Summary controls' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).not.toHaveAttribute('title');
    await act(async () => {
      toggle.focus();
      fireEvent.focus(toggle);
    });
    expect(await screen.findByText('Summary controls')).toHaveAttribute(
      'data-slot',
      'tooltip-popup',
    );
  });

  it('collapses its panel and makes it inert', () => {
    const onToggle = vi.fn();
    render(
      <QuickSettings
        label="Dashboard controls"
        open={false}
        onToggle={onToggle}
      >
        <button type="button">Preset</button>
      </QuickSettings>,
    );
    const toggle = screen.getByRole('button', { name: 'Dashboard controls' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const panel = toggle.parentElement?.querySelector('.bsh-quick');
    expect(panel).toHaveAttribute('inert');
    expect(panel).toHaveAttribute('data-open', 'false');
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
