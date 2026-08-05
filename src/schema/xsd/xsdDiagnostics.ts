import type { SchemaSourceRange } from '../model/SchemaSourceMarkup';

export const xsdDiagnosticCodes = [
  'empty-document',
  'unexpected-token',
  'unexpected-end-of-input',
  'malformed-name',
  'malformed-qname',
  'missing-equals',
  'unquoted-attribute-value',
  'unterminated-attribute-value',
  'invalid-entity-reference',
  'unterminated-entity-reference',
  'unknown-entity-reference',
  'unterminated-comment',
  'unterminated-cdata',
  'unterminated-processing-instruction',
  'unterminated-tag',
  'unsupported-declaration',
  'doctype-not-allowed',
  'mismatched-end-tag',
  'missing-end-tag',
  'unexpected-end-tag',
  'multiple-roots',
  'text-outside-root',
  'duplicate-attribute',
  'undeclared-prefix',
  'invalid-namespace-declaration',
  'reserved-namespace-binding',
  'misplaced-xml-declaration',
  'multiple-xml-declarations',
  'non-schema-root',
  'wrong-schema-namespace',
  'missing-declaration-name',
  'invalid-declaration-name',
  'forbidden-global-ref',
  'forbidden-global-occurrence',
  'missing-local-name-or-ref',
  'conflicting-local-name-ref',
  'invalid-qname-attribute',
  'type-ref-conflict',
  'ref-inline-type-conflict',
  'type-inline-type-conflict',
  'multiple-inline-types',
  'invalid-occurrence',
  'invalid-form-default',
  'multiple-direct-compositors',
  'multiple-complex-type-content-models',
  'multiple-complex-content',
  'missing-complex-content-derivation',
  'multiple-complex-content-derivations',
  'missing-complex-derivation-base',
  'invalid-complex-content-placement',
  'invalid-complex-derivation-placement',
  'multiple-complex-derivation-compositors',
  'invalid-complex-derivation-element-placement',
  'invalid-complex-derivation-attribute-placement',
  'missing-global-attribute-name',
  'forbidden-global-attribute-ref',
  'forbidden-global-attribute-use',
  'forbidden-global-attribute-form',
  'missing-local-attribute-name-or-ref',
  'conflicting-local-attribute-name-ref',
  'invalid-attribute-use',
  'invalid-attribute-form',
  'attribute-type-inline-type-conflict',
  'attribute-ref-type-conflict',
  'attribute-ref-inline-type-conflict',
  'attribute-ref-form-conflict',
  'attribute-default-fixed-conflict',
  'invalid-attribute-placement',
  'multiple-simple-type-varieties',
  'multiple-simple-type-restrictions',
  'missing-restriction-base',
  'missing-enumeration-value',
  'invalid-restriction-placement',
  'multiple-annotations',
  'invalid-annotation-placement',
  'invalid-documentation-placement',
  'invalid-appinfo-placement',
  'unsupported-xsd-component',
  'unsupported-structure',
] as const;

export type XsdDiagnosticCode = (typeof xsdDiagnosticCodes)[number];
export type XsdDiagnosticStage = 'xml' | 'xsd';
export type XsdDiagnosticSeverity = 'error' | 'warning';

export interface XsdDiagnostic {
  readonly stage: XsdDiagnosticStage;
  readonly code: XsdDiagnosticCode;
  readonly severity: XsdDiagnosticSeverity;
  readonly message: string;
  readonly range: SchemaSourceRange;
  readonly sourceId?: string;
}

export function createXsdDiagnostic(
  stage: XsdDiagnosticStage,
  code: XsdDiagnosticCode,
  severity: XsdDiagnosticSeverity,
  message: string,
  range: SchemaSourceRange,
): XsdDiagnostic {
  return {
    stage,
    code,
    severity,
    message: `${message} near line ${range.start.line}, column ${range.start.column}.`,
    range,
    ...(range.sourceId === undefined ? {} : { sourceId: range.sourceId }),
  };
}

export function sortXsdDiagnostics(
  diagnostics: readonly XsdDiagnostic[],
): readonly XsdDiagnostic[] {
  return [...diagnostics].sort(
    (left, right) =>
      left.range.start.offset - right.range.start.offset ||
      left.range.end.offset - right.range.end.offset ||
      left.stage.localeCompare(right.stage) ||
      left.code.localeCompare(right.code),
  );
}
