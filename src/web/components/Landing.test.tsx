import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createTestClient } from '../test/mockApi.js';
import { Landing } from './Landing.js';

function renderLanding() {
  render(
    <QueryClientProvider client={createTestClient()}>
      <Landing />
    </QueryClientProvider>,
  );
}

describe('Landing', () => {
  it('exposes the feature tabs with roving keyboard focus', () => {
    renderLanding();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      expect.stringContaining('Browse'),
      expect.stringContaining('Inspect'),
      expect.stringContaining('Export'),
    ]);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveAttribute('tabindex', '-1');
    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveAttribute('aria-labelledby', tabs[0]?.id);

    fireEvent.keyDown(tabs[0] as HTMLElement, { key: 'ArrowDown' });
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveFocus();
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'aria-labelledby',
      tabs[1]?.id,
    );

    fireEvent.keyDown(tabs[1] as HTMLElement, { key: 'End' });
    expect(tabs[2]).toHaveFocus();
    fireEvent.keyDown(tabs[2] as HTMLElement, { key: 'ArrowDown' });
    expect(tabs[0]).toHaveFocus();
  });

  it('links to the APS developer site and the repository', () => {
    renderLanding();
    const footer = screen.getByRole('contentinfo');
    expect(
      footer.querySelector('a[href="https://aps.autodesk.com"]'),
    ).not.toBeNull();
    expect(
      footer.querySelector(
        'a[href="https://github.com/romangolev/bim-showcase-hub"]',
      ),
    ).not.toBeNull();
  });
});
