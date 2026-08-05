import type {
  SchemaEdge,
  SchemaNode,
  SchemaNodeId,
  SchemaOccurrence,
  SchemaProject,
  SchemaSourceMarkupByNodeId,
} from '../model';
import {
  getIncomingStructuralRelationships,
  validateSchemaProject,
} from '../model';
import type {
  DtdAttributeDefaultAst,
  DtdAttributeDefinitionAst,
  DtdAttributeListDeclarationAst,
  DtdAttributeTypeAst,
  DtdCommentAst,
  DtdDeclarationAst,
  DtdElementContentAst,
  DtdElementDeclarationAst,
  DtdElementParticleAst,
  DtdExtendedConstructAst,
  DtdGroupAst,
  DtdNameReferenceAst,
  DtdOccurrence,
  DtdSourceRange,
} from './dtdAst';
import type {
  DtdAttributesByNodeId,
  DtdNormalizedAttributeDefault,
  DtdNormalizedAttributeDefinition,
  DtdNormalizedAttributeType,
  DtdNormalizedSourceRange,
} from './dtdAttributeMetadata';
import { attachDtdComments } from './dtdCommentAttachment';
import type {
  DtdCommentsByNodeId,
  DtdNormalizedComment,
} from './dtdCommentMetadata';
import type { DtdBuildDiagnostic } from './dtdBuildDiagnostics';
import { buildDtdSourceMarkupByNodeId } from './dtdSourceMarkup';
import { completeDtdProject } from './dtdCompleteProject';

export interface DtdProjectBuildOptions {
  readonly projectId: string;
  readonly displayName: string;
  readonly sourceFileId: string;
  readonly sourceFilename: string;
  /** Set only after the authoritative Xerces boundary accepted this source. */
  readonly standardsAccepted?: boolean;
}

export type DtdNormalizedContentKind =
  'empty' | 'any' | 'text' | 'mixed' | 'elementOnly';

export interface DtdProjectBuildResult {
  readonly project?: SchemaProject;
  readonly diagnostics: readonly DtdBuildDiagnostic[];
  readonly contentKindsByNodeId: Readonly<
    Record<SchemaNodeId, DtdNormalizedContentKind>
  >;
  readonly dtdAttributesByNodeId: DtdAttributesByNodeId;
  readonly comments: readonly DtdNormalizedComment[];
  readonly commentsByNodeId: DtdCommentsByNodeId;
  readonly schemaLevelComments: readonly DtdNormalizedComment[];
  readonly sourceMarkupByNodeId: SchemaSourceMarkupByNodeId;
}

interface EffectiveOccurrenceContext {
  readonly min: number;
  readonly max: number | 'unbounded';
}

interface FlattenedReference {
  readonly reference: DtdNameReferenceAst;
  readonly occurrence: SchemaOccurrence;
}

const exactlyOnce: EffectiveOccurrenceContext = { min: 1, max: 1 };

function diagnostic(
  value: Omit<DtdBuildDiagnostic, 'severity'>,
): DtdBuildDiagnostic {
  return { severity: 'error', ...value };
}

function hasError(diagnostics: readonly DtdBuildDiagnostic[]): boolean {
  return diagnostics.some(({ severity }) => severity === 'error');
}

function encodeNameForId(name: string): string {
  return encodeURIComponent(name);
}

function nodeIdForName(name: string): SchemaNodeId {
  return `dtd:element:${encodeNameForId(name)}`;
}

function attributeListNodeIdForName(name: string): SchemaNodeId {
  return `dtd:attribute-list:${encodeNameForId(name)}`;
}

function attributeNodeIdFor(
  ownerName: string,
  attributeName: string,
): SchemaNodeId {
  return `dtd:attribute:${encodeNameForId(ownerName)}:${encodeNameForId(attributeName)}`;
}

function attributeListDeclarationNodeId(
  sourceFileId: string,
  range: DtdSourceRange,
): SchemaNodeId {
  return `dtd:attribute-list-declaration:${encodeNameForId(sourceFileId)}:${range.start.offset}-${range.end.offset}`;
}

function edgeIdForAttribute(
  ownerName: string,
  attributeName: string,
  range: DtdSourceRange,
): string {
  return [
    'dtd:usesAttribute',
    encodeNameForId(ownerName),
    encodeNameForId(attributeName),
    `${range.start.offset}-${range.end.offset}`,
  ].join(':');
}

function edgeIdForReference(
  sourceName: string,
  targetName: string,
  range: DtdSourceRange,
  order: number,
): string {
  return [
    'dtd:contains',
    encodeNameForId(sourceName),
    `${range.start.offset}-${range.end.offset}`,
    String(order),
    encodeNameForId(targetName),
  ].join(':');
}

function occurrenceBounds(occurrence: DtdOccurrence): SchemaOccurrence {
  switch (occurrence) {
    case 'optional':
      return { min: 0, max: 1 };
    case 'zeroOrMore':
      return { min: 0, max: 'unbounded' };
    case 'oneOrMore':
      return { min: 1, max: 'unbounded' };
    case 'once':
      return { min: 1, max: 1 };
  }
}

function multiplyFiniteBounds(left: number, right: number): number {
  if (left === 0 || right === 0) return 0;
  if (left > Number.MAX_SAFE_INTEGER / right) {
    return Number.MAX_SAFE_INTEGER;
  }
  return left * right;
}

function multiplyMaximum(
  left: number | 'unbounded',
  right: number | 'unbounded',
): number | 'unbounded' {
  if (left === 'unbounded') return right === 0 ? 0 : 'unbounded';
  if (right === 'unbounded') return left === 0 ? 0 : 'unbounded';
  return multiplyFiniteBounds(left, right);
}

function multiplyOccurrences(
  outer: EffectiveOccurrenceContext,
  inner: SchemaOccurrence,
): EffectiveOccurrenceContext {
  return {
    min: multiplyFiniteBounds(outer.min, inner.min),
    max: multiplyMaximum(outer.max, inner.max),
  };
}

/**
 * Each reference inherits the occurrence of every enclosing group. A choice
 * with multiple alternatives makes every descendant optional for one parent
 * occurrence, while repetition still expands its maximum. This produces the
 * effective per-edge bounds without discarding the authoritative declaration.
 */
function flattenGroup(
  group: DtdGroupAst,
  inherited: EffectiveOccurrenceContext,
  output: FlattenedReference[],
): void {
  const groupContext = multiplyOccurrences(
    inherited,
    occurrenceBounds(group.occurrence),
  );
  const memberContext =
    group.compositor === 'choice' && group.members.length > 1
      ? { ...groupContext, min: 0 }
      : groupContext;

  for (const member of group.members) {
    flattenParticle(member, memberContext, output);
  }
}

function flattenParticle(
  particle: DtdElementParticleAst,
  inherited: EffectiveOccurrenceContext,
  output: FlattenedReference[],
): void {
  if (particle.kind === 'nameReference') {
    output.push({
      reference: particle,
      occurrence: multiplyOccurrences(
        inherited,
        occurrenceBounds(particle.occurrence),
      ),
    });
    return;
  }

  flattenGroup(particle, inherited, output);
}

function flattenContentModel(
  contentModel: DtdElementContentAst,
): FlattenedReference[] {
  const references: FlattenedReference[] = [];

  if (contentModel.kind === 'group') {
    flattenGroup(contentModel, exactlyOnce, references);
  } else if (contentModel.kind === 'mixed') {
    const mixedContext: EffectiveOccurrenceContext = {
      min: 0,
      max: 'unbounded',
    };
    for (const reference of contentModel.namedAlternatives) {
      flattenParticle(reference, mixedContext, references);
    }
  }

  return references;
}

function contentKindFor(
  contentModel: DtdElementContentAst,
): DtdNormalizedContentKind {
  switch (contentModel.kind) {
    case 'empty':
      return 'empty';
    case 'any':
      return 'any';
    case 'parsedCharacterData':
      return 'text';
    case 'mixed':
      return 'mixed';
    case 'group':
      return 'elementOnly';
  }
}

function isValidSourceRange(
  range: DtdSourceRange,
  sourceLength: number,
): boolean {
  return (
    Number.isInteger(range.start.offset) &&
    Number.isInteger(range.end.offset) &&
    range.start.offset >= 0 &&
    range.end.offset >= range.start.offset &&
    range.end.offset <= sourceLength
  );
}

function rangesInParticle(
  particle: DtdElementParticleAst,
): readonly DtdSourceRange[] {
  if (particle.kind === 'nameReference') return [particle.range];

  const ranges: DtdSourceRange[] = [particle.range];
  for (const member of particle.members) {
    ranges.push(...rangesInParticle(member));
  }
  return ranges;
}

function rangesInContentModel(
  contentModel: DtdElementContentAst,
): readonly DtdSourceRange[] {
  if (contentModel.kind === 'group') {
    const ranges: DtdSourceRange[] = [contentModel.range];
    for (const member of contentModel.members) {
      ranges.push(...rangesInParticle(member));
    }
    return ranges;
  }

  if (contentModel.kind === 'mixed') {
    return [
      contentModel.range,
      contentModel.parsedCharacterDataRange,
      ...contentModel.namedAlternatives.map(({ range }) => range),
    ];
  }

  return [contentModel.range];
}

function findInvalidRanges(
  declarations: readonly DtdElementDeclarationAst[],
  sourceText: string,
  sourceId: string,
): DtdBuildDiagnostic[] {
  const diagnostics: DtdBuildDiagnostic[] = [];

  for (const declaration of declarations) {
    const ranges = [
      declaration.range,
      declaration.rawDeclarationRange,
      ...rangesInContentModel(declaration.contentModel),
    ];

    for (const range of ranges) {
      if (!isValidSourceRange(range, sourceText.length)) {
        diagnostics.push(
          diagnostic({
            code: 'invalid-source-range',
            message: `Element "${declaration.name}" has a source range outside the supplied DTD source.`,
            elementName: declaration.name,
            sourceId,
            range,
          }),
        );
      }
    }
  }

  return diagnostics;
}

function validateOptions(
  options: DtdProjectBuildOptions,
): DtdBuildDiagnostic[] {
  const diagnostics: DtdBuildDiagnostic[] = [];
  const values: readonly (readonly [keyof DtdProjectBuildOptions, string])[] = [
    ['projectId', options.projectId],
    ['displayName', options.displayName],
    ['sourceFileId', options.sourceFileId],
    ['sourceFilename', options.sourceFilename],
  ];

  for (const [name, value] of values) {
    if (value.trim().length === 0) {
      diagnostics.push(
        diagnostic({
          code: 'invalid-build-option',
          message: `DTD project build option "${name}" must not be empty or whitespace-only.`,
          sourceId: options.sourceFileId || undefined,
        }),
      );
    }
  }

  return diagnostics;
}

function findDuplicateDeclarations(
  declarations: readonly DtdElementDeclarationAst[],
  sourceId: string,
): DtdBuildDiagnostic[] {
  const diagnostics: DtdBuildDiagnostic[] = [];
  const firstByName = new Map<string, DtdElementDeclarationAst>();

  for (const declaration of declarations) {
    const first = firstByName.get(declaration.name);
    if (!first) {
      firstByName.set(declaration.name, declaration);
      continue;
    }

    diagnostics.push(
      diagnostic({
        code: 'duplicate-element-declaration',
        message: `Element "${declaration.name}" is declared more than once in this DTD source.`,
        elementName: declaration.name,
        sourceId,
        range: declaration.rawDeclarationRange,
        relatedRange: first.rawDeclarationRange,
      }),
    );
  }

  return diagnostics;
}

function buildNodes(
  declarations: readonly DtdElementDeclarationAst[],
  sourceText: string,
  sourceFileId: string,
  diagnostics: DtdBuildDiagnostic[],
): {
  readonly nodes: readonly SchemaNode[];
  readonly nodeIdsByName: ReadonlyMap<string, SchemaNodeId>;
  readonly contentKindsByNodeId: Readonly<
    Record<SchemaNodeId, DtdNormalizedContentKind>
  >;
} {
  const nodes: SchemaNode[] = [];
  const nodeIdsByName = new Map<string, SchemaNodeId>();
  const namesByNodeId = new Map<SchemaNodeId, string>();
  const contentKindsByNodeId: Record<SchemaNodeId, DtdNormalizedContentKind> =
    {};

  declarations.forEach((declaration, sourceOrder) => {
    const nodeId = nodeIdForName(declaration.name);
    const existingName = namesByNodeId.get(nodeId);
    if (existingName !== undefined && existingName !== declaration.name) {
      diagnostics.push(
        diagnostic({
          code: 'id-collision',
          message: `Elements "${existingName}" and "${declaration.name}" produced the same normalized node ID "${nodeId}".`,
          elementName: declaration.name,
          sourceId: sourceFileId,
          range: declaration.rawDeclarationRange,
        }),
      );
    }

    namesByNodeId.set(nodeId, declaration.name);
    nodeIdsByName.set(declaration.name, nodeId);
    contentKindsByNodeId[nodeId] = contentKindFor(declaration.contentModel);
    nodes.push({
      id: nodeId,
      kind: 'dtdElement',
      name: declaration.name,
      sourceFileId,
      sourceOrder,
      compactDeclaration: sourceText.slice(
        declaration.rawDeclarationRange.start.offset,
        declaration.rawDeclarationRange.end.offset,
      ),
    });
  });

  return { nodes, nodeIdsByName, contentKindsByNodeId };
}

function buildEdges(
  declarations: readonly DtdElementDeclarationAst[],
  nodeIdsByName: ReadonlyMap<string, SchemaNodeId>,
  sourceFileId: string,
  diagnostics: DtdBuildDiagnostic[],
  tolerateUnresolvedReferences: boolean,
): readonly SchemaEdge[] {
  const edges: SchemaEdge[] = [];
  const edgeIds = new Set<string>();

  for (const declaration of declarations) {
    const sourceNodeId = nodeIdsByName.get(declaration.name);
    if (!sourceNodeId) continue;

    const flattened = flattenContentModel(declaration.contentModel);
    flattened.forEach(({ reference, occurrence }, order) => {
      const targetNodeId = nodeIdsByName.get(reference.name);
      if (!targetNodeId) {
        if (!tolerateUnresolvedReferences) {
          diagnostics.push(
            diagnostic({
              code: 'unresolved-element-reference',
              message: `Element "${reference.name}" is referenced by "${declaration.name}" but has no declaration in this DTD source.`,
              elementName: declaration.name,
              referenceName: reference.name,
              sourceId: sourceFileId,
              range: reference.range,
            }),
          );
        }
        return;
      }

      const edgeId = edgeIdForReference(
        declaration.name,
        reference.name,
        reference.range,
        order,
      );
      if (edgeIds.has(edgeId)) {
        diagnostics.push(
          diagnostic({
            code: 'id-collision',
            message: `References to "${reference.name}" from "${declaration.name}" produced the same normalized edge ID "${edgeId}".`,
            elementName: declaration.name,
            referenceName: reference.name,
            sourceId: sourceFileId,
            range: reference.range,
          }),
        );
      }
      edgeIds.add(edgeId);

      edges.push({
        id: edgeId,
        kind: 'contains',
        sourceNodeId,
        targetNodeId,
        order,
        occurrence,
      });
    });
  }

  return edges;
}

function declarationTextWithoutCommentTrivia(
  declaration: DtdElementDeclarationAst,
  sourceText: string,
  comments: readonly DtdCommentAst[],
): string {
  const containedComments = comments
    .filter(
      ({ range }) =>
        range.start.offset >= declaration.rawDeclarationRange.start.offset &&
        range.end.offset <= declaration.rawDeclarationRange.end.offset,
    )
    .sort(
      (left, right) =>
        left.range.start.offset - right.range.start.offset ||
        left.range.end.offset - right.range.end.offset,
    );
  if (containedComments.length === 0) {
    return sourceText.slice(
      declaration.rawDeclarationRange.start.offset,
      declaration.rawDeclarationRange.end.offset,
    );
  }

  const parts: string[] = [];
  let cursor = declaration.rawDeclarationRange.start.offset;
  for (const comment of containedComments) {
    parts.push(sourceText.slice(cursor, comment.range.start.offset));
    cursor = comment.range.end.offset;
  }
  parts.push(
    sourceText.slice(cursor, declaration.rawDeclarationRange.end.offset),
  );
  return parts.join('');
}

function emptyResult(
  diagnostics: readonly DtdBuildDiagnostic[],
): DtdProjectBuildResult {
  return {
    diagnostics,
    contentKindsByNodeId: {},
    dtdAttributesByNodeId: {},
    comments: [],
    commentsByNodeId: {},
    schemaLevelComments: [],
    sourceMarkupByNodeId: {},
  };
}

export function buildDtdSchemaProject(
  declarations: readonly DtdElementDeclarationAst[],
  sourceText: string,
  options: DtdProjectBuildOptions,
): DtdProjectBuildResult {
  const diagnostics = [
    ...validateOptions(options),
    ...findInvalidRanges(declarations, sourceText, options.sourceFileId),
    ...findDuplicateDeclarations(declarations, options.sourceFileId),
  ];

  if (hasError(diagnostics)) return emptyResult(diagnostics);

  const { nodes, nodeIdsByName, contentKindsByNodeId } = buildNodes(
    declarations,
    sourceText,
    options.sourceFileId,
    diagnostics,
  );
  if (hasError(diagnostics)) return emptyResult(diagnostics);

  const edges = buildEdges(
    declarations,
    nodeIdsByName,
    options.sourceFileId,
    diagnostics,
    options.standardsAccepted === true,
  );
  if (
    diagnostics.some(
      ({ code, severity }) =>
        code === 'unresolved-element-reference' && severity === 'error',
    )
  ) {
    return emptyResult(diagnostics);
  }

  const projectWithoutRoots: SchemaProject = {
    id: options.projectId,
    displayName: options.displayName,
    sourceFiles: [
      { id: options.sourceFileId, filename: options.sourceFilename },
    ],
    nodes,
    edges,
    rootNodeIds: [],
  };
  const project: SchemaProject = {
    ...projectWithoutRoots,
    rootNodeIds: nodes
      .filter(
        ({ id }) =>
          getIncomingStructuralRelationships(projectWithoutRoots, id).length ===
          0,
      )
      .map(({ id }) => id),
  };

  for (const finding of validateSchemaProject(project)) {
    diagnostics.push(
      diagnostic({
        code: 'project-validation-failed',
        message: `Normalized DTD project validation failed (${finding.code}): ${finding.message}`,
        sourceId: options.sourceFileId,
      }),
    );
  }

  if (hasError(diagnostics)) {
    return {
      diagnostics,
      contentKindsByNodeId,
      dtdAttributesByNodeId: {},
      comments: [],
      commentsByNodeId: {},
      schemaLevelComments: [],
      sourceMarkupByNodeId: {},
    };
  }

  return {
    project,
    diagnostics,
    contentKindsByNodeId,
    dtdAttributesByNodeId: {},
    comments: [],
    commentsByNodeId: {},
    schemaLevelComments: [],
    sourceMarkupByNodeId: buildDtdSourceMarkupByNodeId(
      declarations,
      sourceText,
      options.sourceFileId,
    ),
  };
}

function cloneRange(range: DtdSourceRange): DtdNormalizedSourceRange {
  return {
    start: { ...range.start },
    end: { ...range.end },
    ...(range.sourceId === undefined ? {} : { sourceId: range.sourceId }),
  };
}

function rangesInAttributeType(
  type: DtdAttributeTypeAst,
): readonly DtdSourceRange[] {
  if (type.kind === 'enumeration') {
    return [type.range, ...type.values.map(({ range }) => range)];
  }
  if (type.kind === 'notation') {
    return [type.range, ...type.names.map(({ range }) => range)];
  }
  return [type.range];
}

function rangesInAttributeDefault(
  value: DtdAttributeDefaultAst,
): readonly DtdSourceRange[] {
  if (value.kind === 'fixed' || value.kind === 'value') {
    return [value.range, value.value.range];
  }
  return [value.range];
}

function findInvalidAttributeRanges(
  declarations: readonly DtdAttributeListDeclarationAst[],
  sourceText: string,
  sourceId: string,
): DtdBuildDiagnostic[] {
  const diagnostics: DtdBuildDiagnostic[] = [];

  for (const declaration of declarations) {
    const ranges: DtdSourceRange[] = [
      declaration.range,
      declaration.rawDeclarationRange,
    ];
    for (const attribute of declaration.attributeDefinitions) {
      ranges.push(
        attribute.range,
        ...rangesInAttributeType(attribute.type),
        ...rangesInAttributeDefault(attribute.defaultDeclaration),
      );
    }

    for (const range of ranges) {
      if (!isValidSourceRange(range, sourceText.length)) {
        diagnostics.push(
          diagnostic({
            code: 'invalid-source-range',
            message: `ATTLIST for element "${declaration.elementName}" has a source range outside the supplied DTD source.`,
            elementName: declaration.elementName,
            sourceId,
            range,
          }),
        );
      }
    }
  }

  return diagnostics;
}

function normalizeAttributeType(
  type: DtdAttributeTypeAst,
): DtdNormalizedAttributeType {
  if (type.kind === 'enumeration') {
    return {
      kind: 'enumeration',
      values: type.values.map(({ value }) => value),
    };
  }
  if (type.kind === 'notation') {
    return {
      kind: 'notation',
      values: type.names.map(({ name }) => name),
    };
  }
  return { kind: 'tokenized', name: type.spelling };
}

function normalizeAttributeDefault(
  value: DtdAttributeDefaultAst,
): DtdNormalizedAttributeDefault {
  if (value.kind === 'required' || value.kind === 'implied') {
    return { kind: value.kind };
  }
  return {
    kind: value.kind,
    literal: {
      value: value.value.value,
      quote: value.value.quote,
    },
  };
}

function literalDefaultValue(
  value: DtdAttributeDefaultAst,
): string | undefined {
  return value.kind === 'fixed' || value.kind === 'value'
    ? value.value.value
    : undefined;
}

interface AttributeBuildState {
  readonly nodes: SchemaNode[];
  readonly edges: SchemaEdge[];
  readonly attributesByNodeId: Record<
    SchemaNodeId,
    DtdNormalizedAttributeDefinition
  >;
}

function buildAttributes(
  declarations: readonly DtdAttributeListDeclarationAst[],
  baseProject: SchemaProject,
  sourceText: string,
  sourceFileId: string,
  diagnostics: DtdBuildDiagnostic[],
  completeVisualization: boolean,
): AttributeBuildState {
  const state: AttributeBuildState = {
    nodes: [],
    edges: [],
    attributesByNodeId: {},
  };
  const elementNodesByName = new Map(
    baseProject.nodes
      .filter(({ kind }) => kind === 'dtdElement')
      .map((node) => [node.name, node] as const),
  );
  const firstAttributeByOwnerAndName = new Map<
    string,
    DtdAttributeDefinitionAst
  >();
  const firstIdAttributeByOwner = new Map<string, DtdAttributeDefinitionAst>();
  const orderByOwner = new Map<string, number>();
  let attributeListOrder = baseProject.nodes.length;

  for (const declaration of declarations) {
    let ownerNode = elementNodesByName.get(declaration.elementName);
    if (!ownerNode) {
      ownerNode = {
        id: attributeListNodeIdForName(declaration.elementName),
        kind: 'dtdAttributeList',
        name: declaration.elementName,
        sourceFileId,
        sourceOrder: attributeListOrder,
        compactDeclaration: sourceText.slice(
          declaration.rawDeclarationRange.start.offset,
          declaration.rawDeclarationRange.end.offset,
        ),
      };
      attributeListOrder += 1;
      elementNodesByName.set(declaration.elementName, ownerNode);
      state.nodes.push(ownerNode);
    }

    const attributeListNodeId = attributeListDeclarationNodeId(
      sourceFileId,
      declaration.rawDeclarationRange,
    );
    if (completeVisualization) {
      const attributeListNode: SchemaNode = {
        id: attributeListNodeId,
        kind: 'dtdAttributeList',
        name: `ATTLIST ${declaration.elementName}`,
        sourceFileId,
        sourceOrder: declaration.rawDeclarationRange.start.offset,
        compactDeclaration: sourceText.slice(
          declaration.rawDeclarationRange.start.offset,
          declaration.rawDeclarationRange.end.offset,
        ),
        properties: [
          { label: 'Owning element name', value: declaration.elementName },
          {
            label: 'Owner status',
            value:
              ownerNode.kind === 'dtdElement'
                ? 'Declared element'
                : 'Undeclared element name',
          },
          {
            label: 'Attribute count',
            value: String(declaration.attributeDefinitions.length),
          },
        ],
        searchTerms: [declaration.elementName, 'ATTLIST'],
      };
      state.nodes.push(attributeListNode);
      state.edges.push({
        id: `dtd:appliesAttributes:${encodeNameForId(sourceFileId)}:${declaration.rawDeclarationRange.start.offset}-${declaration.rawDeclarationRange.end.offset}`,
        kind: 'appliesAttributesToElement',
        sourceNodeId: attributeListNodeId,
        targetNodeId: ownerNode.id,
        order: 0,
      });
    }

    for (const attribute of declaration.attributeDefinitions) {
      const ownerAndNameKey = `${declaration.elementName}\u0000${attribute.name}`;
      const firstAttribute = firstAttributeByOwnerAndName.get(ownerAndNameKey);
      if (firstAttribute && !completeVisualization) continue;
      if (!firstAttribute)
        firstAttributeByOwnerAndName.set(ownerAndNameKey, attribute);

      if (attribute.type.kind === 'id') {
        const firstIdAttribute = firstIdAttributeByOwner.get(
          declaration.elementName,
        );
        if (firstIdAttribute) {
          diagnostics.push(
            diagnostic({
              code: 'multiple-id-attributes',
              message: `Element "${declaration.elementName}" declares more than one ID attribute ("${firstIdAttribute.name}" and "${attribute.name}").`,
              elementName: declaration.elementName,
              attributeName: attribute.name,
              sourceId: sourceFileId,
              range: attribute.range,
              relatedRange: firstIdAttribute.range,
            }),
          );
        } else {
          firstIdAttributeByOwner.set(declaration.elementName, attribute);
        }

        if (
          attribute.defaultDeclaration.kind !== 'required' &&
          attribute.defaultDeclaration.kind !== 'implied'
        ) {
          diagnostics.push(
            diagnostic({
              code: 'invalid-id-attribute-default',
              message: `ID attribute "${attribute.name}" on element "${declaration.elementName}" must use #REQUIRED or #IMPLIED.`,
              elementName: declaration.elementName,
              attributeName: attribute.name,
              sourceId: sourceFileId,
              range: attribute.defaultDeclaration.range,
            }),
          );
        }
      }

      const literalValue = literalDefaultValue(attribute.defaultDeclaration);
      const allowedValues =
        attribute.type.kind === 'enumeration'
          ? attribute.type.values.map(({ value }) => value)
          : attribute.type.kind === 'notation'
            ? attribute.type.names.map(({ name }) => name)
            : undefined;
      if (
        literalValue !== undefined &&
        allowedValues &&
        !allowedValues.includes(literalValue)
      ) {
        diagnostics.push(
          diagnostic({
            code: 'attribute-default-not-in-allowed-values',
            message: `Default value "${literalValue}" for attribute "${attribute.name}" on element "${declaration.elementName}" is not one of its allowed values.`,
            elementName: declaration.elementName,
            attributeName: attribute.name,
            sourceId: sourceFileId,
            range: attribute.defaultDeclaration.range,
          }),
        );
      }

      const order = orderByOwner.get(declaration.elementName) ?? 0;
      orderByOwner.set(declaration.elementName, order + 1);
      const attributeNodeId =
        attributeNodeIdFor(declaration.elementName, attribute.name) +
        (firstAttribute && completeVisualization
          ? `:${attribute.range.start.offset}-${attribute.range.end.offset}`
          : '');
      const declarationText = sourceText.slice(
        attribute.range.start.offset,
        attribute.range.end.offset,
      );
      const normalizedType = normalizeAttributeType(attribute.type);
      const normalizedDefault = normalizeAttributeDefault(
        attribute.defaultDeclaration,
      );
      const typeLabel =
        normalizedType.kind === 'tokenized'
          ? normalizedType.name
          : normalizedType.kind === 'notation'
            ? `NOTATION (${normalizedType.values.join(' | ')})`
            : `(${normalizedType.values.join(' | ')})`;
      const defaultLabel =
        normalizedDefault.kind === 'required'
          ? '#REQUIRED'
          : normalizedDefault.kind === 'implied'
            ? '#IMPLIED'
            : normalizedDefault.kind === 'fixed'
              ? `#FIXED ${normalizedDefault.literal.quote === 'single' ? "'" : '"'}${normalizedDefault.literal.value}${normalizedDefault.literal.quote === 'single' ? "'" : '"'}`
              : `${normalizedDefault.literal.quote === 'single' ? "'" : '"'}${normalizedDefault.literal.value}${normalizedDefault.literal.quote === 'single' ? "'" : '"'}`;

      state.nodes.push({
        id: attributeNodeId,
        kind: 'dtdAttribute',
        name: attribute.name,
        sourceFileId,
        sourceOrder: completeVisualization
          ? attribute.range.start.offset
          : order,
        compactDeclaration: declarationText,
        ...(completeVisualization
          ? {
              properties: [
                {
                  label: 'Owning element name',
                  value: declaration.elementName,
                },
                { label: 'Attribute type', value: typeLabel },
                { label: 'Default declaration', value: defaultLabel },
              ],
              searchTerms: [
                declaration.elementName,
                attribute.name,
                typeLabel,
                defaultLabel,
                ...(normalizedType.kind === 'tokenized'
                  ? []
                  : normalizedType.values),
              ],
            }
          : {}),
      });
      state.edges.push({
        id: edgeIdForAttribute(
          declaration.elementName,
          attribute.name,
          attribute.range,
        ),
        kind: 'usesAttribute',
        sourceNodeId: ownerNode.id,
        targetNodeId: attributeNodeId,
        order,
      });
      if (completeVisualization) {
        state.edges.push({
          id: `dtd:attributeBelongsToList:${encodeNameForId(attributeListNodeId)}:${attribute.range.start.offset}-${attribute.range.end.offset}:${order}`,
          kind: 'attributeBelongsToList',
          sourceNodeId: attributeListNodeId,
          targetNodeId: attributeNodeId,
          order,
        });
      }
      state.attributesByNodeId[attributeNodeId] = {
        attributeNodeId,
        ownerElementNodeId: ownerNode.id,
        name: attribute.name,
        type: normalizedType,
        defaultDeclaration: normalizedDefault,
        sourceFileId,
        declarationText,
        sourceRange: cloneRange(attribute.range),
        order,
      };
    }
  }

  return state;
}

export function buildDtdProjectFromDeclarations(
  declarations: readonly DtdDeclarationAst[],
  sourceText: string,
  options: DtdProjectBuildOptions,
  comments: readonly DtdCommentAst[] = [],
  constructs: readonly DtdExtendedConstructAst[] = [],
): DtdProjectBuildResult {
  const elementDeclarations = declarations.filter(
    (declaration): declaration is DtdElementDeclarationAst =>
      declaration.kind === 'elementDeclaration',
  );
  const attributeDeclarations = declarations.filter(
    (declaration): declaration is DtdAttributeListDeclarationAst =>
      declaration.kind === 'attributeListDeclaration',
  );
  const baseResult = buildDtdSchemaProject(
    elementDeclarations,
    sourceText,
    options,
  );
  if (!baseResult.project || hasError(baseResult.diagnostics)) {
    return baseResult;
  }

  const diagnostics = [
    ...baseResult.diagnostics,
    ...findInvalidAttributeRanges(
      attributeDeclarations,
      sourceText,
      options.sourceFileId,
    ),
  ];
  if (hasError(diagnostics)) {
    return {
      diagnostics,
      contentKindsByNodeId: baseResult.contentKindsByNodeId,
      dtdAttributesByNodeId: {},
      comments: [],
      commentsByNodeId: {},
      schemaLevelComments: [],
      sourceMarkupByNodeId: {},
    };
  }

  const attributes = buildAttributes(
    attributeDeclarations,
    baseResult.project,
    sourceText,
    options.sourceFileId,
    diagnostics,
    options.standardsAccepted === true,
  );
  if (hasError(diagnostics)) {
    return {
      diagnostics,
      contentKindsByNodeId: baseResult.contentKindsByNodeId,
      dtdAttributesByNodeId: {},
      comments: [],
      commentsByNodeId: {},
      schemaLevelComments: [],
      sourceMarkupByNodeId: {},
    };
  }

  const project: SchemaProject = {
    ...baseResult.project,
    nodes: [...baseResult.project.nodes, ...attributes.nodes],
    edges: [...baseResult.project.edges, ...attributes.edges],
  };

  for (const finding of validateSchemaProject(project)) {
    diagnostics.push(
      diagnostic({
        code: 'project-validation-failed',
        message: `Normalized DTD project validation failed (${finding.code}): ${finding.message}`,
        sourceId: options.sourceFileId,
      }),
    );
  }

  if (hasError(diagnostics)) {
    return {
      diagnostics,
      contentKindsByNodeId: baseResult.contentKindsByNodeId,
      dtdAttributesByNodeId: {},
      comments: [],
      commentsByNodeId: {},
      schemaLevelComments: [],
      sourceMarkupByNodeId: {},
    };
  }

  const commentAttachments = attachDtdComments(
    comments,
    declarations,
    sourceText,
    options.sourceFileId,
  );
  const elementDeclarationsByNodeId = new Map(
    elementDeclarations.map(
      (declaration) => [nodeIdForName(declaration.name), declaration] as const,
    ),
  );
  const projectWithoutCommentTrivia: SchemaProject = {
    ...project,
    nodes: project.nodes.map((node) => {
      const declaration = elementDeclarationsByNodeId.get(node.id);
      if (!declaration) return node;
      return {
        ...node,
        compactDeclaration: declarationTextWithoutCommentTrivia(
          declaration,
          sourceText,
          comments,
        ),
      };
    }),
  };

  const sourceMarkupByNodeId = buildDtdSourceMarkupByNodeId(
    declarations,
    sourceText,
    options.sourceFileId,
    commentAttachments.comments,
  );
  if (options.standardsAccepted !== true) {
    return {
      project: projectWithoutCommentTrivia,
      diagnostics,
      contentKindsByNodeId: baseResult.contentKindsByNodeId,
      dtdAttributesByNodeId: attributes.attributesByNodeId,
      ...commentAttachments,
      sourceMarkupByNodeId,
    };
  }
  const completed = completeDtdProject({
    project: projectWithoutCommentTrivia,
    declarations,
    elementDeclarations,
    constructs,
    comments,
    normalizedComments: commentAttachments.comments,
    sourceText,
    sourceFileId: options.sourceFileId,
    sourceMarkupByNodeId,
  });

  for (const finding of validateSchemaProject(completed.project)) {
    diagnostics.push(
      diagnostic({
        code: 'project-validation-failed',
        message: `Completed normalized DTD project validation failed (${finding.code}): ${finding.message}`,
        sourceId: options.sourceFileId,
      }),
    );
  }

  return {
    project: completed.project,
    diagnostics,
    contentKindsByNodeId: baseResult.contentKindsByNodeId,
    dtdAttributesByNodeId: attributes.attributesByNodeId,
    ...commentAttachments,
    sourceMarkupByNodeId: completed.sourceMarkupByNodeId,
  };
}
