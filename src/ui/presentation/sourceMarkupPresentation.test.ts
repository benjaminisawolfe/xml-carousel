import { describe, expect, it } from 'vitest';
import type {
  SchemaNodeKind,
  SchemaProject,
  SchemaSourceMarkupByNodeId,
  SchemaSourceRange,
} from '../../schema/model';
import type { XsdMetadataByNodeId, XsdNodeMetadata } from '../../schema/xsd';
import {
  isSourceMarkupSyntaxCompatible,
  selectNodeSourceMarkup,
} from './sourceMarkupPresentation';
import sourceMarkupPresentationSource from './sourceMarkupPresentation.ts?raw';

function range(
  text: string,
  sourceId: string,
  startOffset = 0,
): SchemaSourceRange {
  return {
    start: { offset: startOffset, line: 1, column: startOffset + 1 },
    end: {
      offset: startOffset + text.length,
      line: 1,
      column: startOffset + text.length + 1,
    },
    sourceId,
  };
}

function xsdMetadata(
  kind: SchemaNodeKind,
  sourceRange: SchemaSourceRange,
): XsdNodeMetadata {
  return {
    kind,
    scope: kind === 'schema' ? 'schema' : 'global',
    sourceFileId: 'fixture.xsd',
    sourceOrder: sourceRange.start.offset,
    sourceRange,
    startTagRange: sourceRange,
  };
}

const xsdTexts = {
  schema: '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"></xs:schema>',
  complexType: '<xs:complexType name="Example"><xs:sequence/></xs:complexType>',
  extension: '<xs:extension base="Example"><xs:sequence/></xs:extension>',
} as const;

const project: SchemaProject = {
  id: 'source-presentation',
  displayName: 'Source presentation',
  sourceFiles: [
    { id: 'fixture.dtd', filename: 'fixture.dtd' },
    { id: 'fixture.xsd', filename: 'fixture.xsd' },
  ],
  nodes: [
    {
      id: 'dtd-root',
      kind: 'dtdElement',
      name: 'root',
      sourceFileId: 'fixture.dtd',
    },
    { id: 'source-less', kind: 'dtdElement', name: 'source-less' },
    {
      id: 'dtd-attribute',
      kind: 'dtdAttribute',
      name: 'id',
      sourceFileId: 'fixture.dtd',
    },
    {
      id: 'schema',
      kind: 'schema',
      name: 'Schema overview',
      sourceFileId: 'fixture.xsd',
    },
    {
      id: 'complex-type',
      kind: 'complexType',
      name: 'Example',
      sourceFileId: 'fixture.xsd',
    },
    {
      id: 'extension',
      kind: 'extension',
      name: 'Extension of Example',
      sourceFileId: 'fixture.xsd',
    },
  ],
  edges: [],
  rootNodeIds: ['dtd-root', 'schema'],
};

const dtdText = '<!ELEMENT root EMPTY>';
const dtdRange = range(dtdText, 'fixture.dtd');
const xsdRanges = {
  schema: range(xsdTexts.schema, 'fixture.xsd'),
  'complex-type': range(xsdTexts.complexType, 'fixture.xsd', 100),
  extension: range(xsdTexts.extension, 'fixture.xsd', 200),
} as const;

const markup: SchemaSourceMarkupByNodeId = {
  'dtd-root': {
    syntax: 'dtd',
    fragments: [
      {
        id: 'dtd-root:0',
        sourceFileId: 'fixture.dtd',
        range: dtdRange,
        text: dtdText,
      },
    ],
  },
  schema: {
    syntax: 'xsd',
    fragments: [
      {
        id: 'schema:0',
        sourceFileId: 'fixture.xsd',
        range: xsdRanges.schema,
        text: xsdTexts.schema,
      },
    ],
  },
  'complex-type': {
    syntax: 'xsd',
    fragments: [
      {
        id: 'complex-type:0',
        sourceFileId: 'fixture.xsd',
        range: xsdRanges['complex-type'],
        text: xsdTexts.complexType,
      },
    ],
  },
  extension: {
    syntax: 'xsd',
    fragments: [
      {
        id: 'extension:0',
        sourceFileId: 'fixture.xsd',
        range: xsdRanges.extension,
        text: xsdTexts.extension,
      },
    ],
  },
};

const xsdMetadataByNodeId: XsdMetadataByNodeId = {
  schema: xsdMetadata('schema', xsdRanges.schema),
  'complex-type': xsdMetadata('complexType', xsdRanges['complex-type']),
  extension: xsdMetadata('extension', xsdRanges.extension),
};

describe('source markup presentation selector', () => {
  it('selects valid DTD element fragments without parser dependencies', () => {
    const selected = selectNodeSourceMarkup(project, 'dtd-root', markup);
    expect(selected).toEqual(markup['dtd-root']);
    expect(selected).not.toBe(markup['dtd-root']);
    expect(selected?.fragments).not.toBe(markup['dtd-root']?.fragments);
    expect(selected?.fragments[0]).not.toBe(markup['dtd-root']?.fragments[0]);
    expect(sourceMarkupPresentationSource).not.toMatch(
      /schema\/dtd|dtdParser|parseDtd/,
    );
  });

  it.each([
    ['schema', xsdTexts.schema],
    ['complex-type', xsdTexts.complexType],
    ['extension', xsdTexts.extension],
  ])('selects accepted XSD %s markup', (nodeId, expectedText) => {
    const selected = selectNodeSourceMarkup(
      project,
      nodeId,
      markup,
      xsdMetadataByNodeId,
    );
    expect(selected).toMatchObject({
      syntax: 'xsd',
      fragments: [{ text: expectedText }],
    });
    expect(selected).not.toBe(markup[nodeId]);
    expect(selected?.fragments[0]?.range).not.toBe(
      markup[nodeId]?.fragments[0]?.range,
    );
  });

  it('uses an explicit node-kind and syntax compatibility contract', () => {
    expect(isSourceMarkupSyntaxCompatible('dtdElement', 'dtd')).toBe(true);
    expect(isSourceMarkupSyntaxCompatible('dtdElement', 'xsd')).toBe(false);
    expect(isSourceMarkupSyntaxCompatible('extension', 'xsd')).toBe(true);
    expect(isSourceMarkupSyntaxCompatible('extension', 'dtd')).toBe(false);
  });

  it('rejects DTD markup for XSD nodes and XSD markup for DTD nodes', () => {
    expect(
      selectNodeSourceMarkup(
        project,
        'schema',
        { schema: markup['dtd-root']! },
        xsdMetadataByNodeId,
      ),
    ).toBeUndefined();
    expect(
      selectNodeSourceMarkup(project, 'dtd-root', {
        'dtd-root': markup.schema!,
      }),
    ).toBeUndefined();
  });

  it('returns no markup for stale IDs or source-less nodes while allowing DTD attributes', () => {
    expect(
      selectNodeSourceMarkup(project, 'missing', {
        missing: markup['dtd-root']!,
      }),
    ).toBeUndefined();
    expect(
      selectNodeSourceMarkup(project, 'source-less', {
        'source-less': markup['dtd-root']!,
      }),
    ).toBeUndefined();
    expect(
      selectNodeSourceMarkup(project, 'dtd-attribute', {
        'dtd-attribute': markup['dtd-root']!,
      }),
    ).toEqual(markup['dtd-root']);
  });

  it('rejects XSD source-file, source-range, and text-length mismatches', () => {
    const fragment = markup.extension!.fragments[0]!;
    const invalidCases: SchemaSourceMarkupByNodeId[] = [
      {
        extension: {
          syntax: 'xsd',
          fragments: [{ ...fragment, sourceFileId: 'other.xsd' }],
        },
      },
      {
        extension: {
          syntax: 'xsd',
          fragments: [
            {
              ...fragment,
              range: {
                ...fragment.range,
                start: { ...fragment.range.start, column: 99 },
              },
            },
          ],
        },
      },
      {
        extension: {
          syntax: 'xsd',
          fragments: [{ ...fragment, text: 'short' }],
        },
      },
      {
        extension: {
          syntax: 'xsd',
          fragments: [fragment, { ...fragment, id: 'duplicate' }],
        },
      },
    ];

    for (const invalid of invalidCases) {
      expect(
        selectNodeSourceMarkup(
          project,
          'extension',
          invalid,
          xsdMetadataByNodeId,
        ),
      ).toBeUndefined();
    }
  });

  it('preserves DTD fragment filtering safeguards', () => {
    const invalid: SchemaSourceMarkupByNodeId = {
      'dtd-root': {
        syntax: 'dtd',
        fragments: [
          markup['dtd-root']!.fragments[0]!,
          {
            ...markup['dtd-root']!.fragments[0]!,
            id: 'wrong-source',
            sourceFileId: 'wrong.dtd',
          },
        ],
      },
    };

    expect(
      selectNodeSourceMarkup(project, 'dtd-root', invalid)?.fragments,
    ).toEqual([markup['dtd-root']!.fragments[0]]);
  });

  it('does not mutate project, metadata, or markup while selecting', () => {
    const before = structuredClone({
      project,
      markup,
      xsdMetadataByNodeId,
    });

    selectNodeSourceMarkup(project, 'extension', markup, xsdMetadataByNodeId);

    expect({ project, markup, xsdMetadataByNodeId }).toEqual(before);
  });
});
