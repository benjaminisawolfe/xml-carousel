import { describe, expect, it } from 'vitest';
import type { SchemaSourceRange } from '../../schema/model';
import {
  formatSchemaImportFailure,
  type SchemaFileDiagnostic,
  type SchemaFileFormat,
} from './schemaImportFailureFormatter';

function range(line: number, column: number): SchemaSourceRange {
  return {
    start: { offset: 0, line, column },
    end: { offset: 1, line, column: column + 1 },
  };
}

function error(
  message: string,
  sourceRange?: SchemaSourceRange,
): SchemaFileDiagnostic {
  return sourceRange
    ? {
        stage: 'xml',
        code: 'unexpected-token',
        severity: 'error',
        message,
        range: sourceRange,
      }
    : {
        stage: 'file',
        format: 'xsd',
        code: 'unexpected-import-failure',
        severity: 'error',
        message,
      };
}

function warning(message: string): SchemaFileDiagnostic {
  return {
    stage: 'xsd',
    code: 'unsupported-xsd-component',
    severity: 'warning',
    message,
    range: range(1, 1),
  };
}

describe('schema import failure formatter', () => {
  it.each([
    ['dtd', 'broken.dtd'],
    ['xsd', 'broken.xsd'],
    ['zip', 'broken.zip'],
  ] as const)('uses a generic heading for %s', (format, filename) => {
    expect(
      formatSchemaImportFailure(format, filename, [error('Broken.')]).heading,
    ).toBe(`Could not open ${filename}`);
  });

  it('uses selected file for an empty visible filename', () => {
    expect(formatSchemaImportFailure('xsd', '   ', []).heading).toBe(
      'Could not open selected file',
    );
  });

  it.each([
    ['dtd', 'The selected DTD could not be imported.'],
    ['xsd', 'The selected XSD could not be imported.'],
    ['zip', 'The selected ZIP schema package could not be imported.'],
  ] as const)(
    'uses the %s fallback when no error exists',
    (format: SchemaFileFormat, message) => {
      expect(formatSchemaImportFailure(format, 'schema', []).message).toBe(
        message,
      );
    },
  );

  it('uses the first retained diagnostic and counts every remaining problem', () => {
    const result = formatSchemaImportFailure('xsd', 'broken.xsd', [
      warning('Unsupported annotation.'),
      error('First error.', range(4, 7)),
      warning('Unsupported appinfo.'),
      error('Second error.', range(8, 2)),
    ]);

    expect(result.message).toBe(
      'Unsupported annotation. Near line 1, column 1.',
    );
    expect(result.additionalProblemCount).toBe(3);
    expect(result.additionalProblemsText).toBe('3 more problems');
  });

  it('does not duplicate an existing line and column', () => {
    const message = 'Broken near line 4, column 7.';
    const result = formatSchemaImportFailure('xsd', 'broken.xsd', [
      error(message, range(4, 7)),
    ]);

    expect(result.message).toBe(message);
    expect(result.message.match(/line 4/gi)).toHaveLength(1);
  });

  it('uses plural grammar and never exposes offsets', () => {
    const diagnostic = error('Problem.', range(3, 9));
    const result = formatSchemaImportFailure('dtd', 'broken.dtd', [
      diagnostic,
      diagnostic,
      diagnostic,
    ]);

    expect(result.additionalProblemsText).toBe('2 more problems');
    expect(JSON.stringify(result)).not.toContain('offset');
  });

  it('adds safe ZIP entry and source context to the first error', () => {
    const result = formatSchemaImportFailure('zip', 'schemas.zip', [
      {
        stage: 'package',
        code: 'source-import-failed',
        severity: 'error',
        message: 'A schema member could not be imported.',
        entryPath: 'schemas/broken.xsd',
        range: range(7, 11),
      },
    ]);

    expect(result).toEqual({
      heading: 'Could not open schemas.zip',
      message:
        'A schema member could not be imported. Entry: schemas/broken.xsd. Near line 7, column 11.',
      additionalProblemCount: 0,
    });
  });

  it('does not reveal local paths, unsafe entries, source text, or exception details', () => {
    const localPath = formatSchemaImportFailure('zip', 'schemas.zip', [
      {
        stage: 'archive',
        code: 'invalid-archive',
        severity: 'error',
        message: 'C:\\Users\\Administrator\\private.zip failed with SECRET_XML',
        entryPath: '../private/schema.xsd',
      },
    ]);

    expect(localPath.message).toBe(
      'The selected ZIP schema package could not be imported.',
    );
    expect(JSON.stringify(localPath)).not.toMatch(
      /Administrator|private\.zip|SECRET_XML|\.\.\/private/,
    );
  });

  it('retains warning and information diagnostics in the ZIP summary count', () => {
    const result = formatSchemaImportFailure('zip', 'schemas.zip', [
      {
        stage: 'package',
        code: 'unresolved-xsd-reference',
        severity: 'warning',
        message: 'Warning.',
      },
      {
        stage: 'archive',
        code: 'invalid-archive',
        severity: 'error',
        message: 'Invalid archive.',
      },
      {
        stage: 'package',
        code: 'invalid-utf8',
        severity: 'error',
        message: 'Invalid member.',
      },
    ]);

    expect(result.message).toBe('Warning.');
    expect(result.additionalProblemCount).toBe(2);
    expect(result.additionalProblemsText).toBe('2 more problems');
  });
});
