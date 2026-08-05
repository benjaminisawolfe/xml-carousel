import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import root from '../../../../tests/fixtures/xsd/task-13.14-schema-set/root.xsd?raw';
import chameleon from '../../../../tests/fixtures/xsd/task-13.14-schema-set/common/chameleon.xsd?raw';
import shared from '../../../../tests/fixtures/xsd/task-13.14-schema-set/shared.xsd?raw';
import foreign from '../../../../tests/fixtures/xsd/task-13.14-schema-set/foreign/b.xsd?raw';
import namespaceOnly from '../../../../tests/fixtures/xsd/task-13.14-schema-set/namespace-only.xsd?raw';
import diamondLeft from '../../../../tests/fixtures/xsd/task-13.14-schema-set/diamond-left.xsd?raw';
import diamondRight from '../../../../tests/fixtures/xsd/task-13.14-schema-set/diamond-right.xsd?raw';
import cycleA from '../../../../tests/fixtures/xsd/task-13.14-schema-set/cycle-a.xsd?raw';
import cycleB from '../../../../tests/fixtures/xsd/task-13.14-schema-set/cycle-b.xsd?raw';
import redefineOriginal from '../../../../tests/fixtures/xsd/task-13.14-schema-set/redefine-original.xsd?raw';
import redefining from '../../../../tests/fixtures/xsd/task-13.14-schema-set/redefining.xsd?raw';
import security from '../../../../tests/fixtures/xsd/task-13.14-schema-set/missing-and-blocked.xsd?raw';
import sameNameOne from '../../../../tests/fixtures/xsd/task-13.14-schema-set/same-name/one/common.xsd?raw';
import sameNameTwo from '../../../../tests/fixtures/xsd/task-13.14-schema-set/same-name/two/common.xsd?raw';
import { buildProjectSearchIndex } from '../../search/projectSearchIndex';
import { buildInspectorSummary } from '../../../ui/inspector/inspectorSummary';
import { buildSchemaSetOutlinePresentation } from '../../../ui/presentation/schemaSetOutlinePresentation';
import { importSchemaArchivePackage } from './importSchemaArchivePackage';

const topology = [
  ['schemas/root.xsd', root],
  ['schemas/common/chameleon.xsd', chameleon],
  ['schemas/shared.xsd', shared],
  ['schemas/foreign/b.xsd', foreign],
  ['schemas/namespace-only.xsd', namespaceOnly],
  ['schemas/diamond-left.xsd', diamondLeft],
  ['schemas/diamond-right.xsd', diamondRight],
  ['schemas/cycle-a.xsd', cycleA],
  ['schemas/cycle-b.xsd', cycleB],
  ['schemas/redefine-original.xsd', redefineOriginal],
  ['schemas/redefining.xsd', redefining],
] as const;

async function zip(entries: readonly (readonly [string, string])[]) {
  const archive = new JSZip();
  for (const [path, source] of entries) {
    archive.file(path, source, { createFolders: false });
  }
  return archive.generateAsync({ type: 'uint8array', compression: 'STORE' });
}

const acceptStandards = {
  validateStandards: async ({
    roots,
  }: {
    readonly roots: readonly { readonly entryPath: string }[];
  }) =>
    roots.map(({ entryPath }, index) => ({
      attemptId: `task-13.14:${index}`,
      engine: { name: 'Apache Xerces-C++' as const, version: '3.3.0' },
      status: 'valid' as const,
      diagnostics: [],
      metrics: { elapsedMs: 1, fileCount: topology.length, inputBytes: 1 },
      entryPath,
    })),
};

describe('Task 13.14 complete XSD relationship and schema-set visualization', () => {
  it('normalizes dependencies, chameleon context, sharing, cycles, and redefine independent of ZIP order', async () => {
    const forward = await importSchemaArchivePackage(
      { filename: 'task-13.14.zip', data: await zip(topology) },
      undefined,
      acceptStandards,
    );
    const reversed = await importSchemaArchivePackage(
      {
        filename: 'task-13.14-reversed.zip',
        data: await zip([...topology].reverse()),
      },
      undefined,
      acceptStandards,
    );
    expect(forward.status).toBe('success');
    expect(reversed.status).toBe('success');
    if (forward.status !== 'success' || reversed.status !== 'success') return;
    expect({
      ...reversed.project,
      id: forward.project.id,
      displayName: forward.project.displayName,
    }).toEqual(forward.project);
    expect(reversed.xsdMetadataByNodeId).toEqual(forward.xsdMetadataByNodeId);

    const relationships = forward.project.nodes.filter(({ kind }) =>
      ['include', 'import', 'redefine'].includes(kind),
    );
    expect(relationships).toHaveLength(9);
    expect(
      relationships.map(
        ({ id }) =>
          forward.xsdMetadataByNodeId[id]?.schemaRelationship?.resolutionStatus,
      ),
    ).toEqual(expect.arrayContaining(Array(9).fill('resolved')));
    expect(forward.project.edges.map(({ kind }) => kind)).toEqual(
      expect.arrayContaining([
        'ownsSchemaRelationship',
        'dependsOnSchema',
        'redefinesSchema',
        'redefinesComponent',
        'chameleonNamespaceContext',
        'sharesDependency',
        'dependencyCycleMember',
        'substitutionGroupMember',
        'referencesDeclaration',
        'usesGroup',
        'usesAttributeGroup',
      ]),
    );

    const rootElement = forward.project.nodes.find(
      ({ kind, name }) => kind === 'globalElement' && name === 'root',
    )!;
    const chameleonType = forward.project.nodes.find(
      ({ kind, name }) => kind === 'complexType' && name === 'ChameleonType',
    )!;
    expect(forward.project.edges).toContainEqual(
      expect.objectContaining({
        kind: 'typeOf',
        sourceNodeId: rootElement.id,
        targetNodeId: chameleonType.id,
      }),
    );
    const chameleonRelationship = relationships.find(
      ({ name }) => name === 'common/chameleon.xsd',
    )!;
    expect(
      forward.xsdMetadataByNodeId[chameleonRelationship.id]?.schemaRelationship,
    ).toMatchObject({
      normalizedProjectPath: 'common/chameleon.xsd',
      effectiveNamespace: 'urn:task-13.14:a',
      resolutionStatus: 'resolved',
    });

    const search = buildProjectSearchIndex({
      project: forward.project,
      xsdMetadataByNodeId: forward.xsdMetadataByNodeId,
    });
    expect(search.documents).toHaveLength(forward.project.nodes.length);
    expect(
      search.documents.some(({ fields }) =>
        fields.some(({ text }) =>
          text.toLowerCase().includes('chameleon context'),
        ),
      ),
    ).toBe(true);
    expect(
      forward.sourceMarkupByNodeId[chameleonRelationship.id],
    ).toBeDefined();
    const outline = buildSchemaSetOutlinePresentation({
      archiveFilename: forward.manifest.archiveFilename,
      manifest: forward.manifest,
      project: forward.project,
      sources: forward.sources,
      entries: forward.entries,
      summary: forward.summary,
      unresolvedReferences: forward.unresolvedReferences,
      xsdMetadataByNodeId: forward.xsdMetadataByNodeId,
    });
    expect(
      outline.sources
        .flatMap(({ groups }) => groups)
        .filter(({ label }) => label === 'Schema relationships')
        .flatMap(({ nodes }) => nodes),
    ).toContainEqual(
      expect.objectContaining({ nodeId: chameleonRelationship.id }),
    );
    expect(
      buildInspectorSummary(
        forward.project,
        chameleonRelationship.id,
        {},
        {},
        forward.sourceMarkupByNodeId,
        forward.xsdMetadataByNodeId,
      )?.relatedDefinitions.map(({ relationshipKind }) => relationshipKind),
    ).toEqual(
      expect.arrayContaining(['dependsOnSchema', 'chameleonNamespaceContext']),
    );
  });

  it('keeps missing, blocked, traversal, encoded traversal, and same basenames truthful and isolated', async () => {
    const entries = [
      ['project/missing-and-blocked.xsd', security],
      ['project/same-name/one/common.xsd', sameNameOne],
      ['project/same-name/two/common.xsd', sameNameTwo],
    ] as const;
    const result = await importSchemaArchivePackage({
      filename: 'task-13.14-security.zip',
      data: await zip(entries),
    });
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    const outcomes = result.project.nodes
      .filter(({ kind }) => kind === 'include')
      .map(({ id }) => result.xsdMetadataByNodeId[id]?.schemaRelationship)
      .filter((value) => value !== undefined);
    expect(
      outcomes.map(({ resolutionStatus }) => resolutionStatus).sort(),
    ).toEqual(['blocked', 'blocked', 'blocked', 'blocked', 'missing']);
    expect(
      outcomes.every(
        ({ targetSchemaNodeId }) => targetSchemaNodeId === undefined,
      ),
    ).toBe(true);
    expect(result.diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        'blocked-xsd-dependency',
        'missing-xsd-dependency',
      ]),
    );
    expect(
      result.project.nodes.filter(({ name }) => name === 'common.xsd'),
    ).toHaveLength(0);
    expect(
      new Set(
        result.sources.map(({ packageRelativePath }) => packageRelativePath),
      ).size,
    ).toBe(3);
  });
});
