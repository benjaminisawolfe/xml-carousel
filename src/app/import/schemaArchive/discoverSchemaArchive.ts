import {
  MAX_SCHEMA_ARCHIVE_BYTES,
  MAX_SCHEMA_ARCHIVE_FILE_ENTRIES,
  MAX_SCHEMA_ARCHIVE_PATH_CODE_POINTS,
  MAX_SCHEMA_ARCHIVE_PATH_DEPTH,
  MAX_SCHEMA_ARCHIVE_SCHEMA_FILES,
} from './schemaArchiveConstants';
import {
  isSchemaArchiveFilename,
  normalizeSchemaArchiveFilename,
} from './schemaArchiveFilename';
import { loadJsZipMetadata } from './jsZipMetadataLoader';
import {
  canonicalizeSchemaArchivePath,
  schemaArchivePortablePathIdentity,
} from './schemaArchivePath';
import type {
  LoadedArchiveEntryMetadata,
  SchemaArchiveDiagnostic,
  SchemaArchiveDiagnosticCode,
  SchemaArchiveDiscoveryDependencies,
  SchemaArchiveDiscoveryInput,
  SchemaArchiveDiscoveryResult,
  SchemaArchiveEntryFormat,
  SchemaArchiveInventoryEntry,
  SchemaArchiveInventoryEntryKind,
  SchemaArchiveManifest,
  SchemaArchiveAcceptedFileEntry,
  SchemaArchiveSchemaEntry,
  SchemaArchiveUnsafePathReason,
} from './schemaArchiveTypes';

interface SchemaCandidate {
  readonly canonicalPath: string;
  readonly segments: readonly string[];
  readonly format: SchemaArchiveEntryFormat;
}

interface AcceptedFileCandidate {
  readonly canonicalPath: string;
  readonly segments: readonly string[];
  readonly metadata: LoadedArchiveEntryMetadata;
  readonly originalOrder: number;
}

interface EntryValidation {
  readonly metadata: LoadedArchiveEntryMetadata;
  readonly originalOrder: number;
  readonly canonicalPath?: string;
  readonly segments?: readonly string[];
  readonly diagnostic?: SchemaArchiveDiagnostic;
}

const INVALID_ARCHIVE_MESSAGE =
  'The selected file is not a readable ZIP archive or uses an unsupported ZIP feature.';

const productionDependencies: SchemaArchiveDiscoveryDependencies = {
  loadMetadata: loadJsZipMetadata,
};

function unicodeCodePointCompare(left: string, right: string): number {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0)!);
  const rightPoints = Array.from(right, (character) =>
    character.codePointAt(0)!,
  );
  const length = Math.min(leftPoints.length, rightPoints.length);

  for (let index = 0; index < length; index += 1) {
    const difference = leftPoints[index] - rightPoints[index];
    if (difference !== 0) return difference;
  }

  return leftPoints.length - rightPoints.length;
}

function freezeDiagnostic(
  code: SchemaArchiveDiagnosticCode,
  message: string,
  entryPath?: string,
): SchemaArchiveDiagnostic {
  return Object.freeze({
    stage: 'archive',
    code,
    severity: 'error',
    message,
    ...(entryPath === undefined ? {} : { entryPath }),
  });
}

function failure(
  diagnostics: readonly SchemaArchiveDiagnostic[],
): SchemaArchiveDiscoveryResult {
  return Object.freeze({
    status: 'failure',
    diagnostics: Object.freeze([...diagnostics]),
  });
}

function pathDiagnostic(
  reason: SchemaArchiveUnsafePathReason,
  entryPath?: string,
): SchemaArchiveDiagnostic {
  switch (reason) {
    case 'too-long':
      return freezeDiagnostic(
        'entry-path-too-long',
        `The ZIP archive contains an entry path longer than ${MAX_SCHEMA_ARCHIVE_PATH_CODE_POINTS} Unicode code points.`,
        entryPath,
      );
    case 'too-deep':
      return freezeDiagnostic(
        'entry-path-too-deep',
        `The ZIP archive contains an entry path deeper than ${MAX_SCHEMA_ARCHIVE_PATH_DEPTH} segments.`,
        entryPath,
      );
    default:
      return freezeDiagnostic(
        'unsafe-entry-path',
        'The ZIP archive contains an unsafe entry path.',
        entryPath,
      );
  }
}

function diagnosticCompare(
  left: SchemaArchiveDiagnostic,
  right: SchemaArchiveDiagnostic,
): number {
  return (
    unicodeCodePointCompare(left.entryPath ?? '', right.entryPath ?? '') ||
    unicodeCodePointCompare(left.code, right.code) ||
    unicodeCodePointCompare(left.message, right.message)
  );
}

function sortedDiagnostics(
  diagnostics: readonly SchemaArchiveDiagnostic[],
): readonly SchemaArchiveDiagnostic[] {
  return [...diagnostics].sort(diagnosticCompare);
}

function validateLoadedEntry(
  metadata: LoadedArchiveEntryMetadata,
  originalOrder: number,
): EntryValidation {
  const loaded = canonicalizeSchemaArchivePath(metadata.name);
  const original =
    metadata.unsafeOriginalName === undefined
      ? undefined
      : canonicalizeSchemaArchivePath(metadata.unsafeOriginalName);

  if (!loaded.valid) {
    return {
      metadata,
      originalOrder,
      diagnostic: pathDiagnostic(loaded.reason),
    };
  }
  if (original && !original.valid) {
    return {
      metadata,
      originalOrder,
      diagnostic: pathDiagnostic(original.reason, loaded.canonicalPath),
    };
  }
  if (original?.valid && original.canonicalPath !== loaded.canonicalPath) {
    return {
      metadata,
      originalOrder,
      diagnostic: pathDiagnostic('parent-segment', loaded.canonicalPath),
    };
  }

  return {
    metadata,
    originalOrder,
    canonicalPath: loaded.canonicalPath,
    segments: loaded.segments,
  };
}

function classifySchemaFormat(
  canonicalPath: string,
): SchemaArchiveEntryFormat | undefined {
  if (/\.xsd$/iu.test(canonicalPath)) return 'xsd';
  if (/\.dtd$/iu.test(canonicalPath)) return 'dtd';
  if (/\.(?:rng|rnc)$/iu.test(canonicalPath)) return 'rng';
  return undefined;
}

function isMacOsMetadata(canonicalPath: string): boolean {
  const segments = canonicalPath.split('/');
  return (
    segments[0] === '__MACOSX' || segments[segments.length - 1] === '.DS_Store'
  );
}

function duplicatePathDiagnostics(
  candidates: readonly SchemaCandidate[],
): readonly SchemaArchiveDiagnostic[] {
  const byPortableIdentity = new Map<string, SchemaCandidate[]>();
  for (const candidate of candidates) {
    const identity = schemaArchivePortablePathIdentity(candidate.canonicalPath);
    const group = byPortableIdentity.get(identity);
    if (group) {
      group.push(candidate);
    } else {
      byPortableIdentity.set(identity, [candidate]);
    }
  }

  const diagnostics: SchemaArchiveDiagnostic[] = [];
  for (const group of byPortableIdentity.values()) {
    if (group.length < 2) continue;
    const sortedGroup = [...group].sort((left, right) =>
      unicodeCodePointCompare(left.canonicalPath, right.canonicalPath),
    );
    const first = sortedGroup[0];
    for (const duplicate of sortedGroup.slice(1)) {
      diagnostics.push(
        freezeDiagnostic(
          'duplicate-schema-path',
          `The ZIP archive contains schema paths that collide on portable file systems: "${first.canonicalPath}" and "${duplicate.canonicalPath}".`,
          first.canonicalPath,
        ),
      );
    }
  }
  return diagnostics;
}

function commonRootSegments(
  candidates: readonly { readonly segments: readonly string[] }[],
): readonly string[] {
  if (candidates.length === 0) return [];
  const firstDirectories = candidates[0].segments.slice(0, -1);
  let sharedLength = firstDirectories.length;

  for (const candidate of candidates.slice(1)) {
    const directories = candidate.segments.slice(0, -1);
    sharedLength = Math.min(sharedLength, directories.length);
    for (let index = 0; index < sharedLength; index += 1) {
      if (firstDirectories[index] !== directories[index]) {
        sharedLength = index;
        break;
      }
    }
  }

  return firstDirectories.slice(0, sharedLength);
}

function auxiliaryFileKind(canonicalPath: string): boolean {
  return /\.(?:ent|mod|inc|frag|schema)$/iu.test(canonicalPath);
}

function inventoryKind(
  canonicalPath: string,
  directory: boolean,
): SchemaArchiveInventoryEntryKind {
  if (directory) return 'directory';
  const schema = classifySchemaFormat(canonicalPath);
  if (schema) return schema;
  return auxiliaryFileKind(canonicalPath) ? 'auxiliary' : 'ignored';
}

function relativePath(
  segments: readonly string[],
  rootSegments: readonly string[],
): string {
  return rootSegments.every((segment, index) => segments[index] === segment)
    ? segments.slice(rootSegments.length).join('/')
    : segments.join('/');
}

function buildManifest(
  archiveFilename: string,
  archiveByteLength: number,
  candidates: readonly SchemaCandidate[],
  acceptedCandidates: readonly AcceptedFileCandidate[],
  validations: readonly EntryValidation[],
  ignoredFileCount: number,
  totalFileEntryCount: number,
): SchemaArchiveManifest {
  const sortedCandidates = [...candidates].sort((left, right) =>
    unicodeCodePointCompare(left.canonicalPath, right.canonicalPath),
  );
  const rootSegments = commonRootSegments(
    acceptedCandidates.filter(
      (candidate) =>
        inventoryKind(candidate.canonicalPath, false) !== 'ignored',
    ),
  );
  const commonRootDirectory =
    rootSegments.length === 0 ? undefined : rootSegments.join('/');

  const acceptedFileEntries = [...acceptedCandidates]
    .sort((left, right) =>
      unicodeCodePointCompare(left.canonicalPath, right.canonicalPath),
    )
    .map((candidate): SchemaArchiveAcceptedFileEntry =>
      Object.freeze({
        archivePath: candidate.canonicalPath,
        packageRelativePath: relativePath(candidate.segments, rootSegments),
      }),
    );

  let xsdCount = 0;
  let dtdCount = 0;
  let rngCount = 0;
  const schemaEntries = sortedCandidates.map(
    (candidate, sourceOrder): SchemaArchiveSchemaEntry => {
      if (candidate.format === 'xsd') xsdCount += 1;
      else if (candidate.format === 'dtd') dtdCount += 1;
      else rngCount += 1;

      const directorySegments = candidate.segments.slice(0, -1);
      return Object.freeze({
        id: `schema-archive-entry:${encodeURIComponent(candidate.canonicalPath)}`,
        archivePath: candidate.canonicalPath,
        packageRelativePath: relativePath(candidate.segments, rootSegments),
        ...(directorySegments.length === 0
          ? {}
          : { directoryPath: directorySegments.join('/') }),
        basename: candidate.segments[candidate.segments.length - 1],
        format: candidate.format,
        sourceOrder,
      });
    },
  );

  const deterministicValidations = validations
    .filter(
      (validation) =>
        validation.canonicalPath !== undefined &&
        validation.segments !== undefined,
    )
    .sort((left, right) =>
      unicodeCodePointCompare(left.canonicalPath!, right.canonicalPath!),
    );
  const entries = deterministicValidations.map(
    (validation, deterministicOrder): SchemaArchiveInventoryEntry => {
      const canonicalPath = validation.canonicalPath!;
      const segments = validation.segments!;
      const kind = inventoryKind(canonicalPath, validation.metadata.dir);
      const osMetadata = isMacOsMetadata(canonicalPath);
      const reason = validation.metadata.dir
        ? 'directory-entry'
        : osMetadata
          ? 'operating-system-metadata'
          : kind === 'xsd' || kind === 'dtd' || kind === 'rng'
            ? 'schema-source'
            : kind === 'auxiliary'
              ? 'potential-resolution-resource'
              : 'unsupported-file-type';
      return Object.freeze({
        id: `schema-archive-inventory:${encodeURIComponent(canonicalPath)}:${validation.metadata.dir ? 'directory' : 'file'}`,
        archivePath: canonicalPath,
        normalizedPath: canonicalPath,
        packageRelativePath: relativePath(segments, rootSegments),
        basename: segments[segments.length - 1] ?? canonicalPath,
        kind: osMetadata ? 'ignored' : kind,
        reason,
        directory: validation.metadata.dir,
        originalOrder: validation.originalOrder,
        deterministicOrder,
        ...(validation.metadata.uncompressedByteLength === undefined
          ? {}
          : {
              uncompressedByteLength:
                validation.metadata.uncompressedByteLength,
            }),
        ...(validation.metadata.compressedByteLength === undefined
          ? {}
          : { compressedByteLength: validation.metadata.compressedByteLength }),
      });
    },
  );

  return Object.freeze({
    id: `schema-package:${encodeURIComponent(archiveFilename)}`,
    archiveFilename,
    archiveByteLength,
    packageRoot: commonRootDirectory ?? '/',
    ...(commonRootDirectory === undefined ? {} : { commonRootDirectory }),
    entries: Object.freeze(entries),
    schemaEntries: Object.freeze(schemaEntries),
    acceptedFileEntries: Object.freeze(acceptedFileEntries),
    xsdCount,
    dtdCount,
    rngCount,
    ignoredFileCount,
    totalFileEntryCount,
  });
}

function cloneBinary(
  data: SchemaArchiveDiscoveryInput['data'],
): SchemaArchiveDiscoveryInput['data'] {
  return data instanceof Uint8Array ? data.slice() : data.slice(0);
}

export async function discoverSchemaArchive(
  input: SchemaArchiveDiscoveryInput,
  dependencies: SchemaArchiveDiscoveryDependencies = productionDependencies,
): Promise<SchemaArchiveDiscoveryResult> {
  const archiveFilename = normalizeSchemaArchiveFilename(input.filename);
  if (!isSchemaArchiveFilename(input.filename)) {
    return failure([
      freezeDiagnostic(
        'unsupported-extension',
        'Choose a file with a .zip extension.',
      ),
    ]);
  }

  const archiveByteLength = input.data.byteLength;
  if (archiveByteLength === 0) {
    return failure([
      freezeDiagnostic(
        'empty-archive-file',
        'The selected ZIP archive is empty.',
      ),
    ]);
  }
  if (archiveByteLength > MAX_SCHEMA_ARCHIVE_BYTES) {
    return failure([
      freezeDiagnostic(
        'archive-too-large',
        `The selected ZIP archive exceeds the ${MAX_SCHEMA_ARCHIVE_BYTES / 1024 / 1024} MiB size limit.`,
      ),
    ]);
  }

  let loadedEntries: readonly LoadedArchiveEntryMetadata[];
  try {
    const loaded = await dependencies.loadMetadata(cloneBinary(input.data));
    loadedEntries = loaded.entries;
  } catch {
    return failure([
      freezeDiagnostic('invalid-archive', INVALID_ARCHIVE_MESSAGE),
    ]);
  }

  const totalFileEntryCount = loadedEntries.filter(
    (entry) => !entry.dir,
  ).length;
  if (totalFileEntryCount > MAX_SCHEMA_ARCHIVE_FILE_ENTRIES) {
    return failure([
      freezeDiagnostic(
        'too-many-file-entries',
        `The ZIP archive contains more than ${MAX_SCHEMA_ARCHIVE_FILE_ENTRIES.toLocaleString('en-US')} files.`,
      ),
    ]);
  }

  const validations = loadedEntries.map((entry, index) =>
    validateLoadedEntry(entry, index),
  );
  const pathDiagnostics: SchemaArchiveDiagnostic[] = [];
  for (const validation of validations) {
    if (validation.diagnostic) {
      pathDiagnostics.push(validation.diagnostic);
    }
  }
  const candidates: SchemaCandidate[] = [];
  const acceptedCandidates: AcceptedFileCandidate[] = [];
  let ignoredFileCount = 0;

  for (const validation of validations) {
    if (
      validation.diagnostic ||
      validation.metadata.dir ||
      validation.canonicalPath === undefined ||
      validation.segments === undefined
    ) {
      continue;
    }
    if (isMacOsMetadata(validation.canonicalPath)) {
      ignoredFileCount += 1;
      continue;
    }
    acceptedCandidates.push({
      canonicalPath: validation.canonicalPath,
      segments: validation.segments,
      metadata: validation.metadata,
      originalOrder: validation.originalOrder,
    });
    const format = classifySchemaFormat(validation.canonicalPath);
    if (format === undefined) {
      ignoredFileCount += 1;
      continue;
    }
    candidates.push({
      canonicalPath: validation.canonicalPath,
      segments: validation.segments,
      format,
    });
  }

  if (candidates.length > MAX_SCHEMA_ARCHIVE_SCHEMA_FILES) {
    return failure([
      freezeDiagnostic(
        'too-many-schema-files',
        `The ZIP archive contains more than ${MAX_SCHEMA_ARCHIVE_SCHEMA_FILES} schema files.`,
      ),
    ]);
  }

  const collisionDiagnostics = duplicatePathDiagnostics(candidates);
  if (pathDiagnostics.length > 0 || collisionDiagnostics.length > 0) {
    return failure(
      sortedDiagnostics([...pathDiagnostics, ...collisionDiagnostics]),
    );
  }

  if (candidates.length === 0) {
    return failure([
      freezeDiagnostic(
        'no-schema-files',
        'The ZIP archive does not contain any .xsd, .dtd, .rng, or .rnc files.',
      ),
    ]);
  }

  return Object.freeze({
    status: 'success',
    manifest: buildManifest(
      archiveFilename,
      archiveByteLength,
      candidates,
      acceptedCandidates,
      validations,
      ignoredFileCount,
      totalFileEntryCount,
    ),
  });
}
