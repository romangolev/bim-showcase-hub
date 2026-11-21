import { BSH_KEYS, defineRecord, usePersisted } from '../storage.js';

export type HintId = 'move-panes' | 'panes-menu' | 'palette';

export const HINT_IDS: readonly HintId[] = [
  'move-panes',
  'panes-menu',
  'palette',
];

const isHintId = (value: unknown): value is HintId =>
  HINT_IDS.includes(value as HintId);

export const HINTS = defineRecord<{ dismissed: HintId[] }>({
  key: BSH_KEYS.personal.onboardingHints,
  initial: { dismissed: [] },
  sanitize: (raw) => {
    const list = (raw as { dismissed?: unknown } | null)?.dismissed;
    return {
      dismissed: Array.isArray(list) ? [...new Set(list.filter(isHintId))] : [],
    };
  },
});

export function isHintDismissed(id: HintId): boolean {
  return HINTS.read().dismissed.includes(id);
}

export function dismissHint(id: HintId): void {
  const { dismissed } = HINTS.read();
  if (!dismissed.includes(id)) HINTS.write({ dismissed: [...dismissed, id] });
}

export function resetHints(): void {
  HINTS.remove();
}

export function useHint(id: HintId): { show: boolean; dismiss: () => void } {
  const [value, setValue] = usePersisted(HINTS);
  return {
    show: !value.dismissed.includes(id),
    dismiss: () => setValue({ dismissed: [...value.dismissed, id] }),
  };
}
