import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import mainDtd from '../../../../tests/fixtures/dtd/complete-coverage/main.dtd?raw';
import declarations from '../../../../tests/fixtures/dtd/complete-coverage/parts/declarations.ent?raw';
import chapter from '../../../../tests/fixtures/dtd/complete-coverage/parts/chapter.xml?raw';
import logo from '../../../../tests/fixtures/dtd/complete-coverage/images/logo.gif?raw';
import type { SchemaPackageImportExecution } from './schemaPackageTypes';
import { importSchemaArchivePackage } from './importSchemaArchivePackage';
import { getOutgoingEdges } from '../../../schema/model';

const entries = [
  ['project/main.dtd', mainDtd],
  ['project/parts/declarations.ent', declarations],
  ['project/parts/chapter.xml', chapter],
  ['project/images/logo.gif', logo],
] as const;

const acceptStandards: NonNullable<
  SchemaPackageImportExecution['validateStandards']
> = async ({ files, roots }) =>
  roots.map((root, index) => ({
    attemptId: `complete-dtd:${index}`,
    engine: { name: 'Apache Xerces-C++' as const, version: '3.3.0' },
    status: 'valid' as const,
    diagnostics: [],
    metrics: {
      elapsedMs: 1,
      fileCount: files.length,
      inputBytes: files.reduce((total, file) => total + file.bytes.length, 0),
    },
    source: { kind: 'project' as const, filename: root.entryPath },
  }));

async function archive(
  orderedEntries: readonly (readonly [string, string])[],
): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [path, text] of orderedEntries) zip.file(path, text);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

async function importOrder(
  orderedEntries: readonly (readonly [string, string])[],
) {
  return importSchemaArchivePackage(
    {
      filename: 'complete-dtd-coverage.zip',
      data: await archive(orderedEntries),
    },
    undefined,
    { validateStandards: acceptStandards },
  );
}

describe('complete DTD ZIP visualization', () => {
  it('imports contributing external DTD resources and resolves supplied dependencies', async () => {
    const result = await importOrder(entries);
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;

    expect(result.visualization.summary.completeness).toBe('complete');
    expect(result.sources.map(({ archivePath }) => archivePath)).toEqual([
      'project/main.dtd',
      'project/parts/declarations.ent',
    ]);
    expect(
      result.project.nodes.some(
        ({ kind, name, sourceFileId }) =>
          kind === 'dtdElement' &&
          name === 'contributed' &&
          sourceFileId?.includes('declarations.ent'),
      ),
    ).toBe(true);
    const dependencyStatuses = result.project.nodes
      .filter(({ kind }) => kind === 'dtdDependency')
      .flatMap(({ properties }) =>
        (properties ?? [])
          .filter(({ label }) => label === 'Resolution status')
          .map(({ value }) => value),
      );
    expect(dependencyStatuses).toEqual([
      'Resolved to supplied project resource',
      'Resolved to supplied project resource',
      'Resolved to supplied project resource',
    ]);
  });

  it('is independent of original, reversed, and deterministic shuffled ZIP entry order', async () => {
    const shuffled = [entries[2], entries[0], entries[3], entries[1]];
    const [original, reversed, permuted] = await Promise.all([
      importOrder(entries),
      importOrder([...entries].reverse()),
      importOrder(shuffled),
    ]);
    expect(original.status).toBe('success');
    expect(reversed.status).toBe('success');
    expect(permuted.status).toBe('success');
    if (
      original.status !== 'success' ||
      reversed.status !== 'success' ||
      permuted.status !== 'success'
    )
      return;

    const snapshot = (result: typeof original) => ({
      project: result.project,
      sources: result.sources,
      attributes: result.dtdAttributesByNodeId,
      comments: result.comments,
      markup: result.sourceMarkupByNodeId,
      visualization: result.visualization,
    });
    expect(snapshot(reversed)).toEqual(snapshot(original));
    expect(snapshot(permuted)).toEqual(snapshot(original));
  });

  it('reconciles external parameter-entity declarations after complete package assembly', async () => {
    const splitEntries = [
      [
        'project/main.dtd',
        [
          '<!ENTITY % declarations SYSTEM "parts/declarations.ent">',
          '%declarations;',
          '<!ELEMENT root (contributed)>',
        ].join('\n'),
      ],
      ['project/parts/declarations.ent', '<!ELEMENT contributed EMPTY>'],
    ] as const;
    const [original, reversed] = await Promise.all([
      importOrder(splitEntries),
      importOrder([...splitEntries].reverse()),
    ]);
    expect(original.status).toBe('success');
    expect(reversed.status).toBe('success');
    if (original.status !== 'success' || reversed.status !== 'success') return;

    expect(reversed.project).toEqual(original.project);
    const reference = original.project.nodes.find(
      ({ kind, name }) =>
        kind === 'dtdElementReference' && name === 'contributed',
    )!;
    const target = original.project.nodes.find(
      ({ kind, name }) => kind === 'dtdElement' && name === 'contributed',
    )!;
    expect(reference.properties).toEqual(
      expect.arrayContaining([
        { label: 'Reference status', value: 'Declared element reference' },
        {
          label: 'Target declaration',
          value: 'contributed · parts/declarations.ent',
        },
      ]),
    );
    expect(getOutgoingEdges(original.project, reference.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'referencesElementName',
          targetNodeId: target.id,
        }),
      ]),
    );
    expect(
      original.project.edges.some(
        ({ kind, targetNodeId }) =>
          kind === 'referencesUndeclaredElementName' &&
          targetNodeId === reference.id,
      ),
    ).toBe(false);
  });

  it('keeps resolution path-scoped when unrelated resources share a basename', async () => {
    const result = await importOrder([
      [
        'project/main.dtd',
        [
          '<!ENTITY % declarations SYSTEM "one/shared.ent">',
          '%declarations;',
          '<!ELEMENT root (target)>',
        ].join('\n'),
      ],
      ['project/one/shared.ent', '<!ELEMENT target EMPTY>'],
      ['project/two/shared.ent', '<!ELEMENT target EMPTY>'],
    ]);
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    const reference = result.project.nodes.find(
      ({ kind, name }) => kind === 'dtdElementReference' && name === 'target',
    )!;
    const targets = getOutgoingEdges(result.project, reference.id).filter(
      ({ kind }) => kind === 'referencesElementName',
    );
    expect(targets).toHaveLength(1);
    expect(
      result.project.nodes.find(({ id }) => id === targets[0]!.targetNodeId)
        ?.sourceFileId,
    ).toContain('project%2Fone%2Fshared.ent');
    expect(reference.properties).toContainEqual({
      label: 'Reference status',
      value: 'Declared element reference',
    });
  });
});
