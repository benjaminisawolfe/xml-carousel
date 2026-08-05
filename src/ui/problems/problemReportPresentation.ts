import type {
  SchemaDiagnostic,
  SchemaDiagnosticCategory,
  SchemaDiagnosticReport,
  SchemaDiagnosticSeverity,
  SchemaDiagnosticSource,
} from '../../app/import/schemaDiagnosticReport';

export const PROBLEM_REPORT_DIALOG_ID = 'problem-report-dialog';

export interface ProblemReportDiagnosticGroup {
  readonly id: string;
  readonly fileName?: string;
  readonly label: string;
  readonly diagnostics: readonly SchemaDiagnostic[];
}

export function formatProblemCount(count: number): string {
  return `${count} ${count === 1 ? 'problem' : 'problems'}`;
}

export function presentDiagnosticSeverity(
  severity: SchemaDiagnosticSeverity,
): string {
  if (severity === 'warning') return 'Warning';
  if (severity === 'info') return 'Information';
  return 'Error';
}

export function presentDiagnosticSource(
  source: SchemaDiagnosticSource,
): string {
  const labels: Record<SchemaDiagnosticSource, string> = {
    xml: 'XML',
    dtd: 'DTD',
    'dtd-lint': 'DTD lint',
    xsd: 'XSD',
    zip: 'ZIP package',
    project: 'Project import',
    visualization: 'Visualization adapter',
  };
  return labels[source];
}

export function presentDiagnosticCategory(
  category: SchemaDiagnosticCategory,
): string {
  const labels: Record<SchemaDiagnosticCategory, string> = {
    'standards-invalid': 'Standards validation error',
    'blocked-dependency': 'Blocked or missing dependency',
    'unsupported-standard': 'Unsupported standards boundary',
    security: 'Security policy violation',
    'engine-internal': 'Standards engine internal error',
    'resource-limit': 'Resource limit',
    'visualization-internal':
      'Internal visualization failure after standards acceptance',
    'archive-package': 'Archive or package failure',
    'dtd-lint': 'DTD advisory',
    visualization: 'Visualization limitation',
  };
  return labels[category];
}

function formatNaturalList(items: readonly string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

export function formatSeveritySummary(report: SchemaDiagnosticReport): string {
  const counts = { error: 0, warning: 0, info: 0 };
  for (const diagnostic of report.diagnostics) counts[diagnostic.severity] += 1;
  const parts = [
    counts.error > 0
      ? `${counts.error} ${counts.error === 1 ? 'error' : 'errors'}`
      : undefined,
    counts.warning > 0
      ? `${counts.warning} ${counts.warning === 1 ? 'warning' : 'warnings'}`
      : undefined,
    counts.info > 0
      ? `${counts.info} information ${counts.info === 1 ? 'message' : 'messages'}`
      : undefined,
  ].filter((part): part is string => part !== undefined);
  return `${formatProblemCount(report.totalCount)}: ${formatNaturalList(parts)}.`;
}

export function formatFailureClassifications(
  report: SchemaDiagnosticReport,
): string | undefined {
  const labels: string[] = [];
  for (const diagnostic of report.diagnostics) {
    if (!diagnostic.category) continue;
    const label = presentDiagnosticCategory(diagnostic.category);
    if (!labels.includes(label)) labels.push(label);
  }
  return labels.length === 0 ? undefined : formatNaturalList(labels);
}

export function formatFailedImportSummary(
  report: SchemaDiagnosticReport,
): string {
  return report.format === 'zip'
    ? 'The attempted schema package could not be opened.'
    : 'The attempted schema could not be opened.';
}

export function groupProblemReportDiagnostics(
  report: SchemaDiagnosticReport,
): readonly ProblemReportDiagnosticGroup[] {
  const groups = new Map<string, SchemaDiagnostic[]>();
  const fileNames = new Map<string, string | undefined>();
  for (const diagnostic of report.diagnostics) {
    const key = diagnostic.fileName
      ? `file:${diagnostic.fileName}`
      : 'project-or-unknown';
    const group = groups.get(key);
    if (group) group.push(diagnostic);
    else {
      groups.set(key, [diagnostic]);
      fileNames.set(key, diagnostic.fileName);
    }
  }
  return [...groups].map(([key, diagnostics], index) => {
    const fileName = fileNames.get(key);
    return {
      id: `group-${index + 1}`,
      ...(fileName ? { fileName } : {}),
      label: fileName
        ? `${fileName} — ${formatProblemCount(diagnostics.length)}`
        : 'Project-level or unknown-source problems',
      diagnostics,
    };
  });
}

export function shouldShowGroupHeadings(
  report: SchemaDiagnosticReport,
  groups: readonly ProblemReportDiagnosticGroup[],
): boolean {
  return (
    groups.length > 1 ||
    groups.some(
      (group) =>
        !group.fileName ||
        report.format === 'zip' ||
        group.fileName !== report.attemptedFileName,
    )
  );
}
