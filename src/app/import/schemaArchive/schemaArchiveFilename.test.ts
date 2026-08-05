import { describe, expect, it } from 'vitest';
import {
  isSchemaArchiveFilename,
  normalizeSchemaArchiveFilename,
} from './schemaArchiveFilename';

describe('schema archive filename helpers', () => {
  it.each([
    ['schemas.zip', 'schemas.zip', true],
    ['SCHEMAS.ZIP', 'SCHEMAS.ZIP', true],
    ['\u2003 schemas.zip \u00a0', 'schemas.zip', true],
    ['C:\\Users\\Ben\\schemas.zip', 'schemas.zip', true],
    ['/home/ben/schemas.zip', 'schemas.zip', true],
    ['C:\\mixed/path\\schemas.ZIP', 'schemas.ZIP', true],
    ['schemas', 'schemas', false],
    ['schemas.zip.txt', 'schemas.zip.txt', false],
    ['', '', false],
    [' \u2003 ', '', false],
    ['C:\\schemas\\', '', false],
    ['/schemas/', '', false],
  ])(
    'normalizes %# without exposing directory prefixes',
    (input, normalized, accepted) => {
      expect(normalizeSchemaArchiveFilename(input)).toBe(normalized);
      expect(isSchemaArchiveFilename(input)).toBe(accepted);
    },
  );

  it('does not modify the caller-owned filename value', () => {
    const caller = { filename: '  C:\\private\\Package.ZIP  ' };
    const before = { ...caller };

    normalizeSchemaArchiveFilename(caller.filename);
    isSchemaArchiveFilename(caller.filename);

    expect(caller).toEqual(before);
  });
});
