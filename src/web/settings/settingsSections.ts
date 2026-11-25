import type { ComponentType } from 'react';
import type { IconName } from '../components/icons.js';

export interface SettingsSection {
  id: string;
  label: () => string;
  icon: IconName;
  Body: ComponentType;
  keywords?: string;
}

export interface SettingsSelection {
  selected: string | null;
  linked: boolean;
}

let sections: readonly SettingsSection[] = [];
let selection: SettingsSelection = { selected: null, linked: false };
const listeners = new Set<() => void>();

function setSelection(next: SettingsSelection) {
  selection = next;
  for (const listener of listeners) listener();
}

export function registerSettingsSection(section: SettingsSection): () => void {
  sections = [...sections.filter((known) => known.id !== section.id), section];
  return () => {
    sections = sections.filter((known) => known !== section);
  };
}

export function listSettingsSections(): readonly SettingsSection[] {
  return sections;
}

export function subscribeSettingsSelection(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function settingsSelection(): SettingsSelection {
  return selection;
}

export function selectSettingsSection(id: string | null) {
  setSelection({ selected: id, linked: false });
}

export function openSettingsSection(id: string) {
  setSelection({ selected: id, linked: true });
}

export function consumeSettingsLink() {
  if (selection.linked) setSelection({ ...selection, linked: false });
}
