import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMANDS } from '../commands/registry.js';
import { ModalProvider } from '../modal/ModalContext.js';
import { MODALS } from '../modal/registry.js';
import { dismissHint, isHintDismissed } from '../onboarding/hints.js';
import { CHART_SETTINGS } from '../panels/chartSettings.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { fireEvent, render, screen, within } from '../test/render.js';
import { ThemeProvider } from '../theme/ThemeContext.js';
import { TOOLS } from '../tools/index.js';
import {
  SettingsBody,
  SettingsProvider,
  selectSettingsSection,
} from './index.js';
import { readSettings } from './settings.js';

beforeEach(() => {
  installMemoryStorage();
  selectSettingsSection(null);
});

afterEach(() => {
  window.localStorage.clear();
});

function renderBody() {
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

function section(name: string) {
  fireEvent.click(screen.getByRole('tab', { name }));
}

describe('SettingsBody', () => {
  it('holds only the app fields, nothing from a tool', () => {
    renderBody();
    const switches: (string | null)[] = [];
    for (const tab of screen.getAllByRole('tab')) {
      fireEvent.click(tab);
      switches.push(
        ...screen
          .queryAllByRole('switch')
          .map((el) => el.getAttribute('aria-label')),
      );
      for (const absent of [
        'Paint palette',
        'Table export',
        'IFC export',
        'Summary settings',
      ]) {
        expect(screen.queryByRole('heading', { name: absent })).toBeNull();
      }
      expect(screen.queryByLabelText('Density')).toBeNull();
      expect(screen.queryByLabelText('Maximum categories')).toBeNull();
    }
    expect(switches).toEqual(
      expect.arrayContaining(['Caption on snapshots', 'Quiet mode']),
    );
    expect(switches).not.toContain('Dark theme');
    expect(
      switches.filter((name) =>
        ['Paint palette', 'Table export'].includes(name ?? ''),
      ),
    ).toEqual([]);
    section('Appearance');
    expect(screen.getByLabelText('Theme')).toHaveValue('system');
    section('General');
    expect(
      screen.getByLabelText(/Warn me before the session ends/),
    ).toBeTruthy();
    section('Documents');
    expect(screen.getByLabelText('Recent models to list')).toBeTruthy();
  });

  it('offers the three text sizes, two languages and two unit systems', () => {
    renderBody();
    section('Appearance');
    expect(
      within(screen.getByLabelText('Text size') as HTMLElement)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['100%', '112%', '125%']);
    section('General');
    expect(
      within(screen.getByLabelText('Language') as HTMLElement)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['English', 'Русский']);
    expect(
      within(screen.getByLabelText('Units') as HTMLElement)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Metric', 'Imperial']);
    fireEvent.change(screen.getByLabelText('Units'), {
      target: { value: 'imperial' },
    });
    fireEvent.change(screen.getByLabelText('Language'), {
      target: { value: 'ru' },
    });
    const stored = JSON.parse(
      window.localStorage.getItem('bsh-settings-v1') ?? '{}',
    );
    expect(stored).toMatchObject({ language: 'ru', units: 'imperial' });
  });

  it('commits the numeric settings on blur and clamps them', () => {
    renderBody();
    section('General');
    const warn = screen.getByLabelText(/Warn me before the session ends/);
    expect(warn).toHaveAttribute('data-slot', 'number-field');
    fireEvent.change(warn, { target: { value: '500' } });
    fireEvent.blur(warn);
    expect(
      JSON.parse(window.localStorage.getItem('bsh-settings-v1') ?? '{}'),
    ).toMatchObject({ sessionWarnMinutes: 120 });
    fireEvent.change(warn, { target: { value: '10.5' } });
    fireEvent.blur(warn);
    expect(
      JSON.parse(window.localStorage.getItem('bsh-settings-v1') ?? '{}'),
    ).toMatchObject({ sessionWarnMinutes: 11 });
    section('Documents');
    const recents = screen.getByLabelText('Recent models to list');
    fireEvent.change(recents, { target: { value: '2.8' } });
    fireEvent.blur(recents);
    expect(
      JSON.parse(window.localStorage.getItem('bsh-settings-v1') ?? '{}'),
    ).toMatchObject({ recentsLength: 3 });
    fireEvent.change(recents, { target: { value: '99' } });
    fireEvent.blur(recents);
    expect(
      JSON.parse(window.localStorage.getItem('bsh-settings-v1') ?? '{}'),
    ).toMatchObject({ recentsLength: 20 });
  });

  it('keeps the session warning in whole minutes across a reload', () => {
    renderBody();
    section('General');
    const warn = screen.getByLabelText(/Warn me before the session ends/);
    fireEvent.change(warn, { target: { value: '2.5' } });
    fireEvent.blur(warn);
    expect(warn).toHaveValue(3);
    expect(readSettings().sessionWarnMinutes).toBe(3);
    fireEvent.change(warn, { target: { value: '0.4' } });
    fireEvent.blur(warn);
    expect(warn).toHaveValue(0);
    expect(readSettings().sessionWarnMinutes).toBe(0);
  });

  it('resets app settings to their defaults', () => {
    renderBody();
    section('Appearance');
    fireEvent.change(screen.getByLabelText('Theme'), {
      target: { value: 'light' },
    });
    section('General');
    fireEvent.click(screen.getByRole('button', { name: 'Reset settings' }));
    expect(
      screen.getByText('App settings are back to their defaults.'),
    ).toBeTruthy();
    section('Appearance');
    expect(screen.getByLabelText('Theme')).toHaveValue('system');
    expect(screen.getByLabelText('Text size')).toHaveValue('100');
  });

  it('brings dismissed hints back from Defaults', () => {
    dismissHint('panes-menu');
    renderBody();
    fireEvent.click(screen.getByRole('button', { name: 'Show hints again' }));
    expect(isHintDismissed('panes-menu')).toBe(false);
  });

  it('runs the layout reset command from the layout layer', () => {
    const run = vi.fn();
    const off = COMMANDS.register('test.layout-reset', () => [
      {
        id: 'layout.reset',
        title: 'Reset layout',
        group: 'Layout',
        run,
      },
    ]);
    try {
      renderBody();
      fireEvent.click(screen.getByRole('button', { name: 'Reset layout' }));
      expect(run).toHaveBeenCalledWith({
        openModal: expect.any(Function),
      });
      expect(
        screen.getByText('Layout reset to the default arrangement.'),
      ).toBeTruthy();
    } finally {
      off();
    }
  });

  it('shows the storage readout and clears personal data only after a confirm', () => {
    window.localStorage.setItem('bsh.saved.v1', JSON.stringify([{ id: 'x' }]));
    window.localStorage.setItem(
      'bsh.tree.view',
      JSON.stringify({ sort: 'name' }),
    );
    renderBody();
    section('Data and storage');
    const readout = screen.getByRole('list', {
      name: 'Storage use by data type',
    });
    expect(within(readout).getByText('Saved items')).toBeTruthy();
    expect(within(readout).getByText('Documents view')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Clear all local data…' }),
    );
    const group = screen.getByRole('group', {
      name: 'Confirm clearing local data',
    });
    expect(within(group).getByText(/Clear 1 personal key/)).toBeTruthy();
    fireEvent.click(
      within(group).getByRole('button', { name: 'Clear all local data' }),
    );
    expect(window.localStorage.getItem('bsh.saved.v1')).toBeNull();
    expect(window.localStorage.getItem('bsh.tree.view')).toBe(
      JSON.stringify({ sort: 'name' }),
    );
    expect(screen.getByText(/Cleared 1 key/)).toBeTruthy();
    expect(screen.getByText(/Preferences were kept/)).toBeTruthy();
  });

  it('resets preferences only when the confirm box says so', () => {
    window.localStorage.setItem(
      'bsh.tree.view',
      JSON.stringify({ sort: 'name' }),
    );
    renderBody();
    section('Data and storage');
    fireEvent.click(
      screen.getByRole('button', { name: 'Clear all local data…' }),
    );
    const group = screen.getByRole('group', {
      name: 'Confirm clearing local data',
    });
    fireEvent.click(
      within(group).getByRole('checkbox', { name: /Also reset preferences/ }),
    );
    fireEvent.click(
      within(group).getByRole('button', { name: 'Clear all local data' }),
    );
    expect(window.localStorage.getItem('bsh.tree.view')).toBeNull();
    expect(
      screen.getByText(/Preferences are back to their defaults/),
    ).toBeTruthy();
  });

  it('renders the settings window in Russian when chosen', () => {
    renderBody();
    fireEvent.change(screen.getByLabelText('Language'), {
      target: { value: 'ru' },
    });
    expect(
      within(screen.getByLabelText('Язык') as HTMLElement)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['English', 'Русский']);
    expect(screen.getByText('Настройки приложения')).toBeTruthy();
    section('Внешний вид');
    expect(screen.getByRole('heading', { name: 'Внешний вид' })).toBeTruthy();
  });

  it('offers System, Light and Dark and applies the choice', () => {
    renderBody();
    section('Appearance');
    const theme = screen.getByLabelText('Theme');
    expect(theme.tagName).toBe('SELECT');
    expect(
      within(theme as HTMLElement)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['System', 'Light', 'Dark']);
    const start = document.documentElement.dataset.theme;
    const next = start === 'dark' ? 'light' : 'dark';
    fireEvent.change(theme, { target: { value: next } });
    expect(document.documentElement.dataset.theme).toBe(next);
    fireEvent.change(theme, { target: { value: 'system' } });
    expect(document.documentElement.dataset.theme).toBe(start);
  });

  it('lists every registered tool and both panes as entry points', () => {
    renderBody();
    section('Tools and panes');
    for (const tool of TOOLS.all()) {
      expect(screen.getByRole('switch', { name: tool.title })).toBeTruthy();
      const settings = screen.queryByRole('button', {
        name: `${tool.title} settings`,
      });
      expect(settings !== null).toBe(tool.hasSettings);
    }
    expect(
      screen.getByRole('button', { name: 'Summary settings' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Dashboard settings' }),
    ).toBeTruthy();
  });

  it('switches a tool on and off from the main settings and persists it', () => {
    window.localStorage.setItem(
      'bsh.tool.paint.v1',
      JSON.stringify({ enabled: false }),
    );
    renderBody();
    section('Tools and panes');
    const paint = screen.getByRole('switch', { name: 'Paint brushes' });
    const excel = screen.getByRole('switch', { name: 'Excel export' });
    expect(paint).not.toBeChecked();
    expect(excel).toBeChecked();
    fireEvent.click(paint);
    fireEvent.click(excel);
    expect(paint).toBeChecked();
    expect(excel).not.toBeChecked();
    expect(
      JSON.parse(window.localStorage.getItem('bsh.tool.paint.v1') ?? '{}'),
    ).toMatchObject({ enabled: true });
    expect(
      JSON.parse(window.localStorage.getItem('bsh.tool.excel.v1') ?? '{}'),
    ).toMatchObject({ enabled: false });
  });

  it('offers no settings window for a tool without fields', () => {
    renderBody();
    section('Tools and panes');
    expect(
      screen.queryByRole('button', { name: 'Geometry export settings' }),
    ).toBeNull();
  });

  it.each([
    ['Paint brushes settings', 'Paint palette'],
    ['Excel export settings', 'Table export'],
    ['IFC export settings', 'Length unit'],
    ['Summary settings', 'Density'],
    ['Dashboard settings', 'Maximum categories'],
  ])('opens the %s window', (name, marker) => {
    renderBody();
    section('Tools and panes');
    fireEvent.click(screen.getByRole('button', { name }));
    const dialog = screen.getByRole('dialog', { name });
    if (marker) {
      expect(within(dialog).getByText(marker, { exact: false })).toBeTruthy();
    }
  });

  it('registers one modal per tool next to the app and pane modals', () => {
    const ids = MODALS.map((modal) => modal.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'settings',
        'summary-settings',
        'dashboard-settings',
        ...TOOLS.all()
          .filter((tool) => tool.hasSettings)
          .map((tool) => tool.modalId),
      ]),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('turns on chart patterns and the always-open data table', () => {
    renderBody();
    section('Appearance');
    fireEvent.click(screen.getByRole('switch', { name: 'Pattern fills' }));
    fireEvent.click(
      screen.getByRole('switch', { name: 'Always show the data table' }),
    );
    expect(CHART_SETTINGS.read()).toMatchObject({
      patterns: true,
      dataTable: true,
    });
  });

  it('picks the chart palette', () => {
    renderBody();
    section('Appearance');
    const palette = screen.getByLabelText('Chart palette');
    expect(
      within(palette)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([
      'Default',
      'Okabe–Ito (colour-blind safe)',
      'Viridis (colour-blind safe)',
      'High contrast',
    ]);
    fireEvent.change(palette, { target: { value: 'viridis' } });
    expect(CHART_SETTINGS.read().palette).toBe('viridis');
  });

  it('stops restoring the last session and drops the stored record', () => {
    window.localStorage.setItem(
      'bsh.models.session.v1',
      JSON.stringify({
        models: [{ urn: 'a', context: {} }],
        active: 'a',
      }),
    );
    renderBody();
    const restore = screen.getByLabelText(
      'Reopen my tabs after the browser restarts',
    );
    expect(restore).toBeChecked();
    fireEvent.click(restore);
    expect(restore).not.toBeChecked();
    expect(window.localStorage.getItem('bsh.models.session.v1')).toBeNull();
    expect(
      JSON.parse(window.localStorage.getItem('bsh-settings-v1') ?? '{}'),
    ).toMatchObject({ restoreSession: false });
  });
});
