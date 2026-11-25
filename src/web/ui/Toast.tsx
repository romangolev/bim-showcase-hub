import {
  Children,
  type ComponentProps,
  type CSSProperties,
  isValidElement,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
} from 'react';
import { createPortal } from 'react-dom';
import { Toaster as SonnerToaster, toast } from 'sonner';
import { cn } from './cn.js';
import type { CommonProps, Tone } from './types.js';

export type ToastTone = Tone | 'warning';

export type ToastPosition =
  | 'top-left'
  | 'top-right'
  | 'top-center'
  | 'bottom-left'
  | 'bottom-right'
  | 'bottom-center';

const iconTones: Record<ToastTone, string> = {
  neutral: 'text-fg-subtle',
  accent: 'text-accent',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

const NO_HOTKEY = ['noHotkey'];

const itemClasses =
  'focus-visible:outline-2! focus-visible:outline-offset-2! focus-visible:outline-focus!';

function isModal(dialog: Element): boolean {
  try {
    return dialog.matches(':modal');
  } catch {
    return true;
  }
}

function topLayerHost(): HTMLElement {
  const dialogs = [...document.querySelectorAll('dialog[open]')].filter(
    isModal,
  );
  const top = dialogs.at(-1) ?? document.fullscreenElement;
  return top instanceof HTMLElement ? top : document.body;
}

function subscribeTopLayer(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['open'],
  });
  document.addEventListener('fullscreenchange', onChange);
  return () => {
    observer.disconnect();
    document.removeEventListener('fullscreenchange', onChange);
  };
}

export type ToasterProps = Omit<
  ComponentProps<'div'>,
  'className' | 'children'
> &
  CommonProps & {
    label: string;
    position?: ToastPosition;
    visible?: number;
    live?: 'polite' | 'off';
    container?: HTMLElement | null;
    onDismiss?: (key: string) => void;
    children?: ReactNode;
  };

export function Toaster({
  className,
  effect,
  label,
  position = 'bottom-right',
  visible = 3,
  live = 'polite',
  container,
  onDismiss,
  children,
  ...props
}: ToasterProps) {
  const host = useSyncExternalStore(
    subscribeTopLayer,
    topLayerHost,
    () => null,
  );
  const target = container ?? host;
  const toasterId = useId();
  const shown = useRef(new Set<string>());
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!target) return;
    const next = new Set<string>();
    Children.forEach(children, (child) => {
      if (!isValidElement(child) || child.key == null) return;
      const key = String(child.key);
      next.add(key);
      toast.custom(() => child, {
        id: `${toasterId}${key}`,
        toasterId,
        duration: Number.POSITIVE_INFINITY,
        className: itemClasses,
        onDismiss: () => onDismissRef.current?.(key),
      });
    });
    for (const key of shown.current) {
      if (!next.has(key)) toast.dismiss(`${toasterId}${key}`);
    }
    shown.current = next;
  }, [children, target, toasterId]);

  if (!target) return null;
  return createPortal(
    <div
      {...props}
      data-slot="toaster"
      data-effect={effect}
      className={cn('contents', className)}
    >
      <SonnerToaster
        ref={(node) => {
          node?.setAttribute('aria-live', live);
          node?.setAttribute('aria-label', label);
        }}
        id={toasterId}
        position={position}
        visibleToasts={visible}
        expand
        hotkey={NO_HOTKEY}
        containerAriaLabel={label}
        offset="var(--space-4)"
        mobileOffset="var(--space-4)"
        style={{ '--width': 'var(--ui-toast-width)' } as CSSProperties}
      />
    </div>,
    target,
  );
}

export type ToastProps = Omit<ComponentProps<'div'>, 'className' | 'title'> &
  CommonProps & {
    tone?: ToastTone;
    icon?: ReactNode;
    title: ReactNode;
    description?: ReactNode;
  };

export function Toast({
  className,
  effect,
  tone = 'neutral',
  icon,
  title,
  description,
  children,
  ...props
}: ToastProps) {
  return (
    <div
      {...props}
      data-slot="toast"
      data-tone={tone}
      data-effect={effect}
      className={cn(
        'flex w-(--ui-toast-width) items-start gap-2 rounded-surface border border-line bg-surface p-3 font-sans text-13 text-fg-muted shadow-float',
        className,
      )}
    >
      {icon ? (
        <span
          data-slot="toast-icon"
          className={cn('inline-flex flex-none pt-px', iconTones[tone])}
        >
          {icon}
        </span>
      ) : null}
      <div data-slot="toast-content" className="min-w-0 flex-1">
        <p data-slot="toast-title" className="m-0 text-fg">
          {title}
        </p>
        {description ? (
          <p
            data-slot="toast-description"
            className="mt-0.5 mb-0 text-fg-subtle"
          >
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </div>
  );
}
