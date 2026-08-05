import { importXsdSource, type XsdImportResult } from '../xsd';
import libraryXsdSource from './assets/library.xsd?raw';

export const libraryXsdSampleDefinition = {
  id: 'library-xsd',
  displayName: 'Library XSD',
  filename: 'library.xsd',
  format: 'xsd',
  description:
    'Explore a namespace-aware library schema with types, references, occurrences, attributes, annotations, and enumerations.',
  source: libraryXsdSource,
  projectId: 'sample:library-xsd',
  projectDisplayName: 'Library XSD sample',
} as const;

export function importLibraryXsdSample(): XsdImportResult {
  return importXsdSource(libraryXsdSampleDefinition.source, {
    projectId: libraryXsdSampleDefinition.projectId,
    displayName: libraryXsdSampleDefinition.projectDisplayName,
    sourceFileId: libraryXsdSampleDefinition.filename,
    sourceFilename: libraryXsdSampleDefinition.filename,
  });
}

export const libraryXsdImportResult = importLibraryXsdSample();

if (libraryXsdImportResult.status !== 'success') {
  throw new Error('The built-in Library XSD sample could not be prepared.');
}
