import { describe, expect, it } from 'vitest';
import {
  createSchemaWorkerFailureDiagnostic,
  isPlainStructuredCloneValue,
  isSchemaImportProgress,
  isSchemaImportWorkerRequest,
  isSchemaImportWorkerResponse,
  isSchemaWorkerImportResult,
  isSchemaWorkerFailureDiagnostic,
  schemaWorkerFailureMessages,
  type SchemaImportWorkerRequest,
} from './schemaImportWorkerProtocol';

const baseOptions = {
  projectId: 'project',
  displayName: 'Schema',
  sourceFileId: 'source',
  sourceFilename: 'schema.xsd',
};

function request(format: 'dtd' | 'xsd' | 'zip'): SchemaImportWorkerRequest {
  if (format === 'zip') {
    return {
      type: 'import',
      requestId: 'request-3',
      format,
      filename: 'schemas.zip',
      data: new ArrayBuffer(4),
    };
  }
  return {
    type: 'import',
    requestId: `request-${format}`,
    format,
    filename: `schema.${format}`,
    sourceText: '<schema/>',
    options: baseOptions,
  };
}

describe('schema import worker request protocol', () => {
  it.each(['dtd', 'xsd', 'zip'] as const)(
    'accepts a valid clone-compatible %s request without mutation',
    (format) => {
      const value = request(format);
      const before =
        value.format === 'zip'
          ? new Uint8Array(value.data).slice()
          : JSON.parse(JSON.stringify(value));
      expect(isSchemaImportWorkerRequest(value)).toBe(true);
      expect(isPlainStructuredCloneValue(value)).toBe(true);
      expect(structuredClone(value)).toEqual(value);
      if (value.format === 'zip') {
        expect(new Uint8Array(value.data)).toEqual(before);
      } else {
        expect(value).toEqual(before);
      }
    },
  );

  it.each([
    null,
    {},
    { type: 'unknown', requestId: 'x' },
    { type: 'import', requestId: 1, format: 'dtd' },
    {
      type: 'import',
      requestId: 'x',
      format: 'dtd',
      filename: 'a.dtd',
      sourceText: 'x',
      options: {},
    },
    {
      type: 'import',
      requestId: 'x',
      format: 'zip',
      filename: 'a.zip',
      data: new Uint8Array(2),
    },
  ])('rejects malformed requests defensively', (value) => {
    expect(isSchemaImportWorkerRequest(value)).toBe(false);
  });
});

describe('schema import progress protocol', () => {
  it.each([
    { phase: 'preparing', format: 'dtd', filename: 'a.dtd' },
    { phase: 'parsing', format: 'xsd', filename: 'a.xsd' },
    { phase: 'building', format: 'dtd', filename: 'a.dtd' },
    { phase: 'discovering-package', format: 'zip', filename: 'a.zip' },
    { phase: 'reading-package', format: 'zip', filename: 'a.zip' },
    { phase: 'resolving-package', format: 'zip', filename: 'a.zip' },
    { phase: 'finalizing', format: 'xsd', filename: 'a.xsd' },
    {
      phase: 'importing-package-source',
      format: 'zip',
      filename: 'a.zip',
      current: 2,
      total: 3,
      currentSourceFilename: 'schemas/types.xsd',
    },
  ])('accepts truthful progress %#', (value) => {
    expect(isSchemaImportProgress(value)).toBe(true);
  });

  it.each([
    { phase: 'parsing', format: 'zip', filename: 'a.zip' },
    { phase: 'reading-package', format: 'xsd', filename: 'a.xsd' },
    {
      phase: 'importing-package-source',
      format: 'zip',
      filename: 'a.zip',
      current: 0,
      total: 3,
      currentSourceFilename: 'a.xsd',
    },
    {
      phase: 'importing-package-source',
      format: 'zip',
      filename: 'a.zip',
      current: 4,
      total: 3,
      currentSourceFilename: 'a.xsd',
    },
    {
      phase: 'building',
      format: 'xsd',
      filename: 'a.xsd',
      current: 1,
      total: 2,
    },
  ])('rejects false or malformed progress %#', (value) => {
    expect(isSchemaImportProgress(value)).toBe(false);
  });
});

describe('schema import worker response protocol', () => {
  it('accepts package-entry Search documents without pretending they are schema nodes', () => {
    const visualization = {
      summary: {
        completeness: 'complete' as const,
        totalFindingCount: 0,
        retainedFindingCount: 0,
        omittedConstructCount: 0,
        placeholderCount: 0,
      },
      findings: [],
    };
    expect(
      isSchemaWorkerImportResult({
        format: 'zip',
        importResult: {
          status: 'success',
          diagnostics: [],
          visualization,
        },
        diagnostics: [],
        visualization,
        searchIndex: {
          projectId: 'package-project',
          documents: [
            {
              id: 'search-document:readme',
              resultKind: 'package-entry',
              nodeId: 'package-entry:readme',
              packageEntryId: 'package-entry:readme',
              packageEntryKind: 'ignored',
              nodeCategory: 'packageEntry',
              nodeName: 'README.txt',
              normalizedNodeName: 'readme.txt',
              sourceOrder: 1,
              fields: [],
            },
          ],
        },
      }),
    ).toBe(true);
  });

  it('accepts progress, success, and stable failure responses', () => {
    expect(
      isSchemaImportWorkerResponse({
        type: 'progress',
        requestId: 'request',
        progress: { phase: 'parsing', format: 'xsd', filename: 'a.xsd' },
      }),
    ).toBe(true);
    expect(
      isSchemaImportWorkerResponse({
        type: 'success',
        requestId: 'request',
        result: {
          format: 'xsd',
          importResult: {
            status: 'failure',
            diagnostics: [
              {
                stage: 'xml',
                severity: 'error',
                message: 'Complete worker diagnostic.',
              },
            ],
          },
          diagnostics: [
            {
              id: 'request:diagnostic:1',
              severity: 'error',
              message: 'Complete worker diagnostic.',
              fileName: 'member.xsd',
              line: 12,
              column: 4,
              code: 'missing-end-tag',
              source: 'xml',
              relatedNodeId: 'node-1',
            },
          ],
        },
      }),
    ).toBe(true);
    expect(
      isSchemaImportWorkerResponse({
        type: 'failure',
        requestId: 'request',
        diagnostic: createSchemaWorkerFailureDiagnostic(
          'worker-runtime-failure',
        ),
      }),
    ).toBe(true);
  });

  it.each([
    { type: 'unknown', requestId: 'request' },
    { type: 'success', requestId: 'request', result: new Error('private') },
    {
      type: 'success',
      requestId: 'request',
      result: {
        format: 'xsd',
        importResult: { status: 'success', map: new Map() },
      },
    },
    {
      type: 'failure',
      requestId: 'request',
      diagnostic: {
        stage: 'worker',
        code: 'worker-runtime-failure',
        severity: 'error',
        message: 'private browser detail',
      },
    },
  ])('rejects malformed or non-plain responses %#', (value) => {
    expect(isSchemaImportWorkerResponse(value)).toBe(false);
  });

  it('rejects cycles but permits repeated plain references', () => {
    const shared = { value: 'safe' };
    expect(isPlainStructuredCloneValue({ first: shared, second: shared })).toBe(
      true,
    );
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(isPlainStructuredCloneValue(cyclic)).toBe(false);
  });

  it('defines exact stable private diagnostics for every worker code', () => {
    for (const [code, message] of Object.entries(schemaWorkerFailureMessages)) {
      const diagnostic = createSchemaWorkerFailureDiagnostic(
        code as keyof typeof schemaWorkerFailureMessages,
      );
      expect(diagnostic).toEqual({
        stage: 'worker',
        code,
        severity: 'error',
        message,
        ...(code === 'worker-timeout' ? { category: 'resource-limit' } : {}),
      });
      expect(isSchemaWorkerFailureDiagnostic(diagnostic)).toBe(true);
      expect(message).not.toMatch(/(?:stack|https?:|[a-z]:\\)/iu);
    }
  });
});
