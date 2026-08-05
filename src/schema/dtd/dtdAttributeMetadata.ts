import type { SchemaNodeId } from '../model';

export interface DtdNormalizedSourcePosition {
  readonly offset: number;
  readonly line: number;
  readonly column: number;
}

export interface DtdNormalizedSourceRange {
  readonly start: DtdNormalizedSourcePosition;
  readonly end: DtdNormalizedSourcePosition;
  readonly sourceId?: string;
}

export type DtdNormalizedTokenizedAttributeType =
  | 'CDATA'
  | 'ID'
  | 'IDREF'
  | 'IDREFS'
  | 'ENTITY'
  | 'ENTITIES'
  | 'NMTOKEN'
  | 'NMTOKENS';

export type DtdNormalizedAttributeType =
  | {
      readonly kind: 'tokenized';
      readonly name: DtdNormalizedTokenizedAttributeType;
    }
  | {
      readonly kind: 'enumeration';
      readonly values: readonly string[];
    }
  | {
      readonly kind: 'notation';
      readonly values: readonly string[];
    };

export interface DtdNormalizedLiteralValue {
  readonly value: string;
  readonly quote: 'single' | 'double';
}

export type DtdNormalizedAttributeDefault =
  | { readonly kind: 'required' }
  | { readonly kind: 'implied' }
  | {
      readonly kind: 'fixed';
      readonly literal: DtdNormalizedLiteralValue;
    }
  | {
      readonly kind: 'value';
      readonly literal: DtdNormalizedLiteralValue;
    };

export interface DtdNormalizedAttributeDefinition {
  readonly attributeNodeId: SchemaNodeId;
  readonly ownerElementNodeId: SchemaNodeId;
  readonly name: string;
  readonly type: DtdNormalizedAttributeType;
  readonly defaultDeclaration: DtdNormalizedAttributeDefault;
  readonly sourceFileId: string;
  readonly declarationText: string;
  readonly sourceRange: DtdNormalizedSourceRange;
  readonly order: number;
}

export type DtdAttributesByNodeId = Readonly<
  Record<SchemaNodeId, DtdNormalizedAttributeDefinition>
>;
