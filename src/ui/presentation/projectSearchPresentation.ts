import {
  normalizeProjectSearchText,
  projectSearchScoreTiers,
  type ProjectSearchFieldKind,
  type ProjectSearchFieldMatch,
  type ProjectSearchNodeCategory,
  type ProjectSearchResult,
} from '../../app/search';
import type { SchemaNodeId, SchemaNodeKind } from '../../schema/model';
import { formatSchemaNodeKind } from '../carousel/nodePresentation';
import {
  formatReachabilityActionLabel,
  packageEntryReachability,
  schemaNodeReachability,
  type ReachabilityAction,
} from './schemaReachability';
import {
  buildSearchTextExcerpt,
  buildSearchTextSegments,
  SEARCH_RESULT_CONTEXT_LENGTH,
  type SearchTextSegment,
} from './searchTextPresentation';

export { SEARCH_RESULT_CONTEXT_LENGTH };
export const SEARCH_UI_RESULT_LIMIT = 100;

export const SEARCH_GUIDANCE_TEXT =
  'Search node names, types, attributes, documentation, package paths, source filenames, or dependency relationships.';
export const SEARCH_EMPTY_HELP_TEXT =
  'Try a shorter name, a namespace prefix, documentation text, or a DTD comment.';
export const SEARCH_TRUNCATION_NOTICE =
  'More results are available. Refine your search to narrow the list.';

export type ProjectSearchPresentationGroupId =
  | 'elements'
  | 'types'
  | 'attributes'
  | 'dtd-declarations'
  | 'schema-structures'
  | 'documentation-comments'
  | 'source-files'
  | 'package-sources'
  | 'package-entries'
  | 'other';

export interface ProjectSearchResultPresentation {
  readonly id: string;
  readonly resultKind: ProjectSearchResult['resultKind'];
  readonly nodeId: SchemaNodeId;
  readonly nodeKind?: SchemaNodeKind;
  readonly packageEntryId?: string;
  readonly packageEntryKind?: ProjectSearchResult['packageEntryKind'];
  readonly primaryAction: ReachabilityAction;
  readonly primaryActionLabel: string;
  readonly secondaryAction?: ReachabilityAction;
  readonly secondaryActionLabel?: string;
  readonly groupId: ProjectSearchPresentationGroupId;
  readonly name: string;
  readonly nameSegments: readonly SearchTextSegment[];
  readonly kindLabel: string;
  readonly sourceFilename?: string;
  readonly contextLabel?: string;
  readonly contextSegments?: readonly SearchTextSegment[];
  readonly language?: string;
  readonly additionalMatchCount: number;
  readonly additionalMatchText?: string;
}

export interface ProjectSearchResultGroupPresentation {
  readonly id: ProjectSearchPresentationGroupId;
  readonly headingId: string;
  readonly label: string;
  readonly resultCount: number;
  readonly results: readonly ProjectSearchResultPresentation[];
}

export type SearchPresentationState =
  | {
      readonly status: 'guidance';
      readonly query: string;
      readonly guidanceText: string;
      readonly statusText: '';
    }
  | {
      readonly status: 'empty';
      readonly query: string;
      readonly normalizedQuery: string;
      readonly displayQuery: string;
      readonly heading: string;
      readonly helpText: string;
      readonly statusText: string;
    }
  | {
      readonly status: 'results';
      readonly query: string;
      readonly normalizedQuery: string;
      readonly displayQuery: string;
      readonly resultCount: number;
      readonly isTruncated: boolean;
      readonly statusText: string;
      readonly truncationNotice?: string;
      readonly groups: readonly ProjectSearchResultGroupPresentation[];
    };

interface GroupDefinition {
  readonly id: ProjectSearchPresentationGroupId;
  readonly label: string;
}

const groupDefinitions: readonly GroupDefinition[] = Object.freeze([
  Object.freeze({ id: 'elements', label: 'Elements' }),
  Object.freeze({ id: 'types', label: 'Types' }),
  Object.freeze({ id: 'attributes', label: 'Attributes' }),
  Object.freeze({ id: 'dtd-declarations', label: 'DTD declarations' }),
  Object.freeze({
    id: 'schema-structures',
    label: 'Schema and structures',
  }),
  Object.freeze({
    id: 'documentation-comments',
    label: 'Documentation and comments',
  }),
  Object.freeze({ id: 'source-files', label: 'Source files' }),
  Object.freeze({ id: 'package-sources', label: 'Package sources' }),
  Object.freeze({ id: 'package-entries', label: 'Other package entries' }),
  Object.freeze({ id: 'other', label: 'Other' }),
]);

function baseGroupId(
  category: ProjectSearchNodeCategory,
): ProjectSearchPresentationGroupId {
  const groups: Record<
    ProjectSearchNodeCategory,
    ProjectSearchPresentationGroupId
  > = {
    element: 'elements',
    type: 'types',
    attribute: 'attributes',
    dtdDeclaration: 'dtd-declarations',
    schema: 'schema-structures',
    structure: 'schema-structures',
    packageSource: 'package-sources',
    packageEntry: 'package-entries',
    other: 'other',
  };
  return groups[category];
}

function hasMatch(
  result: ProjectSearchResult,
  ...kinds: readonly ProjectSearchFieldKind[]
): boolean {
  return result.matches.some(({ fieldKind }) => kinds.includes(fieldKind));
}

export function selectProjectSearchPresentationGroup(
  result: ProjectSearchResult,
): ProjectSearchPresentationGroupId {
  const hasDocumentationOrComment = hasMatch(
    result,
    'documentation',
    'dtdComment',
  );
  if (
    result.score <= projectSearchScoreTiers.documentation &&
    hasDocumentationOrComment
  ) {
    return 'documentation-comments';
  }
  if (
    result.score <= projectSearchScoreTiers.sourceFile &&
    !hasDocumentationOrComment &&
    hasMatch(result, 'sourceFile')
  ) {
    return result.resultKind === 'package-entry'
      ? result.nodeCategory === 'packageSource'
        ? 'package-sources'
        : 'package-entries'
      : 'source-files';
  }
  return baseGroupId(result.nodeCategory);
}

function firstMatch(
  result: ProjectSearchResult,
  ...kinds: readonly ProjectSearchFieldKind[]
): ProjectSearchFieldMatch | undefined {
  for (const kind of kinds) {
    const match = result.matches.find(({ fieldKind }) => fieldKind === kind);
    if (match) return match;
  }
  return undefined;
}

function selectContextMatch(
  result: ProjectSearchResult,
  groupId: ProjectSearchPresentationGroupId,
): ProjectSearchFieldMatch | undefined {
  if (groupId === 'documentation-comments') {
    return firstMatch(result, 'documentation', 'dtdComment');
  }
  if (groupId === 'source-files') {
    return firstMatch(result, 'sourceFile');
  }
  return firstMatch(
    result,
    'reference',
    'documentation',
    'dtdComment',
    'sourceFile',
    'packagePath',
    'packageReason',
    'dependency',
  );
}

function contextLabel(match: ProjectSearchFieldMatch): string {
  const labels: Record<ProjectSearchFieldKind, string> = {
    name: '',
    reference: 'Reference',
    documentation: 'Documentation',
    dtdComment: 'DTD comment',
    sourceFile: 'Source file',
    packagePath: 'Package path',
    packageReason: 'Status',
    dependency: 'Dependency',
  };
  if (match.fieldKind === 'documentation' && match.language?.trim()) {
    return `Documentation · ${match.language.trim()}`;
  }
  return labels[match.fieldKind];
}

function basename(value: string): string {
  const segments = value.replace(/\\/g, '/').split('/');
  return segments[segments.length - 1] || value;
}

function additionalMatchText(count: number): string | undefined {
  if (count === 0) return undefined;
  return `+${count} additional ${count === 1 ? 'match' : 'matches'}`;
}

function presentResult(
  result: ProjectSearchResult,
  query: string,
  groupId: ProjectSearchPresentationGroupId,
): ProjectSearchResultPresentation {
  const context = selectContextMatch(result, groupId);
  const hasVisibleNameMatch = hasMatch(result, 'name');
  const additionalMatchCount = Math.max(
    0,
    result.matches.length -
      Number(hasVisibleNameMatch) -
      Number(context !== undefined),
  );
  const excerpt = context
    ? buildSearchTextExcerpt(context.text, query, {
        collapseWhitespace:
          context.fieldKind === 'documentation' ||
          context.fieldKind === 'dtdComment',
      })
    : undefined;
  const kindLabel =
    result.resultKind === 'package-entry'
      ? result.packageEntryKind
        ? packageEntryReachability(result.packageEntryKind).kindLabel
        : 'Package entry'
      : formatSchemaNodeKind(result.nodeKind!);
  const primaryAction =
    result.resultKind === 'package-entry'
      ? result.packageEntryKind
        ? packageEntryReachability(result.packageEntryKind).search.action
        : 'open-package-entry'
      : schemaNodeReachability(result.nodeKind!).search.action;
  const secondaryAction =
    result.resultKind === 'schema-node' && primaryAction === 'center'
      ? ('inspect' as const)
      : undefined;

  return Object.freeze({
    id: `search-result-${encodeURIComponent(result.id)}`,
    resultKind: result.resultKind,
    nodeId: result.nodeId,
    ...(result.nodeKind ? { nodeKind: result.nodeKind } : {}),
    ...(result.packageEntryId ? { packageEntryId: result.packageEntryId } : {}),
    ...(result.packageEntryKind
      ? { packageEntryKind: result.packageEntryKind }
      : {}),
    primaryAction,
    primaryActionLabel: formatReachabilityActionLabel(
      primaryAction,
      result.nodeName,
      kindLabel,
    ),
    ...(secondaryAction
      ? {
          secondaryAction,
          secondaryActionLabel: formatReachabilityActionLabel(
            secondaryAction,
            result.nodeName,
            kindLabel,
          ),
        }
      : {}),
    groupId,
    name: result.nodeName,
    nameSegments: buildSearchTextSegments(result.nodeName, query),
    kindLabel,
    ...(result.sourceFilename
      ? { sourceFilename: basename(result.sourceFilename) }
      : {}),
    ...(context
      ? {
          contextLabel: contextLabel(context),
          contextSegments: excerpt!.segments,
        }
      : {}),
    ...(context?.fieldKind === 'documentation' && context.language?.trim()
      ? { language: context.language.trim() }
      : {}),
    additionalMatchCount,
    ...(additionalMatchText(additionalMatchCount)
      ? { additionalMatchText: additionalMatchText(additionalMatchCount) }
      : {}),
  });
}

function displayQuery(query: string): string {
  return query.replace(/^\s+|\s+$/gu, '');
}

function resultStatusText(
  count: number,
  query: string,
  isTruncated: boolean,
): string {
  if (isTruncated) {
    return `Showing the first ${SEARCH_UI_RESULT_LIMIT} results for “${query}”. Refine your search.`;
  }
  return `${count} ${count === 1 ? 'result' : 'results'} for “${query}”.`;
}

export function buildProjectSearchPresentation(
  query: string,
  results: readonly ProjectSearchResult[],
): SearchPresentationState {
  const normalizedQuery = normalizeProjectSearchText(query);
  if (normalizedQuery.length === 0) {
    return Object.freeze({
      status: 'guidance',
      query,
      guidanceText: SEARCH_GUIDANCE_TEXT,
      statusText: '',
    });
  }

  const visibleQuery = displayQuery(query);
  if (results.length === 0) {
    const heading = `No nodes matched “${visibleQuery}”.`;
    return Object.freeze({
      status: 'empty',
      query,
      normalizedQuery,
      displayQuery: visibleQuery,
      heading,
      helpText: SEARCH_EMPTY_HELP_TEXT,
      statusText: heading,
    });
  }

  const isTruncated = results.length > SEARCH_UI_RESULT_LIMIT;
  const visibleResults = results.slice(0, SEARCH_UI_RESULT_LIMIT);
  const grouped = new Map<
    ProjectSearchPresentationGroupId,
    ProjectSearchResultPresentation[]
  >();

  for (const result of visibleResults) {
    const groupId = selectProjectSearchPresentationGroup(result);
    const group = grouped.get(groupId) ?? [];
    group.push(presentResult(result, query, groupId));
    grouped.set(groupId, group);
  }

  const groups: ProjectSearchResultGroupPresentation[] = [];
  for (const definition of groupDefinitions) {
    const groupResults = grouped.get(definition.id);
    if (!groupResults || groupResults.length === 0) continue;
    groups.push(
      Object.freeze({
        id: definition.id,
        headingId: `search-group-${definition.id}`,
        label: definition.label,
        resultCount: groupResults.length,
        results: Object.freeze([...groupResults]),
      }),
    );
  }

  return Object.freeze({
    status: 'results',
    query,
    normalizedQuery,
    displayQuery: visibleQuery,
    resultCount: visibleResults.length,
    isTruncated,
    statusText: resultStatusText(
      visibleResults.length,
      visibleQuery,
      isTruncated,
    ),
    ...(isTruncated ? { truncationNotice: SEARCH_TRUNCATION_NOTICE } : {}),
    groups: Object.freeze(groups),
  });
}
