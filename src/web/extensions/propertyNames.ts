export function sanitizePropertyNames(
  raw: unknown,
  fallback: readonly string[],
): readonly string[] {
  const names = Array.isArray(raw)
    ? [
        ...new Set(
          raw.filter(
            (name): name is string =>
              typeof name === 'string' && name.trim() !== '',
          ),
        ),
      ]
    : [];
  return names.length > 0 ? names : fallback;
}
