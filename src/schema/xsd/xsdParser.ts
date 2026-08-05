import {
  createXsdDiagnostic,
  sortXsdDiagnostics,
  type XsdDiagnostic,
  type XsdDiagnosticCode,
} from './xsdDiagnostics';
import type {
  XsdAnnotationAst,
  XsdAnnotationEntryAst,
  XsdAppInfoAst,
  XsdAttributeUse,
  XsdAttributeValueConstraintAst,
  XsdComplexContentAst,
  XsdComplexTypeAst,
  XsdComplexTypeDerivationAst,
  XsdCompositorAst,
  XsdCompositorKind,
  XsdDeferredComponentAst,
  XsdDocumentationAst,
  XsdEnumerationFacetAst,
  XsdFormDefault,
  XsdGlobalDeclarationAst,
  XsdGlobalAttributeAst,
  XsdGlobalElementAst,
  XsdLocalElementAst,
  XsdLocalAttributeAst,
  XsdMaxOccurs,
  XsdOccurrenceAst,
  XsdParseResult,
  XsdQNameAst,
  XsdSchemaAst,
  XsdSchemaValueAst,
  XsdSimpleTypeRestrictionAst,
  XsdSimpleTypeAst,
} from './xsdAst';
import { extractXsdMixedContentText } from './xsdAnnotationText';
import {
  parseXmlQualifiedName,
  type ParsedXmlQualifiedName,
} from './xsdXmlLexer';
import { parseXsdXml } from './xsdXmlParser';
import {
  xmlNamespaceUri,
  xmlSchemaNamespaceUri,
  type XsdXmlAttributeAst,
  type XsdXmlElementAst,
} from './xsdXmlAst';

function childElements(element: XsdXmlElementAst): readonly XsdXmlElementAst[] {
  return element.children.filter(
    (child): child is XsdXmlElementAst => child.kind === 'element',
  );
}

function xsdChildElements(
  element: XsdXmlElementAst,
): readonly XsdXmlElementAst[] {
  return childElements(element).filter(
    (child) => child.namespaceUri === xmlSchemaNamespaceUri,
  );
}

function attribute(
  element: XsdXmlElementAst,
  localName: string,
): XsdXmlAttributeAst | undefined {
  return element.attributes.find(
    (candidate) =>
      candidate.namespaceUri === undefined &&
      candidate.localName === localName &&
      candidate.prefix === undefined,
  );
}

function isValidNcName(value: string): boolean {
  const parsed = parseXmlQualifiedName(value);
  return parsed !== undefined && parsed.prefix === undefined;
}

function fallbackQName(value: string): ParsedXmlQualifiedName {
  const colon = value.indexOf(':');
  return colon > 0 && colon === value.lastIndexOf(':')
    ? {
        qualifiedName: value,
        prefix: value.slice(0, colon),
        localName: value.slice(colon + 1),
      }
    : { qualifiedName: value, localName: value };
}

const task1312StructuralElements = new Set([
  'group',
  'attributeGroup',
  'simpleContent',
  'any',
  'anyAttribute',
  'list',
  'union',
  'length',
  'minLength',
  'maxLength',
  'pattern',
  'whiteSpace',
  'maxInclusive',
  'maxExclusive',
  'minInclusive',
  'minExclusive',
  'totalDigits',
  'fractionDigits',
  'unique',
  'key',
  'keyref',
  'selector',
  'field',
  'notation',
  'extension',
  'restriction',
]);

export function parseXsd(
  sourceText: string,
  sourceId?: string,
): XsdParseResult {
  const xmlResult = parseXsdXml(sourceText, sourceId);
  const diagnostics: XsdDiagnostic[] = [...xmlResult.diagnostics];

  function diagnose(
    code: XsdDiagnosticCode,
    severity: 'error' | 'warning',
    message: string,
    range: XsdXmlElementAst['range'],
  ): void {
    diagnostics.push(
      createXsdDiagnostic('xsd', code, severity, message, range),
    );
  }

  function parseName(
    element: XsdXmlElementAst,
    required: boolean,
  ): {
    readonly name?: string;
    readonly nameRange?: XsdXmlAttributeAst['valueContentRange'];
  } {
    const nameAttribute = attribute(element, 'name');
    if (!nameAttribute) {
      if (required) {
        diagnose(
          'missing-declaration-name',
          'error',
          `<${element.qualifiedName}> requires a name attribute`,
          element.startTagRange,
        );
      }
      return {};
    }
    if (!isValidNcName(nameAttribute.value)) {
      diagnose(
        'invalid-declaration-name',
        'error',
        `Declaration name "${nameAttribute.value}" is not a valid NCName`,
        nameAttribute.valueContentRange,
      );
    }
    return {
      name: nameAttribute.value,
      nameRange: nameAttribute.valueContentRange,
    };
  }

  function parseQNameAttribute(
    element: XsdXmlElementAst,
    localName: 'type' | 'ref' | 'base',
  ): XsdQNameAst | undefined {
    const valueAttribute = attribute(element, localName);
    if (!valueAttribute) return undefined;
    const lexical = valueAttribute.value;
    const parsed =
      lexical.trim() === lexical ? parseXmlQualifiedName(lexical) : undefined;
    if (!parsed) {
      diagnose(
        'invalid-qname-attribute',
        'error',
        `Attribute ${localName}="${valueAttribute.rawValue}" is not a valid QName`,
        valueAttribute.valueContentRange,
      );
    }
    const usable = parsed ?? fallbackQName(lexical);
    const namespaceUri = usable.prefix
      ? element.namespaceBindings[usable.prefix]
      : undefined;
    if (usable.prefix && namespaceUri === undefined) {
      diagnose(
        'invalid-qname-attribute',
        'error',
        `QName prefix "${usable.prefix}" is not declared`,
        valueAttribute.valueContentRange,
      );
    }
    return {
      raw: valueAttribute.rawValue,
      ...(usable.prefix === undefined ? {} : { prefix: usable.prefix }),
      localName: usable.localName,
      ...(namespaceUri === undefined ? {} : { namespaceUri }),
      range: valueAttribute.valueContentRange,
    };
  }

  function parseOccurrence(element: XsdXmlElementAst): XsdOccurrenceAst {
    const minAttribute = attribute(element, 'minOccurs');
    const maxAttribute = attribute(element, 'maxOccurs');

    function nonNegativeInteger(
      valueAttribute: XsdXmlAttributeAst | undefined,
      fallback: number,
      allowUnbounded: boolean,
    ): number | XsdMaxOccurs {
      if (!valueAttribute) return fallback;
      const lexical = valueAttribute.value;
      if (allowUnbounded && lexical === 'unbounded') return 'unbounded';
      if (!/^(0|[1-9][0-9]*)$/.test(lexical)) {
        diagnose(
          'invalid-occurrence',
          'error',
          `${valueAttribute.localName} must be a non-negative decimal safe integer${allowUnbounded ? ' or "unbounded"' : ''}`,
          valueAttribute.valueContentRange,
        );
        return fallback;
      }
      const numeric = Number(lexical);
      if (!Number.isSafeInteger(numeric)) {
        diagnose(
          'invalid-occurrence',
          'error',
          `${valueAttribute.localName} exceeds the safe integer range`,
          valueAttribute.valueContentRange,
        );
        return fallback;
      }
      return numeric;
    }

    const minOccurs = nonNegativeInteger(minAttribute, 1, false) as number;
    const maxOccurs = nonNegativeInteger(maxAttribute, 1, true);
    if (typeof maxOccurs === 'number' && maxOccurs < minOccurs) {
      diagnose(
        'invalid-occurrence',
        'error',
        'maxOccurs cannot be less than minOccurs',
        maxAttribute?.valueContentRange ?? element.startTagRange,
      );
    }
    return {
      minOccurs,
      maxOccurs,
      ...(minAttribute === undefined
        ? {}
        : { minOccursAttribute: minAttribute }),
      ...(maxAttribute === undefined
        ? {}
        : { maxOccursAttribute: maxAttribute }),
    };
  }

  function namespacedAttribute(
    element: XsdXmlElementAst,
    namespaceUri: string,
    localName: string,
  ): XsdXmlAttributeAst | undefined {
    return element.attributes.find(
      (candidate) =>
        candidate.namespaceUri === namespaceUri &&
        candidate.localName === localName,
    );
  }

  function schemaValue(
    valueAttribute: XsdXmlAttributeAst | undefined,
  ): XsdSchemaValueAst<string> | undefined {
    return valueAttribute
      ? {
          value: valueAttribute.value,
          lexicalValue: valueAttribute.rawValue,
          range: valueAttribute.valueContentRange,
        }
      : undefined;
  }

  function annotationContentRange(
    element: XsdXmlElementAst,
  ): XsdXmlElementAst['range'] {
    const end = element.endTagRange?.start ?? element.startTagRange.end;
    return {
      start: { ...element.startTagRange.end },
      end: { ...end },
      ...(element.range.sourceId === undefined
        ? {}
        : { sourceId: element.range.sourceId }),
    };
  }

  function parseDocumentation(element: XsdXmlElementAst): XsdDocumentationAst {
    const xmlLang = schemaValue(
      namespacedAttribute(element, xmlNamespaceUri, 'lang'),
    );
    const source = schemaValue(attribute(element, 'source'));
    return {
      kind: 'documentation',
      text: extractXsdMixedContentText(element.children),
      rawXml: sourceText.slice(
        element.range.start.offset,
        element.range.end.offset,
      ),
      ...(xmlLang === undefined ? {} : { xmlLang }),
      ...(source === undefined ? {} : { source }),
      range: element.range,
      startTagRange: element.startTagRange,
      contentRange: annotationContentRange(element),
      sourceOrder: element.sourceOrder,
      xml: element,
    };
  }

  function parseAppInfo(element: XsdXmlElementAst): XsdAppInfoAst {
    const source = schemaValue(attribute(element, 'source'));
    return {
      kind: 'appInfo',
      text: extractXsdMixedContentText(element.children),
      rawXml: sourceText.slice(
        element.range.start.offset,
        element.range.end.offset,
      ),
      ...(source === undefined ? {} : { source }),
      range: element.range,
      startTagRange: element.startTagRange,
      contentRange: annotationContentRange(element),
      sourceOrder: element.sourceOrder,
      xml: element,
    };
  }

  function parseAnnotation(element: XsdXmlElementAst): XsdAnnotationAst {
    const entryElements = xsdChildElements(element).filter(
      (child) =>
        child.localName === 'documentation' || child.localName === 'appinfo',
    );
    const entries: XsdAnnotationEntryAst[] = entryElements
      .map((child) =>
        child.localName === 'documentation'
          ? parseDocumentation(child)
          : parseAppInfo(child),
      )
      .sort(
        (left, right) =>
          left.sourceOrder - right.sourceOrder ||
          left.range.start.offset - right.range.start.offset,
      );
    return {
      kind: 'annotation',
      entries,
      deferredComponents: deferredChildren(element, entryElements),
      range: element.range,
      startTagRange: element.startTagRange,
      sourceOrder: element.sourceOrder,
      rawXml: sourceText.slice(
        element.range.start.offset,
        element.range.end.offset,
      ),
      xml: element,
    };
  }

  function parseAnnotations(element: XsdXmlElementAst): {
    readonly annotations: readonly XsdAnnotationAst[];
    readonly elements: readonly XsdXmlElementAst[];
  } {
    const xsdChildren = xsdChildElements(element);
    const elements = xsdChildren.filter(
      (child) => child.localName === 'annotation',
    );
    // XML Schema 1.0 permits repeated schema-level annotations interspersed
    // with the schema's other children. Component annotations retain the
    // one-direct-annotation, first-child rule.
    const schemaLevel = element.localName === 'schema';
    if (!schemaLevel && elements.length > 1) {
      diagnose(
        'multiple-annotations',
        'error',
        'A supported XSD component can contain at most one direct annotation',
        elements[1]!.range,
      );
    }
    const firstStructural = xsdChildren.find(
      (child) => child.localName !== 'annotation',
    );
    if (!schemaLevel && firstStructural) {
      for (const annotationElement of elements) {
        if (annotationElement.sourceOrder > firstStructural.sourceOrder) {
          diagnose(
            'invalid-annotation-placement',
            'error',
            'A direct annotation must precede the component structural content',
            annotationElement.range,
          );
        }
      }
    }
    return {
      annotations: elements
        .map(parseAnnotation)
        .sort(
          (left, right) =>
            left.sourceOrder - right.sourceOrder ||
            left.range.start.offset - right.range.start.offset,
        ),
      elements,
    };
  }

  function deferred(element: XsdXmlElementAst): XsdDeferredComponentAst {
    const reason: XsdDeferredComponentAst['reason'] =
      element.namespaceUri !== xmlSchemaNamespaceUri
        ? 'foreign'
        : element.localName === 'annotation'
          ? 'annotation'
          : 'unsupported-xsd';
    if (
      reason === 'unsupported-xsd' &&
      !task1312StructuralElements.has(element.localName)
    ) {
      diagnose(
        'unsupported-xsd-component',
        'warning',
        `XSD component <${element.qualifiedName}> is preserved for a later task`,
        element.range,
      );
    }
    return {
      kind: 'deferred',
      qualifiedName: element.qualifiedName,
      localName: element.localName,
      ...(element.namespaceUri === undefined
        ? {}
        : { namespaceUri: element.namespaceUri }),
      reason,
      range: element.range,
      sourceOrder: element.sourceOrder,
      xml: element,
    };
  }

  function deferredChildren(
    element: XsdXmlElementAst,
    supportedChildren: readonly XsdXmlElementAst[],
  ): readonly XsdDeferredComponentAst[] {
    const supportedOrders = new Set(
      supportedChildren.map(({ sourceOrder }) => sourceOrder),
    );
    const deferredElements = childElements(element).filter(
      (child) => !supportedOrders.has(child.sourceOrder),
    );
    for (const child of deferredElements) {
      if (
        child.namespaceUri === xmlSchemaNamespaceUri &&
        child.localName === 'complexContent' &&
        element.localName !== 'complexType'
      ) {
        diagnose(
          'invalid-complex-content-placement',
          'error',
          'A supported complexContent must be a direct child of a complex type',
          child.range,
        );
      }
      if (
        child.namespaceUri === xmlSchemaNamespaceUri &&
        child.localName === 'documentation' &&
        element.localName !== 'annotation'
      ) {
        diagnose(
          'invalid-documentation-placement',
          'error',
          'Documentation must be a direct child of a supported annotation',
          child.range,
        );
      }
      if (
        child.namespaceUri === xmlSchemaNamespaceUri &&
        child.localName === 'appinfo' &&
        element.localName !== 'annotation'
      ) {
        diagnose(
          'invalid-appinfo-placement',
          'error',
          'AppInfo must be a direct child of a supported annotation',
          child.range,
        );
      }
      if (
        child.namespaceUri === xmlSchemaNamespaceUri &&
        (child.localName === 'extension' ||
          child.localName === 'restriction') &&
        element.localName !== 'complexContent' &&
        !(
          element.localName === 'simpleType' &&
          child.localName === 'restriction'
        )
      ) {
        diagnose(
          'invalid-complex-derivation-placement',
          'error',
          'A complex-type extension or restriction must be a direct child of complexContent',
          child.range,
        );
      }
    }
    return deferredElements.map((child) => deferred(child));
  }

  function inlineTypes(element: XsdXmlElementAst): {
    readonly complexTypes: readonly XsdXmlElementAst[];
    readonly simpleTypes: readonly XsdXmlElementAst[];
  } {
    const children = xsdChildElements(element);
    return {
      complexTypes: children.filter(
        (child) => child.localName === 'complexType',
      ),
      simpleTypes: children.filter((child) => child.localName === 'simpleType'),
    };
  }

  function misplacedRestrictionChildren(
    element: XsdXmlElementAst,
  ): readonly XsdXmlElementAst[] {
    const restrictions = xsdChildElements(element).filter(
      (child) => child.localName === 'restriction',
    );
    for (const restriction of restrictions) {
      diagnose(
        'invalid-restriction-placement',
        'error',
        'A supported restriction must be a direct child of a simple type',
        restriction.range,
      );
    }
    return restrictions;
  }

  function parseSimpleType(
    element: XsdXmlElementAst,
    global: boolean,
  ): XsdSimpleTypeAst {
    const annotationData = parseAnnotations(element);
    const parsedName = parseName(element, global);
    const children = xsdChildElements(element);
    const restrictions = children.filter(
      (child) => child.localName === 'restriction',
    );
    const listOrUnion = children.filter(
      (child) => child.localName === 'list' || child.localName === 'union',
    );
    if (restrictions.length > 1) {
      diagnose(
        'multiple-simple-type-restrictions',
        'error',
        'A simple type can contain at most one direct restriction',
        restrictions[1]!.range,
      );
    }
    if (
      (restrictions.length > 0 && listOrUnion.length > 0) ||
      new Set(listOrUnion.map(({ localName }) => localName)).size > 1
    ) {
      diagnose(
        'multiple-simple-type-varieties',
        'error',
        'A simple type cannot combine restriction, list, or union varieties',
        listOrUnion[0]!.range,
      );
    }
    const restriction = restrictions[0]
      ? parseSimpleTypeRestriction(restrictions[0])
      : undefined;
    return {
      kind: 'simpleType',
      annotations: annotationData.annotations,
      ...parsedName,
      ...(restriction === undefined ? {} : { restriction }),
      deferredComponents: deferredChildren(element, [
        ...annotationData.elements,
        ...(restrictions[0] ? [restrictions[0]] : []),
      ]),
      range: element.range,
      startTagRange: element.startTagRange,
      sourceOrder: element.sourceOrder,
      xml: element,
    };
  }

  function parseEnumerationFacet(
    element: XsdXmlElementAst,
  ): XsdEnumerationFacetAst {
    const annotationData = parseAnnotations(element);
    const valueAttribute = attribute(element, 'value');
    if (!valueAttribute) {
      diagnose(
        'missing-enumeration-value',
        'error',
        'An enumeration facet requires a value attribute',
        element.startTagRange,
      );
    }
    return {
      kind: 'enumeration',
      annotations: annotationData.annotations,
      ...(valueAttribute === undefined
        ? {}
        : {
            value: valueAttribute.value,
            lexicalValue: valueAttribute.rawValue,
            valueRange: valueAttribute.valueContentRange,
          }),
      deferredComponents: deferredChildren(element, [
        ...annotationData.elements,
        ...misplacedRestrictionChildren(element),
      ]),
      range: element.range,
      startTagRange: element.startTagRange,
      sourceOrder: element.sourceOrder,
      xml: element,
    };
  }

  function parseSimpleTypeRestriction(
    element: XsdXmlElementAst,
  ): XsdSimpleTypeRestrictionAst {
    const annotationData = parseAnnotations(element);
    const base = parseQNameAttribute(element, 'base');
    if (!attribute(element, 'base')) {
      diagnose(
        'missing-restriction-base',
        'error',
        'A simple type restriction requires a base QName',
        element.startTagRange,
      );
    }
    const enumerationElements = xsdChildElements(element).filter(
      (child) => child.localName === 'enumeration',
    );
    const enumerations = enumerationElements
      .map(parseEnumerationFacet)
      .sort((left, right) => left.sourceOrder - right.sourceOrder);
    const misplacedRestrictions = misplacedRestrictionChildren(element);
    return {
      kind: 'restriction',
      annotations: annotationData.annotations,
      ...(base === undefined ? {} : { base }),
      enumerations,
      deferredComponents: deferredChildren(element, [
        ...annotationData.elements,
        ...enumerationElements,
        ...misplacedRestrictions,
      ]),
      range: element.range,
      startTagRange: element.startTagRange,
      sourceOrder: element.sourceOrder,
      xml: element,
    };
  }

  function parseAttributeValueConstraint(
    element: XsdXmlElementAst,
  ): XsdAttributeValueConstraintAst | undefined {
    const defaultAttribute = attribute(element, 'default');
    const fixedAttribute = attribute(element, 'fixed');
    if (defaultAttribute && fixedAttribute) {
      diagnose(
        'attribute-default-fixed-conflict',
        'error',
        'An attribute cannot specify both default and fixed',
        fixedAttribute.valueContentRange,
      );
    }
    const selected = defaultAttribute ?? fixedAttribute;
    if (!selected) return undefined;
    return {
      kind: selected.localName as 'default' | 'fixed',
      value: selected.value,
      lexicalValue: selected.rawValue,
      range: selected.valueContentRange,
    };
  }

  function parseAttributeUse(element: XsdXmlElementAst): XsdAttributeUse {
    const useAttribute = attribute(element, 'use');
    if (!useAttribute) return 'optional';
    if (
      useAttribute.value !== 'optional' &&
      useAttribute.value !== 'prohibited' &&
      useAttribute.value !== 'required'
    ) {
      diagnose(
        'invalid-attribute-use',
        'error',
        'Attribute use must be "optional", "prohibited", or "required"',
        useAttribute.valueContentRange,
      );
      return 'optional';
    }
    return useAttribute.value;
  }

  function parseAttributeForm(
    element: XsdXmlElementAst,
  ): XsdSchemaValueAst<XsdFormDefault> | undefined {
    const formAttribute = attribute(element, 'form');
    if (!formAttribute) return undefined;
    if (
      formAttribute.value !== 'qualified' &&
      formAttribute.value !== 'unqualified'
    ) {
      diagnose(
        'invalid-attribute-form',
        'error',
        'Attribute form must be "qualified" or "unqualified"',
        formAttribute.valueContentRange,
      );
      return {
        value: 'unqualified',
        lexicalValue: formAttribute.rawValue,
        range: formAttribute.valueContentRange,
      };
    }
    return {
      value: formAttribute.value,
      lexicalValue: formAttribute.rawValue,
      range: formAttribute.valueContentRange,
    };
  }

  function parseGlobalAttribute(
    element: XsdXmlElementAst,
  ): XsdGlobalAttributeAst {
    const annotationData = parseAnnotations(element);
    const parsedName = parseName(element, false);
    if (!attribute(element, 'name')) {
      diagnose(
        'missing-global-attribute-name',
        'error',
        'A global attribute requires a name attribute',
        element.startTagRange,
      );
    }
    for (const [localName, code] of [
      ['ref', 'forbidden-global-attribute-ref'],
      ['use', 'forbidden-global-attribute-use'],
      ['form', 'forbidden-global-attribute-form'],
    ] as const) {
      const forbidden = attribute(element, localName);
      if (forbidden) {
        diagnose(
          code,
          'error',
          `A global attribute cannot specify ${localName}`,
          forbidden.valueContentRange,
        );
      }
    }
    const type = parseQNameAttribute(element, 'type');
    const inline = inlineTypes(element);
    if (inline.simpleTypes.length > 1) {
      diagnose(
        'multiple-inline-types',
        'error',
        'An attribute can contain at most one anonymous simple type',
        inline.simpleTypes[1]!.range,
      );
    }
    if (type && inline.simpleTypes.length > 0) {
      diagnose(
        'attribute-type-inline-type-conflict',
        'error',
        'An attribute cannot use both type and an anonymous simple type',
        inline.simpleTypes[0]!.range,
      );
    }
    const anonymousSimpleType = inline.simpleTypes[0]
      ? parseSimpleType(inline.simpleTypes[0], false)
      : undefined;
    const supported = [
      ...annotationData.elements,
      ...(anonymousSimpleType ? [inline.simpleTypes[0]!] : []),
      ...misplacedRestrictionChildren(element),
    ];
    const valueConstraint = parseAttributeValueConstraint(element);
    return {
      kind: 'globalAttribute',
      annotations: annotationData.annotations,
      ...parsedName,
      ...(type === undefined ? {} : { type }),
      ...(anonymousSimpleType === undefined ? {} : { anonymousSimpleType }),
      ...(valueConstraint === undefined ? {} : { valueConstraint }),
      deferredComponents: deferredChildren(element, supported),
      range: element.range,
      startTagRange: element.startTagRange,
      sourceOrder: element.sourceOrder,
      xml: element,
    };
  }

  function parseLocalAttribute(
    element: XsdXmlElementAst,
  ): XsdLocalAttributeAst {
    const annotationData = parseAnnotations(element);
    const nameAttribute = attribute(element, 'name');
    const parsedName = parseName(element, false);
    const ref = parseQNameAttribute(element, 'ref');
    if (!nameAttribute && !ref) {
      diagnose(
        'missing-local-attribute-name-or-ref',
        'error',
        'A local attribute requires exactly one of name or ref',
        element.startTagRange,
      );
    }
    if (nameAttribute && ref) {
      diagnose(
        'conflicting-local-attribute-name-ref',
        'error',
        'A local attribute cannot specify both name and ref',
        element.startTagRange,
      );
    }
    const type = parseQNameAttribute(element, 'type');
    const form = parseAttributeForm(element);
    const inline = inlineTypes(element);
    if (inline.simpleTypes.length > 1) {
      diagnose(
        'multiple-inline-types',
        'error',
        'An attribute can contain at most one anonymous simple type',
        inline.simpleTypes[1]!.range,
      );
    }
    if (type && inline.simpleTypes.length > 0) {
      diagnose(
        'attribute-type-inline-type-conflict',
        'error',
        'An attribute cannot use both type and an anonymous simple type',
        inline.simpleTypes[0]!.range,
      );
    }
    if (ref && type) {
      diagnose(
        'attribute-ref-type-conflict',
        'error',
        'A referenced attribute cannot also specify type',
        type.range,
      );
    }
    if (ref && inline.simpleTypes.length > 0) {
      diagnose(
        'attribute-ref-inline-type-conflict',
        'error',
        'A referenced attribute cannot contain an anonymous simple type',
        inline.simpleTypes[0]!.range,
      );
    }
    if (ref && form) {
      diagnose(
        'attribute-ref-form-conflict',
        'error',
        'A referenced attribute cannot specify form',
        form.range ?? element.startTagRange,
      );
    }
    const anonymousSimpleType = inline.simpleTypes[0]
      ? parseSimpleType(inline.simpleTypes[0], false)
      : undefined;
    const supported = [
      ...annotationData.elements,
      ...(anonymousSimpleType ? [inline.simpleTypes[0]!] : []),
      ...misplacedRestrictionChildren(element),
    ];
    const valueConstraint = parseAttributeValueConstraint(element);
    return {
      kind: 'localAttribute',
      annotations: annotationData.annotations,
      ...parsedName,
      ...(ref === undefined ? {} : { ref }),
      ...(type === undefined ? {} : { type }),
      ...(anonymousSimpleType === undefined ? {} : { anonymousSimpleType }),
      use: parseAttributeUse(element),
      ...(form === undefined ? {} : { form }),
      ...(valueConstraint === undefined ? {} : { valueConstraint }),
      deferredComponents: deferredChildren(element, supported),
      range: element.range,
      startTagRange: element.startTagRange,
      sourceOrder: element.sourceOrder,
      xml: element,
    };
  }

  function parseCompositor(element: XsdXmlElementAst): XsdCompositorAst {
    const annotationData = parseAnnotations(element);
    const members: Array<XsdLocalElementAst | XsdCompositorAst> = [];
    const supported: XsdXmlElementAst[] = [...annotationData.elements];
    for (const child of xsdChildElements(element)) {
      if (child.localName === 'element') {
        members.push(parseLocalElement(child));
        supported.push(child);
      } else if (
        child.localName === 'sequence' ||
        child.localName === 'choice' ||
        child.localName === 'all'
      ) {
        members.push(parseCompositor(child));
        supported.push(child);
      }
    }
    return {
      kind: 'compositor',
      annotations: annotationData.annotations,
      compositor: element.localName as XsdCompositorKind,
      occurrence: parseOccurrence(element),
      members,
      deferredComponents: deferredChildren(element, supported),
      range: element.range,
      startTagRange: element.startTagRange,
      sourceOrder: element.sourceOrder,
      xml: element,
    };
  }

  function parseComplexTypeDerivation(
    element: XsdXmlElementAst,
  ): XsdComplexTypeDerivationAst {
    const annotationData = parseAnnotations(element);
    const base = parseQNameAttribute(element, 'base');
    if (!attribute(element, 'base')) {
      diagnose(
        'missing-complex-derivation-base',
        'error',
        'A complex-type derivation requires a base QName',
        element.startTagRange,
      );
    }
    const children = xsdChildElements(element);
    const compositors = children.filter(
      (child) =>
        child.localName === 'sequence' ||
        child.localName === 'choice' ||
        child.localName === 'all',
    );
    if (compositors.length > 1) {
      diagnose(
        'multiple-complex-derivation-compositors',
        'error',
        'A complex-type derivation can contain at most one direct supported compositor',
        compositors[1]!.range,
      );
    }
    const compositor = compositors[0]
      ? parseCompositor(compositors[0])
      : undefined;
    const attributeElements = children.filter(
      (child) => child.localName === 'attribute',
    );
    if (compositor) {
      for (const attributeElement of attributeElements) {
        if (attributeElement.sourceOrder < compositor.sourceOrder) {
          diagnose(
            'invalid-complex-derivation-attribute-placement',
            'error',
            'A direct attribute must follow the complex-type derivation compositor',
            attributeElement.range,
          );
        }
      }
    }
    const attributes = attributeElements
      .map(parseLocalAttribute)
      .sort((left, right) => left.sourceOrder - right.sourceOrder);
    for (const directElement of children.filter(
      (child) => child.localName === 'element',
    )) {
      diagnose(
        'invalid-complex-derivation-element-placement',
        'error',
        'A local element in a complex-type derivation must be inside a supported compositor',
        directElement.range,
      );
    }
    return {
      kind: element.localName as 'extension' | 'restriction',
      annotations: annotationData.annotations,
      ...(base === undefined ? {} : { base }),
      ...(compositor === undefined ? {} : { compositor }),
      attributes,
      deferredComponents: deferredChildren(element, [
        ...annotationData.elements,
        ...(compositor ? [compositors[0]!] : []),
        ...attributeElements,
      ]),
      range: element.range,
      startTagRange: element.startTagRange,
      sourceOrder: element.sourceOrder,
      xml: element,
    };
  }

  function parseComplexContent(
    element: XsdXmlElementAst,
  ): XsdComplexContentAst {
    const annotationData = parseAnnotations(element);
    const children = xsdChildElements(element);
    const derivations = children.filter(
      (child) =>
        child.localName === 'extension' || child.localName === 'restriction',
    );
    if (derivations.length === 0) {
      diagnose(
        'missing-complex-content-derivation',
        'error',
        'A supported complexContent requires one direct extension or restriction',
        element.startTagRange,
      );
    }
    if (derivations.length > 1) {
      diagnose(
        'multiple-complex-content-derivations',
        'error',
        'A supported complexContent can contain exactly one direct extension or restriction',
        derivations[1]!.range,
      );
    }
    for (const misplaced of children.filter(
      (child) =>
        child.localName !== 'annotation' &&
        child.localName !== 'extension' &&
        child.localName !== 'restriction',
    )) {
      diagnose(
        'invalid-complex-derivation-placement',
        'error',
        'Declared complex-type content must be inside the extension or restriction',
        misplaced.range,
      );
    }
    const derivation = derivations[0]
      ? parseComplexTypeDerivation(derivations[0])
      : undefined;
    return {
      kind: 'complexContent',
      annotations: annotationData.annotations,
      ...(derivation === undefined ? {} : { derivation }),
      deferredComponents: deferredChildren(element, [
        ...annotationData.elements,
        ...(derivations[0] ? [derivations[0]] : []),
      ]),
      range: element.range,
      startTagRange: element.startTagRange,
      sourceOrder: element.sourceOrder,
      xml: element,
    };
  }

  function parseComplexType(
    element: XsdXmlElementAst,
    global: boolean,
  ): XsdComplexTypeAst {
    const annotationData = parseAnnotations(element);
    const parsedName = parseName(element, global);
    const children = xsdChildElements(element);
    const compositors = children.filter(
      (child) =>
        child.localName === 'sequence' ||
        child.localName === 'choice' ||
        child.localName === 'all',
    );
    if (compositors.length > 1) {
      diagnose(
        'multiple-direct-compositors',
        'error',
        'A complex type can contain at most one direct supported compositor',
        compositors[1]!.range,
      );
    }
    const compositor = compositors[0]
      ? parseCompositor(compositors[0])
      : undefined;
    const attributeElements = children.filter(
      (child) => child.localName === 'attribute',
    );
    const complexContents = children.filter(
      (child) => child.localName === 'complexContent',
    );
    if (complexContents.length > 1) {
      diagnose(
        'multiple-complex-content',
        'error',
        'A complex type can contain at most one direct complexContent',
        complexContents[1]!.range,
      );
    }
    if (
      complexContents.length > 0 &&
      (compositors.length > 0 || attributeElements.length > 0)
    ) {
      diagnose(
        'multiple-complex-type-content-models',
        'error',
        'A complex type cannot combine direct content or attributes with complexContent',
        (compositors[0] ?? attributeElements[0])!.range,
      );
    }
    const complexContent = complexContents[0]
      ? parseComplexContent(complexContents[0])
      : undefined;
    if (compositor) {
      for (const attributeElement of attributeElements) {
        if (attributeElement.sourceOrder < compositor.sourceOrder) {
          diagnose(
            'invalid-attribute-placement',
            'error',
            'A direct attribute must follow the complex type compositor',
            attributeElement.range,
          );
        }
      }
    }
    const attributes = attributeElements
      .map(parseLocalAttribute)
      .sort((left, right) => left.sourceOrder - right.sourceOrder);
    const directElements = xsdChildElements(element).filter(
      (child) => child.localName === 'element',
    );
    for (const directElement of directElements) {
      diagnose(
        'unsupported-structure',
        'error',
        'A local element in a complex type must be inside a supported compositor',
        directElement.range,
      );
    }
    return {
      kind: 'complexType',
      annotations: annotationData.annotations,
      ...parsedName,
      ...(compositor === undefined ? {} : { compositor }),
      attributes,
      ...(complexContent === undefined ? {} : { complexContent }),
      deferredComponents: deferredChildren(element, [
        ...annotationData.elements,
        ...(compositor ? [compositors[0]!] : []),
        ...attributeElements,
        ...(complexContents[0] ? [complexContents[0]] : []),
      ]),
      range: element.range,
      startTagRange: element.startTagRange,
      sourceOrder: element.sourceOrder,
      xml: element,
    };
  }

  function diagnoseInlineConflicts(
    element: XsdXmlElementAst,
    type: XsdQNameAst | undefined,
    ref: XsdQNameAst | undefined,
    complexTypes: readonly XsdXmlElementAst[],
    simpleTypes: readonly XsdXmlElementAst[],
  ): void {
    const allInline = [...complexTypes, ...simpleTypes].sort(
      (left, right) => left.sourceOrder - right.sourceOrder,
    );
    if (allInline.length > 1) {
      diagnose(
        'multiple-inline-types',
        'error',
        'An element can contain at most one anonymous type',
        allInline[1]!.range,
      );
    }
    if (type && allInline.length > 0) {
      diagnose(
        'type-inline-type-conflict',
        'error',
        'An element cannot use both type and an anonymous type',
        allInline[0]!.range,
      );
    }
    if (ref && type) {
      diagnose(
        'type-ref-conflict',
        'error',
        'A referenced local element cannot also specify type',
        element.startTagRange,
      );
    }
    if (ref && allInline.length > 0) {
      diagnose(
        'ref-inline-type-conflict',
        'error',
        'A referenced local element cannot contain an anonymous type',
        allInline[0]!.range,
      );
    }
  }

  function parseGlobalElement(element: XsdXmlElementAst): XsdGlobalElementAst {
    const annotationData = parseAnnotations(element);
    const parsedName = parseName(element, true);
    const refAttribute = attribute(element, 'ref');
    const minAttribute = attribute(element, 'minOccurs');
    const maxAttribute = attribute(element, 'maxOccurs');
    const substitutionGroupAttribute = attribute(element, 'substitutionGroup');
    if (substitutionGroupAttribute) {
      diagnose(
        'unsupported-xsd-component',
        'warning',
        'The substitutionGroup relationship is preserved for a later task',
        substitutionGroupAttribute.range,
      );
    }
    if (refAttribute) {
      diagnose(
        'forbidden-global-ref',
        'error',
        'A global element cannot specify ref',
        refAttribute.range,
      );
    }
    for (const occurrenceAttribute of [minAttribute, maxAttribute]) {
      if (occurrenceAttribute) {
        diagnose(
          'forbidden-global-occurrence',
          'error',
          `A global element cannot specify ${occurrenceAttribute.localName}`,
          occurrenceAttribute.range,
        );
      }
    }
    const type = parseQNameAttribute(element, 'type');
    const inline = inlineTypes(element);
    diagnoseInlineConflicts(
      element,
      type,
      undefined,
      inline.complexTypes,
      inline.simpleTypes,
    );
    const anonymousComplexType = inline.complexTypes[0]
      ? parseComplexType(inline.complexTypes[0], false)
      : undefined;
    const anonymousSimpleType = inline.simpleTypes[0]
      ? parseSimpleType(inline.simpleTypes[0], false)
      : undefined;
    const supported = [
      ...annotationData.elements,
      ...(inline.complexTypes[0] ? [inline.complexTypes[0]] : []),
      ...(inline.simpleTypes[0] ? [inline.simpleTypes[0]] : []),
      ...misplacedRestrictionChildren(element),
    ];
    return {
      kind: 'globalElement',
      annotations: annotationData.annotations,
      ...parsedName,
      ...(type === undefined ? {} : { type }),
      ...(anonymousComplexType === undefined ? {} : { anonymousComplexType }),
      ...(anonymousSimpleType === undefined ? {} : { anonymousSimpleType }),
      deferredComponents: deferredChildren(element, supported),
      range: element.range,
      startTagRange: element.startTagRange,
      sourceOrder: element.sourceOrder,
      xml: element,
    };
  }

  function parseLocalElement(element: XsdXmlElementAst): XsdLocalElementAst {
    const annotationData = parseAnnotations(element);
    const nameAttribute = attribute(element, 'name');
    const parsedName = parseName(element, false);
    const ref = parseQNameAttribute(element, 'ref');
    if (!nameAttribute && !ref) {
      diagnose(
        'missing-local-name-or-ref',
        'error',
        'A local element requires exactly one of name or ref',
        element.startTagRange,
      );
    }
    if (nameAttribute && ref) {
      diagnose(
        'conflicting-local-name-ref',
        'error',
        'A local element cannot specify both name and ref',
        element.startTagRange,
      );
    }
    const type = parseQNameAttribute(element, 'type');
    const inline = inlineTypes(element);
    diagnoseInlineConflicts(
      element,
      type,
      ref,
      inline.complexTypes,
      inline.simpleTypes,
    );
    const anonymousComplexType = inline.complexTypes[0]
      ? parseComplexType(inline.complexTypes[0], false)
      : undefined;
    const anonymousSimpleType = inline.simpleTypes[0]
      ? parseSimpleType(inline.simpleTypes[0], false)
      : undefined;
    const supported = [
      ...annotationData.elements,
      ...(inline.complexTypes[0] ? [inline.complexTypes[0]] : []),
      ...(inline.simpleTypes[0] ? [inline.simpleTypes[0]] : []),
      ...misplacedRestrictionChildren(element),
    ];
    return {
      kind: 'localElement',
      annotations: annotationData.annotations,
      ...parsedName,
      ...(ref === undefined ? {} : { ref }),
      ...(type === undefined ? {} : { type }),
      occurrence: parseOccurrence(element),
      ...(anonymousComplexType === undefined ? {} : { anonymousComplexType }),
      ...(anonymousSimpleType === undefined ? {} : { anonymousSimpleType }),
      deferredComponents: deferredChildren(element, supported),
      range: element.range,
      startTagRange: element.startTagRange,
      sourceOrder: element.sourceOrder,
      xml: element,
    };
  }

  function formDefault(
    root: XsdXmlElementAst,
    localName: 'elementFormDefault' | 'attributeFormDefault',
  ): XsdSchemaValueAst<XsdFormDefault> {
    const valueAttribute = attribute(root, localName);
    if (!valueAttribute) {
      return { value: 'unqualified', lexicalValue: 'unqualified' };
    }
    if (
      valueAttribute.value !== 'qualified' &&
      valueAttribute.value !== 'unqualified'
    ) {
      diagnose(
        'invalid-form-default',
        'error',
        `${localName} must be "qualified" or "unqualified"`,
        valueAttribute.valueContentRange,
      );
      return {
        value: 'unqualified',
        lexicalValue: valueAttribute.rawValue,
        range: valueAttribute.valueContentRange,
      };
    }
    return {
      value: valueAttribute.value,
      lexicalValue: valueAttribute.rawValue,
      range: valueAttribute.valueContentRange,
    };
  }

  function optionalSchemaValue(
    root: XsdXmlElementAst,
    localName: 'targetNamespace' | 'version',
  ): XsdSchemaValueAst<string> | undefined {
    const valueAttribute = attribute(root, localName);
    return valueAttribute
      ? {
          value: valueAttribute.value,
          lexicalValue: valueAttribute.rawValue,
          range: valueAttribute.valueContentRange,
        }
      : undefined;
  }

  function parseSchema(root: XsdXmlElementAst): XsdSchemaAst {
    const annotationData = parseAnnotations(root);
    const declarations: XsdGlobalDeclarationAst[] = [];
    const relationships: XsdSchemaAst['relationships'][number][] = [];
    const supported: XsdXmlElementAst[] = [
      ...annotationData.elements,
      ...misplacedRestrictionChildren(root),
    ];
    for (const child of xsdChildElements(root)) {
      if (
        child.localName === 'include' ||
        child.localName === 'import' ||
        child.localName === 'redefine'
      ) {
        const schemaLocation = attribute(child, 'schemaLocation');
        const namespace = attribute(child, 'namespace');
        relationships.push({
          kind: child.localName,
          ...(schemaLocation === undefined
            ? {}
            : {
                schemaLocation: {
                  value: schemaLocation.value,
                  lexicalValue: schemaLocation.rawValue,
                  range: schemaLocation.valueContentRange,
                },
              }),
          ...(namespace === undefined
            ? {}
            : {
                namespace: {
                  value: namespace.value,
                  lexicalValue: namespace.rawValue,
                  range: namespace.valueContentRange,
                },
              }),
          range: child.range,
          startTagRange: child.startTagRange,
          sourceOrder: child.sourceOrder,
          xml: child,
        });
        supported.push(child);
      } else if (child.localName === 'element') {
        declarations.push(parseGlobalElement(child));
        supported.push(child);
      } else if (child.localName === 'complexType') {
        declarations.push(parseComplexType(child, true));
        supported.push(child);
      } else if (child.localName === 'simpleType') {
        declarations.push(parseSimpleType(child, true));
        supported.push(child);
      } else if (child.localName === 'attribute') {
        declarations.push(parseGlobalAttribute(child));
        supported.push(child);
      }
    }
    declarations.sort((left, right) => left.sourceOrder - right.sourceOrder);
    return {
      kind: 'schema',
      document: xmlResult.document,
      annotations: annotationData.annotations,
      ...(optionalSchemaValue(root, 'targetNamespace') === undefined
        ? {}
        : {
            targetNamespace: optionalSchemaValue(root, 'targetNamespace')!,
          }),
      elementFormDefault: formDefault(root, 'elementFormDefault'),
      attributeFormDefault: formDefault(root, 'attributeFormDefault'),
      ...(optionalSchemaValue(root, 'version') === undefined
        ? {}
        : { version: optionalSchemaValue(root, 'version')! }),
      declarations,
      relationships: relationships.sort(
        (left, right) => left.sourceOrder - right.sourceOrder,
      ),
      deferredComponents: deferredChildren(root, supported),
      range: root.range,
      startTagRange: root.startTagRange,
      sourceOrder: root.sourceOrder,
      xml: root,
    };
  }

  const root = xmlResult.document.root;
  let schema: XsdSchemaAst | undefined;
  if (root) {
    if (root.localName !== 'schema') {
      diagnose(
        'non-schema-root',
        'error',
        `Root element <${root.qualifiedName}> is not an XSD schema`,
        root.startTagRange,
      );
    } else if (root.namespaceUri !== xmlSchemaNamespaceUri) {
      diagnose(
        'wrong-schema-namespace',
        'error',
        `Root element <${root.qualifiedName}> is not in the XML Schema namespace`,
        root.startTagRange,
      );
    } else {
      schema = parseSchema(root);
    }
  }

  const sortedDiagnostics = sortXsdDiagnostics(diagnostics);
  return {
    status: sortedDiagnostics.some(({ severity }) => severity === 'error')
      ? 'failure'
      : 'success',
    ...(schema === undefined ? {} : { schema }),
    document: xmlResult.document,
    diagnostics: sortedDiagnostics,
  };
}
