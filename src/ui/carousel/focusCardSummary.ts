import {
  formatOccurrence,
  getContainedChildren,
  getIncomingStructuralRelationships,
  getOutgoingEdges,
  getOutgoingStructuralRelationships,
  getSchemaNode,
  type SchemaEdgeKind,
  type SchemaNodeId,
  type SchemaNodeKind,
  type SchemaProject,
} from '../../schema/model';
import { getNodeSourceFilename } from './carouselHeading';
import { buildProjectPresentationContext } from '../presentation/projectPresentation';
import type { DtdCommentsByNodeId } from '../../schema/dtd';
import type { XsdMetadataByNodeId } from '../../schema/xsd';
import { buildDtdCommentExcerpt } from '../presentation/dtdCommentPresentation';
import {
  buildJourneyRelationshipPresentation,
  formatOutgoingRelationshipLabel,
} from '../presentation/schemaRelationshipPresentation';
import type { NavigationState } from '../../app/stores/navigationTypes';
import {
  getSchemaNodeDisplayName,
  selectXsdNodePresentation,
  type XsdPresentationProperty,
} from '../presentation/xsdMetadataPresentation';
import { selectXsdComplexTypeDerivationPresentation } from '../presentation/xsdComplexTypeDerivationPresentation';
import {
  selectXsdDocumentationCardPresentation,
  type XsdDocumentationCardPresentation,
} from '../presentation/xsdDocumentationCardPresentation';

export const FOCUS_CARD_RELATIONSHIP_LIMIT = 4;
export const FOCUS_CARD_CONTENT_MODEL_REFERENCE_LIMIT = 50;

export interface FocusCardDestinationSummary {
  readonly edgeId: string;
  readonly relationshipKind: SchemaEdgeKind;
  readonly relationshipLabel: string;
  readonly nodeId: SchemaNodeId;
  readonly displayName: string;
  readonly kind: SchemaNodeKind;
  readonly occurrence: string;
  readonly disposition?: 'advance' | 'terminalCycleClosure';
  readonly targetJourneyPosition?: number;
  readonly isCurrentFocusClosure?: boolean;
  readonly terminalLabel?: string;
}

export type FocusCardContentModelPart =
  | {
      readonly kind: 'text';
      readonly id: string;
      readonly text: string;
    }
  | {
      readonly kind: 'nodeReference';
      readonly id: string;
      readonly nodeId: SchemaNodeId;
      readonly displayName: string;
      readonly occurrence: string;
      readonly relationshipLabel?: string;
      readonly disposition?: 'advance' | 'terminalCycleClosure';
      readonly isCurrentFocusClosure?: boolean;
      readonly terminalLabel?: string;
    };

export interface FocusCardSummary {
  readonly nodeId: SchemaNodeId;
  readonly displayName: string;
  readonly kind: SchemaNodeKind;
  readonly sourceFilename?: string;
  readonly showSourceFilename: boolean;
  readonly declaration?: string;
  readonly contentModelParts: readonly FocusCardContentModelPart[];
  readonly orderedDestinationSummaries: readonly FocusCardDestinationSummary[];
  readonly visibleRelationshipSummaries: readonly FocusCardDestinationSummary[];
  readonly hiddenRelationshipCount: number;
  readonly xsdProperties: readonly XsdPresentationProperty[];
  readonly documentation?: XsdDocumentationCardPresentation;
  readonly hasXsdPresentation: boolean;
  readonly destinationCount: number;
  readonly incomingUseCount: number;
  readonly attributeCount: number;
  readonly attributeCountKind: 'attribute' | 'global attribute';
  readonly commentCount: number;
  readonly commentExcerpt?: string;
  readonly annotationCount: number;
  readonly annotationContent?: {
    readonly label: string;
    readonly excerpt: string;
  };
  readonly isStructuralLeaf: boolean;
  readonly leafStateLabel: string;
}

function annotationContentSummary(
  metadata: XsdMetadataByNodeId[string] | undefined,
): FocusCardSummary['annotationContent'] {
  const content = metadata?.annotationContent;
  if (!content) return undefined;
  const excerpt = (value: string): string => {
    const normalized = value.replace(/\s+/gu, ' ').trim();
    return normalized.length > 180
      ? `${normalized.slice(0, 179).trimEnd()}…`
      : normalized || 'No flattened text content.';
  };
  switch (content.kind) {
    case 'annotation':
      return {
        label: 'XSD annotation',
        excerpt: `${content.entryCount} ${content.entryCount === 1 ? 'entry' : 'entries'} in source order`,
      };
    case 'documentation':
      return { label: 'Documentation', excerpt: excerpt(content.text) };
    case 'appInfo':
      return {
        label: 'Appinfo · machine/private content',
        excerpt: excerpt(content.text),
      };
    case 'foreignElement':
      return {
        label: 'Preserved uninterpreted foreign content',
        excerpt: `${content.qualifiedName}${content.namespaceUri ? ` · ${content.namespaceUri}` : ''}`,
      };
    case 'comment':
      return { label: 'XML comment', excerpt: excerpt(content.text) };
    case 'processingInstruction':
      return {
        label: 'XML processing instruction',
        excerpt: excerpt(`${content.target} ${content.data}`),
      };
    case 'prolog':
      return { label: 'XML declaration', excerpt: excerpt(content.data) };
  }
}

function buildContentModelParts(
  declaration: string | undefined,
  destinations: readonly FocusCardDestinationSummary[],
): FocusCardContentModelPart[] {
  if (!declaration) return [];
  if (destinations.length === 0) {
    return [{ kind: 'text', id: 'text:0', text: declaration }];
  }

  const parts: FocusCardContentModelPart[] = [];
  const visibleDestinations = destinations.slice(
    0,
    FOCUS_CARD_CONTENT_MODEL_REFERENCE_LIMIT,
  );
  let cursor = 0;

  for (const destination of visibleDestinations) {
    const referenceText = `${destination.displayName}${destination.occurrence}`;
    const referenceIndex = declaration.indexOf(referenceText, cursor);
    if (referenceIndex < 0) {
      return [{ kind: 'text', id: 'text:fallback', text: declaration }];
    }

    if (referenceIndex > cursor) {
      parts.push({
        kind: 'text',
        id: `text:${cursor}`,
        text: declaration.slice(cursor, referenceIndex),
      });
    }
    parts.push({
      kind: 'nodeReference',
      id: destination.edgeId,
      nodeId: destination.nodeId,
      displayName: destination.displayName,
      occurrence: destination.occurrence,
      relationshipLabel: destination.relationshipLabel,
      disposition: destination.disposition,
      isCurrentFocusClosure: destination.isCurrentFocusClosure,
      ...(destination.terminalLabel
        ? { terminalLabel: destination.terminalLabel }
        : {}),
    });
    cursor = referenceIndex + referenceText.length;
  }

  if (visibleDestinations.length < destinations.length) {
    parts.push({
      kind: 'text',
      id: 'text:bounded-remainder',
      text: ` … +${destinations.length - visibleDestinations.length} more destinations`,
    });
    return parts;
  }

  if (cursor < declaration.length) {
    parts.push({
      kind: 'text',
      id: `text:${cursor}`,
      text: declaration.slice(cursor),
    });
  }

  return parts;
}

export function buildFocusCardSummary(
  project: SchemaProject,
  nodeId: SchemaNodeId,
  commentsByNodeId: DtdCommentsByNodeId = {},
  xsdMetadataByNodeId: XsdMetadataByNodeId = {},
  navigationState?: NavigationState,
): FocusCardSummary | undefined {
  const node = getSchemaNode(project, nodeId);
  if (!node) return undefined;

  const effectiveNavigationState: NavigationState = navigationState ?? {
    projectId: project.id,
    navigationPath: [node.id],
  };
  const destinations = getOutgoingStructuralRelationships(project, nodeId);
  const orderedDestinationSummaries = destinations.map((relationship) => {
    const { edge, node: destination } = relationship;
    const journeyPresentation = buildJourneyRelationshipPresentation(
      project,
      effectiveNavigationState,
      relationship,
    );
    return {
      edgeId: edge.id,
      relationshipKind: edge.kind,
      relationshipLabel:
        journeyPresentation?.relationshipLabel ??
        formatOutgoingRelationshipLabel(edge.kind, node.kind, destination.kind),
      nodeId: destination.id,
      displayName: getSchemaNodeDisplayName(
        project,
        destination,
        xsdMetadataByNodeId,
      ),
      kind: destination.kind,
      occurrence:
        edge.kind === 'contains' ||
        edge.kind === 'contentModelMember' ||
        edge.kind === 'contentModelReference' ||
        edge.kind === 'referencesUndeclaredElementName'
          ? formatOccurrence(edge.occurrence)
          : '',
      disposition: journeyPresentation?.disposition ?? 'advance',
      ...(journeyPresentation?.targetJourneyPosition !== undefined
        ? {
            targetJourneyPosition: journeyPresentation.targetJourneyPosition,
          }
        : {}),
      isCurrentFocusClosure:
        journeyPresentation?.isCurrentFocusClosure ?? false,
      ...(journeyPresentation?.terminalLabel
        ? { terminalLabel: journeyPresentation.terminalLabel }
        : {}),
    } satisfies FocusCardDestinationSummary;
  });
  const destinationSummaryByEdgeId = new Map(
    orderedDestinationSummaries.map((summary) => [summary.edgeId, summary]),
  );
  const containedDestinationSummaries = getContainedChildren(
    project,
    nodeId,
  ).map((relationship) => {
    const summary = destinationSummaryByEdgeId.get(relationship.edge.id);
    return (
      summary ?? {
        edgeId: relationship.edge.id,
        relationshipKind: relationship.edge.kind,
        relationshipLabel: formatOutgoingRelationshipLabel(
          relationship.edge.kind,
          node.kind,
          relationship.node.kind,
        ),
        nodeId: relationship.node.id,
        displayName: getSchemaNodeDisplayName(
          project,
          relationship.node,
          xsdMetadataByNodeId,
        ),
        kind: relationship.node.kind,
        occurrence: formatOccurrence(relationship.edge.occurrence),
        disposition: 'advance' as const,
        isCurrentFocusClosure: false,
      }
    );
  });
  const sourceFilename = getNodeSourceFilename(project, node);
  const projectPresentation = buildProjectPresentationContext(project);
  const declaration =
    node.kind === 'dtdElement' || node.kind === 'dtdAttributeList'
      ? node.compactDeclaration?.trim() || undefined
      : undefined;
  const xsdPresentation = selectXsdNodePresentation(
    project,
    nodeId,
    xsdMetadataByNodeId,
  );
  const complexDerivation = selectXsdComplexTypeDerivationPresentation(
    project,
    nodeId,
    xsdMetadataByNodeId,
  );
  const xsdMetadata = xsdMetadataByNodeId[nodeId];
  const documentation =
    xsdMetadata?.kind === node.kind &&
    xsdMetadata.sourceFileId === node.sourceFileId
      ? selectXsdDocumentationCardPresentation(nodeId, xsdMetadataByNodeId)
      : undefined;
  const comments = [...(commentsByNodeId[nodeId] ?? [])].sort(
    (left, right) =>
      left.order - right.order || left.commentId.localeCompare(right.commentId),
  );
  const annotationCount = getOutgoingEdges(project, nodeId).filter(
    ({ kind }) => kind === 'ownsAnnotation',
  ).length;
  const globalAttributeCount =
    node.kind === 'schema'
      ? project.nodes.filter(
          ({ id, kind }) =>
            kind === 'attribute' &&
            xsdMetadataByNodeId[id]?.kind === 'attribute' &&
            xsdMetadataByNodeId[id]?.scope === 'global',
        ).length
      : 0;
  const directAttributeCount =
    node.kind === 'dtdElement' ||
    node.kind === 'dtdAttributeList' ||
    node.kind === 'complexType'
      ? (complexDerivation?.declaredAttributeCount ??
        getOutgoingEdges(project, nodeId).filter(
          ({ kind }) => kind === 'usesAttribute',
        ).length)
      : node.kind === 'extension' ||
          (node.kind === 'restriction' && complexDerivation)
        ? getOutgoingEdges(project, nodeId).filter(
            ({ kind }) => kind === 'usesAttribute',
          ).length
        : 0;

  return {
    nodeId: node.id,
    displayName: getSchemaNodeDisplayName(project, node, xsdMetadataByNodeId),
    kind: node.kind,
    sourceFilename,
    showSourceFilename:
      Boolean(sourceFilename) && projectPresentation.hasMultipleSourceFiles,
    declaration,
    contentModelParts: buildContentModelParts(
      declaration,
      containedDestinationSummaries,
    ),
    orderedDestinationSummaries,
    visibleRelationshipSummaries: orderedDestinationSummaries.slice(
      0,
      FOCUS_CARD_RELATIONSHIP_LIMIT,
    ),
    hiddenRelationshipCount: Math.max(
      0,
      orderedDestinationSummaries.length - FOCUS_CARD_RELATIONSHIP_LIMIT,
    ),
    xsdProperties: [
      ...(xsdMetadata?.kind === node.kind &&
      [
        'list',
        'union',
        'facet',
        'enumeration',
        'builtInType',
        'identityConstraint',
        'selector',
        'field',
        'xsdNotation',
      ].includes(node.kind)
        ? (node.properties ?? []).map((property, index) => ({
            id: `semantic-${index}`,
            label: property.label,
            value: property.value,
          }))
        : []),
      ...(xsdPresentation?.properties ?? []),
    ],
    ...(documentation ? { documentation } : {}),
    hasXsdPresentation: Boolean(xsdPresentation),
    destinationCount: destinations.length,
    incomingUseCount: getIncomingStructuralRelationships(project, nodeId)
      .length,
    attributeCount:
      node.kind === 'schema' ? globalAttributeCount : directAttributeCount,
    attributeCountKind:
      node.kind === 'schema' ? 'global attribute' : 'attribute',
    commentCount: comments.length,
    ...(comments[0]
      ? { commentExcerpt: buildDtdCommentExcerpt(comments[0].text) }
      : {}),
    annotationCount,
    ...(annotationContentSummary(xsdMetadata)
      ? { annotationContent: annotationContentSummary(xsdMetadata)! }
      : {}),
    isStructuralLeaf: destinations.length === 0,
    leafStateLabel:
      node.kind === 'dtdAttributeList'
        ? 'No ELEMENT declaration'
        : xsdPresentation
          ? 'No structural destinations'
          : 'No child structures',
  };
}
