import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import validXsd from '../../tests/fixtures/xerces-wasm-spike/xsd/valid.xsd?raw';
import parameterDtd from '../../tests/fixtures/xerces-wasm-spike/dtd/parameter/main.dtd?raw';
import parameterEntity from '../../tests/fixtures/xerces-wasm-spike/dtd/parameter/declarations.ent?raw';
import mixedDtd from '../../tests/fixtures/dtd/visualization/mixed-supported-unsupported.dtd?raw';
import mixedXsd from '../../tests/fixtures/xsd/visualization/mixed-supported-unsupported.xsd?raw';
import unsupportedOnlyDtd from '../../tests/fixtures/dtd/visualization/unsupported-only.dtd?raw';
import { importDtdSource } from '../schema/dtd';
import { importXsdSource } from '../schema/xsd';
import { importSchemaArchivePackage } from '../app/import/schemaPackage';
import type {
  XercesValidationRequest,
  XercesValidationResult,
} from '../standards/xerces';
import {
  executeSchemaImportWorkerRequest,
  type SchemaImportWorkerRuntimeDependencies,
} from './schemaImportWorkerRuntime';

const options = {
  projectId: 'project',
  displayName: 'Schema',
  sourceFileId: 'source',
  sourceFilename: 'schema.xsd',
};

function validation(
  request: XercesValidationRequest,
  status: XercesValidationResult['status'],
): XercesValidationResult {
  return {
    attemptId: request.attemptId,
    engine: { name: 'Apache Xerces-C++', version: '3.3.0' },
    status,
    diagnostics:
      status === 'valid'
        ? []
        : [
            {
              stage: 'standards',
              code: `xerces:${status}`,
              severity: 'error',
              message: `Xerces returned ${status}.`,
              category:
                status === 'invalid'
                  ? 'standards-invalid'
                  : status === 'blocked'
                    ? 'blocked-dependency'
                    : status === 'unsupported'
                      ? 'unsupported-standard'
                      : 'engine-internal',
              fileName: request.entryPath,
              source: request.format,
              line: 3,
              column: 7,
            },
          ],
    metrics: {
      elapsedMs: 1,
      fileCount: request.files.length,
      inputBytes: request.files.reduce(
        (total, file) => total + file.bytes.length,
        0,
      ),
    },
  };
}

function dependencies(
  validateStandards: (
    request: XercesValidationRequest,
  ) => Promise<XercesValidationResult>,
  importXsd: typeof importXsdSource = importXsdSource,
): SchemaImportWorkerRuntimeDependencies {
  return {
    importDtd: importDtdSource,
    importXsd,
    importPackage: (input, execution) =>
      importSchemaArchivePackage(input, undefined, execution),
    validateStandards,
  };
}

describe('authoritative Xerces worker boundary', () => {
  it.each(['invalid', 'blocked', 'unsupported', 'internal-error'] as const)(
    'rejects %s before the visualization extractor',
    async (status) => {
      const extractor = vi.fn(importXsdSource);
      const result = await executeSchemaImportWorkerRequest(
        {
          type: 'import',
          requestId: status,
          format: 'xsd',
          filename: 'schema.xsd',
          sourceText: validXsd,
          options,
        },
        vi.fn(),
        dependencies(async (request) => validation(request, status), extractor),
      );
      expect(result.importResult.status).toBe('failure');
      expect(extractor).not.toHaveBeenCalled();
      expect(result.diagnostics[0]).toMatchObject({
        fileName: 'schema.xsd',
        line: 3,
        column: 7,
      });
    },
  );

  it('allows Xerces-valid input to proceed to extraction and indexing', async () => {
    const extractor = vi.fn(importXsdSource);
    const progress: string[] = [];
    const result = await executeSchemaImportWorkerRequest(
      {
        type: 'import',
        requestId: 'accepted',
        format: 'xsd',
        filename: 'schema.xsd',
        sourceText: validXsd,
        options,
      },
      ({ phase }) => progress.push(phase),
      dependencies(async (request) => validation(request, 'valid'), extractor),
    );
    expect(result.importResult.status).toBe('success');
    expect(extractor).toHaveBeenCalledOnce();
    expect(progress.indexOf('validating-standards')).toBeLessThan(
      progress.indexOf('parsing'),
    );
  });

  it.each([
    ['dtd', 'mixed.dtd', mixedDtd],
    ['xsd', 'mixed.xsd', mixedXsd],
  ] as const)(
    'opens a Xerces-accepted mixed %s source as a partial project',
    async (format, filename, sourceText) => {
      const result = await executeSchemaImportWorkerRequest(
        {
          type: 'import',
          requestId: `production-partial-${format}`,
          format,
          filename,
          sourceText,
          options: { ...options, sourceFilename: filename },
        },
        vi.fn(),
        dependencies(async (request) => validation(request, 'valid')),
      );
      expect(result.importResult.status).toBe('success');
      expect(result.visualization?.summary.completeness).toBe(
        format === 'dtd' ? 'complete' : 'partial',
      );
      expect(
        result.diagnostics.some(
          ({ source, category }) =>
            source === 'visualization' && category === 'visualization',
        ),
      ).toBe(format === 'xsd');
    },
  );

  it('cannot reclassify a Xerces-valid schema as standards-invalid when extraction fails', async () => {
    const result = await executeSchemaImportWorkerRequest(
      {
        type: 'import',
        requestId: 'visualization',
        format: 'xsd',
        filename: 'schema.xsd',
        sourceText: validXsd,
        options,
      },
      vi.fn(),
      dependencies(
        async (request) => validation(request, 'valid'),
        () => ({
          status: 'failure',
          diagnostics: [],
        }),
      ),
    );
    expect(result.importResult.status).toBe('failure');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        category: 'visualization-internal',
        code: 'xml-carousel:visualization-extraction-failed',
        message: expect.stringMatching(/Xerces-C\+\+ accepted/iu),
      }),
    ]);
    expect(
      result.diagnostics.some(
        ({ category }) => category === 'standards-invalid',
      ),
    ).toBe(false);
  });

  it('visualizes an accepted entity-and-notation-only DTD completely', async () => {
    const result = await executeSchemaImportWorkerRequest(
      {
        type: 'import',
        requestId: 'unsupported-only-dtd',
        format: 'dtd',
        filename: 'unsupported-only.dtd',
        sourceText: unsupportedOnlyDtd,
        options: { ...options, sourceFilename: 'unsupported-only.dtd' },
      },
      vi.fn(),
      dependencies(async (request) => validation(request, 'valid')),
    );
    expect(result.importResult.status).toBe('success');
    expect(result.visualization?.summary.completeness).toBe('complete');
    expect(
      result.importResult.status === 'success'
        ? result.importResult.project.nodes.map(({ name }) => name)
        : [],
    ).toEqual(expect.arrayContaining(['author', 'png', 'logo']));
    expect(result.diagnostics).not.toContainEqual(
      expect.objectContaining({ category: 'standards-invalid' }),
    );
  });

  it('hands safe auxiliary ZIP files to Xerces without treating them as visualization roots', async () => {
    const archive = new JSZip();
    archive.file('project/main.dtd', parameterDtd, { createFolders: false });
    archive.file('project/declarations.ent', parameterEntity, {
      createFolders: false,
    });
    const bytes = await archive.generateAsync({ type: 'uint8array' });
    const validateStandards = vi.fn(
      async (request: XercesValidationRequest) => {
        expect(request.entryPath).toBe('main.dtd');
        expect(request.files.map(({ path }) => path)).toEqual([
          'declarations.ent',
          'main.dtd',
        ]);
        return validation(request, 'valid');
      },
    );

    const result = await executeSchemaImportWorkerRequest(
      {
        type: 'import',
        requestId: 'parameter-entity-package',
        format: 'zip',
        filename: 'parameter-entity.zip',
        data: bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer,
      },
      vi.fn(),
      dependencies(validateStandards),
    );

    expect(validateStandards).toHaveBeenCalledOnce();
    expect(result.importResult.status).toBe('success');
    expect(result.visualization?.summary.completeness).toBe('complete');
    expect(
      result.diagnostics.some(
        ({ category, source }) =>
          category === 'visualization' && source === 'visualization',
      ),
    ).toBe(false);
  });

  it.each([
    [
      'partial-and-complete.zip',
      ['complete.dtd', 'partial.dtd'],
      [],
      'complete',
    ],
    [
      'same-basename-partial.zip',
      ['one/schema.xsd', 'two/schema.xsd'],
      [],
      'complete',
    ],
    [
      'resolved-include-partial.zip',
      ['included.xsd', 'main.xsd'],
      [],
      'complete',
    ],
    [
      'common-root-nested-includes.zip',
      [
        'common.xsd',
        'entities/character.xsd',
        'entity.xsd',
        'rich-text.xsd',
        'rules.xsd',
      ],
      [],
      'complete',
    ],
  ] as const)(
    'aggregates partial visualization safely for %s',
    async (
      filename,
      expectedSources,
      expectedFindingSources,
      expectedCompleteness,
    ) => {
      const bytes = await readFile(
        path.resolve('tests/fixtures/zip/visualization', filename),
      );
      const result = await executeSchemaImportWorkerRequest(
        {
          type: 'import',
          requestId: `package-${filename}`,
          format: 'zip',
          filename,
          data: Uint8Array.from(bytes).buffer,
        },
        vi.fn(),
        dependencies(async (request) => validation(request, 'valid')),
      );
      expect(result.format).toBe('zip');
      if (result.format !== 'zip') return;
      expect(result.importResult.status).toBe('success');
      if (result.importResult.status !== 'success') return;
      expect(
        result.importResult.sources.map(
          ({ packageRelativePath }) => packageRelativePath,
        ),
      ).toEqual(expectedSources);
      expect(result.visualization?.summary.completeness).toBe(
        expectedCompleteness,
      );
      const sourcePaths = new Map(
        (result.importResult.project.sourceFiles ?? []).map(
          ({ id, filename }) => [id, filename],
        ),
      );
      const findingPaths = result.visualization?.findings.map(
        ({ sourceFileId }) => sourcePaths.get(sourceFileId ?? '') ?? '',
      );
      expect(new Set(findingPaths)).toEqual(new Set(expectedFindingSources));
    },
  );

  it('keeps missing package resources fatal instead of reclassifying them as visualization warnings', async () => {
    const bytes = await readFile(
      path.resolve(
        'tests/fixtures/zip/visualization/missing-include-fatal.zip',
      ),
    );
    const result = await executeSchemaImportWorkerRequest(
      {
        type: 'import',
        requestId: 'missing-resource',
        format: 'zip',
        filename: 'missing-include-fatal.zip',
        data: Uint8Array.from(bytes).buffer,
      },
      vi.fn(),
      dependencies(async (request) => validation(request, 'blocked')),
    );
    expect(result.importResult.status).toBe('failure');
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'xerces:blocked',
        severity: 'error',
        category: 'blocked-dependency',
      }),
    );
    expect(result.diagnostics).not.toContainEqual(
      expect.objectContaining({ category: 'visualization' }),
    );
  });
});
