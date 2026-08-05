import { readFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildProjectSearchIndex } from '../../search/projectSearchIndex';
import { inventoryArchive } from '../../../../scripts/hermetic-foundry-inventory.mjs';
import { importSchemaArchivePackage } from './importSchemaArchivePackage';
import type { SchemaPackageImportExecution } from './schemaPackageTypes';

const fixtureRoot = path.resolve(
  'tests/fixtures/hermetic-foundry/synthetic-project',
);
const fixturePaths = [
  'project-root/shared/rich-text.xsd',
  'project-root/shared/common.xsd',
  'project-root/entity.xsd',
  'project-root/entities/character.xsd',
] as const;

async function fixtureEntries() {
  return Promise.all(
    fixturePaths.map(
      async (fixturePath) =>
        [
          fixturePath,
          await readFile(path.join(fixtureRoot, fixturePath), 'utf8'),
        ] as const,
    ),
  );
}

async function archiveBytes(
  entries: readonly (readonly [string, string])[],
): Promise<Uint8Array> {
  const archive = new JSZip();
  for (const [entryPath, source] of entries) {
    archive.file(entryPath, source, {
      createFolders: false,
      date: new Date('2000-01-01T00:00:00.000Z'),
    });
  }
  return archive.generateAsync({ type: 'uint8array', compression: 'STORE' });
}

const acceptSuppliedProject: NonNullable<
  SchemaPackageImportExecution['validateStandards']
> = async ({ files, roots }) =>
  roots.map((root, index) => ({
    attemptId: `synthetic-hermetic:${index + 1}`,
    engine: { name: 'Apache Xerces-C++' as const, version: '3.3.0' },
    status: 'valid' as const,
    diagnostics: [],
    metrics: {
      elapsedMs: 0,
      fileCount: files.length,
      inputBytes: files.reduce((total, file) => total + file.bytes.length, 0),
    },
    entryPath: root.entryPath,
  }));

function normalize(
  result: Extract<
    Awaited<ReturnType<typeof importSchemaArchivePackage>>,
    { status: 'success' }
  >,
) {
  const search = buildProjectSearchIndex({
    project: result.project,
    xsdMetadataByNodeId: result.xsdMetadataByNodeId,
  });
  return {
    sources: result.sources,
    initialFocusNodeId: result.initialFocusNodeId,
    nodes: result.project.nodes,
    edges: result.project.edges,
    rootNodeIds: result.project.rootNodeIds,
    search,
    visualization: result.visualization,
    unresolvedReferences: result.unresolvedReferences,
    sourceMarkupNodeIds: Object.keys(result.sourceMarkupByNodeId).sort(),
  };
}

describe('synthetic Hermetic package regression', () => {
  it('keeps project, Search, markup, and partial visualization identical across three ZIP orders', async () => {
    const entries = await fixtureEntries();
    const permutations = [
      entries,
      [...entries].reverse(),
      [entries[2]!, entries[0]!, entries[3]!, entries[1]!],
    ];
    const results = await Promise.all(
      permutations.map(async (ordered) =>
        importSchemaArchivePackage(
          {
            filename: 'synthetic-hermetic.zip',
            data: await archiveBytes(ordered),
          },
          undefined,
          { validateStandards: acceptSuppliedProject },
        ),
      ),
    );

    expect(results.every(({ status }) => status === 'success')).toBe(true);
    const successful = results.filter(
      (result): result is Extract<typeof result, { status: 'success' }> =>
        result.status === 'success',
    );
    expect(successful).toHaveLength(3);
    expect(normalize(successful[1]!)).toEqual(normalize(successful[0]!));
    expect(normalize(successful[2]!)).toEqual(normalize(successful[0]!));
    expect(successful[0]!.visualization.summary).toMatchObject({
      completeness: 'complete',
      findingCountsByCode: {},
    });
    expect(successful[0]!.unresolvedReferences).toEqual([]);
    expect(Object.keys(successful[0]!.sourceMarkupByNodeId)).toHaveLength(
      successful[0]!.project.nodes.filter(({ kind }) => kind !== 'builtInType')
        .length,
    );
    expect(
      normalize(successful[0]!).search.documents.some(({ fields }) =>
        fields.some(
          ({ kind, text }) =>
            kind === 'documentation' && text.includes('Original synthetic'),
        ),
      ),
    ).toBe(true);
  });

  it('inventories the common root, safe parent, and standalone missing dependency without external references', async () => {
    const entries = await fixtureEntries();
    const complete = await inventoryArchive(await archiveBytes(entries));
    const standalone = await inventoryArchive(
      await archiveBytes(
        entries.filter(([entryPath]) =>
          entryPath.endsWith('/shared/common.xsd'),
        ),
      ),
    );

    expect(complete).toMatchObject({
      commonRootDirectory: 'project-root/',
      xsdEntryCount: 4,
      schemaLocationCount: 3,
      externalOrAbsoluteReferenceCount: 0,
      missingReferenceCount: 0,
    });
    expect(complete.references).toContainEqual({
      referringPath: 'entities/character.xsd',
      reference: '../entity.xsd',
      status: 'resolved',
      targetPath: 'entity.xsd',
    });
    expect(standalone.externalOrAbsoluteReferenceCount).toBe(0);
    expect(standalone.missingReferenceCount).toBe(1);
    expect(standalone.missingReferences).toContainEqual(
      expect.objectContaining({ reference: 'rich-text.xsd' }),
    );
  });
});
