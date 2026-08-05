import type { SchemaEdge, SchemaEdgeId } from './SchemaEdge';
import type { SchemaNode, SchemaNodeId } from './SchemaNode';
import type { SchemaProject } from './SchemaProject';
import type { SchemaNodeKind } from './schemaKinds';

interface SchemaProjectQueryIndex {
  readonly projectNodes: SchemaProject['nodes'];
  readonly projectEdges: SchemaProject['edges'];
  readonly projectRootNodeIds: SchemaProject['rootNodeIds'];
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly rootCount: number;
  readonly nodeById: ReadonlyMap<SchemaNodeId, SchemaNode>;
  readonly edgeById: ReadonlyMap<SchemaEdgeId, SchemaEdge>;
  readonly nodesByKind: ReadonlyMap<SchemaNodeKind, readonly SchemaNode[]>;
  readonly outgoingEdgesByNodeId: ReadonlyMap<
    SchemaNodeId,
    readonly SchemaEdge[]
  >;
  readonly incomingEdgesByNodeId: ReadonlyMap<
    SchemaNodeId,
    readonly SchemaEdge[]
  >;
}

const queryIndexes = new WeakMap<SchemaProject, SchemaProjectQueryIndex>();
const queryIndexBuildCounts = new WeakMap<SchemaProject, number>();

function compareNodes(left: SchemaNode, right: SchemaNode): number {
  const orderDifference =
    (left.sourceOrder ?? Number.MAX_SAFE_INTEGER) -
    (right.sourceOrder ?? Number.MAX_SAFE_INTEGER);
  return orderDifference || left.id.localeCompare(right.id);
}

function compareEdges(left: SchemaEdge, right: SchemaEdge): number {
  const orderDifference =
    (left.order ?? Number.MAX_SAFE_INTEGER) -
    (right.order ?? Number.MAX_SAFE_INTEGER);
  return orderDifference || left.id.localeCompare(right.id);
}

function appendToBucket<Key, Value>(
  buckets: Map<Key, Value[]>,
  key: Key,
  value: Value,
): void {
  const bucket = buckets.get(key);
  if (bucket) {
    bucket.push(value);
  } else {
    buckets.set(key, [value]);
  }
}

function freezeSortedBuckets<Key, Value>(
  buckets: Map<Key, Value[]>,
  compare: (left: Value, right: Value) => number,
): ReadonlyMap<Key, readonly Value[]> {
  for (const bucket of buckets.values()) {
    bucket.sort(compare);
    Object.freeze(bucket);
  }

  return buckets;
}

function buildSchemaProjectQueryIndex(
  project: SchemaProject,
): SchemaProjectQueryIndex {
  const nodeById = new Map<SchemaNodeId, SchemaNode>();
  const edgeById = new Map<SchemaEdgeId, SchemaEdge>();
  const nodesByKind = new Map<SchemaNodeKind, SchemaNode[]>();
  const outgoingEdgesByNodeId = new Map<SchemaNodeId, SchemaEdge[]>();
  const incomingEdgesByNodeId = new Map<SchemaNodeId, SchemaEdge[]>();

  for (const node of project.nodes) {
    nodeById.set(node.id, node);
    appendToBucket(nodesByKind, node.kind, node);
  }

  for (const edge of project.edges) {
    edgeById.set(edge.id, edge);
    appendToBucket(outgoingEdgesByNodeId, edge.sourceNodeId, edge);
    appendToBucket(incomingEdgesByNodeId, edge.targetNodeId, edge);
  }

  queryIndexBuildCounts.set(
    project,
    (queryIndexBuildCounts.get(project) ?? 0) + 1,
  );

  return {
    projectNodes: project.nodes,
    projectEdges: project.edges,
    projectRootNodeIds: project.rootNodeIds,
    nodeCount: project.nodes.length,
    edgeCount: project.edges.length,
    rootCount: project.rootNodeIds.length,
    nodeById,
    edgeById,
    nodesByKind: freezeSortedBuckets(nodesByKind, compareNodes),
    outgoingEdgesByNodeId: freezeSortedBuckets(
      outgoingEdgesByNodeId,
      compareEdges,
    ),
    incomingEdgesByNodeId: freezeSortedBuckets(
      incomingEdgesByNodeId,
      compareEdges,
    ),
  };
}

function isCurrentIndex(
  project: SchemaProject,
  index: SchemaProjectQueryIndex,
): boolean {
  return (
    index.projectNodes === project.nodes &&
    index.projectEdges === project.edges &&
    index.projectRootNodeIds === project.rootNodeIds &&
    index.nodeCount === project.nodes.length &&
    index.edgeCount === project.edges.length &&
    index.rootCount === project.rootNodeIds.length
  );
}

export function getSchemaProjectQueryIndex(
  project: SchemaProject,
): SchemaProjectQueryIndex {
  const existing = queryIndexes.get(project);
  if (existing && isCurrentIndex(project, existing)) {
    return existing;
  }

  const index = buildSchemaProjectQueryIndex(project);
  queryIndexes.set(project, index);
  return index;
}

export function primeSchemaProjectQueryIndex(project: SchemaProject): void {
  getSchemaProjectQueryIndex(project);
}

export function clearSchemaProjectQueryIndexForTests(
  project: SchemaProject,
): void {
  queryIndexes.delete(project);
  queryIndexBuildCounts.delete(project);
}

export function getSchemaProjectQueryIndexBuildCountForTests(
  project: SchemaProject,
): number {
  return queryIndexBuildCounts.get(project) ?? 0;
}
