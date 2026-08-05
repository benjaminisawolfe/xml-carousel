import {
  getNodesByKind,
  getOutgoingEdges,
  getSchemaNode,
  type SchemaNodeId,
  type SchemaProject,
} from '../model';
import type { XsdMetadataByNodeId } from './xsdProjectMetadata';

function isGlobalElement(
  project: SchemaProject,
  xsdMetadataByNodeId: XsdMetadataByNodeId,
  nodeId: SchemaNodeId,
): boolean {
  const node = getSchemaNode(project, nodeId);
  const metadata = xsdMetadataByNodeId[nodeId];
  return Boolean(
    node?.kind === 'globalElement' &&
    metadata?.kind === 'globalElement' &&
    metadata.scope === 'global',
  );
}

function getReferencedGlobalsBeneath(
  project: SchemaProject,
  xsdMetadataByNodeId: XsdMetadataByNodeId,
  globalElementNodeId: SchemaNodeId,
): ReadonlySet<SchemaNodeId> {
  const referencedGlobalIds = new Set<SchemaNodeId>();
  const visited = new Set<SchemaNodeId>();
  const pending: SchemaNodeId[] = [globalElementNodeId];

  for (let index = 0; index < pending.length; index += 1) {
    const nodeId = pending[index]!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    const node = getSchemaNode(project, nodeId);
    const metadata = xsdMetadataByNodeId[nodeId];
    if (!node) continue;

    for (const edge of getOutgoingEdges(project, nodeId)) {
      if (
        edge.kind === 'contains' ||
        edge.kind === 'typeOf' ||
        edge.kind === 'sourceDocumentOwns' ||
        edge.kind === 'ownsComponent' ||
        edge.kind === 'particleMember' ||
        edge.kind === 'ownsAnonymousType' ||
        edge.kind === 'ownsContent' ||
        edge.kind === 'wildcardMember'
      ) {
        if (!visited.has(edge.targetNodeId)) pending.push(edge.targetNodeId);
        continue;
      }

      if (
        (edge.kind === 'references' || edge.kind === 'referencesDeclaration') &&
        node.kind === 'elementReference' &&
        metadata?.kind === 'elementReference' &&
        metadata.scope === 'local' &&
        isGlobalElement(project, xsdMetadataByNodeId, edge.targetNodeId)
      ) {
        referencedGlobalIds.add(edge.targetNodeId);
      }
    }
  }

  return referencedGlobalIds;
}

export function selectLikelyDocumentElementIds(
  project: SchemaProject,
  xsdMetadataByNodeId: XsdMetadataByNodeId,
): readonly SchemaNodeId[] {
  const globalElements = getNodesByKind(project, 'globalElement').filter(
    (node) => isGlobalElement(project, xsdMetadataByNodeId, node.id),
  );
  if (globalElements.length === 0) return [];

  const referencedByDifferentGlobal = new Set<SchemaNodeId>();
  for (const globalElement of globalElements) {
    for (const referencedGlobalId of getReferencedGlobalsBeneath(
      project,
      xsdMetadataByNodeId,
      globalElement.id,
    )) {
      if (referencedGlobalId !== globalElement.id) {
        referencedByDifferentGlobal.add(referencedGlobalId);
      }
    }
  }

  return globalElements
    .filter(({ id }) => !referencedByDifferentGlobal.has(id))
    .map(({ id }) => id);
}
