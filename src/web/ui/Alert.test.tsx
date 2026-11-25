import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Alert, AlertDescription } from './Alert.js';

describe('Alert', () => {
  it('takes its role from the caller and renders a description slot', () => {
    render(
      <Alert role="note" className="app-alert">
        <AlertDescription>Press Ctrl+K</AlertDescription>
      </Alert>,
    );
    const note = screen.getByRole('note');
    expect(note).toHaveAttribute('data-slot', 'alert');
    expect(note).toHaveClass('bg-surface-raised', 'app-alert');
    expect(screen.getByText('Press Ctrl+K')).toHaveAttribute(
      'data-slot',
      'alert-description',
    );
  });
});
