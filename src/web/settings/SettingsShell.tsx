import {
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
import { Tab, TabPanel, Tabs, TabsList } from '../ui/Tabs.js';
import {
  consumeSettingsLink,
  listSettingsSections,
  selectSettingsSection,
  settingsSelection,
  subscribeSettingsSelection,
} from './settingsSections.js';

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
  const titleId = `${baseId}-title`;

  const drill = (id: string, into: boolean) => {
    refocus.current = narrow && into !== drilled;
    selectSettingsSection(id);
    setDrilled(into);
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
              <Button
                key={section.id}
                ref={section.id === current.id ? focusOnOpen : undefined}
                variant="ghost"
                className="settings-nav__item"
                data-current={section.id === current.id}
                onClick={() => drill(section.id, true)}
              >
                <Icon name={section.icon} size={16} />
                <span className="settings-nav__label">{section.label()}</span>
                <Icon name="chevron" size={14} />
              </Button>
            ))}
          </nav>
        )}
      </div>
    );
  }

  return (
    <Tabs
      className="settings-nav"
      orientation="vertical"
      value={current.id}
      onValueChange={(id) => selectSettingsSection(id as string)}
    >
      <TabsList
        className="settings-nav__list"
        aria-label={t('settings.sections')}
        activateOnFocus
      >
        {sections.map((section) => (
          <Tab
            key={section.id}
            ref={section.id === current.id ? focusOnOpen : undefined}
            value={section.id}
          >
            <Icon name={section.icon} size={16} />
            <span className="settings-nav__label">{section.label()}</span>
          </Tab>
        ))}
      </TabsList>
      <TabPanel
        value={current.id}
        className="settings-nav__pane"
        aria-labelledby={titleId}
      >
        <div className="settings-nav__head">{title}</div>
        {options}
      </TabPanel>
    </Tabs>
  );
}
