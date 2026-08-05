import {
  formatOccurrence,
  getIncomingStructuralRelationships,
  getOutgoingStructuralRelationships,
  getOutgoingRelationships,
  getSchemaNode,
  type SchemaEdgeId,
  type SchemaEdgeKind,
  type SchemaNodeId,
  type SchemaNodeSourceMarkup,
  type SchemaNodeKind,
  type SchemaProject,
  type SchemaSourceMarkupByNodeId,
} from '../../schema/model';
import type {
  DtdAttributesByNodeId,
  DtdCommentsByNodeId,
} from '../../schema/dtd';
import type { XsdMetadataByNodeId } from '../../schema/xsd';
import type { SchemaPackageUnresolvedReference } from '../../app/import/schemaPackage';
import { getNodeSourceFilename } from '../carousel/carouselHeading';
import { formatSchemaNodeKind } from '../carousel/nodePresentation';
import { buildProjectPresentationContext } from '../presentation/projectPresentation';
import {
  formatDtdAttributeDefault,
  formatDtdAttributeType,
} from './attributePresentation';
import { normalizeDtdCommentDisplayText } from '../presentation/dtdCommentPresentation';
import { selectNodeSourceMarkup } from '../presentation/sourceMarkupPresentation';
import { formatOutgoingRelationshipLabel } from '../presentation/schemaRelationshipPresentation';
import { buildJourneyRelationshipPresentation } from '../presentation/schemaRelationshipPresentation';
import type { NavigationState } from '../../app/stores/navigationTypes';
import {
  getSchemaNodeDisplayName,
  selectXsdNodePresentation,
} from '../presentation/xsdMetadataPresentation';
import {
  selectDirectXsdAttributes,
  selectGlobalXsdAttributes,
} from '../presentation/xsdAttributePresentation';
import {
  selectXsdRestrictionPresentation,
  type XsdEnumerationValuePresentation,
} from '../presentation/xsdRestrictionPresentation';
import {
  selectXsdAnnotationPresentation,
  type XsdAppInfoPresentation,
  type XsdDocumentationPresentation,
} from '../presentation/xsdAnnotationPresentation';
import {
  buildUnresolvedReferencePresentation,
  type SchemaSetUnresolvedReferencePresentation,
} from '../presentation/schemaSetOutlinePresentation';

export interface InspectorPropertySummary {
  readonly id: string;
  readonly label: string;
  readonly value: string;
}

export interface InspectorDestinationSummary {
  readonly relationshipId: SchemaEdgeId;
  readonly nodeId: SchemaNodeId;
  readonly displayName: string;
  readonly kind: SchemaNodeKind;
  readonly occurrence: string;
  readonly order: number;
  readonly relationshipKind?: SchemaEdgeKind;
  readonly relationshipLabel?: string;
  readonly disposition?: 'advance' | 'terminalCycleClosure';
  readonly targetJourneyPosition?: number;
  readonly isCurrentFocusClosure?: boolean;
  readonly terminalLabel?: string;
}

export interface InspectorDeclarationSummary extends InspectorDestinationSummary {
  readonly relationshipLabel: string;
}

export interface InspectorIncomingRelationshipSummary {
  readonly relationshipId: SchemaEdgeId;
  readonly nodeId: SchemaNodeId;
  readonly displayName: string;
  readonly kind: SchemaNodeKind;
  readonly relationshipKind: SchemaEdgeKind;
  readonly order: number;
}

export interface InspectorOutgoingRelationshipSummary {
  readonly relationshipId: SchemaEdgeId;
  readonly nodeId: SchemaNodeId;
  readonly displayName: string;
  readonly kind: SchemaNodeKind;
  readonly relationshipKind: SchemaEdgeKind;
  readonly relationshipLabel: string;
  readonly order: number;
  readonly disposition?: 'advance' | 'terminalCycleClosure';
  readonly targetJourneyPosition?: number;
  readonly isCurrentFocusClosure?: boolean;
  readonly terminalLabel?: string;
}

export interface InspectorAttributeSummary {
  readonly nodeId: SchemaNodeId;
  readonly name: string;
  readonly detailLines: readonly string[];
  readonly order: number;
}

export interface InspectorCommentSummary {
  readonly commentId: string;
  readonly text: string;
  readonly order: number;
}

export type InspectorEnumerationValueSummary = XsdEnumerationValuePresentation;

export interface InspectorSummary {
  readonly nodeId: SchemaNodeId;
  readonly displayName: string;
  readonly kind: SchemaNodeKind;
  readonly sourceFilename?: string;
  readonly overviewProperties: readonly InspectorPropertySummary[];
  readonly showRelatedNodeKinds: boolean;
  readonly declaration?: string;
  readonly isSchemaOverview: boolean;
  readonly declarations: readonly InspectorDeclarationSummary[];
  readonly orderedDestinations: readonly InspectorDestinationSummary[];
  readonly relatedDefinitions: readonly InspectorOutgoingRelationshipSummary[];
  readonly attributes: readonly InspectorAttributeSummary[];
  readonly globalAttributes: readonly InspectorAttributeSummary[];
  readonly enumerationValues: readonly InspectorEnumerationValueSummary[];
  readonly documentation: readonly XsdDocumentationPresentation[];
  readonly appInfo: readonly XsdAppInfoPresentation[];
  readonly comments: readonly InspectorCommentSummary[];
  readonly sourceMarkup?: SchemaNodeSourceMarkup;
  readonly incomingRelationships: readonly InspectorIncomingRelationshipSummary[];
  readonly unresolvedReferences: readonly SchemaSetUnresolvedReferencePresentation[];
  readonly isStructuralLeaf: boolean;
  readonly hasStructuralDestinations: boolean;
}

export function buildInspectorSummary(
  project: SchemaProject,
  nodeId: SchemaNodeId,
  dtdAttributesByNodeId: DtdAttributesByNodeId = {},
  commentsByNodeId: DtdCommentsByNodeId = {},
  sourceMarkupByNodeId: SchemaSourceMarkupByNodeId = {},
  xsdMetadataByNodeId: XsdMetadataByNodeId = {},
  navigationState?: NavigationState,
  unresolvedReferences: readonly SchemaPackageUnresolvedReference[] = [],
): InspectorSummary | undefined {
  const node = getSchemaNode(project, nodeId);
  if (!node) return undefined;

  const projectPresentation = buildProjectPresentationContext(project);
  const effectiveNavigationState: NavigationState = navigationState ?? {
    projectId: project.id,
    navigationPath: [node.id],
  };
  const sourceFilename = getNodeSourceFilename(project, node);
  const containedRelationships = getOutgoingStructuralRelationships(
    project,
    nodeId,
  ).filter(
    ({ edge }) =>
      edge.kind === 'contains' ||
      edge.kind === 'contentModelMember' ||
      edge.kind === 'contentModelReference',
  );
  const isSchemaOverview =
    node.kind === 'schema' &&
    xsdMetadataByNodeId[node.id]?.kind === 'schema' &&
    xsdMetadataByNodeId[node.id]?.scope === 'schema';
  const declarations = isSchemaOverview
    ? containedRelationships.map((relationship, order) => {
        const { edge, node: destination } = relationship;
        const journeyPresentation = buildJourneyRelationshipPresentation(
          project,
          effectiveNavigationState,
          relationship,
        );
        return {
          relationshipId: edge.id,
          nodeId: destination.id,
          displayName: getSchemaNodeDisplayName(
            project,
            destination,
            xsdMetadataByNodeId,
          ),
          kind: destination.kind,
          occurrence: '',
          relationshipLabel: formatOutgoingRelationshipLabel(
            edge.kind,
            node.kind,
            destination.kind,
          ),
          relationshipKind: edge.kind,
          disposition: journeyPresentation?.disposition ?? 'advance',
          ...(journeyPresentation?.targetJourneyPosition !== undefined
            ? {
                targetJourneyPosition:
                  journeyPresentation.targetJourneyPosition,
              }
            : {}),
          isCurrentFocusClosure:
            journeyPresentation?.isCurrentFocusClosure ?? false,
          ...(journeyPresentation?.terminalLabel
            ? { terminalLabel: journeyPresentation.terminalLabel }
            : {}),
          order,
        };
      })
    : [];
  const orderedDestinations = isSchemaOverview
    ? []
    : containedRelationships.map((relationship, order) => {
        const { edge, node: destination } = relationship;
        const journeyPresentation = buildJourneyRelationshipPresentation(
          project,
          effectiveNavigationState,
          relationship,
        );
        return {
          relationshipId: edge.id,
          nodeId: destination.id,
          displayName: getSchemaNodeDisplayName(
            project,
            destination,
            xsdMetadataByNodeId,
          ),
          kind: destination.kind,
          occurrence: formatOccurrence(edge.occurrence),
          relationshipKind: edge.kind,
          relationshipLabel:
            journeyPresentation?.relationshipLabel ??
            formatOutgoingRelationshipLabel(
              edge.kind,
              node.kind,
              destination.kind,
            ),
          disposition: journeyPresentation?.disposition ?? 'advance',
          ...(journeyPresentation?.targetJourneyPosition !== undefined
            ? {
                targetJourneyPosition:
                  journeyPresentation.targetJourneyPosition,
              }
            : {}),
          isCurrentFocusClosure:
            journeyPresentation?.isCurrentFocusClosure ?? false,
          ...(journeyPresentation?.terminalLabel
            ? { terminalLabel: journeyPresentation.terminalLabel }
            : {}),
          order,
        };
      });
  const relatedDefinitions = getOutgoingRelationships(project, nodeId)
    .filter(
      ({ edge }) =>
        edge.kind !== 'contains' && edge.kind !== 'sourceOrderAdjacent',
    )
    .map((relationship, order) => {
      const { edge, node: destination } = relationship;
      const journeyPresentation = buildJourneyRelationshipPresentation(
        project,
        effectiveNavigationState,
        relationship,
      );
      return {
        relationshipId: edge.id,
        nodeId: destination.id,
        displayName: getSchemaNodeDisplayName(
          project,
          destination,
          xsdMetadataByNodeId,
        ),
        kind: destination.kind,
        relationshipKind: edge.kind,
        relationshipLabel:
          journeyPresentation?.relationshipLabel ??
          formatOutgoingRelationshipLabel(
            edge.kind,
            node.kind,
            destination.kind,
          ),
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
        order,
      };
    });
  const incomingRelationships = getIncomingStructuralRelationships(
    project,
    nodeId,
  ).map(({ edge, node: source }, order) => ({
    relationshipId: edge.id,
    nodeId: source.id,
    displayName: getSchemaNodeDisplayName(project, source, xsdMetadataByNodeId),
    kind: source.kind,
    relationshipKind: edge.kind,
    order,
  }));
  const dtdAttributes = Object.values(dtdAttributesByNodeId)
    .filter(({ ownerElementNodeId }) => ownerElementNodeId === nodeId)
    .sort(
      (left, right) =>
        left.order - right.order ||
        left.attributeNodeId.localeCompare(right.attributeNodeId),
    )
    .map((attribute) => ({
      nodeId: attribute.attributeNodeId,
      name: attribute.name,
      detailLines: [
        `${formatDtdAttributeType(attribute.type)} · ${formatDtdAttributeDefault(attribute.defaultDeclaration)}`,
      ],
      order: attribute.order,
    }));
  const xsdAttributes = selectDirectXsdAttributes(
    project,
    nodeId,
    xsdMetadataByNodeId,
  );
  const attributes = xsdAttributes.length > 0 ? xsdAttributes : dtdAttributes;
  const globalAttributes = isSchemaOverview
    ? selectGlobalXsdAttributes(project, xsdMetadataByNodeId)
    : [];
  const comments = [...(commentsByNodeId[nodeId] ?? [])]
    .sort(
      (left, right) =>
        left.order - right.order ||
        left.commentId.localeCompare(right.commentId),
    )
    .map((comment) => ({
      commentId: comment.commentId,
      text: normalizeDtdCommentDisplayText(comment.text),
      order: comment.order,
    }));
  const xsdPresentation = selectXsdNodePresentation(
    project,
    nodeId,
    xsdMetadataByNodeId,
  );
  const restrictionPresentation = selectXsdRestrictionPresentation(
    project,
    nodeId,
    xsdMetadataByNodeId,
  );
  const annotationPresentation = selectXsdAnnotationPresentation(
    nodeId,
    xsdMetadataByNodeId,
  );
  const isXsdNode =
    xsdMetadataByNodeId[nodeId]?.kind === node.kind &&
    xsdMetadataByNodeId[nodeId]?.sourceFileId === node.sourceFileId;

  return {
    nodeId: node.id,
    displayName: getSchemaNodeDisplayName(project, node, xsdMetadataByNodeId),
    kind: node.kind,
    sourceFilename,
    overviewProperties: [
      ...(node.properties ?? []).map((property, index) => ({
        id: `semantic-${index}`,
        label: property.label,
        value: property.value,
      })),
      ...(node.kind === 'dtdAttributeList' && !node.properties
        ? [
            {
              id: 'declaration-status',
              label: 'Declaration status',
              value: 'No ELEMENT declaration',
            },
          ]
        : []),
      ...(projectPresentation.hasMultipleNodeKinds && !isSchemaOverview
        ? [
            {
              id: 'kind',
              label: 'Kind',
              value: formatSchemaNodeKind(node.kind),
            },
          ]
        : []),
      ...(projectPresentation.hasMultipleSourceFiles &&
      sourceFilename &&
      !isSchemaOverview
        ? [
            {
              id: 'source-file',
              label: 'Source file',
              value: sourceFilename,
            },
          ]
        : []),
      ...(xsdPresentation?.properties ?? []),
    ],
    showRelatedNodeKinds: projectPresentation.hasMultipleNodeKinds,
    declaration:
      isSchemaOverview || isXsdNode
        ? undefined
        : node.compactDeclaration?.trim() || undefined,
    isSchemaOverview,
    declarations,
    orderedDestinations,
    relatedDefinitions,
    attributes,
    globalAttributes,
    enumerationValues: restrictionPresentation?.enumerationValues ?? [],
    documentation: annotationPresentation.documentation,
    appInfo: annotationPresentation.appInfo,
    comments,
    sourceMarkup: selectNodeSourceMarkup(
      project,
      nodeId,
      sourceMarkupByNodeId,
      xsdMetadataByNodeId,
    ),
    incomingRelationships,
    unresolvedReferences: unresolvedReferences
      .filter(({ sourceNodeId }) => sourceNodeId === node.id)
      .map((reference) =>
        buildUnresolvedReferencePresentation(
          project,
          xsdMetadataByNodeId,
          reference,
        ),
      ),
    isStructuralLeaf: !isSchemaOverview && orderedDestinations.length === 0,
    hasStructuralDestinations:
      declarations.length > 0 ||
      orderedDestinations.length > 0 ||
      relatedDefinitions.length > 0,
  };
}
