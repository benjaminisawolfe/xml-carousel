import { describe, expect, it, vi } from 'vitest';
import type { DtdImportOptions, DtdImportResult } from '../../../schema/dtd';
import { completeVisualizationResult } from '../../../schema/visualization';
import type {
  SchemaArchiveManifest,
  SchemaArchiveSchemaEntry,
} from '../schemaArchive';
import {
  MAX_SCHEMA_PACKAGE_ENTRY_BYTES,
  MAX_SCHEMA_PACKAGE_TOTAL_BYTES,
} from './schemaPackageConstants';
import { importSchemaArchivePackage } from './importSchemaArchivePackage';
import type { SchemaPackageImportDependencies } from './schemaPackageTypes';

function entries(count: number): readonly SchemaArchiveSchemaEntry[] {
  return Array.from({ length: count }, (_, sourceOrder) => ({
    id: `entry-${sourceOrder}`,
    archivePath: `schemas/${sourceOrder}.dtd`,
    packageRelativePath: `${sourceOrder}.dtd`,
    directoryPath: 'schemas',
    basename: `${sourceOrder}.dtd`,
    format: 'dtd' as const,
    sourceOrder,
  }));
}

function manifest(schemaEntries: readonly SchemaArchiveSchemaEntry[]) {
  return {
    id: 'schema-package:package.zip',
    archiveFilename: 'package.zip',
    archiveByteLength: 1,
    packageRoot: 'schemas',
    commonRootDirectory: 'schemas',
    entries: [],
    schemaEntries,
    xsdCount: 0,
    dtdCount: schemaEntries.length,
    rngCount: 0,
    ignoredFileCount: 0,
    totalFileEntryCount: schemaEntries.length,
  } satisfies SchemaArchiveManifest;
}

function successfulDtd(options: DtdImportOptions): DtdImportResult {
  const nodeId = `node:${options.sourceFileId}`;
  return {
    status: 'success',
    project: {
      id: options.projectId,
      displayName: options.displayName,
      sourceFiles: [
        { id: options.sourceFileId, filename: options.sourceFilename },
      ],
      nodes: [
        {
          id: nodeId,
          kind: 'dtdElement',
          name: 'root',
          sourceFileId: options.sourceFileId,
          sourceOrder: 0,
        },
      ],
      edges: [],
      rootNodeIds: [nodeId],
    },
    contentKindsByNodeId: { [nodeId]: 'empty' },
    dtdAttributesByNodeId: {},
    comments: [],
    commentsByNodeId: {},
    schemaLevelComments: [],
    sourceMarkupByNodeId: {},
    initialFocusNodeId: nodeId,
    diagnostics: [],
    visualization: completeVisualizationResult,
  };
}

function dependencies(
  schemaEntries: readonly SchemaArchiveSchemaEntry[],
  byteLengths: readonly number[],
) {
  const importDtd = vi.fn((_sourceText: string, options: DtdImportOptions) =>
    successfulDtd(options),
  );
  const value: SchemaPackageImportDependencies = {
    async discoverArchive() {
      return { status: 'success', manifest: manifest(schemaEntries) };
    },
    async loadContents() {
      return schemaEntries.map((entry, index) => ({
        archivePath: entry.archivePath,
        bytes: new Uint8Array(byteLengths[index] ?? 0),
      }));
    },
    importDtd,
    importXsd() {
      throw new Error('XSD import is not expected.');
    },
  };
  return { value, importDtd };
}

describe('schema package extracted-content limits', () => {
  it.each([MAX_SCHEMA_PACKAGE_ENTRY_BYTES - 1, MAX_SCHEMA_PACKAGE_ENTRY_BYTES])(
    'accepts per-entry boundary %i',
    async (byteLength) => {
      const schemaEntries = entries(1);
      const deps = dependencies(schemaEntries, [byteLength]);
      const result = await importSchemaArchivePackage(
        { filename: 'package.zip', data: new Uint8Array([1]) },
        deps.value,
      );

      expect(result.status).toBe('success');
      expect(deps.importDtd).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects over-limit entries before decoding or parsing', async () => {
    const schemaEntries = entries(1);
    const deps = dependencies(schemaEntries, [
      MAX_SCHEMA_PACKAGE_ENTRY_BYTES + 1,
    ]);
    const result = await importSchemaArchivePackage(
      { filename: 'package.zip', data: new Uint8Array([1]) },
      deps.value,
    );

    expect(result).toMatchObject({
      status: 'failure',
      diagnostics: [{ code: 'schema-entry-too-large' }],
    });
    expect(deps.importDtd).not.toHaveBeenCalled();
    expect('project' in result).toBe(false);
  });

  it.each([MAX_SCHEMA_PACKAGE_TOTAL_BYTES - 1, MAX_SCHEMA_PACKAGE_TOTAL_BYTES])(
    'accepts aggregate boundary %i',
    async (totalBytes) => {
      const count =
        MAX_SCHEMA_PACKAGE_TOTAL_BYTES / MAX_SCHEMA_PACKAGE_ENTRY_BYTES;
      const schemaEntries = entries(count);
      const lengths = schemaEntries.map(() => MAX_SCHEMA_PACKAGE_ENTRY_BYTES);
      lengths[lengths.length - 1] -=
        MAX_SCHEMA_PACKAGE_TOTAL_BYTES - totalBytes;
      const deps = dependencies(schemaEntries, lengths);
      const result = await importSchemaArchivePackage(
        { filename: 'package.zip', data: new Uint8Array([1]) },
        deps.value,
      );

      expect(result.status).toBe('success');
      expect(deps.importDtd).toHaveBeenCalledTimes(count);
    },
  );

  it('does not begin parsing when extracted content exceeds the total', async () => {
    const exactCount =
      MAX_SCHEMA_PACKAGE_TOTAL_BYTES / MAX_SCHEMA_PACKAGE_ENTRY_BYTES;
    const schemaEntries = entries(exactCount + 1);
    const deps = dependencies(
      schemaEntries,
      schemaEntries.map(() => MAX_SCHEMA_PACKAGE_ENTRY_BYTES),
    );
    const result = await importSchemaArchivePackage(
      { filename: 'package.zip', data: new Uint8Array([1]) },
      deps.value,
    );

    expect(result).toMatchObject({
      status: 'failure',
      diagnostics: [{ code: 'schema-package-too-large' }],
    });
    expect(deps.importDtd).not.toHaveBeenCalled();
  });
});
