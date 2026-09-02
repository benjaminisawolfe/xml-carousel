import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { RelaxNgValidationResult } from '../../../standards/relaxng';
import { buildProjectSearchIndex } from '../../search';
import { importSchemaArchivePackage } from './importSchemaArchivePackage';
import {
  buildRelaxNgPackageRelationships,
  extractRelaxNgPackageReferences,
} from './relaxNgPackageReferences';
import { deriveSchemaPackageSourceFileId } from './schemaPackageRemapping';
import { selectSchemaPackageEntryRoots } from './schemaPackageEntryRoots';
import type { SchemaPackageImportExecution } from './schemaPackageTypes';
import type { SchemaPackageSourceText } from './schemaPackageDecoding';

const rngNamespace = 'http://relaxng.org/ns/structure/1.0';

async function zipBytes(
  files: Readonly<Record<string, string>>,
): Promise<Uint8Array> {
  const archive = new JSZip();
  for (const [path, source] of Object.entries(files)) {
    archive.file(path, source, { createFolders: false });
  }
  return archive.generateAsync({ type: 'uint8array', compression: 'STORE' });
}

function rngSource(path: string, sourceText: string): SchemaPackageSourceText {
  const segments = path.split('/');
  const entry = {
    id: 'entry:' + path,
    archivePath: path,
    packageRelativePath: path,
    ...(segments.length === 1
      ? {}
      : { directoryPath: segments.slice(0, -1).join('/') }),
    basename: segments[segments.length - 1]!,
    format: 'rng' as const,
    sourceOrder: 0,
  };
  return {
    entry,
    sourceFileId: deriveSchemaPackageSourceFileId(entry),
    byteLength: new TextEncoder().encode(sourceText).length,
    sourceText,
  };
}

function validRngResult(
  attemptId: string,
  fileCount: number,
): RelaxNgValidationResult {
  return {
    attemptId,
    engine: { name: 'libxml2 RELAX NG', version: '2.15.3' },
    status: 'valid',
    diagnostics: [],
    dependencyRequests: [],
    metrics: { elapsedMs: 1, fileCount, inputBytes: 1 },
  };
}

describe('Task 17.5 RELAX NG package resolution', () => {
  it('extracts namespace-correct references with literal values and ranges', () => {
    const source = rngSource(
      'main.rng',
      '<grammar xmlns="' +
        rngNamespace +
        '" xmlns:rng="' +
        rngNamespace +
        '" xmlns:doc="urn:docs">\n' +
        '  <include href="common&amp;base.rng"/>\n' +
        '  <rng:externalRef href="patterns/name.rng"/>\n' +
        '  <doc:include href="ignored.rng"/>\n' +
        '</grammar>',
    );

    const references = extractRelaxNgPackageReferences(source);
    expect(
      references.map(({ kind, rawTarget }) => ({ kind, rawTarget })),
    ).toEqual([
      { kind: 'rng-include', rawTarget: 'common&base.rng' },
      { kind: 'rng-external-ref', rawTarget: 'patterns/name.rng' },
    ]);
    expect(references.map(({ range }) => range.sourceId)).toEqual([
      source.sourceFileId,
      source.sourceFileId,
    ]);
    expect(
      references.map(({ range }) =>
        source.sourceText.slice(range.start.offset, range.end.offset),
      ),
    ).toEqual(['common&amp;base.rng', 'patterns/name.rng']);
  });

  it('resolves safe parents exactly and classifies missing and blocked targets', () => {
    const sources = [
      rngSource(
        'schemas/sub/main.rng',
        '<grammar xmlns="' +
          rngNamespace +
          '">' +
          '<include href="../common.rng"/>' +
          '<include href="common.rng"/>' +
          '<externalRef href="../../../outside.rng"/>' +
          '<externalRef href="https://example.com/remote.rng"/>' +
          '<externalRef href="file:///tmp/schema.rng"/>' +
          '<externalRef href="C:\\schema.rng"/>' +
          '<externalRef href="\\\\server\\share\\schema.rng"/>' +
          '<externalRef href="/absolute/schema.rng"/>' +
          '<include href="local.rng#fragment"/>' +
          '</grammar>',
      ),
      rngSource('schemas/common.rng', '<empty xmlns="' + rngNamespace + '"/>'),
      rngSource('a/common.rng', '<empty xmlns="' + rngNamespace + '"/>'),
      rngSource('b/common.rng', '<empty xmlns="' + rngNamespace + '"/>'),
    ];
    const supplied = new Set(
      sources.map(({ entry }) => entry.packageRelativePath),
    );
    const relationships = buildRelaxNgPackageRelationships(sources, supplied);

    expect(
      relationships.find(({ rawTarget }) => rawTarget === '../common.rng'),
    ).toMatchObject({
      status: 'resolved',
      targetPath: 'schemas/common.rng',
    });
    expect(
      relationships.find(({ rawTarget }) => rawTarget === 'common.rng'),
    ).toMatchObject({
      status: 'missing',
    });
    expect(
      relationships.find(({ rawTarget }) => rawTarget === 'common.rng')
        ?.targetPath,
    ).toBeUndefined();
    expect(
      relationships.find(
        ({ rawTarget }) => rawTarget === '../../../outside.rng',
      ),
    ).toMatchObject({ status: 'blocked', blockedReason: 'traversal' });
    expect(
      relationships.find(({ rawTarget }) => rawTarget.startsWith('https:')),
    ).toMatchObject({ status: 'blocked', blockedReason: 'external-uri' });
    for (const rawTarget of [
      'file:///tmp/schema.rng',
      'C:\\schema.rng',
      '\\\\server\\share\\schema.rng',
      '/absolute/schema.rng',
    ]) {
      expect(
        relationships.find(
          (relationship) => relationship.rawTarget === rawTarget,
        ),
      ).toMatchObject({ status: 'blocked', blockedReason: 'filesystem' });
    }
    expect(
      relationships.find(({ rawTarget }) => rawTarget.includes('#fragment')),
    ).toMatchObject({ status: 'blocked', blockedReason: 'external-uri' });
    expect(
      relationships.every(({ candidatePaths }) => candidatePaths === undefined),
    ).toBe(true);
  });

  it('selects independent roots and deterministic cycle representatives', () => {
    const source = (path: string, body: string) =>
      rngSource(
        path,
        '<grammar xmlns="' + rngNamespace + '">' + body + '</grammar>',
      );
    const sources = [
      source('a.rng', '<include href="shared.rng"/>'),
      source('b.rng', '<externalRef href="shared.rng"/>'),
      rngSource('shared.rng', '<empty xmlns="' + rngNamespace + '"/>'),
      source('cycle-a.rng', '<include href="cycle-b.rng"/>'),
      source('cycle-b.rng', '<externalRef href="cycle-a.rng"/>'),
    ];

    expect(selectSchemaPackageEntryRoots(sources)).toEqual([
      { format: 'rng', entryPath: 'a.rng' },
      { format: 'rng', entryPath: 'b.rng' },
      { format: 'rng', entryPath: 'cycle-a.rng' },
    ]);
  });

  it('retains cycles and one shared document with deterministic dependents', async () => {
    const grammar = (body: string) =>
      '<grammar xmlns="' + rngNamespace + '">' + body + '</grammar>';
    const result = await importSchemaArchivePackage(
      {
        filename: 'rng-graph.zip',
        data: await zipBytes({
          'a.rng': grammar('<include href="shared.rng"/>'),
          'b.rng': grammar('<externalRef href="shared.rng"/>'),
          'shared.rng': '<empty xmlns="' + rngNamespace + '"/>',
          'cycle-a.rng': grammar('<include href="cycle-b.rng"/>'),
          'cycle-b.rng': grammar('<externalRef href="cycle-a.rng"/>'),
        }),
      },
      undefined,
      {
        async validateRelaxNg({ files, roots }) {
          return roots.map((_, index) =>
            validRngResult('graph:' + index, files.length),
          );
        },
      },
    );

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(
      result.entries
        .filter(({ rootCandidate }) => rootCandidate)
        .map(({ packageRelativePath }) => packageRelativePath),
    ).toEqual(['a.rng', 'b.rng', 'cycle-a.rng']);
    expect(
      result.entries.find(
        ({ packageRelativePath }) => packageRelativePath === 'shared.rng',
      ),
    ).toMatchObject({
      dependentCount: 2,
      sharedDependency: true,
      nodeCount: 1,
    });
    expect(
      result.entries
        .flatMap(({ dependencies }) => dependencies)
        .filter(
          ({ kind }) => kind === 'rng-include' || kind === 'rng-external-ref',
        ),
    ).toHaveLength(4);
    expect(
      result.project.edges.filter(({ kind }) => kind === 'dependsOnSchema'),
    ).toHaveLength(4);
    expect(result.relaxNgSemanticModel?.documents).toHaveLength(5);
    expect(
      result.relaxNgSemanticModel?.documents.filter(
        ({ path }) => path === 'shared.rng',
      ),
    ).toHaveLength(1);
    expect(structuredClone(result.relaxNgSemanticModel)).toEqual(
      result.relaxNgSemanticModel,
    );
  });

  it('retains source-only nodes, relationships, Problems, inventory, and Search', async () => {
    const observed: Array<{ files: string[]; roots: string[] }> = [];
    const execution: SchemaPackageImportExecution = {
      async validateRelaxNg({ files, roots }) {
        observed.push({
          files: files.map(({ path }) => path),
          roots: roots.map(({ entryPath }) => entryPath),
        });
        return roots.map((root, index) =>
          root.entryPath === 'missing-root.rng'
            ? {
                ...validRngResult('blocked:' + index, files.length),
                status: 'blocked' as const,
                diagnostics: [
                  {
                    stage: 'standards' as const,
                    code: 'libxml2-relaxng:4:1',
                    severity: 'error' as const,
                    message: 'Required supplied dependency is unavailable.',
                    category: 'blocked-dependency' as const,
                    fileName: root.entryPath,
                    line: 1,
                    source: 'rng' as const,
                  },
                ],
              }
            : validRngResult('valid:' + index, files.length),
        );
      },
    };
    const result = await importSchemaArchivePackage(
      {
        filename: 'rng-package.zip',
        data: await zipBytes({
          'root/main.rng':
            '<grammar xmlns="' +
            rngNamespace +
            '"><include href="../shared/common.rng"/><externalRef href="../shared/pattern.rng"/></grammar>',
          'shared/common.rng': '<empty xmlns="' + rngNamespace + '"/>',
          'shared/pattern.rng': '<text xmlns="' + rngNamespace + '"/>',
          'missing-root.rng':
            '<grammar xmlns="' +
            rngNamespace +
            '"><include href="missing.rng"/><externalRef href="https://example.com/remote.rng"/></grammar>',
          'notes.rnc': 'start = empty',
        }),
      },
      undefined,
      execution,
    );

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(observed).toEqual([
      {
        files: [
          'missing-root.rng',
          'root/main.rng',
          'shared/common.rng',
          'shared/pattern.rng',
        ],
        roots: ['missing-root.rng', 'root/main.rng'],
      },
    ]);
    expect(result.summary).toMatchObject({
      schemaSourceCount: 4,
      rngSourceCount: 4,
      xsdSourceCount: 0,
      dtdSourceCount: 0,
    });
    expect(
      result.project.nodes.filter(({ kind }) => kind === 'relaxNgSchema'),
    ).toHaveLength(4);
    expect(
      result.project.edges.filter(({ kind }) => kind === 'dependsOnSchema'),
    ).toHaveLength(2);
    expect(
      result.entries.find(
        ({ packageRelativePath }) => packageRelativePath === 'notes.rnc',
      ),
    ).toMatchObject({
      kind: 'ignored',
      standardsStatus: 'not-a-schema-source',
    });
    const main = result.entries.find(
      ({ packageRelativePath }) => packageRelativePath === 'root/main.rng',
    )!;
    expect(main).toMatchObject({
      kind: 'rng-source',
      standardsStatus: 'accepted-schema-source',
      visualizationStatus: 'source-only',
      dependencyCount: 2,
    });
    expect(
      main.dependencies.map(({ kind, rawTarget, status, targetPath }) => ({
        kind,
        rawTarget,
        status,
        targetPath,
      })),
    ).toEqual([
      {
        kind: 'rng-include',
        rawTarget: '../shared/common.rng',
        status: 'resolved',
        targetPath: 'shared/common.rng',
      },
      {
        kind: 'rng-external-ref',
        rawTarget: '../shared/pattern.rng',
        status: 'resolved',
        targetPath: 'shared/pattern.rng',
      },
    ]);
    const missing = result.entries.find(
      ({ packageRelativePath }) => packageRelativePath === 'missing-root.rng',
    )!;
    expect(missing.standardsStatus).toBe('blocked-dependency');
    expect(missing.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rawTarget: 'missing.rng',
          status: 'missing',
        }),
        expect.objectContaining({
          rawTarget: 'https://example.com/remote.rng',
          status: 'blocked',
          blockedReason: 'external-uri',
        }),
      ]),
    );
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'missing-rng-dependency' }),
        expect.objectContaining({ code: 'blocked-rng-dependency' }),
        expect.objectContaining({ category: 'blocked-dependency' }),
      ]),
    );
    const search = buildProjectSearchIndex({
      project: result.project,
      sourceFilename: 'rng-package.zip',
      packageEntries: result.entries,
    });
    const missingDocument = search.documents.find(
      ({ packageEntryId }) => packageEntryId === missing.id,
    )!;
    expect(missingDocument.fields.map(({ text }) => text)).toEqual(
      expect.arrayContaining([
        'missing.rng',
        'RELAX NG include',
        'missing',
        'https://example.com/remote.rng',
        'RELAX NG externalRef',
        'blocked',
        'external-uri',
      ]),
    );
    expect(result.visualization.summary.completeness).toBe('partial');
    expect(
      result.relaxNgSemanticModel?.documents.map(({ path }) => path),
    ).toEqual(['root/main.rng', 'shared/common.rng', 'shared/pattern.rng']);
    expect(
      result.relaxNgSemanticModel?.documents.some(
        ({ path }) => path === 'missing-root.rng',
      ),
    ).toBe(false);
  });

  it('keeps Xerces and libxml2 inputs separate in a mixed package', async () => {
    const xercesInputs: string[][] = [];
    const rngInputs: string[][] = [];
    const result = await importSchemaArchivePackage(
      {
        filename: 'mixed.zip',
        data: await zipBytes({
          'schema.dtd': '<!ELEMENT root EMPTY>',
          'schema.xsd':
            '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="root" type="xs:string"/></xs:schema>',
          'main.rng':
            '<grammar xmlns="' +
            rngNamespace +
            '"><include href="dependency.rng"/></grammar>',
          'dependency.rng': '<empty xmlns="' + rngNamespace + '"/>',
        }),
      },
      undefined,
      {
        async validateStandards({ files, roots }) {
          xercesInputs.push(files.map(({ path }) => path));
          return roots.map((root, index) => ({
            attemptId: 'xerces:' + index,
            engine: { name: 'Apache Xerces-C++' as const, version: '3.3.0' },
            status: 'valid' as const,
            diagnostics: [],
            metrics: { elapsedMs: 1, fileCount: files.length, inputBytes: 1 },
            entryPath: root.entryPath,
          }));
        },
        async validateRelaxNg({ files, roots }) {
          rngInputs.push(files.map(({ path }) => path));
          return roots.map((_, index) =>
            validRngResult('rng:' + index, files.length),
          );
        },
      },
    );

    expect(result.status).toBe('success');
    expect(xercesInputs).toEqual([['schema.dtd', 'schema.xsd']]);
    expect(rngInputs).toEqual([['dependency.rng', 'main.rng']]);
    if (result.status === 'success') {
      expect(new Set(result.sources.map(({ format }) => format))).toEqual(
        new Set(['dtd', 'xsd', 'rng']),
      );
    }
  });
});
