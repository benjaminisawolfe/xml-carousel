import type { SchemaSourceRange } from '../model';
import {
  xmlNamespaceUri,
  type XsdXmlAttributeAst,
  type XsdXmlElementAst,
  type XsdXmlNodeAst,
} from '../xsd';
import {
  relaxNgCompatibilityAnnotationsNamespace,
  relaxNgStructureNamespace,
  type RelaxNgAnnotationAttribute,
  type RelaxNgCombine,
  type RelaxNgContextValue,
  type RelaxNgDefineClause,
  type RelaxNgDefinitionGroup,
  type RelaxNgDocumentation,
  type RelaxNgEffectiveStart,
  type RelaxNgForeignAnnotation,
  type RelaxNgGrammarScope,
  type RelaxNgIncludeComponent,
  type RelaxNgNameClass,
  type RelaxNgParam,
  type RelaxNgPattern,
  type RelaxNgSemanticBinding,
  type RelaxNgSemanticBuildInput,
  type RelaxNgSemanticBuildResult,
  type RelaxNgSemanticDocument,
  type RelaxNgSemanticFinding,
  type RelaxNgSemanticModel,
  type RelaxNgSemanticPackageRelationship,
  type RelaxNgStartClause,
} from './relaxNgSemanticModel';
import { parseRelaxNgSource } from './relaxNgSourceParser';

interface SemanticContext {
  readonly sourceFileId: string;
  readonly path: string;
  readonly documentId: string;
  readonly grammarId?: string;
  readonly ns: string;
  readonly datatypeLibrary: string;
}

interface MutableGrammar {
  readonly id: string;
  readonly documentId: string;
  readonly patternId: string;
  readonly sourceFileId: string;
  readonly range: SchemaSourceRange;
  readonly sourceOrder: number;
  readonly parentGrammarId?: string;
  readonly owningPatternId?: string;
  readonly startClauseIds: string[];
  readonly definitionGroupIds: string[];
  readonly includeIds: string[];
}

interface RelationshipCursor {
  readonly values: readonly RelaxNgSemanticPackageRelationship[];
  index: number;
}

function encode(value: string): string {
  return encodeURIComponent(value);
}

function sourceId(sourceFileId: string, kind: string, order: number): string {
  return `rng-semantic:${encode(sourceFileId)}:${kind}:${order}`;
}

function syntheticId(ownerId: string, kind: string, name = ''): string {
  return `${ownerId}:${kind}${name ? `:${encode(name)}` : ''}`;
}

function attr(
  element: XsdXmlElementAst,
  localName: string,
): XsdXmlAttributeAst | undefined {
  return element.attributes.find(
    (attribute) =>
      attribute.namespaceUri === undefined && attribute.localName === localName,
  );
}

function combineValue(
  attribute: XsdXmlAttributeAst | undefined,
): RelaxNgCombine | undefined {
  return attribute?.value === 'choice' || attribute?.value === 'interleave'
    ? attribute.value
    : undefined;
}

function rngChildren(element: XsdXmlElementAst): XsdXmlElementAst[] {
  return element.children.filter(
    (child): child is XsdXmlElementAst =>
      child.kind === 'element' &&
      child.namespaceUri === relaxNgStructureNamespace,
  );
}

function textNodes(
  element: XsdXmlElementAst,
): readonly Extract<XsdXmlNodeAst, { readonly kind: 'text' | 'cdata' }>[] {
  return element.children.filter(
    (
      child,
    ): child is Extract<XsdXmlNodeAst, { readonly kind: 'text' | 'cdata' }> =>
      child.kind === 'text' || child.kind === 'cdata',
  );
}

function lexicalText(element: XsdXmlElementAst): string {
  return textNodes(element)
    .map((child) => child.value)
    .join('');
}

function sourceLexicalText(element: XsdXmlElementAst): string {
  return textNodes(element)
    .map((child) => child.raw)
    .join('');
}

function descendantText(element: XsdXmlElementAst): string {
  return element.children
    .map((child) =>
      child.kind === 'text' || child.kind === 'cdata'
        ? child.value
        : child.kind === 'element'
          ? descendantText(child)
          : '',
    )
    .join('');
}

function textRange(element: XsdXmlElementAst): SchemaSourceRange | undefined {
  const nodes = textNodes(element);
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (!first || !last) return undefined;
  return {
    start: { ...first.range.start },
    end: { ...last.range.end },
    ...(first.range.sourceId === undefined
      ? {}
      : { sourceId: first.range.sourceId }),
  };
}

function contextValue(
  element: XsdXmlElementAst,
  name: 'ns' | 'datatypeLibrary',
  inherited: string,
): RelaxNgContextValue {
  const attribute = attr(element, name);
  return {
    ...(attribute === undefined ? {} : { explicit: attribute.value }),
    effective: attribute?.value ?? inherited,
    ...(attribute === undefined ? {} : { range: attribute.valueContentRange }),
  };
}

function plainAnnotationAttributes(
  element: XsdXmlElementAst,
): readonly RelaxNgAnnotationAttribute[] {
  return element.attributes.map((attribute) => ({
    qualifiedName: attribute.qualifiedName,
    ...(attribute.namespaceUri === undefined
      ? {}
      : { namespaceUri: attribute.namespaceUri }),
    localName: attribute.localName,
    value: attribute.value,
    range: attribute.range,
    sourceOrder: attribute.sourceOrder,
  }));
}

export function buildRelaxNgSemanticModel(
  input: RelaxNgSemanticBuildInput,
): RelaxNgSemanticBuildResult {
  const documents: RelaxNgSemanticDocument[] = [];
  const mutableGrammars: MutableGrammar[] = [];
  const startClauses: RelaxNgStartClause[] = [];
  const defineClauses: RelaxNgDefineClause[] = [];
  const patterns: RelaxNgPattern[] = [];
  const nameClasses: RelaxNgNameClass[] = [];
  const params: RelaxNgParam[] = [];
  const includes: RelaxNgIncludeComponent[] = [];
  const annotations: RelaxNgForeignAnnotation[] = [];
  const documentation: RelaxNgDocumentation[] = [];
  const findings: RelaxNgSemanticFinding[] = [];
  const bindings: RelaxNgSemanticBinding[] = [];
  const relationshipCursors = new Map<string, RelationshipCursor>();

  for (const relationship of input.relationships ?? []) {
    const key = [
      relationship.sourcePath,
      relationship.kind,
      relationship.rawTarget,
    ].join('\u0000');
    const existing = relationshipCursors.get(key);
    relationshipCursors.set(key, {
      values: [...(existing?.values ?? []), relationship],
      index: existing?.index ?? 0,
    });
  }

  const documentIdByPath = new Map<string, string>();
  const rootPatternIdByPath = new Map<string, string>();
  const grammarIdByPath = new Map<string, string>();

  const bySourceOrder = <
    T extends {
      readonly sourceFileId: string;
      readonly sourceOrder: number;
      readonly id: string;
    },
  >(
    left: T,
    right: T,
  ): number =>
    left.sourceFileId.localeCompare(right.sourceFileId) ||
    left.sourceOrder - right.sourceOrder ||
    left.id.localeCompare(right.id);

  function relationshipFor(
    path: string,
    kind: 'rng-include' | 'rng-external-ref',
    rawTarget: string,
  ): RelaxNgSemanticPackageRelationship | undefined {
    const cursor = relationshipCursors.get(
      [path, kind, rawTarget].join('\u0000'),
    );
    if (!cursor) return undefined;
    const value = cursor.values[cursor.index];
    cursor.index += value === undefined ? 0 : 1;
    return value;
  }

  function finding(
    code: RelaxNgSemanticFinding['code'],
    message: string,
    details: Partial<
      Pick<RelaxNgSemanticFinding, 'sourceFileId' | 'constructId' | 'range'>
    > = {},
  ): void {
    findings.push({
      id: `rng-semantic:finding:${findings.length}`,
      code,
      message,
      ...details,
    });
  }

  function collectAnnotation(
    element: XsdXmlElementAst,
    ownerId: string,
    sourceFileId: string,
  ): string {
    const id = sourceId(sourceFileId, 'annotation', element.sourceOrder);
    const text = descendantText(element);
    annotations.push({
      id,
      ownerId,
      sourceFileId,
      range: element.range,
      sourceOrder: element.sourceOrder,
      ...(element.namespaceUri === undefined
        ? {}
        : { namespaceUri: element.namespaceUri }),
      localName: element.localName,
      qualifiedName: element.qualifiedName,
      attributes: plainAnnotationAttributes(element),
      text,
    });
    if (
      element.namespaceUri === relaxNgCompatibilityAnnotationsNamespace &&
      element.localName === 'documentation'
    ) {
      const xmlLang = element.attributes.find(
        (attribute) =>
          attribute.namespaceUri === xmlNamespaceUri &&
          attribute.localName === 'lang',
      );
      documentation.push({
        id: `${id}:documentation`,
        ownerId,
        sourceFileId,
        range: element.range,
        sourceOrder: element.sourceOrder,
        text,
        ...(xmlLang === undefined ? {} : { xmlLang: xmlLang.value }),
      });
    }
    return id;
  }

  function collectOwnedAnnotations(
    element: XsdXmlElementAst,
    ownerId: string,
    sourceFileId: string,
  ): string[] {
    const ids = element.children
      .filter(
        (child): child is XsdXmlElementAst =>
          child.kind === 'element' &&
          child.namespaceUri !== relaxNgStructureNamespace,
      )
      .map((child) => collectAnnotation(child, ownerId, sourceFileId));
    for (const attribute of element.attributes) {
      if (
        attribute.namespaceUri === undefined ||
        attribute.namespaceUri === 'http://www.w3.org/2000/xmlns/' ||
        attribute.namespaceUri === xmlNamespaceUri
      ) {
        continue;
      }
      const id = sourceId(
        sourceFileId,
        'foreign-attribute',
        attribute.sourceOrder,
      );
      annotations.push({
        id,
        ownerId,
        sourceFileId,
        range: attribute.range,
        sourceOrder: attribute.sourceOrder,
        namespaceUri: attribute.namespaceUri,
        localName: attribute.localName,
        qualifiedName: attribute.qualifiedName,
        attributes: [],
        text: attribute.value,
      });
      ids.push(id);
    }
    return ids;
  }

  function nameContext(
    element: XsdXmlElementAst,
    parent: SemanticContext,
  ): {
    readonly ns: RelaxNgContextValue;
    readonly datatypeLibrary: RelaxNgContextValue;
  } {
    return {
      ns: contextValue(element, 'ns', parent.ns),
      datatypeLibrary: contextValue(
        element,
        'datatypeLibrary',
        parent.datatypeLibrary,
      ),
    };
  }

  function expandedLexicalName(
    lexicalName: string,
    element: XsdXmlElementAst,
    effectiveNs: string,
    attributeName: boolean,
  ): { readonly localName?: string; readonly namespaceUri?: string } {
    const separator = lexicalName.indexOf(':');
    if (separator > 0 && separator === lexicalName.lastIndexOf(':')) {
      const prefix = lexicalName.slice(0, separator);
      const localName = lexicalName.slice(separator + 1);
      const namespaceUri = element.namespaceBindings[prefix];
      return {
        localName,
        ...(namespaceUri === undefined ? {} : { namespaceUri }),
      };
    }
    return {
      ...(lexicalName.length === 0 ? {} : { localName: lexicalName }),
      ...((attributeName && attr(element, 'ns') === undefined) ||
      effectiveNs.length === 0
        ? {}
        : { namespaceUri: effectiveNs }),
    };
  }

  function parseNameClass(
    element: XsdXmlElementAst,
    ownerPatternId: string,
    parent: SemanticContext,
    attributeName: boolean,
    shorthand?: XsdXmlAttributeAst,
  ): string {
    const id = sourceId(
      parent.sourceFileId,
      `name-class-${shorthand ? 'name' : element.localName}`,
      shorthand?.sourceOrder ?? element.sourceOrder,
    );
    const contexts = nameContext(element, parent);
    const annotationIds = shorthand
      ? []
      : collectOwnedAnnotations(element, id, parent.sourceFileId);
    if (shorthand || element.localName === 'name') {
      const lexicalName = shorthand?.value ?? lexicalText(element).trim();
      const expanded = expandedLexicalName(
        lexicalName,
        element,
        contexts.ns.effective,
        attributeName,
      );
      nameClasses.push({
        id,
        kind: 'name',
        ownerPatternId,
        sourceFileId: parent.sourceFileId,
        range: shorthand?.range ?? element.range,
        sourceOrder: shorthand?.sourceOrder ?? element.sourceOrder,
        annotations: annotationIds,
        lexicalName,
        lexicalNameRange: shorthand?.valueContentRange ?? textRange(element),
        ...expanded,
        ...(contexts.ns.explicit === undefined
          ? {}
          : { explicitNs: contexts.ns.explicit }),
        effectiveNs:
          attributeName && contexts.ns.explicit === undefined
            ? ''
            : contexts.ns.effective,
      });
      return id;
    }
    if (element.localName === 'choice') {
      const childNameClassIds = rngChildren(element)
        .filter((child) => child.localName !== 'except')
        .map((child) =>
          parseNameClass(
            child,
            ownerPatternId,
            { ...parent, ns: contexts.ns.effective },
            attributeName,
          ),
        );
      nameClasses.push({
        id,
        kind: 'choice',
        ownerPatternId,
        sourceFileId: parent.sourceFileId,
        range: element.range,
        sourceOrder: element.sourceOrder,
        annotations: annotationIds,
        childNameClassIds,
      });
      return id;
    }
    const except = rngChildren(element).find(
      (child) => child.localName === 'except',
    );
    const exceptChild = except
      ? rngChildren(except).find((child) =>
          ['name', 'anyName', 'nsName', 'choice'].includes(child.localName),
        )
      : undefined;
    const exceptNameClassId = exceptChild
      ? parseNameClass(
          exceptChild,
          ownerPatternId,
          { ...parent, ns: contexts.ns.effective },
          attributeName,
        )
      : undefined;
    if (element.localName === 'nsName') {
      nameClasses.push({
        id,
        kind: 'nsName',
        ownerPatternId,
        sourceFileId: parent.sourceFileId,
        range: element.range,
        sourceOrder: element.sourceOrder,
        annotations: annotationIds,
        ...(contexts.ns.explicit === undefined
          ? {}
          : { explicitNs: contexts.ns.explicit }),
        effectiveNs: contexts.ns.effective,
        ...(exceptNameClassId === undefined ? {} : { exceptNameClassId }),
      });
      return id;
    }
    nameClasses.push({
      id,
      kind: 'anyName',
      ownerPatternId,
      sourceFileId: parent.sourceFileId,
      range: element.range,
      sourceOrder: element.sourceOrder,
      annotations: annotationIds,
      ...(exceptNameClassId === undefined ? {} : { exceptNameClassId }),
    });
    return id;
  }

  function parsePattern(
    element: XsdXmlElementAst,
    parent: SemanticContext,
    parentGrammarId?: string,
    owningPatternId?: string,
  ): string | undefined {
    if (element.namespaceUri !== relaxNgStructureNamespace) return undefined;
    const id = sourceId(
      parent.sourceFileId,
      `pattern-${element.localName}`,
      element.sourceOrder,
    );
    const contexts = nameContext(element, parent);
    const next: SemanticContext = {
      ...parent,
      grammarId: parent.grammarId,
      ns: contexts.ns.effective,
      datatypeLibrary: contexts.datatypeLibrary.effective,
    };
    const annotationIds = collectOwnedAnnotations(
      element,
      id,
      parent.sourceFileId,
    );
    const base = {
      id,
      sourceFileId: parent.sourceFileId,
      range: element.range,
      sourceOrder: element.sourceOrder,
      ...(parent.grammarId === undefined
        ? {}
        : { grammarId: parent.grammarId }),
      annotations: annotationIds,
      ns: contexts.ns,
      datatypeLibrary: contexts.datatypeLibrary,
    } as const;

    if (element.localName === 'grammar') {
      const grammarId = sourceId(
        parent.sourceFileId,
        'grammar',
        element.sourceOrder,
      );
      patterns.push({ ...base, kind: 'grammar', grammarScopeId: grammarId });
      const grammar: MutableGrammar = {
        id: grammarId,
        documentId: parent.documentId,
        patternId: id,
        sourceFileId: parent.sourceFileId,
        range: element.range,
        sourceOrder: element.sourceOrder,
        ...(parentGrammarId === undefined ? {} : { parentGrammarId }),
        ...(owningPatternId === undefined ? {} : { owningPatternId }),
        startClauseIds: [],
        definitionGroupIds: [],
        includeIds: [],
      };
      mutableGrammars.push(grammar);
      parseGrammarComponents(element, grammar, { ...next, grammarId });
      return id;
    }

    if (element.localName === 'element' || element.localName === 'attribute') {
      const shorthand = attr(element, 'name');
      const explicitNameClass = rngChildren(element).find((child) =>
        ['name', 'anyName', 'nsName', 'choice'].includes(child.localName),
      );
      if (!shorthand && !explicitNameClass) {
        finding(
          'semantic-unsupported-valid-construct',
          `The ${element.localName} pattern has no extractable name class.`,
          {
            sourceFileId: parent.sourceFileId,
            constructId: id,
            range: element.range,
          },
        );
        return undefined;
      }
      const nameClassId = shorthand
        ? parseNameClass(
            element,
            id,
            next,
            element.localName === 'attribute',
            shorthand,
          )
        : parseNameClass(
            explicitNameClass!,
            id,
            next,
            element.localName === 'attribute',
          );
      const patternChildren = rngChildren(element).filter(
        (child) => child !== explicitNameClass,
      );
      const childPatternIds = patternChildren.flatMap((child) => {
        const childId = parsePattern(child, next, parent.grammarId, id);
        return childId ? [childId] : [];
      });
      if (element.localName === 'element') {
        patterns.push({
          ...base,
          kind: 'element',
          nameClassId,
          contentPatternIds: childPatternIds,
        });
      } else {
        const defaultValue = element.attributes.find(
          (attribute) =>
            attribute.namespaceUri ===
              relaxNgCompatibilityAnnotationsNamespace &&
            attribute.localName === 'defaultValue',
        );
        patterns.push({
          ...base,
          kind: 'attribute',
          nameClassId,
          valuePatternIds: childPatternIds,
          ...(defaultValue === undefined
            ? {}
            : {
                defaultValue: {
                  lexicalValue: defaultValue.value,
                  range: defaultValue.valueContentRange,
                },
              }),
        });
      }
      return id;
    }

    if (
      [
        'choice',
        'group',
        'interleave',
        'optional',
        'zeroOrMore',
        'oneOrMore',
        'mixed',
        'list',
      ].includes(element.localName)
    ) {
      const childPatternIds = rngChildren(element).flatMap((child) => {
        const childId = parsePattern(child, next, parent.grammarId, id);
        return childId ? [childId] : [];
      });
      patterns.push({
        ...base,
        kind: element.localName as
          | 'choice'
          | 'group'
          | 'interleave'
          | 'optional'
          | 'zeroOrMore'
          | 'oneOrMore'
          | 'mixed'
          | 'list',
        childPatternIds,
      });
      return id;
    }

    if (['text', 'empty', 'notAllowed'].includes(element.localName)) {
      patterns.push({
        ...base,
        kind: element.localName as 'text' | 'empty' | 'notAllowed',
      });
      return id;
    }

    if (element.localName === 'data') {
      const typeAttribute = attr(element, 'type');
      const paramIds: string[] = [];
      const exceptPatternIds: string[] = [];
      for (const child of rngChildren(element)) {
        if (child.localName === 'param') {
          const nameAttribute = attr(child, 'name');
          const paramId = sourceId(
            parent.sourceFileId,
            'param',
            child.sourceOrder,
          );
          params.push({
            id: paramId,
            ownerPatternId: id,
            sourceFileId: parent.sourceFileId,
            range: child.range,
            sourceOrder: child.sourceOrder,
            name: nameAttribute?.value ?? '',
            value: lexicalText(child),
            sourceValue: sourceLexicalText(child),
            ...(nameAttribute === undefined
              ? {}
              : { nameRange: nameAttribute.valueContentRange }),
            ...(textRange(child) === undefined
              ? {}
              : { valueRange: textRange(child) }),
          });
          paramIds.push(paramId);
        } else if (child.localName === 'except') {
          for (const exceptChild of rngChildren(child)) {
            const exceptId = parsePattern(
              exceptChild,
              next,
              parent.grammarId,
              id,
            );
            if (exceptId) exceptPatternIds.push(exceptId);
          }
        }
      }
      patterns.push({
        ...base,
        kind: 'data',
        type: typeAttribute?.value ?? '',
        ...(typeAttribute === undefined
          ? {}
          : { typeRange: typeAttribute.valueContentRange }),
        paramIds,
        exceptPatternIds,
      });
      return id;
    }

    if (element.localName === 'value') {
      const typeAttribute = attr(element, 'type');
      patterns.push({
        ...base,
        kind: 'value',
        lexicalValue: lexicalText(element),
        sourceLexicalValue: sourceLexicalText(element),
        ...(textRange(element) === undefined
          ? {}
          : { valueRange: textRange(element) }),
        type: typeAttribute?.value ?? 'token',
        namespaceBindings: { ...element.namespaceBindings },
      });
      return id;
    }

    if (element.localName === 'ref' || element.localName === 'parentRef') {
      const nameAttribute = attr(element, 'name');
      if (element.localName === 'ref') {
        patterns.push({
          ...base,
          kind: 'ref',
          name: nameAttribute?.value ?? '',
          ...(nameAttribute === undefined
            ? {}
            : { nameRange: nameAttribute.valueContentRange }),
        });
      } else {
        const grammar = mutableGrammars.find(
          ({ id }) => id === parent.grammarId,
        );
        patterns.push({
          ...base,
          kind: 'parentRef',
          name: nameAttribute?.value ?? '',
          ...(nameAttribute === undefined
            ? {}
            : { nameRange: nameAttribute.valueContentRange }),
          ...(grammar?.parentGrammarId === undefined
            ? {}
            : { parentGrammarId: grammar.parentGrammarId }),
        });
      }
      return id;
    }

    if (element.localName === 'externalRef') {
      const href = attr(element, 'href');
      const relationship = relationshipFor(
        parent.path,
        'rng-external-ref',
        href?.value ?? '',
      );
      patterns.push({
        ...base,
        kind: 'externalRef',
        rawHref: href?.value ?? '',
        ...(href === undefined ? {} : { hrefRange: href.valueContentRange }),
        ...(relationship === undefined
          ? {}
          : {
              packageRelationshipId: relationship.id,
              resolution: relationship.status,
            }),
      });
      return id;
    }

    finding(
      'semantic-unsupported-valid-construct',
      `The accepted RELAX NG construct ${element.localName} was retained only through its source range.`,
      {
        sourceFileId: parent.sourceFileId,
        constructId: id,
        range: element.range,
      },
    );
    return undefined;
  }

  function parseStart(
    element: XsdXmlElementAst,
    grammar: MutableGrammar,
    context: SemanticContext,
    includeId?: string,
  ): string {
    const id = sourceId(
      context.sourceFileId,
      'start-clause',
      element.sourceOrder,
    );
    const combine = attr(element, 'combine');
    collectOwnedAnnotations(element, id, context.sourceFileId);
    const bodyPatternIds = rngChildren(element).flatMap((child) => {
      const childId = parsePattern(
        child,
        context,
        grammar.id,
        grammar.patternId,
      );
      return childId ? [childId] : [];
    });
    startClauses.push({
      id,
      grammarId: grammar.id,
      sourceFileId: context.sourceFileId,
      range: element.range,
      sourceOrder: element.sourceOrder,
      ...(combineValue(combine) === undefined
        ? {}
        : { combine: combineValue(combine) }),
      ...(combine === undefined
        ? {}
        : { combineRange: combine.valueContentRange }),
      bodyPatternIds,
      ...(includeId === undefined ? {} : { includeId }),
    });
    grammar.startClauseIds.push(id);
    return id;
  }

  function parseDefine(
    element: XsdXmlElementAst,
    grammar: MutableGrammar,
    context: SemanticContext,
    includeId?: string,
  ): string {
    const id = sourceId(
      context.sourceFileId,
      'define-clause',
      element.sourceOrder,
    );
    const name = attr(element, 'name');
    const combine = attr(element, 'combine');
    collectOwnedAnnotations(element, id, context.sourceFileId);
    const bodyPatternIds = rngChildren(element).flatMap((child) => {
      const childId = parsePattern(
        child,
        context,
        grammar.id,
        grammar.patternId,
      );
      return childId ? [childId] : [];
    });
    defineClauses.push({
      id,
      grammarId: grammar.id,
      sourceFileId: context.sourceFileId,
      range: element.range,
      sourceOrder: element.sourceOrder,
      name: name?.value ?? '',
      ...(name === undefined ? {} : { nameRange: name.valueContentRange }),
      ...(combineValue(combine) === undefined
        ? {}
        : { combine: combineValue(combine) }),
      ...(combine === undefined
        ? {}
        : { combineRange: combine.valueContentRange }),
      bodyPatternIds,
      ...(includeId === undefined ? {} : { includeId }),
    });
    return id;
  }

  function parseInclude(
    element: XsdXmlElementAst,
    grammar: MutableGrammar,
    context: SemanticContext,
  ): void {
    const id = sourceId(context.sourceFileId, 'include', element.sourceOrder);
    const href = attr(element, 'href');
    const relationship = relationshipFor(
      context.path,
      'rng-include',
      href?.value ?? '',
    );
    const annotationIds = collectOwnedAnnotations(
      element,
      id,
      context.sourceFileId,
    );
    const overrideStartClauseIds: string[] = [];
    const overrideDefineClauseIds: string[] = [];
    const visit = (owner: XsdXmlElementAst): void => {
      for (const child of rngChildren(owner)) {
        if (child.localName === 'start') {
          overrideStartClauseIds.push(parseStart(child, grammar, context, id));
        } else if (child.localName === 'define') {
          overrideDefineClauseIds.push(
            parseDefine(child, grammar, context, id),
          );
        } else if (child.localName === 'div') {
          visit(child);
        }
      }
    };
    visit(element);
    includes.push({
      id,
      grammarId: grammar.id,
      sourceFileId: context.sourceFileId,
      range: element.range,
      sourceOrder: element.sourceOrder,
      rawHref: href?.value ?? '',
      ...(href === undefined ? {} : { hrefRange: href.valueContentRange }),
      ...(relationship === undefined
        ? {}
        : {
            packageRelationshipId: relationship.id,
            resolution: relationship.status,
          }),
      overrideStartClauseIds,
      overrideDefineClauseIds,
      annotationIds,
    });
    grammar.includeIds.push(id);
  }

  function parseGrammarComponents(
    element: XsdXmlElementAst,
    grammar: MutableGrammar,
    context: SemanticContext,
  ): void {
    for (const child of rngChildren(element)) {
      if (child.localName === 'start') parseStart(child, grammar, context);
      else if (child.localName === 'define')
        parseDefine(child, grammar, context);
      else if (child.localName === 'include')
        parseInclude(child, grammar, context);
      else if (child.localName === 'div')
        parseGrammarComponents(child, grammar, context);
    }
  }

  for (const source of [...input.sources].sort((left, right) =>
    left.path.localeCompare(right.path),
  )) {
    try {
      const parsed = parseRelaxNgSource(
        source.sourceText,
        source.sourceFileId,
        source.path,
      );
      const root = parsed.document.root;
      if (!root || root.namespaceUri !== relaxNgStructureNamespace) {
        finding(
          'semantic-extractor-internal',
          'The standards-accepted RELAX NG source did not expose a structure-namespace root to the semantic extractor.',
          { sourceFileId: source.sourceFileId },
        );
        continue;
      }
      const documentId = `rng-semantic:${encode(source.sourceFileId)}:document`;
      documentIdByPath.set(source.path, documentId);
      const rootPatternId = parsePattern(root, {
        sourceFileId: source.sourceFileId,
        path: source.path,
        documentId,
        ns: '',
        datatypeLibrary: '',
      });
      if (!rootPatternId) continue;
      rootPatternIdByPath.set(source.path, rootPatternId);
      const rootPattern = patterns.find(({ id }) => id === rootPatternId);
      const grammarId =
        rootPattern?.kind === 'grammar'
          ? rootPattern.grammarScopeId
          : undefined;
      if (grammarId) grammarIdByPath.set(source.path, grammarId);
      documents.push({
        id: documentId,
        sourceFileId: source.sourceFileId,
        path: source.path,
        rootPatternId,
        ...(grammarId === undefined ? {} : { grammarId }),
        range: root.range,
        sourceOrder: root.sourceOrder,
        status: 'eligible',
      });
    } catch {
      finding(
        'semantic-extractor-internal',
        'Semantic extraction failed after standards validation; the standards result remains authoritative.',
        { sourceFileId: source.sourceFileId },
      );
    }
  }

  const definitionGroups: RelaxNgDefinitionGroup[] = [];
  const groupByGrammarAndName = new Map<string, RelaxNgDefinitionGroup>();
  for (const grammar of mutableGrammars) {
    const names = [
      ...new Set(
        defineClauses
          .filter((clause) => clause.grammarId === grammar.id)
          .map((clause) => clause.name),
      ),
    ].sort();
    for (const name of names) {
      const clauses = defineClauses.filter(
        (clause) => clause.grammarId === grammar.id && clause.name === name,
      );
      const combines = clauses.flatMap((clause) =>
        clause.combine === undefined ? [] : [clause.combine],
      );
      const group: RelaxNgDefinitionGroup = {
        id: syntheticId(grammar.id, 'definition-group', name),
        grammarId: grammar.id,
        name,
        clauseIds: clauses.map(({ id }) => id),
        ...(combines[0] === undefined ? {} : { effectiveCombine: combines[0] }),
        contributionGroupIds: [],
      };
      definitionGroups.push(group);
      groupByGrammarAndName.set(`${grammar.id}\u0000${name}`, group);
      grammar.definitionGroupIds.push(group.id);
    }
  }

  const includeById = new Map(includes.map((include) => [include.id, include]));
  const grammarById = new Map(
    mutableGrammars.map((grammar) => [grammar.id, grammar]),
  );
  for (let index = 0; index < includes.length; index += 1) {
    const include = includes[index]!;
    const relationship = (input.relationships ?? []).find(
      ({ id }) => id === include.packageRelationshipId,
    );
    if (relationship?.status !== 'resolved' || !relationship.targetPath)
      continue;
    const resolvedDocumentId = documentIdByPath.get(relationship.targetPath);
    const resolvedGrammarId = grammarIdByPath.get(relationship.targetPath);
    includes[index] = {
      ...include,
      ...(resolvedDocumentId === undefined ? {} : { resolvedDocumentId }),
      ...(resolvedGrammarId === undefined ? {} : { resolvedGrammarId }),
    };
    if (resolvedGrammarId) {
      bindings.push({
        id: `rng-semantic:binding:${bindings.length}`,
        kind: 'include',
        sourceId: include.id,
        targetId: resolvedGrammarId,
      });
    }
  }

  function contributedGroups(
    grammarId: string,
    visited = new Set<string>(),
  ): RelaxNgDefinitionGroup[] {
    if (visited.has(grammarId)) return [];
    visited.add(grammarId);
    const grammar = grammarById.get(grammarId);
    if (!grammar) return [];
    const result: RelaxNgDefinitionGroup[] = [];
    for (const includeId of grammar.includeIds) {
      const targetGrammarId =
        includeById.get(includeId)?.resolvedGrammarId ??
        includes.find(({ id }) => id === includeId)?.resolvedGrammarId;
      if (!targetGrammarId) continue;
      result.push(
        ...definitionGroups.filter(
          ({ grammarId: owner }) => owner === targetGrammarId,
        ),
        ...contributedGroups(targetGrammarId, new Set(visited)),
      );
    }
    return result;
  }

  for (const grammar of mutableGrammars) {
    const overrideNames = new Set(
      defineClauses
        .filter(
          (clause) =>
            clause.grammarId === grammar.id && clause.includeId !== undefined,
        )
        .map(({ name }) => name),
    );
    const byName = new Map<string, string[]>();
    for (const group of contributedGroups(grammar.id)) {
      if (overrideNames.has(group.name)) continue;
      const ids = byName.get(group.name) ?? [];
      if (!ids.includes(group.id)) ids.push(group.id);
      byName.set(group.name, ids);
    }
    for (const [name, contributionGroupIds] of [...byName].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const key = `${grammar.id}\u0000${name}`;
      const existing = groupByGrammarAndName.get(key);
      if (existing) {
        const replacement = { ...existing, contributionGroupIds };
        definitionGroups[definitionGroups.indexOf(existing)] = replacement;
        groupByGrammarAndName.set(key, replacement);
      } else {
        const group: RelaxNgDefinitionGroup = {
          id: syntheticId(grammar.id, 'definition-group', name),
          grammarId: grammar.id,
          name,
          clauseIds: [],
          contributionGroupIds,
        };
        definitionGroups.push(group);
        groupByGrammarAndName.set(key, group);
        grammar.definitionGroupIds.push(group.id);
      }
    }
  }

  const effectiveStarts: RelaxNgEffectiveStart[] = mutableGrammars.flatMap(
    (grammar) => {
      const clauses = startClauses.filter(
        ({ grammarId }) => grammarId === grammar.id,
      );
      const contributionGrammarIds = grammar.includeIds.flatMap((includeId) => {
        const include = includes.find(({ id }) => id === includeId);
        if (
          !include?.resolvedGrammarId ||
          include.overrideStartClauseIds.length > 0
        )
          return [];
        return [include.resolvedGrammarId];
      });
      if (clauses.length === 0 && contributionGrammarIds.length === 0)
        return [];
      const combines = clauses.flatMap((clause) =>
        clause.combine === undefined ? [] : [clause.combine],
      );
      return [
        {
          id: syntheticId(grammar.id, 'effective-start'),
          grammarId: grammar.id,
          clauseIds: clauses.map(({ id }) => id),
          ...(combines[0] === undefined
            ? {}
            : { effectiveCombine: combines[0] }),
          contributionGrammarIds,
        },
      ];
    },
  );

  function resolveGroup(grammarId: string | undefined, name: string) {
    if (!grammarId) return undefined;
    return groupByGrammarAndName.get(`${grammarId}\u0000${name}`);
  }

  for (let index = 0; index < patterns.length; index += 1) {
    const pattern = patterns[index]!;
    if (pattern.kind === 'ref' || pattern.kind === 'parentRef') {
      const grammarId =
        pattern.kind === 'parentRef'
          ? pattern.parentGrammarId
          : pattern.grammarId;
      const group = resolveGroup(grammarId, pattern.name);
      if (group) {
        patterns[index] = { ...pattern, resolvedDefinitionGroupId: group.id };
        bindings.push({
          id: `rng-semantic:binding:${bindings.length}`,
          kind: pattern.kind,
          sourceId: pattern.id,
          targetId: group.id,
        });
      } else {
        finding(
          'semantic-unresolved-binding',
          `The semantic binder could not resolve ${pattern.kind} ${pattern.name}.`,
          {
            sourceFileId: pattern.sourceFileId,
            constructId: pattern.id,
            range: pattern.range,
          },
        );
      }
    } else if (pattern.kind === 'externalRef') {
      const relationship = (input.relationships ?? []).find(
        ({ id }) => id === pattern.packageRelationshipId,
      );
      if (relationship?.status === 'resolved' && relationship.targetPath) {
        const resolvedDocumentId = documentIdByPath.get(
          relationship.targetPath,
        );
        const resolvedRootPatternId = rootPatternIdByPath.get(
          relationship.targetPath,
        );
        patterns[index] = {
          ...pattern,
          ...(resolvedDocumentId === undefined ? {} : { resolvedDocumentId }),
          ...(resolvedRootPatternId === undefined
            ? {}
            : { resolvedRootPatternId }),
        };
        if (resolvedRootPatternId) {
          bindings.push({
            id: `rng-semantic:binding:${bindings.length}`,
            kind: 'externalRef',
            sourceId: pattern.id,
            targetId: resolvedRootPatternId,
          });
        }
      }
    }
  }

  const grammars: RelaxNgGrammarScope[] = mutableGrammars.map((grammar) => {
    const effectiveStart = effectiveStarts.find(
      ({ grammarId }) => grammarId === grammar.id,
    );
    return {
      id: grammar.id,
      documentId: grammar.documentId,
      patternId: grammar.patternId,
      sourceFileId: grammar.sourceFileId,
      range: grammar.range,
      sourceOrder: grammar.sourceOrder,
      ...(grammar.parentGrammarId === undefined
        ? {}
        : { parentGrammarId: grammar.parentGrammarId }),
      ...(grammar.owningPatternId === undefined
        ? {}
        : { owningPatternId: grammar.owningPatternId }),
      startClauseIds: [...grammar.startClauseIds],
      ...(effectiveStart === undefined
        ? {}
        : { effectiveStartId: effectiveStart.id }),
      definitionGroupIds: [...grammar.definitionGroupIds],
      includeIds: [...grammar.includeIds],
    };
  });

  const model: RelaxNgSemanticModel = {
    version: 1,
    documents: [...documents].sort(bySourceOrder),
    grammars: [...grammars].sort(bySourceOrder),
    startClauses: [...startClauses].sort(bySourceOrder),
    effectiveStarts,
    defineClauses: [...defineClauses].sort(bySourceOrder),
    definitionGroups,
    patterns: [...patterns].sort(bySourceOrder),
    nameClasses: [...nameClasses].sort(bySourceOrder),
    params: [...params].sort(bySourceOrder),
    includes: [...includes].sort(bySourceOrder),
    annotations: [...annotations].sort(bySourceOrder),
    documentation: [...documentation].sort(bySourceOrder),
    bindings,
    findings,
  };
  return { model, findings };
}
