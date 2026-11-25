import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '../test/render.js';
import { ModelTintSwatch } from './ModelTintSwatch.js';

function renderSwatch(onPick = vi.fn(), onStrength = vi.fn()) {
  render(
    <>
      <button type="button">Outside</button>
      <ModelTintSwatch
        modelName="House"
        palette={['#4f8cff', '#2fbf71']}
        tint={null}
        strength={0.5}
        onPick={onPick}
        onStrength={onStrength}
        onClear={vi.fn()}
        onPaletteColor={vi.fn()}
        onResetPalette={vi.fn()}
      />
    </>,
  );
  return {
    onPick,
    onStrength,
    trigger: screen.getByRole('button', { name: 'Tint House' }),
  };
}

describe('ModelTintSwatch', () => {
  it('opens a dialog named after the model and focuses it', async () => {
    const { trigger } = renderSwatch();
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'House' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(dialog).toHaveAttribute('data-slot', 'popover-popup');
    await waitFor(() => expect(dialog).toHaveFocus());
  });

  it('closes on Escape and returns focus to the swatch', async () => {
    const { trigger } = renderSwatch();
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'House' });
    await waitFor(() => expect(dialog).toHaveFocus());
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('closes on an outside click', async () => {
    const { trigger } = renderSwatch();
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'House' })).toBeInTheDocument();
    const outside = screen.getByRole('button', { name: 'Outside' });
    fireEvent.pointerDown(outside);
    fireEvent.mouseDown(outside);
    fireEvent.click(outside);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('picks a colour and closes', async () => {
    const { onPick, trigger } = renderSwatch();
    fireEvent.click(trigger);
    fireEvent.click(
      screen.getAllByRole('button', { name: /^Tint House in / })[0] as Element,
    );
    expect(onPick).toHaveBeenCalledWith('#4f8cff');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('reports the tint strength from a labelled slider', () => {
    const { onStrength, trigger } = renderSwatch();
    fireEvent.click(trigger);
    const slider = screen.getByRole('slider', {
      name: 'Tint strength for House',
    });
    expect(slider).toHaveAttribute('data-slot', 'slider');
    expect(slider).toHaveValue('0.5');
    expect(slider.closest('label')).toBeNull();
    fireEvent.change(slider, { target: { value: '0.75' } });
    expect(onStrength).toHaveBeenCalledWith(0.75);
  });
});
