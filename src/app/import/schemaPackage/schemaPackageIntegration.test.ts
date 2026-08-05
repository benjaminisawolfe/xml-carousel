import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import task1313Base from '../../../../tests/fixtures/xsd/task-13.13-package/base.xsd?raw';
import task1313Consumer from '../../../../tests/fixtures/xsd/task-13.13-package/consumer.xsd?raw';
import { buildProjectSearchIndex } from '../../search/projectSearchIndex';
import {
  findPreferredStructuralJourney,
  isValidStructuralJourney,
} from '../../stores/navigationCentering';
import { buildInspectorSummary } from '../../../ui/inspector/inspectorSummary';
import { importSchemaArchivePackage } from './importSchemaArchivePackage';
import type { SchemaPackageImportExecution } from './schemaPackageTypes';

async function zipBytes(
  files: Readonly<Record<string, string>>,
): Promise<Uint8Array> {
  const archive = new JSZip();
  for (const [path, source] of Object.entries(files)) {
    archive.file(path, source, { createFolders: false });
  }
  return archive.generateAsync({
    type: 'uint8array',
    compression: 'STORE',
  });
}

const xsdHeader =
  '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:t="urn:test" targetNamespace="urn:test">';

const commonRootTopology = [
  [
    'project-root/common.xsd',
    '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:t="urn:generic-package" targetNamespace="urn:generic-package"><xs:include schemaLocation="rich-text.xsd"/><xs:complexType name="CommonType"><xs:sequence><xs:element name="body" type="t:RichTextType"/></xs:sequence></xs:complexType></xs:schema>',
  ],
  [
    'project-root/rich-text.xsd',
    '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:generic-package"><xs:simpleType name="RichTextType"><xs:restriction base="xs:string"/></xs:simpleType></xs:schema>',
  ],
  [
    'project-root/rules.xsd',
    '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:t="urn:generic-package" targetNamespace="urn:generic-package"><xs:group name="RuleContent"><xs:sequence><xs:element name="rule" type="xs:string"/></xs:sequence></xs:group><xs:complexType name="RulesType"><xs:group ref="t:RuleContent"/></xs:complexType></xs:schema>',
  ],
  [
    'project-root/entity.xsd',
    '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:t="urn:generic-package" targetNamespace="urn:generic-package"><xs:include schemaLocation="common.xsd"/><xs:include schemaLocation="rules.xsd"/><xs:complexType name="EntityType"><xs:complexContent><xs:extension base="t:CommonType"><xs:sequence><xs:element name="rules" type="t:RulesType" minOccurs="0"/></xs:sequence></xs:extension></xs:complexContent></xs:complexType></xs:schema>',
  ],
  [
    'project-root/entities/character.xsd',
    '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:t="urn:generic-package" targetNamespace="urn:generic-package"><xs:include schemaLocation="../entity.xsd"/><xs:element name="character" type="t:EntityType"/></xs:schema>',
  ],
] as const;

const task1313PackageTopology = [
  ['schemas/base.xsd', task1313Base],
  ['schemas/consumer.xsd', task1313Consumer],
] as const;

function acceptedProjectValidation(
  observations: Array<{
    readonly files: readonly string[];
    readonly roots: readonly string[];
  }>,
) {
  return async ({
    files,
    roots,
  }: Parameters<
    NonNullable<SchemaPackageImportExecution['validateStandards']>
  >[0]) => {
    observations.push({
      files: files.map(({ path: filePath }) => filePath),
      roots: roots.map(({ entryPath }) => entryPath),
    });
    return roots.map((root, index) => ({
      attemptId: `accepted-root:${index + 1}`,
      engine: { name: 'Apache Xerces-C++' as const, version: '3.3.0' },
      status: 'valid' as const,
      diagnostics: [],
      metrics: {
        elapsedMs: 1,
        fileCount: files.length,
        inputBytes: files.reduce((total, file) => total + file.bytes.length, 0),
      },
      entryPath: root.entryPath,
    }));
  };
}

describe('schema package integration', () => {
  it('keeps a complete common-root map and nested parent resolution independent of ZIP order', async () => {
    const forwardObservations: Array<{
      readonly files: readonly string[];
      readonly roots: readonly string[];
    }> = [];
    const reverseObservations: typeof forwardObservations = [];
    const forward = await importSchemaArchivePackage(
      {
        filename: 'common-root.zip',
        data: await zipBytes(Object.fromEntries(commonRootTopology)),
      },
      undefined,
      {
        validateStandards: acceptedProjectValidation(forwardObservations),
      },
    );
    const reverse = await importSchemaArchivePackage(
      {
        filename: 'common-root-reversed.zip',
        data: await zipBytes(
          Object.fromEntries([...commonRootTopology].reverse()),
        ),
      },
      undefined,
      {
        validateStandards: acceptedProjectValidation(reverseObservations),
      },
    );

    expect(forward.status).toBe('success');
    expect(reverse.status).toBe('success');
    if (forward.status !== 'success' || reverse.status !== 'success') return;
    const expectedPaths = [
      'common.xsd',
      'entities/character.xsd',
      'entity.xsd',
      'rich-text.xsd',
      'rules.xsd',
    ];
    expect(forwardObservations).toEqual([
      { files: expectedPaths, roots: ['entities/character.xsd'] },
    ]);
    expect(reverseObservations).toEqual(forwardObservations);
    expect(
      forward.sources.map(({ packageRelativePath }) => packageRelativePath),
    ).toEqual(expectedPaths);
    expect(
      reverse.sources.map(({ packageRelativePath }) => packageRelativePath),
    ).toEqual(expectedPaths);
    expect(forward.visualization.summary.completeness).toBe('complete');
    expect(reverse.visualization).toEqual(forward.visualization);
    expect(
      forward.project.nodes.map(({ kind, name }) => `${kind}:${name}`),
    ).toEqual(reverse.project.nodes.map(({ kind, name }) => `${kind}:${name}`));
    expect(new Set(forward.project.nodes.map(({ id }) => id)).size).toBe(
      forward.project.nodes.length,
    );
  });

  it('resolves cross-file Task 13.13 type relationships independently of ZIP order', async () => {
    const orders = [
      task1313PackageTopology,
      [...task1313PackageTopology].reverse(),
      [task1313PackageTopology[1], task1313PackageTopology[0]],
    ] as const;
    const results = [];
    for (const entries of orders) {
      results.push(
        await importSchemaArchivePackage(
          {
            filename: 'task-13.13-package.zip',
            data: await zipBytes(Object.fromEntries(entries)),
          },
          undefined,
          { validateStandards: acceptedProjectValidation([]) },
        ),
      );
    }

    expect(results.every(({ status }) => status === 'success')).toBe(true);
    const successful = results.filter(
      (result): result is Extract<typeof result, { status: 'success' }> =>
        result.status === 'success',
    );
    expect(successful).toHaveLength(3);
    const first = successful[0]!;
    for (const result of successful.slice(1)) {
      expect(result.project).toEqual(first.project);
      expect(result.xsdMetadataByNodeId).toEqual(first.xsdMetadataByNodeId);
      expect(result.visualization).toEqual(first.visualization);
    }
    expect(first.unresolvedReferences).toEqual([]);

    const sharedAtomic = first.project.nodes.find(
      ({ kind, name }) => kind === 'simpleType' && name === 'SharedAtomic',
    )!;
    const crossRestriction = first.project.nodes.find(
      ({ kind, name }) => kind === 'simpleType' && name === 'CrossRestriction',
    )!;
    const crossList = first.project.nodes.find(
      ({ kind, name }) => kind === 'simpleType' && name === 'CrossList',
    )!;
    const crossUnion = first.project.nodes.find(
      ({ kind, name }) => kind === 'simpleType' && name === 'CrossUnion',
    )!;
    const baseRecord = first.project.nodes.find(
      ({ kind, name }) => kind === 'complexType' && name === 'BaseRecord',
    )!;
    const derivedRecord = first.project.nodes.find(
      ({ kind, name }) => kind === 'complexType' && name === 'DerivedRecord',
    )!;
    const crossListVariety = first.project.nodes.find(
      ({ kind, id }) =>
        kind === 'list' &&
        first.xsdMetadataByNodeId[id]?.ownerNodeId === crossList.id,
    )!;
    const crossUnionVariety = first.project.nodes.find(
      ({ kind, id }) =>
        kind === 'union' &&
        first.xsdMetadataByNodeId[id]?.ownerNodeId === crossUnion.id,
    )!;

    expect(first.project.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'derivesFrom',
          sourceNodeId: crossRestriction.id,
          targetNodeId: sharedAtomic.id,
        }),
        expect.objectContaining({
          kind: 'derivesFrom',
          sourceNodeId: derivedRecord.id,
          targetNodeId: baseRecord.id,
        }),
      ]),
    );
    expect(
      first.xsdMetadataByNodeId[crossListVariety.id]?.listItemTypeReference,
    ).toMatchObject({ resolution: 'resolved', targetNodeId: sharedAtomic.id });
    expect(
      first.xsdMetadataByNodeId[crossUnionVariety.id]
        ?.unionMemberTypeReferences,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          raw: 't:SharedAtomic',
          resolution: 'resolved',
          targetNodeId: sharedAtomic.id,
        }),
      ]),
    );
  });

  it('imports a real two-file XSD package and resolves its cross-file type', async () => {
    const bytes = await zipBytes({
      'schemas/root.xsd': `${xsdHeader}
        <xs:annotation><xs:documentation>Package root documentation</xs:documentation></xs:annotation>
        <xs:element name="root" type="t:Shared"/>
      </xs:schema>`,
      'schemas/types.xsd': `${xsdHeader}
        <xs:complexType name="Shared">
          <xs:sequence><xs:element name="child" type="xs:string"/></xs:sequence>
        </xs:complexType>
      </xs:schema>`,
      'schemas/ignored.txt': 'safe ignored text remains source-viewable',
    });
    const before = bytes.slice();

    const first = await importSchemaArchivePackage({
      filename: 'schemas.zip',
      data: bytes,
    });
    const second = await importSchemaArchivePackage({
      filename: 'schemas.zip',
      data: bytes,
    });

    expect(first.status).toBe('success');
    expect(second).toEqual(first);
    expect(bytes).toEqual(before);
    if (first.status !== 'success') throw new Error('Expected success.');

    expect(
      first.sources.map(({ packageRelativePath }) => packageRelativePath),
    ).toEqual(['root.xsd', 'types.xsd']);
    expect(
      (first.project.sourceFiles ?? []).map(({ filename }) => filename),
    ).toEqual(['root.xsd', 'types.xsd']);
    const root = first.project.nodes.find(
      (node) => node.kind === 'globalElement' && node.name === 'root',
    );
    const shared = first.project.nodes.find(
      (node) => node.kind === 'complexType' && node.name === 'Shared',
    );
    expect(root).toBeDefined();
    expect(shared).toBeDefined();
    expect(first.project.edges).toContainEqual(
      expect.objectContaining({
        kind: 'typeOf',
        sourceNodeId: root?.id,
        targetNodeId: shared?.id,
      }),
    );
    expect(first.xsdMetadataByNodeId[root!.id]?.typeReference).toEqual(
      expect.objectContaining({
        resolution: 'resolved',
        targetNodeId: shared?.id,
      }),
    );
    expect(first.unresolvedReferences).toEqual([]);
    expect(first.diagnostics).toEqual([]);
    expect(first.entries.find(({ kind }) => kind === 'ignored')).toMatchObject({
      packageRelativePath: 'ignored.txt',
      classificationReason:
        'Unsupported file type; retained in package inventory',
      textStatus: 'text',
      sourceViewAvailable: true,
      sourceText: 'safe ignored text remains source-viewable',
    });
    expect(JSON.stringify(first)).not.toContain('"bytes"');
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.project.nodes)).toBe(true);

    const search = buildProjectSearchIndex({
      project: first.project,
      xsdMetadataByNodeId: first.xsdMetadataByNodeId,
      commentsByNodeId: first.commentsByNodeId,
      dtdAttributesByNodeId: first.dtdAttributesByNodeId,
    });
    expect(search.documents).toHaveLength(first.project.nodes.length);
    expect(
      search.documents.find(({ nodeId }) => nodeId === root!.id)
        ?.sourceFilename,
    ).toBe('root.xsd');
    expect(
      search.documents
        .find(({ nodeId }) => nodeId === root!.id)
        ?.fields.some(
          ({ kind, text }) => kind === 'reference' && text === 't:Shared',
        ),
    ).toBe(true);
    expect(
      search.documents.some((document) =>
        document.fields.some(
          ({ kind, text }) =>
            kind === 'documentation' && text === 'Package root documentation',
        ),
      ),
    ).toBe(true);
    expect(
      search.documents.reduce<string[]>(
        (texts, { fields }) => [...texts, ...fields.map(({ text }) => text)],
        [],
      ),
    ).not.toContain('schemas/root.xsd');
    expect(
      Object.values(first.sourceMarkupByNodeId).some(({ fragments }) =>
        fragments.some(
          ({ sourceFileId, text }) =>
            sourceFileId === root!.sourceFileId &&
            text === '<xs:element name="root" type="t:Shared"/>',
        ),
      ),
    ).toBe(true);
    expect(
      Object.values(first.sourceMarkupByNodeId).some(({ fragments }) =>
        fragments.some(
          ({ sourceFileId, text }) =>
            sourceFileId === shared!.sourceFileId &&
            text.includes('<xs:complexType name="Shared">'),
        ),
      ),
    ).toBe(true);
    expect(
      buildInspectorSummary(
        first.project,
        root!.id,
        first.dtdAttributesByNodeId,
        first.commentsByNodeId,
        first.sourceMarkupByNodeId,
        first.xsdMetadataByNodeId,
      )?.relatedDefinitions,
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ nodeId: shared!.id })]),
    );
    expect(
      isValidStructuralJourney(first.project, [root!.id, shared!.id]),
    ).toBe(true);
    expect(
      first.project.rootNodeIds.every((nodeId) =>
        isValidStructuralJourney(first.project, [nodeId]),
      ),
    ).toBe(true);
    expect(
      findPreferredStructuralJourney(
        first.project,
        [first.project.rootNodeIds[0]!],
        shared!.id,
      ),
    ).toEqual([first.project.rootNodeIds[0], root!.id, shared!.id]);
    expect(
      findPreferredStructuralJourney(
        first.project,
        [first.project.rootNodeIds[0]!],
        first.project.rootNodeIds[1]!,
      ),
    ).toEqual([first.project.rootNodeIds[1]]);
  });

  it('resolves an expanded-name reference into another package namespace', async () => {
    const bytes = await zipBytes({
      'schemas/root.xsd': `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"
        xmlns:o="urn:other" targetNamespace="urn:root">
        <xs:element name="root" type="o:External"/>
      </xs:schema>`,
      'schemas/external.xsd': `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"
        targetNamespace="urn:other">
        <xs:complexType name="External"/>
      </xs:schema>`,
    });
    const result = await importSchemaArchivePackage({
      filename: 'namespaces.zip',
      data: bytes,
    });

    expect(result.status).toBe('success');
    if (result.status !== 'success') throw new Error('Expected success.');
    expect(result.unresolvedReferences).toEqual([]);
    expect(result.project.edges).toContainEqual(
      expect.objectContaining({ kind: 'typeOf' }),
    );
  });

  it('preserves unresolved XSD references as explicit nonfatal package issues', async () => {
    const bytes = await zipBytes({
      'root.xsd': `${xsdHeader}<xs:element name="root" type="t:Missing"/></xs:schema>`,
    });
    const result = await importSchemaArchivePackage({
      filename: 'unresolved.zip',
      data: bytes,
    });

    expect(result.status).toBe('success');
    if (result.status !== 'success') throw new Error('Expected success.');
    expect(result.unresolvedReferences).toHaveLength(1);
    expect(result.unresolvedReferences[0]).toEqual(
      expect.objectContaining({
        raw: 't:Missing',
        reason: 'notFound',
        candidateNodeIds: [],
      }),
    );
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        stage: 'package',
        code: 'unresolved-xsd-reference',
        severity: 'warning',
      }),
    );
    expect(result.project.edges.some(({ kind }) => kind === 'typeOf')).toBe(
      false,
    );
  });

  it('assembles mixed DTD/XSD files with collision-safe package identities', async () => {
    const bytes = await zipBytes({
      'package/a.dtd': `<!-- shared DTD documentation -->
<!ELEMENT shared EMPTY>
<!ATTLIST shared id ID #REQUIRED>`,
      'package/b.dtd': '<!ELEMENT shared EMPTY>',
      'package/schema.xsd': `${xsdHeader}<xs:element name="shared" type="xs:string"/></xs:schema>`,
    });
    const result = await importSchemaArchivePackage({
      filename: 'mixed.zip',
      data: bytes,
    });

    expect(result.status).toBe('success');
    if (result.status !== 'success') throw new Error('Expected success.');
    expect(result.sources.map(({ format }) => format)).toEqual([
      'dtd',
      'dtd',
      'xsd',
    ]);
    expect(new Set(result.project.nodes.map(({ id }) => id)).size).toBe(
      result.project.nodes.length,
    );
    expect(
      new Set((result.project.sourceFiles ?? []).map(({ id }) => id)).size,
    ).toBe(3);
    const firstDtd = result.project.nodes.find(
      (node) =>
        node.kind === 'dtdElement' &&
        node.name === 'shared' &&
        node.sourceFileId === result.sources[0]?.sourceFileId,
    );
    expect(firstDtd).toBeDefined();
    const summary = buildInspectorSummary(
      result.project,
      firstDtd!.id,
      result.dtdAttributesByNodeId,
      result.commentsByNodeId,
      result.sourceMarkupByNodeId,
      result.xsdMetadataByNodeId,
    );
    expect(summary?.sourceFilename).toBe('a.dtd');
    expect(summary?.comments).toContainEqual(
      expect.objectContaining({ text: 'shared DTD documentation' }),
    );
    expect(summary?.attributes).toContainEqual(
      expect.objectContaining({ name: 'id' }),
    );
    expect(summary?.sourceMarkup?.fragments[0]?.text).toBe(
      `<!-- shared DTD documentation -->
<!ELEMENT shared EMPTY>
<!ATTLIST shared id ID #REQUIRED>`,
    );
    expect(Object.keys(result.dtdAttributesByNodeId)).not.toHaveLength(0);
    expect(Object.keys(result.xsdMetadataByNodeId)).not.toHaveLength(0);
  });

  it('fails atomically when one selected member is malformed', async () => {
    const bytes = await zipBytes({
      'good.dtd': '<!ELEMENT good EMPTY>',
      'bad.xsd': '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">',
    });
    const result = await importSchemaArchivePackage({
      filename: 'malformed.zip',
      data: bytes,
    });

    expect(result.status).toBe('failure');
    expect('project' in result).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          entryPath: 'bad.xsd',
        }),
      ]),
    );
  });

  it('handles 50 files and 2,000 nodes with the production ZIP boundary', async () => {
    const files: Record<string, string> = {};
    for (let file = 0; file < 50; file += 1) {
      files[`schemas/file-${String(file).padStart(2, '0')}.dtd`] = Array.from(
        { length: 40 },
        (_, node) => `<!ELEMENT node-${file}-${node} EMPTY>`,
      ).join('\n');
    }
    const result = await importSchemaArchivePackage({
      filename: 'smoke.zip',
      data: await zipBytes(files),
    });

    expect(result.status).toBe('success');
    if (result.status !== 'success') throw new Error('Expected success.');
    expect(result.sources).toHaveLength(50);
    expect(result.project.nodes).toHaveLength(2_000);
    expect(
      buildProjectSearchIndex({
        project: result.project,
        commentsByNodeId: result.commentsByNodeId,
        dtdAttributesByNodeId: result.dtdAttributesByNodeId,
      }).documents,
    ).toHaveLength(2_000);
  });
});
