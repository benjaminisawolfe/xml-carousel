import { describe, expect, it } from 'vitest';
import { normalizeProjectSearchText } from './projectSearchNormalization';

describe('project search text normalization', () => {
  it('applies Unicode NFKC compatibility normalization', () => {
    expect(normalizeProjectSearchText('ＢａｓｅＴｙｐｅ')).toBe('basetype');
    expect(normalizeProjectSearchText('①')).toBe('1');
  });

  it('lowercases without locale-dependent matching', () => {
    expect(normalizeProjectSearchText('BaseTYPE')).toBe('basetype');
  });

  it('collapses CR, LF, tabs, spaces, and surrounding whitespace', () => {
    expect(normalizeProjectSearchText(' \r\n Root\t  documentation \n ')).toBe(
      'root documentation',
    );
  });

  it('preserves punctuation and namespace separators', () => {
    expect(normalizeProjectSearchText(' xs:string / tns:Base-Type ')).toBe(
      'xs:string / tns:base-type',
    );
  });

  it('preserves accents', () => {
    expect(normalizeProjectSearchText('Résumé')).toBe('résumé');
    expect(normalizeProjectSearchText('resume')).not.toBe(
      normalizeProjectSearchText('Résumé'),
    );
  });

  it('returns an empty string for empty or whitespace-only input', () => {
    expect(normalizeProjectSearchText('')).toBe('');
    expect(normalizeProjectSearchText('\t\r\n ')).toBe('');
  });

  it('does not mutate the input string', () => {
    const input = '  BaseType  ';
    normalizeProjectSearchText(input);
    expect(input).toBe('  BaseType  ');
  });
});
