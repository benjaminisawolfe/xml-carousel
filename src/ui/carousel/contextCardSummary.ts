import {
  formatOccurrence,
  getContainedChildren,
  getSchemaNode,
  type SchemaNodeId,
  type SchemaProject,
} from '../../schema/model';

export const CONTEXT_CARD_DESTINATION_LIMIT = 3;

export interface ContextCardDestinationSummary {
  readonly edgeId: string;
  readonly nodeId: SchemaNodeId;
  readonly displayName: string;
  readonly occurrence: string;
}

export interface ContextCardStructureSummary {
  readonly visibleDestinations: readonly ContextCardDestinationSummary[];
  readonly visibleText: string;
  readonly hiddenDestinationCount: number;
}

export function buildContextCardStructureSummary(
  project: SchemaProject,
  nodeId: SchemaNodeId,
): ContextCardStructureSummary | undefined {
  const node = getSchemaNode(project, nodeId);
  if (!node || node.kind === 'schema') return undefined;

  const destinations = getContainedChildren(project, nodeId);
  if (destinations.length === 0) return undefined;

  const visibleDestinations = destinations
    .slice(0, CONTEXT_CARD_DESTINATION_LIMIT)
    .map(({ edge, node }) => ({
      edgeId: edge.id,
      nodeId: node.id,
      displayName: node.name,
      occurrence: formatOccurrence(edge.occurrence),
    }));

  return {
    visibleDestinations,
    visibleText: visibleDestinations
      .map(({ displayName, occurrence }) => `${displayName}${occurrence}`)
      .join(', '),
    hiddenDestinationCount: destinations.length - visibleDestinations.length,
  };
}
