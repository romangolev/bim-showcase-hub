import { useCallback } from 'react';
import { useSettings } from '../settings/SettingsContext.js';
import { type Language, readSettings } from '../settings/settings.js';
import { EN, type MessageId } from './en.js';
import { RU } from './ru.js';

export type Vars = Readonly<Record<string, string | number>>;

const CATALOGS: Record<Language, Partial<Record<MessageId, string>>> = {
  en: EN,
  ru: RU,
};

export function translate(
  language: Language,
  id: MessageId,
  vars: Vars = {},
): string {
  const template = CATALOGS[language][id] ?? EN[id];
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

export function translateNow(id: MessageId, vars?: Vars): string {
  return translate(readSettings().language, id, vars);
}

export function useT(): (id: MessageId, vars?: Vars) => string {
  const { language } = useSettings().settings;
  return useCallback((id, vars) => translate(language, id, vars), [language]);
}
