import { describe, expect, it } from 'vitest';
import {
  createSchemaDiagnosticReport,
  MAX_RETAINED_SCHEMA_DIAGNOSTICS,
  normalizeSchemaDiagnostics,
} from './schemaDiagnosticReport';

const context = {
  attemptId: 'attempt-7',
  format: 'xsd' as const,
  attemptedFileName: 'complete-message.xsd',
};

describe('normalized schema diagnostic reports', () => {
  it.each([
    ['archive', 'unsafe-entry-path', 'security'],
    ['archive', 'archive-too-large', 'resource-limit'],
    ['archive', 'invalid-archive', 'archive-package'],
    ['package', 'schema-entry-too-large', 'resource-limit'],
    ['package', 'archive-entry-read-failure', 'archive-package'],
  ] as const)('classifies %s:%s as %s', (stage, code, expectedCategory) => {
    const [diagnostic] = normalizeSchemaDiagnostics(
      [{ stage, code, severity: 'error', message: 'bounded failure' }],
      { ...context, format: 'zip' },
    );
    expect(diagnostic?.category).toBe(expectedCategory);
  });

  it('retains bounded detail while preserving the exact uncapped total', () => {
    const diagnostics = normalizeSchemaDiagnostics(
      Array.from(
        { length: MAX_RETAINED_SCHEMA_DIAGNOSTICS + 37 },
        (_, index) => ({
          stage: 'archive',
          code: 'unsafe-entry-path',
          severity: 'error',
          message: `unsafe ${String(index).padStart(4, '0')}`,
        }),
      ),
      { ...context, format: 'zip' },
    );
    const report = createSchemaDiagnosticReport(diagnostics, {
      ...context,
      format: 'zip',
    });

    expect(report.totalCount).toBe(MAX_RETAINED_SCHEMA_DIAGNOSTICS + 37);
    expect(report.diagnostics).toHaveLength(MAX_RETAINED_SCHEMA_DIAGNOSTICS);
    expect(report.diagnostics[report.diagnostics.length - 1]).toMatchObject({
      code: 'xml-carousel:diagnostic-retention-limit',
      category: 'resource-limit',
    });
  });

  it('retains complete ordered messages and distinct identical diagnostics', () => {
    const completeMessage = `The complete diagnostic ${'detail '.repeat(80)}ends here.`;
    const diagnostics = normalizeSchemaDiagnostics(
      [
        {
          stage: 'xsd',
          severity: 'error',
          code: 'first',
          message: completeMessage,
        },
        {
          stage: 'xsd',
          severity: 'error',
          code: 'second',
          message: completeMessage,
        },
      ],
      context,
    );
    const report = createSchemaDiagnosticReport(diagnostics, context);

    expect(report.totalCount).toBe(2);
    expect(report.diagnostics.map(({ message }) => message)).toEqual([
      completeMessage,
      completeMessage,
    ]);
    expect(new Set(report.diagnostics.map(({ id }) => id)).size).toBe(2);
    expect(report.diagnostics.map(({ id }) => id)).toEqual([
      'attempt-7:diagnostic:1',
      'attempt-7:diagnostic:2',
    ]);
  });

  it('preserves supplied filename, location, code, source, and related node', () => {
    const [diagnostic] = normalizeSchemaDiagnostics(
      [
        {
          stage: 'xml',
          severity: 'warning',
          code: 'well-formedness',
          message: 'Supplied metadata survives.',
          sourceId: 'internal-source-id',
          nodeId: 'node-4',
          range: { start: { line: 17, column: 9 } },
        },
      ],
      context,
    );

    expect(diagnostic).toEqual({
      id: 'attempt-7:diagnostic:1',
      severity: 'warning',
      message: 'Supplied metadata survives.',
      fileName: 'complete-message.xsd',
      line: 17,
      column: 9,
      code: 'well-formedness',
      source: 'xml',
      relatedNodeId: 'node-4',
    });
  });

  it('keeps unknown optional metadata absent instead of guessing it', () => {
    const [diagnostic] = normalizeSchemaDiagnostics(
      [{ severity: 'error', message: 'Only known data.' }],
      context,
    );

    expect(diagnostic).toEqual({
      id: 'attempt-7:diagnostic:1',
      severity: 'error',
      message: 'Only known data.',
    });
    expect(diagnostic).not.toHaveProperty('fileName');
    expect(diagnostic).not.toHaveProperty('line');
    expect(diagnostic).not.toHaveProperty('column');
    expect(diagnostic).not.toHaveProperty('code');
    expect(diagnostic).not.toHaveProperty('source');
    expect(diagnostic).not.toHaveProperty('relatedNodeId');
  });

  it('retains multi-file package filenames and input ordering', () => {
    const packageContext = {
      attemptId: 'package-attempt',
      format: 'zip' as const,
      attemptedFileName: 'schemas.zip',
    };
    const diagnostics = normalizeSchemaDiagnostics(
      [
        {
          stage: 'xml',
          severity: 'error',
          message: 'First file.',
          sourceId: 'schema-package-source:schemas%2Ffirst.xsd',
        },
        {
          stage: 'parse',
          severity: 'error',
          message: 'Second file.',
          sourceId: 'schema-package-source:legacy%2Fsecond.dtd',
        },
      ],
      packageContext,
    );

    expect(
      diagnostics.map(({ fileName, source }) => ({ fileName, source })),
    ).toEqual([
      { fileName: 'schemas/first.xsd', source: 'xml' },
      { fileName: 'legacy/second.dtd', source: 'dtd' },
    ]);
  });
});
