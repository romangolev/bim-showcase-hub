import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NumberField } from './NumberField.js';

function setup(max?: number) {
  const onValueCommitted = vi.fn();
  render(
    <NumberField
      aria-label="Top values"
      value={5}
      min={1}
      max={max}
      onValueCommitted={onValueCommitted}
      className="app-narrow"
    />,
  );
  return {
    onValueCommitted,
    input: screen.getByRole('spinbutton', { name: 'Top values' }),
  };
}

describe('NumberField', () => {
  it('is a native number input with the field look', () => {
    const { input } = setup(20);
    expect(input).toHaveAttribute('data-slot', 'number-field');
    expect(input).toHaveAttribute('min', '1');
    expect(input).toHaveAttribute('max', '20');
    expect(input).toHaveValue(5);
    expect(input).toHaveClass('min-h-hit', 'app-narrow');
  });

  it('commits a whole clamped number on blur and on Enter, not while typing', () => {
    const { input, onValueCommitted } = setup(20);
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

  it('drops an empty draft and has no upper bound by default', () => {
    const { input, onValueCommitted } = setup();
    expect(input).not.toHaveAttribute('max');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onValueCommitted).not.toHaveBeenCalled();
    expect(input).toHaveValue(5);
  });
});
