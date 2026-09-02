import {
  schemaNodeKinds,
  type SchemaNode,
  type SchemaNodeKind,
} from '../../schema/model';
import type { DtdNormalizedComment } from '../../schema/dtd';
import {
  selectOrderedXsdAnnotationEntries,
  type XsdNodeMetadata,
  type XsdNormalizedReference,
} from '../../schema/xsd';
import { normalizeProjectSearchText } from './projectSearchNormalization';
import type {
  ProjectSearchDocument,
  ProjectSearchField,
  ProjectSearchFieldKind,
  ProjectSearchIndex,
  ProjectSearchIndexInput,
  ProjectSearchNodeCategory,
} from './projectSearchTypes';

export const PROJECT_SEARCH_UNDEFINED_SOURCE_ORDER = Number.MAX_SAFE_INTEGER;

export const projectSearchNodeCategoryOrder = [
  'schema',
  'element',
  'type',
  'attribute',
  'dtdDeclaration',
  'structure',
  'packageSource',
  'packageEntry',
  'other',
] as const satisfies readonly ProjectSearchNodeCategory[];

export function selectProjectSearchNodeCategory(
  kind: SchemaNodeKind,
): ProjectSearchNodeCategory {
  switch (kind) {
    case 'schema':
    case 'relaxNgSchema':
      return 'schema';
    case 'globalElement':
    case 'localElement':
    case 'elementReference':
    case 'relaxNgElement':
      return 'element';
    case 'complexType':
    case 'simpleType':
      return 'type';
    case 'attribute':
    case 'attributeReference':
    case 'dtdAttribute':
    case 'relaxNgAttribute':
      return 'attribute';
    case 'dtdElement':
    case 'dtdContentModel':
    case 'dtdAttributeList':
    case 'dtdEntity':
    case 'dtdParameterEntity':
    case 'dtdNotation':
    case 'dtdElementReference':
    case 'dtdConditionalSection':
    case 'dtdComment':
    case 'dtdProcessingInstruction':
    case 'dtdDependency':
      return 'dtdDeclaration';
    case 'attributeGroup':
    case 'attributeGroupReference':
    case 'group':
    case 'groupReference':
    case 'sequence':
    case 'choice':
    case 'all':
    case 'simpleContent':
    case 'complexContent':
    case 'elementWildcard':
    case 'attributeWildcard':
    case 'extension':
    case 'restriction':
    case 'list':
    case 'union':
    case 'facet':
    case 'enumeration':
    case 'builtInType':
    case 'identityConstraint':
    case 'selector':
    case 'field':
    case 'xsdNotation':
    case 'import':
    case 'include':
    case 'redefine':
    case 'xsdAnnotation':
    case 'xsdDocumentation':
    case 'xsdAppInfo':
    case 'xsdForeignElement':
    case 'xsdComment':
    case 'xsdProcessingInstruction':
    case 'xsdProlog':
    case 'relaxNgGrammar':
    case 'relaxNgStart':
    case 'relaxNgDefinition':
    case 'relaxNgReference':
    case 'relaxNgExternalReference':
    case 'relaxNgInclude':
    case 'relaxNgPattern':
    case 'relaxNgNameClass':
      return 'structure';
    default:
      return 'other';
  }
}

function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left);
  const rightPoints = Array.from(right);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const difference =
      leftPoints[index]!.codePointAt(0)! - rightPoints[index]!.codePointAt(0)!;
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
}

function nodeKindOrder(kind: SchemaNodeKind | undefined): number {
  if (kind === undefined) return schemaNodeKinds.length;
  const order = (schemaNodeKinds as readonly SchemaNodeKind[]).indexOf(kind);
  return order === -1 ? schemaNodeKinds.length : order;
}

function sourceFilenameWithoutLocalPath(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  const segments = trimmed.replace(/\\/g, '/').split('/');
  return segments[segments.length - 1] || undefined;
}

function resolveSourceFilename(
  node: SchemaNode,
  input: ProjectSearchIndexInput,
): string | undefined {
  if (node.sourceFileId) {
    const matchingSource = input.project.sourceFiles?.find(
      ({ id }) => id === node.sourceFileId,
    );
    const matchingFilename = matchingSource
      ? sourceFilenameWithoutLocalPath(matchingSource.filename)
      : undefined;
    return (
      matchingFilename ?? sourceFilenameWithoutLocalPath(node.sourceFileId)
    );
  }
  return input.sourceFilename
    ? sourceFilenameWithoutLocalPath(input.sourceFilename)
    : undefined;
}

function matchingXsdMetadata(
  node: SchemaNode,
  input: ProjectSearchIndexInput,
): XsdNodeMetadata | undefined {
  const metadata = input.xsdMetadataByNodeId?.[node.id];
  if (
    metadata?.kind !== node.kind ||
    (node.sourceFileId !== undefined &&
      metadata.sourceFileId !== node.sourceFileId)
  ) {
    return undefined;
  }
  return metadata;
}

function orderedReferences(
  metadata: XsdNodeMetadata | undefined,
): readonly XsdNormalizedReference[] {
  if (!metadata) return [];
  return [
    metadata.typeReference,
    metadata.elementReference,
    metadata.attributeReference,
    metadata.groupReference,
    metadata.attributeGroupReference,
    metadata.substitutionGroupReference,
    metadata.restrictionBaseReference,
    metadata.complexTypeDerivation?.baseReference,
    metadata.typeDerivation?.baseReference,
    metadata.listItemTypeReference,
    ...(metadata.unionMemberTypeReferences ?? []),
    metadata.identityConstraint?.referReference,
    metadata.notationReference,
  ].filter(
    (reference): reference is XsdNormalizedReference => reference !== undefined,
  );
}

function orderedAttachedComments(
  nodeId: string,
  comments: readonly DtdNormalizedComment[],
): readonly DtdNormalizedComment[] {
  return comments
    .map((comment, stableIndex) => ({ comment, stableIndex }))
    .filter(
      ({ comment }) =>
        comment.attachmentKind !== 'schema' &&
        (comment.attachedNodeId === undefined ||
          comment.attachedNodeId === nodeId),
    )
    .sort(
      (left, right) =>
        left.comment.order - right.comment.order ||
        left.comment.sourceRange.start.offset -
          right.comment.sourceRange.start.offset ||
        left.stableIndex - right.stableIndex,
    )
    .map(({ comment }) => comment);
}

interface FieldCandidate {
  readonly kind: ProjectSearchFieldKind;
  readonly text: string;
  readonly key: string;
  readonly language?: string;
}

function buildFields(
  node: SchemaNode,
  input: ProjectSearchIndexInput,
  metadata: XsdNodeMetadata | undefined,
  sourceFilename: string | undefined,
): readonly ProjectSearchField[] {
  const candidates: FieldCandidate[] = [
    { kind: 'name', text: node.name, key: 'primary' },
  ];

  for (const [termIndex, term] of (node.searchTerms ?? []).entries()) {
    candidates.push({
      kind: 'reference',
      text: term,
      key: `semantic:${termIndex}`,
    });
  }

  for (const [referenceIndex, reference] of orderedReferences(
    metadata,
  ).entries()) {
    candidates.push({
      kind: 'reference',
      text: reference.raw,
      key: `${referenceIndex}:raw`,
    });
    if (reference.localName !== reference.raw) {
      candidates.push({
        kind: 'reference',
        text: reference.localName,
        key: `${referenceIndex}:local`,
      });
    }
  }

  for (const ordered of selectOrderedXsdAnnotationEntries(metadata)) {
    if (ordered.entry.kind !== 'documentation') continue;
    candidates.push({
      kind: 'documentation',
      text: ordered.entry.text,
      key: `${ordered.annotationOffset}:${ordered.entryOffset}:${ordered.stableIndex}`,
      ...(ordered.entry.xmlLang?.value
        ? { language: ordered.entry.xmlLang.value }
        : {}),
    });
  }

  for (const comment of orderedAttachedComments(
    node.id,
    input.commentsByNodeId?.[node.id] ?? [],
  )) {
    candidates.push({
      kind: 'dtdComment',
      text: comment.text,
      key: comment.commentId,
    });
  }

  if (sourceFilename !== undefined) {
    candidates.push({
      kind: 'sourceFile',
      text: sourceFilename,
      key: 'resolved',
    });
  }

  const seen = new Set<string>();
  const fields: ProjectSearchField[] = [];
  for (const candidate of candidates) {
    const normalizedText = normalizeProjectSearchText(candidate.text);
    if (candidate.kind !== 'name' && normalizedText.length === 0) continue;
    const deduplicationKey = JSON.stringify([
      candidate.kind,
      candidate.text,
      candidate.language ?? null,
    ]);
    if (seen.has(deduplicationKey)) continue;
    seen.add(deduplicationKey);
    fields.push(
      Object.freeze({
        id: `field:${encodeURIComponent(node.id)}:${candidate.kind}:${encodeURIComponent(candidate.key)}`,
        kind: candidate.kind,
        text: candidate.text,
        normalizedText,
        sourceOrder: fields.length,
        ...(candidate.language ? { language: candidate.language } : {}),
      }),
    );
  }

  return Object.freeze(fields);
}

function buildDocument(
  node: SchemaNode,
  input: ProjectSearchIndexInput,
): ProjectSearchDocument {
  const sourceFilename = resolveSourceFilename(node, input);
  const metadata = matchingXsdMetadata(node, input);
  return Object.freeze({
    id: `search-document:${encodeURIComponent(node.id)}`,
    resultKind: 'schema-node',
    nodeId: node.id,
    nodeKind: node.kind,
    nodeCategory: selectProjectSearchNodeCategory(node.kind),
    nodeName: node.name,
    normalizedNodeName: normalizeProjectSearchText(node.name),
    ...(node.sourceFileId ? { sourceFileId: node.sourceFileId } : {}),
    ...(sourceFilename ? { sourceFilename } : {}),
    sourceOrder: node.sourceOrder ?? PROJECT_SEARCH_UNDEFINED_SOURCE_ORDER,
    fields: buildFields(node, input, metadata, sourceFilename),
  });
}

function packageEntryDocument(
  entry: NonNullable<ProjectSearchIndexInput['packageEntries']>[number],
): ProjectSearchDocument {
  const fields: ProjectSearchField[] = [];
  const add = (kind: ProjectSearchField['kind'], text: string, key: string) => {
    const normalizedText = normalizeProjectSearchText(text);
    if (normalizedText.length === 0) return;
    if (fields.some((field) => field.kind === kind && field.text === text))
      return;
    fields.push({
      id: `field:${encodeURIComponent(entry.id)}:${kind}:${encodeURIComponent(key)}`,
      kind,
      text,
      normalizedText,
      sourceOrder: fields.length,
    });
  };
  add('name', entry.basename, 'name');
  add('packagePath', entry.archivePath, 'archive');
  add('packagePath', entry.normalizedPath, 'normalized');
  add('sourceFile', entry.packageRelativePath, 'project');
  add('packageReason', entry.classificationReason, 'classification');
  const relationshipLabel = (
    kind: (typeof entry.dependencies)[number]['kind'],
  ): string => {
    switch (kind) {
      case 'rng-include':
        return 'RELAX NG include';
      case 'rng-external-ref':
        return 'RELAX NG externalRef';
      case 'external-entity':
        return 'DTD external entity';
      case 'include':
        return 'XSD include';
      case 'import':
        return 'XSD import';
      case 'redefine':
        return 'XSD redefine';
    }
  };
  for (const relationship of entry.dependencies) {
    add('dependency', relationship.rawTarget, relationship.id);
    add('dependency', relationship.sourcePath, `${relationship.id}:source`);
    add(
      'dependency',
      relationshipLabel(relationship.kind),
      `${relationship.id}:kind`,
    );
    add('dependency', relationship.status, `${relationship.id}:status`);
    if (relationship.blockedReason) {
      add(
        'dependency',
        relationship.blockedReason,
        `${relationship.id}:blocked-reason`,
      );
    }
    if (relationship.targetPath) {
      add('dependency', relationship.targetPath, `${relationship.id}:target`);
    }
    for (const candidatePath of relationship.candidatePaths ?? []) {
      add(
        'dependency',
        candidatePath,
        `${relationship.id}:candidate:${candidatePath}`,
      );
    }
  }
  for (const relationship of entry.dependents) {
    add('dependency', relationship.sourcePath, `${relationship.id}:source`);
  }
  return Object.freeze({
    id: `search-document:${encodeURIComponent(entry.id)}`,
    resultKind: 'package-entry',
    nodeId: entry.id,
    packageEntryId: entry.id,
    packageEntryKind: entry.kind,
    nodeCategory:
      entry.kind === 'xsd-source' ||
      entry.kind === 'dtd-source' ||
      entry.kind === 'rng-source' ||
      entry.kind === 'auxiliary'
        ? 'packageSource'
        : 'packageEntry',
    nodeName: entry.basename,
    normalizedNodeName: normalizeProjectSearchText(entry.basename),
    ...(entry.sourceFileId ? { sourceFileId: entry.sourceFileId } : {}),
    sourceFilename: entry.packageRelativePath,
    sourceOrder:
      PROJECT_SEARCH_UNDEFINED_SOURCE_ORDER - 10_000 + entry.deterministicOrder,
    fields: Object.freeze(fields),
  });
}

function compareDocuments(
  left: ProjectSearchDocument,
  right: ProjectSearchDocument,
): number {
  return (
    left.sourceOrder - right.sourceOrder ||
    nodeKindOrder(left.nodeKind) - nodeKindOrder(right.nodeKind) ||
    compareCodePoints(left.nodeName, right.nodeName) ||
    compareCodePoints(left.id, right.id)
  );
}

/**
 * Builds one plain, canonical search document per schema node. Undefined node
 * source orders use Number.MAX_SAFE_INTEGER so they sort after defined orders.
 * DTD schema-level comments are intentionally excluded because the current
 * graph has no concrete navigable node that can own those search results.
 */
export function buildProjectSearchIndex(
  input: ProjectSearchIndexInput,
): ProjectSearchIndex {
  const documents = [
    ...input.project.nodes.map((node) => buildDocument(node, input)),
    ...(input.packageEntries ?? []).map(packageEntryDocument),
  ].sort(compareDocuments);
  return Object.freeze({
    projectId: input.project.id,
    documents: Object.freeze(documents),
  });
}
