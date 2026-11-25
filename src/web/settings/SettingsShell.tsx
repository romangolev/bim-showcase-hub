import {
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Icon } from '../components/icons.js';
import { useMediaQuery } from '../components/useMediaQuery.js';
import { useT } from '../i18n/i18n.js';
import { STACKED_QUERY } from '../layout/breakpoint.js';
import { Button } from '../ui/Button.js';
import {
  consumeSettingsLink,
  listSettingsSections,
  selectSettingsSection,
  settingsSelection,
  subscribeSettingsSelection,
} from './settingsSections.js';

const KEY_STEPS: Record<string, (at: number, count: number) => number> = {
  ArrowDown: (at, count) => (at + 1) % count,
  ArrowUp: (at, count) => (at - 1 + count) % count,
  Home: () => 0,
  End: (_, count) => count - 1,
};

function focusOnOpen(element: HTMLElement | null) {
  element?.setAttribute('autofocus', '');
}

export function SettingsShell() {
  const t = useT();
  const sections = listSettingsSections();
  const { selected, linked } = useSyncExternalStore(
    subscribeSettingsSelection,
    settingsSelection,
  );
  const narrow = useMediaQuery(STACKED_QUERY);
  const [drilled, setDrilled] = useState(linked);
  const baseId = useId();
  const listRef = useRef<HTMLElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);

  useEffect(() => {
    if (!linked) return;
    setDrilled(true);
    consumeSettingsLink();
  }, [linked]);

  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    if (drilled) backRef.current?.focus();
    else {
      listRef.current
        ?.querySelector<HTMLElement>('[data-current="true"]')
        ?.focus();
    }
  }, [drilled]);

  const current =
    sections.find((section) => section.id === selected) ?? sections[0];
  if (!current) return null;
  const panelId = `${baseId}-panel`;
  const titleId = `${baseId}-title`;

  const drill = (id: string, into: boolean) => {
    refocus.current = narrow && into !== drilled;
    selectSettingsSection(id);
    setDrilled(into);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = KEY_STEPS[event.key];
    const items = [
      ...event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]'),
    ];
    const at = items.indexOf(event.target as HTMLElement);
    if (!step || at < 0) return;
    event.preventDefault();
    const next = step(at, items.length);
    items[next]?.focus();
    const section = sections[next];
    if (section) selectSettingsSection(section.id);
  };

  const title = (
    <h3 id={titleId} className="settings-nav__title">
      {current.label()}
    </h3>
  );
  const options = (
    <div className="settings-nav__options">
      <current.Body key={current.id} />
    </div>
  );

  if (narrow) {
    return (
      <div className="settings-nav" data-narrow="true">
        {drilled ? (
          <section className="settings-nav__pane" aria-labelledby={titleId}>
            <div className="settings-nav__head">
              <Button
                ref={(element) => {
                  backRef.current = element;
                  focusOnOpen(element);
                }}
                className="settings-nav__back"
                onClick={() => drill(current.id, false)}
              >
                <Icon name="chevron" size={14} />
                {t('settings.back')}
              </Button>
              {title}
            </div>
            {options}
          </section>
        ) : (
          <nav
            ref={listRef}
            className="settings-nav__list"
            aria-label={t('settings.sections')}
          >
            {sections.map((section) => (
              <button
                key={section.id}
                ref={section.id === current.id ? focusOnOpen : undefined}
                type="button"
                className="settings-nav__item"
                data-current={section.id === current.id}
                onClick={() => drill(section.id, true)}
              >
                <Icon name={section.icon} size={16} />
                <span className="settings-nav__label">{section.label()}</span>
                <Icon name="chevron" size={14} />
              </button>
            ))}
          </nav>
        )}
      </div>
    );
  }

  return (
    <div className="settings-nav">
      <div
        className="settings-nav__list"
        role="tablist"
        aria-orientation="vertical"
        aria-label={t('settings.sections')}
        onKeyDown={onKeyDown}
      >
        {sections.map((section) => {
          const active = section.id === current.id;
          return (
            <button
              key={section.id}
              ref={active ? focusOnOpen : undefined}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={panelId}
              tabIndex={active ? 0 : -1}
              className="settings-nav__item"
              onClick={() => selectSettingsSection(section.id)}
            >
              <Icon name={section.icon} size={16} />
              <span className="settings-nav__label">{section.label()}</span>
            </button>
          );
        })}
      </div>
      <div
        id={panelId}
        className="settings-nav__pane"
        role="tabpanel"
        aria-labelledby={titleId}
      >
        <div className="settings-nav__head">{title}</div>
        {options}
      </div>
    </div>
  );
}
