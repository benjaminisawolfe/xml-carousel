import type { DtdImportDiagnostic } from '../../schema/dtd';
import type { XsdImportDiagnostic } from '../../schema/xsd';
import type { SchemaPackageImportDiagnostic } from './schemaPackage';
import type { SchemaWorkerFailureDiagnostic } from '../../workers/schemaImportWorkerProtocol';
import type { StandardsBoundaryDiagnostic } from '../../standards/types';
import {
  createSchemaDiagnosticReport,
  normalizeSchemaDiagnostics,
  type SchemaDiagnostic,
  type SchemaDiagnosticReport,
} from './schemaDiagnosticReport';

export type SchemaFileFormat = 'dtd' | 'xsd' | 'rng' | 'zip';

export type SchemaFileDiagnostic =
  | DtdImportDiagnostic
  | XsdImportDiagnostic
  | SchemaPackageImportDiagnostic
  | SchemaWorkerFailureDiagnostic
  | StandardsBoundaryDiagnostic
  | {
      readonly stage: 'file';
      readonly format: SchemaFileFormat;
      readonly code:
        | 'unsupported-extension'
        | 'read-failure'
        | 'unexpected-import-failure'
        | 'activation-failure';
      readonly severity: 'error';
      readonly message: string;
    };

export interface SchemaImportFailurePresentation {
  readonly heading: string;
  readonly message: string;
  readonly additionalProblemCount: number;
  readonly additionalProblemsText?: string;
}

function isSafeEntryPath(path: string): boolean {
  const hasControlCharacter = Array.from(path).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
  return (
    path.length > 0 &&
    !path.startsWith('/') &&
    !path.includes('\\') &&
    !path.split('/').includes('..') &&
    !/^[a-z]:/iu.test(path) &&
    !hasControlCharacter
  );
}

function messageWithContext(
  diagnostic: SchemaDiagnostic,
  fallback: string,
  includeFileName: boolean,
): string {
  let message = /(?:[a-z]:\\|\\\\)/iu.test(diagnostic.message)
    ? fallback
    : diagnostic.message;
  if (
    includeFileName &&
    diagnostic.fileName &&
    isSafeEntryPath(diagnostic.fileName) &&
    !message.includes(diagnostic.fileName)
  ) {
    message = `${message} Entry: ${diagnostic.fileName}.`;
  }

  if (diagnostic.line === undefined || diagnostic.column === undefined) {
    return message;
  }

  const hasLocation =
    new RegExp(`\\bline\\s+${diagnostic.line}\\b`, 'i').test(message) &&
    new RegExp(`\\bcolumn\\s+${diagnostic.column}\\b`, 'i').test(message);

  return hasLocation
    ? message
    : `${message} Near line ${diagnostic.line}, column ${diagnostic.column}.`;
}

function fallbackMessage(format: SchemaFileFormat): string {
  if (format === 'dtd') return 'The selected DTD could not be imported.';
  if (format === 'xsd') return 'The selected XSD could not be imported.';
  if (format === 'rng')
    return 'The selected RELAX NG schema could not be imported.';
  return 'The selected ZIP schema package could not be imported.';
}

export function formatSchemaImportFailure(
  format: SchemaFileFormat,
  filename: string,
  diagnostics: readonly SchemaFileDiagnostic[],
): SchemaImportFailurePresentation {
  const context = {
    attemptId: 'legacy-schema-import',
    format,
    attemptedFileName: filename,
  };
  return formatSchemaDiagnosticReport(
    createSchemaDiagnosticReport(
      normalizeSchemaDiagnostics(diagnostics, context),
      context,
    ),
  );
}

export function formatSchemaDiagnosticReport(
  report: SchemaDiagnosticReport,
): SchemaImportFailurePresentation {
  const { format, attemptedFileName, diagnostics } = report;
  const visibleFilename = attemptedFileName.trim() || 'selected file';
  const firstDiagnostic = diagnostics[0];
  const additionalProblemCount = Math.max(0, diagnostics.length - 1);

  const fallback = fallbackMessage(format);
  return {
    heading: `Could not open ${visibleFilename}`,
    message: firstDiagnostic
      ? messageWithContext(firstDiagnostic, fallback, format === 'zip')
      : fallback,
    additionalProblemCount,
    ...(additionalProblemCount === 0
      ? {}
      : {
          additionalProblemsText: `${additionalProblemCount} more ${
            additionalProblemCount === 1 ? 'problem' : 'problems'
          }`,
        }),
  };
}
