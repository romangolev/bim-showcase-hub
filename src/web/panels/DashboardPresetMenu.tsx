import { useState } from 'react';
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
  saveDashboardPreset,
  withCharts,
} from '../extensions/dashboardPresets.js';
import { useSavedKindItems } from '../store/savedKinds.js';
import { notify } from '../tasks/notifications.js';
import { promptPresetName } from './PresetNamePrompt.js';

interface DashboardPresetMenuProps {
  view: DashboardView;
  apply: (view: DashboardView) => void;
}

const SAVE_FAILED =
  'Could not save the preset. Delete some saved items and try again.';

export function DashboardPresetMenu({ view, apply }: DashboardPresetMenuProps) {
  const saved = useSavedKindItems(DASHBOARD_USER_PRESETS);
  const [lastId, setLastId] = useState<string | null>(null);
  const current = chartsKey(view.charts);
  const own = saved.map((item) => ({
    item,
    next: sanitizeDashboardView(item.data),
  }));
  const ownMatch = own.find(({ next }) => chartsKey(next.charts) === current);
  const builtin = matchingPreset(view.charts);
  const target = ownMatch?.item ?? saved.find((item) => item.id === lastId);
  const label = builtin?.label ?? ownMatch?.item.name ?? 'Custom';

  const saveAs = () =>
    promptPresetName({
      title: 'Save current as preset',
      confirm: 'Save preset',
      onSubmit: (name) => {
        const item = DASHBOARD_USER_PRESETS.save(name, view);
        if (item) setLastId(item.id);
        else notify(SAVE_FAILED, { tone: 'error' });
      },
    });

  const entries = (): MenuEntry[] => [
    ...DASHBOARD_PRESETS.map((preset) => ({
      id: `builtin:${preset.id}`,
      label: preset.label,
      checked: builtin?.id === preset.id,
      onSelect: () => {
        setLastId(null);
        apply(withCharts(view, presetChartList(preset)));
      },
    })),
    ...(own.length > 0
      ? [
          { kind: 'separator' as const, id: 'mine' },
          ...own.map(({ item, next }) => ({
            id: `mine:${item.id}`,
            label: item.name,
            checked: ownMatch?.item.id === item.id,
            onSelect: () => {
              setLastId(item.id);
              apply(next);
            },
          })),
        ]
      : []),
    { kind: 'separator' as const, id: 'actions-sep' },
    {
      id: 'save-as',
      label: 'Save current as preset...',
      icon: 'plus' as const,
      onSelect: saveAs,
    },
    ...(target
      ? [
          {
            id: 'update',
            label: `Update "${target.name}" with current charts`,
            onSelect: () => {
              if (!saveDashboardPreset(target.name, view, target.id)) {
                notify(SAVE_FAILED, { tone: 'error' });
              }
            },
          },
          {
            id: 'rename',
            label: 'Rename...',
            onSelect: () =>
              promptPresetName({
                title: 'Rename preset',
                confirm: 'Rename',
                initial: target.name,
                onSubmit: (name) => {
                  if (!DASHBOARD_USER_PRESETS.rename(target.id, name)) {
                    notify('Could not rename the preset.', { tone: 'error' });
                  }
                },
              }),
          },
          {
            id: 'delete',
            label: 'Delete',
            onSelect: () => {
              if (DASHBOARD_USER_PRESETS.remove(target.id)) {
                setLastId(null);
              } else {
                notify('Could not delete the preset.', { tone: 'error' });
              }
            },
          },
        ]
      : []),
  ];

  return (
    <Menu
      label="Dashboard presets"
      triggerVariant="button"
      triggerClassName="bsh-presets-trigger"
      align="start"
      trigger={
        <>
          <Icon name="layers" size={13} />
          <span>Presets</span>
          <span className="bsh-presets-trigger__value" title={label}>
            {label}
          </span>
          <Icon name="chevron" size={11} />
        </>
      }
      items={entries}
    />
  );
}
