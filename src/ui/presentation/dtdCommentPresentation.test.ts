import { describe, expect, it } from 'vitest';
import {
  buildDtdCommentExcerpt,
  normalizeDtdCommentDisplayText,
} from './dtdCommentPresentation';

describe('DTD comment presentation', () => {
  it.each([
    [' one\r\ntwo ', 'one\ntwo'],
    [' one\rtwo ', 'one\ntwo'],
    [' one\ntwo ', 'one\ntwo'],
  ])('normalizes line endings in %j', (input, expected) => {
    expect(normalizeDtdCommentDisplayText(input)).toBe(expected);
  });

  it('removes outer blank display lines and common indentation', () => {
    expect(
      normalizeDtdCommentDisplayText(
        '\n\t  first line\n\t    indented detail\n\n\t  final line\n',
      ),
    ).toBe('first line\n  indented detail\n\nfinal line');
  });

  it('preserves internal blank lines and meaningful relative indentation', () => {
    expect(normalizeDtdCommentDisplayText('  alpha\n\n    beta')).toBe(
      'alpha\n\n  beta',
    );
  });

  it('preserves special characters as text', () => {
    const text = `<script>x()</script> & < > "quoted" 'single'`;

    expect(normalizeDtdCommentDisplayText(` ${text} `)).toBe(text);
  });

  it('returns complete short excerpts', () => {
    expect(buildDtdCommentExcerpt('  short docs  ', 20)).toBe('short docs');
  });

  it('truncates long excerpts deterministically with one ellipsis', () => {
    expect(buildDtdCommentExcerpt('abcdefghij', 6)).toBe('abcde…');
    expect(buildDtdCommentExcerpt('abcdefghij', 6)).toHaveLength(6);
  });
});
