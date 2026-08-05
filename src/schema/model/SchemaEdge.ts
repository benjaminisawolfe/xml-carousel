import type { SchemaEdgeKind } from './schemaKinds';
import type { SchemaNodeId } from './SchemaNode';

export type SchemaEdgeId = string;

export interface SchemaOccurrence {
  readonly min: number;
  readonly max: number | 'unbounded';
}

export interface SchemaEdge {
  readonly id: SchemaEdgeId;
  readonly kind: SchemaEdgeKind;
  readonly sourceNodeId: SchemaNodeId;
  readonly targetNodeId: SchemaNodeId;
  readonly order?: number;
  readonly occurrence?: SchemaOccurrence;
}
