import { describe, expect, it } from 'vitest';
import { importXsdSource } from '../../schema/xsd';
import type {
  SchemaNode,
  SchemaOccurrence,
  SchemaProject,
} from '../../schema/model';
import basicStructure from '../../../tests/fixtures/xsd/basic-structure.xsd?raw';
import externalReferences from '../../../tests/fixtures/xsd/external-references.xsd?raw';
import sameDocumentReferences from '../../../tests/fixtures/xsd/same-document-references.xsd?raw';
import {
  bookDtdNodeIds,
  bookDtdProject,
} from '../../schema/samples/bookDtdProject';
import { formatOutgoingRelationshipLabel } from './schemaRelationshipPresentation';
import {
  formatXsdLocalForm,
  formatXsdOccurrence,
  formatXsdReference,
  formatXsdScope,
  getSchemaNodeDisplayName,
  selectXsdNavigationGroups,
  selectXsdNodePresentation,
} from './xsdMetadataPresentation';

function importFixture(name: string, source: string) {
  const result = importXsdSource(source, {
    projectId: `presentation:${name}`,
    displayName: name,
    sourceFileId: `${name}:source`,
    sourceFilename: `${name}.xsd`,
  });
  expect(result.status).toBe('success');
  if (result.status !== 'success') {
    throw new Error(`Expected ${name} to import successfully.`);
  }
  return result;
}

function nodeBy(
  project: SchemaProject,
  kind: SchemaNode['kind'],
  name?: string,
): SchemaNode {
  const node = project.nodes.find(
    (candidate) =>
      candidate.kind === kind &&
      (name === undefined || candidate.name === name),
  );
  if (!node) throw new Error(`Missing ${kind} node ${name ?? ''}.`);
  return node;
}

describe('XSD metadata presentation', () => {
  it.each([
    [{ min: 1, max: 1 }, '1'],
    [{ min: 0, max: 1 }, '0..1'],
    [{ min: 1, max: 'unbounded' }, '1..unbounded'],
    [{ min: 2, max: 5 }, '2..5'],
  ] satisfies readonly [SchemaOccurrence, string][])(
    'formats occurrence %j as %s',
    (occurrence, expected) => {
      expect(formatXsdOccurrence(occurrence)).toBe(expected);
    },
  );

  it('formats scope and local form without exposing internal status names', () => {
    expect(formatXsdScope({ scope: 'global' })).toBe('Global');
    expect(formatXsdScope({ scope: 'local' })).toBe('Local');
    expect(formatXsdScope({ scope: 'anonymous' })).toBe('Anonymous');
    expect(formatXsdScope({ scope: 'schema' })).toBeUndefined();
    expect(
      formatXsdLocalForm({
        localForm: { resolution: 'inherited', value: 'qualified' },
      }),
    ).toBe('qualified (inherited)');
    expect(
      formatXsdLocalForm({
        localForm: {
          resolution: 'explicitDeferred',
          lexicalValue: 'unqualified',
        },
      }),
    ).toBe('unqualified (explicit; deferred)');
  });

  it('presents schema, global, local, type, and compositor orientation metadata', () => {
    const imported = importFixture('same-document', sameDocumentReferences);
    const { project, xsdMetadataByNodeId } = imported;
    const schema = nodeBy(project, 'schema');
    const global = nodeBy(project, 'globalElement', 'root');
    const local = nodeBy(project, 'elementReference', 'g:item');
    const namedType = nodeBy(project, 'complexType', 'RootType');
    const anonymousType = project.nodes.find(
      (node) =>
        node.kind === 'complexType' &&
        xsdMetadataByNodeId[node.id]?.scope === 'anonymous',
    );
    const sequence = nodeBy(project, 'sequence');

    expect(
      selectXsdNodePresentation(project, schema.id, xsdMetadataByNodeId)
        ?.properties,
    ).toEqual(
      expect.arrayContaining([
        {
          id: 'source-file',
          label: 'Source file',
          value: 'same-document.xsd',
        },
        {
          id: 'target-namespace',
          label: 'Target namespace',
          value: 'urn:graph',
        },
        {
          id: 'element-form-default',
          label: 'Element form default',
          value: 'qualified',
        },
      ]),
    );
    expect(
      selectXsdNodePresentation(project, global.id, xsdMetadataByNodeId)
        ?.properties,
    ).toEqual(
      expect.arrayContaining([
        { id: 'scope', label: 'Scope', value: 'Global' },
        {
          id: 'namespace',
          label: 'Namespace',
          value: 'urn:graph',
        },
        { id: 'type', label: 'Type', value: 'RootType (g:RootType)' },
      ]),
    );
    expect(
      selectXsdNodePresentation(project, local.id, xsdMetadataByNodeId)
        ?.properties,
    ).toEqual(
      expect.arrayContaining([
        { id: 'scope', label: 'Scope', value: 'Local' },
        { id: 'occurs', label: 'Occurs', value: '0..unbounded' },
        {
          id: 'element-form',
          label: 'Element form',
          value: 'qualified (inherited)',
        },
        { id: 'references', label: 'References', value: 'item (g:item)' },
      ]),
    );
    expect(
      selectXsdNodePresentation(project, namedType.id, xsdMetadataByNodeId)
        ?.properties,
    ).toEqual([
      { id: 'scope', label: 'Scope', value: 'Global' },
      {
        id: 'namespace',
        label: 'Namespace',
        value: 'urn:graph',
      },
    ]);
    expect(anonymousType).toBeDefined();
    expect(
      selectXsdNodePresentation(project, anonymousType!.id, xsdMetadataByNodeId)
        ?.properties,
    ).toContainEqual({
      id: 'scope',
      label: 'Scope',
      value: 'Anonymous',
    });
    expect(
      selectXsdNodePresentation(project, sequence.id, xsdMetadataByNodeId)
        ?.properties,
    ).toContainEqual({
      id: 'occurs',
      label: 'Occurs',
      value: '0..2',
    });
  });

  it('keeps external references noninteractive and built-ins navigable', () => {
    const imported = importFixture('external', externalReferences);
    const { project, xsdMetadataByNodeId } = imported;
    const root = nodeBy(project, 'globalElement', 'root');
    const builtIn = nodeBy(project, 'localElement', 'builtIn');

    expect(
      selectXsdNodePresentation(project, root.id, xsdMetadataByNodeId)
        ?.typeReference,
    ).toEqual({
      text: 'ext:ExternalType (external)',
      navigable: false,
    });
    expect(
      selectXsdNodePresentation(project, builtIn.id, xsdMetadataByNodeId)
        ?.typeReference,
    ).toEqual({
      text: 'xs:string',
      targetNodeId: 'xsd:builtInType:string',
      navigable: true,
    });
  });

  it('resolves a valid target display name but safely falls back for stale metadata', () => {
    const imported = importFixture('basic', basicStructure);
    const book = nodeBy(imported.project, 'globalElement', 'book');
    const metadata = imported.xsdMetadataByNodeId[book.id]!;
    const before = JSON.stringify(imported);

    expect(
      formatXsdReference(imported.project, metadata.typeReference),
    ).toEqual({
      text: 'BookType (tns:BookType)',
      targetNodeId: nodeBy(imported.project, 'complexType', 'BookType').id,
      navigable: true,
    });
    expect(
      formatXsdReference(imported.project, {
        ...metadata.typeReference!,
        targetNodeId: 'missing',
      }),
    ).toEqual({ text: 'tns:BookType', navigable: false });
    expect(JSON.stringify(imported)).toBe(before);
  });

  it('groups source-ordered document elements, helper globals, and named global types', () => {
    const imported = importFixture('same-document', sameDocumentReferences);
    const groups = selectXsdNavigationGroups(
      imported.project,
      imported.xsdMetadataByNodeId,
    );

    expect(groups.schemaOverview?.kind).toBe('schema');
    expect(groups.documentElements.map(({ name }) => name)).toEqual(['root']);
    expect(groups.otherGlobalElements.map(({ name }) => name)).toEqual([
      'item',
    ]);
    expect(groups.globalElements).toEqual([]);
    expect(groups.complexTypes.map(({ name }) => name)).toEqual([
      'RootType',
      'ItemType',
    ]);
    expect(groups.simpleTypes.map(({ name }) => name)).toEqual(['CodeType']);
    expect(
      [...groups.complexTypes, ...groups.simpleTypes].every(
        ({ id }) =>
          imported.xsdMetadataByNodeId[id]?.scope === 'global' &&
          imported.xsdMetadataByNodeId[id]?.anonymous !== true,
      ),
    ).toBe(true);
  });

  it('uses a fixed schema overview name without changing DTD or element names', () => {
    const imported = importFixture('basic', basicStructure);
    const schema = nodeBy(imported.project, 'schema');
    const book = nodeBy(imported.project, 'globalElement', 'book');

    expect(
      getSchemaNodeDisplayName(
        imported.project,
        schema,
        imported.xsdMetadataByNodeId,
      ),
    ).toBe('Schema overview');
    expect(
      getSchemaNodeDisplayName(
        imported.project,
        book,
        imported.xsdMetadataByNodeId,
      ),
    ).toBe('book');
    expect(
      getSchemaNodeDisplayName(bookDtdProject, bookDtdProject.nodes[0]!, {}),
    ).toBe(bookDtdProject.nodes[0]!.name);
  });

  it('shows an explicit no-target-namespace value only on schema overview', () => {
    const imported = importFixture(
      'no-namespace',
      '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="root"/></xs:schema>',
    );
    const schema = nodeBy(imported.project, 'schema');

    expect(
      selectXsdNodePresentation(
        imported.project,
        schema.id,
        imported.xsdMetadataByNodeId,
      )?.properties,
    ).toContainEqual({
      id: 'target-namespace',
      label: 'Target namespace',
      value: 'No target namespace',
    });
  });

  it('returns empty presentation for DTD, missing, mismatched, or absent metadata', () => {
    expect(
      selectXsdNodePresentation(bookDtdProject, bookDtdNodeIds.book, {}),
    ).toBeUndefined();
    expect(
      selectXsdNodePresentation(bookDtdProject, 'missing', {}),
    ).toBeUndefined();
    expect(
      selectXsdNodePresentation(bookDtdProject, bookDtdNodeIds.book, {
        [bookDtdNodeIds.book]: {
          kind: 'schema',
          scope: 'schema',
          sourceFileId: 'book.dtd',
          sourceOrder: 0,
          sourceRange: {
            start: { offset: 0, line: 1, column: 1 },
            end: { offset: 1, line: 1, column: 2 },
          },
          startTagRange: {
            start: { offset: 0, line: 1, column: 1 },
            end: { offset: 1, line: 1, column: 2 },
          },
        },
      }),
    ).toBeUndefined();
  });
});

describe('outgoing relationship labels', () => {
  it.each([
    ['contains', 'Child'],
    ['typeOf', 'Type'],
    ['references', 'Referenced element'],
    ['extends', 'Base type'],
    ['restricts', 'Base type'],
    ['usesGroup', 'Group'],
    ['usesAttributeGroup', 'Attribute group'],
    ['substitutes', 'Substitution'],
    ['imports', 'Imported schema'],
    ['includes', 'Included schema'],
  ] as const)('formats %s as sentence-case %s', (kind, label) => {
    expect(formatOutgoingRelationshipLabel(kind)).toBe(label);
  });

  it.each([
    ['globalElement', 'Global element declaration'],
    ['complexType', 'Complex type declaration'],
    ['simpleType', 'Simple type declaration'],
    ['sequence', 'Global declaration'],
  ] as const)(
    'presents schema containment to %s as %s',
    (targetKind, expected) => {
      expect(
        formatOutgoingRelationshipLabel('contains', 'schema', targetKind),
      ).toBe(expected);
    },
  );
});
