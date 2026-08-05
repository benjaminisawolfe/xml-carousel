import type { SchemaEdge, SchemaOccurrence } from './SchemaEdge';
import type { SchemaNodeId } from './SchemaNode';
import type { SchemaProject } from './SchemaProject';

export type SchemaValidationCode =
  | 'duplicateNodeId'
  | 'duplicateEdgeId'
  | 'missingEdgeSource'
  | 'missingEdgeTarget'
  | 'missingRootNode'
  | 'invalidOccurrence'
  | 'invalidBranchOrder'
  | 'duplicateBranchOrder';

export interface SchemaValidationFinding {
  code: SchemaValidationCode;
  message: string;
  nodeId?: SchemaNodeId;
  edgeId?: string;
  rootNodeId?: SchemaNodeId;
}

function isOccurrenceValid(occurrence: SchemaOccurrence): boolean {
  if (!Number.isInteger(occurrence.min) || occurrence.min < 0) {
    return false;
  }

  if (occurrence.max === 'unbounded') {
    return true;
  }

  return (
    Number.isInteger(occurrence.max) &&
    occurrence.max >= 0 &&
    occurrence.max >= occurrence.min
  );
}

function findDuplicateIds(
  values: readonly string[],
  createFinding: (id: string) => SchemaValidationFinding,
): SchemaValidationFinding[] {
  const seen = new Set<string>();
  const reported = new Set<string>();
  const findings: SchemaValidationFinding[] = [];

  for (const value of values) {
    if (seen.has(value) && !reported.has(value)) {
      findings.push(createFinding(value));
      reported.add(value);
    }
    seen.add(value);
  }

  return findings;
}

function validateBranchOrder(
  edges: readonly SchemaEdge[],
): SchemaValidationFinding[] {
  const findings: SchemaValidationFinding[] = [];
  const containedOrderBySource = new Map<string, Map<number, string>>();

  for (const edge of edges) {
    if (
      edge.order !== undefined &&
      (!Number.isInteger(edge.order) || edge.order < 0)
    ) {
      findings.push({
        code: 'invalidBranchOrder',
        edgeId: edge.id,
        message: `Edge "${edge.id}" has an invalid branch order.`,
      });
      continue;
    }

    if (edge.kind !== 'contains' || edge.order === undefined) {
      continue;
    }

    const orders = containedOrderBySource.get(edge.sourceNodeId) ?? new Map();
    const existingEdgeId = orders.get(edge.order);

    if (existingEdgeId) {
      findings.push({
        code: 'duplicateBranchOrder',
        edgeId: edge.id,
        nodeId: edge.sourceNodeId,
        message: `Containment edges "${existingEdgeId}" and "${edge.id}" share branch order ${edge.order}.`,
      });
    } else {
      orders.set(edge.order, edge.id);
      containedOrderBySource.set(edge.sourceNodeId, orders);
    }
  }

  return findings;
}

export function validateSchemaProject(
  project: SchemaProject,
): SchemaValidationFinding[] {
  const findings: SchemaValidationFinding[] = [];
  const nodeIds = new Set(project.nodes.map((node) => node.id));

  findings.push(
    ...findDuplicateIds(
      project.nodes.map((node) => node.id),
      (nodeId) => ({
        code: 'duplicateNodeId',
        nodeId,
        message: `Node ID "${nodeId}" is duplicated.`,
      }),
    ),
    ...findDuplicateIds(
      project.edges.map((edge) => edge.id),
      (edgeId) => ({
        code: 'duplicateEdgeId',
        edgeId,
        message: `Edge ID "${edgeId}" is duplicated.`,
      }),
    ),
  );

  for (const edge of project.edges) {
    if (!nodeIds.has(edge.sourceNodeId)) {
      findings.push({
        code: 'missingEdgeSource',
        edgeId: edge.id,
        nodeId: edge.sourceNodeId,
        message: `Edge "${edge.id}" has an unknown source node.`,
      });
    }

    if (!nodeIds.has(edge.targetNodeId)) {
      findings.push({
        code: 'missingEdgeTarget',
        edgeId: edge.id,
        nodeId: edge.targetNodeId,
        message: `Edge "${edge.id}" has an unknown target node.`,
      });
    }

    if (edge.occurrence && !isOccurrenceValid(edge.occurrence)) {
      findings.push({
        code: 'invalidOccurrence',
        edgeId: edge.id,
        message: `Edge "${edge.id}" has an invalid occurrence range.`,
      });
    }
  }

  for (const rootNodeId of project.rootNodeIds) {
    if (!nodeIds.has(rootNodeId)) {
      findings.push({
        code: 'missingRootNode',
        rootNodeId,
        message: `Root node ID "${rootNodeId}" does not resolve.`,
      });
    }
  }

  findings.push(...validateBranchOrder(project.edges));

  return findings;
}
