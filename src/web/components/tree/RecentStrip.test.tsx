import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PINNED_KEY, rememberModel } from '../../api/modelStore.js';
import {
  SETTINGS_STORAGE_KEY,
  SettingsProvider,
} from '../../settings/index.js';
import { installMemoryStorage } from '../../test/mockApi.js';
import { RecentStrip, sanitizePins } from './RecentStrip.js';

beforeEach(() => {
  installMemoryStorage();
  rememberModel('urn-a', { file: 'A.rvt', v: '1', crumbs: ['Hub', 'A.rvt'] });
  rememberModel('urn-b', { file: 'B.rvt', v: '2', crumbs: ['Hub', 'B.rvt'] });
});

afterEach(() => {
  window.localStorage.clear();
});

function renderStrip(onOpen = vi.fn()) {
  render(
    <SettingsProvider>
      <RecentStrip onOpen={onOpen} />
    </SettingsProvider>,
  );
  return onOpen;
}

describe('RecentStrip', () => {
  it('lists recent models newest first and opens one with its context', () => {
    const onOpen = renderStrip();
    const recent = screen.getByRole('region', { name: 'Recent' });
    const buttons = within(recent).getAllByRole('button', {
      name: /^[AB]\.rvt/,
    });
    expect(buttons.map((b) => b.textContent)).toEqual([
      'B.rvt · 2',
      'A.rvt · 1',
    ]);
    fireEvent.click(buttons[1] as HTMLElement);
    expect(onOpen).toHaveBeenCalledWith(
      'urn-a',
      expect.objectContaining({ file: 'A.rvt', v: '1' }),
    );
  });

  it('pins a model into its own section and persists it', () => {
    renderStrip();
    fireEvent.click(screen.getByRole('button', { name: 'Pin A.rvt · 1' }));
    const pinned = screen.getByRole('region', { name: 'Pinned' });
    expect(within(pinned).getByText('A.rvt · 1')).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Recent' })).queryByText(
        'A.rvt · 1',
      ),
    ).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(PINNED_KEY) ?? '[]')).toEqual(
      [expect.objectContaining({ urn: 'urn-a', file: 'A.rvt', v: '1' })],
    );
  });

  it('keeps a pinned model listed when it left the recents', () => {
    window.localStorage.setItem(PINNED_KEY, JSON.stringify(['urn-gone']));
    renderStrip();
    expect(
      within(screen.getByRole('region', { name: 'Pinned' })).getAllByRole(
        'button',
      ),
    ).toHaveLength(2);
  });

  it('opens a pin that left the recents with the context stored in the pin', () => {
    window.localStorage.setItem(
      PINNED_KEY,
      JSON.stringify([{ urn: 'urn-gone', file: 'Gone.rvt', v: '3' }]),
    );
    const onOpen = renderStrip();
    fireEvent.click(screen.getByRole('button', { name: 'Gone.rvt · 3' }));
    expect(onOpen).toHaveBeenCalledWith(
      'urn-gone',
      expect.objectContaining({ file: 'Gone.rvt', v: '3' }),
    );
  });

  it('honours the recents length setting', () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ recentsLength: 1 }),
    );
    renderStrip();
    expect(
      within(screen.getByRole('region', { name: 'Recent' })).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(1);
  });

  it('drops junk pins', () => {
    expect(sanitizePins(['a', 'a', 3, '', { urn: 'b', file: 'B' }])).toEqual([
      { urn: 'a' },
      { urn: 'b', file: 'B' },
    ]);
    expect(sanitizePins('x')).toEqual([]);
  });
});
