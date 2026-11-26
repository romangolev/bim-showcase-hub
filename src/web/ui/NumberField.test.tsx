import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NumberField, type NumberFieldProps } from './NumberField.js';

function setup(props: Partial<NumberFieldProps> = {}) {
  const onValueCommitted = vi.fn();
  const onDraftChange = vi.fn();
  const view = render(
    <NumberField
      aria-label="Top values"
      value={5}
      min={1}
      max={20}
      onValueCommitted={onValueCommitted}
      onDraftChange={onDraftChange}
      className="app-narrow"
      {...props}
    />,
  );
  return {
    onValueCommitted,
    onDraftChange,
    view,
    input: screen.getByRole('spinbutton', { name: 'Top values' }),
  };
}

describe('NumberField', () => {
  it('is a native number input with the field look', () => {
    const { input } = setup();
    expect(input).toHaveAttribute('data-slot', 'number-field');
    expect(input).toHaveAttribute('min', '1');
    expect(input).toHaveAttribute('max', '20');
    expect(input).toHaveValue(5);
    expect(input).toHaveClass('min-h-hit', 'app-narrow');
  });

  it('commits a whole clamped number on blur and on Enter, not while typing', () => {
    const { input, onValueCommitted } = setup();
    fireEvent.change(input, { target: { value: '7.9' } });
    expect(onValueCommitted).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onValueCommitted).toHaveBeenLastCalledWith(7);
    fireEvent.change(input, { target: { value: '99' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onValueCommitted).toHaveBeenLastCalledWith(20);
    fireEvent.change(input, { target: { value: '-3' } });
    fireEvent.blur(input);
    expect(onValueCommitted).toHaveBeenLastCalledWith(1);
  });

  it('keeps decimals when the field is not an integer', () => {
    const { input, onValueCommitted } = setup({
      integer: false,
      min: Number.MIN_SAFE_INTEGER,
    });
    fireEvent.change(input, { target: { value: '0.5' } });
    fireEvent.blur(input);
    expect(onValueCommitted).toHaveBeenLastCalledWith(0.5);
    fireEvent.change(input, { target: { value: '-2.25' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onValueCommitted).toHaveBeenLastCalledWith(-2.25);
    expect(input).toHaveAttribute('step', 'any');
  });

  it('rounds to the nearest integer when asked', () => {
    const { input, onValueCommitted } = setup({ round: 'nearest' });
    fireEvent.change(input, { target: { value: '2.8' } });
    fireEvent.blur(input);
    expect(onValueCommitted).toHaveBeenLastCalledWith(3);
    fireEvent.change(input, { target: { value: '2.2' } });
    fireEvent.blur(input);
    expect(onValueCommitted).toHaveBeenLastCalledWith(2);
  });

  it('reports the draft as it would commit', () => {
    const { input, onDraftChange } = setup();
    fireEvent.change(input, { target: { value: '7.9' } });
    expect(onDraftChange).toHaveBeenLastCalledWith(7);
    fireEvent.change(input, { target: { value: '' } });
    expect(onDraftChange).toHaveBeenLastCalledWith(null);
  });

  it('commits the fallback for an empty or invalid draft when one is given', () => {
    const { input, onValueCommitted, onDraftChange } = setup({
      emptyValue: 2,
    });
    fireEvent.change(input, { target: { value: '' } });
    expect(onDraftChange).toHaveBeenLastCalledWith(2);
    fireEvent.blur(input);
    expect(onValueCommitted).toHaveBeenLastCalledWith(2);
    fireEvent.change(input, { target: { value: 'nope' } });
    fireEvent.blur(input);
    expect(onValueCommitted).toHaveBeenLastCalledWith(2);
  });

  it('restores the prior text after an empty draft without a fallback', () => {
    const { input, onValueCommitted } = setup({ max: undefined });
    expect(input).not.toHaveAttribute('max');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onValueCommitted).not.toHaveBeenCalled();
    expect(input).toHaveValue(5);
  });

  it('follows an external value while not editing and keeps a draft while editing', () => {
    const { input, view } = setup();
    view.rerender(
      <NumberField
        aria-label="Top values"
        value={9}
        min={1}
        max={20}
        onValueCommitted={() => undefined}
      />,
    );
    expect(input).toHaveValue(9);
    fireEvent.change(input, { target: { value: '4' } });
    view.rerender(
      <NumberField
        aria-label="Top values"
        value={11}
        min={1}
        max={20}
        onValueCommitted={() => undefined}
      />,
    );
    expect(input).toHaveValue(4);
    fireEvent.blur(input);
    expect(input).toHaveValue(11);
  });
});
