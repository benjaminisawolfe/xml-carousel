import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import discoverySource from './discoverSchemaArchive.ts?raw';
import loaderSource from './jsZipMetadataLoader.ts?raw';
import { discoverSchemaArchive } from './discoverSchemaArchive';
import { loadJsZipMetadata } from './jsZipMetadataLoader';

async function generateZip(
  configure: (archive: JSZip) => void,
): Promise<Uint8Array> {
  const archive = new JSZip();
  configure(archive);
  return archive.generateAsync({
    type: 'uint8array',
    compression: 'STORE',
  });
}

describe('real JSZip metadata adapter', () => {
  it('loads preserved nested metadata without synthesizing directories', async () => {
    const bytes = await generateZip((archive) => {
      archive.file('nested/Schema.XSD', '<schema/>', {
        createFolders: false,
      });
      archive.file('root.dtd', '<!ELEMENT root EMPTY>');
    });

    const loaded = await loadJsZipMetadata(bytes);

    expect(loaded.entries).toEqual([
      {
        name: 'nested/Schema.XSD',
        unsafeOriginalName: 'nested/Schema.XSD',
        dir: false,
        uncompressedByteLength: 9,
        compressedByteLength: 9,
      },
      {
        name: 'root.dtd',
        unsafeOriginalName: 'root.dtd',
        dir: false,
        uncompressedByteLength: 21,
        compressedByteLength: 21,
      },
    ]);
  });

  it('retains explicit directories while createFolders remains disabled', async () => {
    const bytes = await generateZip((archive) => {
      archive.folder('explicit');
      archive.file('explicit/schema.xsd', '', { createFolders: false });
    });

    const loaded = await loadJsZipMetadata(bytes);

    expect(loaded.entries.map(({ name, dir }) => ({ name, dir }))).toEqual([
      { name: 'explicit/', dir: true },
      { name: 'explicit/schema.xsd', dir: false },
    ]);
  });

  it('discovers a real valid ZIP and rejects invalid bytes without throwing', async () => {
    const bytes = await generateZip((archive) => {
      archive.file('schemas/a.xsd', 'content deliberately remains unread');
    });

    await expect(
      discoverSchemaArchive({ filename: 'package.zip', data: bytes }),
    ).resolves.toMatchObject({
      status: 'success',
      manifest: {
        schemaEntries: [{ archivePath: 'schemas/a.xsd' }],
      },
    });
    await expect(
      discoverSchemaArchive({
        filename: 'invalid.zip',
        data: new Uint8Array([1, 2, 3]),
      }),
    ).resolves.toEqual({
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
  });

  it('rejects a real zip-slip name through unsafeOriginalName', async () => {
    const bytes = await generateZip((archive) => {
      archive.file('../evil.xsd', 'not extracted', {
        createFolders: false,
      });
    });

    await expect(
      discoverSchemaArchive({ filename: 'unsafe.zip', data: bytes }),
    ).resolves.toEqual({
      status: 'failure',
      diagnostics: [
        {
          stage: 'archive',
          code: 'unsafe-entry-path',
          severity: 'error',
          message: 'The ZIP archive contains an unsafe entry path.',
          entryPath: 'evil.xsd',
        },
      ],
    });
  });

  it('keeps production discovery metadata-only', () => {
    const source = `${loaderSource}\n${discoverySource}`;
    expect(loaderSource).toContain('checkCRC32: false');
    expect(loaderSource).toContain('createFolders: false');
    for (const prohibited of [
      '.async(',
      'internalStream',
      'generateAsync(',
      "async('string')",
      'async("string")',
      "async('uint8array')",
      'async("uint8array")',
      'node:fs',
      'writeFile',
      'FileReader',
      'showOpenFilePicker',
      'importDtdSource',
      'importXsdSource',
    ]) {
      expect(source).not.toContain(prohibited);
    }
  });
});
