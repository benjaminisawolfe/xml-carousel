import type { DtdSourceRange } from './dtdAst';

export const dtdParseDiagnosticCodes = [
  'unexpected-token',
  'unexpected-end-of-input',
  'missing-element-name',
  'invalid-element-name',
  'missing-content-model',
  'unbalanced-parenthesis',
  'mixed-compositor',
  'empty-group',
  'trailing-separator',
  'invalid-occurrence',
  'invalid-pcdata-placement',
  'invalid-mixed-content',
  'unterminated-comment',
  'unterminated-declaration',
  'unsupported-declaration',
  'unsupported-syntax',
  'missing-attlist-element-name',
  'missing-attribute-name',
  'missing-attribute-type',
  'invalid-attribute-type',
  'empty-attribute-enumeration',
  'invalid-attribute-enumeration',
  'invalid-notation-type',
  'missing-attribute-default',
  'invalid-attribute-default',
  'missing-fixed-value',
  'unterminated-attribute-value',
  'incomplete-attribute-definition',
] as const;

export type DtdParseDiagnosticCode = (typeof dtdParseDiagnosticCodes)[number];

export interface DtdParseDiagnostic {
  readonly code: DtdParseDiagnosticCode;
  readonly severity: 'error';
  readonly message: string;
  readonly range: DtdSourceRange;
  readonly sourceId?: string;
}

export function createDtdParseDiagnostic(
  code: DtdParseDiagnosticCode,
  message: string,
  range: DtdSourceRange,
): DtdParseDiagnostic {
  return {
    code,
    severity: 'error',
    message: `${message} near line ${range.start.line}, column ${range.start.column}.`,
    range,
    ...(range.sourceId === undefined ? {} : { sourceId: range.sourceId }),
  };
}
