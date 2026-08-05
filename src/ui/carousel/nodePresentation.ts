import type { SchemaEdgeKind, SchemaNodeKind } from '../../schema/model';
import {
  schemaEdgeReachability,
  schemaNodeReachability,
} from '../presentation/schemaReachability';

export function formatSchemaNodeKind(kind: SchemaNodeKind): string {
  return schemaNodeReachability(kind).kindLabel;
}

export function formatSchemaEdgeKind(kind: SchemaEdgeKind): string {
  return schemaEdgeReachability(kind).relationshipLabel;
}

export function formatChildCount(count: number): string {
  return `${count} ${count === 1 ? 'child' : 'children'}`;
}
