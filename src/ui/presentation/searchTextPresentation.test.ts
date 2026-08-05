import { describe, expect, it } from 'vitest';
import {
  buildSearchTextExcerpt,
  buildSearchTextSegments,
  collapseSearchDisplayWhitespace,
  projectSearchHighlightRanges,
  SEARCH_RESULT_CONTEXT_LENGTH,
} from './searchTextPresentation';

function highlightedText(text: string, query: string): string[] {
  return buildSearchTextSegments(text, query)
    .filter(({ highlighted }) => highlighted)
    .map(({ text: segment }) => segment);
}

function concatenated(text: string, query: string): string {
  return buildSearchTextSegments(text, query)
    .map(({ text: segment }) => segment)
    .join('');
}

describe('Unicode-safe project-search highlight projection', () => {
  it('returns one unchanged segment for no terms or no match', () => {
    expect(buildSearchTextSegments('BaseType', '   ')).toEqual([
      { text: 'BaseType', highlighted: false },
    ]);
    expect(buildSearchTextSegments('BaseType', 'missing')).toEqual([
      { text: 'BaseType', highlighted: false },
    ]);
  });

  it('projects ASCII case-insensitive matches onto original casing', () => {
    expect(highlightedText('BaseType', 'basetype')).toEqual(['BaseType']);
    expect(highlightedText('basetype', 'BASETYPE')).toEqual(['basetype']);
  });

  it('highlights every non-overlapping repeated occurrence', () => {
    expect(highlightedText('type type TYPE', 'type')).toEqual([
      'type',
      'type',
      'TYPE',
    ]);
  });

  it('merges overlapping and adjacent query-term ranges', () => {
    expect(buildSearchTextSegments('BaseType', 'base basetype type')).toEqual([
      { text: 'BaseType', highlighted: true },
    ]);
  });

  it('maps collapsed CR, LF, tab, and repeated whitespace', () => {
    const text = 'Extension\r\n\t  documentation';
    expect(highlightedText(text, 'extension documentation')).toEqual([
      'Extension',
      'documentation',
    ]);
    expect(concatenated(text, 'extension documentation')).toBe(text);
  });

  it('supports full-width and ASCII NFKC equivalence in both directions', () => {
    expect(highlightedText('BaseType', 'Ｂａｓｅ')).toEqual(['Base']);
    expect(highlightedText('ＢａｓｅＴｙｐｅ', 'Base')).toEqual(['Ｂａｓｅ']);
  });

  it('supports compatibility expansion and canonical contraction', () => {
    expect(highlightedText('oﬃce', 'office')).toEqual(['oﬃce']);
    expect(highlightedText('e\u0301lan', 'élan')).toEqual(['e\u0301lan']);
  });

  it('preserves namespace punctuation, accents, and punctuation-only terms', () => {
    expect(highlightedText('xs:string café', 'xs:string')).toEqual([
      'xs:string',
    ]);
    expect(highlightedText('xs:string café', 'cafe')).toEqual([]);
    expect(highlightedText('alpha::beta', '::')).toEqual(['::']);
  });

  it('uses code-point-safe source ranges for surrogate pairs', () => {
    const text = '😀Type😀';
    expect(projectSearchHighlightRanges(text, 'type')).toEqual([
      { start: 2, end: 6 },
    ]);
    expect(concatenated(text, 'type')).toBe(text);
  });

  it('keeps malicious-looking markup as inert text segments', () => {
    const text = '<script>alert(1)</script><img src=x onerror=alert(1)>';
    expect(concatenated(text, 'script img')).toBe(text);
    expect(highlightedText(text, 'script img')).toEqual([
      'script',
      'script',
      'img',
    ]);
  });

  it('returns independent arrays without mutating inputs', () => {
    const text = 'BaseType BaseType';
    const query = 'base';
    const first = buildSearchTextSegments(text, query);
    const second = buildSearchTextSegments(text, query);

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first[0]).not.toBe(second[0]);
    expect(text).toBe('BaseType BaseType');
    expect(query).toBe('base');
  });
});

describe('bounded project-search context excerpts', () => {
  it('collapses display whitespace and leaves under-limit text unchanged', () => {
    expect(collapseSearchDisplayWhitespace('  one\r\n\t two  ')).toBe(
      'one two',
    );
    const excerpt = buildSearchTextExcerpt('  one\r\n\t two  ', 'two');
    expect(excerpt.text).toBe('one two');
    expect(highlightedText(excerpt.text, 'two')).toEqual(['two']);
  });

  it('keeps beginning matches with only a trailing ellipsis', () => {
    const text = `needle ${'word '.repeat(60)}`;
    const excerpt = buildSearchTextExcerpt(text, 'needle', {
      maximumLength: 40,
    });
    expect(excerpt.text).toMatch(/^needle /);
    expect(excerpt.text.endsWith('…')).toBe(true);
    expect(excerpt.text.startsWith('…')).toBe(false);
  });

  it('centres middle matches with both ellipses and word boundaries', () => {
    const text = `${'before '.repeat(30)}needle ${'after '.repeat(30)}`;
    const excerpt = buildSearchTextExcerpt(text, 'needle', {
      maximumLength: 60,
    });
    expect(excerpt.text.startsWith('…')).toBe(true);
    expect(excerpt.text.endsWith('…')).toBe(true);
    expect(excerpt.text).toContain('needle');
    expect(Array.from(excerpt.text).length).toBeLessThanOrEqual(60);
  });

  it('keeps near-end matches with only a leading ellipsis', () => {
    const text = `${'word '.repeat(60)}needle`;
    const excerpt = buildSearchTextExcerpt(text, 'needle', {
      maximumLength: 40,
    });
    expect(excerpt.text.startsWith('…')).toBe(true);
    expect(excerpt.text.endsWith('needle')).toBe(true);
    expect(excerpt.text.endsWith('…')).toBe(false);
  });

  it('falls back deterministically when there is no highlighted range', () => {
    const excerpt = buildSearchTextExcerpt('abcdefghij', 'missing', {
      collapseWhitespace: false,
      maximumLength: 6,
    });
    expect(excerpt.text).toBe('abcde…');
  });

  it('uses a code-point fallback for long text without whitespace', () => {
    const excerpt = buildSearchTextExcerpt('😀abcdefghij😀', 'missing', {
      collapseWhitespace: false,
      maximumLength: 7,
    });
    expect(Array.from(excerpt.text)).toHaveLength(7);
    expect(excerpt.text).toBe('😀abcde…');
  });

  it('never exceeds the 180-character maximum including ellipses', () => {
    const excerpt = buildSearchTextExcerpt(
      `${'before '.repeat(80)}needle ${'after '.repeat(80)}`,
      'needle',
    );
    expect(Array.from(excerpt.text).length).toBeLessThanOrEqual(
      SEARCH_RESULT_CONTEXT_LENGTH,
    );
    expect(excerpt.text).toContain('needle');
  });

  it('preserves repeated matches and malicious-looking text safely', () => {
    const text = `${'<script>alert(1)</script> '.repeat(20)}needle needle`;
    const excerpt = buildSearchTextExcerpt(text, 'needle');
    expect(excerpt.text).toContain('needle needle');
    expect(
      excerpt.segments.filter(({ highlighted }) => highlighted),
    ).toHaveLength(2);
  });

  it('keeps references complete and truncates long filenames when requested', () => {
    expect(
      buildSearchTextExcerpt('xs:string', 'string', {
        collapseWhitespace: false,
      }).text,
    ).toBe('xs:string');
    const filename = `${'nested-'.repeat(40)}annotations.xsd`;
    const excerpt = buildSearchTextExcerpt(filename, 'annotations', {
      collapseWhitespace: false,
    });
    expect(Array.from(excerpt.text).length).toBeLessThanOrEqual(180);
    expect(excerpt.text).toContain('annotations');
  });
});
