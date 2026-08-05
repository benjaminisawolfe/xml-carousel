import {
  schemaPackageEntryKinds,
  type SchemaPackageEntryKind,
} from '../../app/import/schemaPackage/schemaPackageTypes';
import {
  schemaEdgeKinds,
  schemaNodeKinds,
  type SchemaEdgeKind,
  type SchemaNodeKind,
} from '../../schema/model';

export type ReachabilitySurface =
  | 'navigation'
  | 'search'
  | 'carousel'
  | 'inspector'
  | 'sourceView'
  | 'packageInventory';

export type ReachabilityAvailability =
  'direct' | 'contextual' | 'when-textual' | 'not-applicable';

export type ReachabilityAction =
  | 'center'
  | 'inspect'
  | 'open-source'
  | 'open-package-entry'
  | 'not-applicable';

export type ReachabilityFocusResult =
  | 'carousel-card'
  | 'inspector-heading'
  | 'source-markup'
  | 'package-entry-summary'
  | 'not-applicable';

export interface ReachabilityRoute {
  readonly availability: ReachabilityAvailability;
  readonly action: ReachabilityAction;
  readonly target:
    | 'schema-node'
    | 'node-inspector'
    | 'node-source-markup'
    | 'package-entry'
    | 'package-entry-source'
    | 'standard-reference'
    | 'not-applicable';
  readonly focusResult: ReachabilityFocusResult;
}

export interface SchemaNodeReachabilityContract {
  readonly kind: SchemaNodeKind;
  readonly kindLabel: string;
  readonly primaryRoute: ReachabilitySurface;
  readonly secondaryRoutes: readonly ReachabilitySurface[];
  readonly navigation: ReachabilityRoute;
  readonly search: ReachabilityRoute;
  readonly carousel: ReachabilityRoute;
  readonly inspector: ReachabilityRoute;
  readonly sourceView: ReachabilityRoute;
}

export interface SchemaEdgeReachabilityContract {
  readonly kind: SchemaEdgeKind;
  readonly relationshipLabel: string;
  readonly carousel: ReachabilityAvailability;
  readonly inspector: ReachabilityAvailability;
  readonly sourceView: ReachabilityAvailability;
}

export interface PackageEntryReachabilityContract {
  readonly kind: SchemaPackageEntryKind;
  readonly kindLabel: string;
  readonly primaryRoute: 'packageInventory';
  readonly secondaryRoutes: readonly ['search', 'sourceView'];
  readonly navigation: ReachabilityRoute;
  readonly search: ReachabilityRoute;
  readonly carousel: ReachabilityRoute;
  readonly inspector: ReachabilityRoute;
  readonly sourceView: ReachabilityRoute;
}

const schemaNodeKindLabels = {
  schema: 'Schema',
  globalElement: 'Global element declaration',
  localElement: 'Local element declaration',
  elementReference: 'Element reference',
  complexType: 'Complex type declaration',
  simpleType: 'Simple type declaration',
  attribute: 'Attribute declaration',
  attributeReference: 'Attribute reference',
  attributeGroup: 'Attribute-group declaration',
  attributeGroupReference: 'Attribute-group reference',
  group: 'Model-group declaration',
  groupReference: 'Model-group reference',
  sequence: 'Sequence compositor',
  choice: 'Choice compositor',
  all: 'All compositor',
  simpleContent: 'Simple content',
  complexContent: 'Complex content',
  elementWildcard: 'Element wildcard',
  attributeWildcard: 'Attribute wildcard',
  extension: 'Extension derivation',
  restriction: 'Restriction derivation',
  list: 'Simple-type list',
  union: 'Simple-type union',
  facet: 'Constraining facet',
  enumeration: 'Enumeration value',
  builtInType: 'XML Schema built-in type',
  identityConstraint: 'Identity-constraint declaration',
  selector: 'Identity-constraint selector',
  field: 'Identity-constraint field',
  xsdNotation: 'XSD notation declaration',
  import: 'Schema import declaration',
  include: 'Schema include declaration',
  redefine: 'Schema redefine declaration',
  xsdAnnotation: 'XSD annotation',
  xsdDocumentation: 'XSD documentation',
  xsdAppInfo: 'Preserved XSD appinfo',
  xsdForeignElement: 'Preserved uninterpreted foreign element',
  xsdComment: 'XML comment',
  xsdProcessingInstruction: 'XML processing instruction',
  xsdProlog: 'XML declaration',
  dtdElement: 'DTD element declaration',
  dtdContentModel: 'DTD content-model declaration',
  dtdAttributeList: 'DTD attribute-list declaration',
  dtdAttribute: 'DTD attribute declaration',
  dtdEntity: 'DTD general-entity declaration',
  dtdParameterEntity: 'DTD parameter-entity declaration',
  dtdNotation: 'DTD notation declaration',
  dtdElementReference: 'DTD element-name reference',
  dtdConditionalSection: 'DTD conditional section',
  dtdComment: 'DTD comment',
  dtdProcessingInstruction: 'DTD processing instruction',
  dtdDependency: 'Project-local DTD dependency',
} satisfies Record<SchemaNodeKind, string>;

const schemaEdgeRelationshipLabels = {
  contains: 'contains child',
  typeOf: 'uses type',
  extends: 'extends base type',
  restricts: 'restricts base type',
  references: 'references element',
  usesAttribute: 'uses attribute declaration',
  usesAttributeGroup: 'uses attribute-group declaration',
  usesGroup: 'uses model-group declaration',
  substitutes: 'substitutes for element declaration',
  imports: 'imports schema document',
  includes: 'includes schema document',
  usedBy: 'is used by declaration',
  contentModelMember: 'contains content-model member',
  contentModelReference: 'contains content-model reference',
  referencesElementName: 'references element declaration',
  referencesUndeclaredElementName: 'references undeclared element name',
  appliesAttributesToElement: 'applies attributes to element declaration',
  attributeBelongsToList: 'declares attribute in attribute list',
  entityUsesNotation: 'uses notation declaration',
  attributeAllowsNotation: 'allows notation declaration',
  dependsOnResource: 'depends on project-local resource',
  commentAttachesTo: 'attaches comment to declaration',
  sourceOrderAdjacent: 'precedes declaration in source order',
  sourceDocumentOwns: 'source document owns declaration',
  ownsComponent: 'owns schema component',
  particleMember: 'contains particle use',
  ownsAnonymousType: 'owns anonymous type',
  referencesDeclaration: 'references declaration',
  ownsContent: 'owns content structure',
  wildcardMember: 'contains wildcard use',
  ownsTypeVariety: 'owns simple-type variety',
  ownsFacet: 'owns constraining facet',
  derivesFrom: 'derives from direct base type',
  listItemType: 'uses list item type',
  unionMemberType: 'uses union member type',
  ownsIdentityConstraint: 'owns identity constraint',
  ownsSelector: 'owns identity-constraint selector',
  ownsField: 'owns identity-constraint field',
  keyrefTargets: 'key reference targets key or unique declaration',
  notationConstraint: 'constrains value to notation declaration',
  ownsSchemaRelationship: 'owns schema dependency declaration',
  ownsAnnotation: 'owns annotation',
  ownsAnnotationEntry: 'owns annotation entry',
  ownsForeignContent: 'owns preserved uninterpreted foreign content',
  ownsXmlMetadata: 'owns XML source metadata',
  dependsOnSchema: 'depends on schema document',
  redefinesSchema: 'redefines schema document',
  redefinesComponent: 'redefines original component',
  chameleonNamespaceContext: 'applies effective namespace context',
  substitutionGroupMember: 'is member of substitution-group head',
  dependencyCycleMember: 'participates in dependency cycle',
  sharesDependency: 'shares schema dependency',
} satisfies Record<SchemaEdgeKind, string>;

const directNavigationKinds = new Set<SchemaNodeKind>([
  'schema',
  'globalElement',
  'complexType',
  'simpleType',
  'attribute',
  'attributeGroup',
  'group',
  'identityConstraint',
  'xsdNotation',
  'builtInType',
  'dtdElement',
  'dtdAttributeList',
  'dtdEntity',
  'dtdParameterEntity',
  'dtdNotation',
  'dtdConditionalSection',
  'dtdComment',
  'dtdProcessingInstruction',
  'dtdDependency',
]);

const inspectorFirstKinds = new Set<SchemaNodeKind>([
  'facet',
  'enumeration',
  'builtInType',
  'xsdAnnotation',
  'xsdDocumentation',
  'xsdAppInfo',
  'xsdForeignElement',
  'xsdComment',
  'xsdProcessingInstruction',
  'xsdProlog',
  'dtdComment',
  'dtdProcessingInstruction',
]);

function nodeContract(kind: SchemaNodeKind): SchemaNodeReachabilityContract {
  const hasDirectNavigation = directNavigationKinds.has(kind);
  const isInspectorFirst = inspectorFirstKinds.has(kind);
  const hasUserSource = kind !== 'builtInType';
  const primaryRoute: ReachabilitySurface = isInspectorFirst
    ? 'inspector'
    : hasDirectNavigation
      ? 'navigation'
      : 'search';
  const secondaryRoutes = (
    [
      'navigation',
      'search',
      ...(!isInspectorFirst ? (['carousel'] as const) : []),
      'inspector',
      ...(hasUserSource ? (['sourceView'] as const) : []),
    ] satisfies ReachabilitySurface[]
  ).filter((surface) => surface !== primaryRoute);
  return Object.freeze({
    kind,
    kindLabel: schemaNodeKindLabels[kind],
    primaryRoute,
    secondaryRoutes: Object.freeze(secondaryRoutes),
    navigation: Object.freeze({
      availability: hasDirectNavigation ? 'direct' : 'contextual',
      action: isInspectorFirst ? 'inspect' : 'center',
      target: isInspectorFirst ? 'node-inspector' : 'schema-node',
      focusResult: isInspectorFirst ? 'inspector-heading' : 'carousel-card',
    }),
    search: Object.freeze({
      availability: 'direct',
      action: isInspectorFirst ? 'inspect' : 'center',
      target: isInspectorFirst ? 'node-inspector' : 'schema-node',
      focusResult: isInspectorFirst ? 'inspector-heading' : 'carousel-card',
    }),
    carousel: Object.freeze(
      isInspectorFirst
        ? {
            availability: 'not-applicable',
            action: 'not-applicable',
            target: 'not-applicable',
            focusResult: 'not-applicable',
          }
        : {
            availability: 'direct',
            action: 'center',
            target: 'schema-node',
            focusResult: 'carousel-card',
          },
    ),
    inspector: Object.freeze({
      availability: 'direct',
      action: 'inspect',
      target: 'node-inspector',
      focusResult: 'inspector-heading',
    }),
    sourceView: Object.freeze(
      hasUserSource
        ? {
            availability: 'direct',
            action: 'open-source',
            target: 'node-source-markup',
            focusResult: 'source-markup',
          }
        : {
            availability: 'not-applicable',
            action: 'not-applicable',
            target: 'standard-reference',
            focusResult: 'not-applicable',
          },
    ),
  });
}

export const schemaNodeReachabilityContracts = Object.freeze(
  Object.fromEntries(
    schemaNodeKinds.map((kind) => [kind, nodeContract(kind)]),
  ) as Record<SchemaNodeKind, SchemaNodeReachabilityContract>,
);

export const schemaEdgeReachabilityContracts = Object.freeze(
  Object.fromEntries(
    schemaEdgeKinds.map((kind) => [
      kind,
      Object.freeze({
        kind,
        relationshipLabel: schemaEdgeRelationshipLabels[kind],
        carousel: 'contextual',
        inspector: 'direct',
        sourceView: 'contextual',
      } satisfies SchemaEdgeReachabilityContract),
    ]),
  ) as Record<SchemaEdgeKind, SchemaEdgeReachabilityContract>,
);

const packageEntryKindLabels = {
  'xsd-source': 'XSD package source',
  'dtd-source': 'DTD package source',
  auxiliary: 'Auxiliary package file',
  ignored: 'Ignored package entry',
  directory: 'Package directory',
} satisfies Record<SchemaPackageEntryKind, string>;

export const packageEntryReachabilityContracts = Object.freeze(
  Object.fromEntries(
    schemaPackageEntryKinds.map((kind) => [
      kind,
      Object.freeze({
        kind,
        kindLabel: packageEntryKindLabels[kind],
        primaryRoute: 'packageInventory',
        secondaryRoutes: Object.freeze(['search', 'sourceView'] as const),
        navigation: Object.freeze({
          availability: 'direct',
          action: 'open-package-entry',
          target: 'package-entry',
          focusResult: 'package-entry-summary',
        }),
        search: Object.freeze({
          availability: 'direct',
          action: 'open-package-entry',
          target: 'package-entry',
          focusResult: 'package-entry-summary',
        }),
        carousel: Object.freeze({
          availability: 'not-applicable',
          action: 'not-applicable',
          target: 'not-applicable',
          focusResult: 'not-applicable',
        }),
        inspector: Object.freeze({
          availability: 'direct',
          action: 'open-package-entry',
          target: 'package-entry',
          focusResult: 'package-entry-summary',
        }),
        sourceView: Object.freeze({
          availability:
            kind === 'directory' ? 'not-applicable' : 'when-textual',
          action: kind === 'directory' ? 'not-applicable' : 'open-source',
          target:
            kind === 'directory' ? 'not-applicable' : 'package-entry-source',
          focusResult:
            kind === 'directory' ? 'not-applicable' : 'source-markup',
        }),
      } satisfies PackageEntryReachabilityContract),
    ]),
  ) as Record<SchemaPackageEntryKind, PackageEntryReachabilityContract>,
);

/** Actions with concrete keyboard/click handlers in the presentation layer. */
export const reachabilityActivationActions = Object.freeze([
  'center',
  'inspect',
  'open-source',
  'open-package-entry',
] as const satisfies readonly Exclude<ReachabilityAction, 'not-applicable'>[]);

export const task1317PresentationRowIds = Object.freeze([
  'presentation.carousel-context',
  'presentation.compact-layout-reachability',
  'presentation.continuation-disclosure',
  'presentation.declaration-reference-language',
  'presentation.dense-structure-bounds',
  'presentation.file-ownership-label',
  'presentation.focus-inspector-independence',
  'presentation.inspector-detail',
  'presentation.keyboard-reachability',
  'presentation.large-project-reachability',
  'presentation.navigation-discovery',
  'presentation.relationship-label',
  'presentation.screen-reader-semantics',
  'presentation.search-discovery',
  'presentation.source-view-route',
  'presentation.unnamed-context-label',
] as const);

export function schemaNodeReachability(
  kind: SchemaNodeKind,
): SchemaNodeReachabilityContract {
  return schemaNodeReachabilityContracts[kind];
}

export function schemaEdgeReachability(
  kind: SchemaEdgeKind,
): SchemaEdgeReachabilityContract {
  return schemaEdgeReachabilityContracts[kind];
}

export function packageEntryReachability(
  kind: SchemaPackageEntryKind,
): PackageEntryReachabilityContract {
  return packageEntryReachabilityContracts[kind];
}

export function formatReachabilityActionLabel(
  action: ReachabilityAction,
  name: string,
  kindLabel: string,
): string {
  switch (action) {
    case 'center':
      return `Center ${name}, ${kindLabel}`;
    case 'inspect':
      return `Inspect ${name}, ${kindLabel}`;
    case 'open-source':
      return `View source for ${name}, ${kindLabel}`;
    case 'open-package-entry':
      return `View ${name}, ${kindLabel}, in package inventory`;
    case 'not-applicable':
      return `${name}, ${kindLabel}`;
  }
}
