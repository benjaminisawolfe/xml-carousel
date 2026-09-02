import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  discoverSchemaArchive,
  type SchemaArchiveManifest,
} from '../schemaArchive';
import loaderSource from './jsZipContentLoader.ts?raw';
import {
  loadJsZipSchemaContents,
  SchemaArchiveContentLoadError,
} from './jsZipContentLoader';
import { MAX_SCHEMA_PACKAGE_ENTRY_BYTES } from './schemaPackageConstants';

async function archiveBytes(): Promise<Uint8Array> {
  const archive = new JSZip();
  archive.file('package/a.xsd', '<schema-a/>', { createFolders: false });
  archive.file('package/nested/b.dtd', '<!ELEMENT b EMPTY>', {
    createFolders: false,
  });
  archive.file('package/ignored.txt', 'must not be extracted', {
    createFolders: false,
  });
  return archive.generateAsync({ type: 'uint8array', compression: 'STORE' });
}

async function manifestFor(bytes: Uint8Array): Promise<SchemaArchiveManifest> {
  const result = await discoverSchemaArchive({
    filename: 'package.zip',
    data: bytes,
  });
  expect(result.status).toBe('success');
  if (result.status !== 'success')
    throw new Error('Expected discovery success.');
  return result.manifest;
}

describe('JSZip schema content loader', () => {
  afterEach(() => vi.restoreAllMocks());

  it('stops a highly compressible member at the actual extracted-byte limit', async () => {
    const archive = new JSZip();
    archive.file(
      'main.xsd',
      new Uint8Array(MAX_SCHEMA_PACKAGE_ENTRY_BYTES + 1).fill(65),
      { compression: 'DEFLATE', compressionOptions: { level: 9 } },
    );
    const bytes = await archive.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    });
    const manifest = await manifestFor(bytes);
    expect(bytes.byteLength).toBeLessThan(MAX_SCHEMA_PACKAGE_ENTRY_BYTES);

    await expect(
      loadJsZipSchemaContents(bytes, manifest),
    ).rejects.toMatchObject({
      reason: 'entry-too-large',
      entryPath: 'main.xsd',
    });
  });

  it('loads canonical repeated separators and dot segments from a real archive', async () => {
    const archive = new JSZip();
    archive.file('dir//./child.xsd', '<xs:schema/>', {
      createFolders: false,
    });
    const bytes = await archive.generateAsync({ type: 'uint8array' });
    const manifest = await manifestFor(bytes);

    const loaded = await loadJsZipSchemaContents(bytes, manifest);
    expect(
      loaded.map(({ archivePath, bytes: content }) => ({
        archivePath,
        source: new TextDecoder().decode(content),
      })),
    ).toEqual([{ archivePath: 'dir/child.xsd', source: '<xs:schema/>' }]);
  });

  it('trusts actual streamed bytes over a forged small declared size', async () => {
    const listeners: Partial<
      Record<'data' | 'error' | 'end', (value?: unknown) => void>
    > = {};
    const stream = {
      on(event: 'data' | 'error' | 'end', listener: (value?: unknown) => void) {
        listeners[event] = listener;
        return this;
      },
      pause() {
        return this;
      },
      resume() {
        listeners.data?.(new Uint8Array(MAX_SCHEMA_PACKAGE_ENTRY_BYTES));
        listeners.data?.(new Uint8Array(1));
        listeners.end?.();
        return this;
      },
    };
    const zipEntry = {
      name: 'main.xsd',
      dir: false,
      _data: { uncompressedSize: 1 },
      internalStream: () => stream,
    };
    vi.spyOn(JSZip, 'loadAsync').mockResolvedValue({
      files: { 'main.xsd': zipEntry },
    } as unknown as JSZip);
    const manifest: SchemaArchiveManifest = {
      id: 'schema-package:forged-metadata.zip',
      archiveFilename: 'forged-metadata.zip',
      archiveByteLength: 1,
      packageRoot: '/',
      entries: [],
      schemaEntries: [
        {
          id: 'schema-entry:1',
          archivePath: 'main.xsd',
          packageRelativePath: 'main.xsd',
          basename: 'main.xsd',
          format: 'xsd',
          sourceOrder: 0,
        },
      ],
      acceptedFileEntries: [
        { archivePath: 'main.xsd', packageRelativePath: 'main.xsd' },
      ],
      xsdCount: 1,
      dtdCount: 0,
      rngCount: 0,
      ignoredFileCount: 0,
      totalFileEntryCount: 1,
    };

    await expect(
      loadJsZipSchemaContents(new Uint8Array([1]), manifest),
    ).rejects.toMatchObject({
      reason: 'entry-too-large',
      entryPath: 'main.xsd',
    });
  });

  it('extracts the complete accepted file set in deterministic order', async () => {
    const bytes = await archiveBytes();
    const manifest = await manifestFor(bytes);
    const loaded = await loadJsZipSchemaContents(bytes, manifest);

    expect(loaded.map(({ archivePath }) => archivePath)).toEqual(
      manifest.acceptedFileEntries?.map(({ archivePath }) => archivePath),
    );
    expect(loaded.map(({ bytes }) => new TextDecoder().decode(bytes))).toEqual([
      '<schema-a/>',
      'must not be extracted',
      '<!ELEMENT b EMPTY>',
    ]);
  });

  it('does not mutate input and returns independent byte arrays', async () => {
    const bytes = await archiveBytes();
    const before = bytes.slice();
    const manifest = await manifestFor(bytes);
    const first = await loadJsZipSchemaContents(bytes, manifest);
    const second = await loadJsZipSchemaContents(bytes, manifest);

    expect(bytes).toEqual(before);
    expect(first).toEqual(second);
    expect(first[0]?.bytes).not.toBe(second[0]?.bytes);
  });

  it('rejects missing entries and directory mismatches', async () => {
    const bytes = await archiveBytes();
    const manifest = await manifestFor(bytes);
    const missing = {
      ...manifest,
      acceptedFileEntries: [
        {
          ...manifest.acceptedFileEntries?.[0],
          archivePath: 'missing.xsd',
          packageRelativePath: 'missing.xsd',
        },
      ],
    };
    await expect(loadJsZipSchemaContents(bytes, missing)).rejects.toMatchObject(
      {
        reason: 'missing',
        entryPath: 'missing.xsd',
      },
    );

    const directoryArchive = new JSZip();
    directoryArchive.folder('directory.xsd');
    const directoryBytes = await directoryArchive.generateAsync({
      type: 'uint8array',
    });
    const directoryManifest = {
      ...manifest,
      acceptedFileEntries: [
        {
          ...manifest.acceptedFileEntries?.[0],
          archivePath: 'directory.xsd/',
          packageRelativePath: 'directory.xsd/',
        },
      ],
    };
    await expect(
      loadJsZipSchemaContents(directoryBytes, directoryManifest),
    ).rejects.toMatchObject({ reason: 'directory' });
  });

  it('maps invalid archives to a private stable loader error', async () => {
    await expect(
      loadJsZipSchemaContents(new Uint8Array([1, 2, 3]), {
        id: 'schema-package:invalid.zip',
        archiveFilename: 'invalid.zip',
        archiveByteLength: 3,
        packageRoot: '/',
        entries: [],
        schemaEntries: [],
        xsdCount: 0,
        dtdCount: 0,
        rngCount: 0,
        ignoredFileCount: 0,
        totalFileEntryCount: 0,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<SchemaArchiveContentLoadError>>({
        name: 'SchemaArchiveContentLoadError',
        reason: 'read-failure',
        message: 'Schema archive content loading failed.',
      }),
    );
  });

  it('keeps production extraction sequential with bounded streaming', () => {
    expect(loaderSource).toContain("internalStream?.('uint8array')");
    expect(loaderSource).toContain('stream.pause()');
    expect(loaderSource).toContain('declaredUncompressedSize');
    expect(loaderSource).toContain('for (const { manifestEntry, zipEntry }');
    expect(loaderSource).toContain('checkCRC32: false');
    expect(loaderSource).toContain('createFolders: false');
    expect(loaderSource).not.toContain('Promise.all');
    expect(loaderSource).not.toContain("zipEntry.async('uint8array')");
    expect(loaderSource).not.toContain('generateAsync');
  });
});
