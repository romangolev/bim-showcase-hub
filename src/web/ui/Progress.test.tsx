import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Progress } from './Progress.js';

describe('Progress', () => {
  it('is a progressbar named by its label with the current value', () => {
    render(<Progress label="Export progress" value={40} />);
    const bar = screen.getByRole('progressbar', { name: 'Export progress' });
    expect(bar).toHaveAttribute('data-slot', 'progress');
    expect(bar).toHaveAttribute('aria-valuenow', '40');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(bar).toHaveAttribute('data-progressing');
    const indicator = bar.querySelector('[data-slot="progress-indicator"]');
    expect(indicator).toHaveStyle({ width: '40%' });
    expect(bar.querySelector('[data-slot="progress-track"]')).not.toBeNull();
  });

  it('scales the value to a custom maximum', () => {
    render(<Progress label="Rows" value={2000} max={8000} />);
    const bar = screen.getByRole('progressbar', { name: 'Rows' });
    expect(bar).toHaveAttribute('aria-valuenow', '2000');
    expect(bar).toHaveAttribute('aria-valuemax', '8000');
    expect(bar.querySelector('[data-slot="progress-indicator"]')).toHaveStyle({
      width: '25%',
    });
  });

  it('is indeterminate without a value and takes its value text as a prop', () => {
    const { rerender } = render(<Progress label="Loading" />);
    const bar = screen.getByRole('progressbar', { name: 'Loading' });
    expect(bar).toHaveAttribute('data-indeterminate');
    expect(bar).not.toHaveAttribute('aria-valuenow');
    expect(bar).not.toHaveAttribute('aria-valuetext');
    rerender(<Progress label="Loading" valueText="Waiting" />);
    expect(bar).toHaveAttribute('aria-valuetext', 'Waiting');
  });

  it('marks a full bar complete and merges a caller class', () => {
    render(<Progress label="Done" value={100} className="task-bar" />);
    const bar = screen.getByRole('progressbar', { name: 'Done' });
    expect(bar).toHaveAttribute('data-complete');
    expect(bar).toHaveClass('task-bar', 'w-full');
  });
});
