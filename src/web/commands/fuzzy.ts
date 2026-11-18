import type { Command } from './types.js';

export function fuzzyScore(query: string, text: string): number | null {
  const needle = query.toLowerCase();
  const hay = text.toLowerCase();
  let score = 0;
  let at = 0;
  let streak = 0;
  for (const char of needle) {
    const found = hay.indexOf(char, at);
    if (found < 0) return null;
    streak = found === at ? streak + 1 : 0;
    const boundary = found === 0 || /[\s\-_.:/]/.test(hay[found - 1] ?? '');
    score += 1 + streak * 2 + (boundary ? 3 : 0) - (found - at) * 0.1;
    at = found + 1;
  }
  return score - hay.length * 0.01;
}

export function filterCommands(
  commands: readonly Command[],
  query: string,
): Command[] {
  const trimmed = query.trim();
  if (!trimmed) return [...commands];
  const ranked: Array<{ command: Command; score: number }> = [];
  for (const command of commands) {
    const title = fuzzyScore(trimmed, command.title);
    const extra = fuzzyScore(
      trimmed,
      `${command.group} ${command.keywords ?? ''}`,
    );
    const score =
      title === null ? (extra === null ? null : extra - 5) : title + 5;
    if (score !== null) ranked.push({ command, score });
  }
  return ranked.sort((a, b) => b.score - a.score).map((r) => r.command);
}
