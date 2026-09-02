import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import librarySource from '../../tests/fixtures/dtd/library.dtd?raw';
import basicXsd from '../../tests/fixtures/xsd/basic-structure.xsd?raw';
import { importDtdSource } from '../schema/dtd';
import { importXsdSource } from '../schema/xsd';
import { importSchemaArchivePackage } from '../app/import/schemaPackage';
import {
  executeSchemaImportWorkerRequest,
  type SchemaImportWorkerRuntimeDependencies,
} from './schemaImportWorkerRuntime';
import type {
  SchemaImportProgress,
  SchemaImportWorkerRequest,
} from './schemaImportWorkerProtocol';
import type {
  XercesValidationRequest,
  XercesValidationResult,
} from '../standards/xerces';
import type { RelaxNgValidationRequest } from '../standards/relaxng';

const options = {
  projectId: 'project',
  displayName: 'Schema',
  sourceFileId: 'source',
  sourceFilename: 'schema.xsd',
};

async function makeZip(
  files: Readonly<Record<string, string>>,
): Promise<ArrayBuffer> {
  const archive = new JSZip();
  for (const [path, source] of Object.entries(files)) {
    archive.file(path, source, { createFolders: false });
  }
  const bytes = await archive.generateAsync({
    type: 'uint8array',
    compression: 'STORE',
  });
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function phases(progress: readonly SchemaImportProgress[]): string[] {
  return progress.map(({ phase }) => phase);
}

async function acceptStandards(
  request: XercesValidationRequest,
): Promise<XercesValidationResult> {
  return {
    attemptId: request.attemptId,
    engine: { name: 'Apache Xerces-C++', version: '3.3.0' },
    status: 'valid',
    diagnostics: [],
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

function testDependencies(
  overrides: Partial<SchemaImportWorkerRuntimeDependencies> = {},
): SchemaImportWorkerRuntimeDependencies {
  return {
    importDtd: importDtdSource,
    importXsd: importXsdSource,
    importPackage: (input, execution) =>
      importSchemaArchivePackage(input, undefined, execution),
    validateStandards: acceptStandards,
    ...overrides,
  };
}

describe('schema import worker runtime', () => {
  it('executes a real DTD import with truthful phase order', async () => {
    const progress: SchemaImportProgress[] = [];
    const result = await executeSchemaImportWorkerRequest(
      {
        type: 'import',
        requestId: 'dtd',
        format: 'dtd',
        filename: 'library.dtd',
        sourceText: librarySource,
        options: { ...options, sourceFilename: 'library.dtd' },
      },
      (value) => progress.push(value),
      testDependencies(),
    );
    expect(result.format).toBe('dtd');
    expect(result.importResult.status).toBe('success');
    expect(phases(progress)).toEqual([
      'preparing',
      'validating-standards',
      'parsing',
      'building',
      'indexing-search',
      'finalizing',
    ]);
  });

  it('executes a real XSD import including source-markup finalization', async () => {
    const progress: SchemaImportProgress[] = [];
    const result = await executeSchemaImportWorkerRequest(
      {
        type: 'import',
        requestId: 'xsd',
        format: 'xsd',
        filename: 'schema.xsd',
        sourceText: basicXsd,
        options,
      },
      (value) => progress.push(value),
      testDependencies(),
    );
    expect(result.format).toBe('xsd');
    expect(result.importResult.status).toBe('success');
    if (result.importResult.status === 'success') {
      expect(Object.keys(result.importResult.sourceMarkupByNodeId).length).toBe(
        result.importResult.project.nodes.filter(
          ({ kind }) => kind !== 'builtInType',
        ).length,
      );
    }
    expect(phases(progress)).toEqual([
      'preparing',
      'validating-standards',
      'parsing',
      'building',
      'indexing-search',
      'finalizing',
    ]);
  });

  it('stops source phases after a real parse failure', async () => {
    const progress: SchemaImportProgress[] = [];
    const result = await executeSchemaImportWorkerRequest(
      {
        type: 'import',
        requestId: 'broken',
        format: 'xsd',
        filename: 'broken.xsd',
        sourceText: '<xs:schema>',
        options,
      },
      (value) => progress.push(value),
      testDependencies(),
    );
    expect(result.importResult.status).toBe('failure');
    expect(result.diagnostics).toHaveLength(
      result.importResult.diagnostics.length,
    );
    expect(result.diagnostics[0]).toMatchObject({
      id: 'broken:diagnostic:1',
      severity: 'error',
      fileName: 'broken.xsd',
      source: 'xml',
    });
    expect(result.diagnostics[result.diagnostics.length - 1]).toMatchObject({
      source: 'project',
      category: 'visualization-internal',
      code: 'xml-carousel:visualization-extraction-failed',
    });
    expect(result.diagnostics[0]?.message).toBe(
      result.importResult.diagnostics[0]?.message,
    );
    const rawDiagnostic = result.importResult.diagnostics[0];
    expect(
      rawDiagnostic && 'range' in rawDiagnostic
        ? result.diagnostics[0]?.line
        : undefined,
    ).toBe(
      rawDiagnostic && 'range' in rawDiagnostic
        ? rawDiagnostic.range?.start.line
        : undefined,
    );
    expect(
      rawDiagnostic && 'range' in rawDiagnostic
        ? result.diagnostics[0]?.column
        : undefined,
    ).toBe(
      rawDiagnostic && 'range' in rawDiagnostic
        ? rawDiagnostic.range?.start.column
        : undefined,
    );
    expect(phases(progress)).toEqual([
      'preparing',
      'validating-standards',
      'parsing',
    ]);
  });

  it('executes ZIP discovery, reading, manifest-order imports, resolution, and finalization', async () => {
    const data = await makeZip({
      'schemas/root.xsd':
        '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:t="urn:test" targetNamespace="urn:test"><xs:element name="root" type="t:Shared"/></xs:schema>',
      'schemas/types.xsd':
        '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:t="urn:test" targetNamespace="urn:test"><xs:complexType name="Shared"><xs:sequence><xs:element name="child" type="xs:string"/></xs:sequence></xs:complexType></xs:schema>',
      'ignored.txt': 'not a schema source',
    });
    const progress: SchemaImportProgress[] = [];
    const result = await executeSchemaImportWorkerRequest(
      {
        type: 'import',
        requestId: 'zip',
        format: 'zip',
        filename: 'schemas.zip',
        data,
      },
      (value) => progress.push(value),
      testDependencies(),
    );
    expect(result.format).toBe('zip');
    expect(result.importResult.status).toBe('success');
    expect(phases(progress)).toEqual([
      'preparing',
      'discovering-package',
      'reading-package',
      'validating-standards',
      'importing-package-source',
      'importing-package-source',
      'resolving-package',
      'indexing-search',
      'finalizing',
    ]);
    expect(
      progress
        .filter(({ phase }) => phase === 'importing-package-source')
        .map(({ current, total, currentSourceFilename }) => ({
          current,
          total,
          currentSourceFilename,
        })),
    ).toEqual([
      {
        current: 1,
        total: 2,
        currentSourceFilename: 'root.xsd',
      },
      {
        current: 2,
        total: 2,
        currentSourceFilename: 'types.xsd',
      },
    ]);
  });

  it('loads the RELAX NG package authority only for ZIPs containing RNG sources', async () => {
    const validateRelaxNg = vi.fn(
      async (request: RelaxNgValidationRequest) => ({
        attemptId: request.attemptId,
        engine: {
          name: 'libxml2 RELAX NG' as const,
          version: '2.15.3' as const,
        },
        status: 'valid' as const,
        diagnostics: [],
        dependencyRequests: [],
        metrics: {
          elapsedMs: 1,
          fileCount: request.files.length,
          inputBytes: request.files.reduce(
            (total, file) => total + file.bytes.length,
            0,
          ),
        },
      }),
    );
    const dependencies = testDependencies({ validateRelaxNg });

    await executeSchemaImportWorkerRequest(
      {
        type: 'import',
        requestId: 'dtd-only-zip',
        format: 'zip',
        filename: 'dtd-only.zip',
        data: await makeZip({ 'schema.dtd': '<!ELEMENT root EMPTY>' }),
      },
      vi.fn(),
      dependencies,
    );
    expect(validateRelaxNg).not.toHaveBeenCalled();

    const rngResult = await executeSchemaImportWorkerRequest(
      {
        type: 'import',
        requestId: 'rng-zip',
        format: 'zip',
        filename: 'rng.zip',
        data: await makeZip({
          'main.rng':
            '<grammar xmlns="http://relaxng.org/ns/structure/1.0"><include href="common.rng"/></grammar>',
          'common.rng': '<empty xmlns="http://relaxng.org/ns/structure/1.0"/>',
        }),
      },
      vi.fn(),
      dependencies,
    );
    expect(rngResult.importResult.status).toBe('success');
    expect(validateRelaxNg).toHaveBeenCalledTimes(1);
    expect(validateRelaxNg.mock.calls[0]?.[0]).toMatchObject({
      entryPath: 'main.rng',
      files: [{ path: 'common.rng' }, { path: 'main.rng' }],
    });
  });

  it('continues unresolved package warnings through finalization', async () => {
    const data = await makeZip({
      'root.xsd':
        '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:t="urn:test" targetNamespace="urn:test"><xs:element name="root" type="t:Missing"/></xs:schema>',
    });
    const progress: SchemaImportProgress[] = [];
    const result = await executeSchemaImportWorkerRequest(
      {
        type: 'import',
        requestId: 'warning',
        format: 'zip',
        filename: 'warning.zip',
        data,
      },
      (value) => progress.push(value),
      testDependencies(),
    );
    expect(result.importResult.status).toBe('success');
    const observedPhases = phases(progress);
    expect(observedPhases[observedPhases.length - 1]).toBe('finalizing');
    if (result.format === 'zip' && result.importResult.status === 'success') {
      expect(result.importResult.unresolvedReferences).toHaveLength(1);
    }
  });

  it('does not emit package phases after an actual discovery failure', async () => {
    const progress: SchemaImportProgress[] = [];
    const result = await executeSchemaImportWorkerRequest(
      {
        type: 'import',
        requestId: 'invalid',
        format: 'zip',
        filename: 'invalid.zip',
        data: new ArrayBuffer(2),
      },
      (value) => progress.push(value),
      testDependencies(),
    );
    expect(result.importResult.status).toBe('failure');
    expect(phases(progress)).toEqual(['preparing', 'discovering-package']);
  });

  it('suppresses duplicate progress and observer exceptions', async () => {
    const seen: SchemaImportProgress[] = [];
    const importDtd: typeof importDtdSource = (
      _source,
      _options,
      execution,
    ) => {
      execution?.onProgress?.('parsing');
      execution?.onProgress?.('parsing');
      return { status: 'failure', diagnostics: [] };
    };
    const dependencies: SchemaImportWorkerRuntimeDependencies = {
      importDtd,
      importXsd: importXsdSource,
      importPackage: (input, execution) =>
        importSchemaArchivePackage(input, undefined, execution),
      validateStandards: acceptStandards,
    };
    let calls = 0;
    const result = await executeSchemaImportWorkerRequest(
      {
        type: 'import',
        requestId: 'observer',
        format: 'dtd',
        filename: 'a.dtd',
        sourceText: '',
        options: { ...options, sourceFilename: 'a.dtd' },
      },
      (value) => {
        calls += 1;
        seen.push(value);
        throw new Error('observer detail');
      },
      dependencies,
    );
    expect(result.importResult.status).toBe('failure');
    expect(calls).toBe(3);
    expect(phases(seen)).toEqual([
      'preparing',
      'validating-standards',
      'parsing',
    ]);
  });

  it('rejects unexpected importer throws for the entry layer to privatize', async () => {
    const dependencies: SchemaImportWorkerRuntimeDependencies = {
      importDtd: () => {
        throw new Error('private runtime stack');
      },
      importXsd: importXsdSource,
      importPackage: (input, execution) =>
        importSchemaArchivePackage(input, undefined, execution),
      validateStandards: acceptStandards,
    };
    const request: SchemaImportWorkerRequest = {
      type: 'import',
      requestId: 'throw',
      format: 'dtd',
      filename: 'a.dtd',
      sourceText: '',
      options: { ...options, sourceFilename: 'a.dtd' },
    };
    await expect(
      executeSchemaImportWorkerRequest(request, vi.fn(), dependencies),
    ).rejects.toThrow('private runtime stack');
  });
});
