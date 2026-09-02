import type {
  SchemaEdge,
  SchemaEdgeKind,
  SchemaNode,
  SchemaNodeSourceMarkup,
  SchemaProject,
  SchemaSourceMarkupByNodeId,
  SchemaSourceRange,
} from '../model';
import type {
  RelaxNgNameClass,
  RelaxNgPattern,
  RelaxNgSemanticId,
  RelaxNgSemanticModel,
  RelaxNgSourceIdentity,
} from './relaxNgSemanticModel';

export interface RelaxNgPresentationProjectionInput {
  readonly project: SchemaProject;
  readonly sourceMarkupByNodeId: SchemaSourceMarkupByNodeId;
  readonly semanticModel: RelaxNgSemanticModel;
}

export interface RelaxNgPresentationProjection {
  readonly project: SchemaProject;
  readonly sourceMarkupByNodeId: SchemaSourceMarkupByNodeId;
  readonly preferredInitialFocusNodeId?: string;
  readonly preferredInitialFocusNodeIdBySourceFileId: Readonly<
    Record<string, string>
  >;
}

const MAX_PRESENTATION_TEXT = 500;

function boundedText(value: string): string {
  const normalized = value.replace(/\s+/gu, ' ').trim();
  return normalized.length > MAX_PRESENTATION_TEXT
    ? `${normalized.slice(0, MAX_PRESENTATION_TEXT - 1).trimEnd()}…`
    : normalized;
}

function uniqueText(values: readonly (string | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = value?.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

function humanPatternKind(kind: RelaxNgPattern['kind']): string {
  const labels: Record<RelaxNgPattern['kind'], string> = {
    grammar: 'Grammar',
    element: 'Element',
    attribute: 'Attribute',
    choice: 'Choice',
    group: 'Group',
    interleave: 'Interleave',
    optional: 'Optional',
    zeroOrMore: 'Zero or more',
    oneOrMore: 'One or more',
    mixed: 'Mixed content',
    list: 'List',
    text: 'Text',
    empty: 'Empty',
    notAllowed: 'Not allowed',
    data: 'Datatype',
    value: 'Value',
    ref: 'Reference',
    parentRef: 'Parent reference',
    externalRef: 'External reference',
  };
  return labels[kind];
}

function nameClassSummary(
  id: RelaxNgSemanticId,
  classes: ReadonlyMap<RelaxNgSemanticId, RelaxNgNameClass>,
  visited: ReadonlySet<RelaxNgSemanticId> = new Set(),
): string {
  if (visited.has(id)) return 'recursive name class';
  const value = classes.get(id);
  if (!value) return 'unnamed';
  const nextVisited = new Set(visited).add(id);
  switch (value.kind) {
    case 'name':
      return value.lexicalName;
    case 'anyName':
      return value.exceptNameClassId ? '* except …' : '*';
    case 'nsName':
      return `${value.effectiveNs || 'no namespace'}:*${
        value.exceptNameClassId ? ' except …' : ''
      }`;
    case 'choice': {
      const choices = value.childNameClassIds
        .slice(0, 3)
        .map((childId) => nameClassSummary(childId, classes, nextVisited));
      return `${choices.join(' | ')}${
        value.childNameClassIds.length > choices.length ? ' | …' : ''
      }`;
    }
  }
}

function sourceNodeByFileId(project: SchemaProject): Map<string, SchemaNode> {
  return new Map(
    project.nodes
      .filter(
        (node): node is SchemaNode & { readonly sourceFileId: string } =>
          node.kind === 'relaxNgSchema' && node.sourceFileId !== undefined,
      )
      .map((node) => [node.sourceFileId, node]),
  );
}

function fragmentForRange(
  sourceFileId: string,
  range: SchemaSourceRange,
  project: SchemaProject,
  sourceMarkupByNodeId: SchemaSourceMarkupByNodeId,
): SchemaNodeSourceMarkup['fragments'][number] | undefined {
  const sourceNode = sourceNodeByFileId(project).get(sourceFileId);
  const sourceMarkup = sourceNode
    ? sourceMarkupByNodeId[sourceNode.id]
    : undefined;
  if (sourceMarkup?.syntax !== 'rng') return undefined;

  const container = sourceMarkup.fragments.find(
    (fragment) =>
      fragment.sourceFileId === sourceFileId &&
      fragment.range.start.offset <= range.start.offset &&
      fragment.range.end.offset >= range.end.offset,
  );
  if (!container) return undefined;
  const start = range.start.offset - container.range.start.offset;
  const end = range.end.offset - container.range.start.offset;
  if (start < 0 || end < start || end > container.text.length) return undefined;
  return {
    id: `relax-ng-semantic-source:${encodeURIComponent(sourceFileId)}:${range.start.offset}:${range.end.offset}`,
    sourceFileId,
    range: {
      start: { ...range.start },
      end: { ...range.end },
      ...(range.sourceId === undefined ? {} : { sourceId: range.sourceId }),
    },
    text: container.text.slice(start, end),
  };
}

function sourceIdentity(
  identities: readonly RelaxNgSourceIdentity[],
): Pick<SchemaNode, 'sourceFileId' | 'sourceOrder'> {
  const first = identities[0];
  return first
    ? { sourceFileId: first.sourceFileId, sourceOrder: first.sourceOrder }
    : {};
}

function patternNodeKind(pattern: RelaxNgPattern): SchemaNode['kind'] {
  switch (pattern.kind) {
    case 'element':
      return 'relaxNgElement';
    case 'attribute':
      return 'relaxNgAttribute';
    case 'ref':
    case 'parentRef':
      return 'relaxNgReference';
    case 'externalRef':
      return 'relaxNgExternalReference';
    default:
      return 'relaxNgPattern';
  }
}

function property(label: string, value: string | undefined) {
  const text = value === undefined ? '' : boundedText(value);
  return text ? { label, value: text } : undefined;
}

export function projectRelaxNgSemanticPresentation(
  input: RelaxNgPresentationProjectionInput,
): RelaxNgPresentationProjection {
  const { project, semanticModel: model } = input;
  const patterns = new Map(model.patterns.map((value) => [value.id, value]));
  const nameClasses = new Map(
    model.nameClasses.map((value) => [value.id, value]),
  );
  const grammars = new Map(model.grammars.map((value) => [value.id, value]));
  const startClauses = new Map(
    model.startClauses.map((value) => [value.id, value]),
  );
  const defineClauses = new Map(
    model.defineClauses.map((value) => [value.id, value]),
  );
  const params = new Map(model.params.map((value) => [value.id, value]));
  const documents = new Map(model.documents.map((value) => [value.id, value]));
  const annotationsByOwner = new Map<string, string[]>();
  const documentationByOwner = new Map<string, string[]>();
  const findingsByConstruct = new Map<string, string[]>();
  const grammarScopeLabel = (
    grammarId: string | undefined,
  ): string | undefined => {
    if (!grammarId) return undefined;
    const grammar = grammars.get(grammarId);
    if (!grammar) return undefined;
    return grammar.parentGrammarId
      ? 'Nested grammar'
      : documents.get(grammar.documentId)?.path
        ? `Document grammar · ${documents.get(grammar.documentId)!.path}`
        : 'Document grammar';
  };

  for (const annotation of model.annotations) {
    const values = annotationsByOwner.get(annotation.ownerId) ?? [];
    values.push(
      boundedText(
        `${annotation.qualifiedName}${annotation.text ? `: ${annotation.text}` : ''}`,
      ),
    );
    annotationsByOwner.set(annotation.ownerId, values);
  }
  for (const documentation of model.documentation) {
    const values = documentationByOwner.get(documentation.ownerId) ?? [];
    values.push(boundedText(documentation.text));
    documentationByOwner.set(documentation.ownerId, values);
  }
  for (const finding of model.findings) {
    if (!finding.constructId) continue;
    const values = findingsByConstruct.get(finding.constructId) ?? [];
    values.push(boundedText(finding.message));
    findingsByConstruct.set(finding.constructId, values);
  }

  const grammarPatternTargets = new Map<string, string>(
    model.patterns
      .filter((pattern) => pattern.kind === 'grammar')
      .map((pattern) => [pattern.id, pattern.grammarScopeId]),
  );
  const canonicalId = (id: string): string =>
    grammarPatternTargets.get(id) ?? id;
  const targetName = (id: string): string | undefined => {
    const canonical = canonicalId(id);
    const definition = model.definitionGroups.find(
      (value) => value.id === canonical,
    );
    if (definition) return definition.name;
    const document = model.documents.find(
      (value) => canonicalId(value.rootPatternId) === canonical,
    );
    if (document) return document.path;
    return model.grammars.some((value) => value.id === canonical)
      ? 'Grammar'
      : undefined;
  };

  const nodes: SchemaNode[] = [];
  const markup: Record<string, SchemaNodeSourceMarkup> = {
    ...input.sourceMarkupByNodeId,
  };

  function addMarkup(
    nodeId: string,
    identities: readonly RelaxNgSourceIdentity[],
  ): void {
    const fragments = identities
      .map((identity) =>
        fragmentForRange(
          identity.sourceFileId,
          identity.range,
          project,
          input.sourceMarkupByNodeId,
        ),
      )
      .filter(
        (value): value is SchemaNodeSourceMarkup['fragments'][number] =>
          value !== undefined,
      );
    if (fragments.length > 0) markup[nodeId] = { syntax: 'rng', fragments };
  }

  function semanticProperties(
    ownerId: string,
    values: readonly ({ label: string; value: string } | undefined)[],
  ): readonly { readonly label: string; readonly value: string }[] {
    return [
      ...values,
      ...(documentationByOwner.get(ownerId) ?? []).map((value) =>
        property('Documentation', value),
      ),
      ...(annotationsByOwner.get(ownerId) ?? []).map((value) =>
        property('Annotation', value),
      ),
      ...(findingsByConstruct.get(ownerId) ?? []).map((value) =>
        property('Semantic finding', value),
      ),
    ].filter(
      (value): value is { label: string; value: string } => value !== undefined,
    );
  }

  function nodeSearchTerms(ownerId: string, values: readonly string[]) {
    return uniqueText([
      ...values,
      ...(documentationByOwner.get(ownerId) ?? []),
      ...(annotationsByOwner.get(ownerId) ?? []),
    ]);
  }

  for (const grammar of model.grammars) {
    const document = documents.get(grammar.documentId);
    const parent = grammar.parentGrammarId
      ? grammars.get(grammar.parentGrammarId)
      : undefined;
    const properties = semanticProperties(grammar.id, [
      property(
        'Role',
        parent ? 'Nested grammar scope' : 'Document grammar scope',
      ),
      property('Document', document?.path),
      property('Start symbols', String(grammar.startClauseIds.length)),
      property('Definitions', String(grammar.definitionGroupIds.length)),
      property('Includes', String(grammar.includeIds.length)),
    ]);
    nodes.push({
      id: grammar.id,
      kind: 'relaxNgGrammar',
      name: parent ? 'Nested grammar' : 'Grammar',
      ...sourceIdentity([grammar]),
      compactDeclaration: parent ? 'nested grammar' : 'grammar',
      properties,
      searchTerms: nodeSearchTerms(grammar.id, [
        'grammar',
        document?.path ?? '',
      ]),
    });
    addMarkup(grammar.id, [grammar]);
  }

  for (const start of model.effectiveStarts) {
    const contributingClauses = start.clauseIds
      .map((id) => startClauses.get(id))
      .filter((value) => value !== undefined);
    nodes.push({
      id: start.id,
      kind: 'relaxNgStart',
      name: 'Start',
      ...sourceIdentity(contributingClauses),
      compactDeclaration: `${start.effectiveCombine ?? 'single'} start pattern`,
      properties: semanticProperties(start.id, [
        property('Role', 'Effective grammar start'),
        property('Scope', grammarScopeLabel(start.grammarId)),
        property('Combine', start.effectiveCombine ?? 'single clause'),
        property('Contributing clauses', String(start.clauseIds.length)),
      ]),
      searchTerms: nodeSearchTerms(start.id, [
        'start',
        start.effectiveCombine ?? '',
      ]),
    });
    addMarkup(start.id, contributingClauses);
  }

  for (const definition of model.definitionGroups) {
    const contributingClauses = definition.clauseIds
      .map((id) => defineClauses.get(id))
      .filter((value) => value !== undefined);
    nodes.push({
      id: definition.id,
      kind: 'relaxNgDefinition',
      name: definition.name,
      ...sourceIdentity(contributingClauses),
      compactDeclaration: `define ${definition.name}${
        definition.effectiveCombine ? ` (${definition.effectiveCombine})` : ''
      }`,
      properties: semanticProperties(definition.id, [
        property('Role', 'Named pattern definition'),
        property('Scope', grammarScopeLabel(definition.grammarId)),
        property('Combine', definition.effectiveCombine ?? 'single clause'),
        property('Contributing clauses', String(definition.clauseIds.length)),
      ]),
      searchTerms: nodeSearchTerms(definition.id, [
        definition.name,
        'define',
        definition.effectiveCombine ?? '',
      ]),
    });
    addMarkup(definition.id, contributingClauses);
  }

  for (const pattern of model.patterns) {
    if (pattern.kind === 'grammar') continue;
    const patternLabel = humanPatternKind(pattern.kind);
    let name = patternLabel;
    const details: ({ label: string; value: string } | undefined)[] = [
      property('Pattern', patternLabel),
      property('Scope', grammarScopeLabel(pattern.grammarId)),
      property('Namespace', pattern.ns.effective || undefined),
      property(
        'Datatype library',
        pattern.datatypeLibrary.effective || undefined,
      ),
    ];
    const searchTerms: string[] = [patternLabel, pattern.kind];

    switch (pattern.kind) {
      case 'element':
      case 'attribute': {
        const targetNameClass = nameClassSummary(
          pattern.nameClassId,
          nameClasses,
        );
        name = targetNameClass;
        details.push(property('Name class', targetNameClass));
        if (pattern.kind === 'element') {
          details.push(
            property(
              'Content patterns',
              String(pattern.contentPatternIds.length),
            ),
          );
        } else {
          details.push(
            property('Value patterns', String(pattern.valuePatternIds.length)),
            property('Default value', pattern.defaultValue?.lexicalValue),
          );
          if (pattern.defaultValue)
            searchTerms.push(pattern.defaultValue.lexicalValue);
        }
        searchTerms.push(targetNameClass);
        break;
      }
      case 'choice':
      case 'group':
      case 'interleave':
      case 'optional':
      case 'zeroOrMore':
      case 'oneOrMore':
      case 'mixed':
      case 'list':
        details.push(
          property('Operands', String(pattern.childPatternIds.length)),
        );
        break;
      case 'data': {
        name = `Data · ${pattern.type}`;
        const parameterSummary = pattern.paramIds
          .map((id) => params.get(id))
          .filter((value) => value !== undefined)
          .map((value) => `${value.name}=${value.value}`)
          .join(', ');
        details.push(
          property('Type', pattern.type),
          property('Parameters', parameterSummary),
          property('Except patterns', String(pattern.exceptPatternIds.length)),
        );
        searchTerms.push(
          pattern.type,
          ...pattern.paramIds.flatMap((id) => {
            const value = params.get(id);
            return value ? [value.name, value.value] : [];
          }),
        );
        break;
      }
      case 'value':
        name = `Value · ${boundedText(pattern.lexicalValue) || '(empty)'}`;
        details.push(
          property('Type', pattern.type),
          property('Value', pattern.lexicalValue || '(empty string)'),
          property(
            'Namespace bindings',
            Object.entries(pattern.namespaceBindings)
              .map(([prefix, uri]) => `${prefix || '(default)'}=${uri}`)
              .join(', '),
          ),
        );
        searchTerms.push(pattern.type, pattern.lexicalValue);
        break;
      case 'ref':
      case 'parentRef':
        name = pattern.name;
        details.push(
          property(
            'Role',
            pattern.kind === 'parentRef'
              ? 'Reference in the actual parent grammar'
              : 'Reference in the current grammar',
          ),
          property(
            'Binding',
            pattern.resolvedDefinitionGroupId
              ? `Resolved to ${targetName(pattern.resolvedDefinitionGroupId) ?? pattern.name}`
              : 'Unresolved',
          ),
        );
        searchTerms.push(pattern.name, pattern.kind);
        break;
      case 'externalRef':
        name = pattern.rawHref;
        details.push(
          property('Target', pattern.rawHref),
          property('Resolution', pattern.resolution ?? 'not resolved'),
          property(
            'Resolved document',
            pattern.resolvedDocumentId
              ? documents.get(pattern.resolvedDocumentId)?.path
              : undefined,
          ),
        );
        searchTerms.push(pattern.rawHref, pattern.resolution ?? '');
        break;
      case 'text':
      case 'empty':
      case 'notAllowed':
        break;
    }

    nodes.push({
      id: pattern.id,
      kind: patternNodeKind(pattern),
      name,
      ...sourceIdentity([pattern]),
      compactDeclaration: patternLabel,
      properties: semanticProperties(pattern.id, details),
      searchTerms: nodeSearchTerms(pattern.id, searchTerms),
    });
    addMarkup(pattern.id, [pattern]);
  }

  for (const nameClass of model.nameClasses) {
    const summary = nameClassSummary(nameClass.id, nameClasses);
    const details: ({ label: string; value: string } | undefined)[] = [
      property('Name-class kind', nameClass.kind),
      property('Name class', summary),
      property(
        'Scope',
        grammarScopeLabel(patterns.get(nameClass.ownerPatternId)?.grammarId),
      ),
    ];
    if (nameClass.kind === 'name') {
      details.push(
        property('Lexical name', nameClass.lexicalName),
        property('Local name', nameClass.localName),
        property('Namespace', nameClass.namespaceUri ?? nameClass.effectiveNs),
      );
    } else if (nameClass.kind === 'nsName') {
      details.push(
        property('Namespace', nameClass.effectiveNs || 'no namespace'),
      );
    }
    nodes.push({
      id: nameClass.id,
      kind: 'relaxNgNameClass',
      name: summary,
      ...sourceIdentity([nameClass]),
      compactDeclaration: `${nameClass.kind} name class`,
      properties: semanticProperties(nameClass.id, details),
      searchTerms: nodeSearchTerms(nameClass.id, [summary, nameClass.kind]),
    });
    addMarkup(nameClass.id, [nameClass]);
  }

  for (const include of model.includes) {
    const resolvedDocument = include.resolvedDocumentId
      ? documents.get(include.resolvedDocumentId)
      : undefined;
    nodes.push({
      id: include.id,
      kind: 'relaxNgInclude',
      name: include.rawHref,
      ...sourceIdentity([include]),
      compactDeclaration: `include ${include.rawHref}`,
      properties: semanticProperties(include.id, [
        property('Target', include.rawHref),
        property('Scope', grammarScopeLabel(include.grammarId)),
        property('Resolution', include.resolution ?? 'not resolved'),
        property('Resolved document', resolvedDocument?.path),
        property(
          'Start overrides',
          String(include.overrideStartClauseIds.length),
        ),
        property(
          'Definition overrides',
          String(include.overrideDefineClauseIds.length),
        ),
      ]),
      searchTerms: nodeSearchTerms(include.id, [
        include.rawHref,
        'include',
        include.resolution ?? '',
      ]),
    });
    addMarkup(include.id, [include]);
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges: SchemaEdge[] = [];
  const containsOrder = new Map<string, number>();
  let edgeSerial = 0;
  function addEdge(
    sourceId: string,
    targetId: string,
    kind: SchemaEdgeKind,
  ): void {
    const sourceNodeId = canonicalId(sourceId);
    const targetNodeId = canonicalId(targetId);
    const sourceExists =
      nodeIds.has(sourceNodeId) ||
      project.nodes.some(({ id }) => id === sourceNodeId);
    const targetExists =
      nodeIds.has(targetNodeId) ||
      project.nodes.some(({ id }) => id === targetNodeId);
    if (!sourceExists || !targetExists) return;
    const order =
      kind === 'contains' ? (containsOrder.get(sourceNodeId) ?? 0) : undefined;
    if (order !== undefined) containsOrder.set(sourceNodeId, order + 1);
    edges.push({
      id: `relax-ng-presentation-edge:${edgeSerial++}:${encodeURIComponent(sourceNodeId)}:${encodeURIComponent(targetNodeId)}`,
      kind,
      sourceNodeId,
      targetNodeId,
      ...(order === undefined ? {} : { order }),
    });
  }

  const sourceNodes = sourceNodeByFileId(project);
  for (const document of model.documents) {
    const sourceNode = sourceNodes.get(document.sourceFileId);
    if (!sourceNode) continue;
    const root = document.grammarId ?? canonicalId(document.rootPatternId);
    addEdge(sourceNode.id, root, 'sourceDocumentOwns');
  }

  for (const grammar of model.grammars) {
    if (grammar.effectiveStartId)
      addEdge(grammar.id, grammar.effectiveStartId, 'contains');
    for (const id of grammar.definitionGroupIds)
      addEdge(grammar.id, id, 'contains');
    for (const id of grammar.includeIds) addEdge(grammar.id, id, 'contains');
  }

  for (const start of model.effectiveStarts) {
    const bodyIds = uniqueText(
      start.clauseIds.flatMap((id) => {
        const clause = model.startClauses.find((value) => value.id === id);
        return clause?.bodyPatternIds ?? [];
      }),
    );
    for (const id of bodyIds) addEdge(start.id, id, 'contains');
  }

  for (const definition of model.definitionGroups) {
    const bodyIds = uniqueText(
      definition.clauseIds.flatMap((id) => {
        const clause = model.defineClauses.find((value) => value.id === id);
        return clause?.bodyPatternIds ?? [];
      }),
    );
    for (const id of bodyIds) addEdge(definition.id, id, 'contains');
  }

  for (const pattern of model.patterns) {
    const sourceId = canonicalId(pattern.id);
    switch (pattern.kind) {
      case 'grammar':
        break;
      case 'element':
        addEdge(sourceId, pattern.nameClassId, 'contains');
        for (const id of pattern.contentPatternIds)
          addEdge(sourceId, id, 'contains');
        break;
      case 'attribute':
        addEdge(sourceId, pattern.nameClassId, 'contains');
        for (const id of pattern.valuePatternIds)
          addEdge(sourceId, id, 'contains');
        break;
      case 'choice':
      case 'group':
      case 'interleave':
      case 'optional':
      case 'zeroOrMore':
      case 'oneOrMore':
      case 'mixed':
      case 'list':
        for (const id of pattern.childPatternIds)
          addEdge(sourceId, id, 'contains');
        break;
      case 'data':
        for (const id of pattern.exceptPatternIds)
          addEdge(sourceId, id, 'contains');
        break;
      case 'text':
      case 'empty':
      case 'notAllowed':
      case 'value':
      case 'ref':
      case 'parentRef':
      case 'externalRef':
        break;
    }
  }

  for (const nameClass of model.nameClasses) {
    if (nameClass.kind === 'choice') {
      for (const id of nameClass.childNameClassIds)
        addEdge(nameClass.id, id, 'contains');
    } else if (
      (nameClass.kind === 'anyName' || nameClass.kind === 'nsName') &&
      nameClass.exceptNameClassId
    ) {
      addEdge(nameClass.id, nameClass.exceptNameClassId, 'contains');
    }
  }

  for (const binding of model.bindings) {
    addEdge(
      binding.sourceId,
      binding.targetId,
      binding.kind === 'include'
        ? 'includes'
        : binding.kind === 'externalRef'
          ? 'dependsOnSchema'
          : 'referencesDeclaration',
    );
  }

  const semanticDocumentPathsBySource = new Map(
    model.documents.map((document) => [document.sourceFileId, document.path]),
  );
  const existingNodes = project.nodes.map((node) => {
    if (node.kind !== 'relaxNgSchema' || !node.sourceFileId) return node;
    const path = semanticDocumentPathsBySource.get(node.sourceFileId);
    if (!path) return node;
    return {
      ...node,
      properties: [
        ...(node.properties ?? []),
        { label: 'Semantic presentation', value: 'Available' },
        { label: 'Document', value: path },
      ],
      searchTerms: uniqueText([...(node.searchTerms ?? []), path, 'RELAX NG']),
    };
  });

  const preferredInitialFocusNodeIdBySourceFileId: Record<string, string> = {};
  for (const document of model.documents) {
    const grammar = document.grammarId
      ? grammars.get(document.grammarId)
      : undefined;
    const preferred =
      grammar?.effectiveStartId && nodeIds.has(grammar.effectiveStartId)
        ? grammar.effectiveStartId
        : canonicalId(document.rootPatternId);
    if (nodeIds.has(preferred)) {
      preferredInitialFocusNodeIdBySourceFileId[document.sourceFileId] =
        preferred;
    }
  }
  const preferredInitialFocusNodeId = model.documents
    .map(
      ({ sourceFileId }) =>
        preferredInitialFocusNodeIdBySourceFileId[sourceFileId],
    )
    .find((value) => value !== undefined);

  return {
    project: {
      ...project,
      nodes: [...existingNodes, ...nodes],
      edges: [...project.edges, ...edges],
    },
    sourceMarkupByNodeId: markup,
    preferredInitialFocusNodeIdBySourceFileId,
    ...(preferredInitialFocusNodeId ? { preferredInitialFocusNodeId } : {}),
  };
}
