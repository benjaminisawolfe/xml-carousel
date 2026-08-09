import { describe, expect, it } from 'vitest';
import type { InspectorSummary } from '../inspector/inspectorSummary';
import type { SourceViewPresentation } from './sourceMarkupPresentation';
import {
  formatNodeSummary,
  NODE_SUMMARY_COLLECTION_LIMIT,
  NODE_SUMMARY_EXCERPT_LIMIT,
  NODE_SUMMARY_VALUE_LIMIT,
} from './nodeSummaryPresentation';
import nodeSummaryPresentationSource from './nodeSummaryPresentation.ts?raw';

function summary(overrides: Partial<InspectorSummary> = {}): InspectorSummary {
  return {
    nodeId: 'chapter:id',
    displayName: 'chapter',
    kind: 'dtdElement',
    overviewProperties: [],
    showRelatedNodeKinds: true,
    isSchemaOverview: false,
    declarations: [],
    orderedDestinations: [],
    relatedDefinitions: [],
    attributes: [],
    globalAttributes: [],
    enumerationValues: [],
    documentation: [],
    appInfo: [],
    comments: [],
    incomingRelationships: [],
    unresolvedReferences: [],
    isStructuralLeaf: false,
    hasStructuralDestinations: false,
    ...overrides,
  };
}

function source(
  overrides: Partial<SourceViewPresentation> = {},
): SourceViewPresentation {
  return {
    projectId: 'project:id',
    nodeId: 'chapter:id',
    displayName: 'chapter',
    nodeKind: 'dtdElement',
    nodeKindLabel: 'DTD element declaration',
    sourceIdentity: {
      kind: 'packageRelativePath',
      label: 'schemas/book.dtd',
    },
    location: {
      kind: 'exactLineColumn',
      line: 4,
      column: 2,
      label: 'Line 4, column 2 · exact',
    },
    syntax: 'dtd',
    fragments: [],
    sourceAvailable: true,
    ...overrides,
  };
}

describe('node summary presentation', () => {
  it('formats the exact bounded DTD handoff in semantic field order', () => {
    const value = summary({
      displayName: '  chapter\n declaration  ',
      overviewProperties: [
        { id: 'source-file', label: 'Source file', value: 'hidden.dtd' },
        { id: 'base-type', label: 'Base type', value: '  Base\nType ' },
        { id: 'kind', label: 'Kind', value: 'hidden kind' },
        { id: 'type', label: 'Type', value: '  ChapterType ' },
        { id: 'scope', label: 'Scope', value: ' Global ' },
      ],
      orderedDestinations: [
        {
          relationshipId: 'edge:section',
          nodeId: 'node:section',
          displayName: 'section',
          kind: 'dtdElement',
          occurrence: '*',
          order: 1,
          disposition: 'terminalCycleClosure',
          targetJourneyPosition: 99,
        },
        {
          relationshipId: 'edge:title',
          nodeId: 'node:title',
          displayName: ' title ',
          kind: 'dtdElement',
          occurrence: '',
          order: 0,
        },
        {
          relationshipId: 'edge:section-again',
          nodeId: 'node:section',
          displayName: 'section',
          kind: 'dtdElement',
          occurrence: '?',
          order: 2,
        },
      ],
      attributes: [
        {
          nodeId: 'attribute:lang',
          name: 'xml:lang',
          detailLines: [' NMTOKEN ', ' #IMPLIED '],
          order: 1,
        },
        {
          nodeId: 'attribute:id',
          name: 'id',
          detailLines: [' ID\n· #REQUIRED '],
          order: 0,
        },
      ],
      documentation: [
        {
          id: 'doc:later',
          text: 'Later',
          displayText: 'Later',
          isEmpty: false,
          order: 1,
        },
        {
          id: 'doc:first',
          text: ' First\n documentation for <identity> & "owner" ',
          displayText: ' First\n documentation for <identity> & "owner" ',
          isEmpty: false,
          order: 0,
        },
      ],
      comments: [
        { commentId: 'comment:2', text: ' Later comment ', order: 2 },
        { commentId: 'comment:1', text: ' First\tcomment ', order: 1 },
      ],
      incomingRelationships: [
        {
          relationshipId: 'edge:appendix',
          nodeId: 'node:appendix',
          displayName: 'appendix',
          kind: 'dtdElement',
          relationshipKind: 'contentModelMember',
          order: 2,
        },
        {
          relationshipId: 'edge:book-again',
          nodeId: 'node:book',
          displayName: 'book duplicate edge',
          kind: 'dtdElement',
          relationshipKind: 'referencesElementName',
          order: 1,
        },
        {
          relationshipId: 'edge:book',
          nodeId: 'node:book',
          displayName: 'book',
          kind: 'dtdElement',
          relationshipKind: 'contentModelMember',
          order: 0,
        },
      ],
    });

    const formatted = formatNodeSummary(value, source());

    expect(formatted).toBe(
      [
        'Name: chapter declaration',
        'Kind: DTD element declaration',
        'Source: schemas/book.dtd',
        'Location: Line 4, column 2 · exact',
        'Scope: Global',
        'Type: ChapterType',
        'Base type: Base Type',
        'Structural destinations: title; section*; section?',
        'Attributes: id (ID · #REQUIRED); xml:lang (NMTOKEN · #IMPLIED)',
        'Documentation: First documentation for <identity> & "owner" (+1 more)',
        'Comment: First comment (+1 more)',
        'Used by: 2 declarations — book; appendix',
      ].join('\n'),
    );
    expect(formatted).not.toMatch(/\n\n|\n$/u);
    expect(formatted).not.toContain('\r');
    expect(formatted).not.toMatch(/```|^#|^\{|^</mu);
    expect(formatted).not.toContain('N/A');
    expect(formatted).not.toContain('chapter:id');
    expect(formatted).not.toContain('edge:');
    expect(formatNodeSummary(value, source())).toBe(formatted);
  });

  it('uses only direct schema declarations, preserves duplicates, and ignores journey state', () => {
    const direct = summary({
      kind: 'schema',
      displayName: 'Schema overview',
      isSchemaOverview: true,
      declarations: [
        {
          relationshipId: 'declaration:self-cycle',
          relationshipLabel: 'owns declaration',
          nodeId: 'chapter:id',
          displayName: 'Schema overview',
          kind: 'schema',
          occurrence: '',
          order: 0,
          disposition: 'advance',
        },
        {
          relationshipId: 'declaration:cycle-peer',
          relationshipLabel: 'owns declaration',
          nodeId: 'node:one',
          displayName: 'Thing',
          kind: 'globalElement',
          occurrence: '',
          order: 1,
          disposition: 'advance',
        },
        {
          relationshipId: 'declaration:repeated-peer',
          relationshipLabel: 'owns declaration',
          nodeId: 'node:one',
          displayName: 'Thing',
          kind: 'globalElement',
          occurrence: '',
          order: 2,
          disposition: 'terminalCycleClosure',
          targetJourneyPosition: 0,
          isCurrentFocusClosure: true,
          terminalLabel: 'Cycle closes',
        },
      ],
      orderedDestinations: [
        {
          relationshipId: 'ignored:nested',
          nodeId: 'ignored:nested',
          displayName: 'Nested child',
          kind: 'localElement',
          occurrence: '*',
          order: 0,
        },
      ],
      relatedDefinitions: [
        {
          relationshipId: 'ignored:related',
          nodeId: 'ignored:related',
          displayName: 'Related definition',
          kind: 'complexType',
          relationshipKind: 'typeOf',
          relationshipLabel: 'uses type',
          order: 0,
        },
      ],
    });
    const changedJourneyState = summary({
      ...direct,
      declarations: direct.declarations.map((declaration) => ({
        ...declaration,
        disposition: 'advance' as const,
        targetJourneyPosition: 400,
        isCurrentFocusClosure: false,
        terminalLabel: 'Changed transient state',
      })),
    });

    expect(formatNodeSummary(direct, undefined)).toBe(
      'Name: Schema overview\nKind: Schema\nStructural destinations: Schema overview; Thing; Thing',
    );
    expect(formatNodeSummary(changedJourneyState, undefined)).toBe(
      formatNodeSummary(direct, undefined),
    );
  });

  it('bounds scalar values, collections, and annotation excerpts centrally', () => {
    const long = 'x'.repeat(NODE_SUMMARY_VALUE_LIMIT + 40);
    const entries = Array.from(
      { length: NODE_SUMMARY_COLLECTION_LIMIT + 5 },
      (_, order) => ({
        relationshipId: `edge:${order}`,
        nodeId: `node:${order}`,
        displayName: `destination ${order}`,
        kind: 'localElement' as const,
        occurrence: order % 2 === 0 ? '*' : '',
        order,
      }),
    );
    const value = summary({
      displayName: long,
      orderedDestinations: entries,
      attributes: Array.from(
        { length: NODE_SUMMARY_COLLECTION_LIMIT + 5 },
        (_, order) => ({
          nodeId: `attribute:${order}`,
          name: `attribute ${order}`,
          detailLines: ['xs:string', 'Optional'],
          order,
        }),
      ),
      incomingRelationships: Array.from(
        { length: NODE_SUMMARY_COLLECTION_LIMIT + 5 },
        (_, order) => ({
          relationshipId: `incoming:${order}`,
          nodeId: `declaration:${order}`,
          displayName: `declaration ${order}`,
          kind: 'globalElement' as const,
          relationshipKind: 'referencesDeclaration' as const,
          order,
        }),
      ),
      documentation: [
        {
          id: 'doc:long',
          text: long,
          displayText: long,
          isEmpty: false,
          order: 0,
        },
      ],
      comments: [
        { commentId: 'comment:empty', text: '  ', order: 0 },
        { commentId: 'comment:readable', text: ' readable ', order: 1 },
      ],
    });
    const formatted = formatNodeSummary(
      value,
      source({
        sourceIdentity: {
          kind: 'standaloneFilename',
          label: 'C:\\private\\absolute\\schema.dtd',
        },
      }),
    );
    const name = formatted.split('\n')[0]!.slice('Name: '.length);
    const documentation = formatted
      .split('\n')
      .find((line) => line.startsWith('Documentation: '))!
      .slice('Documentation: '.length);

    expect(Array.from(name)).toHaveLength(NODE_SUMMARY_VALUE_LIMIT);
    expect(name.endsWith('…')).toBe(true);
    expect(Array.from(documentation)).toHaveLength(NODE_SUMMARY_EXCERPT_LIMIT);
    expect(documentation.endsWith('…')).toBe(true);
    expect(formatted).toContain('destination 19; +5 more');
    expect(formatted).toContain('attribute 19 (xs:string · Optional); +5 more');
    expect(formatted).toContain('25 declarations — declaration 0;');
    expect(formatted).toContain('declaration 19; +5 more');
    expect(formatted).toContain('Comment: readable');
    expect(formatted).not.toContain('Source:');
    expect(formatted).not.toContain('C:\\private');

    const longPackagePath = `schemas/${long}.xsd`;
    const packageFormatted = formatNodeSummary(
      summary(),
      source({
        sourceIdentity: {
          kind: 'packageRelativePath',
          label: longPackagePath,
        },
      }),
    );
    const copiedPath = packageFormatted
      .split('\n')
      .find((line) => line.startsWith('Source: '))!
      .slice('Source: '.length);
    expect(Array.from(copiedPath)).toHaveLength(NODE_SUMMARY_VALUE_LIMIT);
    expect(copiedPath.startsWith('schemas/')).toBe(true);
    expect(copiedPath.endsWith('…')).toBe(true);

    const longRelationship = formatNodeSummary(
      summary({
        orderedDestinations: [
          {
            relationshipId: 'edge:long',
            nodeId: 'node:long',
            displayName: long,
            kind: 'localElement',
            occurrence: '',
            order: 0,
          },
        ],
      }),
      undefined,
    );
    const copiedRelationship = longRelationship
      .split('\n')
      .find((line) => line.startsWith('Structural destinations: '))!
      .slice('Structural destinations: '.length);
    expect(Array.from(copiedRelationship)).toHaveLength(
      NODE_SUMMARY_VALUE_LIMIT,
    );
    expect(copiedRelationship.endsWith('…')).toBe(true);
  });

  it.each([
    {
      kind: 'globalElement' as const,
      properties: [
        { id: 'type', label: 'Type', value: 'tns:BookType' },
        { id: 'namespace', label: 'Namespace', value: 'urn:books' },
        { id: 'scope', label: 'Scope', value: 'Global' },
      ],
      expected:
        'Name: node\nKind: Global element declaration\nScope: Global\nNamespace: urn:books\nType: tns:BookType',
    },
    {
      kind: 'localElement' as const,
      properties: [
        { id: 'occurs', label: 'Occurs', value: '0..unbounded' },
        { id: 'element-form', label: 'Element form', value: 'Qualified' },
        { id: 'references', label: 'References', value: 'tns:item' },
      ],
      expected:
        'Name: node\nKind: Local element declaration\nReferences: tns:item\nOccurs: 0..unbounded\nElement form: Qualified',
    },
    {
      kind: 'complexType' as const,
      properties: [
        { id: 'base-type', label: 'Base type', value: 'tns:Base' },
        { id: 'derivation', label: 'Derivation', value: 'Extension' },
      ],
      expected:
        'Name: node\nKind: Complex type declaration\nBase type: tns:Base\nDerivation: Extension',
    },
    {
      kind: 'simpleType' as const,
      properties: [
        { id: 'allowed-values', label: 'Allowed values', value: 'A, B' },
        { id: 'base-type', label: 'Base type', value: 'xs:string' },
      ],
      expected:
        'Name: node\nKind: Simple type declaration\nBase type: xs:string\nAllowed values: A, B',
    },
    {
      kind: 'elementReference' as const,
      properties: [
        { id: 'occurs', label: 'Occurs', value: '1' },
        { id: 'references', label: 'References', value: 'tns:item' },
      ],
      expected:
        'Name: node\nKind: Element reference\nReferences: tns:item\nOccurs: 1',
    },
  ])(
    'orders stable $kind properties without inventing metadata',
    ({ kind, properties, expected }) => {
      expect(
        formatNodeSummary(
          summary({
            displayName: 'node',
            kind,
            overviewProperties: properties,
          }),
          undefined,
        ),
      ).toBe(expected);
    },
  );

  it('does not mutate Inspector or source presentation inputs', () => {
    const value = summary({
      overviewProperties: [{ id: 'scope', label: 'Scope', value: 'Global' }],
      orderedDestinations: [
        {
          relationshipId: 'edge',
          nodeId: 'destination',
          displayName: 'destination',
          kind: 'dtdElement',
          occurrence: '+',
          order: 0,
        },
      ],
    });
    const presentation = source();
    const beforeValue = structuredClone(value);
    const beforePresentation = structuredClone(presentation);

    formatNodeSummary(value, presentation);

    expect(value).toEqual(beforeValue);
    expect(presentation).toEqual(beforePresentation);
  });

  it('keeps a useful Name-and-Kind minimum without optional placeholders', () => {
    expect(formatNodeSummary(summary(), undefined)).toBe(
      'Name: chapter\nKind: DTD element declaration',
    );
  });

  it('keeps the formatter pure and detached from browser and application state', () => {
    expect(nodeSummaryPresentationSource).not.toMatch(
      /svelte\/store|navigator|document\.|clipboard|localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|Date\.|Math\.random|crypto\.randomUUID/u,
    );
  });
});
