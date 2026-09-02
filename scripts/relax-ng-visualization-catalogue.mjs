/**
 * @param {string} id
 * @param {string} construct
 * @param {string} evidence
 * @param {{ presentation?: string, search?: string, source?: string }} [options]
 */
const node = (
  id,
  construct,
  evidence,
  {
    presentation = 'first-class navigable node',
    search = 'semantic name and structured text when present',
    source = 'exact syntax-owned source document and range',
  } = {},
) => ({
  id,
  construct,
  scope: 'RELAX NG semantic model',
  presentation,
  navigation: 'reachable through the bounded structural graph',
  carousel: 'reachable without duplicating semantic identity',
  inspector: 'structured kind, context, and relationships',
  search,
  source,
  zoomIdentity:
    'Full, Compact, and Overview retain one node and target identity',
  evidence,
});

/**
 * @param {string} id
 * @param {string} construct
 * @param {string} evidence
 * @param {string} presentation
 */
const relationship = (id, construct, evidence, presentation) =>
  node(id, construct, evidence, {
    presentation,
    search: 'relationship target text and owning semantic name when present',
    source: 'owning reference token and source document',
  });

/**
 * @param {string} id
 * @param {string} construct
 * @param {string} evidence
 * @param {string} presentation
 */
const contextual = (id, construct, evidence, presentation) =>
  node(id, construct, evidence, {
    presentation,
    search: 'searchable through the owning semantic node when text permits',
  });

const entries = [
  node('semantic.grammar', 'grammar', '01-basic-grammar.rng'),
  node(
    'semantic.start.physical',
    'physical start clause',
    '01-basic-grammar.rng',
  ),
  node('semantic.start.effective', 'effective start', '01-basic-grammar.rng'),
  node('semantic.define.clause', 'define clause', '01-basic-grammar.rng'),
  node('semantic.define.group', 'definition group', '01-basic-grammar.rng'),
  contextual(
    'semantic.combine.choice',
    'choice combine',
    'manual RNG/RNC paired combine fixtures',
    'structured definition-group detail',
  ),
  contextual(
    'semantic.combine.interleave',
    'interleave combine',
    'manual RNG/RNC paired combine fixtures',
    'structured definition-group detail',
  ),
  node('semantic.ref', 'ref', '01-basic-grammar.rng'),
  node('semantic.parent-ref', 'parentRef', '06-nested-grammar-parent-ref.rng'),
  node('pattern.element', 'element pattern', '02-pattern-operators.rng'),
  node('pattern.attribute', 'attribute pattern', '02-pattern-operators.rng'),
  node('pattern.choice', 'choice pattern', '02-pattern-operators.rng'),
  node('pattern.group', 'group pattern', '02-pattern-operators.rng'),
  node('pattern.interleave', 'interleave pattern', '02-pattern-operators.rng'),
  node('pattern.optional', 'optional pattern', '02-pattern-operators.rng'),
  node(
    'pattern.zero-or-more',
    'zeroOrMore pattern',
    '02-pattern-operators.rng',
  ),
  node('pattern.one-or-more', 'oneOrMore pattern', '02-pattern-operators.rng'),
  node('pattern.mixed', 'mixed pattern', '02-pattern-operators.rng'),
  node('pattern.list', 'list pattern', '02-pattern-operators.rng'),
  node('pattern.text', 'text pattern', '02-pattern-operators.rng'),
  node('pattern.empty', 'empty pattern', '02-pattern-operators.rng'),
  node('pattern.not-allowed', 'notAllowed pattern', '02-pattern-operators.rng'),
  node('pattern.data', 'data pattern', '04-datatypes-and-values.rng'),
  node('pattern.value', 'value pattern', '04-datatypes-and-values.rng'),
  contextual(
    'pattern.param',
    'datatype param',
    '04-datatypes-and-values.rng',
    'Inspector structured datatype parameter',
  ),
  contextual(
    'pattern.except',
    'data except',
    '04-datatypes-and-values.rng',
    'data-pattern relationship and Inspector detail',
  ),
  node('name-class.name', 'name name-class', '03-name-classes.rng'),
  node('name-class.any-name', 'anyName name-class', '03-name-classes.rng'),
  node('name-class.ns-name', 'nsName name-class', '03-name-classes.rng'),
  node('name-class.choice', 'name-class choice', '03-name-classes.rng'),
  relationship(
    'name-class.exclusion',
    'name-class exclusion',
    '03-name-classes.rng',
    'bounded exclusion relationship',
  ),
  contextual(
    'context.namespace',
    'namespace context',
    '03-name-classes.rng',
    'structured card and Inspector context',
  ),
  contextual(
    'context.datatype-library',
    'datatypeLibrary context',
    '04-datatypes-and-values.rng',
    'structured card and Inspector context',
  ),
  relationship(
    'package.include',
    'include',
    '11-multi-file-includes.zip',
    'navigable package relationship',
  ),
  contextual(
    'package.include-override',
    'include override',
    'paired RNG/RNC include-override fixtures',
    'include card and structured override detail',
  ),
  relationship(
    'package.external-ref',
    'externalRef',
    '12-external-ref-project.zip',
    'navigable package relationship',
  ),
  relationship(
    'package.resolved-local',
    'resolved local reference',
    '11-multi-file-includes.zip',
    'navigable resolved relationship',
  ),
  relationship(
    'package.missing',
    'missing supplied reference',
    '16-missing-dependency.zip',
    'truthful terminal missing relationship',
  ),
  relationship(
    'package.blocked-remote',
    'blocked remote URI',
    '17-blocked-external-uri.zip',
    'truthful terminal security relationship',
  ),
  relationship(
    'package.blocked-file',
    'blocked filesystem URI',
    '17-blocked-external-uri.zip',
    'truthful terminal security relationship',
  ),
  relationship(
    'package.blocked-traversal',
    'blocked traversal',
    'manual package path-security tests',
    'truthful terminal security relationship',
  ),
  relationship(
    'package.shared',
    'shared dependency',
    '13-shared-dependency.zip',
    'one shared target with multiple incoming relationships',
  ),
  relationship(
    'package.nested',
    'nested dependency',
    '14-nested-include-project.zip',
    'bounded nested navigable relationship',
  ),
  relationship(
    'package.cycle',
    'reference cycle',
    '18-cycle-project.zip',
    'bounded cycle retaining one identity per target',
  ),
  contextual(
    'package.multiple-roots',
    'multiple roots',
    '13-shared-dependency.zip',
    'root-candidate package presentation',
  ),
  contextual(
    'package.mixed-rng-rnc',
    'mixed RNG/RNC inventory',
    '19-mixed-inventory',
    'complete package inventory',
  ),
  contextual(
    'package.mixed-all-standards',
    'mixed DTD/XSD/RNG/RNC package',
    '19-mixed-inventory',
    'complete package inventory',
  ),
  contextual(
    'package.exact-extension',
    'exact syntax dependency resolution',
    'package reference regression tests',
    'relationship status and exact target path',
  ),
  contextual(
    'annotation.foreign',
    'foreign annotation',
    '05-annotations-and-compatibility.rng',
    'inert Inspector/card metadata',
  ),
  contextual(
    'annotation.documentation',
    'documentation',
    '05-annotations-and-compatibility.rng',
    'card, Inspector, and Search text',
  ),
  contextual(
    'annotation.default-value',
    'defaultValue',
    '05-annotations-and-compatibility.rng',
    'attribute card and Inspector detail',
  ),
  contextual(
    'annotation.xml-lang',
    'xml:lang',
    '05-annotations-and-compatibility.rng',
    'documentation language metadata',
  ),
  contextual(
    'source.rng.identity',
    'RNG source identity',
    'manual RNG source assertions',
    'source-linked metadata',
  ),
  contextual(
    'source.rng.range',
    'RNG exact source range and snippet',
    'manual RNG source assertions',
    'View/Copy Source exact XML syntax',
  ),
  contextual(
    'source.rnc.identity',
    'RNC source identity',
    'manual RNC source assertions',
    'source-linked metadata',
  ),
  contextual(
    'source.rnc.range',
    'RNC exact source range and snippet',
    'manual RNC source assertions',
    'View/Copy Source exact Compact Syntax',
  ),
  contextual(
    'source.rnc.no-generated-xml',
    'no generated RNG leakage',
    'manual RNC source assertions',
    'all source-facing surfaces retain original RNC',
  ),
  contextual(
    'reachability.navigation',
    'Navigation reachability',
    'presentation projector acceptance',
    'first-class node or contextual owner',
  ),
  contextual(
    'reachability.carousel',
    'carousel/journey reachability',
    'presentation projector acceptance',
    'bounded structural journey',
  ),
  contextual(
    'reachability.inspector',
    'Inspector reachability',
    'presentation projector acceptance',
    'focused or independently inspected target',
  ),
  contextual(
    'reachability.search',
    'Search reachability',
    'presentation projector acceptance',
    'named/textual semantic search document',
  ),
  contextual(
    'reachability.unnamed',
    'unnamed contextual reachability',
    'presentation projector acceptance',
    'owning node relationship and Inspector detail',
  ),
  contextual(
    'zoom.full',
    'Full semantic zoom',
    'RELAX NG zoom acceptance',
    'full-density presentation',
  ),
  contextual(
    'zoom.compact',
    'Compact semantic zoom',
    'RELAX NG zoom acceptance',
    'compact-density presentation',
  ),
  contextual(
    'zoom.overview',
    'Overview semantic zoom',
    'RELAX NG zoom acceptance',
    'overview-density presentation',
  ),
  contextual(
    'zoom.standalone-rng',
    'standalone RNG zoom identity',
    '02-pattern-operators.rng',
    'same semantic identity at every level',
  ),
  contextual(
    'zoom.standalone-rnc',
    'standalone RNC zoom identity',
    'manual-qa-rnc project 15',
    'same semantic identity at every level',
  ),
  contextual(
    'zoom.multi-file-rng',
    'multi-file RNG zoom identity',
    '11-multi-file-includes.zip',
    'same relationship endpoints at every level',
  ),
  contextual(
    'zoom.multi-file-rnc',
    'multi-file RNC zoom identity',
    'manual-qa-rnc project 11',
    'same relationship endpoints at every level',
  ),
  contextual(
    'zoom.large',
    'large grammar zoom identity',
    'DocBook 5.1 and large manual fixtures',
    'bounded density with stable identity',
  ),
  contextual(
    'zoom.cycle',
    'cycle zoom identity',
    '18-cycle-project fixtures',
    'bounded cycle with stable endpoints',
  ),
  contextual(
    'zoom.shared',
    'shared dependency zoom identity',
    '13-shared-dependency fixtures',
    'one shared target at every level',
  ),
  contextual(
    'zoom.annotations',
    'annotation/documentation zoom identity',
    '05-annotations-and-compatibility.rng',
    'same Inspector and Search target at every level',
  ),
  contextual(
    'bounds.tokens',
    '250,000-token Compact Syntax bound',
    'Compact Syntax hostile-input tests',
    'bounded diagnostic presentation',
  ),
  contextual(
    'bounds.nesting',
    '256-level Compact Syntax nesting bound',
    'Compact Syntax hostile-input tests',
    'bounded diagnostic presentation',
  ),
  contextual(
    'bounds.annotations',
    'malformed annotation bound',
    'Compact Syntax invalid-authority tests',
    'bounded diagnostic presentation',
  ),
  contextual(
    'bounds.cycles',
    'bounded cycle traversal',
    'manual RNG/RNC cycle fixtures',
    'bounded navigation and Search traversal',
  ),
];

export function buildRelaxNgVisualizationMatrix() {
  return {
    schemaVersion: 1,
    authority: 'XML Carousel Task 17.9 RELAX NG complete visualization',
    entries: [...entries].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
  };
}
