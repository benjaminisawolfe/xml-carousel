import { describe, expect, it } from 'vitest';
import {
  MAX_SCHEMA_ARCHIVE_PATH_CODE_POINTS,
  MAX_SCHEMA_ARCHIVE_PATH_DEPTH,
} from './schemaArchiveConstants';
import { discoverSchemaArchive } from './discoverSchemaArchive';
import type {
  LoadedArchiveEntryMetadata,
  SchemaArchiveDiscoveryResult,
} from './schemaArchiveTypes';

async function discover(
  entries: readonly LoadedArchiveEntryMetadata[],
): Promise<SchemaArchiveDiscoveryResult> {
  return discoverSchemaArchive(
    { filename: 'package.zip', data: new Uint8Array([1]) },
    {
      async loadMetadata() {
        return { entries };
      },
    },
  );
}

describe('schema archive entry-path security', () => {
  it.each([
    ['../evil.xsd', 'unsafe-entry-path'],
    ['/absolute.xsd', 'unsafe-entry-path'],
    ['C:/drive.xsd', 'unsafe-entry-path'],
    ['nested\\backslash.xsd', 'unsafe-entry-path'],
    ['nul\0name.xsd', 'unsafe-entry-path'],
    [
      `${'a'.repeat(MAX_SCHEMA_ARCHIVE_PATH_CODE_POINTS - 3)}.xsd`,
      'entry-path-too-long',
    ],
    [
      `${Array.from(
        { length: MAX_SCHEMA_ARCHIVE_PATH_DEPTH },
        (_, index) => `d${index}`,
      ).join('/')}/schema.xsd`,
      'entry-path-too-deep',
    ],
  ])('rejects unsafe or bounded path %#', async (name, code) => {
    const result = await discover([{ name, dir: false }]);

    expect(result).toMatchObject({
      status: 'failure',
      diagnostics: [{ code }],
    });
    expect('manifest' in result).toBe(false);
  });

  it('accepts benign repeated separators and dot segments canonically', async () => {
    const result = await discover([
      {
        name: 'schemas///./types//main.xsd/',
        unsafeOriginalName: 'schemas///./types//main.xsd/',
        dir: false,
      },
    ]);

    expect(result).toMatchObject({
      status: 'success',
      manifest: {
        schemaEntries: [
          {
            archivePath: 'schemas/types/main.xsd',
            packageRelativePath: 'main.xsd',
          },
        ],
      },
    });
  });

  it('rejects a material JSZip sanitized-name mismatch', async () => {
    const result = await discover([
      {
        name: 'safe/evil.xsd',
        unsafeOriginalName: '../safe/evil.xsd',
        dir: false,
      },
    ]);

    expect(result).toEqual({
      status: 'failure',
      diagnostics: [
        {
          stage: 'archive',
          code: 'unsafe-entry-path',
          severity: 'error',
          message: 'The ZIP archive contains an unsafe entry path.',
          entryPath: 'safe/evil.xsd',
        },
      ],
    });
  });

  it.each([
    [
      [
        { name: 'Types/Base.xsd', dir: false },
        { name: 'types/base.XSD', dir: false },
      ],
      'Types/Base.xsd',
      'types/base.XSD',
    ],
    [
      [
        { name: 'types/①.xsd', dir: false },
        { name: 'types/1.xsd', dir: false },
      ],
      'types/1.xsd',
      'types/①.xsd',
    ],
    [
      [
        { name: 'Types/①.xsd', dir: false },
        { name: 'types/1.XSD', dir: false },
      ],
      'Types/①.xsd',
      'types/1.XSD',
    ],
  ])(
    'rejects portable schema path collision %# and identifies both safe paths',
    async (entries, first, second) => {
      const result = await discover(entries);
      expect(result).toEqual({
        status: 'failure',
        diagnostics: [
          {
            stage: 'archive',
            code: 'duplicate-schema-path',
            severity: 'error',
            message: `The ZIP archive contains schema paths that collide on portable file systems: "${first}" and "${second}".`,
            entryPath: first,
          },
        ],
      });
    },
  );

  it('does not apply portable collision rejection to ignored files', async () => {
    const result = await discover([
      { name: 'main.xsd', dir: false },
      { name: 'Docs/README.txt', dir: false },
      { name: 'docs/readme.TXT', dir: false },
    ]);

    expect(result).toMatchObject({
      status: 'success',
      manifest: {
        ignoredFileCount: 2,
        totalFileEntryCount: 3,
      },
    });
  });

  it('validates explicit directory paths before ignoring directories', async () => {
    const result = await discover([
      { name: '../unsafe/', dir: true },
      { name: 'main.xsd', dir: false },
    ]);

    expect(result).toMatchObject({
      status: 'failure',
      diagnostics: [{ code: 'unsafe-entry-path' }],
    });
  });
});

describe('schema archive diagnostic contracts', () => {
  it('uses exact stable limit and unsafe-path messages', async () => {
    const tooLong = `${'x'.repeat(
      MAX_SCHEMA_ARCHIVE_PATH_CODE_POINTS - 3,
    )}.xsd`;
    const tooDeep = `${Array.from(
      { length: MAX_SCHEMA_ARCHIVE_PATH_DEPTH },
      (_, index) => `d${index}`,
    ).join('/')}/main.xsd`;
    const result = await discover([
      {
        name: 'safe/deep.xsd',
        unsafeOriginalName: '../safe/deep.xsd',
        dir: false,
      },
      { name: tooLong, dir: false },
      { name: tooDeep, dir: false },
    ]);

    expect(result).toEqual({
      status: 'failure',
      diagnostics: [
        {
          stage: 'archive',
          code: 'entry-path-too-deep',
          severity: 'error',
          message: `The ZIP archive contains an entry path deeper than ${MAX_SCHEMA_ARCHIVE_PATH_DEPTH} segments.`,
        },
        {
          stage: 'archive',
          code: 'entry-path-too-long',
          severity: 'error',
          message: `The ZIP archive contains an entry path longer than ${MAX_SCHEMA_ARCHIVE_PATH_CODE_POINTS} Unicode code points.`,
        },
        {
          stage: 'archive',
          code: 'unsafe-entry-path',
          severity: 'error',
          message: 'The ZIP archive contains an unsafe entry path.',
          entryPath: 'safe/deep.xsd',
        },
      ],
    });
  });

  it('orders diagnostics deterministically despite metadata order', async () => {
    const entries = [
      {
        name: 'z/safe.xsd',
        unsafeOriginalName: '../z/safe.xsd',
        dir: false,
      },
      {
        name: 'a/safe.xsd',
        unsafeOriginalName: '../a/safe.xsd',
        dir: false,
      },
      {
        name: 'm/safe.xsd',
        unsafeOriginalName: '../m/safe.xsd',
        dir: false,
      },
    ] as const;

    const first = await discover(entries);
    const second = await discover([...entries].reverse());

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      status: 'failure',
      diagnostics: [
        { entryPath: 'a/safe.xsd' },
        { entryPath: 'm/safe.xsd' },
        { entryPath: 'z/safe.xsd' },
      ],
    });
  });

  it('retains every deterministic archive problem', async () => {
    const diagnosticCount = 60;
    const entries = Array.from({ length: diagnosticCount }, (_, index) => ({
      name: `safe/${String(index).padStart(3, '0')}.xsd`,
      unsafeOriginalName: `../safe/${String(index).padStart(3, '0')}.xsd`,
      dir: false,
    }));
    const result = await discover([...entries].reverse());

    expect(result.status).toBe('failure');
    if (result.status === 'failure') {
      expect(result.diagnostics).toHaveLength(diagnosticCount);
      expect(result.diagnostics[0].entryPath).toBe('safe/000.xsd');
      expect(result.diagnostics[diagnosticCount - 1].entryPath).toBe(
        'safe/059.xsd',
      );
      expect(
        result.diagnostics.every((diagnostic) => Object.isFrozen(diagnostic)),
      ).toBe(true);
    }
  });

  it('never echoes raw control-character names, stacks, or local paths', async () => {
    const result = await discover([
      { name: 'C:\\private\\bad\u0001.xsd', dir: false },
      { name: 'main.xsd', dir: false },
    ]);
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      status: 'failure',
      diagnostics: [
        {
          stage: 'archive',
          severity: 'error',
          code: 'unsafe-entry-path',
        },
      ],
    });
    expect(serialized).not.toContain('private');
    expect(serialized).not.toContain('bad');
    expect(serialized).not.toContain('stack');
    expect(serialized).not.toContain('\\u0001');
  });
});
