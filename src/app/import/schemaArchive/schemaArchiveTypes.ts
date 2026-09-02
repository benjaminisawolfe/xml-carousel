export type SchemaArchiveBinary = ArrayBuffer | Uint8Array;

export interface SchemaArchiveDiscoveryInput {
  readonly filename: string;
  readonly data: SchemaArchiveBinary;
}

export interface LoadedArchiveEntryMetadata {
  readonly name: string;
  readonly unsafeOriginalName?: string;
  readonly dir: boolean;
  readonly uncompressedByteLength?: number;
  readonly compressedByteLength?: number;
}

export interface LoadedArchiveDirectory {
  readonly entries: readonly LoadedArchiveEntryMetadata[];
}

export type SchemaArchiveMetadataLoader = (
  data: SchemaArchiveBinary,
) => Promise<LoadedArchiveDirectory>;

export interface SchemaArchiveDiscoveryDependencies {
  readonly loadMetadata: SchemaArchiveMetadataLoader;
}

export type SchemaArchiveEntryFormat = 'xsd' | 'dtd' | 'rng';

export interface SchemaArchiveSchemaEntry {
  readonly id: string;
  readonly archivePath: string;
  readonly packageRelativePath: string;
  readonly directoryPath?: string;
  readonly basename: string;
  readonly format: SchemaArchiveEntryFormat;
  readonly sourceOrder: number;
}

export interface SchemaArchiveAcceptedFileEntry {
  readonly archivePath: string;
  readonly packageRelativePath: string;
}

export type SchemaArchiveInventoryEntryKind =
  'xsd' | 'dtd' | 'rng' | 'auxiliary' | 'ignored' | 'directory';

export type SchemaArchiveInventoryReason =
  | 'schema-source'
  | 'potential-resolution-resource'
  | 'directory-entry'
  | 'operating-system-metadata'
  | 'unsupported-file-type';

/** Complete, byte-free metadata for one supplied, safe archive entry. */
export interface SchemaArchiveInventoryEntry {
  readonly id: string;
  readonly archivePath: string;
  readonly normalizedPath: string;
  readonly packageRelativePath: string;
  readonly basename: string;
  readonly kind: SchemaArchiveInventoryEntryKind;
  readonly reason: SchemaArchiveInventoryReason;
  readonly directory: boolean;
  readonly originalOrder: number;
  readonly deterministicOrder: number;
  readonly uncompressedByteLength?: number;
  readonly compressedByteLength?: number;
}

export interface SchemaArchiveManifest {
  readonly id: string;
  readonly archiveFilename: string;
  readonly archiveByteLength: number;
  readonly packageRoot: string;
  readonly commonRootDirectory?: string;
  readonly entries: readonly SchemaArchiveInventoryEntry[];
  readonly schemaEntries: readonly SchemaArchiveSchemaEntry[];
  /** Safe project files made available to the controlled standards resolver. */
  readonly acceptedFileEntries?: readonly SchemaArchiveAcceptedFileEntry[];
  readonly xsdCount: number;
  readonly dtdCount: number;
  readonly rngCount: number;
  readonly ignoredFileCount: number;
  readonly totalFileEntryCount: number;
}

export type SchemaArchiveDiagnosticCode =
  | 'unsupported-extension'
  | 'empty-archive-file'
  | 'archive-too-large'
  | 'invalid-archive'
  | 'too-many-file-entries'
  | 'unsafe-entry-path'
  | 'entry-path-too-long'
  | 'entry-path-too-deep'
  | 'duplicate-schema-path'
  | 'too-many-schema-files'
  | 'no-schema-files';

export interface SchemaArchiveDiagnostic {
  readonly stage: 'archive';
  readonly code: SchemaArchiveDiagnosticCode;
  readonly severity: 'error';
  readonly message: string;
  readonly entryPath?: string;
}

export type SchemaArchiveDiscoveryResult =
  | {
      readonly status: 'success';
      readonly manifest: SchemaArchiveManifest;
    }
  | {
      readonly status: 'failure';
      readonly diagnostics: readonly SchemaArchiveDiagnostic[];
    };

export type SchemaArchiveUnsafePathReason =
  | 'nul-character'
  | 'control-character'
  | 'backslash'
  | 'absolute-path'
  | 'drive-prefix'
  | 'parent-segment'
  | 'empty-path'
  | 'too-long'
  | 'too-deep';

export type CanonicalArchivePathResult =
  | {
      readonly valid: true;
      readonly canonicalPath: string;
      readonly segments: readonly string[];
    }
  | {
      readonly valid: false;
      readonly reason: SchemaArchiveUnsafePathReason;
    };
