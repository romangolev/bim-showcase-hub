import type { ReactNode } from 'react';
import { Icon, type IconName } from './icons.js';
import './state-block.css';

export interface StateBlockAction {
  label: string;
  onClick: () => void;
  primary?: boolean;
}

export interface StateBlockProps {
  variant: 'loading' | 'empty' | 'error';
  title?: string;
  titleAs?: 'p' | 'h1' | 'h2' | 'h3';
  titleId?: string;
  message?: string;
  detail?: string;
  action?: StateBlockAction;
  icon?: IconName;
  rows?: number;
  compact?: boolean;
  className?: string;
  children?: ReactNode;
}

const SKELETON_WIDTHS = ['72%', '54%', '88%', '46%', '66%'];

export function StateBlock({
  variant,
  title,
  titleAs: TitleTag = 'p',
  titleId,
  message,
  detail,
  action,
  icon,
  rows = 3,
  compact = false,
  className,
  children,
}: StateBlockProps) {
  const classes = `state-block ${className ?? ''}`.trim();

  if (variant === 'loading') {
    return (
      <div
        className={classes}
        data-variant="loading"
        data-compact={compact}
        role="status"
        aria-live="polite"
      >
        <span className="visually-hidden">{message ?? 'Loading'}</span>
        <div className="state-block__skeleton" aria-hidden="true">
          {Array.from({ length: rows }, (_, index) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows
              key={index}
              className="state-block__bar"
              style={{ width: SKELETON_WIDTHS[index % SKELETON_WIDTHS.length] }}
            />
          ))}
        </div>
      </div>
    );
  }

  const resolvedIcon: IconName =
    icon ?? (variant === 'error' ? 'alert' : 'layers');

  return (
    <div
      className={classes}
      data-variant={variant}
      data-compact={compact}
      role={variant === 'error' ? 'alert' : undefined}
      title={detail}
    >
      <span className="state-block__icon">
        <Icon name={resolvedIcon} size={compact ? 14 : 18} />
      </span>
      <div className="state-block__body">
        {title ? (
          <TitleTag id={titleId} className="state-block__title">
            {title}
          </TitleTag>
        ) : null}
        {message ? <p className="state-block__message">{message}</p> : null}
        {children}
      </div>
      {action ? (
        <button
          type="button"
          className={`btn btn-small state-block__action${action.primary ? ' btn-primary' : ''}`}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
