import type { SchemaEdge, SchemaEdgeId, SchemaOccurrence } from './SchemaEdge';
import type { SchemaNode, SchemaNodeId } from './SchemaNode';
import type { SchemaProject } from './SchemaProject';
import type { SchemaEdgeKind, SchemaNodeKind } from './schemaKinds';
import { getSchemaProjectQueryIndex } from './schemaProjectQueryIndex';

export interface SchemaRelationship {
  edge: SchemaEdge;
  node: SchemaNode;
}

export function getSchemaNode(
  project: SchemaProject,
  nodeId: SchemaNodeId,
): SchemaNode | undefined {
  return getSchemaProjectQueryIndex(project).nodeById.get(nodeId);
}

export function getSchemaEdge(
  project: SchemaProject,
  edgeId: SchemaEdgeId,
): SchemaEdge | undefined {
  return getSchemaProjectQueryIndex(project).edgeById.get(edgeId);
}

export function getRootNodes(project: SchemaProject): SchemaNode[] {
  const nodes: SchemaNode[] = [];

  for (const nodeId of project.rootNodeIds) {
    const node = getSchemaNode(project, nodeId);
    if (node) {
      nodes.push(node);
    }
  }

  return nodes;
}

export function getNodesByKind(
  project: SchemaProject,
  kind: SchemaNodeKind,
): SchemaNode[] {
  return [...(getSchemaProjectQueryIndex(project).nodesByKind.get(kind) ?? [])];
}

export function getOutgoingEdges(
  project: SchemaProject,
  nodeId: SchemaNodeId,
): SchemaEdge[] {
  return [
    ...(getSchemaProjectQueryIndex(project).outgoingEdgesByNodeId.get(nodeId) ??
      []),
  ];
}

export function getIncomingEdges(
  project: SchemaProject,
  nodeId: SchemaNodeId,
): SchemaEdge[] {
  return [
    ...(getSchemaProjectQueryIndex(project).incomingEdgesByNodeId.get(nodeId) ??
      []),
  ];
}

export function getContainedChildren(
  project: SchemaProject,
  nodeId: SchemaNodeId,
): SchemaRelationship[] {
  const relationships: SchemaRelationship[] = [];

  for (const edge of getOutgoingEdges(project, nodeId)) {
    if (edge.kind !== 'contains') {
      continue;
    }

    const node = getSchemaNode(project, edge.targetNodeId);
    if (node) {
      relationships.push({ edge, node });
    }
  }

  return relationships;
}

export function getIncomingRelationships(
  project: SchemaProject,
  nodeId: SchemaNodeId,
): SchemaRelationship[] {
  const relationships: SchemaRelationship[] = [];

  for (const edge of getIncomingEdges(project, nodeId)) {
    const node = getSchemaNode(project, edge.sourceNodeId);
    if (node) {
      relationships.push({ edge, node });
    }
  }

  return relationships;
}

export function getOutgoingRelationships(
  project: SchemaProject,
  nodeId: SchemaNodeId,
): SchemaRelationship[] {
  return getOutgoingEdges(project, nodeId)
    .map((edge) => {
      const node = getSchemaNode(project, edge.targetNodeId);
      return node ? { edge, node } : undefined;
    })
    .filter(
      (relationship): relationship is SchemaRelationship =>
        relationship !== undefined,
    );
}

const usageEdgeKinds: ReadonlySet<SchemaEdgeKind> = new Set([
  'typeOf',
  'extends',
  'restricts',
  'references',
  'usesAttribute',
  'usesAttributeGroup',
  'usesGroup',
  'substitutes',
  'imports',
  'includes',
  'contentModelReference',
  'referencesElementName',
  'referencesUndeclaredElementName',
  'referencesDeclaration',
  'derivesFrom',
  'listItemType',
  'unionMemberType',
  'keyrefTargets',
  'notationConstraint',
  'dependsOnSchema',
  'redefinesSchema',
  'redefinesComponent',
  'chameleonNamespaceContext',
  'substitutionGroupMember',
  'dependencyCycleMember',
  'sharesDependency',
]);

const structuralEdgeKinds: ReadonlySet<SchemaEdgeKind> = new Set([
  'contains',
  'typeOf',
  'extends',
  'restricts',
  'references',
  'usesAttributeGroup',
  'usesGroup',
  'substitutes',
  'imports',
  'includes',
  'contentModelReference',
  'referencesElementName',
  'sourceDocumentOwns',
  'ownsComponent',
  'particleMember',
  'ownsAnonymousType',
  'referencesDeclaration',
  'ownsContent',
  'wildcardMember',
  'derivesFrom',
  'listItemType',
  'unionMemberType',
  'ownsIdentityConstraint',
  'keyrefTargets',
  'notationConstraint',
  'ownsSchemaRelationship',
  'ownsAnnotation',
  'ownsAnnotationEntry',
  'ownsForeignContent',
  'ownsXmlMetadata',
  'dependsOnSchema',
  'redefinesSchema',
  'redefinesComponent',
  'chameleonNamespaceContext',
  'substitutionGroupMember',
  'dependencyCycleMember',
  'sharesDependency',
]);

export function isStructuralEdgeKind(kind: SchemaEdgeKind): boolean {
  return structuralEdgeKinds.has(kind);
}

export function getOutgoingStructuralRelationships(
  project: SchemaProject,
  nodeId: SchemaNodeId,
): SchemaRelationship[] {
  const relationships: SchemaRelationship[] = [];

  for (const edge of getOutgoingEdges(project, nodeId)) {
    if (!isStructuralEdgeKind(edge.kind)) continue;

    const node = getSchemaNode(project, edge.targetNodeId);
    if (node) relationships.push({ edge, node });
  }

  return relationships;
}

export function getIncomingStructuralRelationships(
  project: SchemaProject,
  nodeId: SchemaNodeId,
): SchemaRelationship[] {
  return getIncomingRelationships(project, nodeId)
    .filter(({ edge }) => isStructuralEdgeKind(edge.kind))
    .sort((left, right) => {
      const orderDifference =
        (left.node.sourceOrder ?? Number.MAX_SAFE_INTEGER) -
        (right.node.sourceOrder ?? Number.MAX_SAFE_INTEGER);
      return orderDifference || left.edge.id.localeCompare(right.edge.id);
    });
}

export function getNodesUsingOrReferencing(
  project: SchemaProject,
  nodeId: SchemaNodeId,
): SchemaNode[] {
  return getIncomingRelationships(project, nodeId)
    .filter(({ edge }) => usageEdgeKinds.has(edge.kind))
    .map(({ node }) => node);
}

export function formatOccurrence(
  occurrence: SchemaOccurrence | undefined,
): string {
  if (!occurrence || (occurrence.min === 1 && occurrence.max === 1)) {
    return '';
  }

  if (occurrence.min === 0 && occurrence.max === 1) {
    return '?';
  }

  if (occurrence.min === 0 && occurrence.max === 'unbounded') {
    return '*';
  }

  if (occurrence.min === 1 && occurrence.max === 'unbounded') {
    return '+';
  }

  return `${occurrence.min}..${occurrence.max}`;
}
