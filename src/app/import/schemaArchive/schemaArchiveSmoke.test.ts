import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { discoverSchemaArchive } from './discoverSchemaArchive';

describe('schema archive metadata performance smoke', () => {
  it('discovers 500 generated non-directory entries deterministically', async () => {
    const archive = new JSZip();
    for (let index = 0; index < 200; index += 1) {
      const extension = index % 2 === 0 ? 'xsd' : 'dtd';
      archive.file(
        `package/schemas/group-${index % 10}/schema-${String(index).padStart(3, '0')}.${extension}`,
        '',
        { createFolders: false },
      );
    }
    for (let index = 0; index < 300; index += 1) {
      archive.file(
        `package/resources/group-${index % 10}/resource-${String(index).padStart(3, '0')}.txt`,
        '',
        { createFolders: false },
      );
    }
    const bytes = await archive.generateAsync({
      type: 'uint8array',
      compression: 'STORE',
    });

    const startedAt = performance.now();
    const first = await discoverSchemaArchive({
      filename: 'smoke.zip',
      data: bytes,
    });
    const elapsedMilliseconds = performance.now() - startedAt;
    const second = await discoverSchemaArchive({
      filename: 'smoke.zip',
      data: bytes,
    });

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      status: 'success',
      manifest: {
        commonRootDirectory: 'package/schemas',
        xsdCount: 100,
        dtdCount: 100,
        ignoredFileCount: 300,
        totalFileEntryCount: 500,
      },
    });
    if (first.status === 'success') {
      expect(first.manifest.schemaEntries).toHaveLength(200);
      expect(first.manifest.entries).toHaveLength(500);
      expect(
        first.manifest.schemaEntries.map((entry) => entry.sourceOrder),
      ).toEqual(Array.from({ length: 200 }, (_, index) => index));
    }
    expect(elapsedMilliseconds).toBeGreaterThanOrEqual(0);
    console.info(
      `Task 8.1 500-entry metadata smoke: ${elapsedMilliseconds.toFixed(2)} ms`,
    );
  });
});
