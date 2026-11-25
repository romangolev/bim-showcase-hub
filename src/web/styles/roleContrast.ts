export type Scheme = 'dark' | 'light';

const HEX = /^#[0-9a-f]{6}$/i;
const ROLE_SURFACES = ['surface', 'surface-raised', 'surface-sunken'];
const ROLE_TEXT = [
  'text',
  'text-muted',
  'text-subtle',
  'text-disabled',
  'accent',
  'danger',
  'success',
];

export const ROLE_PAIRS: [string, string, number][] = [
  ...ROLE_SURFACES.flatMap((surface) => [
    ...ROLE_TEXT.map((text): [string, string, number] => [text, surface, 4.5]),
    ['focus', surface, 3] as [string, string, number],
  ]),
  ['on-solid', 'solid', 4.5],
  ['on-solid', 'solid-hover', 4.5],
  ['on-accent', 'accent-fill', 3],
];

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

export function declarations(css: string, selector: string) {
  const start = css.indexOf(selector);
  if (start === -1) return {};
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return Object.fromEntries(
    [...body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((match) => [
      match[1] as string,
      (match[2] as string).trim(),
    ]),
  ) as Record<string, string>;
}

export function resolveRoles(
  tokensCss: string,
  scheme: Scheme,
  pack: Record<string, string> = {},
): Record<string, string | undefined> {
  const vars: Record<string, string> = {
    ...declarations(tokensCss, ':root {\n  --font-sans'),
    ...declarations(tokensCss, `:root[data-theme="${scheme}"]`),
    ...pack,
  };
  const resolve = (name: string, depth = 0): string | undefined => {
    const value = vars[name];
    if (!value || depth > 8) return undefined;
    const alias = /^var\(--([a-z0-9-]+)\)$/.exec(value)?.[1];
    return alias ? resolve(alias, depth + 1) : value;
  };
  return Object.fromEntries(
    Object.keys(vars)
      .filter((name) => name.startsWith('ui-'))
      .map((name) => [name.slice(3), resolve(name)]),
  );
}

export function roleFailures(
  roles: Record<string, string | undefined>,
): string[] {
  return ROLE_PAIRS.flatMap(([front, back, ratio]) => {
    const [a, b] = [roles[front], roles[back]];
    if (!a || !b || !HEX.test(a) || !HEX.test(b)) {
      return [`${front} on ${back} does not resolve to a colour`];
    }
    const actual = contrast(a, b);
    return actual >= ratio
      ? []
      : [`${front} on ${back} is ${actual.toFixed(2)}:1, below ${ratio}:1`];
  });
}
