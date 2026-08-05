import type { SchemaNodeId } from '../model';
import type { DtdNormalizedSourceRange } from './dtdAttributeMetadata';

export type DtdCommentAttachmentKind =
  'contained' | 'trailing' | 'preceding' | 'schema';

export type DtdCommentDeclarationKind = 'element' | 'attributeList';

export interface DtdNormalizedComment {
  readonly commentId: string;
  readonly sourceFileId: string;
  readonly raw: string;
  readonly text: string;
  readonly sourceRange: DtdNormalizedSourceRange;
  readonly contentRange: DtdNormalizedSourceRange;
  readonly order: number;
  readonly attachmentKind: DtdCommentAttachmentKind;
  readonly declarationKind?: DtdCommentDeclarationKind;
  readonly declarationRange?: DtdNormalizedSourceRange;
  readonly attachedNodeId?: SchemaNodeId;
}

export type DtdCommentsByNodeId = Readonly<
  Record<SchemaNodeId, readonly DtdNormalizedComment[]>
>;

export interface DtdCommentAttachmentResult {
  readonly comments: readonly DtdNormalizedComment[];
  readonly commentsByNodeId: DtdCommentsByNodeId;
  readonly schemaLevelComments: readonly DtdNormalizedComment[];
}
