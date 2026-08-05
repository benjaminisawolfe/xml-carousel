import { describe, expect, it } from 'vitest';
import type { DtdSourceRange } from '../../schema/dtd';
import {
  formatDtdImportFailure,
  type DtdFileDiagnostic,
} from './dtdImportFailureFormatter';

function range(line: number, column: number): DtdSourceRange {
  return {
    start: { offset: 0, line, column },
    end: { offset: 1, line, column: column + 1 },
  };
}

function parseDiagnostic(
  message: string,
  sourceRange: DtdSourceRange,
): DtdFileDiagnostic {
  return {
    stage: 'parse',
    code: 'unexpected-token',
    severity: 'error',
    message,
    range: sourceRange,
  };
}

describe('DTD import failure formatter', () => {
  it('includes the filename in a concise heading', () => {
    const result = formatDtdImportFailure('broken.dtd', [
      parseDiagnostic('Expected an element name.', range(4, 11)),
    ]);

    expect(result.heading).toBe('Could not open broken.dtd');
  });

  it('adds one-based line and column for a diagnostic range', () => {
    const result = formatDtdImportFailure('broken.dtd', [
      parseDiagnostic('Expected an element name.', range(4, 11)),
    ]);

    expect(result.message).toBe(
      'Expected an element name. Near line 4, column 11.',
    );
  });

  it('does not duplicate a parser message location already present', () => {
    const message = 'Expected a name near line 4, column 11.';
    const result = formatDtdImportFailure('broken.dtd', [
      parseDiagnostic(message, range(4, 11)),
    ]);

    expect(result.message).toBe(message);
    expect(result.message.match(/line 4/g)).toHaveLength(1);
  });

  it('adds a build diagnostic location when available', () => {
    const result = formatDtdImportFailure('unresolved.dtd', [
      {
        stage: 'build',
        code: 'unresolved-element-reference',
        severity: 'error',
        message: 'Element "missing" has no declaration.',
        range: range(2, 8),
      },
    ]);

    expect(result.message).toContain('Near line 2, column 8.');
  });

  it('preserves a diagnostic without a range exactly', () => {
    const message = 'The selected file could not be read.';
    const result = formatDtdImportFailure('library.dtd', [
      {
        stage: 'file',
        code: 'read-failure',
        severity: 'error',
        message,
      },
    ]);

    expect(result.message).toBe(message);
  });

  it('counts one additional diagnostic with singular wording', () => {
    const first = parseDiagnostic('First.', range(1, 1));
    const second = parseDiagnostic('Second.', range(2, 1));
    const result = formatDtdImportFailure('broken.dtd', [first, second]);

    expect(result.additionalProblemCount).toBe(1);
    expect(result.additionalProblemsText).toBe('1 more problem');
  });

  it('counts multiple additional diagnostics with plural wording', () => {
    const diagnostic = parseDiagnostic('Problem.', range(1, 1));
    const result = formatDtdImportFailure('broken.dtd', [
      diagnostic,
      diagnostic,
      diagnostic,
      diagnostic,
    ]);

    expect(result.additionalProblemCount).toBe(3);
    expect(result.additionalProblemsText).toBe('3 more problems');
  });

  it('omits an additional-problems label for a single diagnostic', () => {
    const result = formatDtdImportFailure('broken.dtd', [
      parseDiagnostic('Problem.', range(1, 1)),
    ]);

    expect(result.additionalProblemCount).toBe(0);
    expect(result).not.toHaveProperty('additionalProblemsText');
  });

  it('uses a safe fallback for a whitespace-only filename', () => {
    const result = formatDtdImportFailure('   ', []);

    expect(result.heading).toBe('Could not open selected file');
    expect(result.message).toBe('The selected DTD could not be imported.');
  });

  it('is deterministic and preserves source messages', () => {
    const diagnostics = [
      parseDiagnostic('Original parser message.', range(3, 7)),
    ];

    expect(formatDtdImportFailure('x.dtd', diagnostics)).toEqual(
      formatDtdImportFailure('x.dtd', diagnostics),
    );
    expect(formatDtdImportFailure('x.dtd', diagnostics).message).toContain(
      'Original parser message.',
    );
  });
});
