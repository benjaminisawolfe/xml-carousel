import { describe, expect, it } from 'vitest';
import {
  MAX_SCHEMA_ARCHIVE_PATH_CODE_POINTS,
  MAX_SCHEMA_ARCHIVE_PATH_DEPTH,
} from './schemaArchiveConstants';
import {
  canonicalizeSchemaArchivePath,
  schemaArchivePortablePathIdentity,
} from './schemaArchivePath';

describe('schema archive canonical paths', () => {
  it.each([
    ['schema.xsd', 'schema.xsd', ['schema.xsd']],
    [
      'nested/types/schema.dtd',
      'nested/types/schema.dtd',
      ['nested', 'types', 'schema.dtd'],
    ],
    [
      'nested///types//schema.xsd',
      'nested/types/schema.xsd',
      ['nested', 'types', 'schema.xsd'],
    ],
    ['./nested/./schema.xsd', 'nested/schema.xsd', ['nested', 'schema.xsd']],
    ['nested/schema.xsd/', 'nested/schema.xsd', ['nested', 'schema.xsd']],
    ['模式/型.xsd', '模式/型.xsd', ['模式', '型.xsd']],
  ])('canonicalizes safe host-independent path %#', (input, path, segments) => {
    expect(canonicalizeSchemaArchivePath(input)).toEqual({
      valid: true,
      canonicalPath: path,
      segments,
    });
  });

  it.each([
    ['/absolute.xsd', 'absolute-path'],
    ['nested\\schema.xsd', 'backslash'],
    ['C:/schema.xsd', 'drive-prefix'],
    ['./C:/schema.xsd', 'drive-prefix'],
    ['\\\\server\\share\\schema.xsd', 'backslash'],
    ['nested/../schema.xsd', 'parent-segment'],
    ['nested/\0/schema.xsd', 'nul-character'],
    ['nested/\u0001/schema.xsd', 'control-character'],
    ['nested/\u007f/schema.xsd', 'control-character'],
    ['nested/\u0080/schema.xsd', 'control-character'],
    ['nested/\u009f/schema.xsd', 'control-character'],
    ['', 'empty-path'],
    ['///', 'absolute-path'],
    ['././', 'empty-path'],
  ])('rejects unsafe path %#', (input, reason) => {
    expect(canonicalizeSchemaArchivePath(input)).toEqual({
      valid: false,
      reason,
    });
  });

  it('uses Unicode code points for the path-length boundary', () => {
    const accepted =
      '😀'.repeat(MAX_SCHEMA_ARCHIVE_PATH_CODE_POINTS - 4) + '.xsd';
    const rejected = `a${accepted}`;

    expect(canonicalizeSchemaArchivePath(accepted).valid).toBe(true);
    expect(canonicalizeSchemaArchivePath(rejected)).toEqual({
      valid: false,
      reason: 'too-long',
    });
  });

  it('counts nonempty canonical segments for the depth boundary', () => {
    const accepted = [
      ...Array.from(
        { length: MAX_SCHEMA_ARCHIVE_PATH_DEPTH - 1 },
        (_, index) => `d${index}`,
      ),
      'schema.xsd',
    ].join('/');
    const rejected = `extra/${accepted}`;

    expect(canonicalizeSchemaArchivePath(accepted).valid).toBe(true);
    expect(canonicalizeSchemaArchivePath(rejected)).toEqual({
      valid: false,
      reason: 'too-deep',
    });
  });

  it('does not apply host path semantics or mutate repeated results', () => {
    const caller = { path: 'folder//./schema.xsd/' };
    const before = { ...caller };
    const first = canonicalizeSchemaArchivePath(caller.path);
    const second = canonicalizeSchemaArchivePath(caller.path);

    expect(first).toEqual(second);
    expect(caller).toEqual(before);
    expect(first.valid && Object.isFrozen(first.segments)).toBe(true);
  });

  it('derives the separate case-folded NFKC portable identity', () => {
    expect(schemaArchivePortablePathIdentity('Types/①.XSD')).toBe(
      schemaArchivePortablePathIdentity('types/1.xsd'),
    );
  });

  it('does not percent-decode ZIP entry names', () => {
    expect(canonicalizeSchemaArchivePath('%2e%2e/schema.xsd')).toEqual({
      valid: true,
      canonicalPath: '%2e%2e/schema.xsd',
      segments: ['%2e%2e', 'schema.xsd'],
    });
    expect(canonicalizeSchemaArchivePath('%252e%252e/schema.xsd')).toEqual({
      valid: true,
      canonicalPath: '%252e%252e/schema.xsd',
      segments: ['%252e%252e', 'schema.xsd'],
    });
  });
});
