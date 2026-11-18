export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function text(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

export function required(value: unknown, fallback: string): string {
  return text(value, fallback) || fallback;
}
