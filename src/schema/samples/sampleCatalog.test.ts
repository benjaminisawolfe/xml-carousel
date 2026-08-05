import { describe, expect, it } from 'vitest';
import { buildProjectSearchIndex, searchProjectIndex } from '../../app/search';
import { validateSchemaProject } from '../model';
import type { XsdAnnotationEntryMetadata } from '../xsd';
import { bookDtdNodeIds, importBookDtdSample } from './bookDtdProject';
import { importLibraryXsdSample } from './libraryXsdProject';
import {
  bookDtdSample,
  builtInSampleCatalog,
  libraryXsdSample,
  prepareBuiltInSample,
} from './sampleCatalog';

const sampleAssets = import.meta.glob('./assets/*', {
  eager: true,
  import: 'default',
  query: '?raw',
});

const sampleComment = `This is just a sample. Click any of the "Open" buttons above to load a file from your local hard drive. We don't store anything on the server side.`;

describe('built-in sample catalog', () => {
  it('exposes two explicit, stable, descriptive product samples', () => {
    expect(
      builtInSampleCatalog.map(
        ({ id, displayName, filename, format, description }) => ({
          id,
          displayName,
          filename,
          format,
          description,
        }),
      ),
    ).toEqual([
      {
        id: 'book-dtd',
        displayName: 'Book DTD',
        filename: 'sample.book.dtd',
        format: 'dtd',
        description:
          'Explore a familiar book structure with branches, occurrences, attributes, comments, and source.',
      },
      {
        id: 'library-xsd',
        displayName: 'Library XSD',
        filename: 'library.xsd',
        format: 'xsd',
        description:
          'Explore a namespace-aware library schema with types, references, occurrences, attributes, annotations, and enumerations.',
      },
    ]);
  });

  it('hydrates Book DTD from its real source with stable focus, source, comments, and attributes', () => {
    const { importResult } = bookDtdSample;

    expect(importResult.initialFocusNodeId).toBe(bookDtdNodeIds.book);
    expect(validateSchemaProject(importResult.project)).toEqual([]);
    expect(
      importResult.sourceMarkupByNodeId[bookDtdNodeIds.book]?.fragments,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: expect.stringContaining('<!ELEMENT book'),
        }),
        expect.objectContaining({
          text: expect.stringContaining('<!ATTLIST book'),
        }),
      ]),
    );
    expect(
      importResult.commentsByNodeId[bookDtdNodeIds.book]?.map(({ text }) =>
        text.trim(),
      ),
    ).toEqual([sampleComment]);
    expect(importResult.schemaLevelComments).toEqual([]);
    expect(bookDtdSample.source).toContain(`<!-- ${sampleComment} -->`);
    expect(
      importResult.sourceMarkupByNodeId[bookDtdNodeIds.book]?.fragments.some(
        ({ text }) => text.includes(sampleComment),
      ),
    ).toBe(true);
    expect(
      new Set(
        importResult.sourceMarkupByNodeId[bookDtdNodeIds.book]?.fragments.map(
          ({ range }) => range.sourceId,
        ),
      ),
    ).toEqual(new Set(['sample.book.dtd']));
    expect(
      searchProjectIndex(bookDtdSample.searchIndex, 'local hard drive')[0],
    ).toMatchObject({ nodeId: bookDtdNodeIds.book });
    expect(
      Object.values(importResult.dtdAttributesByNodeId).map(
        ({ ownerElementNodeId, name }) => `${ownerElementNodeId}:${name}`,
      ),
    ).toEqual(
      expect.arrayContaining([
        'dtd:element:book:isbn',
        'dtd:element:book:edition',
        'dtd:element:chapter:number',
      ]),
    );
    expect(bookDtdSample.searchIndex.documents).toHaveLength(
      importResult.project.nodes.length,
    );
  });

  it('hydrates Library XSD with namespaces, annotations, types, attributes, occurrences, derivation, and enumeration', () => {
    const { importResult } = libraryXsdSample;
    const metadata = Object.values(importResult.xsdMetadataByNodeId);
    const entries: XsdAnnotationEntryMetadata[] = [];
    for (const nodeMetadata of metadata) {
      for (const annotation of nodeMetadata.annotations ?? []) {
        entries.push(...annotation.entries);
      }
    }

    expect(validateSchemaProject(importResult.project)).toEqual([]);
    expect(importResult.project.nodes[0]?.sourceFileId).toBe('library.xsd');
    expect(
      importResult.sourceMarkupByNodeId[importResult.initialFocusNodeId],
    ).toBeDefined();
    expect(entries.some(({ kind }) => kind === 'documentation')).toBe(true);
    expect(entries.some(({ kind }) => kind === 'appInfo')).toBe(true);
    expect(
      importResult.project.nodes.some(({ kind }) => kind === 'complexType'),
    ).toBe(true);
    expect(
      importResult.project.nodes.some(({ kind }) => kind === 'simpleType'),
    ).toBe(true);
    expect(
      importResult.project.nodes.some(({ kind }) => kind === 'attribute'),
    ).toBe(true);
    expect(
      metadata.some(({ occurrence }) => occurrence?.max === 'unbounded'),
    ).toBe(true);
    expect(
      metadata.some(
        ({ complexTypeDerivation }) =>
          complexTypeDerivation?.kind === 'extension',
      ),
    ).toBe(true);
    expect(
      metadata.some(({ enumerationCount }) => enumerationCount === 3),
    ).toBe(true);
  });

  it('builds search documents for both parser-produced projects', () => {
    for (const sample of builtInSampleCatalog) {
      const input =
        sample.format === 'dtd'
          ? {
              project: sample.importResult.project,
              sourceFilename: sample.filename,
              commentsByNodeId: sample.importResult.commentsByNodeId,
              dtdAttributesByNodeId: sample.importResult.dtdAttributesByNodeId,
            }
          : {
              project: sample.importResult.project,
              sourceFilename: sample.filename,
              xsdMetadataByNodeId: sample.importResult.xsdMetadataByNodeId,
            };
      const rebuilt = buildProjectSearchIndex(input);
      expect(sample.searchIndex).toEqual(rebuilt);
      expect(rebuilt.documents.length).toBeGreaterThan(0);
    }
  });

  it('reparses product assets without graph or metadata divergence', () => {
    expect(importBookDtdSample()).toEqual(bookDtdSample.importResult);
    expect(importLibraryXsdSample()).toEqual(libraryXsdSample.importResult);
    expect(prepareBuiltInSample('book-dtd')).toEqual({
      status: 'success',
      sample: bookDtdSample,
    });
    expect(prepareBuiltInSample('library-xsd')).toEqual({
      status: 'success',
      sample: libraryXsdSample,
    });
  });

  it('uses only the renamed Book DTD product asset', () => {
    expect(sampleAssets).toHaveProperty('./assets/sample.book.dtd');
    expect(sampleAssets).not.toHaveProperty('./assets/book.dtd');
  });
});
