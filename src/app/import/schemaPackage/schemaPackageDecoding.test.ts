import { describe, expect, it } from 'vitest';
import type { SchemaArchiveSchemaEntry } from '../schemaArchive';
import { decodeSchemaPackageSource } from './schemaPackageDecoding';

function entry(format: 'xsd' | 'dtd'): SchemaArchiveSchemaEntry {
  return {
    id: `entry-${format}`,
    archivePath: `schema.${format}`,
    packageRelativePath: `schema.${format}`,
    basename: `schema.${format}`,
    format,
    sourceOrder: 0,
  };
}

describe('schema package source decoding', () => {
  it.each([
    ['<xs:schema/>', '<xs:schema/>'],
    ['\ufeff<xs:schema/>', '<xs:schema/>'],
    [
      '<?xml version="1.0" encoding="UTF-8"?><xs:schema/>',
      '<?xml version="1.0" encoding="UTF-8"?><xs:schema/>',
    ],
    [
      "<?xml version='1.0' encoding='utf8'?><xs:schema/>",
      "<?xml version='1.0' encoding='utf8'?><xs:schema/>",
    ],
  ])('strictly decodes accepted UTF-8 XSD %#', (source, expected) => {
    const result = decodeSchemaPackageSource(
      entry('xsd'),
      'source-id',
      new TextEncoder().encode(source),
    );
    expect(result).toEqual({
      status: 'success',
      source: {
        entry: entry('xsd'),
        sourceFileId: 'source-id',
        byteLength: new TextEncoder().encode(source).byteLength,
        sourceText: expected,
      },
    });
  });

  it('rejects malformed UTF-8 without replacement characters', () => {
    const result = decodeSchemaPackageSource(
      entry('dtd'),
      'source-id',
      new Uint8Array([0xc3, 0x28]),
    );
    expect(result).toMatchObject({
      status: 'failure',
      diagnostic: {
        code: 'invalid-utf8',
        severity: 'error',
        sourceFileId: 'source-id',
      },
    });
    expect(JSON.stringify(result)).not.toContain('\ufffd');
  });

  it('rejects an explicitly unsupported XSD encoding', () => {
    const result = decodeSchemaPackageSource(
      entry('xsd'),
      'source-id',
      new TextEncoder().encode(
        '<?xml version="1.0" encoding="ISO-8859-1"?><xs:schema/>',
      ),
    );
    expect(result).toMatchObject({
      status: 'failure',
      diagnostic: { code: 'unsupported-source-encoding' },
    });
  });

  it('does not apply XML declaration encoding rules to DTD text', () => {
    expect(
      decodeSchemaPackageSource(
        entry('dtd'),
        'source-id',
        new TextEncoder().encode(
          '<?xml version="1.0" encoding="legacy"?><!ELEMENT root EMPTY>',
        ),
      ).status,
    ).toBe('success');
  });
});
