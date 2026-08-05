export type { SchemaEdge, SchemaEdgeId, SchemaOccurrence } from './SchemaEdge';
export type { SchemaNode, SchemaNodeId } from './SchemaNode';
export type { SchemaPath } from './SchemaPath';
export type {
  SchemaProject,
  SchemaProjectId,
  SchemaSourceFile,
} from './SchemaProject';
export type {
  SchemaNodeSourceMarkup,
  SchemaSourceMarkupByNodeId,
  SchemaSourceMarkupFragment,
  SchemaSourcePosition,
  SchemaSourceRange,
} from './SchemaSourceMarkup';
export type { SchemaEdgeKind, SchemaNodeKind } from './schemaKinds';
export { schemaEdgeKinds, schemaNodeKinds } from './schemaKinds';
export {
  formatOccurrence,
  getContainedChildren,
  getIncomingEdges,
  getIncomingRelationships,
  getIncomingStructuralRelationships,
  getNodesByKind,
  getNodesUsingOrReferencing,
  getOutgoingEdges,
  getOutgoingRelationships,
  getOutgoingStructuralRelationships,
  getRootNodes,
  getSchemaEdge,
  getSchemaNode,
  isStructuralEdgeKind,
} from './schemaQueries';
export type { SchemaRelationship } from './schemaQueries';
export {
  clearSchemaProjectQueryIndexForTests,
  getSchemaProjectQueryIndexBuildCountForTests,
  primeSchemaProjectQueryIndex,
} from './schemaProjectQueryIndex';
export { validateSchemaProject } from './validateSchemaProject';
export type {
  SchemaValidationCode,
  SchemaValidationFinding,
} from './validateSchemaProject';
