import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

export const xmltestArchiveIdentity = Object.freeze({
  file: 'tests/fixtures/third-party/james-clark-xmltest/xmltest.zip',
  rawBytes: 107_060,
  sha256: 'a919d7142fe6f72af51fc796b4df40732f385c9eb313b8993c6d39cc92acc410',
  noticePath: 'xmltest/readme.html',
  noticeRawBytes: 1_952,
  noticeSha256:
    '177d19f580f2ca934e32de21116a5aa3ff48f381591c23991039aa1a1ed2e981',
});

export const xmltestSelectedEntries = Object.freeze([
  Object.freeze({
    manifestPath: 'xmltest/invalid/not-sa/022.xml',
    archivePath: 'xmltest/valid/not-sa/022.xml',
    rawBytes: 46,
    compressedBytes: 44,
    crc32: '13a0e13b',
    modified: '1998-01-24T16:03:00.000Z',
    compression: 'deflate',
    sha256: '5b45d40b6e7a1755304337a527d68d9abfee729beec72bc2a31de92c9566f508',
  }),
  Object.freeze({
    manifestPath: 'xmltest/invalid/not-sa/022.ent',
    archivePath: 'xmltest/valid/not-sa/022.ent',
    rawBytes: 94,
    compressedBytes: 83,
    crc32: '79c258f5',
    modified: '1998-01-24T15:59:36.000Z',
    compression: 'deflate',
    sha256: '6fc84806256227c30192c09bad189cd9059d9835177565eee909f69eb0b86275',
  }),
]);

/**
 * JSZip keeps audited ZIP metadata on an internal object that its public type
 * declarations do not expose.
 *
 * @typedef {import('jszip').JSZipObject & {
 *   _data?: {
 *     crc32?: number,
 *     compressedSize?: number,
 *     compression?: { magic?: string },
 *   },
 * }} AuditedZipEntry
 */

/** @param {import('node:crypto').BinaryLike} bytes */
function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** @param {AuditedZipEntry} entry */
function crc32(entry) {
  return ((entry?._data?.crc32 ?? 0) >>> 0).toString(16).padStart(8, '0');
}

/** @param {AuditedZipEntry} entry */
function compressionName(entry) {
  return entry?._data?.compression?.magic === '\x08\x00' ? 'deflate' : 'store';
}

/** @param {JSZip} zip */
function assertSafeArchivePaths(zip) {
  for (const entry of Object.values(zip.files)) {
    const name = entry.unsafeOriginalName ?? entry.name;
    const segments = name.split('/');
    if (
      name.includes('\\') ||
      name.startsWith('/') ||
      /^[a-z]:/iu.test(name) ||
      segments.some((segment) => segment === '..')
    ) {
      throw new Error(`xmltest.zip contains an unsafe entry path: ${name}`);
    }
  }
}

export async function loadXmltestArchiveFixture(
  archivePath = path.join(
    repositoryRoot,
    ...xmltestArchiveIdentity.file.split('/'),
  ),
) {
  const archiveBytes = await readFile(archivePath);
  if (archiveBytes.length !== xmltestArchiveIdentity.rawBytes) {
    throw new Error(
      `xmltest.zip size mismatch: expected ${xmltestArchiveIdentity.rawBytes}, found ${archiveBytes.length}.`,
    );
  }
  const archiveHash = sha256(archiveBytes);
  if (archiveHash !== xmltestArchiveIdentity.sha256) {
    throw new Error(
      `xmltest.zip SHA-256 mismatch: expected ${xmltestArchiveIdentity.sha256}, found ${archiveHash}.`,
    );
  }

  const zip = await JSZip.loadAsync(archiveBytes, { checkCRC32: true });
  assertSafeArchivePaths(zip);
  const noticeEntry = zip.file(xmltestArchiveIdentity.noticePath);
  if (!noticeEntry) {
    throw new Error(
      `xmltest.zip is missing ${xmltestArchiveIdentity.noticePath}.`,
    );
  }
  const noticeBytes = await noticeEntry.async('uint8array');
  const notice = new TextDecoder('windows-1252').decode(noticeBytes);
  const normalizedNotice = notice.replace(/\s+/gu, ' ');
  if (
    noticeBytes.length !== xmltestArchiveIdentity.noticeRawBytes ||
    sha256(noticeBytes) !== xmltestArchiveIdentity.noticeSha256 ||
    !normalizedNotice.includes('Copyright (C) 1998 James Clark.') ||
    !normalizedNotice.includes('provided that no modifications of any kind') ||
    !normalizedNotice.includes(
      'permission to distribute the collection in any other form is not granted',
    )
  ) {
    throw new Error(
      'xmltest.zip readme.html ownership or redistribution notice differs.',
    );
  }

  /** @type {Map<string, Uint8Array>} */
  const files = new Map();
  for (const expected of xmltestSelectedEntries) {
    const entry = zip.file(expected.archivePath);
    if (!entry) {
      throw new Error(`xmltest.zip is missing ${expected.archivePath}.`);
    }
    const bytes = await entry.async('uint8array');
    const auditedEntry = /** @type {AuditedZipEntry} */ (entry);
    const actual = {
      rawBytes: bytes.length,
      compressedBytes: auditedEntry._data?.compressedSize,
      crc32: crc32(auditedEntry),
      modified: entry.date.toISOString(),
      compression: compressionName(auditedEntry),
      sha256: sha256(bytes),
    };
    const comparisons = [
      ['rawBytes', actual.rawBytes, expected.rawBytes],
      ['compressedBytes', actual.compressedBytes, expected.compressedBytes],
      ['crc32', actual.crc32, expected.crc32],
      ['modified', actual.modified, expected.modified],
      ['compression', actual.compression, expected.compression],
      ['sha256', actual.sha256, expected.sha256],
    ];
    for (const [field, observed, wanted] of comparisons) {
      if (observed !== wanted) {
        throw new Error(
          `${expected.archivePath} ${field} mismatch: expected ${wanted}, found ${observed}.`,
        );
      }
    }
    files.set(expected.manifestPath, bytes);
  }

  return Object.freeze({
    archivePath,
    archiveBytes: archiveBytes.length,
    archiveSha256: archiveHash,
    notice,
    files,
  });
}
