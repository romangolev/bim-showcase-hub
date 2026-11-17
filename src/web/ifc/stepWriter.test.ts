import { describe, expect, it } from 'vitest';
import { stepReal, stepString } from './stepWriter.js';

describe('stepString', () => {
  it('quotes and doubles apostrophes', () => {
    expect(stepString("O'Neil")).toBe("'O''Neil'");
  });

  it('doubles backslashes', () => {
    expect(stepString('a\\b')).toBe("'a\\\\b'");
  });

  it('encodes non-ASCII as X2 runs', () => {
    expect(stepString('Café')).toBe("'Caf\\X2\\00E9\\X0\\'");
    expect(stepString('Ё1')).toBe("'\\X2\\0401\\X0\\1'");
  });
});

describe('stepReal', () => {
  it('always writes a decimal point', () => {
    expect(stepReal(3)).toBe('3.');
    expect(stepReal(-2.5)).toBe('-2.5');
    expect(stepReal(0)).toBe('0.');
  });

  it('rounds to six decimals and removes negative zero', () => {
    expect(stepReal(0.1234567891)).toBe('0.123457');
    expect(stepReal(-0.0000001)).toBe('0.');
  });

  it('writes exponents in STEP form and survives non-finite input', () => {
    expect(stepReal(1e21)).toBe('1.E+21');
    expect(stepReal(Number.NaN)).toBe('0.');
  });
});
