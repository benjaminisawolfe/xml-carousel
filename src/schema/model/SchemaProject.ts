import type { SchemaEdge } from './SchemaEdge';
import type { SchemaNode, SchemaNodeId } from './SchemaNode';

export type SchemaProjectId = string;

export interface SchemaSourceFile {
  readonly id: string;
  readonly filename: string;
}

export interface SchemaProject {
  readonly id: SchemaProjectId;
  readonly displayName: string;
  readonly sourceFiles?: readonly SchemaSourceFile[];
  readonly nodes: readonly SchemaNode[];
  readonly edges: readonly SchemaEdge[];
  readonly rootNodeIds: readonly SchemaNodeId[];
}
