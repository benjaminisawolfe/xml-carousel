import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import librarySource from '../../../tests/fixtures/dtd/library.dtd?raw';
import basicXsd from '../../../tests/fixtures/xsd/basic-structure.xsd?raw';
import {
  importDtdSource,
  type SchemaSourceImportPhase,
} from '../../schema/dtd';
import { importXsdSource } from '../../schema/xsd';
import {
  importSchemaArchivePackage,
  type SchemaPackageImportProgress,
} from './schemaPackage';
import {
  deriveDtdImportOptions,
  deriveXsdImportOptions,
} from './schemaFileImportController';

async function makeZip(
  files: Readonly<Record<string, string>>,
): Promise<ArrayBuffer> {
  const archive = new JSZip();
  for (const [path, source] of Object.entries(files)) {
    archive.file(path, source, { createFolders: false });
  }
  const bytes = await archive.generateAsync({
    type: 'uint8array',
    compression: 'STORE',
  });
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

describe('DTD and XSD import progress hooks', () => {
  it.each([
    ['dtd', librarySource],
    ['xsd', basicXsd],
  ] as const)(
    'preserves deep-equal %s results when the observer is absent or present',
    (format, source) => {
      const phases: SchemaSourceImportPhase[] = [];
      const withoutObserver =
        format === 'dtd'
          ? importDtdSource(source, deriveDtdImportOptions('schema.dtd'))
          : importXsdSource(source, deriveXsdImportOptions('schema.xsd'));
      const withObserver =
        format === 'dtd'
          ? importDtdSource(source, deriveDtdImportOptions('schema.dtd'), {
              onProgress: (phase) => phases.push(phase),
            })
          : importXsdSource(source, deriveXsdImportOptions('schema.xsd'), {
              onProgress: (phase) => phases.push(phase),
            });
      expect(withObserver).toEqual(withoutObserver);
      expect(phases).toEqual(['parsing', 'building', 'finalizing']);
    },
  );

  it.each(['dtd', 'xsd'] as const)(
    'does not let a throwing %s observer corrupt a successful import',
    (format) => {
      const importResult =
        format === 'dtd'
          ? importDtdSource(
              librarySource,
              deriveDtdImportOptions('schema.dtd'),
              {
                onProgress: () => {
                  throw new Error('observer detail');
                },
              },
            )
          : importXsdSource(basicXsd, deriveXsdImportOptions('schema.xsd'), {
              onProgress: () => {
                throw new Error('observer detail');
              },
            });
      expect(importResult.status).toBe('success');
    },
  );

  it.each([
    ['dtd', '<!ELEMENT broken ('],
    ['xsd', '<xs:schema>'],
  ] as const)('stops %s progress after parse failure', (format, source) => {
    const phases: SchemaSourceImportPhase[] = [];
    const result =
      format === 'dtd'
        ? importDtdSource(source, deriveDtdImportOptions('broken.dtd'), {
            onProgress: (phase) => phases.push(phase),
          })
        : importXsdSource(source, deriveXsdImportOptions('broken.xsd'), {
            onProgress: (phase) => phases.push(phase),
          });
    expect(result.status).toBe('failure');
    expect(phases).toEqual(['parsing']);
  });
});

describe('schema package progress hook', () => {
  it('preserves the ordinary result and reports only manifest schema entries in order', async () => {
    const data = await makeZip({
      'schemas/b.dtd': '<!ELEMENT b EMPTY>',
      'schemas/a.xsd':
        '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="a" type="xs:string"/></xs:schema>',
      'schemas/ignored.txt': 'ignored',
    });
    const input = { filename: 'schemas.zip', data };
    const ordinary = await importSchemaArchivePackage(input);
    const progress: SchemaPackageImportProgress[] = [];
    const observed = await importSchemaArchivePackage(input, undefined, {
      onProgress: (value) => progress.push(value),
    });
    expect(observed).toEqual(ordinary);
    expect(progress).toEqual([
      { phase: 'discovering-package' },
      { phase: 'reading-package' },
      {
        phase: 'importing-package-source',
        current: 1,
        total: 2,
        currentSourceFilename: 'a.xsd',
      },
      {
        phase: 'importing-package-source',
        current: 2,
        total: 2,
        currentSourceFilename: 'b.dtd',
      },
      { phase: 'resolving-package' },
      { phase: 'finalizing' },
    ]);
  });

  it('does not let a throwing package observer corrupt the result', async () => {
    const data = await makeZip({ 'schema.dtd': '<!ELEMENT schema EMPTY>' });
    const result = await importSchemaArchivePackage(
      { filename: 'schema.zip', data },
      undefined,
      {
        onProgress: () => {
          throw new Error('observer detail');
        },
      },
    );
    expect(result.status).toBe('success');
  });

  it('stops after the truthful package failure stage', async () => {
    const progress: SchemaPackageImportProgress[] = [];
    const result = await importSchemaArchivePackage(
      { filename: 'invalid.zip', data: new ArrayBuffer(2) },
      undefined,
      { onProgress: (value) => progress.push(value) },
    );
    expect(result.status).toBe('failure');
    expect(progress).toEqual([{ phase: 'discovering-package' }]);
  });
});
