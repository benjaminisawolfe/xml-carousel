import type {
  SchemaEdge,
  SchemaNode,
  SchemaNodeId,
  SchemaOccurrence,
  SchemaProject,
  SchemaSourcePosition,
  SchemaSourceRange,
} from '../model';
import { validateSchemaProject } from '../model';
import type {
  XsdAnnotationAst,
  XsdAnnotationEntryAst,
  XsdAttributeValueConstraintAst,
  XsdComplexContentAst,
  XsdComplexTypeAst,
  XsdComplexTypeDerivationAst,
  XsdCompositorAst,
  XsdEnumerationFacetAst,
  XsdGlobalDeclarationAst,
  XsdGlobalAttributeAst,
  XsdGlobalElementAst,
  XsdLocalElementAst,
  XsdLocalAttributeAst,
  XsdOccurrenceAst,
  XsdQNameAst,
  XsdSchemaAst,
  XsdSimpleTypeRestrictionAst,
  XsdSimpleTypeAst,
} from './xsdAst';
import type {
  XsdBuildDiagnostic,
  XsdBuildDiagnosticCode,
} from './xsdBuildDiagnostics';
import type {
  XsdAnnotationEntryMetadata,
  XsdAnnotationContentMetadata,
  XsdAnnotationMetadata,
  XsdForeignAttributeMetadata,
  XsdMixedContentMetadata,
  XsdLocalFormMetadata,
  XsdComplexTypeDerivationMetadata,
  XsdEnumerationValueMetadata,
  XsdMetadataByNodeId,
  XsdNodeMetadata,
  XsdNormalizedReference,
  XsdSchemaValueMetadata,
  XsdFacetKind,
  XsdTypeDerivationMethod,
} from './xsdProjectMetadata';
import {
  getXsdBuiltInTypeAncestry,
  xsdBuiltInTypeDefinitions,
} from './xsdBuiltInTypes';
import {
  createXsdSourceMap,
  xmlNamespaceUri,
  xmlSchemaNamespaceUri,
  xmlnsNamespaceUri,
  type XsdXmlAttributeAst,
  type XsdXmlElementAst,
  type XsdXmlNodeAst,
} from './xsdXmlAst';
import { extractXsdMixedContentText } from './xsdAnnotationText';

export type XsdUnresolvedReferencePolicy = 'error' | 'deferForPackage';

export interface XsdProjectBuildOptions {
  readonly projectId: string;
  readonly displayName: string;
  readonly sourceFileId: string;
  readonly sourceFilename: string;
  readonly unresolvedReferencePolicy?: XsdUnresolvedReferencePolicy;
  /** Set only after the authoritative Xerces boundary accepted this source. */
  readonly standardsAccepted?: boolean;
}

export interface XsdProjectBuildResult {
  readonly project?: SchemaProject;
  readonly diagnostics: readonly XsdBuildDiagnostic[];
  readonly metadataByNodeId: XsdMetadataByNodeId;
}

interface NodeOrigin {
  readonly description: string;
  readonly range: SchemaSourceRange;
}

interface BuildState {
  readonly options: XsdProjectBuildOptions;
  readonly sourceText: string;
  readonly targetNamespace?: string;
  readonly diagnostics: XsdBuildDiagnostic[];
  readonly nodes: SchemaNode[];
  readonly edges: SchemaEdge[];
  readonly metadataByNodeId: Record<SchemaNodeId, XsdNodeMetadata>;
  readonly originByNodeId: Map<SchemaNodeId, NodeOrigin>;
  readonly originByEdgeId: Map<string, SchemaSourceRange>;
  readonly typeNodeIdsByExpandedName: Map<string, SchemaNodeId>;
  readonly typeKindsByExpandedName: Map<string, 'complexType' | 'simpleType'>;
  readonly elementNodeIdsByExpandedName: Map<string, SchemaNodeId>;
  readonly attributeNodeIdsByExpandedName: Map<string, SchemaNodeId>;
  readonly groupNodeIdsByExpandedName: Map<string, SchemaNodeId>;
  readonly attributeGroupNodeIdsByExpandedName: Map<string, SchemaNodeId>;
}

const warningCodes = new Set<XsdBuildDiagnosticCode>([
  'external-type-reference-deferred',
  'external-element-reference-deferred',
  'external-attribute-reference-deferred',
  'external-restriction-base-deferred',
  'external-complex-type-base-deferred',
  'unsupported-explicit-local-form',
]);

function encodeIdPart(value: string): string {
  return encodeURIComponent(value);
}

function expandedName(namespaceUri: string | undefined, localName: string) {
  const namespace = namespaceUri ?? '';
  return `${namespace.length}:${namespace}${localName.length}:${localName}`;
}

function namedNodeId(
  kind:
    | 'globalElement'
    | 'complexType'
    | 'simpleType'
    | 'attribute'
    | 'group'
    | 'attributeGroup'
    | 'xsdNotation',
  sourceFileId: string,
  namespaceUri: string | undefined,
  name: string,
): SchemaNodeId {
  return [
    'xsd',
    kind,
    encodeIdPart(sourceFileId),
    encodeIdPart(namespaceUri ?? ''),
    encodeIdPart(name),
  ].join(':');
}

function rangedNodeId(
  kind:
    | 'localElement'
    | 'attribute:local'
    | 'complexType:anonymous'
    | 'simpleType:anonymous'
    | 'extension'
    | 'restriction'
    | 'sequence'
    | 'choice'
    | 'all'
    | 'elementReference'
    | 'attributeReference'
    | 'groupReference'
    | 'attributeGroupReference'
    | 'simpleContent'
    | 'complexContent'
    | 'elementWildcard'
    | 'attributeWildcard'
    | 'list'
    | 'union'
    | 'facet'
    | 'enumeration'
    | 'identityConstraint'
    | 'selector'
    | 'field'
    | 'include'
    | 'import'
    | 'redefine'
    | 'xsdAnnotation'
    | 'xsdDocumentation'
    | 'xsdAppInfo'
    | 'xsdForeignElement'
    | 'xsdComment'
    | 'xsdProcessingInstruction'
    | 'xsdProlog',
  sourceFileId: string,
  range: SchemaSourceRange,
): SchemaNodeId {
  return [
    'xsd',
    kind,
    encodeIdPart(sourceFileId),
    `${range.start.offset}-${range.end.offset}`,
  ].join(':');
}

function schemaNodeId(sourceFileId: string): SchemaNodeId {
  return `xsd:schema:${encodeIdPart(sourceFileId)}`;
}

function identityConstraintNodeId(
  sourceFileId: string,
  namespaceUri: string | undefined,
  ownerNodeId: SchemaNodeId,
  name: string,
  range: SchemaSourceRange,
): SchemaNodeId {
  return [
    'xsd',
    'identityConstraint',
    encodeIdPart(sourceFileId),
    encodeIdPart(namespaceUri ?? ''),
    encodeIdPart(ownerNodeId),
    encodeIdPart(name),
    `${range.start.offset}-${range.end.offset}`,
  ].join(':');
}

function builtInTypeNodeId(localName: string): SchemaNodeId {
  return `xsd:builtInType:${encodeIdPart(localName)}`;
}

function clonePosition(position: SchemaSourcePosition): SchemaSourcePosition {
  return {
    offset: position.offset,
    line: position.line,
    column: position.column,
  };
}

function cloneRange(range: SchemaSourceRange): SchemaSourceRange {
  return {
    start: clonePosition(range.start),
    end: clonePosition(range.end),
    ...(range.sourceId === undefined ? {} : { sourceId: range.sourceId }),
  };
}

function cloneSchemaValue(value: {
  readonly value: string;
  readonly lexicalValue: string;
  readonly range?: SchemaSourceRange;
}): XsdSchemaValueMetadata<string> {
  return {
    value: value.value,
    lexicalValue: value.lexicalValue,
    ...(value.range === undefined ? {} : { range: cloneRange(value.range) }),
  };
}

function annotationEntryMetadata(
  entry: XsdAnnotationEntryAst,
): XsdAnnotationEntryMetadata {
  return {
    kind: entry.kind,
    text: entry.text,
    rawXml: entry.rawXml,
    ...(entry.kind === 'documentation' && entry.xmlLang !== undefined
      ? { xmlLang: cloneSchemaValue(entry.xmlLang) }
      : {}),
    ...(entry.source === undefined
      ? {}
      : { source: cloneSchemaValue(entry.source) }),
    sourceRange: cloneRange(entry.range),
    startTagRange: cloneRange(entry.startTagRange),
    contentRange: cloneRange(entry.contentRange),
    sourceOrder: entry.sourceOrder,
  };
}

function annotationMetadata(
  annotation: XsdAnnotationAst,
): XsdAnnotationMetadata {
  return {
    entries: [...annotation.entries]
      .sort(
        (left, right) =>
          left.sourceOrder - right.sourceOrder ||
          left.range.start.offset - right.range.start.offset,
      )
      .map(annotationEntryMetadata),
    rawXml: annotation.rawXml,
    sourceRange: cloneRange(annotation.range),
    startTagRange: cloneRange(annotation.startTagRange),
    sourceOrder: annotation.sourceOrder,
  };
}

function normalizedAnnotations(
  annotations: readonly XsdAnnotationAst[],
): readonly XsdAnnotationMetadata[] {
  return [...annotations]
    .sort(
      (left, right) =>
        left.sourceOrder - right.sourceOrder ||
        left.range.start.offset - right.range.start.offset,
    )
    .map(annotationMetadata);
}

function cloneOccurrence(occurrence: XsdOccurrenceAst): SchemaOccurrence {
  return {
    min: occurrence.minOccurs,
    max: occurrence.maxOccurs,
  };
}

function cloneValueConstraint(
  valueConstraint: XsdAttributeValueConstraintAst,
): NonNullable<XsdNodeMetadata['valueConstraint']> {
  return {
    kind: valueConstraint.kind,
    value: valueConstraint.value,
    lexicalValue: valueConstraint.lexicalValue,
    range: cloneRange(valueConstraint.range),
  };
}

function cloneEnumeration(
  enumeration: XsdEnumerationFacetAst,
): XsdEnumerationValueMetadata | undefined {
  if (
    enumeration.value === undefined ||
    enumeration.lexicalValue === undefined ||
    enumeration.valueRange === undefined
  ) {
    return undefined;
  }
  return {
    value: enumeration.value,
    lexicalValue: enumeration.lexicalValue,
    valueRange: cloneRange(enumeration.valueRange),
    sourceRange: cloneRange(enumeration.range),
    sourceOrder: enumeration.sourceOrder,
  };
}

function complexTypeDerivationMetadata(
  derivation: XsdComplexTypeDerivationAst,
  baseReference?: XsdNormalizedReference,
): XsdComplexTypeDerivationMetadata {
  return {
    kind: derivation.kind,
    ...(baseReference === undefined ? {} : { baseReference }),
    ...(derivation.compositor === undefined
      ? {}
      : { declaredCompositor: derivation.compositor.compositor }),
    declaredAttributeCount: derivation.attributes.length,
    sourceRange: cloneRange(derivation.range),
    startTagRange: cloneRange(derivation.startTagRange),
  };
}

function diagnostic(
  code: XsdBuildDiagnosticCode,
  message: string,
  details: Omit<
    XsdBuildDiagnostic,
    'stage' | 'code' | 'severity' | 'message'
  > = {},
): XsdBuildDiagnostic {
  return {
    stage: 'build',
    code,
    severity: warningCodes.has(code) ? 'warning' : 'error',
    message,
    ...details,
  };
}

function compareDiagnostics(
  left: XsdBuildDiagnostic,
  right: XsdBuildDiagnostic,
): number {
  return (
    (left.range?.start.offset ?? Number.MAX_SAFE_INTEGER) -
      (right.range?.start.offset ?? Number.MAX_SAFE_INTEGER) ||
    (left.relatedRange?.start.offset ?? Number.MAX_SAFE_INTEGER) -
      (right.relatedRange?.start.offset ?? Number.MAX_SAFE_INTEGER) ||
    left.code.localeCompare(right.code) ||
    left.message.localeCompare(right.message) ||
    (left.reference ?? '').localeCompare(right.reference ?? '') ||
    (left.nodeId ?? '').localeCompare(right.nodeId ?? '')
  );
}

function resultWithoutProject(
  diagnostics: readonly XsdBuildDiagnostic[],
): XsdProjectBuildResult {
  return {
    diagnostics: [...diagnostics].sort(compareDiagnostics),
    metadataByNodeId: {},
  };
}

function validateOptions(
  options: XsdProjectBuildOptions,
): XsdBuildDiagnostic[] {
  const diagnostics: XsdBuildDiagnostic[] = [];
  const values: readonly (readonly [keyof XsdProjectBuildOptions, string])[] = [
    ['projectId', options.projectId],
    ['displayName', options.displayName],
    ['sourceFileId', options.sourceFileId],
    ['sourceFilename', options.sourceFilename],
  ];

  for (const [name, value] of values) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      diagnostics.push(
        diagnostic(
          'invalid-build-option',
          `XSD project build option "${name}" must not be empty or whitespace-only.`,
          {
            ...(typeof options.sourceFileId === 'string' &&
            options.sourceFileId.length > 0
              ? { sourceId: options.sourceFileId }
              : {}),
          },
        ),
      );
    }
  }
  return diagnostics;
}

function isPositionShape(value: unknown): value is SchemaSourcePosition {
  if (!value || typeof value !== 'object') return false;
  const position = value as Partial<SchemaSourcePosition>;
  return (
    typeof position.offset === 'number' &&
    typeof position.line === 'number' &&
    typeof position.column === 'number'
  );
}

function isRangeShape(value: unknown): value is SchemaSourceRange {
  if (!value || typeof value !== 'object') return false;
  const range = value as Partial<SchemaSourceRange>;
  return isPositionShape(range.start) && isPositionShape(range.end);
}

function diagnosticRange(value: unknown): SchemaSourceRange | undefined {
  return isRangeShape(value) ? cloneRange(value) : undefined;
}

function validateRange(
  range: unknown,
  label: string,
  sourceText: string,
  sourceFileId: string,
  diagnostics: XsdBuildDiagnostic[],
): range is SchemaSourceRange {
  const suppliedRange = diagnosticRange(range);
  if (!isRangeShape(range)) {
    diagnostics.push(
      diagnostic(
        'invalid-source-range',
        `${label} does not provide a complete source range.`,
        { sourceId: sourceFileId },
      ),
    );
    return false;
  }

  if (range.sourceId !== undefined && range.sourceId !== sourceFileId) {
    diagnostics.push(
      diagnostic(
        'source-id-mismatch',
        `${label} belongs to source "${range.sourceId}" instead of "${sourceFileId}".`,
        {
          sourceId: sourceFileId,
          ...(suppliedRange === undefined ? {} : { range: suppliedRange }),
        },
      ),
    );
    return false;
  }

  const offsetsAreValid =
    Number.isInteger(range.start.offset) &&
    Number.isInteger(range.end.offset) &&
    range.start.offset >= 0 &&
    range.end.offset >= range.start.offset &&
    range.end.offset <= sourceText.length;
  const locationsArePositiveIntegers =
    Number.isInteger(range.start.line) &&
    Number.isInteger(range.start.column) &&
    Number.isInteger(range.end.line) &&
    Number.isInteger(range.end.column) &&
    range.start.line >= 1 &&
    range.start.column >= 1 &&
    range.end.line >= 1 &&
    range.end.column >= 1;

  if (!offsetsAreValid || !locationsArePositiveIntegers) {
    diagnostics.push(
      diagnostic(
        'invalid-source-range',
        `${label} has an invalid source range for the supplied XSD source.`,
        {
          sourceId: sourceFileId,
          ...(suppliedRange === undefined ? {} : { range: suppliedRange }),
        },
      ),
    );
    return false;
  }

  const sourceMap = createXsdSourceMap(sourceText);
  const expectedStart = sourceMap.positionAt(range.start.offset);
  const expectedEnd = sourceMap.positionAt(range.end.offset);
  if (
    expectedStart.line !== range.start.line ||
    expectedStart.column !== range.start.column ||
    expectedEnd.line !== range.end.line ||
    expectedEnd.column !== range.end.column
  ) {
    diagnostics.push(
      diagnostic(
        'invalid-source-range',
        `${label} has line or column data inconsistent with its source offsets.`,
        {
          sourceId: sourceFileId,
          ...(suppliedRange === undefined ? {} : { range: suppliedRange }),
        },
      ),
    );
    return false;
  }

  return true;
}

function validateRequiredString(
  value: unknown,
  label: string,
  range: unknown,
  sourceFileId: string,
  diagnostics: XsdBuildDiagnostic[],
): value is string {
  if (typeof value === 'string' && value.length > 0) return true;
  diagnostics.push(
    diagnostic('missing-required-ast-value', `${label} is required.`, {
      sourceId: sourceFileId,
      ...(diagnosticRange(range) === undefined
        ? {}
        : { range: diagnosticRange(range) }),
    }),
  );
  return false;
}

function validateSourceOrder(
  sourceOrder: unknown,
  label: string,
  range: unknown,
  sourceFileId: string,
  diagnostics: XsdBuildDiagnostic[],
): sourceOrder is number {
  if (Number.isInteger(sourceOrder) && Number(sourceOrder) >= 0) return true;
  diagnostics.push(
    diagnostic(
      'missing-required-ast-value',
      `${label} must have a non-negative integer source order.`,
      {
        sourceId: sourceFileId,
        ...(diagnosticRange(range) === undefined
          ? {}
          : { range: diagnosticRange(range) }),
      },
    ),
  );
  return false;
}

function occurrenceAttributeRanges(
  occurrence: XsdOccurrenceAst,
): readonly (readonly [string, unknown])[] {
  const ranges: (readonly [string, unknown])[] = [];
  if (occurrence.minOccursAttribute) {
    ranges.push([
      'minOccurs attribute value',
      occurrence.minOccursAttribute.valueContentRange,
    ]);
  }
  if (occurrence.maxOccursAttribute) {
    ranges.push([
      'maxOccurs attribute value',
      occurrence.maxOccursAttribute.valueContentRange,
    ]);
  }
  return ranges;
}

function unqualifiedXmlAttribute(
  xml: XsdXmlElementAst,
  localName: string,
): XsdXmlAttributeAst | undefined {
  return xml.attributes.find(
    (attribute) =>
      attribute.prefix === undefined &&
      attribute.namespaceUri === undefined &&
      attribute.localName === localName,
  );
}

function validateQName(
  qname: XsdQNameAst | undefined,
  label: string,
  ownerXml: XsdXmlElementAst,
  sourceText: string,
  sourceFileId: string,
  diagnostics: XsdBuildDiagnostic[],
): void {
  if (!qname) return;
  validateRange(
    qname.range,
    `${label} QName`,
    sourceText,
    sourceFileId,
    diagnostics,
  );
  validateRequiredString(
    qname.raw,
    `${label} lexical QName`,
    qname.range,
    sourceFileId,
    diagnostics,
  );
  validateRequiredString(
    qname.localName,
    `${label} QName local name`,
    qname.range,
    sourceFileId,
    diagnostics,
  );
  if (qname.prefix) {
    const boundNamespace = ownerXml.namespaceBindings[qname.prefix];
    if (
      boundNamespace === undefined ||
      qname.namespaceUri === undefined ||
      boundNamespace !== qname.namespaceUri
    ) {
      diagnostics.push(
        diagnostic(
          'inconsistent-qname-namespace',
          `QName "${qname.raw}" is inconsistent with the owning XML namespace bindings.`,
          {
            sourceId: sourceFileId,
            range: cloneRange(qname.range),
            reference: qname.raw,
          },
        ),
      );
    }
  }
}

function validateEnumeration(
  enumeration: XsdEnumerationFacetAst,
  label: string,
  sourceText: string,
  sourceFileId: string,
  diagnostics: XsdBuildDiagnostic[],
): void {
  validateRange(
    enumeration.range,
    `${label} range`,
    sourceText,
    sourceFileId,
    diagnostics,
  );
  validateRange(
    enumeration.startTagRange,
    `${label} start tag`,
    sourceText,
    sourceFileId,
    diagnostics,
  );
  validateSourceOrder(
    enumeration.sourceOrder,
    label,
    enumeration.range,
    sourceFileId,
    diagnostics,
  );
  if (
    typeof enumeration.value !== 'string' ||
    typeof enumeration.lexicalValue !== 'string'
  ) {
    diagnostics.push(
      diagnostic(
        'missing-required-ast-value',
        `${label} must preserve decoded and lexical values.`,
        {
          sourceId: sourceFileId,
          range: diagnosticRange(enumeration.range),
        },
      ),
    );
  }
  validateRange(
    enumeration.valueRange,
    `${label} value`,
    sourceText,
    sourceFileId,
    diagnostics,
  );
}

function validateSimpleTypeRestriction(
  restriction: XsdSimpleTypeRestrictionAst,
  label: string,
  sourceText: string,
  sourceFileId: string,
  diagnostics: XsdBuildDiagnostic[],
): void {
  validateRange(
    restriction.range,
    `${label} range`,
    sourceText,
    sourceFileId,
    diagnostics,
  );
  validateRange(
    restriction.startTagRange,
    `${label} start tag`,
    sourceText,
    sourceFileId,
    diagnostics,
  );
  validateSourceOrder(
    restriction.sourceOrder,
    label,
    restriction.range,
    sourceFileId,
    diagnostics,
  );
  if (!restriction.base) {
    diagnostics.push(
      diagnostic(
        'missing-required-ast-value',
        `${label} base QName is required.`,
        {
          sourceId: sourceFileId,
          range: diagnosticRange(restriction.range),
        },
      ),
    );
  } else {
    validateQName(
      restriction.base,
      `${label} base`,
      restriction.xml,
      sourceText,
      sourceFileId,
      diagnostics,
    );
  }
  restriction.enumerations.forEach((enumeration, index) => {
    validateEnumeration(
      enumeration,
      `${label} enumeration ${index + 1}`,
      sourceText,
      sourceFileId,
      diagnostics,
    );
  });
}

function validateSimpleType(
  type: XsdSimpleTypeAst,
  label: string,
  named: boolean,
  sourceText: string,
  sourceFileId: string,
  diagnostics: XsdBuildDiagnostic[],
): void {
  validateRange(
    type.range,
    `${label} range`,
    sourceText,
    sourceFileId,
    diagnostics,
  );
  validateRange(
    type.startTagRange,
    `${label} start tag`,
    sourceText,
    sourceFileId,
    diagnostics,
  );
  validateSourceOrder(
    type.sourceOrder,
    label,
    type.range,
    sourceFileId,
    diagnostics,
  );
  if (named) {
    validateRequiredString(
      type.name,
      `${label} name`,
      type.nameRange ?? type.range,
      sourceFileId,
      diagnostics,
    );
  }
  if (type.restriction) {
    validateSimpleTypeRestriction(
      type.restriction,
      `${label} restriction`,
      sourceText,
      sourceFileId,
      diagnostics,
    );
  }
}

function validateAttributeValueConstraint(
  valueConstraint: XsdAttributeValueConstraintAst | undefined,
  label: string,
  sourceText: string,
  sourceFileId: string,
  diagnostics: XsdBuildDiagnostic[],
): void {
  if (!valueConstraint) return;
  validateRange(
    valueConstraint.range,
    `${label} ${valueConstraint.kind} value`,
    sourceText,
    sourceFileId,
    diagnostics,
  );
}

function validateGlobalAttribute(
  attribute: XsdGlobalAttributeAst,
  label: string,
  sourceText: string,
  sourceFileId: string,
  diagnostics: XsdBuildDiagnostic[],
): void {
  validateRange(
    attribute.range,
    `${label} range`,
    sourceText,
    sourceFileId,
    diagnostics,
  );
  validateRange(
    attribute.startTagRange,
    `${label} start tag`,
    sourceText,
    sourceFileId,
    diagnostics,
  );
  validateSourceOrder(
    attribute.sourceOrder,
    label,
    attribute.range,
    sourceFileId,
    diagnostics,
  );
  validateRequiredString(
    attribute.name,
    `${label} name`,
    attribute.nameRange ?? attribute.range,
    sourceFileId,
    diagnostics,
  );
  if (attribute.nameRange) {
    validateRange(
      attribute.nameRange,
      `${label} name`,
      sourceText,
      sourceFileId,
      diagnostics,
    );
  }
  validateQName(
    attribute.type,
    `${label} type`,
    attribute.xml,
    sourceText,
    sourceFileId,
    diagnostics,
  );
  if (attribute.anonymousSimpleType) {
    validateSimpleType(
      attribute.anonymousSimpleType,
      `${label} anonymous simple type`,
      false,
      sourceText,
      sourceFileId,
      diagnostics,
    );
  }
  validateAttributeValueConstraint(
    attribute.valueConstraint,
    label,
    sourceText,
    sourceFileId,
    diagnostics,
  );
}

function validateLocalAttribute(
  attribute: XsdLocalAttributeAst,
  label: string,
  sourceText: string,
  sourceFileId: string,
  diagnostics: XsdBuildDiagnostic[],
): void {
  validateRange(
    attribute.range,
    `${label} range`,
    sourceText,
    sourceFileId,
    diagnostics,
  );
  validateRange(
    attribute.startTagRange,
    `${label} start tag`,
    sourceText,
    sourceFileId,
    diagnostics,
  );
  validateSourceOrder(
    attribute.sourceOrder,
    label,
    attribute.range,
    sourceFileId,
    diagnostics,
  );
  if (!attribute.name && !attribute.ref) {
    diagnostics.push(
      diagnostic(
        'missing-required-ast-value',
        `${label} must provide a name or ref QName.`,
        {
          sourceId: sourceFileId,
          range: cloneRange(attribute.range),
        },
      ),
    );
  }
  if (attribute.nameRange) {
    validateRange(
      attribute.nameRange,
      `${label} name`,
      sourceText,
      sourceFileId,
      diagnostics,
    );
  }
  validateQName(
    attribute.ref,
    `${label} ref`,
    attribute.xml,
    sourceText,
    sourceFileId,
    diagnostics,
  );
  validateQName(
    attribute.type,
    `${label} type`,
    attribute.xml,
    sourceText,
    sourceFileId,
    diagnostics,
  );
  for (const localName of ['use', 'form'] as const) {
    const valueAttribute = unqualifiedXmlAttribute(attribute.xml, localName);
    if (valueAttribute) {
      validateRange(
        valueAttribute.valueContentRange,
        `${label} ${localName} value`,
        sourceText,
        sourceFileId,
        diagnostics,
      );
    }
  }
  if (attribute.anonymousSimpleType) {
    validateSimpleType(
      attribute.anonymousSimpleType,
      `${label} anonymous simple type`,
      false,
      sourceText,
      sourceFileId,
      diagnostics,
    );
  }
  validateAttributeValueConstraint(
    attribute.valueConstraint,
    label,
    sourceText,
    sourceFileId,
    diagnostics,
  );
}

function validateComplexTypeDerivation(
  derivation: XsdComplexTypeDerivationAst,
  label: string,
  sourceText: string,
  sourceFileId: string,
  diagnostics: XsdBuildDiagnostic[],
): void {
  validateRange(
    derivation.range,
    `${label} range`,
    sourceText,
    sourceFileId,
    diagnostics,
  );
  validateRange(
    derivation.startTagRange,
    `${label} start tag`,
    sourceText,
    sourceFileId,
    diagnostics,
  );
  validateSourceOrder(
    derivation.sourceOrder,
    label,
    derivation.range,
    sourceFileId,
    diagnostics,
  );
  if (!derivation.base) {
    diagnostics.push(
      diagnostic(
        'missing-required-ast-value',
        `${label} must provide a base QName.`,
        {
          sourceId: sourceFileId,
          range: cloneRange(derivation.range),
        },
      ),
    );
  }
  validateQName(
    derivation.base,
    `${label} base`,
    derivation.xml,
    sourceText,
    sourceFileId,
    diagnostics,
  );
  if (derivation.compositor) {
    validateCompositor(
      derivation.compositor,
      `${label} compositor`,
      sourceText,
      sourceFileId,
      diagnostics,
    );
  }
  derivation.attributes.forEach((attribute, index) => {
    validateLocalAttribute(
      attribute,
      `${label} attribute ${index + 1}`,
      sourceText,
      sourceFileId,
      diagnostics,
    );
  });
}

function validateComplexContent(
  complexContent: XsdComplexContentAst,
  label: string,
  sourceText: string,
  sourceFileId: string,
  diagnostics: XsdBuildDiagnostic[],
): void {
  validateRange(
    complexContent.range,
    `${label} range`,
    sourceText,
    sourceFileId,
    diagnostics,
  );
  validateRange(
    complexContent.startTagRange,
    `${label} start tag`,
    sourceText,
    sourceFileId,
    diagnostics,
  );
  validateSourceOrder(
    complexContent.sourceOrder,
    label,
    complexContent.range,
    sourceFileId,
    diagnostics,
  );
  if (!complexContent.derivation) {
    diagnostics.push(
      diagnostic(
        'missing-required-ast-value',
        `${label} must provide an extension or restriction.`,
        {
          sourceId: sourceFileId,
          range: cloneRange(complexContent.range),
        },
      ),
    );
    return;
  }
  validateComplexTypeDerivation(
    complexContent.derivation,
    `${label} derivation`,
    sourceText,
    sourceFileId,
    diagnostics,
  );
}

function validateComplexType(
  type: XsdComplexTypeAst,
  label: string,
  named: boolean,
  sourceText: string,
  sourceFileId: string,
  diagnostics: XsdBuildDiagnostic[],
): void {
  validateRange(
    type.range,
    `${label} range`,
    sourceText,
    sourceFileId,
    diagnostics,
  );
  validateRange(
    type.startTagRange,
    `${label} start tag`,
    sourceText,
    sourceFileId,
    diagnostics,
  );
  validateSourceOrder(
    type.sourceOrder,
    label,
    type.range,
    sourceFileId,
    diagnostics,
  );
  if (named) {
    validateRequiredString(
      type.name,
      `${label} name`,
      type.nameRange ?? type.range,
      sourceFileId,
      diagnostics,
    );
  }
  if (type.compositor) {
    validateCompositor(
      type.compositor,
      `${label} compositor`,
      sourceText,
      sourceFileId,
      diagnostics,
    );
  }
  type.attributes.forEach((attribute, index) => {
    validateLocalAttribute(
      attribute,
      `${label} attribute ${index + 1}`,
      sourceText,
      sourceFileId,
      diagnostics,
    );
  });
  if (type.complexContent) {
    if (type.compositor || type.attributes.length > 0) {
      diagnostics.push(
        diagnostic(
          'missing-required-ast-value',
          `${label} cannot combine direct content or attributes with complex content.`,
          {
            sourceId: sourceFileId,
            range: cloneRange(type.complexContent.range),
          },
        ),
      );
    }
    validateComplexContent(
      type.complexContent,
      `${label} complex content`,
      sourceText,
      sourceFileId,
      diagnostics,
    );
  }
}

function validateLocalElement(
  element: XsdLocalElementAst,
  label: string,
  sourceText: string,
  sourceFileId: string,
  diagnostics: XsdBuildDiagnostic[],
): void {
  validateRange(
    element.range,
    `${label} range`,
    sourceText,
    sourceFileId,
    diagnostics,
  );
  validateRange(
    element.startTagRange,
    `${label} start tag`,
    sourceText,
    sourceFileId,
    diagnostics,
  );
  validateSourceOrder(
    element.sourceOrder,
    label,
    element.range,
    sourceFileId,
    diagnostics,
  );
  if (!element.name && !element.ref) {
    diagnostics.push(
      diagnostic(
        'missing-required-ast-value',
        `${label} must provide a name or ref QName.`,
        {
          sourceId: sourceFileId,
          range: cloneRange(element.range),
        },
      ),
    );
  }
  validateQName(
    element.ref,
    `${label} ref`,
    element.xml,
    sourceText,
    sourceFileId,
    diagnostics,
  );
  validateQName(
    element.type,
    `${label} type`,
    element.xml,
    sourceText,
    sourceFileId,
    diagnostics,
  );
  for (const [occurrenceLabel, range] of occurrenceAttributeRanges(
    element.occurrence,
  )) {
    validateRange(
      range,
      `${label} ${occurrenceLabel}`,
      sourceText,
      sourceFileId,
      diagnostics,
    );
  }
  if (element.anonymousComplexType) {
    validateComplexType(
      element.anonymousComplexType,
      `${label} anonymous complex type`,
      false,
      sourceText,
      sourceFileId,
      diagnostics,
    );
  }
  if (element.anonymousSimpleType) {
    validateSimpleType(
      element.anonymousSimpleType,
      `${label} anonymous simple type`,
      false,
      sourceText,
      sourceFileId,
      diagnostics,
    );
  }
  const formAttribute = explicitLocalFormAttribute(element.xml);
  if (formAttribute) {
    validateRange(
      formAttribute.valueContentRange,
      `${label} form attribute value`,
      sourceText,
      sourceFileId,
      diagnostics,
    );
  }
}

function validateCompositor(
  compositor: XsdCompositorAst,
  label: string,
  sourceText: string,
  sourceFileId: string,
  diagnostics: XsdBuildDiagnostic[],
): void {
  validateRange(
    compositor.range,
    `${label} range`,
    sourceText,
    sourceFileId,
    diagnostics,
  );
  validateRange(
    compositor.startTagRange,
    `${label} start tag`,
    sourceText,
    sourceFileId,
    diagnostics,
  );
  validateSourceOrder(
    compositor.sourceOrder,
    label,
    compositor.range,
    sourceFileId,
    diagnostics,
  );
  for (const [occurrenceLabel, range] of occurrenceAttributeRanges(
    compositor.occurrence,
  )) {
    validateRange(
      range,
      `${label} ${occurrenceLabel}`,
      sourceText,
      sourceFileId,
      diagnostics,
    );
  }
  compositor.members.forEach((member, index) => {
    if (member.kind === 'localElement') {
      validateLocalElement(
        member,
        `${label} member ${index + 1}`,
        sourceText,
        sourceFileId,
        diagnostics,
      );
    } else {
      validateCompositor(
        member,
        `${label} member ${index + 1}`,
        sourceText,
        sourceFileId,
        diagnostics,
      );
    }
  });
}

function rangeContains(
  owner: SchemaSourceRange,
  child: SchemaSourceRange,
): boolean {
  return (
    child.start.offset >= owner.start.offset &&
    child.end.offset <= owner.end.offset
  );
}

function validateAnnotationEntry(
  entry: XsdAnnotationEntryAst,
  label: string,
  sourceText: string,
  sourceFileId: string,
  diagnostics: XsdBuildDiagnostic[],
): void {
  const rangeValid = validateRange(
    entry.range,
    `${label} range`,
    sourceText,
    sourceFileId,
    diagnostics,
  );
  const startTagValid = validateRange(
    entry.startTagRange,
    `${label} start tag`,
    sourceText,
    sourceFileId,
    diagnostics,
  );
  const contentValid = validateRange(
    entry.contentRange,
    `${label} content`,
    sourceText,
    sourceFileId,
    diagnostics,
  );
  validateSourceOrder(
    entry.sourceOrder,
    label,
    entry.range,
    sourceFileId,
    diagnostics,
  );
  if (
    rangeValid &&
    (typeof entry.rawXml !== 'string' ||
      entry.rawXml !== sourceSlice(sourceText, entry.range))
  ) {
    diagnostics.push(
      diagnostic(
        'raw-xml-range-mismatch',
        `${label} raw XML does not match its exact source range.`,
        {
          sourceId: sourceFileId,
          range: cloneRange(entry.range),
        },
      ),
    );
  }
  if (
    rangeValid &&
    ((startTagValid && !rangeContains(entry.range, entry.startTagRange)) ||
      (contentValid && !rangeContains(entry.range, entry.contentRange)))
  ) {
    diagnostics.push(
      diagnostic(
        'invalid-content-range',
        `${label} start-tag or content range is not contained by the entry range.`,
        {
          sourceId: sourceFileId,
          range: cloneRange(entry.range),
        },
      ),
    );
  }
  if (entry.kind === 'documentation' && entry.xmlLang?.range) {
    validateRange(
      entry.xmlLang.range,
      `${label} xml:lang value`,
      sourceText,
      sourceFileId,
      diagnostics,
    );
  }
  if (entry.source?.range) {
    validateRange(
      entry.source.range,
      `${label} source value`,
      sourceText,
      sourceFileId,
      diagnostics,
    );
  }
}

function validateAnnotations(
  annotations: unknown,
  ownerLabel: string,
  sourceText: string,
  sourceFileId: string,
  diagnostics: XsdBuildDiagnostic[],
): void {
  if (!Array.isArray(annotations)) {
    diagnostics.push(
      diagnostic(
        'missing-required-ast-value',
        `${ownerLabel} must expose an annotation array.`,
        { sourceId: sourceFileId },
      ),
    );
    return;
  }
  annotations.forEach((candidate, annotationIndex) => {
    if (!candidate || typeof candidate !== 'object') {
      diagnostics.push(
        diagnostic(
          'missing-required-ast-value',
          `${ownerLabel} annotation ${annotationIndex + 1} is malformed.`,
          { sourceId: sourceFileId },
        ),
      );
      return;
    }
    const annotation = candidate as XsdAnnotationAst;
    const label = `${ownerLabel} annotation ${annotationIndex + 1}`;
    const rangeValid = validateRange(
      annotation.range,
      `${label} range`,
      sourceText,
      sourceFileId,
      diagnostics,
    );
    const startTagValid = validateRange(
      annotation.startTagRange,
      `${label} start tag`,
      sourceText,
      sourceFileId,
      diagnostics,
    );
    validateSourceOrder(
      annotation.sourceOrder,
      label,
      annotation.range,
      sourceFileId,
      diagnostics,
    );
    if (
      rangeValid &&
      (typeof annotation.rawXml !== 'string' ||
        annotation.rawXml !== sourceSlice(sourceText, annotation.range))
    ) {
      diagnostics.push(
        diagnostic(
          'raw-xml-range-mismatch',
          `${label} raw XML does not match its exact source range.`,
          {
            sourceId: sourceFileId,
            range: cloneRange(annotation.range),
          },
        ),
      );
    }
    if (
      rangeValid &&
      startTagValid &&
      !rangeContains(annotation.range, annotation.startTagRange)
    ) {
      diagnostics.push(
        diagnostic(
          'invalid-content-range',
          `${label} start-tag range is not contained by the annotation range.`,
          {
            sourceId: sourceFileId,
            range: cloneRange(annotation.range),
          },
        ),
      );
    }
    if (!Array.isArray(annotation.entries)) {
      diagnostics.push(
        diagnostic(
          'missing-required-ast-value',
          `${label} must expose an entry array.`,
          {
            sourceId: sourceFileId,
            range: diagnosticRange(annotation.range),
          },
        ),
      );
      return;
    }
    annotation.entries.forEach((entry, entryIndex) => {
      validateAnnotationEntry(
        entry,
        `${label} entry ${entryIndex + 1}`,
        sourceText,
        sourceFileId,
        diagnostics,
      );
      if (rangeValid && !rangeContains(annotation.range, entry.range)) {
        diagnostics.push(
          diagnostic(
            'invalid-content-range',
            `${label} entry ${entryIndex + 1} is not contained by its annotation range.`,
            {
              sourceId: sourceFileId,
              range: cloneRange(entry.range),
              relatedRange: cloneRange(annotation.range),
            },
          ),
        );
      }
    });
  });
}

function validateComponentAnnotations(
  component:
    | XsdGlobalDeclarationAst
    | XsdLocalElementAst
    | XsdLocalAttributeAst
    | XsdCompositorAst
    | XsdComplexContentAst
    | XsdComplexTypeDerivationAst
    | XsdSimpleTypeRestrictionAst
    | XsdEnumerationFacetAst,
  label: string,
  sourceText: string,
  sourceFileId: string,
  diagnostics: XsdBuildDiagnostic[],
): void {
  validateAnnotations(
    component.annotations,
    label,
    sourceText,
    sourceFileId,
    diagnostics,
  );
  if (component.kind === 'globalElement' || component.kind === 'localElement') {
    if (component.anonymousComplexType) {
      validateComponentAnnotations(
        component.anonymousComplexType,
        `${label} anonymous complex type`,
        sourceText,
        sourceFileId,
        diagnostics,
      );
    }
    if (component.anonymousSimpleType) {
      validateComponentAnnotations(
        component.anonymousSimpleType,
        `${label} anonymous simple type`,
        sourceText,
        sourceFileId,
        diagnostics,
      );
    }
  } else if (
    component.kind === 'globalAttribute' ||
    component.kind === 'localAttribute'
  ) {
    if (component.anonymousSimpleType) {
      validateComponentAnnotations(
        component.anonymousSimpleType,
        `${label} anonymous simple type`,
        sourceText,
        sourceFileId,
        diagnostics,
      );
    }
  } else if (component.kind === 'complexType') {
    if (component.compositor) {
      validateComponentAnnotations(
        component.compositor,
        `${label} compositor`,
        sourceText,
        sourceFileId,
        diagnostics,
      );
    }
    component.attributes.forEach((attribute, index) =>
      validateComponentAnnotations(
        attribute,
        `${label} attribute ${index + 1}`,
        sourceText,
        sourceFileId,
        diagnostics,
      ),
    );
    if (component.complexContent) {
      validateComponentAnnotations(
        component.complexContent,
        `${label} complex content`,
        sourceText,
        sourceFileId,
        diagnostics,
      );
    }
  } else if (component.kind === 'simpleType') {
    if (component.restriction) {
      validateComponentAnnotations(
        component.restriction,
        `${label} restriction`,
        sourceText,
        sourceFileId,
        diagnostics,
      );
    }
  } else if (component.kind === 'compositor') {
    component.members.forEach((member, index) =>
      validateComponentAnnotations(
        member,
        `${label} member ${index + 1}`,
        sourceText,
        sourceFileId,
        diagnostics,
      ),
    );
  } else if (component.kind === 'complexContent') {
    if (component.derivation) {
      validateComponentAnnotations(
        component.derivation,
        `${label} derivation`,
        sourceText,
        sourceFileId,
        diagnostics,
      );
    }
  } else if (
    component.kind === 'extension' ||
    (component.kind === 'restriction' && 'attributes' in component)
  ) {
    if (component.compositor) {
      validateComponentAnnotations(
        component.compositor,
        `${label} compositor`,
        sourceText,
        sourceFileId,
        diagnostics,
      );
    }
    component.attributes.forEach((attribute, index) =>
      validateComponentAnnotations(
        attribute,
        `${label} attribute ${index + 1}`,
        sourceText,
        sourceFileId,
        diagnostics,
      ),
    );
  } else if (component.kind === 'restriction' && 'enumerations' in component) {
    component.enumerations.forEach((enumeration, index) =>
      validateComponentAnnotations(
        enumeration,
        `${label} enumeration ${index + 1}`,
        sourceText,
        sourceFileId,
        diagnostics,
      ),
    );
  }
}

function validateAst(
  schema: XsdSchemaAst,
  sourceText: string,
  sourceFileId: string,
): XsdBuildDiagnostic[] {
  const diagnostics: XsdBuildDiagnostic[] = [];
  validateRange(
    schema.range,
    'Schema range',
    sourceText,
    sourceFileId,
    diagnostics,
  );
  validateRange(
    schema.startTagRange,
    'Schema start tag',
    sourceText,
    sourceFileId,
    diagnostics,
  );
  validateSourceOrder(
    schema.sourceOrder,
    'Schema',
    schema.range,
    sourceFileId,
    diagnostics,
  );
  validateAnnotations(
    schema.annotations,
    'Schema',
    sourceText,
    sourceFileId,
    diagnostics,
  );
  if (schema.targetNamespace?.range) {
    validateRange(
      schema.targetNamespace.range,
      'Schema targetNamespace value',
      sourceText,
      sourceFileId,
      diagnostics,
    );
  }
  if (schema.elementFormDefault.range) {
    validateRange(
      schema.elementFormDefault.range,
      'Schema elementFormDefault value',
      sourceText,
      sourceFileId,
      diagnostics,
    );
  }
  if (schema.attributeFormDefault.range) {
    validateRange(
      schema.attributeFormDefault.range,
      'Schema attributeFormDefault value',
      sourceText,
      sourceFileId,
      diagnostics,
    );
  }
  if (schema.version?.range) {
    validateRange(
      schema.version.range,
      'Schema version value',
      sourceText,
      sourceFileId,
      diagnostics,
    );
  }

  schema.declarations.forEach((declaration, index) => {
    const label = `Global declaration ${index + 1}`;
    validateComponentAnnotations(
      declaration,
      label,
      sourceText,
      sourceFileId,
      diagnostics,
    );
    if (declaration.kind === 'globalElement') {
      validateGlobalElement(
        declaration,
        label,
        sourceText,
        sourceFileId,
        diagnostics,
      );
    } else if (declaration.kind === 'globalAttribute') {
      validateGlobalAttribute(
        declaration,
        label,
        sourceText,
        sourceFileId,
        diagnostics,
      );
    } else if (declaration.kind === 'complexType') {
      validateComplexType(
        declaration,
        label,
        true,
        sourceText,
        sourceFileId,
        diagnostics,
      );
    } else {
      validateSimpleType(
        declaration,
        label,
        true,
        sourceText,
        sourceFileId,
        diagnostics,
      );
    }
  });
  return diagnostics;
}

function validateGlobalElement(
  element: XsdGlobalElementAst,
  label: string,
  sourceText: string,
  sourceFileId: string,
  diagnostics: XsdBuildDiagnostic[],
): void {
  validateRange(
    element.range,
    `${label} range`,
    sourceText,
    sourceFileId,
    diagnostics,
  );
  validateRange(
    element.startTagRange,
    `${label} start tag`,
    sourceText,
    sourceFileId,
    diagnostics,
  );
  validateSourceOrder(
    element.sourceOrder,
    label,
    element.range,
    sourceFileId,
    diagnostics,
  );
  validateRequiredString(
    element.name,
    `${label} name`,
    element.nameRange ?? element.range,
    sourceFileId,
    diagnostics,
  );
  validateQName(
    element.type,
    `${label} type`,
    element.xml,
    sourceText,
    sourceFileId,
    diagnostics,
  );
  if (element.anonymousComplexType) {
    validateComplexType(
      element.anonymousComplexType,
      `${label} anonymous complex type`,
      false,
      sourceText,
      sourceFileId,
      diagnostics,
    );
  }
  if (element.anonymousSimpleType) {
    validateSimpleType(
      element.anonymousSimpleType,
      `${label} anonymous simple type`,
      false,
      sourceText,
      sourceFileId,
      diagnostics,
    );
  }
}

function declarationSort(
  left: XsdGlobalDeclarationAst,
  right: XsdGlobalDeclarationAst,
): number {
  return (
    left.sourceOrder - right.sourceOrder ||
    left.range.start.offset - right.range.start.offset ||
    left.kind.localeCompare(right.kind)
  );
}

function addNode(
  state: BuildState,
  node: SchemaNode,
  metadata: XsdNodeMetadata,
  origin: NodeOrigin,
): boolean {
  const existing = state.originByNodeId.get(node.id);
  if (existing) {
    state.diagnostics.push(
      diagnostic(
        'id-collision',
        `${existing.description} and ${origin.description} produced the same node ID "${node.id}".`,
        {
          sourceId: state.options.sourceFileId,
          range: cloneRange(origin.range),
          relatedRange: cloneRange(existing.range),
          nodeId: node.id,
        },
      ),
    );
    return false;
  }
  state.originByNodeId.set(node.id, origin);
  state.nodes.push(node);
  state.metadataByNodeId[node.id] = metadata;
  return true;
}

function addEdge(
  state: BuildState,
  edge: SchemaEdge,
  range: SchemaSourceRange,
): void {
  const existingRange = state.originByEdgeId.get(edge.id);
  if (existingRange) {
    state.diagnostics.push(
      diagnostic(
        'edge-id-collision',
        `Multiple XSD relationships produced the same edge ID "${edge.id}".`,
        {
          sourceId: state.options.sourceFileId,
          range: cloneRange(range),
          relatedRange: cloneRange(existingRange),
          nodeId: edge.sourceNodeId,
        },
      ),
    );
    return;
  }
  state.originByEdgeId.set(edge.id, range);
  state.edges.push(edge);
}

function edgeId(
  kind: SchemaEdge['kind'],
  sourceNodeId: SchemaNodeId,
  targetNodeId: SchemaNodeId,
  range: SchemaSourceRange,
  order?: number,
): string {
  return [
    'xsd',
    kind,
    encodeIdPart(sourceNodeId),
    encodeIdPart(targetNodeId),
    `${range.start.offset}-${range.end.offset}`,
    order === undefined ? '-' : String(order),
  ].join(':');
}

function sourceSlice(sourceText: string, range: SchemaSourceRange): string {
  return sourceText.slice(range.start.offset, range.end.offset);
}

function xmlAttributeValue(
  element: XsdXmlElementAst,
  localName: string,
): string | undefined {
  return unqualifiedXmlAttribute(element, localName)?.value;
}

function xmlBoolean(element: XsdXmlElementAst, localName: string): boolean {
  const value = xmlAttributeValue(element, localName);
  return value === 'true' || value === '1';
}

function xmlTokens(
  element: XsdXmlElementAst,
  localName: string,
): readonly string[] | undefined {
  const value = xmlAttributeValue(element, localName)?.trim();
  return value ? value.split(/\s+/u) : undefined;
}

function xsdChildElements(
  element: XsdXmlElementAst,
): readonly XsdXmlElementAst[] {
  return element.children.filter(
    (child): child is XsdXmlElementAst =>
      child.kind === 'element' && child.namespaceUri === xmlSchemaNamespaceUri,
  );
}

function complexContentKind(
  type: XsdComplexTypeAst,
): NonNullable<XsdNodeMetadata['contentKind']> {
  const children = xsdChildElements(type.xml);
  if (children.some(({ localName }) => localName === 'simpleContent')) {
    return 'simple';
  }
  const complexContent = children.find(
    ({ localName }) => localName === 'complexContent',
  );
  if (
    xmlBoolean(type.xml, 'mixed') ||
    (complexContent !== undefined && xmlBoolean(complexContent, 'mixed'))
  ) {
    return 'mixed';
  }
  if (type.compositor || type.complexContent?.derivation?.compositor) {
    return 'elementOnly';
  }
  return complexContent ? 'inherited' : 'empty';
}

function semanticProperties(
  entries: readonly (readonly [string, string | undefined])[],
): SchemaNode['properties'] {
  return entries
    .filter(
      (entry): entry is readonly [string, string] => entry[1] !== undefined,
    )
    .map(([label, value]) => ({ label, value }));
}

function parseElementValueConstraint(
  element: XsdXmlElementAst,
): XsdNodeMetadata['valueConstraint'] | undefined {
  const selected =
    unqualifiedXmlAttribute(element, 'default') ??
    unqualifiedXmlAttribute(element, 'fixed');
  if (!selected) return undefined;
  return {
    kind: selected.localName as 'default' | 'fixed',
    value: selected.value,
    lexicalValue: selected.rawValue,
    range: cloneRange(selected.valueContentRange),
  };
}

function declarationProperties(
  declaration: XsdGlobalDeclarationAst,
): SchemaNode['properties'] {
  if (declaration.kind === 'globalElement') {
    return semanticProperties([
      ['Role', 'Global declaration'],
      ['Type', declaration.type?.raw],
      ['Default', xmlAttributeValue(declaration.xml, 'default')],
      ['Fixed', xmlAttributeValue(declaration.xml, 'fixed')],
      ['Nillable', xmlBoolean(declaration.xml, 'nillable') ? 'true' : 'false'],
      ['Abstract', xmlBoolean(declaration.xml, 'abstract') ? 'true' : 'false'],
      ['Block', xmlAttributeValue(declaration.xml, 'block')],
      ['Final', xmlAttributeValue(declaration.xml, 'final')],
      [
        'Substitution group',
        xmlAttributeValue(declaration.xml, 'substitutionGroup'),
      ],
    ]);
  }
  if (declaration.kind === 'globalAttribute') {
    return semanticProperties([
      ['Role', 'Global declaration'],
      ['Type', declaration.type?.raw],
      [
        'Default',
        declaration.valueConstraint?.kind === 'default'
          ? declaration.valueConstraint.value
          : undefined,
      ],
      [
        'Fixed',
        declaration.valueConstraint?.kind === 'fixed'
          ? declaration.valueConstraint.value
          : undefined,
      ],
    ]);
  }
  if (declaration.kind === 'complexType') {
    return semanticProperties([
      ['Identity', 'Named complex type'],
      ['Content', complexContentKind(declaration)],
      ['Mixed', xmlBoolean(declaration.xml, 'mixed') ? 'true' : 'false'],
      ['Abstract', xmlBoolean(declaration.xml, 'abstract') ? 'true' : 'false'],
      ['Block', xmlAttributeValue(declaration.xml, 'block')],
      ['Final', xmlAttributeValue(declaration.xml, 'final')],
    ]);
  }
  return semanticProperties([
    ['Identity', 'Named simple type'],
    [
      'Variety',
      declaration.restriction
        ? 'restriction'
        : xsdChildElements(declaration.xml).find(
            ({ localName }) => localName === 'list' || localName === 'union',
          )?.localName,
    ],
    ['Final', xmlAttributeValue(declaration.xml, 'final')],
  ]);
}

function declarationSearchTerms(
  declaration: XsdGlobalDeclarationAst,
): readonly string[] {
  return [
    declaration.kind === 'globalElement'
      ? declaration.type?.raw
      : declaration.kind === 'globalAttribute'
        ? declaration.type?.raw
        : undefined,
    xmlAttributeValue(declaration.xml, 'substitutionGroup'),
    'global declaration',
  ].filter((value): value is string => value !== undefined);
}

function baseMetadata(
  kind: SchemaNode['kind'],
  scope: XsdNodeMetadata['scope'],
  sourceFileId: string,
  sourceOrder: number,
  range: SchemaSourceRange,
  startTagRange: SchemaSourceRange,
  targetNamespace?: string,
): XsdNodeMetadata {
  return {
    kind,
    scope,
    sourceFileId,
    sourceOrder,
    sourceRange: cloneRange(range),
    startTagRange: cloneRange(startTagRange),
    annotations: [],
    ...(targetNamespace === undefined ? {} : { targetNamespace }),
  };
}

function attachAnnotations(
  state: BuildState,
  nodeId: SchemaNodeId,
  annotations: readonly XsdAnnotationAst[],
): void {
  if (annotations.length === 0) return;
  const metadata = state.metadataByNodeId[nodeId];
  if (!metadata) return;
  state.metadataByNodeId[nodeId] = {
    ...metadata,
    annotations: [
      ...(metadata.annotations ?? []),
      ...normalizedAnnotations(annotations),
    ].sort(
      (left, right) =>
        left.sourceOrder - right.sourceOrder ||
        left.sourceRange.start.offset - right.sourceRange.start.offset,
    ),
  };
}

function registerGlobalSymbols(
  schema: XsdSchemaAst,
  state: BuildState,
): readonly XsdGlobalDeclarationAst[] {
  const declarations = [...schema.declarations].sort(declarationSort);
  const firstElementByName = new Map<
    string,
    { readonly declaration: XsdGlobalElementAst; readonly nodeId: SchemaNodeId }
  >();
  const firstTypeByName = new Map<
    string,
    {
      readonly declaration: XsdComplexTypeAst | XsdSimpleTypeAst;
      readonly nodeId: SchemaNodeId;
    }
  >();
  const firstAttributeByName = new Map<
    string,
    {
      readonly declaration: XsdGlobalAttributeAst;
      readonly nodeId: SchemaNodeId;
    }
  >();

  for (const declaration of declarations) {
    const name = declaration.name;
    if (!name) continue;
    const key = expandedName(state.targetNamespace, name);
    if (declaration.kind === 'globalElement') {
      const nodeId = namedNodeId(
        'globalElement',
        state.options.sourceFileId,
        state.targetNamespace,
        name,
      );
      const first = firstElementByName.get(key);
      if (first) {
        state.diagnostics.push(
          diagnostic(
            'duplicate-global-element',
            `Global element "${name}" is declared more than once in namespace "${state.targetNamespace ?? ''}".`,
            {
              sourceId: state.options.sourceFileId,
              range: cloneRange(declaration.range),
              relatedRange: cloneRange(first.declaration.range),
              nodeId,
            },
          ),
        );
      } else {
        firstElementByName.set(key, { declaration, nodeId });
        state.elementNodeIdsByExpandedName.set(key, nodeId);
      }
    } else if (declaration.kind === 'globalAttribute') {
      const nodeId = namedNodeId(
        'attribute',
        state.options.sourceFileId,
        state.targetNamespace,
        name,
      );
      const first = firstAttributeByName.get(key);
      if (first) {
        state.diagnostics.push(
          diagnostic(
            'duplicate-global-attribute',
            `Global attribute "${name}" is declared more than once in namespace "${state.targetNamespace ?? ''}".`,
            {
              sourceId: state.options.sourceFileId,
              range: cloneRange(declaration.range),
              relatedRange: cloneRange(first.declaration.range),
              nodeId,
            },
          ),
        );
      } else {
        firstAttributeByName.set(key, { declaration, nodeId });
        state.attributeNodeIdsByExpandedName.set(key, nodeId);
      }
    } else {
      const nodeId = namedNodeId(
        declaration.kind,
        state.options.sourceFileId,
        state.targetNamespace,
        name,
      );
      const first = firstTypeByName.get(key);
      if (first) {
        state.diagnostics.push(
          diagnostic(
            'duplicate-type-definition',
            `Type definition "${name}" is declared more than once in namespace "${state.targetNamespace ?? ''}".`,
            {
              sourceId: state.options.sourceFileId,
              range: cloneRange(declaration.range),
              relatedRange: cloneRange(first.declaration.range),
              nodeId,
            },
          ),
        );
      } else {
        firstTypeByName.set(key, { declaration, nodeId });
        state.typeNodeIdsByExpandedName.set(key, nodeId);
        state.typeKindsByExpandedName.set(key, declaration.kind);
      }
    }
  }

  return declarations;
}

function buildSchemaNode(
  schema: XsdSchemaAst,
  state: BuildState,
): SchemaNodeId {
  const id = schemaNodeId(state.options.sourceFileId);
  const metadata: XsdNodeMetadata = {
    ...baseMetadata(
      'schema',
      'schema',
      state.options.sourceFileId,
      schema.sourceOrder,
      schema.range,
      schema.startTagRange,
      state.targetNamespace,
    ),
    elementFormDefault: schema.elementFormDefault.value,
    attributeFormDefault: schema.attributeFormDefault.value,
    ...(schema.version === undefined ? {} : { version: schema.version.value }),
    namespaceDeclarations: Object.entries(schema.xml.namespaceBindings).map(
      ([prefix, namespaceUri]) => ({ prefix, namespaceUri }),
    ),
    ...(xmlTokens(schema.xml, 'blockDefault') === undefined
      ? {}
      : { block: xmlTokens(schema.xml, 'blockDefault') }),
    ...(xmlTokens(schema.xml, 'finalDefault') === undefined
      ? {}
      : { final: xmlTokens(schema.xml, 'finalDefault') }),
  };
  addNode(
    state,
    {
      id,
      kind: 'schema',
      name: state.targetNamespace ?? state.options.sourceFilename,
      sourceFileId: state.options.sourceFileId,
      sourceOrder: schema.sourceOrder,
      compactDeclaration: sourceSlice(state.sourceText, schema.startTagRange),
      searchTerms: Object.entries(schema.xml.namespaceBindings).map(
        ([prefix, namespace]) => `${prefix || 'default'} ${namespace}`,
      ),
    },
    metadata,
    { description: 'the schema', range: schema.range },
  );
  attachAnnotations(state, id, schema.annotations);
  return id;
}

function explicitLocalFormAttribute(
  xml: XsdXmlElementAst,
): XsdXmlAttributeAst | undefined {
  return unqualifiedXmlAttribute(xml, 'form');
}

type AnonymousSimpleTypeOwner =
  | XsdGlobalElementAst
  | XsdLocalElementAst
  | XsdGlobalAttributeAst
  | XsdLocalAttributeAst;

function ownerFallback(element: AnonymousSimpleTypeOwner) {
  return (
    element.name ??
    (element.kind === 'localElement' || element.kind === 'localAttribute'
      ? element.ref?.raw
      : undefined) ??
    `${element.kind.includes('Attribute') ? 'attribute' : 'element'} at ${element.range.start.line}:${element.range.start.column}`
  );
}

function addSimpleTypeRestriction(
  type: XsdSimpleTypeAst,
  simpleTypeNodeId: SchemaNodeId,
  state: BuildState,
): void {
  const restriction = type.restriction;
  if (!restriction) return;
  const id = rangedNodeId(
    'restriction',
    state.options.sourceFileId,
    restriction.range,
  );
  const owner = state.nodes.find(
    ({ id: nodeId }) => nodeId === simpleTypeNodeId,
  );
  const enumerations = restriction.enumerations
    .map(cloneEnumeration)
    .filter(
      (value): value is XsdEnumerationValueMetadata => value !== undefined,
    );
  if (
    !addNode(
      state,
      {
        id,
        kind: 'restriction',
        name: `Restriction of ${owner?.name ?? 'simple type'}`,
        sourceFileId: state.options.sourceFileId,
        sourceOrder: restriction.sourceOrder,
        compactDeclaration: sourceSlice(
          state.sourceText,
          restriction.startTagRange,
        ),
      },
      {
        ...baseMetadata(
          'restriction',
          state.metadataByNodeId[simpleTypeNodeId]?.scope ?? 'local',
          state.options.sourceFileId,
          restriction.sourceOrder,
          restriction.range,
          restriction.startTagRange,
          state.targetNamespace,
        ),
        enumerationValues: enumerations,
        enumerationCount: enumerations.length,
      },
      { description: 'a simple type restriction', range: restriction.range },
    )
  ) {
    return;
  }
  attachAnnotations(state, id, [
    ...restriction.annotations,
    ...restriction.enumerations.reduce<XsdAnnotationAst[]>(
      (annotations, enumeration) => [
        ...annotations,
        ...enumeration.annotations,
      ],
      [],
    ),
  ]);
  addEdge(
    state,
    {
      id: edgeId('contains', simpleTypeNodeId, id, restriction.range, 0),
      kind: 'contains',
      sourceNodeId: simpleTypeNodeId,
      targetNodeId: id,
      order: 0,
    },
    restriction.range,
  );
}

function addComplexTypeDerivation(
  type: XsdComplexTypeAst,
  complexTypeNodeId: SchemaNodeId,
  state: BuildState,
): void {
  const derivation = type.complexContent?.derivation;
  if (!derivation) return;
  const id = rangedNodeId(
    derivation.kind,
    state.options.sourceFileId,
    derivation.range,
  );
  const owner = state.nodes.find(
    ({ id: nodeId }) => nodeId === complexTypeNodeId,
  );
  const kindLabel =
    derivation.kind === 'extension' ? 'Extension' : 'Restriction';
  const metadata = complexTypeDerivationMetadata(derivation);
  if (
    !addNode(
      state,
      {
        id,
        kind: derivation.kind,
        name: `${kindLabel} of ${owner?.name ?? 'complex type'}`,
        sourceFileId: state.options.sourceFileId,
        sourceOrder: derivation.sourceOrder,
        compactDeclaration: sourceSlice(
          state.sourceText,
          derivation.startTagRange,
        ),
      },
      {
        ...baseMetadata(
          derivation.kind,
          state.metadataByNodeId[complexTypeNodeId]?.scope ?? 'local',
          state.options.sourceFileId,
          derivation.sourceOrder,
          derivation.range,
          derivation.startTagRange,
          state.targetNamespace,
        ),
        complexTypeDerivation: metadata,
      },
      {
        description: `a complex type ${derivation.kind}`,
        range: derivation.range,
      },
    )
  ) {
    return;
  }
  attachAnnotations(state, id, derivation.annotations);
  attachAnnotations(
    state,
    complexTypeNodeId,
    type.complexContent?.annotations ?? [],
  );
  addEdge(
    state,
    {
      id: edgeId('contains', complexTypeNodeId, id, derivation.range, 0),
      kind: 'contains',
      sourceNodeId: complexTypeNodeId,
      targetNodeId: id,
      order: 0,
    },
    derivation.range,
  );
  if (derivation.compositor) {
    addCompositor(derivation.compositor, id, state, 0);
  }
  addLocalAttributes(derivation.attributes, id, state);

  const ownerMetadata = state.metadataByNodeId[complexTypeNodeId];
  if (ownerMetadata) {
    state.metadataByNodeId[complexTypeNodeId] = {
      ...ownerMetadata,
      complexTypeDerivation: {
        ...metadata,
        sourceRange: cloneRange(metadata.sourceRange),
        startTagRange: cloneRange(metadata.startTagRange),
      },
    };
  }
}

function addAnonymousSimpleType(
  type: XsdSimpleTypeAst,
  owner: AnonymousSimpleTypeOwner,
  ownerNodeId: SchemaNodeId,
  state: BuildState,
): void {
  const id = rangedNodeId(
    'simpleType:anonymous',
    state.options.sourceFileId,
    type.range,
  );
  if (
    addNode(
      state,
      {
        id,
        kind: 'simpleType',
        name: `Anonymous simple type of ${ownerFallback(owner)}`,
        sourceFileId: state.options.sourceFileId,
        sourceOrder: type.sourceOrder,
        compactDeclaration: sourceSlice(state.sourceText, type.startTagRange),
        properties: semanticProperties([
          ['Identity', 'Anonymous simple type'],
          [
            'Variety',
            type.restriction
              ? 'restriction'
              : xsdChildElements(type.xml).find(
                  ({ localName }) =>
                    localName === 'list' || localName === 'union',
                )?.localName,
          ],
          ['Owner', ownerFallback(owner)],
        ]),
      },
      {
        ...baseMetadata(
          'simpleType',
          'anonymous',
          state.options.sourceFileId,
          type.sourceOrder,
          type.range,
          type.startTagRange,
        ),
        anonymous: true,
        ownerNodeId,
        simpleTypeVariety: type.restriction
          ? 'restriction'
          : (xsdChildElements(type.xml).find(
              ({ localName }) => localName === 'list' || localName === 'union',
            )?.localName as 'list' | 'union' | undefined),
      },
      { description: 'an anonymous simple type', range: type.range },
    )
  ) {
    attachAnnotations(state, id, type.annotations);
    addEdge(
      state,
      {
        id: edgeId('typeOf', ownerNodeId, id, type.range),
        kind: 'typeOf',
        sourceNodeId: ownerNodeId,
        targetNodeId: id,
      },
      type.range,
    );
    addSimpleTypeRestriction(type, id, state);
  }
}

function addAnonymousComplexType(
  type: XsdComplexTypeAst,
  owner: XsdGlobalElementAst | XsdLocalElementAst,
  ownerNodeId: SchemaNodeId,
  state: BuildState,
): void {
  const id = rangedNodeId(
    'complexType:anonymous',
    state.options.sourceFileId,
    type.range,
  );
  if (
    addNode(
      state,
      {
        id,
        kind: 'complexType',
        name: `Anonymous complex type of ${ownerFallback(owner)}`,
        sourceFileId: state.options.sourceFileId,
        sourceOrder: type.sourceOrder,
        compactDeclaration: sourceSlice(state.sourceText, type.startTagRange),
        properties: semanticProperties([
          ['Identity', 'Anonymous complex type'],
          ['Owner', ownerFallback(owner)],
          ['Content', complexContentKind(type)],
          ['Mixed', xmlBoolean(type.xml, 'mixed') ? 'true' : 'false'],
          ['Abstract', xmlBoolean(type.xml, 'abstract') ? 'true' : 'false'],
          ['Block', xmlAttributeValue(type.xml, 'block')],
          ['Final', xmlAttributeValue(type.xml, 'final')],
        ]),
      },
      {
        ...baseMetadata(
          'complexType',
          'anonymous',
          state.options.sourceFileId,
          type.sourceOrder,
          type.range,
          type.startTagRange,
        ),
        anonymous: true,
        ownerNodeId,
        contentKind: complexContentKind(type),
        mixed: xmlBoolean(type.xml, 'mixed'),
        abstract: xmlBoolean(type.xml, 'abstract'),
        ...(xmlTokens(type.xml, 'block') === undefined
          ? {}
          : { block: xmlTokens(type.xml, 'block') }),
        ...(xmlTokens(type.xml, 'final') === undefined
          ? {}
          : { final: xmlTokens(type.xml, 'final') }),
      },
      { description: 'an anonymous complex type', range: type.range },
    )
  ) {
    attachAnnotations(state, id, type.annotations);
    addEdge(
      state,
      {
        id: edgeId('typeOf', ownerNodeId, id, type.range),
        kind: 'typeOf',
        sourceNodeId: ownerNodeId,
        targetNodeId: id,
      },
      type.range,
    );
    if (type.compositor) addCompositor(type.compositor, id, state, 0);
    addLocalAttributes(type.attributes, id, state);
    addComplexTypeDerivation(type, id, state);
  }
}

function addCompositor(
  compositor: XsdCompositorAst,
  ownerNodeId: SchemaNodeId,
  state: BuildState,
  order: number,
): void {
  const id = rangedNodeId(
    compositor.compositor,
    state.options.sourceFileId,
    compositor.range,
  );
  const occurrence = cloneOccurrence(compositor.occurrence);
  if (
    !addNode(
      state,
      {
        id,
        kind: compositor.compositor,
        name: compositor.compositor,
        sourceFileId: state.options.sourceFileId,
        sourceOrder: compositor.sourceOrder,
        compactDeclaration: sourceSlice(
          state.sourceText,
          compositor.startTagRange,
        ),
      },
      {
        ...baseMetadata(
          compositor.compositor,
          'local',
          state.options.sourceFileId,
          compositor.sourceOrder,
          compositor.range,
          compositor.startTagRange,
        ),
        compositor: compositor.compositor,
        occurrence,
      },
      {
        description: `a ${compositor.compositor} compositor`,
        range: compositor.range,
      },
    )
  ) {
    return;
  }
  attachAnnotations(state, id, compositor.annotations);

  addEdge(
    state,
    {
      id: edgeId('contains', ownerNodeId, id, compositor.range, order),
      kind: 'contains',
      sourceNodeId: ownerNodeId,
      targetNodeId: id,
      order,
      occurrence,
    },
    compositor.range,
  );

  compositor.members.forEach((member, memberOrder) => {
    if (member.kind === 'localElement') {
      addLocalElement(member, id, state, memberOrder);
    } else {
      addCompositor(member, id, state, memberOrder);
    }
  });
}

function localFormMetadata(
  element: XsdLocalElementAst,
  state: BuildState,
): XsdLocalFormMetadata {
  const explicitForm = explicitLocalFormAttribute(element.xml);
  if (!explicitForm) {
    return {
      resolution: 'inherited',
      value:
        state.metadataByNodeId[schemaNodeId(state.options.sourceFileId)]
          ?.elementFormDefault ?? 'unqualified',
    };
  }
  return {
    resolution: 'explicit',
    value: explicitForm.value === 'qualified' ? 'qualified' : 'unqualified',
  };
}

function attributeFormMetadata(
  attribute: XsdLocalAttributeAst,
  state: BuildState,
): XsdLocalFormMetadata | undefined {
  if (attribute.ref) return undefined;
  if (attribute.form) {
    return {
      resolution: 'explicit',
      value: attribute.form.value,
    };
  }
  return {
    resolution: 'inherited',
    value:
      state.metadataByNodeId[schemaNodeId(state.options.sourceFileId)]
        ?.attributeFormDefault ?? 'unqualified',
  };
}

function localAttributeNamespace(
  attribute: XsdLocalAttributeAst,
  state: BuildState,
): string | undefined {
  const form = attributeFormMetadata(attribute, state);
  return form?.resolution !== 'explicitDeferred' && form?.value === 'qualified'
    ? state.targetNamespace
    : undefined;
}

function addLocalElement(
  element: XsdLocalElementAst,
  ownerNodeId: SchemaNodeId,
  state: BuildState,
  order: number,
): void {
  const nodeKind = element.ref ? 'elementReference' : 'localElement';
  const id = rangedNodeId(
    'localElement',
    state.options.sourceFileId,
    element.range,
  );
  const occurrence = cloneOccurrence(element.occurrence);
  if (
    !addNode(
      state,
      {
        id,
        kind: nodeKind,
        name:
          element.name ?? element.ref?.raw ?? `element@${element.sourceOrder}`,
        sourceFileId: state.options.sourceFileId,
        sourceOrder: element.sourceOrder,
        compactDeclaration: sourceSlice(
          state.sourceText,
          element.startTagRange,
        ),
        properties: semanticProperties([
          ['Role', element.ref ? 'Reference particle' : 'Local declaration'],
          ['QName', element.ref?.raw],
          ['Type', element.type?.raw],
          ['Occurs', `${occurrence.min}..${occurrence.max}`],
          ['Form', xmlAttributeValue(element.xml, 'form') ?? 'inherited'],
          ['Default', xmlAttributeValue(element.xml, 'default')],
          ['Fixed', xmlAttributeValue(element.xml, 'fixed')],
          ['Nillable', xmlBoolean(element.xml, 'nillable') ? 'true' : 'false'],
          ['Block', xmlAttributeValue(element.xml, 'block')],
        ]),
        searchTerms: [
          ...(element.ref ? [element.ref.raw, 'element reference'] : []),
          ...(element.type ? [element.type.raw] : []),
        ],
      },
      {
        ...baseMetadata(
          nodeKind,
          'local',
          state.options.sourceFileId,
          element.sourceOrder,
          element.range,
          element.startTagRange,
        ),
        occurrence,
        localForm: localFormMetadata(element, state),
        declarationRole: element.ref ? 'reference' : 'declaration',
        ownerNodeId,
        nillable: xmlBoolean(element.xml, 'nillable'),
        ...(xmlTokens(element.xml, 'block') === undefined
          ? {}
          : { block: xmlTokens(element.xml, 'block') }),
        ...(parseElementValueConstraint(element.xml) === undefined
          ? {}
          : { valueConstraint: parseElementValueConstraint(element.xml) }),
      },
      { description: 'a local element particle', range: element.range },
    )
  ) {
    return;
  }
  attachAnnotations(state, id, element.annotations);

  addEdge(
    state,
    {
      id: edgeId('contains', ownerNodeId, id, element.range, order),
      kind: 'contains',
      sourceNodeId: ownerNodeId,
      targetNodeId: id,
      order,
      occurrence,
    },
    element.range,
  );
  if (element.anonymousComplexType) {
    addAnonymousComplexType(element.anonymousComplexType, element, id, state);
  }
  if (element.anonymousSimpleType) {
    addAnonymousSimpleType(element.anonymousSimpleType, element, id, state);
  }
}

function addLocalAttribute(
  attribute: XsdLocalAttributeAst,
  ownerNodeId: SchemaNodeId,
  state: BuildState,
  order: number,
): void {
  const nodeKind = attribute.ref ? 'attributeReference' : 'attribute';
  const id = rangedNodeId(
    'attribute:local',
    state.options.sourceFileId,
    attribute.range,
  );
  const form = attributeFormMetadata(attribute, state);
  const targetNamespace = attribute.ref
    ? undefined
    : localAttributeNamespace(attribute, state);
  if (
    !addNode(
      state,
      {
        id,
        kind: nodeKind,
        name:
          attribute.name ??
          attribute.ref?.raw ??
          `attribute@${attribute.sourceOrder}`,
        sourceFileId: state.options.sourceFileId,
        sourceOrder: attribute.sourceOrder,
        compactDeclaration: sourceSlice(
          state.sourceText,
          attribute.startTagRange,
        ),
        properties: semanticProperties([
          ['Role', attribute.ref ? 'Attribute reference' : 'Local declaration'],
          ['QName', attribute.ref?.raw],
          ['Type', attribute.type?.raw],
          ['Use', attribute.use],
          ['Form', attribute.form?.value ?? 'inherited'],
          [
            'Default',
            attribute.valueConstraint?.kind === 'default'
              ? attribute.valueConstraint.value
              : undefined,
          ],
          [
            'Fixed',
            attribute.valueConstraint?.kind === 'fixed'
              ? attribute.valueConstraint.value
              : undefined,
          ],
        ]),
        searchTerms: [
          ...(attribute.ref ? [attribute.ref.raw, 'attribute reference'] : []),
          ...(attribute.type ? [attribute.type.raw] : []),
        ],
      },
      {
        ...baseMetadata(
          nodeKind,
          'local',
          state.options.sourceFileId,
          attribute.sourceOrder,
          attribute.range,
          attribute.startTagRange,
          targetNamespace,
        ),
        attributeUse: attribute.use,
        declarationRole: attribute.ref ? 'reference' : 'declaration',
        ownerNodeId,
        ...(form === undefined ? {} : { attributeForm: form }),
        ...(attribute.valueConstraint === undefined
          ? {}
          : {
              valueConstraint: cloneValueConstraint(attribute.valueConstraint),
            }),
        ...(!attribute.type && !attribute.anonymousSimpleType && !attribute.ref
          ? { implicitAttributeType: 'xs:anySimpleType' as const }
          : {}),
      },
      { description: 'a local attribute use', range: attribute.range },
    )
  ) {
    return;
  }
  attachAnnotations(state, id, attribute.annotations);

  addEdge(
    state,
    {
      id: edgeId('usesAttribute', ownerNodeId, id, attribute.range, order),
      kind: 'usesAttribute',
      sourceNodeId: ownerNodeId,
      targetNodeId: id,
      order,
    },
    attribute.range,
  );
  if (attribute.anonymousSimpleType) {
    addAnonymousSimpleType(attribute.anonymousSimpleType, attribute, id, state);
  }
}

function addLocalAttributes(
  attributes: readonly XsdLocalAttributeAst[],
  ownerNodeId: SchemaNodeId,
  state: BuildState,
): void {
  const firstByEffectiveName = new Map<
    string,
    {
      readonly attribute: XsdLocalAttributeAst;
      readonly range: SchemaSourceRange;
    }
  >();
  attributes.forEach((attribute, order) => {
    let key: string | undefined;
    if (attribute.name) {
      key = expandedName(
        localAttributeNamespace(attribute, state),
        attribute.name,
      );
    } else if (attribute.ref) {
      key = effectiveQName(attribute.ref, attribute.xml).key;
    }
    if (key) {
      const range =
        attribute.nameRange ?? attribute.ref?.range ?? attribute.range;
      const first = firstByEffectiveName.get(key);
      if (first) {
        state.diagnostics.push(
          diagnostic(
            'duplicate-attribute-use',
            `Attribute use "${attribute.name ?? attribute.ref?.raw ?? ''}" appears more than once in the same complex type.`,
            {
              sourceId: state.options.sourceFileId,
              range: cloneRange(range),
              relatedRange: cloneRange(first.range),
              nodeId: ownerNodeId,
            },
          ),
        );
      } else {
        firstByEffectiveName.set(key, { attribute, range });
      }
    }
    addLocalAttribute(attribute, ownerNodeId, state, order);
  });
}

function addGlobalDeclaration(
  declaration: XsdGlobalDeclarationAst,
  schemaId: SchemaNodeId,
  order: number,
  state: BuildState,
): void {
  if (!declaration.name) return;
  const nodeKind =
    declaration.kind === 'globalAttribute' ? 'attribute' : declaration.kind;
  const id = namedNodeId(
    nodeKind,
    state.options.sourceFileId,
    state.targetNamespace,
    declaration.name,
  );
  if (
    !addNode(
      state,
      {
        id,
        kind: nodeKind,
        name: declaration.name,
        sourceFileId: state.options.sourceFileId,
        sourceOrder: declaration.sourceOrder,
        compactDeclaration: sourceSlice(
          state.sourceText,
          declaration.startTagRange,
        ),
        properties: declarationProperties(declaration),
        searchTerms: declarationSearchTerms(declaration),
      },
      {
        ...baseMetadata(
          nodeKind,
          'global',
          state.options.sourceFileId,
          declaration.sourceOrder,
          declaration.range,
          declaration.startTagRange,
          state.targetNamespace,
        ),
        ...(declaration.kind === 'complexType' ||
        declaration.kind === 'simpleType'
          ? { anonymous: false }
          : {}),
        declarationRole: 'declaration',
        ...(declaration.kind === 'globalElement'
          ? {
              abstract: xmlBoolean(declaration.xml, 'abstract'),
              nillable: xmlBoolean(declaration.xml, 'nillable'),
              ...(xmlTokens(declaration.xml, 'block') === undefined
                ? {}
                : { block: xmlTokens(declaration.xml, 'block') }),
              ...(xmlTokens(declaration.xml, 'final') === undefined
                ? {}
                : { final: xmlTokens(declaration.xml, 'final') }),
              ...(parseElementValueConstraint(declaration.xml) === undefined
                ? {}
                : {
                    valueConstraint: parseElementValueConstraint(
                      declaration.xml,
                    ),
                  }),
            }
          : {}),
        ...(declaration.kind === 'complexType'
          ? {
              contentKind: complexContentKind(declaration),
              mixed: xmlBoolean(declaration.xml, 'mixed'),
              abstract: xmlBoolean(declaration.xml, 'abstract'),
              ...(xmlTokens(declaration.xml, 'block') === undefined
                ? {}
                : { block: xmlTokens(declaration.xml, 'block') }),
              ...(xmlTokens(declaration.xml, 'final') === undefined
                ? {}
                : { final: xmlTokens(declaration.xml, 'final') }),
            }
          : {}),
        ...(declaration.kind === 'simpleType'
          ? {
              simpleTypeVariety: declaration.restriction
                ? ('restriction' as const)
                : (xsdChildElements(declaration.xml).find(
                    ({ localName }) =>
                      localName === 'list' || localName === 'union',
                  )?.localName as 'list' | 'union' | undefined),
            }
          : {}),
        ...(declaration.kind === 'globalAttribute'
          ? {
              ...(declaration.valueConstraint === undefined
                ? {}
                : {
                    valueConstraint: cloneValueConstraint(
                      declaration.valueConstraint,
                    ),
                  }),
              ...(!declaration.type && !declaration.anonymousSimpleType
                ? { implicitAttributeType: 'xs:anySimpleType' as const }
                : {}),
            }
          : {}),
      },
      {
        description: `global ${declaration.kind} "${declaration.name}"`,
        range: declaration.range,
      },
    )
  ) {
    return;
  }
  attachAnnotations(state, id, declaration.annotations);
  if (declaration.kind !== 'globalAttribute') {
    addEdge(
      state,
      {
        id: edgeId('contains', schemaId, id, declaration.range, order),
        kind: 'contains',
        sourceNodeId: schemaId,
        targetNodeId: id,
        order,
      },
      declaration.range,
    );
  }

  if (declaration.kind === 'complexType') {
    if (declaration.compositor) {
      addCompositor(declaration.compositor, id, state, 0);
    }
    addLocalAttributes(declaration.attributes, id, state);
    addComplexTypeDerivation(declaration, id, state);
  } else if (declaration.kind === 'simpleType') {
    addSimpleTypeRestriction(declaration, id, state);
  } else if (declaration.kind === 'globalElement') {
    if (declaration.anonymousComplexType) {
      addAnonymousComplexType(
        declaration.anonymousComplexType,
        declaration,
        id,
        state,
      );
    }
    if (declaration.anonymousSimpleType) {
      addAnonymousSimpleType(
        declaration.anonymousSimpleType,
        declaration,
        id,
        state,
      );
    }
  } else if (
    declaration.kind === 'globalAttribute' &&
    declaration.anonymousSimpleType
  ) {
    addAnonymousSimpleType(
      declaration.anonymousSimpleType,
      declaration,
      id,
      state,
    );
  }
}

function effectiveQName(
  qname: XsdQNameAst,
  ownerXml: XsdXmlElementAst,
): {
  readonly namespaceUri?: string;
  readonly key: string;
} {
  const namespaceUri = qname.prefix
    ? qname.namespaceUri
    : ownerXml.namespaceBindings[''];
  return {
    ...(namespaceUri === undefined ? {} : { namespaceUri }),
    key: expandedName(namespaceUri, qname.localName),
  };
}

function normalizedReference(
  kind: XsdNormalizedReference['kind'],
  qname: XsdQNameAst,
  namespaceUri: string | undefined,
  resolution: XsdNormalizedReference['resolution'],
  targetNodeId?: SchemaNodeId,
): XsdNormalizedReference {
  return {
    kind,
    raw: qname.raw,
    ...(qname.prefix === undefined ? {} : { prefix: qname.prefix }),
    localName: qname.localName,
    ...(namespaceUri === undefined ? {} : { namespaceUri }),
    range: cloneRange(qname.range),
    resolution,
    ...(targetNodeId === undefined ? {} : { targetNodeId }),
  };
}

function defersMissingReferences(state: BuildState): boolean {
  return state.options.unresolvedReferencePolicy === 'deferForPackage';
}

function resolveTypeReference(
  qname: XsdQNameAst,
  ownerXml: XsdXmlElementAst,
  ownerNodeId: SchemaNodeId,
  state: BuildState,
  simpleTypeOnly = false,
): void {
  const effective = effectiveQName(qname, ownerXml);
  let reference: XsdNormalizedReference;
  if (effective.namespaceUri === xmlSchemaNamespaceUri) {
    reference = normalizedReference(
      'type',
      qname,
      effective.namespaceUri,
      'xsdBuiltIn',
    );
  } else if (effective.namespaceUri === state.targetNamespace) {
    const targetNodeId = state.typeNodeIdsByExpandedName.get(effective.key);
    if (!targetNodeId) {
      if (!defersMissingReferences(state)) {
        state.diagnostics.push(
          diagnostic(
            'unresolved-type-reference',
            `Type reference "${qname.raw}" does not resolve in this XSD document.`,
            {
              sourceId: state.options.sourceFileId,
              range: cloneRange(qname.range),
              nodeId: ownerNodeId,
              reference: qname.raw,
            },
          ),
        );
        return;
      }
      reference = normalizedReference(
        'type',
        qname,
        effective.namespaceUri,
        'externalDeferred',
      );
      state.diagnostics.push(
        diagnostic(
          'external-type-reference-deferred',
          `External type reference "${qname.raw}" is deferred.`,
          {
            sourceId: state.options.sourceFileId,
            range: cloneRange(qname.range),
            nodeId: ownerNodeId,
            reference: qname.raw,
          },
        ),
      );
    } else {
      if (
        simpleTypeOnly &&
        state.typeKindsByExpandedName.get(effective.key) !== 'simpleType'
      ) {
        state.diagnostics.push(
          diagnostic(
            'invalid-attribute-type-target',
            `Attribute type "${qname.raw}" resolves to a complex type; attributes require a simple type.`,
            {
              sourceId: state.options.sourceFileId,
              range: cloneRange(qname.range),
              nodeId: ownerNodeId,
              reference: qname.raw,
            },
          ),
        );
        return;
      }
      reference = normalizedReference(
        'type',
        qname,
        effective.namespaceUri,
        'resolved',
        targetNodeId,
      );
      addEdge(
        state,
        {
          id: edgeId('typeOf', ownerNodeId, targetNodeId, qname.range),
          kind: 'typeOf',
          sourceNodeId: ownerNodeId,
          targetNodeId,
        },
        qname.range,
      );
    }
  } else {
    reference = normalizedReference(
      'type',
      qname,
      effective.namespaceUri,
      'externalDeferred',
    );
    state.diagnostics.push(
      diagnostic(
        'external-type-reference-deferred',
        `External type reference "${qname.raw}" is deferred.`,
        {
          sourceId: state.options.sourceFileId,
          range: cloneRange(qname.range),
          nodeId: ownerNodeId,
          reference: qname.raw,
        },
      ),
    );
  }
  const metadata = state.metadataByNodeId[ownerNodeId];
  if (metadata) {
    state.metadataByNodeId[ownerNodeId] = {
      ...metadata,
      typeReference: reference,
    };
  }
}

function resolveRestrictionBase(
  restriction: XsdSimpleTypeRestrictionAst,
  restrictionNodeId: SchemaNodeId,
  state: BuildState,
): void {
  const qname = restriction.base;
  if (!qname) return;
  const effective = effectiveQName(qname, restriction.xml);
  let reference: XsdNormalizedReference;
  if (effective.namespaceUri === xmlSchemaNamespaceUri) {
    reference = normalizedReference(
      'restrictionBase',
      qname,
      effective.namespaceUri,
      'xsdBuiltIn',
    );
  } else if (effective.namespaceUri === state.targetNamespace) {
    const targetNodeId = state.typeNodeIdsByExpandedName.get(effective.key);
    if (!targetNodeId) {
      if (!defersMissingReferences(state)) {
        state.diagnostics.push(
          diagnostic(
            'unresolved-restriction-base',
            `Restriction base "${qname.raw}" does not resolve in this XSD document.`,
            {
              sourceId: state.options.sourceFileId,
              range: cloneRange(qname.range),
              nodeId: restrictionNodeId,
              reference: qname.raw,
            },
          ),
        );
        return;
      }
      reference = normalizedReference(
        'restrictionBase',
        qname,
        effective.namespaceUri,
        'externalDeferred',
      );
      state.diagnostics.push(
        diagnostic(
          'external-restriction-base-deferred',
          `External restriction base "${qname.raw}" is deferred.`,
          {
            sourceId: state.options.sourceFileId,
            range: cloneRange(qname.range),
            nodeId: restrictionNodeId,
            reference: qname.raw,
          },
        ),
      );
    } else {
      if (state.typeKindsByExpandedName.get(effective.key) !== 'simpleType') {
        state.diagnostics.push(
          diagnostic(
            'invalid-restriction-base-target',
            `Restriction base "${qname.raw}" resolves to a complex type; simple type restrictions require a simple base type.`,
            {
              sourceId: state.options.sourceFileId,
              range: cloneRange(qname.range),
              nodeId: restrictionNodeId,
              reference: qname.raw,
            },
          ),
        );
        return;
      }
      reference = normalizedReference(
        'restrictionBase',
        qname,
        effective.namespaceUri,
        'resolved',
        targetNodeId,
      );
      addEdge(
        state,
        {
          id: edgeId('restricts', restrictionNodeId, targetNodeId, qname.range),
          kind: 'restricts',
          sourceNodeId: restrictionNodeId,
          targetNodeId,
        },
        qname.range,
      );
    }
  } else {
    reference = normalizedReference(
      'restrictionBase',
      qname,
      effective.namespaceUri,
      'externalDeferred',
    );
    state.diagnostics.push(
      diagnostic(
        'external-restriction-base-deferred',
        `External restriction base "${qname.raw}" is deferred.`,
        {
          sourceId: state.options.sourceFileId,
          range: cloneRange(qname.range),
          nodeId: restrictionNodeId,
          reference: qname.raw,
        },
      ),
    );
  }
  const metadata = state.metadataByNodeId[restrictionNodeId];
  if (metadata) {
    state.metadataByNodeId[restrictionNodeId] = {
      ...metadata,
      restrictionBaseReference: reference,
    };
  }
}

function resolveComplexTypeBase(
  derivation: XsdComplexTypeDerivationAst,
  derivationNodeId: SchemaNodeId,
  complexTypeNodeId: SchemaNodeId,
  state: BuildState,
): void {
  const qname = derivation.base;
  if (!qname) return;
  const effective = effectiveQName(qname, derivation.xml);
  let reference: XsdNormalizedReference;
  if (effective.namespaceUri === xmlSchemaNamespaceUri) {
    reference = normalizedReference(
      'complexTypeBase',
      qname,
      effective.namespaceUri,
      'xsdBuiltIn',
    );
  } else if (effective.namespaceUri === state.targetNamespace) {
    const targetNodeId = state.typeNodeIdsByExpandedName.get(effective.key);
    if (!targetNodeId) {
      if (!defersMissingReferences(state)) {
        state.diagnostics.push(
          diagnostic(
            'unresolved-complex-type-base',
            `Complex type base "${qname.raw}" does not resolve in this XSD document.`,
            {
              sourceId: state.options.sourceFileId,
              range: cloneRange(qname.range),
              nodeId: derivationNodeId,
              reference: qname.raw,
            },
          ),
        );
        return;
      }
      reference = normalizedReference(
        'complexTypeBase',
        qname,
        effective.namespaceUri,
        'externalDeferred',
      );
      state.diagnostics.push(
        diagnostic(
          'external-complex-type-base-deferred',
          `External complex type base "${qname.raw}" is deferred.`,
          {
            sourceId: state.options.sourceFileId,
            range: cloneRange(qname.range),
            nodeId: derivationNodeId,
            reference: qname.raw,
          },
        ),
      );
    } else {
      if (state.typeKindsByExpandedName.get(effective.key) !== 'complexType') {
        state.diagnostics.push(
          diagnostic(
            'invalid-complex-type-base-target',
            `Complex type base "${qname.raw}" resolves to a simple type; complex derivations require a complex base type.`,
            {
              sourceId: state.options.sourceFileId,
              range: cloneRange(qname.range),
              nodeId: derivationNodeId,
              reference: qname.raw,
            },
          ),
        );
        return;
      }
      reference = normalizedReference(
        'complexTypeBase',
        qname,
        effective.namespaceUri,
        'resolved',
        targetNodeId,
      );
      addEdge(
        state,
        {
          id: edgeId(
            derivation.kind === 'extension' ? 'extends' : 'restricts',
            derivationNodeId,
            targetNodeId,
            qname.range,
          ),
          kind: derivation.kind === 'extension' ? 'extends' : 'restricts',
          sourceNodeId: derivationNodeId,
          targetNodeId,
        },
        qname.range,
      );
    }
  } else {
    reference = normalizedReference(
      'complexTypeBase',
      qname,
      effective.namespaceUri,
      'externalDeferred',
    );
    state.diagnostics.push(
      diagnostic(
        'external-complex-type-base-deferred',
        `External complex type base "${qname.raw}" is deferred.`,
        {
          sourceId: state.options.sourceFileId,
          range: cloneRange(qname.range),
          nodeId: derivationNodeId,
          reference: qname.raw,
        },
      ),
    );
  }

  for (const nodeId of [derivationNodeId, complexTypeNodeId]) {
    const metadata = state.metadataByNodeId[nodeId];
    if (!metadata?.complexTypeDerivation) continue;
    state.metadataByNodeId[nodeId] = {
      ...metadata,
      complexTypeDerivation: {
        ...metadata.complexTypeDerivation,
        baseReference: {
          ...reference,
          range: cloneRange(reference.range),
        },
        sourceRange: cloneRange(metadata.complexTypeDerivation.sourceRange),
        startTagRange: cloneRange(metadata.complexTypeDerivation.startTagRange),
      },
    };
  }
}

function resolveReferencesInSimpleType(
  type: XsdSimpleTypeAst,
  simpleTypeNodeId: SchemaNodeId,
  state: BuildState,
): void {
  if (!type.restriction) return;
  const restrictionNodeId = rangedNodeId(
    'restriction',
    state.options.sourceFileId,
    type.restriction.range,
  );
  resolveRestrictionBase(type.restriction, restrictionNodeId, state);
  const restrictionMetadata = state.metadataByNodeId[restrictionNodeId];
  const simpleTypeMetadata = state.metadataByNodeId[simpleTypeNodeId];
  if (restrictionMetadata && simpleTypeMetadata) {
    state.metadataByNodeId[simpleTypeNodeId] = {
      ...simpleTypeMetadata,
      ...(restrictionMetadata.restrictionBaseReference === undefined
        ? {}
        : {
            restrictionBaseReference: {
              ...restrictionMetadata.restrictionBaseReference,
              range: cloneRange(
                restrictionMetadata.restrictionBaseReference.range,
              ),
            },
          }),
      enumerationValues: (restrictionMetadata.enumerationValues ?? []).map(
        (value) => ({
          ...value,
          valueRange: cloneRange(value.valueRange),
          sourceRange: cloneRange(value.sourceRange),
        }),
      ),
      enumerationCount: restrictionMetadata.enumerationCount ?? 0,
    };
  }
}

function resolveAttributeReference(
  qname: XsdQNameAst,
  ownerXml: XsdXmlElementAst,
  ownerNodeId: SchemaNodeId,
  state: BuildState,
): void {
  const effective = effectiveQName(qname, ownerXml);
  let reference: XsdNormalizedReference;
  if (effective.namespaceUri === state.targetNamespace) {
    const targetNodeId = state.attributeNodeIdsByExpandedName.get(
      effective.key,
    );
    if (!targetNodeId) {
      if (!defersMissingReferences(state)) {
        state.diagnostics.push(
          diagnostic(
            'unresolved-attribute-reference',
            `Attribute reference "${qname.raw}" does not resolve in this XSD document.`,
            {
              sourceId: state.options.sourceFileId,
              range: cloneRange(qname.range),
              nodeId: ownerNodeId,
              reference: qname.raw,
            },
          ),
        );
        return;
      }
      reference = normalizedReference(
        'attribute',
        qname,
        effective.namespaceUri,
        'externalDeferred',
      );
      state.diagnostics.push(
        diagnostic(
          'external-attribute-reference-deferred',
          `External attribute reference "${qname.raw}" is deferred.`,
          {
            sourceId: state.options.sourceFileId,
            range: cloneRange(qname.range),
            nodeId: ownerNodeId,
            reference: qname.raw,
          },
        ),
      );
    } else {
      reference = normalizedReference(
        'attribute',
        qname,
        effective.namespaceUri,
        'resolved',
        targetNodeId,
      );
      addEdge(
        state,
        {
          id: edgeId('references', ownerNodeId, targetNodeId, qname.range),
          kind: 'references',
          sourceNodeId: ownerNodeId,
          targetNodeId,
        },
        qname.range,
      );
    }
  } else {
    reference = normalizedReference(
      'attribute',
      qname,
      effective.namespaceUri,
      'externalDeferred',
    );
    state.diagnostics.push(
      diagnostic(
        'external-attribute-reference-deferred',
        `External attribute reference "${qname.raw}" is deferred.`,
        {
          sourceId: state.options.sourceFileId,
          range: cloneRange(qname.range),
          nodeId: ownerNodeId,
          reference: qname.raw,
        },
      ),
    );
  }
  const metadata = state.metadataByNodeId[ownerNodeId];
  if (metadata) {
    state.metadataByNodeId[ownerNodeId] = {
      ...metadata,
      ...(reference.namespaceUri === undefined
        ? {}
        : { targetNamespace: reference.namespaceUri }),
      attributeReference: reference,
    };
  }
}

function resolveReferencesInAttribute(
  attribute: XsdGlobalAttributeAst | XsdLocalAttributeAst,
  nodeId: SchemaNodeId,
  state: BuildState,
): void {
  if (attribute.type) {
    resolveTypeReference(attribute.type, attribute.xml, nodeId, state, true);
  }
  if (attribute.kind === 'localAttribute' && attribute.ref) {
    resolveAttributeReference(attribute.ref, attribute.xml, nodeId, state);
  }
  if (attribute.anonymousSimpleType) {
    resolveReferencesInSimpleType(
      attribute.anonymousSimpleType,
      rangedNodeId(
        'simpleType:anonymous',
        state.options.sourceFileId,
        attribute.anonymousSimpleType.range,
      ),
      state,
    );
  }
}

function resolveReferencesInComplexType(
  type: XsdComplexTypeAst,
  complexTypeNodeId: SchemaNodeId,
  state: BuildState,
): void {
  for (const attribute of type.attributes) {
    resolveReferencesInAttribute(
      attribute,
      rangedNodeId(
        'attribute:local',
        state.options.sourceFileId,
        attribute.range,
      ),
      state,
    );
  }
  if (type.compositor) resolveReferencesInCompositor(type.compositor, state);
  const derivation = type.complexContent?.derivation;
  if (derivation) {
    const derivationNodeId = rangedNodeId(
      derivation.kind,
      state.options.sourceFileId,
      derivation.range,
    );
    resolveComplexTypeBase(
      derivation,
      derivationNodeId,
      complexTypeNodeId,
      state,
    );
    for (const attribute of derivation.attributes) {
      resolveReferencesInAttribute(
        attribute,
        rangedNodeId(
          'attribute:local',
          state.options.sourceFileId,
          attribute.range,
        ),
        state,
      );
    }
    if (derivation.compositor) {
      resolveReferencesInCompositor(derivation.compositor, state);
    }
  }
}

function resolveElementReference(
  qname: XsdQNameAst,
  ownerXml: XsdXmlElementAst,
  ownerNodeId: SchemaNodeId,
  state: BuildState,
): void {
  const effective = effectiveQName(qname, ownerXml);
  let reference: XsdNormalizedReference;
  if (effective.namespaceUri === state.targetNamespace) {
    const targetNodeId = state.elementNodeIdsByExpandedName.get(effective.key);
    if (!targetNodeId) {
      if (!defersMissingReferences(state)) {
        state.diagnostics.push(
          diagnostic(
            'unresolved-element-reference',
            `Element reference "${qname.raw}" does not resolve in this XSD document.`,
            {
              sourceId: state.options.sourceFileId,
              range: cloneRange(qname.range),
              nodeId: ownerNodeId,
              reference: qname.raw,
            },
          ),
        );
        return;
      }
      reference = normalizedReference(
        'element',
        qname,
        effective.namespaceUri,
        'externalDeferred',
      );
      state.diagnostics.push(
        diagnostic(
          'external-element-reference-deferred',
          `External element reference "${qname.raw}" is deferred.`,
          {
            sourceId: state.options.sourceFileId,
            range: cloneRange(qname.range),
            nodeId: ownerNodeId,
            reference: qname.raw,
          },
        ),
      );
    } else {
      reference = normalizedReference(
        'element',
        qname,
        effective.namespaceUri,
        'resolved',
        targetNodeId,
      );
      addEdge(
        state,
        {
          id: edgeId('references', ownerNodeId, targetNodeId, qname.range),
          kind: 'references',
          sourceNodeId: ownerNodeId,
          targetNodeId,
        },
        qname.range,
      );
    }
  } else {
    reference = normalizedReference(
      'element',
      qname,
      effective.namespaceUri,
      'externalDeferred',
    );
    state.diagnostics.push(
      diagnostic(
        'external-element-reference-deferred',
        `External element reference "${qname.raw}" is deferred.`,
        {
          sourceId: state.options.sourceFileId,
          range: cloneRange(qname.range),
          nodeId: ownerNodeId,
          reference: qname.raw,
        },
      ),
    );
  }
  const metadata = state.metadataByNodeId[ownerNodeId];
  if (metadata) {
    state.metadataByNodeId[ownerNodeId] = {
      ...metadata,
      elementReference: reference,
    };
  }
}

function resolveReferencesInElement(
  element: XsdGlobalElementAst | XsdLocalElementAst,
  nodeId: SchemaNodeId,
  state: BuildState,
): void {
  if (element.type) {
    resolveTypeReference(element.type, element.xml, nodeId, state);
  }
  if (element.kind === 'localElement' && element.ref) {
    resolveElementReference(element.ref, element.xml, nodeId, state);
  }
  if (element.anonymousSimpleType) {
    resolveReferencesInSimpleType(
      element.anonymousSimpleType,
      rangedNodeId(
        'simpleType:anonymous',
        state.options.sourceFileId,
        element.anonymousSimpleType.range,
      ),
      state,
    );
  }
}

function resolveReferencesInCompositor(
  compositor: XsdCompositorAst,
  state: BuildState,
): void {
  for (const member of compositor.members) {
    if (member.kind === 'localElement') {
      const id = rangedNodeId(
        'localElement',
        state.options.sourceFileId,
        member.range,
      );
      resolveReferencesInElement(member, id, state);
      if (member.anonymousComplexType) {
        resolveReferencesInComplexType(
          member.anonymousComplexType,
          rangedNodeId(
            'complexType:anonymous',
            state.options.sourceFileId,
            member.anonymousComplexType.range,
          ),
          state,
        );
      }
    } else {
      resolveReferencesInCompositor(member, state);
    }
  }
}

function resolveAllReferences(
  declarations: readonly XsdGlobalDeclarationAst[],
  state: BuildState,
): void {
  for (const declaration of declarations) {
    if (declaration.kind === 'globalElement') {
      const id = namedNodeId(
        'globalElement',
        state.options.sourceFileId,
        state.targetNamespace,
        declaration.name ?? '',
      );
      resolveReferencesInElement(declaration, id, state);
      if (declaration.anonymousComplexType) {
        resolveReferencesInComplexType(
          declaration.anonymousComplexType,
          rangedNodeId(
            'complexType:anonymous',
            state.options.sourceFileId,
            declaration.anonymousComplexType.range,
          ),
          state,
        );
      }
    } else if (declaration.kind === 'complexType') {
      resolveReferencesInComplexType(
        declaration,
        namedNodeId(
          'complexType',
          state.options.sourceFileId,
          state.targetNamespace,
          declaration.name ?? '',
        ),
        state,
      );
    } else if (declaration.kind === 'simpleType') {
      resolveReferencesInSimpleType(
        declaration,
        namedNodeId(
          'simpleType',
          state.options.sourceFileId,
          state.targetNamespace,
          declaration.name ?? '',
        ),
        state,
      );
    } else if (declaration.kind === 'globalAttribute') {
      resolveReferencesInAttribute(
        declaration,
        namedNodeId(
          'attribute',
          state.options.sourceFileId,
          state.targetNamespace,
          declaration.name ?? '',
        ),
        state,
      );
    }
  }
}

function addStructuralEdge(
  state: BuildState,
  kind: SchemaEdge['kind'],
  sourceNodeId: SchemaNodeId,
  targetNodeId: SchemaNodeId,
  range: SchemaSourceRange,
  order?: number,
  occurrence?: SchemaOccurrence,
): void {
  if (
    state.edges.some(
      (edge) =>
        edge.kind === kind &&
        edge.sourceNodeId === sourceNodeId &&
        edge.targetNodeId === targetNodeId,
    )
  ) {
    return;
  }
  addEdge(
    state,
    {
      id: edgeId(kind, sourceNodeId, targetNodeId, range, order),
      kind,
      sourceNodeId,
      targetNodeId,
      ...(order === undefined ? {} : { order }),
      ...(occurrence === undefined ? {} : { occurrence }),
    },
    range,
  );
}

function mergeNodeProperties(
  node: SchemaNode,
  properties: SchemaNode['properties'],
  searchTerms: readonly string[] = [],
): SchemaNode {
  const mergedProperties = [...(node.properties ?? [])];
  const propertyKeys = new Set(
    mergedProperties.map(({ label, value }) => `${label}\u0000${value}`),
  );
  for (const property of properties ?? []) {
    const key = `${property.label}\u0000${property.value}`;
    if (!propertyKeys.has(key)) {
      propertyKeys.add(key);
      mergedProperties.push(property);
    }
  }
  const mergedSearchTerms = [...(node.searchTerms ?? [])];
  const termKeys = new Set(mergedSearchTerms);
  for (const term of searchTerms) {
    if (!termKeys.has(term)) {
      termKeys.add(term);
      mergedSearchTerms.push(term);
    }
  }
  return {
    ...node,
    ...(mergedProperties.length === 0 ? {} : { properties: mergedProperties }),
    ...(mergedSearchTerms.length === 0
      ? {}
      : { searchTerms: mergedSearchTerms }),
  };
}

function structuralOccurrence(element: XsdXmlElementAst): SchemaOccurrence {
  const minValue = xmlAttributeValue(element, 'minOccurs');
  const maxValue = xmlAttributeValue(element, 'maxOccurs');
  return {
    min: minValue === undefined ? 1 : Number(minValue),
    max:
      maxValue === undefined
        ? 1
        : maxValue === 'unbounded'
          ? 'unbounded'
          : Number(maxValue),
  };
}

function normalizedXmlReference(
  kind: XsdNormalizedReference['kind'],
  element: XsdXmlElementAst,
  attributeName: string,
  state: BuildState,
): XsdNormalizedReference | undefined {
  const valueAttribute = unqualifiedXmlAttribute(element, attributeName);
  if (!valueAttribute) return undefined;
  const raw = valueAttribute.value;
  const colon = raw.indexOf(':');
  const prefix = colon < 0 ? undefined : raw.slice(0, colon);
  const localName = colon < 0 ? raw : raw.slice(colon + 1);
  const namespaceUri = prefix
    ? element.namespaceBindings[prefix]
    : element.namespaceBindings[''];
  const key = expandedName(namespaceUri, localName);
  const targetNodeId =
    kind === 'group'
      ? state.groupNodeIdsByExpandedName.get(key)
      : kind === 'attributeGroup'
        ? state.attributeGroupNodeIdsByExpandedName.get(key)
        : kind === 'element'
          ? state.elementNodeIdsByExpandedName.get(key)
          : kind === 'attribute'
            ? state.attributeNodeIdsByExpandedName.get(key)
            : state.typeNodeIdsByExpandedName.get(key);
  return {
    kind,
    raw: valueAttribute.rawValue,
    ...(prefix === undefined ? {} : { prefix }),
    localName,
    ...(namespaceUri === undefined ? {} : { namespaceUri }),
    range: cloneRange(valueAttribute.valueContentRange),
    resolution:
      namespaceUri === xmlSchemaNamespaceUri
        ? 'xsdBuiltIn'
        : targetNodeId
          ? 'resolved'
          : 'externalDeferred',
    ...(targetNodeId === undefined ? {} : { targetNodeId }),
  };
}

function structuralRelationshipKind(
  owner: XsdNodeMetadata | undefined,
  childKind: SchemaNode['kind'],
  childScope: XsdNodeMetadata['scope'],
): SchemaEdge['kind'] {
  if (owner?.scope === 'schema' && childScope === 'global') {
    return 'sourceDocumentOwns';
  }
  if (childScope === 'anonymous') return 'ownsAnonymousType';
  if (childKind === 'simpleContent' || childKind === 'complexContent') {
    return 'ownsContent';
  }
  if (childKind === 'elementWildcard' || childKind === 'attributeWildcard') {
    return 'wildcardMember';
  }
  if (
    childKind === 'sequence' ||
    childKind === 'choice' ||
    childKind === 'all' ||
    childKind === 'localElement' ||
    childKind === 'elementReference' ||
    childKind === 'groupReference'
  ) {
    return 'particleMember';
  }
  return 'ownsComponent';
}

function structuralNodeProperties(
  element: XsdXmlElementAst,
  kind: SchemaNode['kind'],
  ownerName: string,
): SchemaNode['properties'] {
  const occurrence =
    kind === 'sequence' ||
    kind === 'choice' ||
    kind === 'all' ||
    kind === 'localElement' ||
    kind === 'elementReference' ||
    kind === 'groupReference' ||
    kind === 'elementWildcard'
      ? structuralOccurrence(element)
      : undefined;
  return semanticProperties([
    ['Owner', ownerName],
    ['Role', kind.endsWith('Reference') ? 'Reference' : undefined],
    ['QName', xmlAttributeValue(element, 'ref')],
    ['Type', xmlAttributeValue(element, 'type')],
    ['Base', xmlAttributeValue(element, 'base')],
    ['Occurs', occurrence ? `${occurrence.min}..${occurrence.max}` : undefined],
    ['Use', xmlAttributeValue(element, 'use')],
    ['Form', xmlAttributeValue(element, 'form')],
    [
      'Namespace constraint',
      xmlAttributeValue(element, 'namespace') ??
        (kind === 'elementWildcard' || kind === 'attributeWildcard'
          ? '##any'
          : undefined),
    ],
    [
      'Process contents',
      xmlAttributeValue(element, 'processContents') ??
        (kind === 'elementWildcard' || kind === 'attributeWildcard'
          ? 'strict'
          : undefined),
    ],
    ['Mixed', xmlAttributeValue(element, 'mixed')],
    ['Abstract', xmlAttributeValue(element, 'abstract')],
    ['Nillable', xmlAttributeValue(element, 'nillable')],
    ['Block', xmlAttributeValue(element, 'block')],
    ['Final', xmlAttributeValue(element, 'final')],
    ['Default', xmlAttributeValue(element, 'default')],
    ['Fixed', xmlAttributeValue(element, 'fixed')],
  ]);
}

function addTask1312Structure(
  schema: XsdSchemaAst,
  schemaId: SchemaNodeId,
  state: BuildState,
): void {
  const nodeIdByStartOffset = new Map<number, SchemaNodeId>();
  for (const [nodeId, metadata] of Object.entries(state.metadataByNodeId)) {
    nodeIdByStartOffset.set(metadata.sourceRange.start.offset, nodeId);
  }

  for (const child of xsdChildElements(schema.xml)) {
    const name = xmlAttributeValue(child, 'name');
    if (!name) continue;
    const key = expandedName(state.targetNamespace, name);
    if (child.localName === 'group') {
      state.groupNodeIdsByExpandedName.set(
        key,
        namedNodeId(
          'group',
          state.options.sourceFileId,
          state.targetNamespace,
          name,
        ),
      );
    } else if (child.localName === 'attributeGroup') {
      state.attributeGroupNodeIdsByExpandedName.set(
        key,
        namedNodeId(
          'attributeGroup',
          state.options.sourceFileId,
          state.targetNamespace,
          name,
        ),
      );
    }
  }

  function ownerName(ownerNodeId: SchemaNodeId): string {
    return state.nodes.find(({ id }) => id === ownerNodeId)?.name ?? 'schema';
  }

  function connect(
    ownerNodeId: SchemaNodeId,
    childNodeId: SchemaNodeId,
    childKind: SchemaNode['kind'],
    childScope: XsdNodeMetadata['scope'],
    element: XsdXmlElementAst,
  ): void {
    const occurrence =
      childKind === 'sequence' ||
      childKind === 'choice' ||
      childKind === 'all' ||
      childKind === 'localElement' ||
      childKind === 'elementReference' ||
      childKind === 'groupReference' ||
      childKind === 'elementWildcard'
        ? structuralOccurrence(element)
        : undefined;
    addStructuralEdge(
      state,
      structuralRelationshipKind(
        state.metadataByNodeId[ownerNodeId],
        childKind,
        childScope,
      ),
      ownerNodeId,
      childNodeId,
      element.range,
      element.sourceOrder,
      occurrence,
    );
  }

  function addGenericNode(
    element: XsdXmlElementAst,
    ownerNodeId: SchemaNodeId,
    kind: SchemaNode['kind'],
    scope: XsdNodeMetadata['scope'],
    name: string,
    metadataDetails: Partial<XsdNodeMetadata> = {},
    searchTerms: readonly string[] = [],
    explicitId?: SchemaNodeId,
  ): SchemaNodeId {
    const id =
      explicitId ??
      rangedNodeId(
        kind as Parameters<typeof rangedNodeId>[0],
        state.options.sourceFileId,
        element.range,
      );
    if (
      addNode(
        state,
        {
          id,
          kind,
          name,
          sourceFileId: state.options.sourceFileId,
          sourceOrder: element.sourceOrder,
          compactDeclaration: sourceSlice(
            state.sourceText,
            element.startTagRange,
          ),
          properties: structuralNodeProperties(
            element,
            kind,
            ownerName(ownerNodeId),
          ),
          ...(searchTerms.length === 0 ? {} : { searchTerms }),
        },
        {
          ...baseMetadata(
            kind,
            scope,
            state.options.sourceFileId,
            element.sourceOrder,
            element.range,
            element.startTagRange,
            scope === 'global' ? state.targetNamespace : undefined,
          ),
          ownerNodeId,
          ...metadataDetails,
        },
        { description: `an XSD ${kind}`, range: element.range },
      )
    ) {
      nodeIdByStartOffset.set(element.range.start.offset, id);
      connect(ownerNodeId, id, kind, scope, element);
    }
    return id;
  }

  function patchExisting(
    nodeId: SchemaNodeId,
    element: XsdXmlElementAst,
    ownerNodeId: SchemaNodeId,
  ): void {
    const nodeIndex = state.nodes.findIndex(({ id }) => id === nodeId);
    if (nodeIndex < 0) return;
    const node = state.nodes[nodeIndex]!;
    state.nodes[nodeIndex] = mergeNodeProperties(
      node,
      structuralNodeProperties(element, node.kind, ownerName(ownerNodeId)),
      [
        xmlAttributeValue(element, 'ref'),
        xmlAttributeValue(element, 'type'),
        xmlAttributeValue(element, 'base'),
      ].filter((value): value is string => value !== undefined),
    );
    const metadata = state.metadataByNodeId[nodeId];
    if (!metadata) return;
    state.metadataByNodeId[nodeId] = {
      ...metadata,
      ...(metadata.scope === 'schema' ? {} : { ownerNodeId }),
      ...(element.localName === 'element'
        ? {
            declarationRole: xmlAttributeValue(element, 'ref')
              ? ('reference' as const)
              : ('declaration' as const),
            nillable: xmlBoolean(element, 'nillable'),
            abstract: xmlBoolean(element, 'abstract'),
            ...(normalizedXmlReference(
              'substitutionGroup',
              element,
              'substitutionGroup',
              state,
            ) === undefined
              ? {}
              : {
                  substitutionGroupReference: normalizedXmlReference(
                    'substitutionGroup',
                    element,
                    'substitutionGroup',
                    state,
                  ),
                }),
          }
        : {}),
      ...(element.localName === 'attribute'
        ? {
            declarationRole: xmlAttributeValue(element, 'ref')
              ? ('reference' as const)
              : ('declaration' as const),
          }
        : {}),
      ...(xmlTokens(element, 'block') === undefined
        ? {}
        : { block: xmlTokens(element, 'block') }),
      ...(xmlTokens(element, 'final') === undefined
        ? {}
        : { final: xmlTokens(element, 'final') }),
    };
    if (
      nodeId !== schemaId &&
      state.metadataByNodeId[ownerNodeId]?.scope === 'schema' &&
      metadata.scope === 'global' &&
      !state.edges.some(
        ({ sourceNodeId, targetNodeId }) =>
          sourceNodeId === ownerNodeId && targetNodeId === nodeId,
      )
    ) {
      connect(ownerNodeId, nodeId, node.kind, metadata.scope, element);
    }
  }

  function visit(element: XsdXmlElementAst, ownerNodeId: SchemaNodeId): void {
    if (element.localName === 'annotation') return;
    const existingNodeId = nodeIdByStartOffset.get(element.range.start.offset);
    if (existingNodeId) {
      patchExisting(existingNodeId, element, ownerNodeId);
      for (const child of xsdChildElements(element)) {
        visit(child, existingNodeId);
      }
      return;
    }

    const name = xmlAttributeValue(element, 'name');
    const ref = xmlAttributeValue(element, 'ref');
    let nodeId: SchemaNodeId | undefined;
    if (element.localName === 'group') {
      if (name && ownerNodeId === schemaId) {
        nodeId = addGenericNode(
          element,
          ownerNodeId,
          'group',
          'global',
          name,
          { declarationRole: 'declaration' },
          ['model group definition'],
          namedNodeId(
            'group',
            state.options.sourceFileId,
            state.targetNamespace,
            name,
          ),
        );
      } else if (ref) {
        const reference = normalizedXmlReference(
          'group',
          element,
          'ref',
          state,
        );
        nodeId = addGenericNode(
          element,
          ownerNodeId,
          'groupReference',
          'local',
          `Group reference to ${ref}`,
          {
            declarationRole: 'reference',
            occurrence: structuralOccurrence(element),
            ...(reference === undefined ? {} : { groupReference: reference }),
          },
          [ref, 'group reference'],
        );
        if (reference?.targetNodeId) {
          addStructuralEdge(
            state,
            'usesGroup',
            nodeId,
            reference.targetNodeId,
            reference.range,
          );
          addStructuralEdge(
            state,
            'referencesDeclaration',
            nodeId,
            reference.targetNodeId,
            reference.range,
          );
        }
      }
    } else if (element.localName === 'attributeGroup') {
      if (name && ownerNodeId === schemaId) {
        nodeId = addGenericNode(
          element,
          ownerNodeId,
          'attributeGroup',
          'global',
          name,
          { declarationRole: 'declaration' },
          ['attribute group definition'],
          namedNodeId(
            'attributeGroup',
            state.options.sourceFileId,
            state.targetNamespace,
            name,
          ),
        );
      } else if (ref) {
        const reference = normalizedXmlReference(
          'attributeGroup',
          element,
          'ref',
          state,
        );
        nodeId = addGenericNode(
          element,
          ownerNodeId,
          'attributeGroupReference',
          'local',
          `Attribute-group reference to ${ref}`,
          {
            declarationRole: 'reference',
            ...(reference === undefined
              ? {}
              : { attributeGroupReference: reference }),
          },
          [ref, 'attribute group reference'],
        );
        if (reference?.targetNodeId) {
          addStructuralEdge(
            state,
            'usesAttributeGroup',
            nodeId,
            reference.targetNodeId,
            reference.range,
          );
          addStructuralEdge(
            state,
            'referencesDeclaration',
            nodeId,
            reference.targetNodeId,
            reference.range,
          );
        }
      }
    } else if (
      element.localName === 'sequence' ||
      element.localName === 'choice' ||
      element.localName === 'all'
    ) {
      const kind = element.localName;
      nodeId = addGenericNode(
        element,
        ownerNodeId,
        kind,
        'local',
        `${kind} in ${ownerName(ownerNodeId)}`,
        { compositor: kind, occurrence: structuralOccurrence(element) },
        [kind, 'compositor'],
      );
    } else if (element.localName === 'element') {
      const kind = ref ? 'elementReference' : 'localElement';
      const reference = ref
        ? normalizedXmlReference('element', element, 'ref', state)
        : undefined;
      const typeReference = normalizedXmlReference(
        'type',
        element,
        'type',
        state,
      );
      nodeId = addGenericNode(
        element,
        ownerNodeId,
        kind,
        'local',
        ref ?? name ?? `element@${element.sourceOrder}`,
        {
          declarationRole: ref ? 'reference' : 'declaration',
          occurrence: structuralOccurrence(element),
          nillable: xmlBoolean(element, 'nillable'),
          ...(reference === undefined ? {} : { elementReference: reference }),
          ...(typeReference === undefined ? {} : { typeReference }),
          ...(parseElementValueConstraint(element) === undefined
            ? {}
            : { valueConstraint: parseElementValueConstraint(element) }),
        },
        [ref, name, xmlAttributeValue(element, 'type')].filter(
          (value): value is string => value !== undefined,
        ),
      );
      if (reference?.targetNodeId) {
        addStructuralEdge(
          state,
          'referencesDeclaration',
          nodeId,
          reference.targetNodeId,
          reference.range,
        );
      }
      if (typeReference?.targetNodeId) {
        addStructuralEdge(
          state,
          'typeOf',
          nodeId,
          typeReference.targetNodeId,
          typeReference.range,
        );
      }
    } else if (element.localName === 'attribute') {
      const kind = ref ? 'attributeReference' : 'attribute';
      const reference = ref
        ? normalizedXmlReference('attribute', element, 'ref', state)
        : undefined;
      const typeReference = normalizedXmlReference(
        'type',
        element,
        'type',
        state,
      );
      nodeId = addGenericNode(
        element,
        ownerNodeId,
        kind,
        'local',
        ref ?? name ?? `attribute@${element.sourceOrder}`,
        {
          declarationRole: ref ? 'reference' : 'declaration',
          attributeUse:
            (xmlAttributeValue(
              element,
              'use',
            ) as XsdNodeMetadata['attributeUse']) ?? 'optional',
          ...(reference === undefined ? {} : { attributeReference: reference }),
          ...(typeReference === undefined ? {} : { typeReference }),
        },
        [ref, name, xmlAttributeValue(element, 'type')].filter(
          (value): value is string => value !== undefined,
        ),
      );
      if (reference?.targetNodeId) {
        addStructuralEdge(
          state,
          'referencesDeclaration',
          nodeId,
          reference.targetNodeId,
          reference.range,
        );
      }
    } else if (
      element.localName === 'complexType' ||
      element.localName === 'simpleType'
    ) {
      const kind = element.localName;
      nodeId = addGenericNode(
        element,
        ownerNodeId,
        kind,
        'anonymous',
        `Anonymous ${kind === 'complexType' ? 'complex' : 'simple'} type of ${ownerName(ownerNodeId)}`,
        {
          anonymous: true,
          ...(kind === 'simpleType'
            ? {
                simpleTypeVariety: xsdChildElements(element).find(
                  ({ localName }) =>
                    localName === 'restriction' ||
                    localName === 'list' ||
                    localName === 'union',
                )?.localName as XsdNodeMetadata['simpleTypeVariety'],
              }
            : {
                contentKind: xsdChildElements(element).some(
                  ({ localName }) => localName === 'simpleContent',
                )
                  ? ('simple' as const)
                  : xmlBoolean(element, 'mixed')
                    ? ('mixed' as const)
                    : xsdChildElements(element).some(({ localName }) =>
                          ['sequence', 'choice', 'all'].includes(localName),
                        )
                      ? ('elementOnly' as const)
                      : ('empty' as const),
              }),
        },
        ['anonymous type', ownerName(ownerNodeId)],
      );
    } else if (
      element.localName === 'simpleContent' ||
      element.localName === 'complexContent'
    ) {
      const kind = element.localName;
      nodeId = addGenericNode(
        element,
        ownerNodeId,
        kind,
        'local',
        `${kind === 'simpleContent' ? 'Simple' : 'Complex'} content of ${ownerName(ownerNodeId)}`,
        {
          contentKind: kind === 'simpleContent' ? 'simple' : 'inherited',
          mixed: xmlBoolean(element, 'mixed'),
        },
        [kind === 'simpleContent' ? 'simple content' : 'complex content'],
      );
    } else if (
      element.localName === 'extension' ||
      element.localName === 'restriction'
    ) {
      const kind = element.localName;
      const baseReference = normalizedXmlReference(
        'complexTypeBase',
        element,
        'base',
        state,
      );
      nodeId = addGenericNode(
        element,
        ownerNodeId,
        kind,
        'local',
        `${kind === 'extension' ? 'Extension' : 'Restriction'} of ${ownerName(ownerNodeId)}`,
        {
          complexTypeDerivation: {
            kind,
            ...(baseReference === undefined ? {} : { baseReference }),
            declaredAttributeCount: xsdChildElements(element).filter(
              ({ localName }) => localName === 'attribute',
            ).length,
            sourceRange: cloneRange(element.range),
            startTagRange: cloneRange(element.startTagRange),
          },
        },
        [xmlAttributeValue(element, 'base')].filter(
          (value): value is string => value !== undefined,
        ),
      );
    } else if (element.localName === 'any') {
      const namespace = xmlAttributeValue(element, 'namespace') ?? '##any';
      const processContents =
        (xmlAttributeValue(element, 'processContents') as
          'strict' | 'lax' | 'skip' | undefined) ?? 'strict';
      nodeId = addGenericNode(
        element,
        ownerNodeId,
        'elementWildcard',
        'local',
        `Element wildcard in ${ownerName(ownerNodeId)}`,
        {
          occurrence: structuralOccurrence(element),
          wildcardNamespace: namespace.trim().split(/\s+/u),
          processContents,
        },
        [namespace, processContents, 'element wildcard'],
      );
    } else if (element.localName === 'anyAttribute') {
      const namespace = xmlAttributeValue(element, 'namespace') ?? '##any';
      const processContents =
        (xmlAttributeValue(element, 'processContents') as
          'strict' | 'lax' | 'skip' | undefined) ?? 'strict';
      nodeId = addGenericNode(
        element,
        ownerNodeId,
        'attributeWildcard',
        'local',
        `Attribute wildcard in ${ownerName(ownerNodeId)}`,
        {
          wildcardNamespace: namespace.trim().split(/\s+/u),
          processContents,
        },
        [namespace, processContents, 'attribute wildcard'],
      );
    }

    const descendantOwner = nodeId ?? ownerNodeId;
    for (const child of xsdChildElements(element)) {
      visit(child, descendantOwner);
    }
  }

  for (const child of xsdChildElements(schema.xml)) {
    visit(child, schemaId);
  }
}

const xsdFacetKinds = new Set<XsdFacetKind>([
  'length',
  'minLength',
  'maxLength',
  'pattern',
  'enumeration',
  'whiteSpace',
  'maxInclusive',
  'maxExclusive',
  'minInclusive',
  'minExclusive',
  'totalDigits',
  'fractionDigits',
]);

function findXmlElementByRange(
  root: XsdXmlElementAst,
  range: SchemaSourceRange,
): XsdXmlElementAst | undefined {
  if (
    root.range.start.offset === range.start.offset &&
    root.range.end.offset === range.end.offset
  ) {
    return root;
  }
  for (const child of xsdChildElements(root)) {
    const match = findXmlElementByRange(child, range);
    if (match) return match;
  }
  return undefined;
}

function addTask1313TypeSystem(
  schema: XsdSchemaAst,
  schemaId: SchemaNodeId,
  state: BuildState,
): void {
  const nodeIdByStartOffset = new Map<number, SchemaNodeId>();
  for (const [nodeId, metadata] of Object.entries(state.metadataByNodeId)) {
    nodeIdByStartOffset.set(metadata.sourceRange.start.offset, nodeId);
  }
  const schemaMetadata = state.metadataByNodeId[schemaId];
  const identityTargetByKey = new Map<string, SchemaNodeId>();
  const notationTargetByKey = new Map<string, SchemaNodeId>();

  function nodeName(nodeId: SchemaNodeId): string {
    return state.nodes.find(({ id }) => id === nodeId)?.name ?? 'schema';
  }

  function syntheticRange(): SchemaSourceRange {
    return {
      start: { offset: 0, line: 1, column: 1 },
      end: { offset: 0, line: 1, column: 1 },
      sourceId: 'xsd-standard-library',
    };
  }

  function ensureBuiltInType(localName: string): SchemaNodeId | undefined {
    const definition = xsdBuiltInTypeDefinitions[localName];
    if (!definition) return undefined;
    const id = builtInTypeNodeId(localName);
    if (state.metadataByNodeId[id]) return id;
    const baseId = definition.base
      ? ensureBuiltInType(definition.base)
      : undefined;
    const range = syntheticRange();
    addNode(
      state,
      {
        id,
        kind: 'builtInType',
        name: `xs:${localName}`,
        properties: semanticProperties([
          ['Status', 'Application-owned XML Schema 1.0 built-in type'],
          [
            'Direct base',
            definition.base ? `xs:${definition.base}` : undefined,
          ],
          [
            'Ancestry',
            getXsdBuiltInTypeAncestry(localName)
              .map((name) => `xs:${name}`)
              .join(' → ') || undefined,
          ],
          ['Derivation', definition.derivation],
        ]),
        searchTerms: [
          localName,
          `xs:${localName}`,
          ...getXsdBuiltInTypeAncestry(localName),
          'XML Schema 1.0 built-in type',
        ],
      },
      {
        ...baseMetadata(
          'builtInType',
          'standard',
          'xsd-standard-library',
          Number.MAX_SAFE_INTEGER,
          range,
          range,
          xmlSchemaNamespaceUri,
        ),
        applicationOwned: true,
        builtInType: {
          localName,
          ...(definition.base === undefined
            ? {}
            : { directBaseLocalName: definition.base }),
          ancestry: getXsdBuiltInTypeAncestry(localName),
          ...(definition.derivation === undefined
            ? {}
            : { derivationMethod: definition.derivation }),
        },
        ...(definition.derivation === undefined
          ? {}
          : {
              typeDerivation: {
                method:
                  definition.derivation === 'list'
                    ? ('builtInList' as const)
                    : ('builtInRestriction' as const),
                ...(baseId === undefined
                  ? {}
                  : {
                      baseReference: {
                        kind: 'restrictionBase' as const,
                        raw: `xs:${definition.base}`,
                        prefix: 'xs',
                        localName: definition.base!,
                        namespaceUri: xmlSchemaNamespaceUri,
                        range: cloneRange(range),
                        resolution: 'resolved' as const,
                        targetNodeId: baseId,
                      },
                    }),
              },
            }),
      },
      { description: `the built-in type xs:${localName}`, range },
    );
    if (baseId) {
      addStructuralEdge(state, 'derivesFrom', id, baseId, range);
    }
    return id;
  }

  function lexicalReference(
    kind: XsdNormalizedReference['kind'],
    raw: string,
    range: SchemaSourceRange,
    element: XsdXmlElementAst,
    ownerNodeId?: SchemaNodeId,
  ): XsdNormalizedReference {
    const colon = raw.indexOf(':');
    const prefix = colon < 0 ? undefined : raw.slice(0, colon);
    const localName = colon < 0 ? raw : raw.slice(colon + 1);
    const namespaceUri = prefix
      ? element.namespaceBindings[prefix]
      : kind === 'keyrefTarget' || kind === 'notation'
        ? state.targetNamespace
        : element.namespaceBindings[''];
    let targetNodeId: SchemaNodeId | undefined;
    if (namespaceUri === xmlSchemaNamespaceUri) {
      targetNodeId = ensureBuiltInType(localName);
    } else if (kind === 'keyrefTarget' && ownerNodeId) {
      targetNodeId = identityTargetByKey.get(
        `${ownerNodeId}\u0000${expandedName(namespaceUri, localName)}`,
      );
    } else if (kind === 'notation') {
      targetNodeId = notationTargetByKey.get(
        expandedName(namespaceUri, localName),
      );
    } else {
      targetNodeId = state.typeNodeIdsByExpandedName.get(
        expandedName(namespaceUri, localName),
      );
    }
    return {
      kind,
      raw,
      ...(prefix === undefined ? {} : { prefix }),
      localName,
      ...(namespaceUri === undefined ? {} : { namespaceUri }),
      range: cloneRange(range),
      resolution: targetNodeId ? 'resolved' : 'externalDeferred',
      ...(targetNodeId === undefined ? {} : { targetNodeId }),
    };
  }

  function attributeReference(
    kind: XsdNormalizedReference['kind'],
    element: XsdXmlElementAst,
    attributeName: string,
    ownerNodeId?: SchemaNodeId,
  ): XsdNormalizedReference | undefined {
    const value = unqualifiedXmlAttribute(element, attributeName);
    return value
      ? lexicalReference(
          kind,
          value.value,
          value.valueContentRange,
          element,
          ownerNodeId,
        )
      : undefined;
  }

  function preciseEdge(
    kind: SchemaEdge['kind'],
    sourceNodeId: SchemaNodeId,
    targetNodeId: SchemaNodeId,
    range: SchemaSourceRange,
    order?: number,
  ): void {
    const id = edgeId(kind, sourceNodeId, targetNodeId, range, order);
    if (state.originByEdgeId.has(id)) return;
    addEdge(
      state,
      {
        id,
        kind,
        sourceNodeId,
        targetNodeId,
        ...(order === undefined ? {} : { order }),
      },
      range,
    );
  }

  function ancestorNodeId(
    nodeId: SchemaNodeId,
    kinds: ReadonlySet<SchemaNode['kind']>,
  ): SchemaNodeId | undefined {
    const seen = new Set<SchemaNodeId>();
    let current: SchemaNodeId | undefined = nodeId;
    for (let depth = 0; current && depth < 64; depth += 1) {
      if (seen.has(current)) return undefined;
      seen.add(current);
      const node = state.nodes.find(({ id }) => id === current);
      if (node && kinds.has(node.kind)) return current;
      current = state.metadataByNodeId[current]?.ownerNodeId;
    }
    return undefined;
  }

  function createSourceNode(
    element: XsdXmlElementAst,
    ownerNodeId: SchemaNodeId,
    kind: SchemaNode['kind'],
    name: string,
    metadataDetails: Partial<XsdNodeMetadata>,
    properties: SchemaNode['properties'],
    searchTerms: readonly string[],
    explicitId?: SchemaNodeId,
  ): SchemaNodeId {
    const id =
      explicitId ??
      rangedNodeId(
        kind as Parameters<typeof rangedNodeId>[0],
        state.options.sourceFileId,
        element.range,
      );
    if (!state.metadataByNodeId[id]) {
      addNode(
        state,
        {
          id,
          kind,
          name,
          sourceFileId: state.options.sourceFileId,
          sourceOrder: element.sourceOrder,
          compactDeclaration: sourceSlice(
            state.sourceText,
            element.startTagRange,
          ),
          ...(properties?.length ? { properties } : {}),
          ...(searchTerms.length ? { searchTerms } : {}),
        },
        {
          ...baseMetadata(
            kind,
            kind === 'xsdNotation' ? 'global' : 'local',
            state.options.sourceFileId,
            element.sourceOrder,
            element.range,
            element.startTagRange,
            kind === 'xsdNotation' ? state.targetNamespace : undefined,
          ),
          ownerNodeId,
          ...metadataDetails,
        },
        { description: `an XSD ${kind}`, range: element.range },
      );
      nodeIdByStartOffset.set(element.range.start.offset, id);
    }
    return id;
  }

  function patchNode(
    nodeId: SchemaNodeId,
    metadataDetails: Partial<XsdNodeMetadata>,
    properties: SchemaNode['properties'] = [],
    searchTerms: readonly string[] = [],
  ): void {
    const metadata = state.metadataByNodeId[nodeId];
    const index = state.nodes.findIndex(({ id }) => id === nodeId);
    if (!metadata || index < 0) return;
    state.metadataByNodeId[nodeId] = { ...metadata, ...metadataDetails };
    state.nodes[index] = mergeNodeProperties(
      state.nodes[index]!,
      properties,
      searchTerms,
    );
  }

  // Register notation identities before resolving notation-valued facets.
  for (const element of xsdChildElements(schema.xml)) {
    if (element.localName !== 'notation') continue;
    const name = xmlAttributeValue(element, 'name');
    if (!name) continue;
    notationTargetByKey.set(
      expandedName(state.targetNamespace, name),
      namedNodeId(
        'xsdNotation',
        state.options.sourceFileId,
        state.targetNamespace,
        name,
      ),
    );
  }

  function visit(element: XsdXmlElementAst, ownerNodeId: SchemaNodeId): void {
    if (element.localName === 'annotation') return;
    const existingNodeId = nodeIdByStartOffset.get(element.range.start.offset);
    let nodeId = existingNodeId;

    if (element.localName === 'simpleType' && nodeId) {
      const variety = xsdChildElements(element).find(({ localName }) =>
        ['restriction', 'list', 'union'].includes(localName),
      )?.localName as XsdNodeMetadata['simpleTypeVariety'];
      patchNode(
        nodeId,
        variety ? { simpleTypeVariety: variety } : {},
        semanticProperties([['Variety', variety]]),
        variety ? [variety, `${variety} simple type`] : [],
      );
    } else if (
      (element.localName === 'restriction' ||
        element.localName === 'extension') &&
      nodeId
    ) {
      const ownerTypeNodeId = ancestorNodeId(
        ownerNodeId,
        new Set(['simpleType', 'complexType']),
      );
      const simpleContent = ancestorNodeId(
        ownerNodeId,
        new Set(['simpleContent']),
      );
      const complexContent = ancestorNodeId(
        ownerNodeId,
        new Set(['complexContent']),
      );
      const method: XsdTypeDerivationMethod = simpleContent
        ? element.localName === 'extension'
          ? 'simpleContentExtension'
          : 'simpleContentRestriction'
        : complexContent
          ? element.localName === 'extension'
            ? 'complexExtension'
            : 'complexRestriction'
          : 'simpleRestriction';
      const baseKind =
        method === 'simpleRestriction'
          ? ('restrictionBase' as const)
          : ('complexTypeBase' as const);
      const baseReference = attributeReference(baseKind, element, 'base');
      const existingMetadata = state.metadataByNodeId[nodeId];
      const details: Partial<XsdNodeMetadata> = {
        typeDerivation: {
          method,
          ...(baseReference === undefined ? {} : { baseReference }),
          ...(ownerTypeNodeId === undefined ? {} : { ownerTypeNodeId }),
        },
        ...(method === 'simpleRestriction' && baseReference
          ? { restrictionBaseReference: baseReference }
          : {}),
        ...(method !== 'simpleRestriction' &&
        baseReference &&
        existingMetadata?.complexTypeDerivation
          ? {
              complexTypeDerivation: {
                ...existingMetadata.complexTypeDerivation,
                baseReference,
              },
            }
          : {}),
      };
      patchNode(
        nodeId,
        details,
        semanticProperties([
          ['Derivation method', method],
          ['Base type', baseReference?.raw],
          [
            'Owner type',
            ownerTypeNodeId ? nodeName(ownerTypeNodeId) : undefined,
          ],
        ]),
        [method, baseReference?.raw].filter(
          (value): value is string => value !== undefined,
        ),
      );
      if (ownerTypeNodeId) patchNode(ownerTypeNodeId, details);
      if (baseReference?.targetNodeId) {
        preciseEdge(
          element.localName === 'extension' ? 'extends' : 'restricts',
          nodeId,
          baseReference.targetNodeId,
          baseReference.range,
        );
        if (ownerTypeNodeId) {
          preciseEdge(
            'derivesFrom',
            ownerTypeNodeId,
            baseReference.targetNodeId,
            baseReference.range,
          );
        }
      }
      if (ownerTypeNodeId) {
        preciseEdge('ownsTypeVariety', ownerTypeNodeId, nodeId, element.range);
      }
    } else if (element.localName === 'list') {
      const itemTypeReference = attributeReference(
        'listItemType',
        element,
        'itemType',
      );
      nodeId = createSourceNode(
        element,
        ownerNodeId,
        'list',
        `List variety of ${nodeName(ownerNodeId)}`,
        {
          simpleTypeVariety: 'list',
          ...(itemTypeReference === undefined
            ? {}
            : { listItemTypeReference: itemTypeReference }),
          typeDerivation: {
            method: 'simpleList',
            ...(itemTypeReference === undefined
              ? {}
              : { baseReference: itemTypeReference }),
            ownerTypeNodeId: ownerNodeId,
          },
        },
        semanticProperties([
          ['Variety', 'list'],
          [
            'Item type',
            itemTypeReference?.raw ?? 'Inline anonymous simple type',
          ],
          ['Owner type', nodeName(ownerNodeId)],
        ]),
        ['list', itemTypeReference?.raw ?? 'inline item type'],
      );
      patchNode(ownerNodeId, {
        simpleTypeVariety: 'list',
        typeDerivation: {
          method: 'simpleList',
          ...(itemTypeReference === undefined
            ? {}
            : { baseReference: itemTypeReference }),
          ownerTypeNodeId: ownerNodeId,
        },
      });
      preciseEdge('ownsTypeVariety', ownerNodeId, nodeId, element.range);
      if (itemTypeReference?.targetNodeId) {
        preciseEdge(
          'listItemType',
          nodeId,
          itemTypeReference.targetNodeId,
          itemTypeReference.range,
        );
      }
      const anySimpleType = ensureBuiltInType('anySimpleType');
      if (anySimpleType) {
        preciseEdge('derivesFrom', ownerNodeId, anySimpleType, element.range);
      }
    } else if (element.localName === 'union') {
      const memberTypes = unqualifiedXmlAttribute(element, 'memberTypes');
      const memberTypeReferences = memberTypes
        ? memberTypes.value
            .trim()
            .split(/\s+/u)
            .filter(Boolean)
            .map((member) =>
              lexicalReference(
                'unionMemberType',
                member,
                memberTypes.valueContentRange,
                element,
              ),
            )
        : [];
      nodeId = createSourceNode(
        element,
        ownerNodeId,
        'union',
        `Union variety of ${nodeName(ownerNodeId)}`,
        {
          simpleTypeVariety: 'union',
          unionMemberTypeReferences: memberTypeReferences,
          typeDerivation: {
            method: 'simpleUnion',
            ownerTypeNodeId: ownerNodeId,
          },
        },
        semanticProperties([
          ['Variety', 'union'],
          [
            'Member types',
            memberTypeReferences.map(({ raw }) => raw).join(' '),
          ],
          [
            'Inline members',
            String(
              xsdChildElements(element).filter(
                ({ localName }) => localName === 'simpleType',
              ).length,
            ),
          ],
          ['Owner type', nodeName(ownerNodeId)],
        ]),
        [
          'union',
          ...memberTypeReferences.flatMap(({ raw, localName }) => [
            raw,
            localName,
          ]),
        ],
      );
      patchNode(ownerNodeId, {
        simpleTypeVariety: 'union',
        typeDerivation: {
          method: 'simpleUnion',
          ownerTypeNodeId: ownerNodeId,
        },
      });
      preciseEdge('ownsTypeVariety', ownerNodeId, nodeId, element.range);
      memberTypeReferences.forEach((reference, order) => {
        if (reference.targetNodeId) {
          preciseEdge(
            'unionMemberType',
            nodeId!,
            reference.targetNodeId,
            reference.range,
            order,
          );
        }
      });
      const anySimpleType = ensureBuiltInType('anySimpleType');
      if (anySimpleType) {
        preciseEdge('derivesFrom', ownerNodeId, anySimpleType, element.range);
      }
    } else if (xsdFacetKinds.has(element.localName as XsdFacetKind)) {
      const facetKind = element.localName as XsdFacetKind;
      const valueAttribute = unqualifiedXmlAttribute(element, 'value');
      const fixedAttribute = unqualifiedXmlAttribute(element, 'fixed');
      if (valueAttribute) {
        nodeId = createSourceNode(
          element,
          ownerNodeId,
          facetKind === 'enumeration' ? 'enumeration' : 'facet',
          `${facetKind} ${valueAttribute.value} on ${nodeName(ownerNodeId)}`,
          {
            facet: {
              kind: facetKind,
              value: valueAttribute.value,
              lexicalValue: valueAttribute.rawValue,
              valueRange: cloneRange(valueAttribute.valueContentRange),
              fixed:
                fixedAttribute?.value === 'true' ||
                fixedAttribute?.value === '1',
              ...(fixedAttribute === undefined
                ? {}
                : { fixedLexicalValue: fixedAttribute.rawValue }),
            },
          },
          semanticProperties([
            ['Facet kind', facetKind],
            ['Lexical value', valueAttribute.rawValue],
            [
              'Fixed',
              fixedAttribute
                ? fixedAttribute.value === 'true' ||
                  fixedAttribute.value === '1'
                  ? 'true'
                  : 'false'
                : 'false',
            ],
            ['Owner restriction', nodeName(ownerNodeId)],
            ...(facetKind === 'pattern'
              ? ([
                  [
                    'Semantics',
                    'XSD regular expression; displayed, not executed',
                  ],
                ] as const)
              : []),
          ]),
          [facetKind, valueAttribute.value, valueAttribute.rawValue],
        );
        preciseEdge(
          'ownsFacet',
          ownerNodeId,
          nodeId,
          element.range,
          element.sourceOrder,
        );
      }
    } else if (
      element.localName === 'unique' ||
      element.localName === 'key' ||
      element.localName === 'keyref'
    ) {
      const name = xmlAttributeValue(element, 'name');
      if (name) {
        const id = identityConstraintNodeId(
          state.options.sourceFileId,
          state.targetNamespace,
          ownerNodeId,
          name,
          element.range,
        );
        nodeId = createSourceNode(
          element,
          ownerNodeId,
          'identityConstraint',
          name,
          {
            ...(state.targetNamespace === undefined
              ? {}
              : { targetNamespace: state.targetNamespace }),
            identityConstraint: {
              kind: element.localName,
              name,
            },
          },
          semanticProperties([
            ['Constraint kind', element.localName],
            ['Owner element', nodeName(ownerNodeId)],
            ['XPath handling', 'Stored as inert XSD XPath text; not evaluated'],
          ]),
          [
            name,
            element.localName,
            'identity constraint',
            nodeName(ownerNodeId),
          ],
          id,
        );
        identityTargetByKey.set(
          `${ownerNodeId}\u0000${expandedName(state.targetNamespace, name)}`,
          nodeId,
        );
        preciseEdge(
          'ownsIdentityConstraint',
          ownerNodeId,
          nodeId,
          element.range,
        );
      }
    } else if (
      element.localName === 'selector' ||
      element.localName === 'field'
    ) {
      const xpath = unqualifiedXmlAttribute(element, 'xpath');
      if (xpath) {
        const fieldOrder =
          element.localName === 'field'
            ? Object.values(state.metadataByNodeId).filter(
                (metadata) =>
                  metadata.ownerNodeId === ownerNodeId &&
                  metadata.xpathConstraint?.kind === 'field',
              ).length
            : undefined;
        nodeId = createSourceNode(
          element,
          ownerNodeId,
          element.localName,
          `${element.localName} ${xpath.value} of ${nodeName(ownerNodeId)}`,
          {
            xpathConstraint: {
              kind: element.localName,
              value: xpath.value,
              lexicalValue: xpath.rawValue,
              valueRange: cloneRange(xpath.valueContentRange),
              ...(fieldOrder === undefined || fieldOrder < 0
                ? {}
                : { fieldOrder }),
            },
          },
          semanticProperties([
            ['XPath', xpath.rawValue],
            ['Owner constraint', nodeName(ownerNodeId)],
            ['Semantics', 'Inert XSD XPath text; displayed, not evaluated'],
          ]),
          [
            element.localName,
            xpath.value,
            xpath.rawValue,
            nodeName(ownerNodeId),
          ],
        );
        preciseEdge(
          element.localName === 'selector' ? 'ownsSelector' : 'ownsField',
          ownerNodeId,
          nodeId,
          element.range,
          element.sourceOrder,
        );
      }
    } else if (element.localName === 'notation') {
      const name = xmlAttributeValue(element, 'name');
      if (name) {
        const publicIdentifier = xmlAttributeValue(element, 'public');
        const systemIdentifier = xmlAttributeValue(element, 'system');
        nodeId = createSourceNode(
          element,
          schemaId,
          'xsdNotation',
          name,
          {
            notation: {
              ...(publicIdentifier === undefined ? {} : { publicIdentifier }),
              ...(systemIdentifier === undefined ? {} : { systemIdentifier }),
            },
          },
          semanticProperties([
            ['Notation kind', 'XSD notation declaration'],
            ['Public identifier', publicIdentifier],
            ['System identifier', systemIdentifier],
            ['Target namespace', state.targetNamespace],
          ]),
          [name, publicIdentifier, systemIdentifier, 'XSD notation'].filter(
            (value): value is string => value !== undefined,
          ),
          namedNodeId(
            'xsdNotation',
            state.options.sourceFileId,
            state.targetNamespace,
            name,
          ),
        );
        preciseEdge('sourceDocumentOwns', schemaId, nodeId, element.range);
      }
    }

    const descendantOwner = nodeId ?? ownerNodeId;
    for (const child of xsdChildElements(element)) {
      visit(child, descendantOwner);
      if (
        nodeId &&
        (element.localName === 'list' ||
          element.localName === 'union' ||
          element.localName === 'restriction') &&
        child.localName === 'simpleType'
      ) {
        const anonymousId = nodeIdByStartOffset.get(child.range.start.offset);
        if (anonymousId) {
          patchNode(anonymousId, { ownerNodeId: nodeId });
          preciseEdge('ownsAnonymousType', nodeId, anonymousId, child.range);
        }
      }
    }
  }

  for (const child of xsdChildElements(schema.xml)) visit(child, schemaId);

  // Resolve keyrefs after every sibling identity has been registered.
  for (const [nodeId, metadata] of Object.entries(state.metadataByNodeId)) {
    if (metadata.identityConstraint?.kind !== 'keyref') continue;
    const element = findXmlElementByRange(schema.xml, metadata.sourceRange);
    const ownerNodeId = metadata.ownerNodeId;
    if (!element || !ownerNodeId) continue;
    const referReference = attributeReference(
      'keyrefTarget',
      element,
      'refer',
      ownerNodeId,
    );
    if (!referReference) continue;
    patchNode(
      nodeId,
      {
        identityConstraint: {
          ...metadata.identityConstraint,
          referReference,
        },
      },
      semanticProperties([['Key reference target', referReference.raw]]),
      [referReference.raw, referReference.localName],
    );
    if (referReference.targetNodeId) {
      preciseEdge(
        'keyrefTargets',
        nodeId,
        referReference.targetNodeId,
        referReference.range,
      );
    }
  }

  // Turn all built-in QName uses into navigable deterministic targets.
  for (const [nodeId, metadata] of Object.entries(state.metadataByNodeId)) {
    const typeReference = metadata.typeReference;
    if (
      typeReference?.namespaceUri === xmlSchemaNamespaceUri &&
      typeReference.resolution === 'xsdBuiltIn'
    ) {
      const targetNodeId = ensureBuiltInType(typeReference.localName);
      if (targetNodeId) {
        const resolved = {
          ...typeReference,
          resolution: 'resolved' as const,
          targetNodeId,
        };
        patchNode(nodeId, { typeReference: resolved });
        preciseEdge('typeOf', nodeId, targetNodeId, typeReference.range);
      }
    }
  }

  function isNotationType(nodeId: SchemaNodeId): boolean {
    const target = builtInTypeNodeId('NOTATION');
    const queue = [nodeId];
    const seen = new Set<SchemaNodeId>();
    while (queue.length > 0 && seen.size < 256) {
      const current = queue.shift()!;
      if (current === target) return true;
      if (seen.has(current)) continue;
      seen.add(current);
      for (const edge of state.edges) {
        if (
          edge.sourceNodeId === current &&
          (edge.kind === 'derivesFrom' || edge.kind === 'restricts')
        ) {
          queue.push(edge.targetNodeId);
        }
      }
    }
    return false;
  }

  // Enumeration values under NOTATION restrictions are QName references, not strings.
  for (const [nodeId, metadata] of Object.entries(state.metadataByNodeId)) {
    if (metadata.facet?.kind !== 'enumeration' || !metadata.ownerNodeId)
      continue;
    const restriction = metadata.ownerNodeId;
    const restrictionTarget = state.edges.find(
      ({ sourceNodeId, kind }) =>
        sourceNodeId === restriction &&
        (kind === 'restricts' || kind === 'derivesFrom'),
    )?.targetNodeId;
    if (!restrictionTarget || !isNotationType(restrictionTarget)) continue;
    const element = findXmlElementByRange(schema.xml, metadata.sourceRange);
    if (!element) continue;
    const notationReference = lexicalReference(
      'notation',
      metadata.facet.value,
      metadata.facet.valueRange,
      element,
    );
    patchNode(
      nodeId,
      { notationReference },
      semanticProperties([['Notation reference', notationReference.raw]]),
      [notationReference.raw, notationReference.localName, 'notation value'],
    );
    if (notationReference.targetNodeId) {
      preciseEdge(
        'notationConstraint',
        nodeId,
        notationReference.targetNodeId,
        notationReference.range,
      );
    }
  }

  // Present declaration-level versus schema-default final/block effects.
  const schemaBlock = schemaMetadata?.block ?? [];
  const schemaFinal = schemaMetadata?.final ?? [];
  for (const node of state.nodes) {
    const metadata = state.metadataByNodeId[node.id];
    if (!metadata || metadata.applicationOwned) continue;
    const isElement =
      node.kind === 'globalElement' ||
      node.kind === 'localElement' ||
      node.kind === 'elementReference';
    const isType = node.kind === 'simpleType' || node.kind === 'complexType';
    if (isElement) {
      const tokens = metadata.block ?? schemaBlock;
      const source = metadata.block
        ? 'declaration'
        : schemaBlock.length
          ? 'schemaDefault'
          : 'implicit';
      patchNode(
        node.id,
        {
          effectiveBlock: { tokens, source, applicability: 'element' },
          ...(node.kind === 'globalElement'
            ? {
                effectiveFinal: {
                  tokens: metadata.final ?? schemaFinal,
                  source: metadata.final
                    ? ('declaration' as const)
                    : schemaFinal.length
                      ? ('schemaDefault' as const)
                      : ('implicit' as const),
                  applicability: 'element' as const,
                },
              }
            : {}),
        },
        semanticProperties([
          ['Effective block', tokens.join(' ') || 'none'],
          ['Block source', source],
          ...(node.kind === 'globalElement'
            ? [
                [
                  'Effective final',
                  (metadata.final ?? schemaFinal).join(' ') || 'none',
                ] as const,
              ]
            : []),
        ]),
      );
    } else if (isType) {
      const tokens = metadata.final ?? schemaFinal;
      const source = metadata.final
        ? 'declaration'
        : schemaFinal.length
          ? 'schemaDefault'
          : 'implicit';
      patchNode(
        node.id,
        {
          effectiveFinal: {
            tokens,
            source,
            applicability: node.kind,
          },
        },
        semanticProperties([
          ['Effective final', tokens.join(' ') || 'none'],
          ['Final source', source],
        ]),
      );
    }
  }
}

function compareNodes(left: SchemaNode, right: SchemaNode): number {
  if (left.kind === 'schema') return right.kind === 'schema' ? 0 : -1;
  if (right.kind === 'schema') return 1;
  return (
    (left.sourceOrder ?? Number.MAX_SAFE_INTEGER) -
      (right.sourceOrder ?? Number.MAX_SAFE_INTEGER) ||
    left.id.localeCompare(right.id)
  );
}

function addTask1314SchemaRelationships(
  schema: XsdSchemaAst,
  schemaId: SchemaNodeId,
  state: BuildState,
): void {
  for (const relationship of schema.relationships ?? []) {
    const kind = relationship.kind;
    const schemaLocation = relationship.schemaLocation?.value;
    const importedNamespace = relationship.namespace?.value;
    const id = rangedNodeId(
      kind,
      state.options.sourceFileId,
      relationship.range,
    );
    const name =
      schemaLocation ??
      importedNamespace ??
      (kind === 'import' ? 'namespace-only import' : `${kind} relationship`);
    addNode(
      state,
      {
        id,
        kind,
        name,
        sourceFileId: state.options.sourceFileId,
        sourceOrder: relationship.sourceOrder,
        compactDeclaration: sourceSlice(
          state.sourceText,
          relationship.startTagRange,
        ),
        properties: semanticProperties([
          ['Relationship kind', kind],
          ['Source schema', state.options.sourceFilename],
          ['Schema location', schemaLocation],
          ['Imported namespace', importedNamespace],
          ['Declaring target namespace', state.targetNamespace ?? 'none'],
          ['Resolution status', 'Pending project resolution'],
        ]),
        searchTerms: [
          kind,
          `${kind} relationship`,
          state.options.sourceFilename,
          schemaLocation,
          importedNamespace,
          state.targetNamespace,
          'Pending project resolution',
        ].filter((value): value is string => value !== undefined),
      },
      {
        ...baseMetadata(
          kind,
          'local',
          state.options.sourceFileId,
          relationship.sourceOrder,
          relationship.range,
          relationship.startTagRange,
        ),
        ownerNodeId: schemaId,
        schemaRelationship: {
          kind,
          ...(schemaLocation === undefined
            ? {}
            : { lexicalSchemaLocation: schemaLocation }),
          ...(importedNamespace === undefined ? {} : { importedNamespace }),
          sourcePath: state.options.sourceFilename,
          resolutionStatus: 'pending',
          resolutionDetail: 'Pending project resolution',
        },
      },
      { description: `an XSD ${kind} relationship`, range: relationship.range },
    );
    addStructuralEdge(
      state,
      'ownsSchemaRelationship',
      schemaId,
      id,
      relationship.range,
      relationship.sourceOrder,
    );
  }
}

function addTask1315AnnotationAndXmlContent(
  schema: XsdSchemaAst,
  schemaId: SchemaNodeId,
  state: BuildState,
): void {
  const normalizedOwnerByOffset = new Map<number, SchemaNodeId>();
  for (const [nodeId, metadata] of Object.entries(state.metadataByNodeId)) {
    normalizedOwnerByOffset.set(metadata.sourceRange.start.offset, nodeId);
  }

  function sortedBindings(
    bindings: Readonly<Record<string, string>>,
  ): Readonly<Record<string, string>> {
    return Object.fromEntries(
      Object.entries(bindings).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    );
  }

  function attributes(
    values: readonly XsdXmlAttributeAst[],
  ): readonly XsdForeignAttributeMetadata[] {
    return [...values]
      .sort(
        (left, right) =>
          left.sourceOrder - right.sourceOrder ||
          left.range.start.offset - right.range.start.offset,
      )
      .map((value) => ({
        qualifiedName: value.qualifiedName,
        ...(value.prefix === undefined ? {} : { prefix: value.prefix }),
        localName: value.localName,
        ...(value.namespaceUri === undefined
          ? {}
          : { namespaceUri: value.namespaceUri }),
        value: value.value,
        lexicalValue: value.rawValue,
        sourceRange: cloneRange(value.range),
        nameRange: cloneRange(value.nameRange),
        valueRange: cloneRange(value.valueContentRange),
        sourceOrder: value.sourceOrder,
      }));
  }

  function foreignAttributes(
    element: XsdXmlElementAst,
  ): readonly XsdForeignAttributeMetadata[] {
    return attributes(
      element.attributes.filter(
        (value) =>
          value.namespaceUri !== undefined &&
          value.namespaceUri !== xmlNamespaceUri &&
          value.namespaceUri !== xmlSchemaNamespaceUri &&
          value.namespaceUri !== xmlnsNamespaceUri,
      ),
    );
  }

  function attributeTerms(
    values: readonly XsdForeignAttributeMetadata[],
  ): readonly string[] {
    return values.flatMap((value) =>
      [
        value.qualifiedName,
        value.prefix,
        value.localName,
        value.namespaceUri,
        value.value,
        value.lexicalValue,
      ].filter((term): term is string => term !== undefined),
    );
  }

  function bindingTerms(
    bindings: Readonly<Record<string, string>>,
  ): readonly string[] {
    return Object.entries(bindings).flatMap(([prefix, uri]) => [
      prefix,
      uri,
      prefix ? `${prefix}:${uri}` : uri,
    ]);
  }

  function createContentNode(
    kind:
      | 'xsdAnnotation'
      | 'xsdDocumentation'
      | 'xsdAppInfo'
      | 'xsdForeignElement'
      | 'xsdComment'
      | 'xsdProcessingInstruction'
      | 'xsdProlog',
    name: string,
    range: SchemaSourceRange,
    startTagRange: SchemaSourceRange,
    sourceOrder: number,
    ownerNodeId: SchemaNodeId,
    relationship:
      | 'ownsAnnotation'
      | 'ownsAnnotationEntry'
      | 'ownsForeignContent'
      | 'ownsXmlMetadata',
    content: XsdAnnotationContentMetadata,
    properties: SchemaNode['properties'],
    searchTerms: readonly string[],
  ): SchemaNodeId {
    const id = rangedNodeId(kind, state.options.sourceFileId, range);
    addNode(
      state,
      {
        id,
        kind,
        name,
        sourceFileId: state.options.sourceFileId,
        sourceOrder,
        compactDeclaration: sourceSlice(state.sourceText, startTagRange),
        properties,
        searchTerms: [...searchTerms],
      },
      {
        ...baseMetadata(
          kind,
          'local',
          state.options.sourceFileId,
          sourceOrder,
          range,
          startTagRange,
        ),
        ownerNodeId,
        annotationContent: content,
      },
      { description: `Task 13.15 ${kind} content`, range },
    );
    addStructuralEdge(state, relationship, ownerNodeId, id, range, sourceOrder);
    return id;
  }

  function replaceContent(
    nodeId: SchemaNodeId,
    annotationContent: XsdAnnotationContentMetadata,
  ): void {
    const metadata = state.metadataByNodeId[nodeId];
    if (metadata) {
      state.metadataByNodeId[nodeId] = { ...metadata, annotationContent };
    }
  }

  function createComment(
    node: Extract<XsdXmlNodeAst, { readonly kind: 'comment' }>,
    ownerNodeId: SchemaNodeId,
  ): SchemaNodeId {
    const text = node.text;
    const label = text.trim().replace(/\s+/gu, ' ').slice(0, 72);
    return createContentNode(
      'xsdComment',
      label ? `XML comment: ${label}` : 'Empty XML comment',
      node.range,
      node.range,
      node.sourceOrder,
      ownerNodeId,
      'ownsXmlMetadata',
      {
        kind: 'comment',
        ownerNodeId,
        text,
        raw: node.raw,
        contentRange: cloneRange(node.contentRange),
      },
      semanticProperties([
        ['Content kind', 'XML comment'],
        ['Text', text],
        ['Owner', state.nodes.find(({ id }) => id === ownerNodeId)?.name],
      ]),
      [text, node.raw, 'XML comment'],
    );
  }

  function createProcessingInstruction(
    node: Extract<XsdXmlNodeAst, { readonly kind: 'processingInstruction' }>,
    ownerNodeId: SchemaNodeId,
  ): SchemaNodeId {
    return createContentNode(
      'xsdProcessingInstruction',
      node.target
        ? `Processing instruction ${node.target}`
        : 'Processing instruction',
      node.range,
      node.range,
      node.sourceOrder,
      ownerNodeId,
      'ownsXmlMetadata',
      {
        kind: 'processingInstruction',
        ownerNodeId,
        target: node.target,
        data: node.data,
        raw: node.raw,
      },
      semanticProperties([
        ['Content kind', 'XML processing instruction'],
        ['Target', node.target],
        ['Data', node.data],
        ['Safety', 'Preserved as inert text; never executed'],
      ]),
      [node.target, node.data, node.raw, 'processing instruction'],
    );
  }

  function mixedContent(
    children: readonly XsdXmlNodeAst[],
    ownerNodeId: SchemaNodeId,
  ): readonly XsdMixedContentMetadata[] {
    const content: XsdMixedContentMetadata[] = [];
    for (const child of children) {
      if (child.kind === 'text' || child.kind === 'cdata') {
        content.push({
          kind: child.kind,
          value: child.value,
          raw: child.raw,
          sourceRange: cloneRange(child.range),
          sourceOrder: child.sourceOrder,
        });
      } else if (child.kind === 'comment') {
        content.push({
          kind: 'comment',
          nodeId: createComment(child, ownerNodeId),
          sourceRange: cloneRange(child.range),
          sourceOrder: child.sourceOrder,
        });
      } else if (child.kind === 'processingInstruction') {
        content.push({
          kind: 'processingInstruction',
          nodeId: createProcessingInstruction(child, ownerNodeId),
          sourceRange: cloneRange(child.range),
          sourceOrder: child.sourceOrder,
        });
      } else if (child.kind === 'element') {
        content.push({
          kind: 'foreignElement',
          nodeId: createForeignElement(child, ownerNodeId),
          sourceRange: cloneRange(child.range),
          sourceOrder: child.sourceOrder,
        });
      }
    }
    return content;
  }

  function createForeignElement(
    element: XsdXmlElementAst,
    ownerNodeId: SchemaNodeId,
  ): SchemaNodeId {
    const retainedAttributes = attributes(element.attributes);
    const bindings = sortedBindings(element.namespaceBindings);
    const rawXml = sourceSlice(state.sourceText, element.range);
    const initial: XsdAnnotationContentMetadata = {
      kind: 'foreignElement',
      ownerNodeId,
      qualifiedName: element.qualifiedName,
      ...(element.prefix === undefined ? {} : { prefix: element.prefix }),
      localName: element.localName,
      ...(element.namespaceUri === undefined
        ? {}
        : { namespaceUri: element.namespaceUri }),
      namespaceBindings: bindings,
      rawXml,
      attributes: retainedAttributes,
      mixedContent: [],
    };
    const id = createContentNode(
      'xsdForeignElement',
      element.qualifiedName,
      element.range,
      element.startTagRange,
      element.sourceOrder,
      ownerNodeId,
      'ownsForeignContent',
      initial,
      semanticProperties([
        ['Content kind', 'Preserved uninterpreted foreign element'],
        ['Qualified name', element.qualifiedName],
        ['Local name', element.localName],
        ['Prefix', element.prefix],
        ['Namespace URI', element.namespaceUri],
        ['Attribute count', String(retainedAttributes.length)],
        ['Safety', 'Opaque markup; never interpreted or executed'],
      ]),
      [
        element.qualifiedName,
        element.prefix,
        element.localName,
        element.namespaceUri,
        extractXsdMixedContentText(element.children),
        ...attributeTerms(retainedAttributes),
        ...bindingTerms(bindings),
        rawXml,
        'preserved uninterpreted foreign content',
      ].filter((term): term is string => term !== undefined),
    );
    replaceContent(id, {
      ...initial,
      mixedContent: mixedContent(element.children, id),
    });
    return id;
  }

  function contentRange(element: XsdXmlElementAst): SchemaSourceRange {
    return {
      start: { ...element.startTagRange.end },
      end: { ...(element.endTagRange?.start ?? element.startTagRange.end) },
      ...(element.range.sourceId === undefined
        ? {}
        : { sourceId: element.range.sourceId }),
    };
  }

  function schemaValue(
    value: XsdXmlAttributeAst | undefined,
  ): XsdSchemaValueMetadata<string> | undefined {
    return value
      ? {
          value: value.value,
          lexicalValue: value.rawValue,
          range: cloneRange(value.valueContentRange),
        }
      : undefined;
  }

  function createAnnotationEntry(
    element: XsdXmlElementAst,
    annotationNodeId: SchemaNodeId,
  ): SchemaNodeId {
    const documentation = element.localName === 'documentation';
    const kind = documentation ? 'xsdDocumentation' : 'xsdAppInfo';
    const retainedAttributes = attributes(element.attributes);
    const text = extractXsdMixedContentText(element.children);
    const source = schemaValue(
      element.attributes.find(
        (value) =>
          value.prefix === undefined &&
          value.namespaceUri === undefined &&
          value.localName === 'source',
      ),
    );
    const xmlLang = documentation
      ? schemaValue(
          element.attributes.find(
            (value) =>
              value.namespaceUri === xmlNamespaceUri &&
              value.localName === 'lang',
          ),
        )
      : undefined;
    const range = contentRange(element);
    const rawXml = sourceSlice(state.sourceText, element.range);
    const initial: XsdAnnotationContentMetadata = documentation
      ? {
          kind: 'documentation',
          ownerNodeId: annotationNodeId,
          text,
          rawXml,
          ...(xmlLang === undefined ? {} : { xmlLang }),
          ...(source === undefined ? {} : { source }),
          contentRange: cloneRange(range),
          attributes: retainedAttributes,
          mixedContent: [],
        }
      : {
          kind: 'appInfo',
          ownerNodeId: annotationNodeId,
          text,
          rawXml,
          ...(source === undefined ? {} : { source }),
          contentRange: cloneRange(range),
          attributes: retainedAttributes,
          mixedContent: [],
        };
    const labelText = text.trim().replace(/\s+/gu, ' ').slice(0, 72);
    const id = createContentNode(
      kind,
      labelText
        ? `${documentation ? 'Documentation' : 'Appinfo'}: ${labelText}`
        : documentation
          ? 'Documentation (no text content)'
          : 'Appinfo (machine/private content)',
      element.range,
      element.startTagRange,
      element.sourceOrder,
      annotationNodeId,
      'ownsAnnotationEntry',
      initial,
      semanticProperties([
        [
          'Content kind',
          documentation
            ? 'Human-readable XSD documentation'
            : 'Machine/private uninterpreted XSD appinfo',
        ],
        ['Language', xmlLang?.value],
        ['Source', source?.value],
        ['Text', text],
        ['Mixed-content item count', String(element.children.length)],
        [
          'Safety',
          'Flattened text and escaped source only; markup is never executed',
        ],
      ]),
      [
        text,
        xmlLang?.value,
        source?.value,
        ...attributeTerms(retainedAttributes),
        ...bindingTerms(element.namespaceBindings),
        rawXml,
        documentation ? 'documentation' : 'appinfo machine private',
      ].filter((term): term is string => term !== undefined),
    );
    replaceContent(id, {
      ...initial,
      mixedContent: mixedContent(element.children, id),
    });
    return id;
  }

  function createAnnotation(
    element: XsdXmlElementAst,
    ownerNodeId: SchemaNodeId,
  ): SchemaNodeId {
    const entryElements = element.children.filter(
      (child): child is XsdXmlElementAst =>
        child.kind === 'element' &&
        child.namespaceUri === xmlSchemaNamespaceUri &&
        (child.localName === 'documentation' || child.localName === 'appinfo'),
    );
    const retainedAttributes = attributes(element.attributes);
    const bindings = sortedBindings(element.namespaceBindings);
    const rawXml = sourceSlice(state.sourceText, element.range);
    const id = createContentNode(
      'xsdAnnotation',
      `Annotation ${element.range.start.line}:${element.range.start.column}`,
      element.range,
      element.startTagRange,
      element.sourceOrder,
      ownerNodeId,
      'ownsAnnotation',
      {
        kind: 'annotation',
        ownerNodeId,
        rawXml,
        entryCount: entryElements.length,
        attributes: retainedAttributes,
        namespaceBindings: bindings,
      },
      semanticProperties([
        ['Content kind', 'XSD annotation block'],
        ['Entry count', String(entryElements.length)],
        [
          'Owner',
          state.nodes.find(({ id: nodeId }) => nodeId === ownerNodeId)?.name,
        ],
      ]),
      [
        'annotation',
        rawXml,
        ...attributeTerms(retainedAttributes),
        ...bindingTerms(bindings),
      ],
    );
    for (const child of element.children) {
      if (
        child.kind === 'element' &&
        child.namespaceUri === xmlSchemaNamespaceUri &&
        (child.localName === 'documentation' || child.localName === 'appinfo')
      ) {
        createAnnotationEntry(child, id);
      } else if (child.kind === 'element') {
        createForeignElement(child, id);
      } else if (child.kind === 'comment') {
        createComment(child, id);
      } else if (child.kind === 'processingInstruction') {
        createProcessingInstruction(child, id);
      }
    }
    return id;
  }

  function patchOwnerXmlMetadata(
    ownerNodeId: SchemaNodeId,
    element: XsdXmlElementAst,
  ): void {
    const metadata = state.metadataByNodeId[ownerNodeId];
    if (
      !metadata ||
      metadata.sourceRange.start.offset !== element.range.start.offset
    )
      return;
    const retainedForeignAttributes = foreignAttributes(element);
    if (retainedForeignAttributes.length === 0) return;
    state.metadataByNodeId[ownerNodeId] = {
      ...metadata,
      foreignAttributes: retainedForeignAttributes,
    };
  }

  function visitElement(
    element: XsdXmlElementAst,
    inheritedOwnerNodeId: SchemaNodeId,
  ): void {
    const ownerNodeId =
      normalizedOwnerByOffset.get(element.range.start.offset) ??
      inheritedOwnerNodeId;
    patchOwnerXmlMetadata(ownerNodeId, element);
    for (const child of element.children) {
      if (child.kind === 'element') {
        if (
          child.namespaceUri === xmlSchemaNamespaceUri &&
          child.localName === 'annotation'
        ) {
          createAnnotation(child, ownerNodeId);
        } else if (child.namespaceUri === xmlSchemaNamespaceUri) {
          visitElement(child, ownerNodeId);
        } else {
          createForeignElement(child, ownerNodeId);
        }
      } else if (child.kind === 'comment') {
        createComment(child, ownerNodeId);
      } else if (child.kind === 'processingInstruction') {
        createProcessingInstruction(child, ownerNodeId);
      }
    }
  }

  const declaration = schema.document.declaration;
  if (declaration) {
    const declarationData = declaration.data;
    function pseudoAttribute(name: string): string | undefined {
      const expression = new RegExp(
        `(?:^|\\s)${name}\\s*=\\s*(["'])(.*?)\\1`,
        'u',
      );
      return expression.exec(declarationData)?.[2];
    }
    const version = pseudoAttribute('version');
    const encoding = pseudoAttribute('encoding');
    const standalone = pseudoAttribute('standalone');
    createContentNode(
      'xsdProlog',
      'XML declaration',
      declaration.range,
      declaration.range,
      declaration.sourceOrder,
      schemaId,
      'ownsXmlMetadata',
      {
        kind: 'prolog',
        ownerNodeId: schemaId,
        target: declaration.target,
        data: declaration.data,
        raw: declaration.raw,
        ...(version === undefined ? {} : { version }),
        ...(encoding === undefined ? {} : { encoding }),
        ...(standalone === undefined ? {} : { standalone }),
      },
      semanticProperties([
        ['Content kind', 'XML declaration'],
        ['Version', version],
        ['Encoding', encoding],
        ['Standalone', standalone],
        ['Safety', 'Preserved as inert source metadata'],
      ]),
      [
        declaration.target,
        declaration.data,
        declaration.raw,
        version,
        encoding,
        standalone,
        'XML declaration prolog',
      ].filter((term): term is string => term !== undefined),
    );
  }

  for (const child of schema.document.children) {
    if (child === schema.xml) {
      visitElement(schema.xml, schemaId);
    } else if (child.kind === 'comment') {
      createComment(child, schemaId);
    } else if (child.kind === 'processingInstruction') {
      createProcessingInstruction(child, schemaId);
    }
  }
}

function buildXsdSchemaProjectSafely(
  schema: XsdSchemaAst,
  sourceText: string,
  options: XsdProjectBuildOptions,
): XsdProjectBuildResult {
  const optionDiagnostics = validateOptions(options);
  if (optionDiagnostics.length > 0) {
    return resultWithoutProject(optionDiagnostics);
  }

  const astDiagnostics = validateAst(schema, sourceText, options.sourceFileId);
  if (astDiagnostics.some(({ severity }) => severity === 'error')) {
    return resultWithoutProject(astDiagnostics);
  }

  const state: BuildState = {
    options,
    sourceText,
    ...(schema.targetNamespace === undefined
      ? {}
      : { targetNamespace: schema.targetNamespace.value }),
    diagnostics: [],
    nodes: [],
    edges: [],
    metadataByNodeId: {},
    originByNodeId: new Map(),
    originByEdgeId: new Map(),
    typeNodeIdsByExpandedName: new Map(),
    typeKindsByExpandedName: new Map(),
    elementNodeIdsByExpandedName: new Map(),
    attributeNodeIdsByExpandedName: new Map(),
    groupNodeIdsByExpandedName: new Map(),
    attributeGroupNodeIdsByExpandedName: new Map(),
  };
  const declarations = registerGlobalSymbols(schema, state);
  if (state.diagnostics.some(({ severity }) => severity === 'error')) {
    return resultWithoutProject(state.diagnostics);
  }

  const schemaId = buildSchemaNode(schema, state);
  declarations.forEach((declaration, order) => {
    addGlobalDeclaration(declaration, schemaId, order, state);
  });
  addTask1312Structure(schema, schemaId, state);
  resolveAllReferences(declarations, state);
  addTask1313TypeSystem(schema, schemaId, state);
  addTask1314SchemaRelationships(schema, schemaId, state);
  addTask1315AnnotationAndXmlContent(schema, schemaId, state);

  if (state.diagnostics.some(({ severity }) => severity === 'error')) {
    return resultWithoutProject(state.diagnostics);
  }

  const project: SchemaProject = {
    id: options.projectId,
    displayName: options.displayName,
    sourceFiles: [
      { id: options.sourceFileId, filename: options.sourceFilename },
    ],
    nodes: [...state.nodes].sort(compareNodes),
    edges: [...state.edges],
    rootNodeIds: [schemaId],
  };

  for (const finding of validateSchemaProject(project)) {
    state.diagnostics.push(
      diagnostic(
        'project-validation-failed',
        `Normalized XSD project validation failed (${finding.code}): ${finding.message}`,
        {
          sourceId: options.sourceFileId,
          ...(finding.nodeId === undefined ? {} : { nodeId: finding.nodeId }),
        },
      ),
    );
  }

  if (state.diagnostics.some(({ severity }) => severity === 'error')) {
    return resultWithoutProject(state.diagnostics);
  }

  return {
    project,
    diagnostics: [...state.diagnostics].sort(compareDiagnostics),
    metadataByNodeId: state.metadataByNodeId,
  };
}

export function buildXsdSchemaProject(
  schema: XsdSchemaAst,
  sourceText: string,
  options: XsdProjectBuildOptions,
): XsdProjectBuildResult {
  try {
    return buildXsdSchemaProjectSafely(schema, sourceText, options);
  } catch {
    return resultWithoutProject([
      diagnostic(
        'missing-required-ast-value',
        'The XSD AST is missing a required value or has an unsupported malformed shape.',
        {
          ...(typeof options?.sourceFileId === 'string' &&
          options.sourceFileId.length > 0
            ? { sourceId: options.sourceFileId }
            : {}),
        },
      ),
    ]);
  }
}
