import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { importSchemaArchivePackage } from '../../app/import/schemaPackage';
import type { SchemaPackageUnresolvedReference } from '../../app/import/schemaPackage';
import {
  buildSchemaSetOutlinePresentation,
  buildUnresolvedReferencePresentation,
  formatSchemaPackageStatus,
  formatUnresolvedReason,
  formatUnresolvedReferenceKind,
  type SchemaSetNodePresentation,
} from './schemaSetOutlinePresentation';

async function packageFixture() {
  const zip = new JSZip();
  zip.file(
    'bundle/schemas/root.xsd',
    `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"
      xmlns:t="urn:test" targetNamespace="urn:test">
      <xs:element name="root" type="t:Shared"/>
      <xs:element name="secondary" type="xs:string"/>
      <xs:complexType name="Shared">
        <xs:sequence>
          <xs:element ref="t:secondary"/>
          <xs:element name="local" type="xs:string"/>
        </xs:sequence>
      </xs:complexType>
      <xs:simpleType name="Code">
        <xs:restriction base="xs:string"><xs:enumeration value="A"/></xs:restriction>
      </xs:simpleType>
      <xs:attribute name="lang" type="xs:string"/>
    </xs:schema>`,
    { createFolders: false },
  );
  zip.file(
    'bundle/legacy/book.dtd',
    `<!ELEMENT book (title)>
<!ELEMENT title (#PCDATA)>
<!ATTLIST book id ID #REQUIRED>`,
    { createFolders: false },
  );
  const bytes = await zip.generateAsync({
    type: 'uint8array',
    compression: 'STORE',
  });
  const result = await importSchemaArchivePackage({
    filename: 'catalogues.zip',
    data: bytes,
  });
  if (result.status !== 'success') {
    throw new Error('Expected schema package fixture to import.');
  }
  return result;
}

describe('schema-set outline presentation', () => {
  it('uses the exact package status singular and plural grammar', () => {
    expect(formatSchemaPackageStatus(1, 0)).toBe('1 schema file');
    expect(formatSchemaPackageStatus(2, 0)).toBe('2 schema files');
    expect(formatSchemaPackageStatus(1, 1)).toBe(
      '1 schema file · 1 unresolved reference',
    );
    expect(formatSchemaPackageStatus(2, 1)).toBe(
      '2 schema files · 1 unresolved reference',
    );
    expect(formatSchemaPackageStatus(2, 3)).toBe(
      '2 schema files · 3 unresolved references',
    );
  });

  it('preserves manifest source order and selects only outline entry points', async () => {
    const imported = await packageFixture();
    const dtdSource = imported.sources.find(({ format }) => format === 'dtd')!;
    const xsdSource = imported.sources.find(({ format }) => format === 'xsd')!;
    const presentationProject = {
      ...imported.project,
      nodes: [
        ...imported.project.nodes,
        {
          id: 'synthetic:dtd-entity',
          kind: 'dtdEntity' as const,
          name: 'publisher',
          sourceFileId: dtdSource.sourceFileId,
          sourceOrder: 1000,
        },
        {
          id: 'synthetic:dtd-notation',
          kind: 'dtdNotation' as const,
          name: 'jpg',
          sourceFileId: dtdSource.sourceFileId,
          sourceOrder: 1001,
        },
      ],
    };
    const input = {
      archiveFilename: imported.manifest.archiveFilename,
      manifest: imported.manifest,
      project: presentationProject,
      sources: imported.sources,
      entries: imported.entries,
      summary: imported.summary,
      unresolvedReferences: imported.unresolvedReferences,
      xsdMetadataByNodeId: imported.xsdMetadataByNodeId,
    };
    const before = JSON.stringify(input);
    const first = buildSchemaSetOutlinePresentation(input);
    const second = buildSchemaSetOutlinePresentation(input);

    expect(first).toEqual(second);
    expect(JSON.stringify(input)).toBe(before);
    expect(() => JSON.stringify(first)).not.toThrow();
    expect(first.archiveFilename).toBe('catalogues.zip');
    expect(first.sourceCount).toBe(2);
    expect(first.unresolvedReferenceCount).toBe(0);
    expect(first.sources.map(({ filename }) => filename)).toEqual(
      imported.sources.map(({ packageRelativePath }) => packageRelativePath),
    );
    expect(first.sources.map(({ formatLabel }) => formatLabel)).toEqual(
      imported.sources.map(({ format }) => (format === 'xsd' ? 'XSD' : 'DTD')),
    );
    expect(
      first.sources
        .find(({ format }) => format === 'xsd')
        ?.groups.map(({ label }) => label),
    ).toEqual([
      'Schema overview',
      'Document elements',
      'Other global elements',
      'Complex types',
      'Simple types',
      'Global attributes',
    ]);
    expect(
      first.sources
        .find(({ format }) => format === 'dtd')
        ?.groups.map(({ label }) => label),
    ).toEqual([
      'Root elements',
      'Other elements',
      'Attributes',
      'General entities',
      'Notations',
    ]);
    const allRows = first.sources.reduce<SchemaSetNodePresentation[]>(
      (sourceRows, { groups }) => [
        ...sourceRows,
        ...groups.reduce<SchemaSetNodePresentation[]>(
          (groupRows, { nodes }) => [...groupRows, ...nodes],
          [],
        ),
      ],
      [],
    );
    expect(allRows).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ displayName: 'local' }),
      ]),
    );
    expect(new Set(allRows.map(({ nodeId }) => nodeId)).size).toBe(
      allRows.length,
    );
    expect(
      allRows
        .filter(({ sourceFileId }) => sourceFileId === dtdSource.sourceFileId)
        .every(({ beginNewJourney }) => !beginNewJourney),
    ).toBe(true);
    expect(
      allRows
        .filter(({ sourceFileId }) => sourceFileId === xsdSource.sourceFileId)
        .every(({ beginNewJourney }) => beginNewJourney),
    ).toBe(true);
    expect(allRows.some((row) => 'isCurrentFocus' in row)).toBe(false);
    expect(allRows.some((row) => 'isInspected' in row)).toBe(false);
  });

  it('formats all unresolved kinds and reasons without exposing candidate IDs', async () => {
    const imported = await packageFixture();
    const owner = imported.project.nodes.find(
      ({ kind }) => kind === 'globalElement',
    )!;
    const candidate = imported.project.nodes.find(
      ({ kind }) => kind === 'complexType',
    )!;
    const range = {
      start: { offset: 4, line: 2, column: 5 },
      end: { offset: 12, line: 2, column: 13 },
      sourceId: owner.sourceFileId,
    };
    const reference: SchemaPackageUnresolvedReference = {
      id: 'schema-package-unresolved:test',
      sourceNodeId: owner.id,
      sourceFileId: owner.sourceFileId!,
      referenceKind: 'type',
      raw: 't:Shared',
      localName: 'Shared',
      namespaceUri: 'urn:test',
      reason: 'ambiguous',
      candidateNodeIds: [candidate.id],
      range,
    };
    const presented = buildUnresolvedReferencePresentation(
      imported.project,
      imported.xsdMetadataByNodeId,
      reference,
    );

    expect(presented).toEqual(
      expect.objectContaining({
        raw: 't:Shared',
        kindLabel: 'Type reference',
        reasonLabel: 'Ambiguous',
        line: 2,
        column: 5,
      }),
    );
    expect(presented.candidateSummary).toContain('Shared');
    expect(presented.candidateSummary).toContain(
      imported.project.sourceFiles?.find(
        ({ id }) => id === candidate.sourceFileId,
      )?.filename,
    );
    expect(presented.candidateSummary).not.toContain(candidate.id);
    expect(
      [
        'type',
        'element',
        'attribute',
        'restrictionBase',
        'complexTypeBase',
      ].map((kind) =>
        formatUnresolvedReferenceKind(
          kind as SchemaPackageUnresolvedReference['referenceKind'],
        ),
      ),
    ).toEqual([
      'Type reference',
      'Element reference',
      'Attribute reference',
      'Restriction base',
      'Complex type base',
    ]);
    expect(
      ['notFound', 'ambiguous', 'invalidTargetKind'].map((reason) =>
        formatUnresolvedReason(
          reason as SchemaPackageUnresolvedReference['reason'],
        ),
      ),
    ).toEqual([
      {
        label: 'Not found',
        explanation: 'No matching declaration was found in this ZIP package.',
      },
      {
        label: 'Ambiguous',
        explanation:
          'More than one matching declaration was found in this ZIP package.',
      },
      {
        label: 'Wrong component kind',
        explanation:
          'Matching declarations exist, but none has the XSD component kind required by this reference.',
      },
    ]);
  });
});
