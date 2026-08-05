import type {
  SchemaNodeId,
  SchemaNodeKind,
  SchemaProject,
  SchemaProjectId,
} from '../../schema/model';
import type {
  DtdAttributesByNodeId,
  DtdCommentsByNodeId,
} from '../../schema/dtd';
import type { XsdMetadataByNodeId } from '../../schema/xsd';
import type { SchemaPackageEntrySummary } from '../import/schemaPackage';

export interface ProjectSearchIndexInput {
  readonly project: SchemaProject;
  readonly sourceFilename?: string;
  readonly xsdMetadataByNodeId?: XsdMetadataByNodeId;
  readonly commentsByNodeId?: DtdCommentsByNodeId;
  readonly dtdAttributesByNodeId?: DtdAttributesByNodeId;
  readonly packageEntries?: readonly SchemaPackageEntrySummary[];
}

export type ProjectSearchFieldKind =
  | 'name'
  | 'reference'
  | 'documentation'
  | 'dtdComment'
  | 'sourceFile'
  | 'packagePath'
  | 'packageReason'
  | 'dependency';

export type ProjectSearchNodeCategory =
  | 'schema'
  | 'element'
  | 'type'
  | 'attribute'
  | 'dtdDeclaration'
  | 'structure'
  | 'packageSource'
  | 'packageEntry'
  | 'other';

export interface ProjectSearchField {
  readonly id: string;
  readonly kind: ProjectSearchFieldKind;
  readonly text: string;
  readonly normalizedText: string;
  readonly sourceOrder: number;
  readonly language?: string;
}

export interface ProjectSearchDocument {
  readonly id: string;
  readonly resultKind: 'schema-node' | 'package-entry';
  readonly nodeId: SchemaNodeId;
  readonly nodeKind?: SchemaNodeKind;
  readonly packageEntryId?: string;
  readonly packageEntryKind?: SchemaPackageEntrySummary['kind'];
  readonly nodeCategory: ProjectSearchNodeCategory;
  readonly nodeName: string;
  readonly normalizedNodeName: string;
  readonly sourceFileId?: string;
  readonly sourceFilename?: string;
  readonly sourceOrder: number;
  readonly fields: readonly ProjectSearchField[];
}

export interface ProjectSearchIndex {
  readonly projectId: SchemaProjectId;
  readonly documents: readonly ProjectSearchDocument[];
}

export interface ProjectSearchQueryOptions {
  readonly limit?: number;
  readonly onRetainedCandidateCount?: (count: number) => void;
}

export interface ProjectSearchFieldMatch {
  readonly fieldId: string;
  readonly fieldKind: ProjectSearchFieldKind;
  readonly text: string;
  readonly language?: string;
}

export interface ProjectSearchResult {
  readonly id: string;
  readonly resultKind: 'schema-node' | 'package-entry';
  readonly nodeId: SchemaNodeId;
  readonly nodeKind?: SchemaNodeKind;
  readonly packageEntryId?: string;
  readonly packageEntryKind?: SchemaPackageEntrySummary['kind'];
  readonly nodeCategory: ProjectSearchNodeCategory;
  readonly nodeName: string;
  readonly sourceFileId?: string;
  readonly sourceFilename?: string;
  readonly score: number;
  readonly matches: readonly ProjectSearchFieldMatch[];
}
