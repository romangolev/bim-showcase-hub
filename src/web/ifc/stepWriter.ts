export function stepString(value: string): string {
  let out = '';
  let run = '';
  const flush = () => {
    if (run) {
      out += `\\X2\\${run}\\X0\\`;
      run = '';
    }
  };
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code >= 32 && code <= 126) {
      flush();
      const char = value[i] as string;
      out += char === "'" ? "''" : char === '\\' ? '\\\\' : char;
    } else {
      run += code.toString(16).toUpperCase().padStart(4, '0');
    }
  }
  flush();
  return `'${out}'`;
}

export function stepReal(value: number): string {
  if (!Number.isFinite(value)) return '0.';
  const rounded = Math.round(value * 1e6) / 1e6;
  const text = String(Object.is(rounded, -0) ? 0 : rounded);
  if (!/e/i.test(text)) return text.includes('.') ? text : `${text}.`;
  const [mantissa = '0', exponent = '0'] = text.split(/e/i);
  const exp = Number(exponent);
  const sign = exp < 0 ? '-' : '+';
  const digits = String(Math.abs(exp)).padStart(2, '0');
  return `${mantissa.includes('.') ? mantissa : `${mantissa}.`}E${sign}${digits}`;
}
