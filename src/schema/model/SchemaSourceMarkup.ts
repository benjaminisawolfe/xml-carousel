import type { SchemaNodeId } from './SchemaNode';

export interface SchemaSourcePosition {
  readonly offset: number;
  readonly line: number;
  readonly column: number;
}

export interface SchemaSourceRange {
  readonly start: SchemaSourcePosition;
  readonly end: SchemaSourcePosition;
  readonly sourceId?: string;
}

export interface SchemaSourceMarkupFragment {
  readonly id: string;
  readonly sourceFileId: string;
  readonly range: SchemaSourceRange;
  readonly text: string;
}

export interface SchemaNodeSourceMarkup {
  readonly syntax: 'dtd' | 'xsd' | 'rng';
  readonly fragments: readonly SchemaSourceMarkupFragment[];
}

export type SchemaSourceMarkupByNodeId = Readonly<
  Record<SchemaNodeId, SchemaNodeSourceMarkup>
>;
