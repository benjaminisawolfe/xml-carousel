import type { DtdSourceRange } from './dtdAst';

export const dtdBuildDiagnosticCodes = [
  'invalid-build-option',
  'duplicate-element-declaration',
  'unresolved-element-reference',
  'invalid-source-range',
  'id-collision',
  'project-validation-failed',
  'multiple-id-attributes',
  'invalid-id-attribute-default',
  'attribute-default-not-in-allowed-values',
] as const;

export type DtdBuildDiagnosticCode = (typeof dtdBuildDiagnosticCodes)[number];

export interface DtdBuildDiagnostic {
  readonly code: DtdBuildDiagnosticCode;
  readonly severity: 'error' | 'warning';
  readonly message: string;
  readonly elementName?: string;
  readonly attributeName?: string;
  readonly referenceName?: string;
  readonly sourceId?: string;
  readonly range?: DtdSourceRange;
  readonly relatedRange?: DtdSourceRange;
}
