export function fold(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}
