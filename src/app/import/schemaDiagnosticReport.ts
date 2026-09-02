export type SchemaDiagnosticSeverity = 'error' | 'warning' | 'info';

import type { StandardsDiagnosticCategory } from '../../standards/xerces';

export type SchemaDiagnosticSource =
  | 'xml'
  | 'dtd'
  | 'dtd-lint'
  | 'xsd'
  | 'rng'
  | 'zip'
  | 'project'
  | 'visualization';

export type SchemaDiagnosticCategory =
  | StandardsDiagnosticCategory
  | 'archive-package'
  | 'dtd-lint'
  | 'visualization';

export const MAX_RETAINED_SCHEMA_DIAGNOSTICS = 500;

export type SchemaDiagnosticImportFormat = 'dtd' | 'xsd' | 'rng' | 'zip';

export interface SchemaDiagnostic {
  readonly id: string;
  readonly severity: SchemaDiagnosticSeverity;
  readonly message: string;
  readonly fileName?: string;
  readonly line?: number;
  readonly column?: number;
  readonly code?: string;
  readonly source?: SchemaDiagnosticSource;
  readonly relatedNodeId?: string;
  readonly category?: SchemaDiagnosticCategory;
}

export interface SchemaDiagnosticReport {
  readonly attemptId: string;
  readonly format: SchemaDiagnosticImportFormat;
  readonly attemptedFileName: string;
  readonly diagnostics: readonly SchemaDiagnostic[];
  readonly totalCount: number;
}

interface SourcePositionLike {
  readonly line?: unknown;
  readonly column?: unknown;
}

interface SourceRangeLike {
  readonly start?: SourcePositionLike;
}

export interface SchemaDiagnosticInput {
  readonly severity?: unknown;
  readonly message?: unknown;
  readonly code?: unknown;
  readonly stage?: unknown;
  readonly sourceId?: unknown;
  readonly sourceFileId?: unknown;
  readonly entryPath?: unknown;
  readonly fileName?: unknown;
  readonly line?: unknown;
  readonly column?: unknown;
  readonly source?: unknown;
  readonly category?: unknown;
  readonly nodeId?: unknown;
  readonly range?: SourceRangeLike;
}

export interface SchemaDiagnosticNormalizationContext {
  readonly attemptId: string;
  readonly format: SchemaDiagnosticImportFormat;
  readonly attemptedFileName: string;
}

const packageSourcePrefix = 'schema-package-source:';

function optionalNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  return Number.isInteger(value) && (value as number) > 0
    ? (value as number)
    : undefined;
}

function decodePackageSourceFileName(sourceId: string): string | undefined {
  if (!sourceId.startsWith(packageSourcePrefix)) return undefined;
  try {
    const decoded = decodeURIComponent(
      sourceId.slice(packageSourcePrefix.length),
    );
    return decoded.length > 0 ? decoded : undefined;
  } catch {
    return undefined;
  }
}

function diagnosticFileName(
  diagnostic: SchemaDiagnosticInput,
  context: SchemaDiagnosticNormalizationContext,
): string | undefined {
  const fileName = optionalNonEmptyString(diagnostic.fileName);
  if (fileName) return fileName;
  const entryPath = optionalNonEmptyString(diagnostic.entryPath);
  if (entryPath) return entryPath;

  const sourceId =
    optionalNonEmptyString(diagnostic.sourceFileId) ??
    optionalNonEmptyString(diagnostic.sourceId);
  if (!sourceId) return undefined;

  const packageFileName = decodePackageSourceFileName(sourceId);
  if (packageFileName) return packageFileName;
  return context.format === 'zip' ? undefined : context.attemptedFileName;
}

function diagnosticSource(
  diagnostic: SchemaDiagnosticInput,
  context: SchemaDiagnosticNormalizationContext,
  fileName: string | undefined,
): SchemaDiagnosticSource | undefined {
  if (
    diagnostic.source === 'xml' ||
    diagnostic.source === 'dtd' ||
    diagnostic.source === 'dtd-lint' ||
    diagnostic.source === 'xsd' ||
    diagnostic.source === 'rng' ||
    diagnostic.source === 'zip' ||
    diagnostic.source === 'project' ||
    diagnostic.source === 'visualization'
  ) {
    return diagnostic.source;
  }
  const stage = optionalNonEmptyString(diagnostic.stage);
  if (stage === 'xml') return 'xml';
  if (stage === 'archive' || stage === 'package') return 'zip';
  if (stage === 'file' || stage === 'worker') return 'project';
  if (fileName?.toLocaleLowerCase().endsWith('.dtd')) return 'dtd';
  if (fileName?.toLocaleLowerCase().endsWith('.xsd')) return 'xsd';
  if (fileName?.toLocaleLowerCase().endsWith('.rng')) return 'rng';
  if (!stage) return undefined;
  if (context.format === 'dtd') return 'dtd';
  if (context.format === 'xsd') return 'xsd';
  if (context.format === 'rng') return 'rng';
  if (context.format === 'zip') return 'zip';
  return undefined;
}

function diagnosticSeverity(value: unknown): SchemaDiagnosticSeverity {
  return value === 'warning' || value === 'info' ? value : 'error';
}

function diagnosticCategory(
  value: unknown,
  stage: unknown,
  code: string | undefined,
): SchemaDiagnosticCategory | undefined {
  return value === 'standards-invalid' ||
    value === 'blocked-dependency' ||
    value === 'unsupported-standard' ||
    value === 'security' ||
    value === 'engine-internal' ||
    value === 'resource-limit' ||
    value === 'visualization-internal' ||
    value === 'archive-package' ||
    value === 'dtd-lint' ||
    value === 'visualization'
    ? value
    : stage === 'archive'
      ? code === 'unsafe-entry-path' || code === 'duplicate-schema-path'
        ? 'security'
        : code === 'archive-too-large' ||
            code === 'too-many-file-entries' ||
            code === 'too-many-schema-files' ||
            code === 'entry-path-too-long' ||
            code === 'entry-path-too-deep'
          ? 'resource-limit'
          : 'archive-package'
      : stage === 'package'
        ? code === 'schema-entry-too-large' ||
          code === 'schema-package-too-large'
          ? 'resource-limit'
          : 'archive-package'
        : undefined;
}

export function normalizeSchemaDiagnostics(
  diagnostics: readonly SchemaDiagnosticInput[],
  context: SchemaDiagnosticNormalizationContext,
): readonly SchemaDiagnostic[] {
  return diagnostics.map((diagnostic, index) => {
    const fileName = diagnosticFileName(diagnostic, context);
    const line =
      positiveInteger(diagnostic.line) ??
      positiveInteger(diagnostic.range?.start?.line);
    const column =
      positiveInteger(diagnostic.column) ??
      positiveInteger(diagnostic.range?.start?.column);
    const code = optionalNonEmptyString(diagnostic.code);
    const relatedNodeId = optionalNonEmptyString(diagnostic.nodeId);
    const source = diagnosticSource(diagnostic, context, fileName);
    const category = diagnosticCategory(
      diagnostic.category,
      diagnostic.stage,
      code,
    );

    return Object.freeze({
      id: `${context.attemptId}:diagnostic:${index + 1}`,
      severity: diagnosticSeverity(diagnostic.severity),
      message:
        typeof diagnostic.message === 'string'
          ? diagnostic.message
          : 'The selected schema could not be imported.',
      ...(fileName === undefined ? {} : { fileName }),
      ...(line === undefined ? {} : { line }),
      ...(column === undefined ? {} : { column }),
      ...(code === undefined ? {} : { code }),
      ...(source === undefined ? {} : { source }),
      ...(relatedNodeId === undefined ? {} : { relatedNodeId }),
      ...(category === undefined ? {} : { category }),
    });
  });
}

export function createSchemaDiagnosticReport(
  diagnostics: readonly SchemaDiagnostic[],
  context: SchemaDiagnosticNormalizationContext,
): SchemaDiagnosticReport {
  const retainedDiagnostics = Object.freeze(
    diagnostics.length <= MAX_RETAINED_SCHEMA_DIAGNOSTICS
      ? [...diagnostics]
      : [
          ...diagnostics.slice(0, MAX_RETAINED_SCHEMA_DIAGNOSTICS - 1),
          Object.freeze({
            id: `${context.attemptId}:diagnostic:retention-limit`,
            severity: 'error' as const,
            message: `More than ${MAX_RETAINED_SCHEMA_DIAGNOSTICS} problems were found. Detail retention stopped at the safety limit.`,
            code: 'xml-carousel:diagnostic-retention-limit',
            source: 'project' as const,
            category: 'resource-limit' as const,
          }),
        ],
  );
  return Object.freeze({
    attemptId: context.attemptId,
    format: context.format,
    attemptedFileName: context.attemptedFileName,
    diagnostics: retainedDiagnostics,
    totalCount: diagnostics.length,
  });
}
