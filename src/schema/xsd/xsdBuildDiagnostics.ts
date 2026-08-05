import type { SchemaNodeId, SchemaSourceRange } from '../model';

export const xsdBuildDiagnosticCodes = [
  'invalid-build-option',
  'invalid-source-range',
  'invalid-content-range',
  'raw-xml-range-mismatch',
  'source-id-mismatch',
  'missing-required-ast-value',
  'inconsistent-qname-namespace',
  'duplicate-global-element',
  'duplicate-global-attribute',
  'duplicate-attribute-use',
  'duplicate-type-definition',
  'id-collision',
  'edge-id-collision',
  'unresolved-type-reference',
  'unresolved-element-reference',
  'unresolved-attribute-reference',
  'invalid-attribute-type-target',
  'external-type-reference-deferred',
  'external-element-reference-deferred',
  'external-attribute-reference-deferred',
  'invalid-restriction-base-target',
  'unresolved-restriction-base',
  'external-restriction-base-deferred',
  'invalid-complex-type-base-target',
  'unresolved-complex-type-base',
  'external-complex-type-base-deferred',
  'unsupported-explicit-local-form',
  'project-validation-failed',
] as const;

export type XsdBuildDiagnosticCode = (typeof xsdBuildDiagnosticCodes)[number];

export interface XsdBuildDiagnostic {
  readonly stage: 'build';
  readonly code: XsdBuildDiagnosticCode;
  readonly severity: 'error' | 'warning';
  readonly message: string;
  readonly sourceId?: string;
  readonly range?: SchemaSourceRange;
  readonly relatedRange?: SchemaSourceRange;
  readonly nodeId?: SchemaNodeId;
  readonly reference?: string;
}
