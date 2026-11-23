import { Icon } from '../components/icons.js';
import { Menu, type MenuEntry } from '../components/Menu.js';
import {
  DASHBOARD_PRESETS,
  DASHBOARD_USER_PRESETS,
  type DashboardView,
  sanitizeDashboardView,
} from '../extensions/dashboardPresets.js';
import { useSavedKindItems } from '../store/savedKinds.js';

interface DashboardPresetMenuProps {
  view: DashboardView;
  apply: (view: DashboardView) => void;
  onBrowse?: () => void;
  browsing?: boolean;
}

export function DashboardPresetMenu({
  view,
  apply,
  onBrowse,
  browsing = false,
}: DashboardPresetMenuProps) {
  const saved = useSavedKindItems(DASHBOARD_USER_PRESETS);
  const current = JSON.stringify(sanitizeDashboardView(view));
  const own = saved.map((item) => ({
    item,
    next: sanitizeDashboardView(item.data),
  }));
  const ownMatch =
    view.preset === null
      ? own.find(({ next }) => JSON.stringify(next) === current)
      : undefined;
  const label =
    DASHBOARD_PRESETS.find((p) => p.id === view.preset)?.label ??
    ownMatch?.item.name ??
    'Single chart';

  const entries = (): MenuEntry[] => [
    {
      id: 'single',
      label: 'Single chart',
      checked: view.preset === null && !ownMatch,
      onSelect: () => apply({ ...view, preset: null }),
    },
    ...DASHBOARD_PRESETS.map((preset) => ({
      id: `builtin:${preset.id}`,
      label: preset.label,
      checked: view.preset === preset.id,
      onSelect: () => apply({ ...view, preset: preset.id }),
    })),
    ...(own.length > 0
      ? [
          { kind: 'separator' as const, id: 'mine' },
          ...own.map(({ item, next }) => ({
            id: `mine:${item.id}`,
            label: item.name,
            checked: ownMatch?.item.id === item.id,
            onSelect: () => apply(next),
          })),
        ]
      : []),
    ...(onBrowse
      ? [
          { kind: 'separator' as const, id: 'browse-sep' },
          {
            id: 'browse',
            label: browsing ? 'Hide preset gallery' : 'Browse presets...',
            onSelect: onBrowse,
          },
        ]
      : []),
  ];

  return (
    <Menu
      label="Dashboard presets"
      triggerClassName="bsh-button"
      align="start"
      trigger={
        <>
          <span>Presets: {label}</span>
          <Icon name="chevron" size={11} />
        </>
      }
      items={entries}
    />
  );
}
