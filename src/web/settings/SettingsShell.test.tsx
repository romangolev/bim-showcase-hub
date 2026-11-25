import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appCommands } from '../commands/appCommandList.js';
import { ModalProvider, useModal } from '../modal/ModalContext.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { act, fireEvent, render, screen, waitFor } from '../test/render.js';
import { ThemeProvider } from '../theme/ThemeContext.js';
import { TOOLS } from '../tools/index.js';
import {
  listSettingsSections,
  openSettingsSection,
  registerSettingsSection,
  SettingsBody,
  SettingsProvider,
  selectSettingsSection,
} from './index.js';

beforeEach(() => {
  installMemoryStorage();
  selectSettingsSection(null);
});

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

function renderShell() {
  return render(
    <SettingsProvider>
      <ThemeProvider>
        <ModalProvider>
          <SettingsBody />
        </ModalProvider>
      </ThemeProvider>
    </SettingsProvider>,
  );
}

function narrowScreen() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })),
  );
}

function selectedTab() {
  return screen.getByRole('tab', { selected: true });
}

describe('SettingsShell', () => {
  it('lists every registered section as a tab and opens on the first', () => {
    renderShell();
    const labels = listSettingsSections().map((section) => section.label());
    expect(labels).toEqual([
      'General',
      'Appearance',
      'Documents',
      'Tools and panes',
      'Shortcuts',
      'Notifications',
      'Data and storage',
    ]);
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(
      labels,
    );
    expect(screen.getByRole('tablist')).toHaveAttribute(
      'aria-orientation',
      'vertical',
    );
    expect(selectedTab()).toHaveTextContent('General');
    expect(selectedTab()).toHaveAttribute('autofocus');
    expect(selectedTab()).toHaveAttribute(
      'aria-controls',
      screen.getByRole('tabpanel', { name: 'General' }).id,
    );
  });

  it('shows the options of the selected section only', () => {
    renderShell();
    expect(screen.getByLabelText('Language')).toBeTruthy();
    expect(screen.queryByLabelText('Theme')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Appearance' }));
    expect(screen.getByRole('tabpanel', { name: 'Appearance' })).toBeTruthy();
    expect(screen.getByLabelText('Theme')).toBeTruthy();
    expect(screen.queryByLabelText('Language')).toBeNull();
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  });

  it('moves with the arrow keys, Home and End', async () => {
    renderShell();
    const press = async (key: string, label: string) => {
      fireEvent.keyDown(document.activeElement as HTMLElement, { key });
      await waitFor(() => expect(selectedTab()).toHaveTextContent(label));
      expect(selectedTab()).toHaveFocus();
    };
    selectedTab().focus();
    await press('ArrowDown', 'Appearance');
    expect(selectedTab()).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'General' })).toHaveAttribute(
      'tabindex',
      '-1',
    );
    await press('End', 'Data and storage');
    await press('ArrowDown', 'General');
    await press('ArrowUp', 'Data and storage');
    await press('Home', 'General');
    expect(screen.getByLabelText('Language')).toBeTruthy();
  });

  it('drills into a section and back on a narrow screen', () => {
    narrowScreen();
    renderShell();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByLabelText('Language')).toBeNull();
    const list = screen.getByRole('navigation', { name: 'Settings sections' });
    expect(list.querySelectorAll('button')).toHaveLength(
      listSettingsSections().length,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.getByRole('region', { name: 'Appearance' })).toBeTruthy();
    expect(screen.getByLabelText('Theme')).toBeTruthy();
    const back = screen.getByRole('button', { name: 'Back' });
    expect(back).toHaveFocus();
    fireEvent.click(back);
    expect(screen.queryByLabelText('Theme')).toBeNull();
    expect(screen.getByRole('button', { name: 'Appearance' })).toHaveFocus();
  });

  it('shows the section list after a wide click when the window narrows', () => {
    let matches = false;
    const notify = new Set<() => void>();
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        get matches() {
          return matches;
        },
        addEventListener: (_: string, fn: () => void) => notify.add(fn),
        removeEventListener: (_: string, fn: () => void) => notify.delete(fn),
      })),
    );
    renderShell();
    fireEvent.click(screen.getByRole('tab', { name: 'Appearance' }));
    act(() => {
      matches = true;
      for (const fn of notify) fn();
    });
    expect(
      screen.getByRole('navigation', { name: 'Settings sections' }),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Theme')).toBeNull();
  });

  it('shows a section registered from outside the shell', () => {
    const off = registerSettingsSection({
      id: 'test-extra',
      label: () => 'Extra',
      icon: 'star',
      Body: () => <p>Extra options</p>,
    });
    try {
      renderShell();
      fireEvent.click(screen.getByRole('tab', { name: 'Extra' }));
      expect(screen.getByText('Extra options')).toBeTruthy();
      expect(
        appCommands({
          theme: 'dark',
          toggleTheme: () => undefined,
          signedIn: true,
          signingOut: false,
          signOut: () => undefined,
        }).map((command) => command.id),
      ).toContain('settings.section.test-extra');
    } finally {
      off();
    }
    expect(
      listSettingsSections().some((section) => section.id === 'test-extra'),
    ).toBe(false);
  });

  it('opens at the section a deep link names', () => {
    openSettingsSection('data');
    renderShell();
    expect(selectedTab()).toHaveTextContent('Data and storage');
    expect(
      screen.getByRole('button', { name: 'Export saved items' }),
    ).toBeTruthy();
    act(() => openSettingsSection('notifications'));
    expect(selectedTab()).toHaveTextContent('Notifications');
    expect(screen.getByLabelText('Toast position')).toBeTruthy();
  });

  it('falls back to the first section for an unknown deep link', () => {
    openSettingsSection('nope');
    renderShell();
    expect(selectedTab()).toHaveTextContent('General');
  });

  it('opens the section of a palette command, drilled in when narrow', () => {
    narrowScreen();
    const openModal = vi.fn();
    const command = appCommands({
      theme: 'dark',
      toggleTheme: () => undefined,
      signedIn: true,
      signingOut: false,
      signOut: () => undefined,
    }).find((item) => item.id === 'settings.section.shortcuts');
    expect(command?.title).toBe('Settings: Shortcuts');
    command?.run({ openModal });
    expect(openModal).toHaveBeenCalledWith('settings');
    const { unmount } = renderShell();
    expect(screen.getByRole('region', { name: 'Shortcuts' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Reset all shortcuts' }),
    ).toBeTruthy();
    unmount();
    renderShell();
    expect(
      screen.getByRole('navigation', { name: 'Settings sections' }),
    ).toBeTruthy();
  });

  it.each([
    ['wide', false],
    ['narrow', true],
  ])(
    'leads back to Settings on Tools only from the main settings (%s)',
    (_, narrow) => {
      if (narrow) narrowScreen();
      const paint = TOOLS.all().find((tool) => tool.id === 'paint');
      function Open({ id }: { id: string }) {
        const modal = useModal();
        return (
          <button type="button" onClick={() => modal.open(id)}>
            Open {id}
          </button>
        );
      }
      render(
        <SettingsProvider>
          <ThemeProvider>
            <ModalProvider>
              <Open id="settings" />
              <Open id={paint?.modalId ?? ''} />
            </ModalProvider>
          </ThemeProvider>
        </SettingsProvider>,
      );
      const back = () =>
        screen.queryByRole('button', { name: 'Back to Settings' });

      fireEvent.click(screen.getByText(`Open ${paint?.modalId}`));
      expect(
        screen.getByRole('dialog', { name: 'Paint brushes settings' }),
      ).toBeTruthy();
      expect(back()).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));

      fireEvent.click(screen.getByText('Open settings'));
      fireEvent.click(
        screen.getByRole(narrow ? 'button' : 'tab', {
          name: 'Tools and panes',
        }),
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'Paint brushes settings' }),
      );
      expect(
        screen.getByRole('dialog', { name: 'Paint brushes settings' }),
      ).toBeTruthy();
      fireEvent.click(back() as HTMLElement);
      expect(screen.getByRole('dialog', { name: 'Settings' })).toBeTruthy();
      expect(
        screen.getByRole(narrow ? 'region' : 'tabpanel', {
          name: 'Tools and panes',
        }),
      ).toBeTruthy();
      expect(
        screen.getByRole('button', { name: 'Paint brushes settings' }),
      ).toBeTruthy();
      expect(back()).toBeNull();

      fireEvent.click(
        screen.getByRole('button', { name: 'Paint brushes settings' }),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(screen.queryByRole('dialog')).toBeNull();
    },
  );
});
