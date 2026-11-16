import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelPage } from './ModelPage.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ModelPage', () => {
  it('renders viewer, summary, dashboard and toolbar', () => {
    render(<ModelPage urn="abc123" />);
    expect(screen.getByRole('region', { name: 'Viewer' })).toBeInTheDocument();
    expect(
      screen.getByRole('complementary', { name: 'Model summary' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Dashboard' }),
    ).toBeInTheDocument();
    expect(screen.getByText('abc123')).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Paint tools' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
  });

  it('copies the urn to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    render(<ModelPage urn="abc123" />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy URN' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('abc123'));
    expect(await screen.findByText('URN copied')).toBeInTheDocument();
  });

  it('collapses the dashboard region', () => {
    render(<ModelPage urn="abc123" />);
    const toggle = screen.getByRole('button', { name: 'Collapse' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('Expand');
    expect(
      document.getElementById(toggle.getAttribute('aria-controls') ?? ''),
    ).not.toBeVisible();
  });
});
