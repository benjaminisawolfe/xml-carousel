import {
  dtdBuildDiagnosticCodes,
  type DtdBuildDiagnosticCode,
} from '../dtd/dtdBuildDiagnostics';
import {
  dtdParseDiagnosticCodes,
  type DtdParseDiagnosticCode,
} from '../dtd/dtdDiagnostics';
import {
  xsdBuildDiagnosticCodes,
  type XsdBuildDiagnosticCode,
} from '../xsd/xsdBuildDiagnostics';
import {
  xsdDiagnosticCodes,
  type XsdDiagnosticCode,
} from '../xsd/xsdDiagnostics';
import type { SchemaPackageDiagnosticCode } from '../../app/import/schemaPackage/schemaPackageTypes';
import type { SchemaArchiveDiagnosticCode } from '../../app/import/schemaArchive/schemaArchiveTypes';

export type PostXercesDiagnosticClassification =
  | 'visualization-warning'
  | 'internal-extraction-failure'
  | 'project-resolution-failure'
  | 'security-resource-failure'
  | 'obsolete-standards-gate';

const obsolete = 'obsolete-standards-gate' as const;
const internal = 'internal-extraction-failure' as const;
const visualization = 'visualization-warning' as const;
const resolution = 'project-resolution-failure' as const;

export const dtdParseDiagnosticPolicy = Object.freeze({
  'unexpected-token': obsolete,
  'unexpected-end-of-input': obsolete,
  'missing-element-name': obsolete,
  'invalid-element-name': obsolete,
  'missing-content-model': obsolete,
  'unbalanced-parenthesis': obsolete,
  'mixed-compositor': obsolete,
  'empty-group': obsolete,
  'trailing-separator': obsolete,
  'invalid-occurrence': obsolete,
  'invalid-pcdata-placement': obsolete,
  'invalid-mixed-content': obsolete,
  'unterminated-comment': obsolete,
  'unterminated-declaration': obsolete,
  'unsupported-declaration': visualization,
  'unsupported-syntax': visualization,
  'missing-attlist-element-name': obsolete,
  'missing-attribute-name': obsolete,
  'missing-attribute-type': obsolete,
  'invalid-attribute-type': obsolete,
  'empty-attribute-enumeration': obsolete,
  'invalid-attribute-enumeration': obsolete,
  'invalid-notation-type': obsolete,
  'missing-attribute-default': obsolete,
  'invalid-attribute-default': obsolete,
  'missing-fixed-value': obsolete,
  'unterminated-attribute-value': obsolete,
  'incomplete-attribute-definition': obsolete,
}) satisfies Readonly<
  Record<DtdParseDiagnosticCode, PostXercesDiagnosticClassification>
>;

export const dtdBuildDiagnosticPolicy = Object.freeze({
  'invalid-build-option': internal,
  'duplicate-element-declaration': obsolete,
  'unresolved-element-reference': visualization,
  'invalid-source-range': internal,
  'id-collision': internal,
  'project-validation-failed': internal,
  'multiple-id-attributes': obsolete,
  'invalid-id-attribute-default': obsolete,
  'attribute-default-not-in-allowed-values': obsolete,
}) satisfies Readonly<
  Record<DtdBuildDiagnosticCode, PostXercesDiagnosticClassification>
>;

export const xsdDiagnosticPolicy = Object.freeze({
  'empty-document': obsolete,
  'unexpected-token': obsolete,
  'unexpected-end-of-input': obsolete,
  'malformed-name': obsolete,
  'malformed-qname': obsolete,
  'missing-equals': obsolete,
  'unquoted-attribute-value': obsolete,
  'unterminated-attribute-value': obsolete,
  'invalid-entity-reference': obsolete,
  'unterminated-entity-reference': obsolete,
  'unknown-entity-reference': obsolete,
  'unterminated-comment': obsolete,
  'unterminated-cdata': obsolete,
  'unterminated-processing-instruction': obsolete,
  'unterminated-tag': obsolete,
  'unsupported-declaration': obsolete,
  'doctype-not-allowed': obsolete,
  'mismatched-end-tag': obsolete,
  'missing-end-tag': obsolete,
  'unexpected-end-tag': obsolete,
  'multiple-roots': obsolete,
  'text-outside-root': obsolete,
  'duplicate-attribute': obsolete,
  'undeclared-prefix': obsolete,
  'invalid-namespace-declaration': obsolete,
  'reserved-namespace-binding': obsolete,
  'misplaced-xml-declaration': obsolete,
  'multiple-xml-declarations': obsolete,
  'non-schema-root': obsolete,
  'wrong-schema-namespace': obsolete,
  'missing-declaration-name': obsolete,
  'invalid-declaration-name': obsolete,
  'forbidden-global-ref': obsolete,
  'forbidden-global-occurrence': obsolete,
  'missing-local-name-or-ref': obsolete,
  'conflicting-local-name-ref': obsolete,
  'invalid-qname-attribute': obsolete,
  'type-ref-conflict': obsolete,
  'ref-inline-type-conflict': obsolete,
  'type-inline-type-conflict': obsolete,
  'multiple-inline-types': obsolete,
  'invalid-occurrence': obsolete,
  'invalid-form-default': obsolete,
  'multiple-direct-compositors': obsolete,
  'multiple-complex-type-content-models': obsolete,
  'multiple-complex-content': obsolete,
  'missing-complex-content-derivation': obsolete,
  'multiple-complex-content-derivations': obsolete,
  'missing-complex-derivation-base': obsolete,
  'invalid-complex-content-placement': obsolete,
  'invalid-complex-derivation-placement': obsolete,
  'multiple-complex-derivation-compositors': obsolete,
  'invalid-complex-derivation-element-placement': obsolete,
  'invalid-complex-derivation-attribute-placement': obsolete,
  'missing-global-attribute-name': obsolete,
  'forbidden-global-attribute-ref': obsolete,
  'forbidden-global-attribute-use': obsolete,
  'forbidden-global-attribute-form': obsolete,
  'missing-local-attribute-name-or-ref': obsolete,
  'conflicting-local-attribute-name-ref': obsolete,
  'invalid-attribute-use': obsolete,
  'invalid-attribute-form': obsolete,
  'attribute-type-inline-type-conflict': obsolete,
  'attribute-ref-type-conflict': obsolete,
  'attribute-ref-inline-type-conflict': obsolete,
  'attribute-ref-form-conflict': obsolete,
  'attribute-default-fixed-conflict': obsolete,
  'invalid-attribute-placement': obsolete,
  'multiple-simple-type-varieties': obsolete,
  'multiple-simple-type-restrictions': obsolete,
  'missing-restriction-base': obsolete,
  'missing-enumeration-value': obsolete,
  'invalid-restriction-placement': obsolete,
  'multiple-annotations': visualization,
  'invalid-annotation-placement': visualization,
  'invalid-documentation-placement': obsolete,
  'invalid-appinfo-placement': obsolete,
  'unsupported-xsd-component': visualization,
  'unsupported-structure': internal,
}) satisfies Readonly<
  Record<XsdDiagnosticCode, PostXercesDiagnosticClassification>
>;

export const xsdBuildDiagnosticPolicy = Object.freeze({
  'invalid-build-option': internal,
  'invalid-source-range': internal,
  'invalid-content-range': internal,
  'raw-xml-range-mismatch': internal,
  'source-id-mismatch': internal,
  'missing-required-ast-value': internal,
  'inconsistent-qname-namespace': internal,
  'duplicate-global-element': obsolete,
  'duplicate-global-attribute': obsolete,
  'duplicate-attribute-use': obsolete,
  'duplicate-type-definition': obsolete,
  'id-collision': internal,
  'edge-id-collision': internal,
  'unresolved-type-reference': resolution,
  'unresolved-element-reference': resolution,
  'unresolved-attribute-reference': resolution,
  'invalid-attribute-type-target': resolution,
  'external-type-reference-deferred': resolution,
  'external-element-reference-deferred': resolution,
  'external-attribute-reference-deferred': resolution,
  'invalid-restriction-base-target': resolution,
  'unresolved-restriction-base': resolution,
  'external-restriction-base-deferred': resolution,
  'invalid-complex-type-base-target': resolution,
  'unresolved-complex-type-base': resolution,
  'external-complex-type-base-deferred': resolution,
  'unsupported-explicit-local-form': visualization,
  'project-validation-failed': internal,
}) satisfies Readonly<
  Record<XsdBuildDiagnosticCode, PostXercesDiagnosticClassification>
>;

export const dtdImportDiagnosticPolicy = Object.freeze({
  'no-importable-elements': internal,
}) satisfies Readonly<
  Record<'no-importable-elements', PostXercesDiagnosticClassification>
>;

export const xsdImportDiagnosticPolicy = Object.freeze({
  'no-importable-schema': internal,
  'invalid-initial-focus': internal,
}) satisfies Readonly<
  Record<
    'no-importable-schema' | 'invalid-initial-focus',
    PostXercesDiagnosticClassification
  >
>;

export const packageDiagnosticPolicy = Object.freeze({
  'archive-entry-missing': resolution,
  'archive-entry-read-failure': resolution,
  'schema-entry-too-large': 'security-resource-failure',
  'schema-package-too-large': 'security-resource-failure',
  'invalid-utf8': resolution,
  'unsupported-source-encoding': resolution,
  'source-import-failed': internal,
  'source-id-collision': internal,
  'node-id-collision': internal,
  'edge-id-collision': internal,
  'package-project-validation-failed': internal,
  'unresolved-xsd-reference': resolution,
  'ambiguous-xsd-reference': resolution,
  'invalid-xsd-reference-target': resolution,
  'missing-xsd-dependency': resolution,
  'blocked-xsd-dependency': 'security-resource-failure',
  'ambiguous-xsd-dependency': resolution,
  'missing-rng-dependency': resolution,
  'blocked-rng-dependency': 'security-resource-failure',
  'ambiguous-rng-dependency': resolution,
}) satisfies Readonly<
  Record<SchemaPackageDiagnosticCode, PostXercesDiagnosticClassification>
>;

export const archiveDiagnosticPolicy = Object.freeze({
  'unsupported-extension': resolution,
  'empty-archive-file': resolution,
  'archive-too-large': 'security-resource-failure',
  'invalid-archive': resolution,
  'too-many-file-entries': 'security-resource-failure',
  'unsafe-entry-path': 'security-resource-failure',
  'entry-path-too-long': 'security-resource-failure',
  'entry-path-too-deep': 'security-resource-failure',
  'duplicate-schema-path': 'security-resource-failure',
  'too-many-schema-files': 'security-resource-failure',
  'no-schema-files': resolution,
}) satisfies Readonly<
  Record<SchemaArchiveDiagnosticCode, PostXercesDiagnosticClassification>
>;

export const diagnosticPolicyCodeCounts = Object.freeze({
  dtdParse: dtdParseDiagnosticCodes.length,
  dtdBuild: dtdBuildDiagnosticCodes.length,
  dtdImport: Object.keys(dtdImportDiagnosticPolicy).length,
  xsdParse: xsdDiagnosticCodes.length,
  xsdBuild: xsdBuildDiagnosticCodes.length,
  xsdImport: Object.keys(xsdImportDiagnosticPolicy).length,
  package: Object.keys(packageDiagnosticPolicy).length,
  archive: Object.keys(archiveDiagnosticPolicy).length,
});
