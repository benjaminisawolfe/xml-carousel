import type {
  SchemaEdgeId,
  SchemaNodeId,
  SchemaProject,
  SchemaSourceMarkupByNodeId,
  SchemaSourceRange,
} from '../../../schema/model';
import type {
  DtdAttributesByNodeId,
  DtdCommentsByNodeId,
  DtdImportDiagnostic,
  DtdImportOptions,
  DtdImportResult,
  DtdNormalizedComment,
  DtdNormalizedContentKind,
} from '../../../schema/dtd';
import type {
  XsdImportDiagnostic,
  XsdImportOptions,
  XsdImportResult,
  XsdMetadataByNodeId,
  XsdNormalizedReference,
} from '../../../schema/xsd';
import type {
  SchemaArchiveBinary,
  SchemaArchiveDiagnostic,
  SchemaArchiveDiscoveryInput,
  SchemaArchiveDiscoveryResult,
  SchemaArchiveManifest,
} from '../schemaArchive';
import type {
  StandardsBoundaryDiagnostic,
  XercesProjectFile,
  XercesValidationResult,
} from '../../../standards/xerces';
import type { VisualizationResult } from '../../../schema/visualization';
import type {
  RelaxNgProjectFile,
  RelaxNgValidationResult,
} from '../../../standards/relaxng';
import type { RelaxNgSemanticModel } from '../../../schema/relaxng';

export interface LoadedSchemaArchiveEntryContent {
  readonly archivePath: string;
  readonly bytes: Uint8Array;
}

export type SchemaArchiveContentLoader = (
  data: SchemaArchiveBinary,
  manifest: SchemaArchiveManifest,
) => Promise<readonly LoadedSchemaArchiveEntryContent[]>;

export type SchemaPackageDiagnosticCode =
  | 'archive-entry-missing'
  | 'archive-entry-read-failure'
  | 'schema-entry-too-large'
  | 'schema-package-too-large'
  | 'invalid-utf8'
  | 'unsupported-source-encoding'
  | 'source-import-failed'
  | 'source-id-collision'
  | 'node-id-collision'
  | 'edge-id-collision'
  | 'package-project-validation-failed'
  | 'unresolved-xsd-reference'
  | 'ambiguous-xsd-reference'
  | 'invalid-xsd-reference-target'
  | 'missing-xsd-dependency'
  | 'blocked-xsd-dependency'
  | 'ambiguous-xsd-dependency'
  | 'missing-rng-dependency'
  | 'blocked-rng-dependency'
  | 'ambiguous-rng-dependency';

export interface SchemaPackageDiagnostic {
  readonly stage: 'package';
  readonly code: SchemaPackageDiagnosticCode;
  readonly severity: 'error' | 'warning';
  readonly message: string;
  readonly sourceFileId?: string;
  readonly entryPath?: string;
  readonly nodeId?: SchemaNodeId;
  readonly edgeId?: SchemaEdgeId;
  readonly reference?: string;
  readonly range?: SchemaSourceRange;
  readonly relationshipKind?: SchemaPackageFileRelationship['kind'];
  readonly relationshipStatus?: SchemaPackageFileRelationship['status'];
  readonly blockedReason?: SchemaPackageRelationshipBlockedReason;
}

export type SchemaPackageImportDiagnostic =
  | SchemaArchiveDiagnostic
  | DtdImportDiagnostic
  | XsdImportDiagnostic
  | SchemaPackageDiagnostic
  | StandardsBoundaryDiagnostic;

export type SchemaPackageReferenceIssueReason =
  'notFound' | 'ambiguous' | 'invalidTargetKind';

export interface SchemaPackageUnresolvedReference {
  readonly id: string;
  readonly sourceNodeId: SchemaNodeId;
  readonly sourceFileId: string;
  readonly referenceKind: XsdNormalizedReference['kind'];
  readonly raw: string;
  readonly localName: string;
  readonly namespaceUri?: string;
  readonly reason: SchemaPackageReferenceIssueReason;
  readonly candidateNodeIds: readonly SchemaNodeId[];
  readonly range: SchemaSourceRange;
}

export interface SchemaPackageSourceSummary {
  readonly sourceFileId: string;
  readonly archiveEntryId: string;
  readonly archivePath: string;
  readonly packageRelativePath: string;
  readonly format: 'xsd' | 'dtd' | 'rng';
  readonly sourceOrder: number;
  readonly byteLength: number;
  readonly nodeCount: number;
  readonly rootNodeIds: readonly SchemaNodeId[];
  readonly initialFocusNodeId: SchemaNodeId;
}

export const schemaPackageEntryKinds = [
  'xsd-source',
  'dtd-source',
  'auxiliary',
  'ignored',
  'directory',
] as const;

/** Task 13.18's frozen complete-visualization gate intentionally remains above. */
export const allSchemaPackageEntryKinds = [
  ...schemaPackageEntryKinds,
  'rng-source',
] as const;

export type SchemaPackageEntryKind =
  (typeof allSchemaPackageEntryKinds)[number];

export type SchemaPackageTextStatus = 'text' | 'binary' | 'unavailable';

export type SchemaPackageStandardsStatus =
  | 'accepted-schema-source'
  | 'accepted-auxiliary-dependency'
  | 'not-a-schema-source'
  | 'not-independently-validated'
  | 'blocked-dependency'
  | 'standards-invalid'
  | 'engine-internal'
  | 'resource-limit';

export type SchemaPackageVisualizationStatus =
  | 'complete'
  | 'no-navigable-declarations'
  | 'auxiliary'
  | 'source-only'
  | 'ignored'
  | 'not-applicable';

export type SchemaPackageRelationshipBlockedReason =
  'external-uri' | 'filesystem' | 'traversal';

export interface SchemaPackageFileRelationship {
  readonly id: string;
  readonly kind:
    | 'include'
    | 'import'
    | 'redefine'
    | 'external-entity'
    | 'rng-include'
    | 'rng-external-ref';
  readonly rawTarget: string;
  readonly sourcePath: string;
  readonly targetPath?: string;
  readonly status: 'resolved' | 'missing' | 'ambiguous' | 'blocked';
  readonly candidatePaths?: readonly string[];
  readonly blockedReason?: SchemaPackageRelationshipBlockedReason;
  readonly range?: SchemaSourceRange;
}

/** Clone-safe package/file presentation metadata; binary bytes are excluded. */
export interface SchemaPackageEntrySummary {
  readonly id: string;
  readonly archivePath: string;
  readonly normalizedPath: string;
  readonly packageRelativePath: string;
  readonly basename: string;
  readonly kind: SchemaPackageEntryKind;
  readonly classificationReason: string;
  readonly originalOrder: number;
  readonly deterministicOrder: number;
  readonly byteLength?: number;
  readonly compressedByteLength?: number;
  readonly textStatus: SchemaPackageTextStatus;
  readonly sourceViewAvailable: boolean;
  readonly sourceText?: string;
  readonly encoding?: 'UTF-8';
  readonly sourceFileId?: string;
  readonly standardsStatus: SchemaPackageStandardsStatus;
  readonly visualizationStatus: SchemaPackageVisualizationStatus;
  readonly nodeCount: number;
  readonly searchDocumentCount: number;
  readonly sourceMarkupCount: number;
  readonly dependencyCount: number;
  readonly dependentCount: number;
  readonly unresolvedRelationshipCount: number;
  readonly blockedRelationshipCount: number;
  readonly dependencies: readonly SchemaPackageFileRelationship[];
  readonly dependents: readonly SchemaPackageFileRelationship[];
  readonly rootCandidate: boolean;
  readonly rootCandidateReason?: string;
  readonly selectedEntry: boolean;
  readonly sharedDependency: boolean;
}

export interface SchemaPackageSummary {
  readonly entryCount: number;
  readonly fileCount: number;
  readonly directoryCount: number;
  readonly schemaSourceCount: number;
  readonly xsdSourceCount: number;
  readonly dtdSourceCount: number;
  readonly rngSourceCount: number;
  readonly auxiliaryCount: number;
  readonly ignoredCount: number;
  readonly blockedCount: number;
  readonly rootCandidateCount: number;
  readonly completeFileCount: number;
  readonly zeroNodeSourceCount: number;
  readonly unresolvedRelationshipCount: number;
}

export type SchemaPackageImportResult =
  | {
      readonly status: 'success';
      readonly manifest: SchemaArchiveManifest;
      readonly project: SchemaProject;
      readonly sources: readonly SchemaPackageSourceSummary[];
      readonly entries: readonly SchemaPackageEntrySummary[];
      readonly summary: SchemaPackageSummary;
      readonly initialFocusNodeId: SchemaNodeId;
      readonly contentKindsByNodeId: Readonly<
        Record<SchemaNodeId, DtdNormalizedContentKind>
      >;
      readonly dtdAttributesByNodeId: DtdAttributesByNodeId;
      readonly comments: readonly DtdNormalizedComment[];
      readonly commentsByNodeId: DtdCommentsByNodeId;
      readonly schemaLevelComments: readonly DtdNormalizedComment[];
      readonly sourceMarkupByNodeId: SchemaSourceMarkupByNodeId;
      readonly xsdMetadataByNodeId: XsdMetadataByNodeId;
      readonly unresolvedReferences: readonly SchemaPackageUnresolvedReference[];
      readonly diagnostics: readonly SchemaPackageImportDiagnostic[];
      readonly visualization: VisualizationResult;
      readonly relaxNgSemanticModel?: RelaxNgSemanticModel;
    }
  | {
      readonly status: 'failure';
      readonly diagnostics: readonly SchemaPackageImportDiagnostic[];
    };

export type SchemaPackageImportProgress =
  | { readonly phase: 'discovering-package' }
  | { readonly phase: 'reading-package' }
  | { readonly phase: 'validating-standards' }
  | {
      readonly phase: 'importing-package-source';
      readonly current: number;
      readonly total: number;
      readonly currentSourceFilename: string;
    }
  | { readonly phase: 'resolving-package' }
  | { readonly phase: 'finalizing' };

export interface SchemaPackageImportExecution {
  readonly onProgress?: (progress: SchemaPackageImportProgress) => void;
  readonly validateStandards?: (input: {
    readonly files: readonly XercesProjectFile[];
    readonly roots: readonly {
      readonly format: 'xsd' | 'dtd';
      readonly entryPath: string;
    }[];
  }) => Promise<readonly XercesValidationResult[]>;
  readonly validateRelaxNg?: (input: {
    readonly files: readonly RelaxNgProjectFile[];
    readonly roots: readonly {
      readonly format: 'rng';
      readonly entryPath: string;
    }[];
  }) => Promise<readonly RelaxNgValidationResult[]>;
}

export interface SchemaPackageImportDependencies {
  readonly discoverArchive: (
    input: SchemaArchiveDiscoveryInput,
  ) => Promise<SchemaArchiveDiscoveryResult>;
  readonly loadContents: SchemaArchiveContentLoader;
  readonly importDtd: (
    sourceText: string,
    options: DtdImportOptions,
  ) => DtdImportResult;
  readonly importXsd: (
    sourceText: string,
    options: XsdImportOptions,
  ) => XsdImportResult;
}
