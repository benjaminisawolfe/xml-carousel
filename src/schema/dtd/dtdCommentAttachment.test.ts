import { describe, expect, it } from 'vitest';
import commentsSource from '../../../tests/fixtures/dtd/comments.dtd?raw';
import { attachDtdComments } from './dtdCommentAttachment';
import { parseDtdDeclarations } from './dtdParser';

function attach(source: string) {
  const parsed = parseDtdDeclarations(source, 'fixture.dtd');
  expect(parsed.diagnostics).toEqual([]);
  return attachDtdComments(
    parsed.comments,
    parsed.declarations,
    source,
    'fixture.dtd',
  );
}

describe('DTD comment attachment precedence', () => {
  it('attaches comments contained by an ELEMENT declaration first', () => {
    const result = attach('<!ELEMENT root (child <!-- inside -->)>');

    expect(result.comments[0]).toMatchObject({
      attachmentKind: 'contained',
      declarationKind: 'element',
      attachedNodeId: 'dtd:element:root',
    });
  });

  it('attaches same-line comments after horizontal whitespace as trailing', () => {
    const result = attach(
      '<!ELEMENT root EMPTY>\t  <!-- trailing -->\n<!ELEMENT other EMPTY>',
    );

    expect(result.comments[0]).toMatchObject({
      attachmentKind: 'trailing',
      declarationKind: 'element',
      attachedNodeId: 'dtd:element:root',
    });
  });

  it('does not treat a next-line comment as same-line trailing', () => {
    const result = attach(
      '<!ELEMENT root EMPTY>\n<!-- before other -->\n<!ELEMENT other EMPTY>',
    );

    expect(result.comments[0]).toMatchObject({
      attachmentKind: 'preceding',
      attachedNodeId: 'dtd:element:other',
    });
  });

  it('attaches consecutive preceding comments in source order', () => {
    const result = attach(
      '<!-- first -->\n\n<!-- second -->\n<!ELEMENT root EMPTY>',
    );

    expect(
      result.commentsByNodeId['dtd:element:root']?.map(({ text }) => text),
    ).toEqual([' first ', ' second ']);
    expect(
      result.commentsByNodeId['dtd:element:root']?.map(
        ({ attachmentKind }) => attachmentKind,
      ),
    ).toEqual(['preceding', 'preceding']);
  });

  it('leaves an unclaimed final comment at schema level', () => {
    const result = attach('<!ELEMENT root EMPTY>\n\n<!-- schema footer -->');

    expect(result.comments[0]).toMatchObject({ attachmentKind: 'schema' });
    expect(result.comments[0]).not.toHaveProperty('attachedNodeId');
    expect(result.comments[0]).not.toHaveProperty('declarationKind');
    expect(result.schemaLevelComments).toEqual(result.comments);
    expect(result.commentsByNodeId).toEqual({});
  });

  it('resolves ATTLIST attachments to the owner element node', () => {
    const result = attach(
      '<!ELEMENT root EMPTY>\n<!ATTLIST root <!-- docs --> id ID #REQUIRED>',
    );

    expect(result.comments[0]).toMatchObject({
      attachmentKind: 'contained',
      declarationKind: 'attributeList',
      attachedNodeId: 'dtd:element:root',
    });
  });

  it('applies all attachment forms in the representative fixture', () => {
    const result = attachDtdComments(
      parseDtdDeclarations(commentsSource, 'comments.dtd').comments,
      parseDtdDeclarations(commentsSource, 'comments.dtd').declarations,
      commentsSource,
      'comments.dtd',
    );

    expect(result.comments).toHaveLength(6);
    expect(result.commentsByNodeId['dtd:element:book']).toHaveLength(2);
    expect(result.commentsByNodeId['dtd:element:chapter']).toHaveLength(3);
    expect(result.schemaLevelComments).toHaveLength(1);
    expect(result.comments.map(({ attachmentKind }) => attachmentKind)).toEqual(
      [
        'preceding',
        'trailing',
        'preceding',
        'preceding',
        'preceding',
        'schema',
      ],
    );
  });

  it('retains declaration kind and range for attached comments', () => {
    const source =
      '<!ELEMENT root EMPTY>\n<!-- before attrs -->\n<!ATTLIST root id ID #REQUIRED>';
    const parsed = parseDtdDeclarations(source, 'fixture.dtd');
    const result = attachDtdComments(
      parsed.comments,
      parsed.declarations,
      source,
      'fixture.dtd',
    );
    const declaration = parsed.declarations[1]!;

    expect(result.comments[0]?.declarationKind).toBe('attributeList');
    expect(result.comments[0]?.declarationRange).toEqual(
      declaration.rawDeclarationRange,
    );
  });

  it('creates stable source-derived IDs and complete exact text metadata', () => {
    const source = '<!-- exact & < > -->\n<!ELEMENT root EMPTY>';
    const result = attach(source);
    const comment = result.comments[0]!;

    expect(comment.commentId).toBe(
      `dtd:comment:fixture.dtd:0-${source.indexOf('-->') + 3}`,
    );
    expect(comment.raw).toBe('<!-- exact & < > -->');
    expect(comment.text).toBe(' exact & < > ');
    expect(comment.sourceFileId).toBe('fixture.dtd');
    expect(comment.sourceRange.sourceId).toBe('fixture.dtd');
    expect(comment.contentRange.sourceId).toBe('fixture.dtd');
  });

  it('returns plain JSON data without Map or Set values', () => {
    const result = attach(commentsSource);

    function includesMapOrSet(value: unknown): boolean {
      if (value instanceof Map || value instanceof Set) return true;
      if (Array.isArray(value)) return value.some(includesMapOrSet);
      if (value && typeof value === 'object') {
        return Object.values(value).some(includesMapOrSet);
      }
      return false;
    }

    expect(includesMapOrSet(result)).toBe(false);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it('is deterministic and does not mutate comments or declarations', () => {
    const parsed = parseDtdDeclarations(commentsSource, 'comments.dtd');
    const before = JSON.stringify(parsed);
    const first = attachDtdComments(
      parsed.comments,
      parsed.declarations,
      commentsSource,
      'comments.dtd',
    );
    const second = attachDtdComments(
      parsed.comments,
      parsed.declarations,
      commentsSource,
      'comments.dtd',
    );

    expect(first).toEqual(second);
    expect(JSON.stringify(parsed)).toBe(before);
  });
});
