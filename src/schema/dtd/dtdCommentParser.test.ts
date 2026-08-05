import { describe, expect, it } from 'vitest';
import safetySource from '../../../tests/fixtures/dtd/comment-text-safety.dtd?raw';
import unterminatedSource from '../../../tests/fixtures/dtd/unterminated-comment.dtd?raw';
import { parseDtdDeclarations, parseDtdElementDeclarations } from './dtdParser';

describe('DTD comment parser output', () => {
  it('preserves exact raw and inner comment text', () => {
    const source = '<!--  exact < & > "text"  -->';
    const result = parseDtdDeclarations(source, 'comments.dtd');

    expect(result.diagnostics).toEqual([]);
    expect(result.comments).toHaveLength(1);
    expect(result.comments[0]).toMatchObject({
      kind: 'comment',
      raw: source,
      text: '  exact < & > "text"  ',
      sourceId: 'comments.dtd',
      order: 0,
    });
  });

  it('reports exact full and content ranges with end-exclusive offsets', () => {
    const source = ' \r\n<!--line one\r\nline two-->\n';
    const comment = parseDtdDeclarations(source, 'ranges.dtd').comments[0]!;
    const start = source.indexOf('<!--');
    const contentStart = start + 4;
    const contentEnd = source.indexOf('-->');

    expect(comment.range).toEqual({
      start: { offset: start, line: 2, column: 1 },
      end: { offset: contentEnd + 3, line: 3, column: 12 },
      sourceId: 'ranges.dtd',
    });
    expect(comment.contentRange).toEqual({
      start: { offset: contentStart, line: 2, column: 5 },
      end: { offset: contentEnd, line: 3, column: 9 },
      sourceId: 'ranges.dtd',
    });
    expect(
      source.slice(comment.range.start.offset, comment.range.end.offset),
    ).toBe(comment.raw);
    expect(
      source.slice(
        comment.contentRange.start.offset,
        comment.contentRange.end.offset,
      ),
    ).toBe(comment.text);
  });

  it('preserves source order across comments inside and outside declarations', () => {
    const source = [
      '<!-- first -->',
      '<!ELEMENT root (child <!-- second -->)>',
      '<!-- third -->',
      '<!ELEMENT child EMPTY>',
    ].join('\n');
    const result = parseDtdDeclarations(source);

    expect(result.comments.map(({ text, order }) => ({ text, order }))).toEqual(
      [
        { text: ' first ', order: 0 },
        { text: ' second ', order: 1 },
        { text: ' third ', order: 2 },
      ],
    );
    expect(result.declarations).toHaveLength(2);
    expect(result.diagnostics).toEqual([]);
  });

  it('keeps comments as grammar trivia inside ELEMENT declarations', () => {
    const result = parseDtdElementDeclarations(
      '<!ELEMENT root (<!--a--> child, <!--b--> leaf)>',
    );

    expect(result.declarations).toHaveLength(1);
    expect(result.comments.map(({ text }) => text)).toEqual(['a', 'b']);
    expect(result.diagnostics).toEqual([]);
  });

  it('keeps comments as grammar trivia inside ATTLIST declarations', () => {
    const result = parseDtdDeclarations(
      '<!ELEMENT root EMPTY>\n<!ATTLIST root <!-- id docs --> id ID #REQUIRED>',
    );

    expect(result.declarations.map(({ kind }) => kind)).toEqual([
      'elementDeclaration',
      'attributeListDeclaration',
    ]);
    expect(result.comments.map(({ text }) => text)).toEqual([' id docs ']);
    expect(result.diagnostics).toEqual([]);
  });

  it('exposes identical comments from compatibility and unified parse results', () => {
    const source = '<!-- before --><!ELEMENT root EMPTY><!-- after -->';

    expect(parseDtdElementDeclarations(source).comments).toEqual(
      parseDtdDeclarations(source).comments,
    );
  });

  it('preserves markup-like fixture text as data', () => {
    const result = parseDtdDeclarations(safetySource);

    expect(result.diagnostics).toEqual([]);
    expect(result.comments[0]?.text).toContain(
      `Literal <tag>, A > B, &example;, "quotes", and 'apostrophes'.`,
    );
  });

  it('does not fabricate a preserved comment for an unterminated comment', () => {
    const result = parseDtdDeclarations(unterminatedSource, 'unterminated.dtd');

    expect(result.declarations).toEqual([]);
    expect(result.comments).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'unterminated-comment',
        sourceId: 'unterminated.dtd',
      }),
    ]);
  });

  it('is deterministic, serializable, and input preserving', () => {
    const source = '<!-- one -->\n<!ELEMENT root EMPTY>';
    const original = `${source}`;
    const first = parseDtdDeclarations(source, 'stable.dtd');
    const second = parseDtdDeclarations(source, 'stable.dtd');

    expect(first).toEqual(second);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    expect(source).toBe(original);
  });
});
