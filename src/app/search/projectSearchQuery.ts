import { projectSearchNodeCategoryOrder } from './projectSearchIndex';
import { normalizeProjectSearchText } from './projectSearchNormalization';
import type {
  ProjectSearchDocument,
  ProjectSearchField,
  ProjectSearchIndex,
  ProjectSearchNodeCategory,
  ProjectSearchQueryOptions,
  ProjectSearchResult,
} from './projectSearchTypes';

export const DEFAULT_PROJECT_SEARCH_RESULT_LIMIT = 100;

export const projectSearchScoreTiers = Object.freeze({
  exactName: 1000,
  namePrefix: 900,
  nameTerms: 800,
  exactReference: 700,
  referencePrefix: 600,
  referenceTerms: 500,
  documentation: 400,
  dtdComment: 300,
  sourceFile: 200,
  distributed: 100,
});

interface RankedDocument {
  readonly document: ProjectSearchDocument;
  readonly matches: readonly ProjectSearchField[];
  readonly score: number;
}

function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left);
  const rightPoints = Array.from(right);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const difference =
      leftPoints[index]!.codePointAt(0)! - rightPoints[index]!.codePointAt(0)!;
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
}

function categoryOrder(category: ProjectSearchNodeCategory): number {
  const order = projectSearchNodeCategoryOrder.indexOf(category);
  return order === -1 ? projectSearchNodeCategoryOrder.length : order;
}

function fieldMatchesEveryTerm(
  field: ProjectSearchField,
  terms: readonly string[],
): boolean {
  return terms.every((term) => field.normalizedText.includes(term));
}

function scoreDocument(
  document: ProjectSearchDocument,
  normalizedQuery: string,
  terms: readonly string[],
): number {
  const name = document.fields.find(({ kind }) => kind === 'name')!;
  const references = document.fields.filter(({ kind }) => kind === 'reference');
  const packageRelationships = document.fields.filter(
    ({ kind }) => kind === 'dependency',
  );
  const documentation = document.fields.filter(
    ({ kind }) => kind === 'documentation',
  );
  const comments = document.fields.filter(({ kind }) => kind === 'dtdComment');
  const sourceFiles = document.fields.filter(
    ({ kind }) => kind === 'sourceFile' || kind === 'packagePath',
  );
  const packageReasons = document.fields.filter(
    ({ kind }) => kind === 'packageReason',
  );

  if (name.normalizedText === normalizedQuery) {
    return projectSearchScoreTiers.exactName;
  }
  if (name.normalizedText.startsWith(normalizedQuery)) {
    return projectSearchScoreTiers.namePrefix;
  }
  if (fieldMatchesEveryTerm(name, terms)) {
    return projectSearchScoreTiers.nameTerms;
  }
  if (
    references.some(({ normalizedText }) => normalizedText === normalizedQuery)
  ) {
    return projectSearchScoreTiers.exactReference;
  }
  if (
    references.some(({ normalizedText }) =>
      normalizedText.startsWith(normalizedQuery),
    )
  ) {
    return projectSearchScoreTiers.referencePrefix;
  }
  if (references.some((field) => fieldMatchesEveryTerm(field, terms))) {
    return projectSearchScoreTiers.referenceTerms;
  }
  if (
    packageRelationships.some((field) => fieldMatchesEveryTerm(field, terms))
  ) {
    return projectSearchScoreTiers.referenceTerms;
  }
  if (documentation.some((field) => fieldMatchesEveryTerm(field, terms))) {
    return projectSearchScoreTiers.documentation;
  }
  if (comments.some((field) => fieldMatchesEveryTerm(field, terms))) {
    return projectSearchScoreTiers.dtdComment;
  }
  if (sourceFiles.some((field) => fieldMatchesEveryTerm(field, terms))) {
    return projectSearchScoreTiers.sourceFile;
  }
  if (packageReasons.some((field) => fieldMatchesEveryTerm(field, terms))) {
    return projectSearchScoreTiers.distributed;
  }
  return projectSearchScoreTiers.distributed;
}

function compareResults(left: RankedDocument, right: RankedDocument): number {
  return (
    right.score - left.score ||
    left.document.sourceOrder - right.document.sourceOrder ||
    categoryOrder(left.document.nodeCategory) -
      categoryOrder(right.document.nodeCategory) ||
    compareCodePoints(left.document.nodeName, right.document.nodeName) ||
    compareCodePoints(left.document.id, right.document.id)
  );
}

function resultLimit(options: ProjectSearchQueryOptions | undefined): number {
  const requested = options?.limit;
  if (requested === undefined || !Number.isFinite(requested)) {
    return DEFAULT_PROJECT_SEARCH_RESULT_LIMIT;
  }
  return Math.floor(requested);
}

export function searchProjectIndex(
  index: ProjectSearchIndex,
  query: string,
  options?: ProjectSearchQueryOptions,
): readonly ProjectSearchResult[] {
  const normalizedQuery = normalizeProjectSearchText(query);
  if (normalizedQuery.length === 0) return [];
  const limit = resultLimit(options);
  if (limit <= 0) return [];
  const terms = normalizedQuery.split(' ');

  const ranked: RankedDocument[] = [];
  for (const document of index.documents) {
    const matches = document.fields.filter((field) =>
      terms.some((term) => field.normalizedText.includes(term)),
    );
    if (
      matches.length === 0 ||
      !terms.every((term) =>
        document.fields.some((field) => field.normalizedText.includes(term)),
      )
    ) {
      continue;
    }
    const candidate: RankedDocument = {
      document,
      matches,
      score: scoreDocument(document, normalizedQuery, terms),
    };
    let lower = 0;
    let upper = ranked.length;
    while (lower < upper) {
      const middle = (lower + upper) >>> 1;
      if (compareResults(candidate, ranked[middle]!) < 0) {
        upper = middle;
      } else {
        lower = middle + 1;
      }
    }
    if (lower < limit) {
      ranked.splice(lower, 0, candidate);
      if (ranked.length > limit) ranked.pop();
    }
    options?.onRetainedCandidateCount?.(ranked.length);
  }

  return Object.freeze(
    ranked.map(({ document, matches, score }) =>
      Object.freeze({
        id: document.id,
        resultKind: document.resultKind,
        nodeId: document.nodeId,
        ...(document.nodeKind ? { nodeKind: document.nodeKind } : {}),
        ...(document.packageEntryId
          ? { packageEntryId: document.packageEntryId }
          : {}),
        ...(document.packageEntryKind
          ? { packageEntryKind: document.packageEntryKind }
          : {}),
        nodeCategory: document.nodeCategory,
        nodeName: document.nodeName,
        ...(document.sourceFileId
          ? { sourceFileId: document.sourceFileId }
          : {}),
        ...(document.sourceFilename
          ? { sourceFilename: document.sourceFilename }
          : {}),
        score,
        matches: Object.freeze(
          matches.map((field) =>
            Object.freeze({
              fieldId: field.id,
              fieldKind: field.kind,
              text: field.text,
              ...(field.language ? { language: field.language } : {}),
            }),
          ),
        ),
      }),
    ),
  );
}
