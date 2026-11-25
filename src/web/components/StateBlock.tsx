import type { ReactNode } from 'react';
import { Icon, type IconName } from './icons.js';
import './state-block.css';
import { Button } from '../ui/Button.js';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '../ui/Empty.js';
import { Skeleton } from '../ui/Skeleton.js';

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
  const size = compact ? 'small' : 'default';

  if (variant === 'loading') {
    return (
      <Skeleton
        className={className}
        size={size}
        rows={rows}
        data-state-block="loading"
        role="status"
        aria-live="polite"
      >
        <span className="visually-hidden">{message ?? 'Loading'}</span>
      </Skeleton>
    );
  }

  const resolvedIcon: IconName =
    icon ?? (variant === 'error' ? 'alert' : 'layers');

  return (
    <Empty
      className={className}
      size={size}
      tone={variant === 'error' ? 'danger' : 'neutral'}
      data-state-block={variant}
      role={variant === 'error' ? 'alert' : undefined}
      title={detail}
    >
      <EmptyMedia>
        <Icon name={resolvedIcon} size={compact ? 14 : 18} />
      </EmptyMedia>
      <EmptyContent>
        {title ? (
          <EmptyTitle id={titleId} render={<TitleTag />}>
            {title}
          </EmptyTitle>
        ) : null}
        {message ? <EmptyDescription>{message}</EmptyDescription> : null}
        {children}
      </EmptyContent>
      {action ? (
        <Button
          size="small"
          variant={action.primary ? 'primary' : 'default'}
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      ) : null}
    </Empty>
  );
}
