import { describe, expect, it } from 'vitest';
import type { SchemaArchiveSchemaEntry } from '../schemaArchive';
import type { SchemaPackageSourceText } from './schemaPackageDecoding';
import { selectSchemaPackageEntryRoots } from './schemaPackageEntryRoots';

function source(
  path: string,
  sourceText: string,
  format: 'dtd' | 'xsd' = 'xsd',
): SchemaPackageSourceText {
  const entry: SchemaArchiveSchemaEntry = {
    id: `entry:${path}`,
    archivePath: `project-root/${path}`,
    packageRelativePath: path,
    ...(path.includes('/')
      ? { directoryPath: path.slice(0, path.lastIndexOf('/')) }
      : {}),
    basename: path.slice(path.lastIndexOf('/') + 1),
    format,
    sourceOrder: 0,
  };
  return {
    entry,
    sourceFileId: `source:${path}`,
    byteLength: sourceText.length,
    sourceText,
  };
}

describe('schema package entry-root selection', () => {
  it('selects graph roots while keeping nested parent dependencies available', () => {
    const roots = selectSchemaPackageEntryRoots([
      source('common.xsd', '<xs:schema/>'),
      source(
        'entity.xsd',
        '<xs:schema><xs:include schemaLocation="common.xsd"/></xs:schema>',
      ),
      source(
        'entities/character.xsd',
        '<xs:schema><xs:include schemaLocation="../entity.xsd"/></xs:schema>',
      ),
    ]);

    expect(roots).toEqual([
      { format: 'xsd', entryPath: 'entities/character.xsd' },
    ]);
  });

  it('adds a deterministic representative for an include cycle', () => {
    const roots = selectSchemaPackageEntryRoots([
      source(
        'z.xsd',
        '<xs:schema><xs:include schemaLocation="a.xsd"/></xs:schema>',
      ),
      source(
        'a.xsd',
        '<xs:schema><xs:include schemaLocation="z.xsd"/></xs:schema>',
      ),
    ]);

    expect(roots).toEqual([{ format: 'xsd', entryPath: 'a.xsd' }]);
  });

  it('does not use commented or unsafe references as graph edges', () => {
    const roots = selectSchemaPackageEntryRoots([
      source(
        'a.xsd',
        '<xs:schema><!-- <xs:include schemaLocation="b.xsd"/> --><xs:include schemaLocation="../outside.xsd"/></xs:schema>',
      ),
      source('b.xsd', '<xs:schema/>'),
      source('legacy.dtd', '<!ELEMENT legacy EMPTY>', 'dtd'),
    ]);

    expect(roots).toEqual([
      { format: 'xsd', entryPath: 'a.xsd' },
      { format: 'xsd', entryPath: 'b.xsd' },
      { format: 'dtd', entryPath: 'legacy.dtd' },
    ]);
  });
});
