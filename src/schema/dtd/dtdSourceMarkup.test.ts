import { describe, expect, it } from 'vitest';
import type { DtdDeclarationAst } from './dtdAst';
import { attachDtdComments } from './dtdCommentAttachment';
import { parseDtdDeclarations } from './dtdParser';
import { buildDtdProjectFromDeclarations } from './dtdProjectBuilder';
import { buildDtdSourceMarkupByNodeId } from './dtdSourceMarkup';

const options = {
  projectId: 'test:source-markup',
  displayName: 'Source markup',
  sourceFileId: 'source-markup.dtd',
  sourceFilename: 'source-markup.dtd',
};

const sourceLines = [
  '<!-- Book documentation. -->',
  '<!ELEMENT book (chapter+)><!-- Book trailing note. -->',
  '',
  '<!-- Primary book attributes. -->',
  '<!ATTLIST book',
  '  id ID #REQUIRED>',
  '',
  '<!ELEMENT chapter (#PCDATA)>',
  '',
  '<!-- Secondary book attributes. -->',
  '<!ATTLIST book',
  "  lang CDATA 'en'>",
  '',
  '<!-- Chapter-only attributes. -->',
  '<!ATTLIST chapter role CDATA #IMPLIED>',
];
const crlfSource = sourceLines.join('\r\n');

function buildSourceMarkup(sourceText = crlfSource) {
  const parsed = parseDtdDeclarations(sourceText, options.sourceFileId);
  expect(parsed.diagnostics).toEqual([]);
  const result = buildDtdProjectFromDeclarations(
    parsed.declarations,
    sourceText,
    options,
    parsed.comments,
  );
  expect(result.diagnostics).toEqual([]);
  expect(result.project).toBeDefined();
  return result.sourceMarkupByNodeId;
}

function sourceMarkupFor(
  sourceText: string,
  sourceFileId = 'case.dtd',
  nodeId = 'dtd:element:root',
) {
  const parsed = parseDtdDeclarations(sourceText, sourceFileId);
  expect(parsed.diagnostics).toEqual([]);
  const result = buildDtdProjectFromDeclarations(
    parsed.declarations,
    sourceText,
    {
      projectId: `test:${sourceFileId}`,
      displayName: sourceFileId,
      sourceFileId,
      sourceFilename: sourceFileId,
    },
    parsed.comments,
  );
  expect(result.diagnostics).toEqual([]);
  return {
    markup: result.sourceMarkupByNodeId[nodeId],
    comments: result.comments,
  };
}

describe('DTD source markup builder', () => {
  it('preserves exact declaration, comment, whitespace, quote, and CRLF text', () => {
    const markup = buildSourceMarkup()['dtd:element:book'];

    expect(markup).toEqual({
      syntax: 'dtd',
      fragments: [
        expect.objectContaining({
          sourceFileId: 'source-markup.dtd',
          text: [
            '<!-- Book documentation. -->',
            '<!ELEMENT book (chapter+)><!-- Book trailing note. -->',
            '',
            '<!-- Primary book attributes. -->',
            '<!ATTLIST book',
            '  id ID #REQUIRED>',
          ].join('\r\n'),
        }),
        expect.objectContaining({
          sourceFileId: 'source-markup.dtd',
          text: [
            '<!-- Secondary book attributes. -->',
            '<!ATTLIST book',
            "  lang CDATA 'en'>",
          ].join('\r\n'),
        }),
      ],
    });
    expect(markup?.fragments[0]?.text).toContain(
      '<!ELEMENT book (chapter+)><!-- Book trailing note. -->',
    );
    expect(markup?.fragments[1]?.text).toContain("'en'");
    expect(markup?.fragments.map(({ text }) => text).join('')).not.toContain(
      '<!ELEMENT chapter',
    );
    expect(markup?.fragments.map(({ text }) => text).join('')).not.toContain(
      'Chapter-only',
    );
  });

  it('coalesces only touching or whitespace-separated source for one node', () => {
    const markup = buildSourceMarkup()['dtd:element:book'];

    expect(markup?.fragments).toHaveLength(2);
    expect(markup?.fragments[0]?.range.end.offset).toBeLessThan(
      markup?.fragments[1]?.range.start.offset ?? 0,
    );
    const gap = crlfSource.slice(
      markup?.fragments[0]?.range.end.offset,
      markup?.fragments[1]?.range.start.offset,
    );
    expect(gap).toContain('<!ELEMENT chapter');
    expect(gap.trim()).not.toBe('');
  });

  it('retains all exact ATTLIST declarations for their owner element only', () => {
    const markup = buildSourceMarkup();
    const bookText = markup['dtd:element:book']?.fragments
      .map(({ text }) => text)
      .join('\n');
    const chapterText = markup['dtd:element:chapter']?.fragments
      .map(({ text }) => text)
      .join('\n');

    expect(bookText?.match(/<!ATTLIST book/g)).toHaveLength(2);
    expect(bookText).not.toContain('<!ATTLIST chapter');
    expect(chapterText).toContain('<!ATTLIST chapter role CDATA #IMPLIED>');
    expect(chapterText).not.toContain('<!ATTLIST book');
  });

  it('returns deterministic plain JSON data without retaining source or ASTs', () => {
    const first = buildSourceMarkup();
    const second = buildSourceMarkup();
    const serialized = JSON.stringify(first);

    expect(second).toEqual(first);
    expect(JSON.parse(serialized)).toEqual(first);
    expect(serialized).not.toContain('"sourceText"');
    expect(serialized).not.toContain('"declarations"');
    expect(serialized).not.toContain('"ast"');
    expect(serialized).not.toContain('"parser"');
  });

  it('keeps source metadata outside the normalized graph and navigation data', () => {
    const parsed = parseDtdDeclarations(crlfSource, options.sourceFileId);
    const result = buildDtdProjectFromDeclarations(
      parsed.declarations,
      crlfSource,
      options,
      parsed.comments,
    );

    expect(result.project).not.toHaveProperty('sourceMarkupByNodeId');
    expect(
      result.project?.nodes.every(
        (node) => !('sourceMarkup' in node) && !('sourceRange' in node),
      ),
    ).toBe(true);
    expect(
      result.project?.edges.every((edge) => !('sourceMarkup' in edge)),
    ).toBe(true);
    expect(result.project?.rootNodeIds).toEqual(['dtd:element:book']);
  });

  it('omits declarations with invalid source provenance or offsets safely', () => {
    const source = '<!ELEMENT root EMPTY>';
    const parsed = parseDtdDeclarations(source, 'actual.dtd');
    const declaration = parsed.declarations[0];
    if (!declaration) throw new Error('Expected one parsed declaration.');

    const wrongSource: DtdDeclarationAst = {
      ...declaration,
      rawDeclarationRange: {
        ...declaration.rawDeclarationRange,
        sourceId: 'other.dtd',
      },
    };
    const invalidOffset: DtdDeclarationAst = {
      ...declaration,
      rawDeclarationRange: {
        ...declaration.rawDeclarationRange,
        end: {
          ...declaration.rawDeclarationRange.end,
          offset: source.length + 1,
        },
      },
    };

    expect(
      buildDtdSourceMarkupByNodeId([wrongSource], source, 'actual.dtd'),
    ).toEqual({});
    expect(
      buildDtdSourceMarkupByNodeId([invalidOffset], source, 'actual.dtd'),
    ).toEqual({});
  });

  it('ignores schema-level comments and matches attachments to exact declarations', () => {
    const source = [
      '<!-- root docs -->',
      '<!ELEMENT root EMPTY>',
      '<!-- footer retained only as schema metadata -->',
    ].join('\n');
    const parsed = parseDtdDeclarations(source, 'root.dtd');
    const attachments = attachDtdComments(
      parsed.comments,
      parsed.declarations,
      source,
      'root.dtd',
    );
    const markup = buildDtdSourceMarkupByNodeId(
      parsed.declarations,
      source,
      'root.dtd',
      attachments.comments,
    );

    expect(markup['dtd:element:root']?.fragments[0]?.text).toBe(
      '<!-- root docs -->\n<!ELEMENT root EMPTY>',
    );
    expect(JSON.stringify(markup)).not.toContain('footer retained');
  });

  it('preserves consecutive preceding and same-line trailing comments for ELEMENT and empty ATTLIST declarations', () => {
    const source = [
      '<!-- first root note -->',
      '<!-- second root note -->',
      '<!ELEMENT root EMPTY><!-- root trailing -->',
      '<!-- attributes note -->',
      '<!ATTLIST root><!-- attributes trailing -->',
    ].join('\n');
    const { markup, comments } = sourceMarkupFor(source);

    expect(markup?.fragments).toHaveLength(1);
    expect(markup?.fragments[0]?.text).toBe(source);
    expect(markup?.fragments[0]?.text).not.toMatch(/\n$/);
    expect(
      comments.map(({ raw, attachmentKind, declarationKind }) => ({
        raw,
        attachmentKind,
        declarationKind,
      })),
    ).toEqual([
      {
        raw: '<!-- first root note -->',
        attachmentKind: 'preceding',
        declarationKind: 'element',
      },
      {
        raw: '<!-- second root note -->',
        attachmentKind: 'preceding',
        declarationKind: 'element',
      },
      {
        raw: '<!-- root trailing -->',
        attachmentKind: 'trailing',
        declarationKind: 'element',
      },
      {
        raw: '<!-- attributes note -->',
        attachmentKind: 'preceding',
        declarationKind: 'attributeList',
      },
      {
        raw: '<!-- attributes trailing -->',
        attachmentKind: 'trailing',
        declarationKind: 'attributeList',
      },
    ]);
  });

  it.each([
    ['LF', '\n'],
    ['CRLF', '\r\n'],
    ['isolated CR', '\r'],
  ])(
    'preserves %s line endings, multiline declarations, indentation, and both quote styles',
    (_name, newline) => {
      const rootBlock = [
        '<!ELEMENT root (',
        '  child',
        ')>',
        '<!ATTLIST root',
        '  title CDATA "double"',
        "  note CDATA 'single'",
        '>',
      ].join(newline);
      const source = `${rootBlock}${newline}<!ELEMENT child EMPTY>`;
      const { markup } = sourceMarkupFor(source);

      expect(markup?.fragments).toHaveLength(1);
      expect(markup?.fragments[0]?.text).toBe(rootBlock);
      expect(markup?.fragments[0]?.text).toContain(`"double"`);
      expect(markup?.fragments[0]?.text).toContain(`'single'`);
      expect(
        markup?.fragments[0]?.text
          .match(/\r\n|\r|\n/g)
          ?.every((lineEnding) => lineEnding === newline),
      ).toBe(true);
    },
  );

  it('sorts reversed declaration input and coalesces touching and overlapping intervals', () => {
    const touchingSource =
      '<!ATTLIST root a CDATA #IMPLIED><!ELEMENT root EMPTY><!ATTLIST root b CDATA #IMPLIED>';
    const parsed = parseDtdDeclarations(touchingSource, 'touching.dtd');
    expect(parsed.diagnostics).toEqual([]);
    const before = JSON.stringify(parsed.declarations);
    const reversed = [...parsed.declarations].reverse();
    const markup = buildDtdSourceMarkupByNodeId(
      [...reversed, reversed[0]!],
      touchingSource,
      'touching.dtd',
    );

    expect(markup['dtd:element:root']?.fragments).toHaveLength(1);
    expect(markup['dtd:element:root']?.fragments[0]?.text).toBe(touchingSource);
    expect(JSON.stringify(parsed.declarations)).toBe(before);
  });

  it('keeps separately extracted non-whitespace syntax out of element source fragments', () => {
    const source = [
      '<!ELEMENT root EMPTY>',
      '<!ENTITY unrelated "not imported">',
      '<!ATTLIST root id ID #IMPLIED>',
    ].join('\n');
    const parsed = parseDtdDeclarations(source, 'unsupported-gap.dtd');
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.constructs?.map(({ kind }) => kind)).toContain(
      'entityDeclaration',
    );
    const markup = buildDtdSourceMarkupByNodeId(
      parsed.declarations,
      source,
      'unsupported-gap.dtd',
    );
    const fragments = markup['dtd:element:root']?.fragments;

    expect(fragments?.map(({ text }) => text)).toEqual([
      '<!ELEMENT root EMPTY>',
      '<!ATTLIST root id ID #IMPLIED>',
    ]);
    expect(JSON.stringify(fragments)).not.toContain('<!ENTITY');
  });

  it('keeps each fragment range exact, adds no trimming, and excludes cross-source intervals', () => {
    const source = '<!ELEMENT root EMPTY>\n<!ATTLIST root id ID #IMPLIED>';
    const parsed = parseDtdDeclarations(source, 'range.dtd');
    const element = parsed.declarations[0];
    const attributeList = parsed.declarations[1];
    if (!element || !attributeList) {
      throw new Error('Expected ELEMENT and ATTLIST declarations.');
    }
    const crossSource: DtdDeclarationAst = {
      ...attributeList,
      rawDeclarationRange: {
        ...attributeList.rawDeclarationRange,
        sourceId: 'other.dtd',
      },
    };
    const markup = buildDtdSourceMarkupByNodeId(
      [element, crossSource],
      source,
      'range.dtd',
    );
    const fragment = markup['dtd:element:root']?.fragments[0];

    expect(fragment?.text).toBe('<!ELEMENT root EMPTY>');
    expect(fragment?.text).toBe(
      source.slice(fragment.range.start.offset, fragment.range.end.offset),
    );
    expect(fragment?.range.sourceId).toBe(fragment?.sourceFileId);
  });
});
