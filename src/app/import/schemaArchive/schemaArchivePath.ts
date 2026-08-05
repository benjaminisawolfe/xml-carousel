import {
  MAX_SCHEMA_ARCHIVE_PATH_CODE_POINTS,
  MAX_SCHEMA_ARCHIVE_PATH_DEPTH,
} from './schemaArchiveConstants';
import type { CanonicalArchivePathResult } from './schemaArchiveTypes';

const DRIVE_PREFIX_PATTERN = /^[A-Za-z]:/u;

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0)!;
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
  });
}

export function canonicalizeSchemaArchivePath(
  archivePath: string,
): CanonicalArchivePathResult {
  if (archivePath.includes('\0')) {
    return { valid: false, reason: 'nul-character' };
  }
  if (containsControlCharacter(archivePath)) {
    return { valid: false, reason: 'control-character' };
  }
  if (archivePath.includes('\\')) {
    return { valid: false, reason: 'backslash' };
  }
  if (archivePath.startsWith('/')) {
    return { valid: false, reason: 'absolute-path' };
  }
  if (DRIVE_PREFIX_PATTERN.test(archivePath)) {
    return { valid: false, reason: 'drive-prefix' };
  }

  const segments: string[] = [];
  for (const segment of archivePath.split('/')) {
    if (segment.length === 0 || segment === '.') continue;
    if (segment === '..') {
      return { valid: false, reason: 'parent-segment' };
    }
    segments.push(segment);
  }

  if (segments.length === 0) {
    return { valid: false, reason: 'empty-path' };
  }
  if (DRIVE_PREFIX_PATTERN.test(segments[0])) {
    return { valid: false, reason: 'drive-prefix' };
  }

  const canonicalPath = segments.join('/');
  if (Array.from(canonicalPath).length > MAX_SCHEMA_ARCHIVE_PATH_CODE_POINTS) {
    return { valid: false, reason: 'too-long' };
  }
  if (segments.length > MAX_SCHEMA_ARCHIVE_PATH_DEPTH) {
    return { valid: false, reason: 'too-deep' };
  }

  return {
    valid: true,
    canonicalPath,
    segments: Object.freeze([...segments]),
  };
}

export function schemaArchivePortablePathIdentity(
  canonicalPath: string,
): string {
  return canonicalPath.normalize('NFKC').toLowerCase();
}
