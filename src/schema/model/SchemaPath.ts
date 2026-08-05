import type { SchemaNodeId } from './SchemaNode';

/** A journey through the schema graph, kept separate from project data. */
export type SchemaPath = readonly SchemaNodeId[];
