import {
  getSchemaNode,
  type SchemaNodeId,
  type SchemaNodeKind,
  type SchemaNodeSourceMarkup,
  type SchemaProject,
  type SchemaSourceMarkupByNodeId,
  type SchemaSourceMarkupFragment,
} from '../../schema/model';
import type { XsdMetadataByNodeId } from '../../schema/xsd';

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
