import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifyReleaseIntegrity } from '../../scripts/verify-release-integrity.mjs';
import {
  loadXmltestArchiveFixture,
  xmltestArchiveIdentity,
  xmltestSelectedEntries,
} from '../../scripts/xmltest-archive-fixture.mjs';

describe('Task 13.19 release and licensing integrity', () => {
  it('loads the selected James Clark case directly from the unchanged archive', async () => {
    const fixture = await loadXmltestArchiveFixture();

    expect(fixture.archiveBytes).toBe(xmltestArchiveIdentity.rawBytes);
    expect(fixture.archiveSha256).toBe(xmltestArchiveIdentity.sha256);
    expect(fixture.notice).toContain('Copyright (C) 1998 James Clark.');
    expect(fixture.notice.replace(/\s+/gu, ' ')).toContain(
      'permission to distribute the collection in any other form is not granted',
    );
    expect([...fixture.files.keys()].sort()).toEqual(
      xmltestSelectedEntries.map(({ manifestPath }) => manifestPath).sort(),
    );
    for (const entry of xmltestSelectedEntries) {
      expect(fixture.files.get(entry.manifestPath)).toHaveLength(
        entry.rawBytes,
      );
    }
  });

  it('rejects changed archive bytes and leaves no repository extraction', async () => {
    const temporaryDirectory = await mkdtemp(
      path.join(tmpdir(), 'xml-carousel-xmltest-integrity-'),
    );
    const changedArchive = path.join(temporaryDirectory, 'xmltest.zip');
    try {
      const original = await readFile(
        path.resolve(xmltestArchiveIdentity.file),
      );
      await writeFile(
        changedArchive,
        Buffer.concat([original, Buffer.from([0])]),
      );
      await expect(loadXmltestArchiveFixture(changedArchive)).rejects.toThrow(
        'xmltest.zip size mismatch',
      );
      await expect(
        readFile(
          path.resolve(
            'tests/fixtures/w3c-xmlconf-20130923/ci-corpus/xmltest/invalid/not-sa/022.xml',
          ),
        ),
      ).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('passes the canonical documentation, attribution, and packaging contract', async () => {
    await expect(verifyReleaseIntegrity()).resolves.toEqual({
      bundledJavaScriptComponents: 16,
      archiveBackedCase: 'invalid-not-sa-022',
      archiveEntries: 2,
    });
  });
});
