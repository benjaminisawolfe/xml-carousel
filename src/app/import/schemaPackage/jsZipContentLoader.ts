import JSZip from 'jszip';
import {
  canonicalizeSchemaArchivePath,
  type SchemaArchiveBinary,
  type SchemaArchiveManifest,
} from '../schemaArchive';
import {
  MAX_SCHEMA_PACKAGE_ENTRY_BYTES,
  MAX_SCHEMA_PACKAGE_TOTAL_BYTES,
} from './schemaPackageConstants';
import type {
  LoadedSchemaArchiveEntryContent,
  SchemaArchiveContentLoader,
} from './schemaPackageTypes';

export type SchemaArchiveContentLoadFailureReason =
  | 'missing'
  | 'directory'
  | 'path-mismatch'
  | 'read-failure'
  | 'invalid-output'
  | 'entry-too-large'
  | 'package-too-large';

export class SchemaArchiveContentLoadError extends Error {
  readonly reason: SchemaArchiveContentLoadFailureReason;
  readonly entryPath?: string;

  constructor(
    reason: SchemaArchiveContentLoadFailureReason,
    entryPath?: string,
  ) {
    super('Schema archive content loading failed.');
    this.name = 'SchemaArchiveContentLoadError';
    this.reason = reason;
    this.entryPath = entryPath;
  }
}

interface BoundedZipStream {
  on(
    event: 'data',
    listener: (chunk: Uint8Array | readonly number[]) => void,
  ): BoundedZipStream;
  on(event: 'error', listener: (error: unknown) => void): BoundedZipStream;
  on(event: 'end', listener: () => void): BoundedZipStream;
  pause(): BoundedZipStream;
  resume(): BoundedZipStream;
}

type BoundedZipEntry = JSZip.JSZipObject & {
  readonly _data?: { readonly uncompressedSize?: unknown };
  internalStream?(type: 'uint8array'): BoundedZipStream;
};

function cloneBinary(data: SchemaArchiveBinary): SchemaArchiveBinary {
  return data instanceof Uint8Array ? data.slice() : data.slice(0);
}

function validateLoadedPath(
  name: string,
  unsafeOriginalName: string | undefined,
  expectedPath: string,
): void {
  const loaded = canonicalizeSchemaArchivePath(name);
  const original =
    unsafeOriginalName === undefined
      ? undefined
      : canonicalizeSchemaArchivePath(unsafeOriginalName);
  if (
    !loaded.valid ||
    loaded.canonicalPath !== expectedPath ||
    (original !== undefined &&
      (!original.valid || original.canonicalPath !== expectedPath))
  ) {
    throw new SchemaArchiveContentLoadError('path-mismatch', expectedPath);
  }
}

function canonicalEntryCandidates(
  archive: JSZip,
  expectedPath: string,
): readonly BoundedZipEntry[] {
  return Object.values(archive.files).filter((entry) => {
    const canonical = canonicalizeSchemaArchivePath(entry.name);
    return canonical.valid && canonical.canonicalPath === expectedPath;
  }) as readonly BoundedZipEntry[];
}

function resolveArchiveEntry(
  archive: JSZip,
  expectedPath: string,
): BoundedZipEntry {
  const exact = archive.files[expectedPath] as BoundedZipEntry | undefined;
  if (exact?.dir) {
    throw new SchemaArchiveContentLoadError('directory', expectedPath);
  }
  const candidates = canonicalEntryCandidates(archive, expectedPath);
  if (candidates.length === 0) {
    throw new SchemaArchiveContentLoadError('missing', expectedPath);
  }
  if (candidates.length !== 1) {
    throw new SchemaArchiveContentLoadError('path-mismatch', expectedPath);
  }
  const entry = candidates[0]!;
  if (entry.dir) {
    throw new SchemaArchiveContentLoadError('directory', expectedPath);
  }
  validateLoadedPath(entry.name, entry.unsafeOriginalName, expectedPath);
  return entry;
}

function declaredUncompressedSize(entry: BoundedZipEntry): number | undefined {
  const value = entry._data?.uncompressedSize;
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? (value as number)
    : undefined;
}

function concatenateChunks(
  chunks: readonly Uint8Array[],
  byteLength: number,
): Uint8Array {
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function readEntryBounded(
  entry: BoundedZipEntry,
  entryPath: string,
  aggregateBytesBeforeEntry: number,
): Promise<Uint8Array> {
  const stream = entry.internalStream?.('uint8array');
  if (!stream) {
    return Promise.reject(
      new SchemaArchiveContentLoadError('read-failure', entryPath),
    );
  }
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let entryBytes = 0;
    let settled = false;

    const fail = (
      reason: 'entry-too-large' | 'package-too-large' | 'read-failure',
    ): void => {
      if (settled) return;
      settled = true;
      chunks.length = 0;
      stream.pause();
      reject(new SchemaArchiveContentLoadError(reason, entryPath));
    };

    stream
      .on('data', (value) => {
        if (settled) return;
        const chunk =
          value instanceof Uint8Array
            ? value
            : Uint8Array.from(value as readonly number[]);
        const nextEntryBytes = entryBytes + chunk.byteLength;
        if (nextEntryBytes > MAX_SCHEMA_PACKAGE_ENTRY_BYTES) {
          fail('entry-too-large');
          return;
        }
        if (
          aggregateBytesBeforeEntry + nextEntryBytes >
          MAX_SCHEMA_PACKAGE_TOTAL_BYTES
        ) {
          fail('package-too-large');
          return;
        }
        entryBytes = nextEntryBytes;
        chunks.push(chunk.slice());
      })
      .on('error', () => fail('read-failure'))
      .on('end', () => {
        if (settled) return;
        settled = true;
        resolve(concatenateChunks(chunks, entryBytes));
      })
      .resume();
  });
}

export const loadJsZipSchemaContents: SchemaArchiveContentLoader = async (
  data: SchemaArchiveBinary,
  manifest: SchemaArchiveManifest,
): Promise<readonly LoadedSchemaArchiveEntryContent[]> => {
  let archive: JSZip;
  try {
    archive = await JSZip.loadAsync(cloneBinary(data), {
      checkCRC32: false,
      createFolders: false,
    });
  } catch {
    throw new SchemaArchiveContentLoadError('read-failure');
  }

  const loaded: LoadedSchemaArchiveEntryContent[] = [];
  let totalBytes = 0;
  const acceptedEntries =
    manifest.acceptedFileEntries ??
    manifest.schemaEntries.map((entry) => ({
      archivePath: entry.archivePath,
      packageRelativePath: entry.packageRelativePath,
    }));
  const resolvedEntries = acceptedEntries.map((manifestEntry) => ({
    manifestEntry,
    zipEntry: resolveArchiveEntry(archive, manifestEntry.archivePath),
  }));

  let declaredTotal = 0;
  for (const { manifestEntry, zipEntry } of resolvedEntries) {
    const declaredSize = declaredUncompressedSize(zipEntry);
    if (declaredSize === undefined) continue;
    if (declaredSize > MAX_SCHEMA_PACKAGE_ENTRY_BYTES) {
      throw new SchemaArchiveContentLoadError(
        'entry-too-large',
        manifestEntry.archivePath,
      );
    }
    declaredTotal += declaredSize;
    if (declaredTotal > MAX_SCHEMA_PACKAGE_TOTAL_BYTES) {
      throw new SchemaArchiveContentLoadError(
        'package-too-large',
        manifestEntry.archivePath,
      );
    }
  }

  for (const { manifestEntry, zipEntry } of resolvedEntries) {
    let bytes: Uint8Array;
    try {
      bytes = await readEntryBounded(
        zipEntry,
        manifestEntry.archivePath,
        totalBytes,
      );
    } catch (error) {
      if (error instanceof SchemaArchiveContentLoadError) throw error;
      throw new SchemaArchiveContentLoadError(
        'read-failure',
        manifestEntry.archivePath,
      );
    }
    if (!(bytes instanceof Uint8Array)) {
      throw new SchemaArchiveContentLoadError(
        'invalid-output',
        manifestEntry.archivePath,
      );
    }
    if (bytes.byteLength > MAX_SCHEMA_PACKAGE_ENTRY_BYTES) {
      throw new SchemaArchiveContentLoadError(
        'entry-too-large',
        manifestEntry.archivePath,
      );
    }
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_SCHEMA_PACKAGE_TOTAL_BYTES) {
      throw new SchemaArchiveContentLoadError(
        'package-too-large',
        manifestEntry.archivePath,
      );
    }
    loaded.push({
      archivePath: manifestEntry.archivePath,
      bytes: bytes.slice(),
    });
  }
  return loaded;
};
