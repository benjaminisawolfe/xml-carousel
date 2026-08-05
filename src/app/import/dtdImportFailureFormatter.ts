import type { DtdImportDiagnostic } from '../../schema/dtd';
import {
  formatSchemaImportFailure,
  type SchemaImportFailurePresentation,
} from './schemaImportFailureFormatter';

export type DtdFileDiagnostic =
  | DtdImportDiagnostic
  | {
      readonly stage: 'file';
      readonly code:
        | 'unsupported-extension'
        | 'read-failure'
        | 'unexpected-import-failure'
        | 'activation-failure';
      readonly severity: 'error';
      readonly message: string;
    };

export interface DtdImportFailurePresentation {
  readonly heading: SchemaImportFailurePresentation['heading'];
  readonly message: SchemaImportFailurePresentation['message'];
  readonly additionalProblemCount: SchemaImportFailurePresentation['additionalProblemCount'];
  readonly additionalProblemsText?: SchemaImportFailurePresentation['additionalProblemsText'];
}

export function formatDtdImportFailure(
  filename: string,
  diagnostics: readonly DtdFileDiagnostic[],
): DtdImportFailurePresentation {
  return formatSchemaImportFailure(
    'dtd',
    filename,
    diagnostics.map((diagnostic) =>
      diagnostic.stage === 'file'
        ? { ...diagnostic, format: 'dtd' as const }
        : diagnostic,
    ),
  );
}
