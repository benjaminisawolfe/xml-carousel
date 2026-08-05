import { describe, expect, it } from 'vitest';
import type {
  SchemaDiagnostic,
  SchemaDiagnosticReport,
} from '../../app/import/schemaDiagnosticReport';
import {
  formatFailureClassifications,
  formatSeveritySummary,
  groupProblemReportDiagnostics,
  presentDiagnosticCategory,
  shouldShowGroupHeadings,
} from './problemReportPresentation';

function diagnostic(
  id: string,
  overrides: Partial<SchemaDiagnostic> = {},
): SchemaDiagnostic {
  return { id, severity: 'error', message: `Message ${id}`, ...overrides };
}

function report(
  diagnostics: readonly SchemaDiagnostic[],
  format: SchemaDiagnosticReport['format'] = 'xsd',
): SchemaDiagnosticReport {
  return {
    attemptId: 'attempt',
    format,
    attemptedFileName: format === 'zip' ? 'schemas.zip' : 'broken.xsd',
    diagnostics,
    totalCount: diagnostics.length,
  };
}

describe('problem report presentation', () => {
  it('formats natural severity totals', () => {
    expect(
      formatSeveritySummary(
        report([
          diagnostic('one'),
          diagnostic('two', { severity: 'warning' }),
          diagnostic('three', { severity: 'info' }),
        ]),
      ),
    ).toBe('3 problems: 1 error, 1 warning, and 1 information message.');
  });

  it('maps every normalized classification without conflating failures', () => {
    expect(presentDiagnosticCategory('standards-invalid')).toBe(
      'Standards validation error',
    );
    expect(presentDiagnosticCategory('blocked-dependency')).toBe(
      'Blocked or missing dependency',
    );
    expect(presentDiagnosticCategory('unsupported-standard')).toBe(
      'Unsupported standards boundary',
    );
    expect(presentDiagnosticCategory('engine-internal')).toBe(
      'Standards engine internal error',
    );
    expect(presentDiagnosticCategory('resource-limit')).toBe('Resource limit');
    expect(presentDiagnosticCategory('security')).toBe(
      'Security policy violation',
    );
    expect(presentDiagnosticCategory('archive-package')).toBe(
      'Archive or package failure',
    );
    expect(presentDiagnosticCategory('visualization-internal')).toBe(
      'Internal visualization failure after standards acceptance',
    );
    expect(
      formatFailureClassifications(
        report([
          diagnostic('security', { category: 'blocked-dependency' }),
          diagnostic('internal', { category: 'visualization-internal' }),
        ]),
      ),
    ).toBe(
      'Blocked or missing dependency and Internal visualization failure after standards acceptance',
    );
  });

  it('groups by first source appearance and preserves order within groups', () => {
    const retained = report(
      [
        diagnostic('a1', { fileName: 'a/shared.xsd' }),
        diagnostic('b1', { fileName: 'b/shared.xsd' }),
        diagnostic('a2', { fileName: 'a/shared.xsd' }),
        diagnostic('unknown'),
      ],
      'zip',
    );
    const groups = groupProblemReportDiagnostics(retained);
    expect(groups.map((group) => group.fileName)).toEqual([
      'a/shared.xsd',
      'b/shared.xsd',
      undefined,
    ]);
    expect(
      groups.map((group) => group.diagnostics.map(({ id }) => id)),
    ).toEqual([['a1', 'a2'], ['b1'], ['unknown']]);
    expect(groups[2]?.label).toBe('Project-level or unknown-source problems');
    expect(shouldShowGroupHeadings(retained, groups)).toBe(true);
  });
});
