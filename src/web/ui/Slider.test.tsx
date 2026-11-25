import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Slider } from './Slider.js';

describe('Slider', () => {
  it('is a native range input that reports a number', () => {
    const onValueChange = vi.fn();
    render(
      <Slider
        aria-label="Intensity"
        min={0}
        max={1}
        step={0.05}
        value={0.5}
        onValueChange={onValueChange}
        className="app-wide"
      />,
    );
    const slider = screen.getByRole('slider', { name: 'Intensity' });
    expect(slider).toHaveAttribute('type', 'range');
    expect(slider).toHaveAttribute('data-slot', 'slider');
    expect(slider).toHaveAttribute('step', '0.05');
    expect(slider).toHaveClass('min-h-hit', 'app-wide');
    fireEvent.change(slider, { target: { value: '0.75' } });
    expect(onValueChange).toHaveBeenCalledWith(0.75);
  });

  it('honours disabled', () => {
    render(<Slider aria-label="Intensity" disabled defaultValue={1} />);
    expect(screen.getByRole('slider', { name: 'Intensity' })).toBeDisabled();
  });
});
