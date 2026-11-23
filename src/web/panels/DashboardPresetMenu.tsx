import { Icon } from '../components/icons.js';
import { Menu, type MenuEntry } from '../components/Menu.js';
import {
  chartsKey,
  DASHBOARD_PRESETS,
  DASHBOARD_USER_PRESETS,
  type DashboardView,
  matchingPreset,
  presetChartList,
  sanitizeDashboardView,
  withCharts,
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
  const current = chartsKey(view.charts);
  const own = saved.map((item) => ({
    item,
    next: sanitizeDashboardView(item.data),
  }));
  const ownMatch = own.find(({ next }) => chartsKey(next.charts) === current);
  const builtin = matchingPreset(view.charts);
  const label = builtin?.label ?? ownMatch?.item.name ?? 'Custom';

  const entries = (): MenuEntry[] => [
    ...DASHBOARD_PRESETS.map((preset) => ({
      id: `builtin:${preset.id}`,
      label: preset.label,
      checked: builtin?.id === preset.id,
      onSelect: () => apply(withCharts(view, presetChartList(preset))),
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
