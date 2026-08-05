import { importDtdSource, type DtdImportResult } from '../dtd';
import bookDtdSource from './assets/sample.book.dtd?raw';

export const bookDtdNodeIds = {
  book: 'dtd:element:book',
  frontMatter: 'dtd:element:front.matter',
  bookContent: 'dtd:element:book.content',
  index: 'dtd:element:index',
  titlePage: 'dtd:element:title.page',
  preface: 'dtd:element:preface',
  chapter: 'dtd:element:chapter',
  title: 'dtd:element:title',
  subtitle: 'dtd:element:subtitle',
  author: 'dtd:element:author',
  epigraph: 'dtd:element:epigraph',
  section: 'dtd:element:section',
  figure: 'dtd:element:figure',
  note: 'dtd:element:note',
  para: 'dtd:element:para',
  indexEntry: 'dtd:element:index.entry',
} as const;

export const bookDtdSampleDefinition = {
  id: 'book-dtd',
  displayName: 'Book DTD',
  filename: 'sample.book.dtd',
  format: 'dtd',
  description:
    'Explore a familiar book structure with branches, occurrences, attributes, comments, and source.',
  source: bookDtdSource,
  projectId: 'sample:book-dtd',
  projectDisplayName: 'Book DTD sample',
  initialFocusNodeId: bookDtdNodeIds.book,
} as const;

function compactElementDeclaration(declaration: string): string {
  const match = /^<!ELEMENT\s+\S+\s+([\s\S]+)>$/.exec(declaration.trim());
  return match?.[1]?.trim() ?? declaration;
}

function stabilizeBookSampleCompatibility(
  result: DtdImportResult,
): DtdImportResult {
  if (result.status === 'failure') return result;
  const nodeNames = new Map(
    result.project.nodes.map(({ id, name }) => [id, name] as const),
  );
  return {
    ...result,
    project: {
      ...result.project,
      nodes: result.project.nodes.map((node) =>
        node.kind === 'dtdElement' && node.compactDeclaration
          ? {
              ...node,
              compactDeclaration: compactElementDeclaration(
                node.compactDeclaration,
              ),
            }
          : node,
      ),
      edges: result.project.edges.map((edge) => {
        const sourceName = nodeNames.get(edge.sourceNodeId);
        const targetName = nodeNames.get(edge.targetNodeId);
        return edge.kind === 'contains' && sourceName && targetName
          ? {
              ...edge,
              id: `dtd:contains:${sourceName}:${targetName}`,
            }
          : edge;
      }),
    },
  };
}

export function importBookDtdSample(): DtdImportResult {
  return stabilizeBookSampleCompatibility(
    importDtdSource(bookDtdSampleDefinition.source, {
      projectId: bookDtdSampleDefinition.projectId,
      displayName: bookDtdSampleDefinition.projectDisplayName,
      sourceFileId: bookDtdSampleDefinition.filename,
      sourceFilename: bookDtdSampleDefinition.filename,
    }),
  );
}

export const bookDtdImportResult = importBookDtdSample();

if (bookDtdImportResult.status !== 'success') {
  throw new Error('The built-in Book DTD sample could not be prepared.');
}

if (
  bookDtdImportResult.initialFocusNodeId !==
  bookDtdSampleDefinition.initialFocusNodeId
) {
  throw new Error('The built-in Book DTD initial focus is invalid.');
}

export const bookDtdProject = bookDtdImportResult.project;
