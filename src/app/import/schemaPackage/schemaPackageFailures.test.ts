import { describe, expect, it, vi } from 'vitest';
import {
  importDtdSource,
  type DtdImportOptions,
  type DtdImportResult,
} from '../../../schema/dtd';
import { importXsdSource } from '../../../schema/xsd';
import { completeVisualizationResult } from '../../../schema/visualization';
import type {
  SchemaArchiveManifest,
  SchemaArchiveSchemaEntry,
} from '../schemaArchive';
import { importSchemaArchivePackage } from './importSchemaArchivePackage';
import type { SchemaPackageImportDependencies } from './schemaPackageTypes';

const archiveEntry: SchemaArchiveSchemaEntry = {
  id: 'entry',
  archivePath: 'schemas/a.dtd',
  packageRelativePath: 'a.dtd',
  directoryPath: 'schemas',
  basename: 'a.dtd',
  format: 'dtd',
  sourceOrder: 0,
};

const manifest: SchemaArchiveManifest = {
  id: 'schema-package:package.zip',
  archiveFilename: 'package.zip',
  archiveByteLength: 3,
  packageRoot: 'schemas',
  commonRootDirectory: 'schemas',
  entries: [],
  schemaEntries: [archiveEntry],
  xsdCount: 0,
  dtdCount: 1,
  ignoredFileCount: 0,
  totalFileEntryCount: 1,
};

function dependencies(
  overrides: Partial<SchemaPackageImportDependencies> = {},
): SchemaPackageImportDependencies {
  return {
    async discoverArchive() {
      return { status: 'success', manifest };
    },
    async loadContents() {
      return [
        {
          archivePath: archiveEntry.archivePath,
          bytes: new Uint8Array([
            60, 33, 69, 76, 69, 77, 69, 78, 84, 32, 114, 111, 111, 116, 32, 69,
            77, 80, 84, 89, 62,
          ]),
        },
      ];
    },
    importDtd: importDtdSource,
    importXsd: importXsdSource,
    ...overrides,
  };
}

describe('schema package failure boundaries', () => {
  it('passes through a discovery failure without mutating caller bytes', async () => {
    const data = new Uint8Array([1, 2, 3]);
    const before = data.slice();
    const discoverArchive = vi.fn(async (input) => {
      if (input.data instanceof Uint8Array) input.data[0] = 99;
      return {
        status: 'failure' as const,
        diagnostics: [
          {
            stage: 'archive' as const,
            code: 'invalid-archive' as const,
            severity: 'error' as const,
            message: 'Stable public failure.',
          },
        ],
      };
    });
    const result = await importSchemaArchivePackage(
      { filename: 'package.zip', data },
      dependencies({ discoverArchive }),
    );

    expect(result).toEqual({
      status: 'failure',
      diagnostics: [
        {
          stage: 'archive',
          code: 'invalid-archive',
          severity: 'error',
          message: 'Stable public failure.',
        },
      ],
    });
    expect(data).toEqual(before);
    expect('project' in result).toBe(false);
  });

  it('keeps loader exceptions and local paths private', async () => {
    const result = await importSchemaArchivePackage(
      { filename: 'package.zip', data: new Uint8Array([1, 2, 3]) },
      dependencies({
        async loadContents(data) {
          if (data instanceof Uint8Array) data[0] = 99;
          throw new Error(
            'E:\\private\\schema.dtd contains top secret source text',
          );
        },
      }),
    );
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      status: 'failure',
      diagnostics: [{ code: 'archive-entry-read-failure' }],
    });
    expect(serialized).not.toContain('E:\\\\private');
    expect(serialized).not.toContain('top secret');
    expect(serialized).not.toContain('<!ELEMENT');
  });

  it('rejects extracted content that does not exactly match the manifest', async () => {
    const missing = await importSchemaArchivePackage(
      { filename: 'package.zip', data: new Uint8Array([1]) },
      dependencies({
        async loadContents() {
          return [];
        },
      }),
    );
    const reordered = await importSchemaArchivePackage(
      { filename: 'package.zip', data: new Uint8Array([1]) },
      dependencies({
        async loadContents() {
          return [
            {
              archivePath: 'schemas/other.dtd',
              bytes: new Uint8Array(),
            },
          ];
        },
      }),
    );

    expect(missing).toMatchObject({
      status: 'failure',
      diagnostics: [{ code: 'archive-entry-missing' }],
    });
    expect(reordered).toMatchObject({
      status: 'failure',
      diagnostics: [{ code: 'archive-entry-read-failure' }],
    });
  });

  it('converts importer throws and importer failures to atomic failures', async () => {
    const thrown = await importSchemaArchivePackage(
      { filename: 'package.zip', data: new Uint8Array([1]) },
      dependencies({
        importDtd() {
          throw new Error('private importer internals');
        },
      }),
    );
    const failed = await importSchemaArchivePackage(
      { filename: 'package.zip', data: new Uint8Array([1]) },
      dependencies({
        importDtd(sourceText, options) {
          return importDtdSource('<!ELEMENT', options);
        },
      }),
    );

    for (const result of [thrown, failed]) {
      expect(result.status).toBe('failure');
      expect('project' in result).toBe(false);
      expect(JSON.stringify(result)).not.toContain('private importer');
    }
    expect(thrown).toMatchObject({
      diagnostics: [{ code: 'source-import-failed' }],
    });
    expect(failed.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'source-import-failed' }),
    );
  });

  it('rejects an invalid assembled graph with no partial project', async () => {
    const invalidImport = (
      _sourceText: string,
      options: DtdImportOptions,
    ): DtdImportResult => ({
      status: 'success',
      project: {
        id: options.projectId,
        displayName: options.displayName,
        sourceFiles: [
          { id: options.sourceFileId, filename: options.sourceFilename },
        ],
        nodes: [
          {
            id: 'root',
            kind: 'dtdElement',
            name: 'root',
            sourceFileId: options.sourceFileId,
            sourceOrder: 0,
          },
        ],
        edges: [
          {
            id: 'dangling',
            kind: 'references',
            sourceNodeId: 'root',
            targetNodeId: 'missing',
          },
        ],
        rootNodeIds: ['root'],
      },
      contentKindsByNodeId: { root: 'empty' },
      dtdAttributesByNodeId: {},
      comments: [],
      commentsByNodeId: {},
      schemaLevelComments: [],
      sourceMarkupByNodeId: {},
      initialFocusNodeId: 'root',
      diagnostics: [],
      visualization: completeVisualizationResult,
    });
    const first = await importSchemaArchivePackage(
      { filename: 'package.zip', data: new Uint8Array([1]) },
      dependencies({ importDtd: invalidImport }),
    );
    const second = await importSchemaArchivePackage(
      { filename: 'package.zip', data: new Uint8Array([1]) },
      dependencies({ importDtd: invalidImport }),
    );

    expect(first).toEqual(second);
    expect(first.status).toBe('failure');
    expect('project' in first).toBe(false);
    expect(first.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'package-project-validation-failed',
      }),
    );
    expect(first.diagnostics.length).toBeLessThanOrEqual(100);
  });

  it('sorts and retains all diagnostics deterministically', async () => {
    const discoverArchive = async () => ({
      status: 'failure' as const,
      diagnostics: Array.from({ length: 125 }, (_, index) => ({
        stage: 'archive' as const,
        code: 'unsafe-entry-path' as const,
        severity: 'error' as const,
        message: `Failure ${String(124 - index).padStart(3, '0')}`,
        entryPath: `entry-${String(124 - index).padStart(3, '0')}`,
      })),
    });
    const input = {
      filename: 'package.zip',
      data: new Uint8Array([1]),
    };
    const first = await importSchemaArchivePackage(
      input,
      dependencies({ discoverArchive }),
    );
    const second = await importSchemaArchivePackage(
      input,
      dependencies({ discoverArchive }),
    );

    expect(first).toEqual(second);
    expect(first.diagnostics).toHaveLength(125);
    expect(first.diagnostics[0]).toMatchObject({
      entryPath: 'entry-000',
    });
    expect(first.diagnostics[124]).toMatchObject({
      entryPath: 'entry-124',
    });
  });
});
