import type { Language } from '../settings/settings.js';

const LOCALES: Record<Language, string> = { en: 'en-US', ru: 'ru-RU' };

export function localeOf(language: Language): string {
  return LOCALES[language];
}

export function formatCount(value: number, language: Language): string {
  return new Intl.NumberFormat(LOCALES[language]).format(value);
}

export function formatFixed(
  value: number,
  digits: number,
  language: Language,
): string {
  return new Intl.NumberFormat(LOCALES[language], {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatDateTime(
  value: string | number,
  language: Language,
): string {
  return new Intl.DateTimeFormat(LOCALES[language], {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}
