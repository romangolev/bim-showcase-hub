import {
  type ComponentProps,
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
} from 'react';
import { cn } from './cn.js';
import { IconButton, type IconButtonProps } from './IconButton.js';
import { useUIStrings } from './strings.js';
import type { CommonProps } from './types.js';

const base =
  'm-auto max-h-dialog flex-col rounded-control border border-line bg-surface p-0 text-14 leading-normal text-fg shadow-float backdrop:bg-overlay open:flex';

const sizes = {
  sm: 'w-dialog-sm',
  md: 'w-dialog-md',
  lg: 'w-dialog-lg',
  xl: 'h-dialog w-dialog-xl',
  command: 'mt-dialog-top max-h-dialog-compact w-dialog-command',
};

interface DialogContextValue {
  titleId: string;
  close: () => void;
}

const DialogContext = createContext<DialogContextValue | null>(null);

function useDialog(): DialogContextValue {
  const value = useContext(DialogContext);
  if (!value) throw new Error('Dialog parts must be used inside a Dialog');
  return value;
}

export type DialogProps = Omit<
  ComponentProps<'dialog'>,
  'className' | 'open' | 'onClose'
> &
  CommonProps & {
    open?: boolean;
    onClose: () => void;
    size?: keyof typeof sizes;
  };

export function Dialog({
  className,
  effect,
  open = true,
  onClose,
  size = 'md',
  ref,
  children,
  ...props
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const openerRef = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current) {
    openerRef.current = document.activeElement as HTMLElement | null;
  }
  wasOpen.current = open;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;
    let pressedOnDialog = false;
    const onPress = (event: MouseEvent) => {
      pressedOnDialog = event.target === dialog;
    };
    const onBackdropClick = (event: MouseEvent) => {
      const closing = pressedOnDialog && event.target === dialog;
      pressedOnDialog = false;
      if (closing) onCloseRef.current();
    };
    const onNativeClose = () => {
      if (!dialog.open) onCloseRef.current();
    };
    dialog.addEventListener('mousedown', onPress);
    dialog.addEventListener('click', onBackdropClick);
    dialog.addEventListener('close', onNativeClose);
    if (!dialog.open) dialog.showModal();
    return () => {
      dialog.removeEventListener('mousedown', onPress);
      dialog.removeEventListener('click', onBackdropClick);
      dialog.removeEventListener('close', onNativeClose);
      if (dialog.open) dialog.close();
      openerRef.current?.focus();
    };
  }, [open]);

  const labelled = props['aria-label'] || props['aria-labelledby'];
  return (
    <DialogContext.Provider
      value={{ titleId, close: () => onCloseRef.current() }}
    >
      <dialog
        aria-labelledby={labelled ? undefined : titleId}
        {...props}
        ref={(node) => {
          dialogRef.current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) ref.current = node;
        }}
        data-slot="dialog"
        data-size={size}
        data-effect={effect}
        className={cn(base, sizes[size], className)}
      >
        {open ? children : null}
      </dialog>
    </DialogContext.Provider>
  );
}

type PartProps<T extends 'div' | 'header' | 'footer' | 'h2'> = Omit<
  ComponentProps<T>,
  'className'
> &
  CommonProps;

export function DialogHeader({
  className,
  effect,
  ...props
}: PartProps<'header'>) {
  return (
    <header
      {...props}
      data-slot="dialog-header"
      data-effect={effect}
      className={cn(
        'flex flex-none items-center justify-between gap-2 border-b border-line px-4 py-3',
        className,
      )}
    />
  );
}

export function DialogTitle({ className, effect, ...props }: PartProps<'h2'>) {
  const { titleId } = useDialog();
  return (
    <h2
      id={titleId}
      {...props}
      data-slot="dialog-title"
      data-effect={effect}
      className={cn('m-0 flex-1 text-16 font-strong text-fg', className)}
    />
  );
}

export function DialogBody({ className, effect, ...props }: PartProps<'div'>) {
  return (
    <div
      {...props}
      data-slot="dialog-body"
      data-effect={effect}
      className={cn(
        '@container scroll-shadow min-h-0 overflow-auto p-4',
        className,
      )}
    />
  );
}

export function DialogFooter({
  className,
  effect,
  ...props
}: PartProps<'footer'>) {
  return (
    <footer
      {...props}
      data-slot="dialog-footer"
      data-effect={effect}
      className={cn(
        'flex flex-none flex-wrap items-center justify-end gap-2 border-t border-line px-4 py-3',
        className,
      )}
    />
  );
}

export type DialogCloseProps = Omit<IconButtonProps, 'label'> & {
  label?: string;
};

export function DialogClose({ label, onClick, ...props }: DialogCloseProps) {
  const { close } = useDialog();
  const strings = useUIStrings();
  return (
    <IconButton
      {...props}
      label={label ?? strings.close}
      onClick={(event) => {
        onClick?.(event);
        close();
      }}
    />
  );
}
