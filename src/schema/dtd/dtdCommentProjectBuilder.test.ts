import { describe, expect, it } from 'vitest';
import commentsSource from '../../../tests/fixtures/dtd/comments.dtd?raw';
import { parseDtdDeclarations } from './dtdParser';
import { buildDtdProjectFromDeclarations } from './dtdProjectBuilder';

const options = {
  projectId: 'comments-project',
  displayName: 'Comments',
  sourceFileId: 'comments.dtd',
  sourceFilename: 'comments.dtd',
};

function build(source = commentsSource) {
  const parsed = parseDtdDeclarations(source, options.sourceFileId);
  expect(parsed.diagnostics).toEqual([]);
  return buildDtdProjectFromDeclarations(
    parsed.declarations,
    source,
    options,
    parsed.comments,
  );
}

describe('DTD comment project metadata', () => {
  it('builds complete attached and schema-level comment indexes', () => {
    const result = build();

    expect(result.project).toBeDefined();
    expect(result.comments).toHaveLength(6);
    expect(result.commentsByNodeId['dtd:element:book']).toHaveLength(2);
    expect(result.commentsByNodeId['dtd:element:chapter']).toHaveLength(3);
    expect(result.schemaLevelComments).toHaveLength(1);
  });

  it('does not create schema nodes or edges for comments', () => {
    const result = build();

    expect(
      result.project?.nodes.map(({ kind, name }) => ({ kind, name })),
    ).toEqual([
      { kind: 'dtdElement', name: 'book' },
      { kind: 'dtdElement', name: 'chapter' },
      { kind: 'dtdAttribute', name: 'id' },
    ]);
    expect(
      result.project?.edges.every(({ kind }) => kind !== ('comment' as never)),
    ).toBe(true);
    expect(
      result.project?.nodes.some(({ name }) => name.includes('comment')),
    ).toBe(false);
    expect(
      result.project?.nodes.find(({ name }) => name === 'book')
        ?.compactDeclaration,
    ).not.toContain('<!--');
    expect(result.comments[0]?.raw).toBe(
      '<!-- The root element for the document. -->',
    );
  });

  it('keeps ATTLIST comments on the owner element instead of the attribute node', () => {
    const result = build();
    const itemComments = result.commentsByNodeId['dtd:element:chapter'] ?? [];

    expect(
      itemComments.filter(
        ({ declarationKind }) => declarationKind === 'attributeList',
      ),
    ).toHaveLength(1);
    expect(result.commentsByNodeId['dtd:attribute:chapter:id']).toBeUndefined();
  });

  it('returns empty comment metadata when a structural build is fatal', () => {
    const source = '<!-- docs -->\n<!ELEMENT root (missing)>';
    const parsed = parseDtdDeclarations(source, options.sourceFileId);
    const result = buildDtdProjectFromDeclarations(
      parsed.declarations,
      source,
      options,
      parsed.comments,
    );

    expect(result.project).toBeUndefined();
    expect(result.comments).toEqual([]);
    expect(result.commentsByNodeId).toEqual({});
    expect(result.schemaLevelComments).toEqual([]);
  });

  it('keeps the no-comment build contract explicitly empty', () => {
    const result = build('<!ELEMENT root EMPTY>');

    expect(result.comments).toEqual([]);
    expect(result.commentsByNodeId).toEqual({});
    expect(result.schemaLevelComments).toEqual([]);
  });

  it('is deterministic and JSON serializable', () => {
    const first = build();
    const second = build();

    expect(first).toEqual(second);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });
});
