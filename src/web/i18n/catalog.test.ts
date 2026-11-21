import { describe, expect, it } from 'vitest';
import { EN, type MessageId } from './en.js';
import { RU } from './ru.js';

const placeholders = (text: string) =>
  [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('message catalog', () => {
  it('keeps the same placeholders in every Russian message', () => {
    for (const [id, text] of Object.entries(RU)) {
      expect(placeholders(text ?? ''), id).toEqual(
        placeholders(EN[id as MessageId]),
      );
    }
  });

  it('reports Russian coverage', () => {
    const total = Object.keys(EN).length;
    const done = Object.keys(RU).length;
    console.info(`ru coverage ${done}/${total}`);
    expect(done).toBeLessThanOrEqual(total);
  });
});
