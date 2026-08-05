import type {
  SchemaEdge,
  SchemaNode,
  SchemaNodeId,
  SchemaNodeSourceMarkup,
  SchemaOccurrence,
  SchemaProject,
  SchemaSourceMarkupByNodeId,
} from '../model';
import type {
  DtdCommentAst,
  DtdElementContentAst,
  DtdElementDeclarationAst,
  DtdDeclarationAst,
  DtdElementParticleAst,
  DtdExtendedConstructAst,
  DtdSourceRange,
} from './dtdAst';
import type { DtdNormalizedComment } from './dtdCommentMetadata';

interface CompleteDtdProjectInput {
  readonly project: SchemaProject;
  readonly elementDeclarations: readonly DtdElementDeclarationAst[];
  readonly declarations: readonly DtdDeclarationAst[];
  readonly constructs: readonly DtdExtendedConstructAst[];
  readonly comments: readonly DtdCommentAst[];
  readonly normalizedComments: readonly DtdNormalizedComment[];
  readonly sourceText: string;
  readonly sourceFileId: string;
  readonly sourceMarkupByNodeId: SchemaSourceMarkupByNodeId;
}

interface CompleteDtdProjectResult {
  readonly project: SchemaProject;
  readonly sourceMarkupByNodeId: SchemaSourceMarkupByNodeId;
}

function encoded(value: string): string {
  return encodeURIComponent(value);
}

function occurrenceValue(
  value: DtdElementParticleAst['occurrence'],
): SchemaOccurrence {
  switch (value) {
    case 'once':
      return { min: 1, max: 1 };
    case 'optional':
      return { min: 0, max: 1 };
    case 'zeroOrMore':
      return { min: 0, max: 'unbounded' };
    case 'oneOrMore':
      return { min: 1, max: 'unbounded' };
  }
}

function occurrenceLabel(value: DtdElementParticleAst['occurrence']): string {
  return value === 'once'
    ? 'Exactly once'
    : value === 'optional'
      ? 'Optional (?)'
      : value === 'zeroOrMore'
        ? 'Zero or more (*)'
        : 'One or more (+)';
}

function multiplyOccurrence(
  outer: SchemaOccurrence,
  inner: SchemaOccurrence,
): SchemaOccurrence {
  const multiplyFinite = (left: number, right: number) =>
    left === 0 || right === 0
      ? 0
      : Math.min(left * right, Number.MAX_SAFE_INTEGER);
  const multiplyMaximum = (
    left: SchemaOccurrence['max'],
    right: SchemaOccurrence['max'],
  ): SchemaOccurrence['max'] =>
    left === 'unbounded'
      ? right === 0
        ? 0
        : 'unbounded'
      : right === 'unbounded'
        ? left === 0
          ? 0
          : 'unbounded'
        : multiplyFinite(left, right);
  return {
    min: multiplyFinite(outer.min, inner.min),
    max: multiplyMaximum(outer.max, inner.max),
  };
}

function sourceNodeId(
  prefix: string,
  sourceFileId: string,
  range: DtdSourceRange,
): SchemaNodeId {
  return `dtd:${prefix}:${encoded(sourceFileId)}:${range.start.offset}-${range.end.offset}`;
}

function sourceMarkup(
  nodeId: SchemaNodeId,
  range: DtdSourceRange,
  sourceText: string,
  sourceFileId: string,
): SchemaNodeSourceMarkup {
  return {
    syntax: 'dtd',
    fragments: [
      {
        id: `dtd:source-markup:${encoded(sourceFileId)}:${range.start.offset}-${range.end.offset}:${encoded(nodeId)}`,
        sourceFileId,
        range: {
          start: { ...range.start },
          end: { ...range.end },
          sourceId: sourceFileId,
        },
        text: sourceText.slice(range.start.offset, range.end.offset),
      },
    ],
  };
}

function addEdge(
  edges: SchemaEdge[],
  kind: SchemaEdge['kind'],
  sourceNodeId: SchemaNodeId,
  targetNodeId: SchemaNodeId,
  order: number,
  occurrence?: SchemaOccurrence,
): void {
  edges.push({
    id: `dtd:${kind}:${encoded(sourceNodeId)}:${order}:${encoded(targetNodeId)}`,
    kind,
    sourceNodeId,
    targetNodeId,
    order,
    ...(occurrence ? { occurrence } : {}),
  });
}

function contentLabel(content: DtdElementContentAst): string {
  switch (content.kind) {
    case 'empty':
      return 'EMPTY';
    case 'any':
      return 'ANY';
    case 'parsedCharacterData':
      return '#PCDATA';
    case 'mixed':
      return 'Mixed content';
    case 'group':
      return content.compositor === 'sequence' ? 'Sequence' : 'Choice';
  }
}

function constructNode(
  construct: DtdExtendedConstructAst,
  sourceText: string,
  sourceFileId: string,
): SchemaNode {
  const raw = sourceText.slice(
    construct.rawDeclarationRange.start.offset,
    construct.rawDeclarationRange.end.offset,
  );
  const common = {
    sourceFileId,
    sourceOrder: construct.range.start.offset,
    compactDeclaration: raw,
  };
  switch (construct.kind) {
    case 'entityDeclaration': {
      const identifier = construct.externalIdentifier;
      const category = construct.parameter
        ? 'Parameter entity'
        : construct.entityKind === 'externalUnparsed'
          ? 'External unparsed general entity'
          : construct.entityKind === 'externalParsed'
            ? 'External parsed general entity'
            : 'Internal parsed general entity';
      return {
        id: sourceNodeId(
          construct.parameter ? 'parameter-entity' : 'entity',
          sourceFileId,
          construct.range,
        ),
        kind: construct.parameter ? 'dtdParameterEntity' : 'dtdEntity',
        name: construct.parameter ? `%${construct.name};` : construct.name,
        ...common,
        properties: [
          { label: 'Entity category', value: category },
          ...(construct.replacementText === undefined
            ? []
            : [
                { label: 'Replacement text', value: construct.replacementText },
              ]),
          ...(identifier?.publicId === undefined
            ? []
            : [{ label: 'Public identifier', value: identifier.publicId }]),
          ...(identifier?.systemId === undefined
            ? []
            : [{ label: 'System identifier', value: identifier.systemId }]),
          ...(construct.notationName === undefined
            ? []
            : [{ label: 'NDATA notation', value: construct.notationName }]),
        ],
        searchTerms: [
          construct.name,
          category,
          construct.replacementText ?? '',
          identifier?.publicId ?? '',
          identifier?.systemId ?? '',
          construct.notationName ?? '',
        ],
      };
    }
    case 'notationDeclaration':
      return {
        id: sourceNodeId('notation', sourceFileId, construct.range),
        kind: 'dtdNotation',
        name: construct.name,
        ...common,
        properties: [
          { label: 'Declaration', value: 'Notation' },
          ...(construct.externalIdentifier.publicId === undefined
            ? []
            : [
                {
                  label: 'Public identifier',
                  value: construct.externalIdentifier.publicId,
                },
              ]),
          ...(construct.externalIdentifier.systemId === undefined
            ? []
            : [
                {
                  label: 'System identifier',
                  value: construct.externalIdentifier.systemId,
                },
              ]),
        ],
        searchTerms: [
          construct.name,
          construct.externalIdentifier.publicId ?? '',
          construct.externalIdentifier.systemId ?? '',
        ],
      };
    case 'conditionalSection':
      return {
        id: sourceNodeId('conditional', sourceFileId, construct.range),
        kind: 'dtdConditionalSection',
        name:
          construct.mode === 'include'
            ? 'INCLUDE conditional section'
            : construct.mode === 'ignore'
              ? 'IGNORE conditional section'
              : `Conditional section (${construct.keyword})`,
        ...common,
        properties: [
          {
            label: 'Section mode',
            value:
              construct.mode === 'parameterEntity'
                ? 'Parameter-entity driven'
                : construct.mode.toUpperCase(),
          },
          { label: 'Keyword source', value: construct.keyword },
          {
            label: 'Presentation status',
            value:
              construct.mode === 'ignore'
                ? 'Ignored content preserved; not active'
                : 'Included content preserved',
          },
        ],
        searchTerms: [construct.keyword, construct.content],
      };
    case 'processingInstruction':
      return {
        id: sourceNodeId(
          'processing-instruction',
          sourceFileId,
          construct.range,
        ),
        kind: 'dtdProcessingInstruction',
        name: construct.target,
        ...common,
        properties: [
          { label: 'Target', value: construct.target },
          { label: 'Data', value: construct.data },
          { label: 'Execution', value: 'Preserved as inert source text' },
        ],
        searchTerms: [construct.target, construct.data],
      };
    case 'parameterEntityReference':
      return {
        id: sourceNodeId(
          'parameter-entity-reference',
          sourceFileId,
          construct.range,
        ),
        kind: 'dtdElementReference',
        name: `%${construct.name};`,
        ...common,
        properties: [
          { label: 'Reference kind', value: 'Parameter entity reference' },
          { label: 'Declaration status', value: 'Reference' },
        ],
        searchTerms: [construct.name, `%${construct.name};`],
      };
  }
}

export function completeDtdProject(
  input: CompleteDtdProjectInput,
): CompleteDtdProjectResult {
  const elementOffsets = new Map<SchemaNodeId, number>(
    input.elementDeclarations.map(
      (declaration) =>
        [
          `dtd:element:${encoded(declaration.name)}`,
          declaration.rawDeclarationRange.start.offset,
        ] as const,
    ),
  );
  const nodes: SchemaNode[] = input.project.nodes.map((node) => ({
    ...node,
    sourceOrder: elementOffsets.get(node.id) ?? node.sourceOrder,
  }));
  // The legacy builder's flattened `contains` edges point directly from an
  // element declaration to referenced declarations. Complete visualization
  // represents the particle explicitly, so retaining those edges would falsely
  // describe a reference as declaration containment.
  const edges: SchemaEdge[] = input.project.edges.filter(
    ({ kind }) => kind !== 'contains',
  );
  const markup: Record<string, SchemaNodeSourceMarkup> = {
    ...input.sourceMarkupByNodeId,
  };
  const elementIds = new Map(
    input.elementDeclarations.map(
      (declaration) =>
        [declaration.name, `dtd:element:${encoded(declaration.name)}`] as const,
    ),
  );

  function addNode(node: SchemaNode, range: DtdSourceRange): void {
    nodes.push(node);
    markup[node.id] = sourceMarkup(
      node.id,
      range,
      input.sourceText,
      input.sourceFileId,
    );
  }

  for (const declaration of input.declarations) {
    if (declaration.kind !== 'attributeListDeclaration') continue;
    const nodeId = `dtd:attribute-list-declaration:${encoded(input.sourceFileId)}:${declaration.rawDeclarationRange.start.offset}-${declaration.rawDeclarationRange.end.offset}`;
    markup[nodeId] = sourceMarkup(
      nodeId,
      declaration.rawDeclarationRange,
      input.sourceText,
      input.sourceFileId,
    );
  }
  const firstAttributeKeys = new Set<string>();
  for (const declaration of input.declarations) {
    if (declaration.kind !== 'attributeListDeclaration') continue;
    for (const attribute of declaration.attributeDefinitions) {
      const key = `${declaration.elementName}\u0000${attribute.name}`;
      const baseId = `dtd:attribute:${encoded(declaration.elementName)}:${encoded(attribute.name)}`;
      const nodeId = firstAttributeKeys.has(key)
        ? `${baseId}:${attribute.range.start.offset}-${attribute.range.end.offset}`
        : baseId;
      firstAttributeKeys.add(key);
      markup[nodeId] = sourceMarkup(
        nodeId,
        attribute.range,
        input.sourceText,
        input.sourceFileId,
      );
    }
  }

  function addParticle(
    ownerId: SchemaNodeId,
    particle: DtdElementParticleAst,
    order: number,
    context: string,
    journeyOwnerId: SchemaNodeId,
    inheritedOccurrence: SchemaOccurrence,
  ): void {
    const occurrence = occurrenceValue(particle.occurrence);
    const journeyOccurrence = multiplyOccurrence(
      inheritedOccurrence,
      occurrence,
    );
    const particleId = `${sourceNodeId(
      'content-particle',
      input.sourceFileId,
      particle.range,
    )}:${encoded(ownerId)}:${order}`;
    if (particle.kind === 'nameReference') {
      const declaredId = elementIds.get(particle.name);
      addNode(
        {
          id: particleId,
          kind: 'dtdElementReference',
          name: particle.name,
          sourceFileId: input.sourceFileId,
          sourceOrder: particle.range.start.offset,
          compactDeclaration: input.sourceText.slice(
            particle.range.start.offset,
            particle.range.end.offset,
          ),
          properties: [
            {
              label: 'Reference status',
              value: declaredId
                ? 'Declared element reference'
                : 'Undeclared element-name reference',
            },
            {
              label: 'Occurrence',
              value: occurrenceLabel(particle.occurrence),
            },
            { label: 'Context', value: context },
          ],
          searchTerms: [
            particle.name,
            declaredId ? 'declared' : 'undeclared reference',
            context,
          ],
        },
        particle.range,
      );
      addEdge(
        edges,
        'contentModelMember',
        ownerId,
        particleId,
        order,
        occurrence,
      );
      addEdge(
        edges,
        'contentModelReference',
        journeyOwnerId,
        particleId,
        particle.range.start.offset,
        journeyOccurrence,
      );
      if (declaredId) {
        addEdge(edges, 'referencesElementName', particleId, declaredId, 0);
      } else {
        addEdge(
          edges,
          'referencesUndeclaredElementName',
          journeyOwnerId,
          particleId,
          particle.range.start.offset,
          journeyOccurrence,
        );
      }
      return;
    }

    addNode(
      {
        id: particleId,
        kind: 'dtdContentModel',
        name:
          particle.compositor === 'sequence'
            ? `Sequence group in ${context}`
            : `Choice group in ${context}`,
        sourceFileId: input.sourceFileId,
        sourceOrder: particle.range.start.offset,
        compactDeclaration: input.sourceText.slice(
          particle.range.start.offset,
          particle.range.end.offset,
        ),
        properties: [
          {
            label: 'Structure',
            value:
              particle.compositor === 'sequence'
                ? 'Ordered sequence'
                : 'Choice of alternatives',
          },
          { label: 'Occurrence', value: occurrenceLabel(particle.occurrence) },
          { label: 'Context', value: context },
        ],
        searchTerms: [
          particle.compositor,
          occurrenceLabel(particle.occurrence),
          context,
        ],
      },
      particle.range,
    );
    addEdge(
      edges,
      'contentModelMember',
      ownerId,
      particleId,
      order,
      occurrence,
    );
    const memberOccurrence =
      particle.compositor === 'choice' && particle.members.length > 1
        ? { ...journeyOccurrence, min: 0 }
        : journeyOccurrence;
    particle.members.forEach((member, memberOrder) =>
      addParticle(
        particleId,
        member,
        memberOrder,
        `${context} / ${particle.compositor} ${memberOrder + 1}`,
        journeyOwnerId,
        memberOccurrence,
      ),
    );
  }

  for (const declaration of input.elementDeclarations) {
    const ownerId = elementIds.get(declaration.name)!;
    const content = declaration.contentModel;
    const contentId = `${sourceNodeId(
      'content-model',
      input.sourceFileId,
      content.range,
    )}:${encoded(ownerId)}`;
    addNode(
      {
        id: contentId,
        kind: 'dtdContentModel',
        name: `${declaration.name} content model: ${contentLabel(content)}`,
        sourceFileId: input.sourceFileId,
        sourceOrder: content.range.start.offset,
        compactDeclaration: input.sourceText.slice(
          content.range.start.offset,
          content.range.end.offset,
        ),
        properties: [
          { label: 'Content kind', value: contentLabel(content) },
          { label: 'Owning element', value: declaration.name },
          ...(content.kind === 'group'
            ? [
                {
                  label: 'Structure',
                  value:
                    content.compositor === 'sequence'
                      ? 'Ordered sequence'
                      : 'Choice of alternatives',
                },
              ]
            : []),
        ],
        searchTerms: [
          declaration.name,
          contentLabel(content),
          input.sourceText.slice(
            content.range.start.offset,
            content.range.end.offset,
          ),
        ],
      },
      content.range,
    );
    addEdge(edges, 'contentModelMember', ownerId, contentId, 0);
    if (content.kind === 'group') {
      const groupOccurrence = occurrenceValue(content.occurrence);
      const memberOccurrence =
        content.compositor === 'choice' && content.members.length > 1
          ? { ...groupOccurrence, min: 0 }
          : groupOccurrence;
      content.members.forEach((member, order) =>
        addParticle(
          contentId,
          member,
          order,
          `${declaration.name} / ${content.compositor} ${order + 1}`,
          ownerId,
          memberOccurrence,
        ),
      );
    } else if (content.kind === 'mixed') {
      const pcdataId = `${contentId}:pcdata`;
      addNode(
        {
          id: pcdataId,
          kind: 'dtdContentModel',
          name: '#PCDATA',
          sourceFileId: input.sourceFileId,
          sourceOrder: content.parsedCharacterDataRange.start.offset,
          compactDeclaration: '#PCDATA',
          properties: [
            { label: 'Content kind', value: 'Parsed character data' },
          ],
          searchTerms: ['#PCDATA', 'text'],
        },
        content.parsedCharacterDataRange,
      );
      addEdge(edges, 'contentModelMember', contentId, pcdataId, 0);
      content.namedAlternatives.forEach((member, order) =>
        addParticle(
          contentId,
          member,
          order + 1,
          `${declaration.name} / mixed alternative ${order + 1}`,
          ownerId,
          { min: 0, max: 'unbounded' },
        ),
      );
    }
  }

  const constructNodes = new Map<DtdExtendedConstructAst, SchemaNode>();
  for (const construct of input.constructs) {
    const node = constructNode(construct, input.sourceText, input.sourceFileId);
    constructNodes.set(construct, node);
    addNode(node, construct.range);
    if (
      construct.kind === 'entityDeclaration' &&
      construct.externalIdentifier?.systemId
    ) {
      const dependencyId = `${node.id}:dependency`;
      addNode(
        {
          id: dependencyId,
          kind: 'dtdDependency',
          name: construct.externalIdentifier.systemId,
          sourceFileId: input.sourceFileId,
          sourceOrder: construct.range.start.offset,
          compactDeclaration: construct.externalIdentifier.systemId,
          properties: [
            {
              label: 'Dependency type',
              value: construct.parameter
                ? 'External parameter entity'
                : construct.entityKind === 'externalUnparsed'
                  ? 'Unparsed resource'
                  : 'External parsed entity',
            },
            {
              label: 'Resolution policy',
              value: 'Controlled project-local resolver only',
            },
          ],
          searchTerms: [construct.externalIdentifier.systemId, construct.name],
        },
        construct.range,
      );
      addEdge(edges, 'dependsOnResource', node.id, dependencyId, 0);
    }
  }

  const notationsByName = new Map(
    input.constructs
      .filter(
        (
          value,
        ): value is Extract<
          DtdExtendedConstructAst,
          { kind: 'notationDeclaration' }
        > => value.kind === 'notationDeclaration',
      )
      .map((value) => [value.name, constructNodes.get(value)!.id] as const),
  );
  const parameterEntitiesByName = new Map(
    input.constructs
      .filter(
        (
          value,
        ): value is Extract<
          DtdExtendedConstructAst,
          { kind: 'entityDeclaration' }
        > => value.kind === 'entityDeclaration' && value.parameter,
      )
      .map((value) => [value.name, constructNodes.get(value)!.id] as const),
  );
  for (const attribute of nodes.filter(({ kind }) => kind === 'dtdAttribute')) {
    const notationBody = attribute.compactDeclaration?.match(
      /\bNOTATION\s*\(([^)]*)\)/i,
    )?.[1];
    if (!notationBody) continue;
    const names = notationBody
      .split('|')
      .map((value) => value.trim())
      .filter(Boolean);
    names.forEach((name, order) => {
      const notationId = notationsByName.get(name);
      if (notationId)
        addEdge(
          edges,
          'attributeAllowsNotation',
          attribute.id,
          notationId,
          order,
        );
    });
  }
  for (const construct of input.constructs) {
    const node = constructNodes.get(construct)!;
    if (construct.kind === 'entityDeclaration' && construct.notationName) {
      const notationId = notationsByName.get(construct.notationName);
      if (notationId)
        addEdge(edges, 'entityUsesNotation', node.id, notationId, 0);
    } else if (construct.kind === 'parameterEntityReference') {
      const entityId = parameterEntitiesByName.get(construct.name);
      if (entityId) addEdge(edges, 'references', node.id, entityId, 0);
    }
  }

  const normalizedById = new Map(
    input.normalizedComments.map(
      (comment) => [comment.commentId, comment] as const,
    ),
  );
  for (const comment of input.comments) {
    const normalized = [...normalizedById.values()].find(
      (value) =>
        value.sourceRange.start.offset === comment.range.start.offset &&
        value.sourceRange.end.offset === comment.range.end.offset,
    );
    const commentId =
      normalized?.commentId ??
      sourceNodeId('comment', input.sourceFileId, comment.range);
    addNode(
      {
        id: commentId,
        kind: 'dtdComment',
        name:
          comment.text.trim().replace(/\s+/g, ' ').slice(0, 72) ||
          'Empty comment',
        sourceFileId: input.sourceFileId,
        sourceOrder: comment.range.start.offset,
        compactDeclaration: comment.raw,
        properties: [
          {
            label: 'Attachment',
            value: normalized?.attachmentKind ?? 'Unattached source comment',
          },
          { label: 'Safe text', value: comment.text },
        ],
        searchTerms: [
          comment.text,
          normalized?.attachmentKind ?? 'unattached comment',
        ],
      },
      comment.range,
    );
    if (normalized?.attachedNodeId)
      addEdge(
        edges,
        'commentAttachesTo',
        commentId,
        normalized.attachedNodeId,
        0,
      );
  }

  const sourceOrdered = [...nodes].sort(
    (left, right) =>
      (left.sourceOrder ?? Number.MAX_SAFE_INTEGER) -
        (right.sourceOrder ?? Number.MAX_SAFE_INTEGER) ||
      left.id.localeCompare(right.id),
  );
  for (let index = 1; index < sourceOrdered.length; index += 1) {
    addEdge(
      edges,
      'sourceOrderAdjacent',
      sourceOrdered[index - 1]!.id,
      sourceOrdered[index]!.id,
      index - 1,
    );
  }

  const referencedElementIds = new Set(
    edges
      .filter(({ kind }) => kind === 'referencesElementName')
      .map(({ targetNodeId }) => targetNodeId),
  );
  const elementRoots = [...elementIds.values()].filter(
    (id) => !referencedElementIds.has(id),
  );
  const fallbackRoots =
    elementIds.size > 0 ? [] : sourceOrdered.map(({ id }) => id);

  return {
    project: {
      ...input.project,
      nodes: sourceOrdered,
      edges,
      rootNodeIds: elementRoots.length > 0 ? elementRoots : fallbackRoots,
    },
    sourceMarkupByNodeId: markup,
  };
}
