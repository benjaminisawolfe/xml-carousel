import { describe, expect, it } from 'vitest';
import {
  MAX_SCHEMA_ARCHIVE_BYTES,
  MAX_SCHEMA_ARCHIVE_FILE_ENTRIES,
  MAX_SCHEMA_ARCHIVE_SCHEMA_FILES,
} from './schemaArchiveConstants';
import { discoverSchemaArchive } from './discoverSchemaArchive';
import type {
  LoadedArchiveEntryMetadata,
  SchemaArchiveDiscoveryDependencies,
  SchemaArchiveDiscoveryResult,
} from './schemaArchiveTypes';

const oneByte = new Uint8Array([1]);

function loaderFor(
  entries: readonly LoadedArchiveEntryMetadata[],
): SchemaArchiveDiscoveryDependencies {
  return {
    async loadMetadata() {
      return { entries };
    },
  };
}

async function discover(
  entries: readonly LoadedArchiveEntryMetadata[],
  filename = 'package.zip',
): Promise<SchemaArchiveDiscoveryResult> {
  return discoverSchemaArchive({ filename, data: oneByte }, loaderFor(entries));
}

function successfulManifest(
  result: SchemaArchiveDiscoveryResult,
): Extract<SchemaArchiveDiscoveryResult, { status: 'success' }>['manifest'] {
  expect(result.status).toBe('success');
  if (result.status !== 'success') {
    throw new Error('Expected schema archive discovery to succeed.');
  }
  return result.manifest;
}

describe('schema archive discovery manifest', () => {
  it('discovers one XSD with deterministic metadata', async () => {
    const manifest = successfulManifest(
      await discover([{ name: 'schemas/main.xsd', dir: false }]),
    );

    expect(manifest).toEqual({
      id: 'schema-package:package.zip',
      archiveFilename: 'package.zip',
      archiveByteLength: 1,
      packageRoot: 'schemas',
      commonRootDirectory: 'schemas',
      entries: [
        {
          id: 'schema-archive-inventory:schemas%2Fmain.xsd:file',
          archivePath: 'schemas/main.xsd',
          normalizedPath: 'schemas/main.xsd',
          packageRelativePath: 'main.xsd',
          basename: 'main.xsd',
          kind: 'xsd',
          reason: 'schema-source',
          directory: false,
          originalOrder: 0,
          deterministicOrder: 0,
        },
      ],
      schemaEntries: [
        {
          id: 'schema-archive-entry:schemas%2Fmain.xsd',
          archivePath: 'schemas/main.xsd',
          packageRelativePath: 'main.xsd',
          directoryPath: 'schemas',
          basename: 'main.xsd',
          format: 'xsd',
          sourceOrder: 0,
        },
      ],
      acceptedFileEntries: [
        {
          archivePath: 'schemas/main.xsd',
          packageRelativePath: 'main.xsd',
        },
      ],
      xsdCount: 1,
      dtdCount: 0,
      ignoredFileCount: 0,
      totalFileEntryCount: 1,
    });
  });

  it('accepts DTD-only and mixed packages without choosing a primary format', async () => {
    const dtdManifest = successfulManifest(
      await discover([{ name: 'root.DTD', dir: false }]),
    );
    expect(dtdManifest).toMatchObject({
      xsdCount: 0,
      dtdCount: 1,
      schemaEntries: [{ format: 'dtd' }],
    });

    const mixedManifest = successfulManifest(
      await discover([
        { name: 'package/types/base.dtd', dir: false },
        { name: 'package/main.XSD', dir: false },
      ]),
    );
    expect(mixedManifest).toMatchObject({
      commonRootDirectory: 'package',
      xsdCount: 1,
      dtdCount: 1,
      schemaEntries: [
        {
          archivePath: 'package/main.XSD',
          packageRelativePath: 'main.XSD',
          format: 'xsd',
          sourceOrder: 0,
        },
        {
          archivePath: 'package/types/base.dtd',
          packageRelativePath: 'types/base.dtd',
          format: 'dtd',
          sourceOrder: 1,
        },
      ],
    });
  });

  it('derives exact common roots and preserves no-root package paths', async () => {
    const rooted = successfulManifest(
      await discover([
        { name: 'package/schemas/b.dtd', dir: false },
        { name: 'package/schemas/types/a.xsd', dir: false },
      ]),
    );
    expect(rooted.commonRootDirectory).toBe('package/schemas');
    expect(
      rooted.schemaEntries.map((entry) => entry.packageRelativePath),
    ).toEqual(['b.dtd', 'types/a.xsd']);

    const rootless = successfulManifest(
      await discover([
        { name: 'a.xsd', dir: false },
        { name: 'types/b.xsd', dir: false },
      ]),
    );
    expect(rootless.commonRootDirectory).toBeUndefined();
    expect(
      rootless.schemaEntries.map((entry) => entry.packageRelativePath),
    ).toEqual(['a.xsd', 'types/b.xsd']);

    const caseDistinct = successfulManifest(
      await discover([
        { name: 'Schemas/a.xsd', dir: false },
        { name: 'schemas/b.dtd', dir: false },
      ]),
    );
    expect(caseDistinct.commonRootDirectory).toBeUndefined();
  });

  it('uses explicit Unicode code-point ordering, IDs, and source order', async () => {
    const entries = [
      { name: 'types/é.xsd', dir: false },
      { name: 'types/a.dtd', dir: false },
      { name: 'types/Z.xsd', dir: false },
      { name: 'types/😀.xsd', dir: false },
    ] as const;
    const first = successfulManifest(await discover(entries));
    const second = successfulManifest(await discover([...entries].reverse()));

    expect(first.schemaEntries).toEqual(second.schemaEntries);
    expect(
      first.entries.map((entry) =>
        Object.fromEntries(
          Object.entries(entry).filter(([key]) => key !== 'originalOrder'),
        ),
      ),
    ).toEqual(
      second.entries.map((entry) =>
        Object.fromEntries(
          Object.entries(entry).filter(([key]) => key !== 'originalOrder'),
        ),
      ),
    );
    expect(first.entries.map(({ originalOrder }) => originalOrder)).toEqual([
      2, 1, 0, 3,
    ]);
    expect(second.entries.map(({ originalOrder }) => originalOrder)).toEqual([
      1, 2, 3, 0,
    ]);
    expect(first.schemaEntries.map((entry) => entry.archivePath)).toEqual([
      'types/Z.xsd',
      'types/a.dtd',
      'types/é.xsd',
      'types/😀.xsd',
    ]);
    expect(first.schemaEntries.map((entry) => entry.sourceOrder)).toEqual([
      0, 1, 2, 3,
    ]);
    expect(first.schemaEntries.map((entry) => entry.id)).toEqual([
      'schema-archive-entry:types%2FZ.xsd',
      'schema-archive-entry:types%2Fa.dtd',
      'schema-archive-entry:types%2F%C3%A9.xsd',
      'schema-archive-entry:types%2F%F0%9F%98%80.xsd',
    ]);
  });

  it('inventories directories, ordinary files, and macOS metadata with reasons', async () => {
    const manifest = successfulManifest(
      await discover([
        { name: 'schemas/', dir: true },
        { name: 'schemas/main.xsd', dir: false },
        { name: 'schemas/readme.txt', dir: false },
        { name: 'schemas/types.ent', dir: false },
        { name: '__MACOSX/._main.xsd', dir: false },
        { name: 'schemas/.DS_Store', dir: false },
      ]),
    );

    expect(manifest.schemaEntries).toHaveLength(1);
    expect(manifest.acceptedFileEntries).toEqual([
      {
        archivePath: 'schemas/main.xsd',
        packageRelativePath: 'main.xsd',
      },
      {
        archivePath: 'schemas/readme.txt',
        packageRelativePath: 'readme.txt',
      },
      {
        archivePath: 'schemas/types.ent',
        packageRelativePath: 'types.ent',
      },
    ]);
    expect(manifest.ignoredFileCount).toBe(4);
    expect(manifest.totalFileEntryCount).toBe(5);
    expect(manifest.entries).toHaveLength(6);
    expect(
      manifest.entries.map(({ archivePath, kind, reason }) => ({
        archivePath,
        kind,
        reason,
      })),
    ).toEqual([
      {
        archivePath: '__MACOSX/._main.xsd',
        kind: 'ignored',
        reason: 'operating-system-metadata',
      },
      {
        archivePath: 'schemas',
        kind: 'directory',
        reason: 'directory-entry',
      },
      {
        archivePath: 'schemas/.DS_Store',
        kind: 'ignored',
        reason: 'operating-system-metadata',
      },
      {
        archivePath: 'schemas/main.xsd',
        kind: 'xsd',
        reason: 'schema-source',
      },
      {
        archivePath: 'schemas/readme.txt',
        kind: 'ignored',
        reason: 'unsupported-file-type',
      },
      {
        archivePath: 'schemas/types.ent',
        kind: 'auxiliary',
        reason: 'potential-resolution-resource',
      },
    ]);
  });

  it('strips the caller local path and returns frozen plain JSON data', async () => {
    const result = await discover(
      [{ name: 'schemas/main.xsd', dir: false }],
      '  C:\\Users\\Ben\\Private\\Package.ZIP  ',
    );
    const manifest = successfulManifest(result);
    const serialized = JSON.stringify(result);

    expect(manifest.archiveFilename).toBe('Package.ZIP');
    expect(serialized).not.toContain('Users');
    expect(JSON.parse(serialized)).toEqual(result);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.schemaEntries)).toBe(true);
    expect(Object.isFrozen(manifest.schemaEntries[0])).toBe(true);
    expect(Object.isFrozen(manifest.acceptedFileEntries)).toBe(true);
    expect(Object.isFrozen(manifest.acceptedFileEntries?.[0])).toBe(true);
    expect(
      Reflect.set(
        manifest.schemaEntries[0] as unknown as Record<string, unknown>,
        'basename',
        'changed.xsd',
      ),
    ).toBe(false);
    expect(manifest.schemaEntries[0].basename).toBe('main.xsd');
    expect(serialized).not.toContain('sourceText');
    expect(serialized).not.toContain('unsafeOriginalName');
  });

  it('preserves ArrayBuffer and Uint8Array ownership even against the loader', async () => {
    for (const data of [
      new Uint8Array([1, 2, 3]),
      new Uint8Array([1, 2, 3]).buffer,
    ]) {
      const before = Array.from(
        new Uint8Array(data instanceof Uint8Array ? data.buffer : data),
      );
      const result = await discoverSchemaArchive(
        { filename: 'package.zip', data },
        {
          async loadMetadata(received) {
            const mutable =
              received instanceof Uint8Array
                ? received
                : new Uint8Array(received);
            mutable.fill(255);
            return {
              entries: [{ name: 'main.xsd', dir: false }],
            };
          },
        },
      );

      expect(result.status).toBe('success');
      expect(
        Array.from(
          new Uint8Array(data instanceof Uint8Array ? data.buffer : data),
        ),
      ).toEqual(before);
    }
  });

  it('returns deep-equal independent manifests on repeated discovery', async () => {
    const entries = [
      { name: 'schemas/a.xsd', dir: false },
      { name: 'schemas/b.dtd', dir: false },
    ] as const;
    const first = await discover(entries);
    const second = await discover(entries);

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    if (first.status === 'success' && second.status === 'success') {
      expect(first.manifest).not.toBe(second.manifest);
      expect(first.manifest.schemaEntries).not.toBe(
        second.manifest.schemaEntries,
      );
    }
  });
});

describe('schema archive discovery limits and expected failures', () => {
  it.each([MAX_SCHEMA_ARCHIVE_BYTES - 1, MAX_SCHEMA_ARCHIVE_BYTES])(
    'accepts archive byte boundary %i before metadata work',
    async (size) => {
      let loadCount = 0;
      const result = await discoverSchemaArchive(
        { filename: 'boundary.zip', data: new Uint8Array(size) },
        {
          async loadMetadata() {
            loadCount += 1;
            return { entries: [{ name: 'main.xsd', dir: false }] };
          },
        },
      );
      expect(result.status).toBe('success');
      expect(loadCount).toBe(1);
    },
  );

  it('rejects unsupported names before loading metadata', async () => {
    let loadCount = 0;
    const result = await discoverSchemaArchive(
      { filename: 'C:\\private\\schema.zip.txt', data: oneByte },
      {
        async loadMetadata() {
          loadCount += 1;
          return { entries: [] };
        },
      },
    );

    expect(loadCount).toBe(0);
    expect(result).toEqual({
      status: 'failure',
      diagnostics: [
        {
          stage: 'archive',
          code: 'unsupported-extension',
          severity: 'error',
          message: 'Choose a file with a .zip extension.',
        },
      ],
    });
    expect('manifest' in result).toBe(false);
    expect(JSON.stringify(result)).not.toContain('private');
  });

  it('rejects empty and oversized binary input before metadata loading', async () => {
    let loadCount = 0;
    const dependencies: SchemaArchiveDiscoveryDependencies = {
      async loadMetadata() {
        loadCount += 1;
        return { entries: [] };
      },
    };

    await expect(
      discoverSchemaArchive(
        { filename: 'empty.zip', data: new Uint8Array() },
        dependencies,
      ),
    ).resolves.toEqual({
      status: 'failure',
      diagnostics: [
        {
          stage: 'archive',
          code: 'empty-archive-file',
          severity: 'error',
          message: 'The selected ZIP archive is empty.',
        },
      ],
    });
    await expect(
      discoverSchemaArchive(
        {
          filename: 'large.zip',
          data: new Uint8Array(MAX_SCHEMA_ARCHIVE_BYTES + 1),
        },
        dependencies,
      ),
    ).resolves.toEqual({
      status: 'failure',
      diagnostics: [
        {
          stage: 'archive',
          code: 'archive-too-large',
          severity: 'error',
          message: 'The selected ZIP archive exceeds the 20 MiB size limit.',
        },
      ],
    });
    expect(loadCount).toBe(0);
  });

  it('rejects excessive non-directory entries including ignored files', async () => {
    const entries = Array.from(
      { length: MAX_SCHEMA_ARCHIVE_FILE_ENTRIES + 1 },
      (_, index) => ({ name: `ignored/${index}.txt`, dir: false }),
    );
    const result = await discover(entries);

    expect(result).toEqual({
      status: 'failure',
      diagnostics: [
        {
          stage: 'archive',
          code: 'too-many-file-entries',
          severity: 'error',
          message: 'The ZIP archive contains more than 1,000 files.',
        },
      ],
    });
    expect('manifest' in result).toBe(false);
  });

  it.each([
    MAX_SCHEMA_ARCHIVE_FILE_ENTRIES - 1,
    MAX_SCHEMA_ARCHIVE_FILE_ENTRIES,
  ])('accepts total file-entry boundary %i', async (count) => {
    const result = await discover([
      { name: 'main.xsd', dir: false },
      ...Array.from({ length: count - 1 }, (_, index) => ({
        name: `ignored/${index}.txt`,
        dir: false,
      })),
    ]);
    expect(result).toMatchObject({
      status: 'success',
      manifest: { totalFileEntryCount: count },
    });
  });

  it('rejects excessive schema candidates without truncation', async () => {
    const entries = Array.from(
      { length: MAX_SCHEMA_ARCHIVE_SCHEMA_FILES + 1 },
      (_, index) => ({ name: `schemas/${index}.xsd`, dir: false }),
    );
    const result = await discover(entries);

    expect(result).toEqual({
      status: 'failure',
      diagnostics: [
        {
          stage: 'archive',
          code: 'too-many-schema-files',
          severity: 'error',
          message: 'The ZIP archive contains more than 250 schema files.',
        },
      ],
    });
    expect('manifest' in result).toBe(false);
  });

  it.each([
    MAX_SCHEMA_ARCHIVE_SCHEMA_FILES - 1,
    MAX_SCHEMA_ARCHIVE_SCHEMA_FILES,
  ])('accepts schema-file boundary %i', async (count) => {
    const result = await discover(
      Array.from({ length: count }, (_, index) => ({
        name: `schemas/${index % 2 === 0 ? `${index}.xsd` : `${index}.dtd`}`,
        dir: false,
      })),
    );
    expect(result).toMatchObject({
      status: 'success',
      manifest: { schemaEntries: { length: count } },
    });
  });

  it('rejects packages without supported schema files', async () => {
    await expect(
      discover([
        { name: 'README.txt', dir: false },
        { name: 'schema.xml', dir: false },
        { name: 'types.ent', dir: false },
        { name: 'module.mod', dir: false },
      ]),
    ).resolves.toEqual({
      status: 'failure',
      diagnostics: [
        {
          stage: 'archive',
          code: 'no-schema-files',
          severity: 'error',
          message: 'The ZIP archive does not contain any .xsd or .dtd files.',
        },
      ],
    });
  });

  it('maps synchronous and asynchronous loader failures to one stable result', async () => {
    for (const loadMetadata of [
      () => {
        throw new Error('C:\\private\\secret.zip stack');
      },
      () => Promise.reject(new Error('/home/ben/secret.zip stack')),
    ]) {
      const result = await discoverSchemaArchive(
        { filename: 'package.zip', data: oneByte },
        { loadMetadata },
      );
      expect(result).toEqual({
        status: 'failure',
        diagnostics: [
          {
            stage: 'archive',
            code: 'invalid-archive',
            severity: 'error',
            message:
              'The selected file is not a readable ZIP archive or uses an unsupported ZIP feature.',
          },
        ],
      });
      expect(JSON.stringify(result)).not.toMatch(/secret|stack|private|home/u);
    }
  });
});
