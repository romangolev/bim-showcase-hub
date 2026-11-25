import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { type UIStrings, UIStringsProvider, useUIStrings } from './strings.js';

const STRINGS: UIStrings = {
  close: 'Close',
  dismiss: 'Dismiss',
  increase: 'Increase',
  decrease: 'Decrease',
  loading: 'Loading',
  clear: 'Clear',
  more: 'More',
};

function Probe() {
  return <span>{useUIStrings().close}</span>;
}

describe('UIStrings', () => {
  it('hands the provided strings to a primitive', () => {
    render(
      <UIStringsProvider strings={{ ...STRINGS, close: 'Закрыть' }}>
        <Probe />
      </UIStringsProvider>,
    );
    expect(screen.getByText('Закрыть')).toBeInTheDocument();
  });

  it('throws outside the provider, so a missing string is never silent English', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/UIStringsProvider/);
    error.mockRestore();
  });
});
