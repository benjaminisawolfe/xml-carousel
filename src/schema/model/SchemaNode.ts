import type { SchemaNodeKind } from './schemaKinds';

export type SchemaNodeId = string;

export interface SchemaNodeProperty {
  readonly label: string;
  readonly value: string;
}

export interface SchemaNode {
  readonly id: SchemaNodeId;
  readonly kind: SchemaNodeKind;
  readonly name: string;
  readonly sourceFileId?: string;
  readonly sourceOrder?: number;
  readonly compactDeclaration?: string;
  /** Plain, presentation-ready semantic facts retained by tolerant adapters. */
  readonly properties?: readonly SchemaNodeProperty[];
  /** Additional safe text indexed by project Search. */
  readonly searchTerms?: readonly string[];
}
