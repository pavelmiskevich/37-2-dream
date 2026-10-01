import { describe, expect, it } from 'vitest';
import { charCount, revealLines, wrapText } from './text';

const mono = (text: string) => text.length;

describe('wrapText', () => {
  it('wraps words greedily within the width', () => {
    expect(wrapText('Я завещаю кота соседке', 10, mono)).toEqual(['Я завещаю', 'кота', 'соседке']);
  });

  it('keeps a long word whole on its own line and honours line breaks', () => {
    expect(wrapText('нижеподписавшийся я\nПодпись', 8, mono)).toEqual(['нижеподписавшийся', 'я', 'Подпись']);
  });
});

describe('revealLines', () => {
  const lines = ['ЗАВЕЩАНИЕ', 'Я завещаю'];

  it('shows characters in reading order', () => {
    expect(revealLines(lines, 0)).toEqual([]);
    expect(revealLines(lines, 4)).toEqual(['ЗАВЕ']);
    expect(revealLines(lines, 11)).toEqual(['ЗАВЕЩАНИЕ', 'Я ']);
    expect(revealLines(lines, 100)).toEqual(lines);
  });

  it('counts characters', () => {
    expect(charCount(lines)).toBe(18);
  });
});
