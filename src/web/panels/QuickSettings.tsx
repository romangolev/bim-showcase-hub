import {
  type ReactNode,
  type RefObject,
  useId,
  useLayoutEffect,
  useRef,
} from 'react';
import { Icon } from '../components/icons.js';
import { IconButton } from '../ui/IconButton.js';
import { useAutoCompact } from './useAutoCompact.js';

export function useQuickSettings(
  ref: RefObject<HTMLElement | null>,
  choice: boolean | undefined,
  setChoice: (next: boolean | undefined) => void,
) {
  const compact = useAutoCompact(ref);
  const open = choice ?? !compact;
  const toggle = () => {
    const next = !open;
    setChoice(next === !compact ? undefined : next);
  };
  return { open, toggle };
}

export interface QuickSettingsProps {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export function QuickSettings({
  label,
  open,
  onToggle,
  children,
}: QuickSettingsProps) {
  const id = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (!open && panelRef.current?.contains(document.activeElement)) {
      toggleRef.current?.focus();
    }
  }, [open]);
  return (
    <>
      <div
        ref={panelRef}
        id={id}
        className="bsh-quick"
        data-open={open}
        inert={!open}
        aria-hidden={!open || undefined}
      >
        <div className="bsh-quick__inner">{children}</div>
      </div>
      <IconButton
        ref={toggleRef}
        className="bsh-quick__toggle"
        label={label}
        aria-expanded={open}
        aria-controls={id}
        tooltip={open ? 'Hide controls' : 'Show controls'}
        onClick={onToggle}
      >
        <Icon name="sliders" size={16} />
      </IconButton>
    </>
  );
}
