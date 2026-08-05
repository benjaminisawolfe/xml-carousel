import {
  buildProjectSearchIndex,
  type ProjectSearchIndex,
} from '../../app/search';
import type { DtdImportResult } from '../dtd';
import type { SchemaNodeId } from '../model';
import type { XsdImportResult } from '../xsd';
import {
  bookDtdImportResult,
  bookDtdSampleDefinition,
  importBookDtdSample,
} from './bookDtdProject';
import {
  importLibraryXsdSample,
  libraryXsdImportResult,
  libraryXsdSampleDefinition,
} from './libraryXsdProject';

export type BuiltInSampleId =
  typeof bookDtdSampleDefinition.id | typeof libraryXsdSampleDefinition.id;
export type BuiltInSampleFormat = 'dtd' | 'xsd';
export type SuccessfulDtdImport = Extract<
  DtdImportResult,
  { status: 'success' }
>;
export type SuccessfulXsdImport = Extract<
  XsdImportResult,
  { status: 'success' }
>;

interface BuiltInSampleBase {
  readonly id: BuiltInSampleId;
  readonly displayName: string;
  readonly filename: string;
  readonly format: BuiltInSampleFormat;
  readonly description: string;
  readonly source: string;
  readonly initialFocusNodeId: SchemaNodeId;
  readonly searchIndex: ProjectSearchIndex;
}

export interface BuiltInDtdSample extends BuiltInSampleBase {
  readonly format: 'dtd';
  readonly importResult: SuccessfulDtdImport;
}

export interface BuiltInXsdSample extends BuiltInSampleBase {
  readonly format: 'xsd';
  readonly importResult: SuccessfulXsdImport;
}

export type BuiltInSample = BuiltInDtdSample | BuiltInXsdSample;

export type BuiltInSamplePreparation =
  | { readonly status: 'success'; readonly sample: BuiltInSample }
  | {
      readonly status: 'failure';
      readonly message: string;
    };

type DtdSamplePreparation =
  | { readonly status: 'success'; readonly sample: BuiltInDtdSample }
  | { readonly status: 'failure'; readonly message: string };

type XsdSamplePreparation =
  | { readonly status: 'success'; readonly sample: BuiltInXsdSample }
  | { readonly status: 'failure'; readonly message: string };

function buildSearchIndex(
  result: SuccessfulDtdImport | SuccessfulXsdImport,
  filename: string,
): ProjectSearchIndex {
  return buildProjectSearchIndex({
    project: result.project,
    sourceFilename: filename,
    ...(result.status === 'success' && 'xsdMetadataByNodeId' in result
      ? { xsdMetadataByNodeId: result.xsdMetadataByNodeId }
      : {}),
    ...(result.status === 'success' && 'commentsByNodeId' in result
      ? {
          commentsByNodeId: result.commentsByNodeId,
          dtdAttributesByNodeId: result.dtdAttributesByNodeId,
        }
      : {}),
  });
}

function createDtdSample(result: DtdImportResult): DtdSamplePreparation {
  if (result.status === 'failure') {
    return {
      status: 'failure',
      message: 'The built-in Book DTD sample could not be loaded.',
    };
  }
  if (
    result.initialFocusNodeId !== bookDtdSampleDefinition.initialFocusNodeId
  ) {
    return {
      status: 'failure',
      message: 'The built-in Book DTD sample has no valid starting node.',
    };
  }
  return {
    status: 'success',
    sample: {
      ...bookDtdSampleDefinition,
      initialFocusNodeId: result.initialFocusNodeId,
      importResult: result,
      searchIndex: buildSearchIndex(result, bookDtdSampleDefinition.filename),
    },
  };
}

function createXsdSample(result: XsdImportResult): XsdSamplePreparation {
  if (result.status === 'failure') {
    return {
      status: 'failure',
      message: 'The built-in Library XSD sample could not be loaded.',
    };
  }
  return {
    status: 'success',
    sample: {
      ...libraryXsdSampleDefinition,
      initialFocusNodeId: result.initialFocusNodeId,
      importResult: result,
      searchIndex: buildSearchIndex(
        result,
        libraryXsdSampleDefinition.filename,
      ),
    },
  };
}

export function prepareBuiltInSample(
  sampleId: BuiltInSampleId,
): BuiltInSamplePreparation {
  return sampleId === bookDtdSampleDefinition.id
    ? createDtdSample(importBookDtdSample())
    : createXsdSample(importLibraryXsdSample());
}

const preparedBook = createDtdSample(bookDtdImportResult);
const preparedLibrary = createXsdSample(libraryXsdImportResult);

if (preparedBook.status === 'failure' || preparedLibrary.status === 'failure') {
  throw new Error('The built-in sample catalog could not be prepared.');
}

export const builtInSampleCatalog = [
  preparedBook.sample,
  preparedLibrary.sample,
] as const satisfies readonly BuiltInSample[];

export const bookDtdSample = preparedBook.sample;
export const libraryXsdSample = preparedLibrary.sample;
