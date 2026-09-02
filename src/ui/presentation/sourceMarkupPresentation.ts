import {
  getSchemaNode,
  relaxNgPresentationNodeKinds,
  type SchemaNodeId,
  type SchemaNodeKind,
  type SchemaNodeSourceMarkup,
  type SchemaProject,
  type SchemaSourceMarkupByNodeId,
  type SchemaSourceMarkupFragment,
} from '../../schema/model';
import type { XsdMetadataByNodeId } from '../../schema/xsd';
import type { ActiveProjectState } from '../../app/stores/projectStore';
import { getNodeSourceFilename } from '../carousel/carouselHeading';
import { formatSchemaNodeKind } from '../carousel/nodePresentation';
import { getSchemaNodeDisplayName } from './xsdMetadataPresentation';

export type SourceLocationPresentation =
  | {
      readonly kind: 'exactLineColumn';
      readonly line: number;
      readonly column: number;
      readonly label: string;
    }
  | {
      readonly kind: 'exactLine';
      readonly line: number;
      readonly label: string;
    }
  | {
      readonly kind: 'approximateDeclaration';
      readonly label: string;
    }
  | {
      readonly kind: 'multipleFragments';
      readonly label: string;
    }
  | {
      readonly kind: 'locationUnavailable';
      readonly label: string;
    };

export interface SourceIdentityPresentation {
  readonly kind: 'standaloneFilename' | 'packageRelativePath';
  readonly label: string;
}

export interface SourceViewFragmentPresentation {
  readonly id: string;
  readonly text: string;
  readonly location: Extract<
    SourceLocationPresentation,
    { readonly kind: 'exactLineColumn' }
  >;
}

export interface SourceViewPresentation {
  readonly projectId: string;
  readonly nodeId: SchemaNodeId;
  readonly displayName: string;
  readonly nodeKind: SchemaNodeKind;
  readonly nodeKindLabel: string;
  readonly sourceIdentity?: SourceIdentityPresentation;
  readonly location: SourceLocationPresentation;
  readonly syntax?: SchemaNodeSourceMarkup['syntax'];
  readonly fragments: readonly SourceViewFragmentPresentation[];
  readonly sourceAvailable: boolean;
}

type SourceViewProjectState = Pick<
  ActiveProjectState,
  | 'project'
  | 'origin'
  | 'sourceFilename'
  | 'schemaPackageSources'
  | 'sourceMarkupByNodeId'
  | 'xsdMetadataByNodeId'
>;

export type SourceLocationEvidence =
  | {
      readonly kind: 'exactLineColumn';
      readonly line: number;
      readonly column: number;
    }
  | { readonly kind: 'exactLine'; readonly line: number }
  | { readonly kind: 'approximateDeclaration' }
  | { readonly kind: 'locationUnavailable'; readonly sourceKnown: boolean };

export function presentSourceLocation(
  evidence: SourceLocationEvidence,
): SourceLocationPresentation {
  switch (evidence.kind) {
    case 'exactLineColumn':
      return Object.freeze({
        ...evidence,
        label: `Line ${evidence.line}, column ${evidence.column} · exact`,
      });
    case 'exactLine':
      return Object.freeze({
        ...evidence,
        label: `Line ${evidence.line} · exact line; column unavailable`,
      });
    case 'approximateDeclaration':
      return Object.freeze({
        kind: evidence.kind,
        label: 'Declaration-level location · approximate',
      });
    case 'locationUnavailable':
      return Object.freeze({
        kind: evidence.kind,
        label: evidence.sourceKnown
          ? 'Source file known; declaration location unavailable'
          : 'Declaration location unavailable',
      });
  }
}

function isAbsolutePath(value: string): boolean {
  return /^(?:[A-Za-z]:[\\/]|[\\/]{1,2})/u.test(value.trim());
}

function sourceIdentity(
  state: Pick<
    SourceViewProjectState,
    'project' | 'origin' | 'sourceFilename' | 'schemaPackageSources'
  >,
  sourceFileId: string | undefined,
): SourceIdentityPresentation | undefined {
  if (!sourceFileId) return undefined;
  if (state.origin === 'package') {
    const path = state.schemaPackageSources
      ?.find((source) => source.sourceFileId === sourceFileId)
      ?.packageRelativePath.trim();
    return path && !isAbsolutePath(path)
      ? Object.freeze({ kind: 'packageRelativePath', label: path })
      : undefined;
  }

  const node = state.project.nodes.find(
    ({ sourceFileId: id }) => id === sourceFileId,
  );
  const selected = getNodeSourceFilename(state.project, node)?.trim();
  const fallback = state.sourceFilename.trim();
  const filename =
    selected && !isAbsolutePath(selected)
      ? selected
      : fallback && !isAbsolutePath(fallback)
        ? fallback
        : undefined;
  return filename
    ? Object.freeze({ kind: 'standaloneFilename', label: filename })
    : undefined;
}

export function selectSourceViewPresentation(
  state: SourceViewProjectState,
  nodeId: SchemaNodeId,
): SourceViewPresentation | undefined {
  const node = getSchemaNode(state.project, nodeId);
  if (!node) return undefined;
  const identity = sourceIdentity(state, node.sourceFileId);
  const markup = selectNodeSourceMarkup(
    state.project,
    nodeId,
    state.sourceMarkupByNodeId,
    state.xsdMetadataByNodeId,
  );
  const fragments = (markup?.fragments ?? []).map((fragment) =>
    Object.freeze({
      id: fragment.id,
      text: fragment.text,
      location: presentSourceLocation({
        kind: 'exactLineColumn',
        line: fragment.range.start.line,
        column: fragment.range.start.column,
      }) as SourceViewFragmentPresentation['location'],
    }),
  );
  const location: SourceLocationPresentation =
    fragments.length > 1
      ? Object.freeze({
          kind: 'multipleFragments',
          label: 'Multiple retained source fragments',
        })
      : (fragments[0]?.location ??
        presentSourceLocation({
          kind: 'locationUnavailable',
          sourceKnown: identity !== undefined,
        }));

  return Object.freeze({
    projectId: state.project.id,
    nodeId: node.id,
    displayName: getSchemaNodeDisplayName(
      state.project,
      node,
      state.xsdMetadataByNodeId,
    ),
    nodeKind: node.kind,
    nodeKindLabel: formatSchemaNodeKind(node.kind),
    ...(identity ? { sourceIdentity: identity } : {}),
    location,
    ...(markup ? { syntax: markup.syntax } : {}),
    fragments: Object.freeze(fragments),
    sourceAvailable: fragments.length > 0,
  });
}

const xsdSourceMarkupNodeKinds: readonly SchemaNodeKind[] = [
  'schema',
  'globalElement',
  'localElement',
  'complexType',
  'simpleType',
  'attribute',
  'attributeGroup',
  'group',
  'sequence',
  'choice',
  'all',
  'extension',
  'restriction',
  'list',
  'union',
  'facet',
  'enumeration',
  'identityConstraint',
  'selector',
  'field',
  'xsdNotation',
  'import',
  'include',
  'redefine',
  'xsdAnnotation',
  'xsdDocumentation',
  'xsdAppInfo',
  'xsdForeignElement',
  'xsdComment',
  'xsdProcessingInstruction',
  'xsdProlog',
];

const dtdSourceMarkupNodeKinds: readonly SchemaNodeKind[] = [
  'dtdElement',
  'dtdContentModel',
  'dtdAttributeList',
  'dtdAttribute',
  'dtdEntity',
  'dtdParameterEntity',
  'dtdNotation',
  'dtdElementReference',
  'dtdConditionalSection',
  'dtdComment',
  'dtdProcessingInstruction',
  'dtdDependency',
];

export function isSourceMarkupSyntaxCompatible(
  nodeKind: SchemaNodeKind,
  syntax: SchemaNodeSourceMarkup['syntax'],
): boolean {
  if (syntax === 'rng') {
    return (relaxNgPresentationNodeKinds as readonly SchemaNodeKind[]).includes(
      nodeKind,
    );
  }
  return syntax === 'dtd'
    ? dtdSourceMarkupNodeKinds.includes(nodeKind)
    : xsdSourceMarkupNodeKinds.includes(nodeKind);
}

function isUsableFragment(
  fragment: SchemaSourceMarkupFragment,
  sourceFileId: string,
): boolean {
  const { range } = fragment;
  return (
    fragment.sourceFileId === sourceFileId &&
    (range.sourceId === undefined || range.sourceId === sourceFileId) &&
    Number.isInteger(range.start.offset) &&
    Number.isInteger(range.end.offset) &&
    Number.isInteger(range.start.line) &&
    Number.isInteger(range.end.line) &&
    Number.isInteger(range.start.column) &&
    Number.isInteger(range.end.column) &&
    range.start.offset >= 0 &&
    range.end.offset >= range.start.offset &&
    range.start.line > 0 &&
    range.end.line > 0 &&
    range.start.column > 0 &&
    range.end.column > 0 &&
    fragment.text.length === range.end.offset - range.start.offset
  );
}

function rangesMatch(
  left: SchemaSourceMarkupFragment['range'],
  right: SchemaSourceMarkupFragment['range'],
): boolean {
  return (
    left.start.offset === right.start.offset &&
    left.start.line === right.start.line &&
    left.start.column === right.start.column &&
    left.end.offset === right.end.offset &&
    left.end.line === right.end.line &&
    left.end.column === right.end.column &&
    left.sourceId === right.sourceId
  );
}

function cloneFragment(
  fragment: SchemaSourceMarkupFragment,
): SchemaSourceMarkupFragment {
  return {
    id: fragment.id,
    sourceFileId: fragment.sourceFileId,
    range: {
      start: { ...fragment.range.start },
      end: { ...fragment.range.end },
      ...(fragment.range.sourceId === undefined
        ? {}
        : { sourceId: fragment.range.sourceId }),
    },
    text: fragment.text,
  };
}

/**
 * Selects only source markup that still belongs to the active inspected
 * node. This keeps stale metadata and source-less nodes out of the UI.
 */
export function selectNodeSourceMarkup(
  project: SchemaProject,
  nodeId: SchemaNodeId,
  sourceMarkupByNodeId: SchemaSourceMarkupByNodeId = {},
  xsdMetadataByNodeId: XsdMetadataByNodeId = {},
): SchemaNodeSourceMarkup | undefined {
  const node = getSchemaNode(project, nodeId);
  const sourceFileId = node?.sourceFileId;
  if (!node || !sourceFileId) {
    return undefined;
  }

  const markup = sourceMarkupByNodeId[nodeId];
  if (!markup || !isSourceMarkupSyntaxCompatible(node.kind, markup.syntax)) {
    return undefined;
  }

  if (markup.syntax === 'xsd') {
    const metadata = xsdMetadataByNodeId[nodeId];
    const fragment = markup.fragments[0];
    if (
      markup.fragments.length !== 1 ||
      !fragment ||
      !metadata ||
      metadata.kind !== node.kind ||
      metadata.sourceFileId !== sourceFileId ||
      !isUsableFragment(fragment, sourceFileId) ||
      !rangesMatch(fragment.range, metadata.sourceRange)
    ) {
      return undefined;
    }

    return {
      syntax: 'xsd',
      fragments: [cloneFragment(fragment)],
    };
  }

  const fragments = markup.fragments
    .filter((fragment) => isUsableFragment(fragment, sourceFileId))
    .map(cloneFragment);
  return fragments.length > 0
    ? {
        syntax: markup.syntax,
        fragments,
      }
    : undefined;
}
