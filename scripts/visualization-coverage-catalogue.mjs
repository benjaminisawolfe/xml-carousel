const coverageStates = [
  'complete',
  'partial',
  'source-only',
  'omitted',
  'misclassified',
  'misleading',
  'retained-unreachable',
  'not-applicable',
  'not-observed',
];

const reasonBoundaries = [
  'missing-visualization-implementation',
  'extraction-defect',
  'presentation-defect',
  'reachability-defect',
  'unsupported-standard',
  'opaque-foreign-semantics',
  'incomplete-or-blocked-dependency',
  'security-or-resource-boundary',
];

/**
 * @typedef {'XML/DTD' | 'XSD 1.0' | 'schema-set relationship' | 'annotation/foreign/source content' | 'ZIP/package presentation'} StandardsFamily
 * @typedef {'complete' | 'partial' | 'source-only' | 'omitted' | 'misclassified' | 'misleading' | 'retained-unreachable' | 'not-observed'} ProfileName
 * @typedef {{ code: string, count: number }} CurrentFinding
 * @typedef {{ reasonBoundary?: string, currentFindings?: CurrentFinding[] }} DefinitionOptions
 * @typedef {{ id: string, standardsFamily: StandardsFamily, constructName: string, category: string, profile: ProfileName, ownerTask: string, intendedPrimaryPresentation: string, reasonBoundary?: string, currentFindings?: CurrentFinding[] }} Definition
 */

/** @type {Record<StandardsFamily, string[]>} */
const familyEvidence = {
  'XML/DTD': [
    'docs/technical/dtd-conformance-matrix.md',
    'docs/technical/complete-visualization-coverage-audit.md',
    'tests/fixtures/w3c-xmlconf-20130923/dtd-selected-tests.json',
    'tests/fixtures/dtd/complete-coverage/main.dtd',
    'tests/fixtures/dtd/sdocbook/sdocbook.dtd',
    'src/schema/dtd/dtdCompleteCoverage.test.ts',
    'src/schema/dtd/dtdDeclarationResolution.test.ts',
    'src/tests/DtdCompleteVisualizationIntegration.test.ts',
  ],
  'XSD 1.0': [
    'docs/technical/xerces-production-validation-boundary.md',
    'tests/fixtures/w3c-xsd-1.0/2007-06-20/selected-tests.json',
    'tests/fixtures/xsd/task-13.12-structural.xsd',
    'src/schema/xsd/xsdTask1312Structure.test.ts',
    'tests/fixtures/xsd/task-13.13-type-system.xsd',
    'tests/fixtures/xsd/task-13.13-package/base.xsd',
    'tests/fixtures/xsd/task-13.13-package/consumer.xsd',
    'src/schema/xsd/xsdTask1313TypeSystem.test.ts',
    'src/app/import/schemaPackage/schemaPackageIntegration.test.ts',
  ],
  'schema-set relationship': [
    'src/app/import/schemaPackage/xsdPackageReferenceResolver.ts',
    'src/app/import/schemaPackage/task1314SchemaRelationships.test.ts',
    'tests/fixtures/xsd/task-13.14-schema-set',
    'tests/fixtures/hermetic-foundry/expected-audit.json',
  ],
  'annotation/foreign/source content': [
    'src/schema/xsd/xsdParser.ts',
    'src/schema/xsd/xsdProjectBuilder.ts',
    'src/schema/xsd/xsdProjectMetadata.ts',
    'src/schema/xsd/xsdTask1315AnnotationCompleteness.test.ts',
    'tests/fixtures/xsd/task-13.15-annotation-completeness.xsd',
    'tests/fixtures/hermetic-foundry/expected-audit.json',
  ],
  'ZIP/package presentation': [
    'src/app/import/schemaArchive/discoverSchemaArchive.ts',
    'src/app/import/schemaPackage/importSchemaArchivePackage.ts',
    'src/app/import/schemaPackage/task1316CompletePackagePresentation.test.ts',
    'src/app/search/projectSearchIndex.ts',
    'src/ui/layout/SchemaSetOutline.svelte',
    'src/ui/presentation/schemaReachability.ts',
    'src/ui/presentation/schemaReachability.test.ts',
    'src/ui/search/SearchResultsPanel.test.ts',
    'src/ui/inspector/InspectorComponents.test.ts',
    'tests/fixtures/hermetic-foundry/expected-audit.json',
  ],
};

const profiles = {
  complete: {
    coverageState: 'complete',
    extractionStatus: 'complete',
    normalizedModelStatus: 'complete',
    sourceIdentityStatus: 'complete',
    rawSourceMarkupStatus: 'complete',
    navigationStatus: 'complete',
    searchStatus: 'complete',
    carouselStatus: 'complete',
    inspectorStatus: 'complete',
    sourceViewStatus: 'complete',
    accessibilityStatus: 'complete',
    existingTestCoverageStatus: 'complete',
    reasonBoundary: 'presentation-defect',
  },
  partial: {
    coverageState: 'partial',
    extractionStatus: 'complete',
    normalizedModelStatus: 'partial',
    sourceIdentityStatus: 'complete',
    rawSourceMarkupStatus: 'complete',
    navigationStatus: 'partial',
    searchStatus: 'partial',
    carouselStatus: 'partial',
    inspectorStatus: 'partial',
    sourceViewStatus: 'complete',
    accessibilityStatus: 'partial',
    existingTestCoverageStatus: 'partial',
    reasonBoundary: 'missing-visualization-implementation',
  },
  'source-only': {
    coverageState: 'source-only',
    extractionStatus: 'source-only',
    normalizedModelStatus: 'omitted',
    sourceIdentityStatus: 'partial',
    rawSourceMarkupStatus: 'source-only',
    navigationStatus: 'omitted',
    searchStatus: 'omitted',
    carouselStatus: 'not-applicable',
    inspectorStatus: 'omitted',
    sourceViewStatus: 'source-only',
    accessibilityStatus: 'omitted',
    existingTestCoverageStatus: 'partial',
    reasonBoundary: 'missing-visualization-implementation',
  },
  omitted: {
    coverageState: 'omitted',
    extractionStatus: 'omitted',
    normalizedModelStatus: 'omitted',
    sourceIdentityStatus: 'source-only',
    rawSourceMarkupStatus: 'source-only',
    navigationStatus: 'omitted',
    searchStatus: 'omitted',
    carouselStatus: 'not-applicable',
    inspectorStatus: 'omitted',
    sourceViewStatus: 'source-only',
    accessibilityStatus: 'omitted',
    existingTestCoverageStatus: 'not-observed',
    reasonBoundary: 'extraction-defect',
  },
  misclassified: {
    coverageState: 'misclassified',
    extractionStatus: 'partial',
    normalizedModelStatus: 'source-only',
    sourceIdentityStatus: 'complete',
    rawSourceMarkupStatus: 'complete',
    navigationStatus: 'omitted',
    searchStatus: 'omitted',
    carouselStatus: 'not-applicable',
    inspectorStatus: 'partial',
    sourceViewStatus: 'complete',
    accessibilityStatus: 'partial',
    existingTestCoverageStatus: 'complete',
    reasonBoundary: 'extraction-defect',
  },
  misleading: {
    coverageState: 'misleading',
    extractionStatus: 'partial',
    normalizedModelStatus: 'partial',
    sourceIdentityStatus: 'complete',
    rawSourceMarkupStatus: 'complete',
    navigationStatus: 'partial',
    searchStatus: 'partial',
    carouselStatus: 'misleading',
    inspectorStatus: 'partial',
    sourceViewStatus: 'complete',
    accessibilityStatus: 'partial',
    existingTestCoverageStatus: 'partial',
    reasonBoundary: 'presentation-defect',
  },
  'retained-unreachable': {
    coverageState: 'retained-unreachable',
    extractionStatus: 'partial',
    normalizedModelStatus: 'source-only',
    sourceIdentityStatus: 'complete',
    rawSourceMarkupStatus: 'complete',
    navigationStatus: 'omitted',
    searchStatus: 'omitted',
    carouselStatus: 'not-applicable',
    inspectorStatus: 'partial',
    sourceViewStatus: 'partial',
    accessibilityStatus: 'omitted',
    existingTestCoverageStatus: 'partial',
    reasonBoundary: 'reachability-defect',
  },
  'not-observed': {
    coverageState: 'not-observed',
    extractionStatus: 'not-observed',
    normalizedModelStatus: 'not-observed',
    sourceIdentityStatus: 'not-observed',
    rawSourceMarkupStatus: 'not-observed',
    navigationStatus: 'not-observed',
    searchStatus: 'not-observed',
    carouselStatus: 'not-applicable',
    inspectorStatus: 'not-observed',
    sourceViewStatus: 'not-observed',
    accessibilityStatus: 'not-observed',
    existingTestCoverageStatus: 'not-observed',
    reasonBoundary: 'missing-visualization-implementation',
  },
};

/** @type {Definition[]} */
const definitions = [];

/**
 * @param {StandardsFamily} family
 * @param {string} prefix
 * @param {string} ownerTask
 * @param {string} intendedPrimaryPresentation
 * @param {Array<[string, string, string, ProfileName, DefinitionOptions?]>} items
 */
function add(family, prefix, ownerTask, intendedPrimaryPresentation, items) {
  for (const item of items) {
    const [slug, name, category, profile, options = {}] = item;
    definitions.push({
      id: `${prefix}.${slug}`,
      standardsFamily: family,
      constructName: name,
      category,
      profile,
      ownerTask,
      intendedPrimaryPresentation,
      ...options,
    });
  }
}

add('XML/DTD', 'dtd', '13.11', 'Navigation and inspector', [
  ['element-declaration', 'Element declaration', 'declaration', 'complete'],
  [
    'complete-declaration-inventory',
    'Complete explicit element-declaration inventory',
    'declaration',
    'complete',
  ],
  ['empty-content', 'EMPTY content', 'content', 'complete'],
  ['any-content', 'ANY content', 'content', 'complete'],
  ['mixed-content', 'Mixed content', 'content', 'complete'],
  ['child-content-model', 'Child-content model', 'particle', 'complete'],
  ['sequence', 'Content-model sequence', 'particle', 'complete'],
  ['choice', 'Content-model choice', 'particle', 'complete'],
  ['nested-content-group', 'Nested content group', 'particle', 'complete'],
  ['occurrence-once', 'Single occurrence', 'constraint', 'complete'],
  ['occurrence-optional', 'Optional occurrence (?)', 'constraint', 'complete'],
  [
    'occurrence-zero-or-more',
    'Zero-or-more occurrence (*)',
    'constraint',
    'complete',
  ],
  [
    'occurrence-one-or-more',
    'One-or-more occurrence (+)',
    'constraint',
    'complete',
  ],
  [
    'undeclared-element-name',
    'Legal undeclared element name',
    'relationship',
    'complete',
  ],
  [
    'declared-element-name-reference',
    'Declared element-name reference',
    'relationship',
    'complete',
  ],
  ['attlist-declaration', 'ATTLIST declaration', 'declaration', 'complete'],
  ['attribute-cdata', 'CDATA attribute', 'declaration', 'complete'],
  ['attribute-id', 'ID attribute', 'declaration', 'complete'],
  ['attribute-idref', 'IDREF attribute', 'declaration', 'complete'],
  ['attribute-idrefs', 'IDREFS attribute', 'declaration', 'complete'],
  ['attribute-entity', 'ENTITY attribute', 'declaration', 'complete'],
  ['attribute-entities', 'ENTITIES attribute', 'declaration', 'complete'],
  ['attribute-nmtoken', 'NMTOKEN attribute', 'declaration', 'complete'],
  ['attribute-nmtokens', 'NMTOKENS attribute', 'declaration', 'complete'],
  ['attribute-enumeration', 'Enumerated attribute', 'constraint', 'complete'],
  ['attribute-notation', 'NOTATION-valued attribute', 'constraint', 'complete'],
  ['attribute-required', '#REQUIRED default', 'constraint', 'complete'],
  ['attribute-implied', '#IMPLIED default', 'constraint', 'complete'],
  ['attribute-fixed', '#FIXED default', 'constraint', 'complete'],
  [
    'attribute-literal-default',
    'Literal attribute default',
    'constraint',
    'complete',
  ],
  [
    'multiple-attributes',
    'Multiple attributes for one element',
    'relationship',
    'complete',
  ],
  [
    'internal-general-entity',
    'Internal general entity',
    'declaration',
    'complete',
  ],
  [
    'external-general-entity',
    'External general entity',
    'declaration',
    'complete',
  ],
  ['parameter-entity', 'Parameter entity', 'declaration', 'complete'],
  [
    'parameter-entity-content-model',
    'Parameter-entity supplied content model',
    'particle',
    'complete',
  ],
  [
    'parameter-entity-declaration-contribution',
    'Parameter-entity supplied declaration',
    'declaration',
    'complete',
  ],
  ['parsed-entity', 'Parsed entity', 'declaration', 'complete'],
  ['unparsed-entity', 'Unparsed entity', 'declaration', 'complete'],
  [
    'entity-replacement',
    'Entity replacement relationship',
    'relationship',
    'complete',
  ],
  ['notation-declaration', 'Notation declaration', 'declaration', 'complete'],
  [
    'notation-relationship',
    'Notation relationship',
    'relationship',
    'complete',
  ],
  ['conditional-section', 'Conditional section', 'content', 'complete'],
  ['external-subset', 'External subset', 'relationship', 'complete'],
  ['declaration-comment', 'Declaration comment', 'content', 'complete'],
  ['unattached-comment', 'Unattached comment', 'content', 'complete'],
  ['processing-instruction', 'Processing instruction', 'content', 'complete'],
  ['declaration-order', 'Declaration order', 'constraint', 'complete'],
  [
    'project-declaration-reconciliation',
    'Project-wide declaration reconciliation',
    'relationship',
    'complete',
  ],
  ['source-range', 'DTD source range', 'source', 'complete'],
  [
    'raw-declaration-markup',
    'Raw DTD declaration markup',
    'source',
    'complete',
  ],
  [
    'project-local-dependency',
    'Project-local external dependency',
    'relationship',
    'complete',
  ],
]);

add('XSD 1.0', 'xsd.struct', '13.12', 'Navigation and inspector', [
  ['schema-document', 'Schema document', 'component', 'complete'],
  ['target-namespace', 'Target namespace', 'content', 'partial'],
  ['namespace-binding', 'Relevant namespace binding', 'content', 'source-only'],
  ['global-element', 'Global element declaration', 'declaration', 'complete'],
  ['local-element', 'Local element declaration', 'declaration', 'complete'],
  [
    'global-attribute',
    'Global attribute declaration',
    'declaration',
    'complete',
  ],
  ['local-attribute', 'Local attribute declaration', 'declaration', 'complete'],
  ['named-simple-type', 'Named simple type', 'component', 'partial'],
  ['anonymous-simple-type', 'Anonymous simple type', 'component', 'partial'],
  ['named-complex-type', 'Named complex type', 'component', 'partial'],
  ['anonymous-complex-type', 'Anonymous complex type', 'component', 'partial'],
  [
    'model-group-definition',
    'Model-group definition',
    'component',
    'source-only',
    {
      currentFindings: [{ code: 'xsd:unsupported-xsd-component', count: 2 }],
    },
  ],
  [
    'attribute-group-definition',
    'Attribute-group definition',
    'component',
    'source-only',
    {
      currentFindings: [{ code: 'xsd:unsupported-xsd-component', count: 2 }],
    },
  ],
  ['element-reference', 'Element reference', 'relationship', 'partial'],
  ['attribute-reference', 'Attribute reference', 'relationship', 'partial'],
  [
    'group-reference',
    'Group reference',
    'relationship',
    'source-only',
    {
      currentFindings: [{ code: 'xsd:unsupported-xsd-component', count: 10 }],
    },
  ],
  [
    'attribute-group-reference',
    'Attribute-group reference',
    'relationship',
    'source-only',
    {
      currentFindings: [{ code: 'xsd:unsupported-xsd-component', count: 11 }],
    },
  ],
  ['sequence', 'Sequence particle', 'particle', 'complete'],
  ['choice', 'Choice particle', 'particle', 'complete'],
  ['all', 'All particle', 'particle', 'complete'],
  ['nested-particle', 'Nested particle', 'particle', 'partial'],
  ['occurrence', 'Occurrence constraint', 'constraint', 'partial'],
  ['unbounded-occurrence', 'Unbounded occurrence', 'constraint', 'partial'],
  [
    'simple-content',
    'Simple content',
    'content',
    'source-only',
    {
      currentFindings: [{ code: 'xsd:unsupported-xsd-component', count: 6 }],
    },
  ],
  ['complex-content', 'Complex content', 'content', 'partial'],
  ['mixed-content', 'Mixed complex content', 'content', 'source-only'],
  ['empty-complex-content', 'Empty complex content', 'content', 'partial'],
  ['element-wildcard', 'Element wildcard', 'particle', 'source-only'],
  ['attribute-wildcard', 'Attribute wildcard', 'particle', 'source-only'],
  [
    'wildcard-namespace',
    'Wildcard namespace constraint',
    'constraint',
    'source-only',
  ],
  ['process-contents', 'Wildcard processContents', 'constraint', 'source-only'],
  ['default-value', 'Default value constraint', 'constraint', 'partial'],
  ['fixed-value', 'Fixed value constraint', 'constraint', 'partial'],
  [
    'local-qualification',
    'Local declaration qualification',
    'constraint',
    'partial',
  ],
  ['element-form-default', 'elementFormDefault', 'constraint', 'partial'],
  ['attribute-form-default', 'attributeFormDefault', 'constraint', 'partial'],
  ['abstract-element', 'Abstract element', 'constraint', 'source-only'],
  ['abstract-type', 'Abstract type', 'constraint', 'source-only'],
  ['nillable-element', 'Nillable element', 'constraint', 'source-only'],
  ['block-control', 'Block control', 'constraint', 'source-only'],
  ['final-control', 'Final control', 'constraint', 'source-only'],
  ['declaration-order', 'XSD declaration order', 'constraint', 'partial'],
  ['source-identity', 'XSD source identity', 'source', 'complete'],
  ['source-markup', 'XSD component source markup', 'source', 'complete'],
]);

add('XSD 1.0', 'xsd.type', '13.13', 'Inspector and relationship navigation', [
  ['simple-restriction', 'Simple-type restriction', 'constraint', 'partial'],
  ['simple-list', 'Simple-type list', 'constraint', 'source-only'],
  [
    'simple-union',
    'Simple-type union',
    'constraint',
    'source-only',
    {
      currentFindings: [{ code: 'xsd:unsupported-xsd-component', count: 1 }],
    },
  ],
  ['facet-enumeration', 'Enumeration facet', 'constraint', 'complete'],
  [
    'facet-pattern',
    'Pattern facet',
    'constraint',
    'source-only',
    {
      currentFindings: [{ code: 'xsd:unsupported-xsd-component', count: 5 }],
    },
  ],
  ['facet-whitespace', 'whiteSpace facet', 'constraint', 'source-only'],
  ['facet-length', 'length facet', 'constraint', 'source-only'],
  ['facet-min-length', 'minLength facet', 'constraint', 'source-only'],
  ['facet-max-length', 'maxLength facet', 'constraint', 'source-only'],
  [
    'facet-min-inclusive',
    'minInclusive facet',
    'constraint',
    'source-only',
    {
      currentFindings: [{ code: 'xsd:unsupported-xsd-component', count: 3 }],
    },
  ],
  [
    'facet-max-inclusive',
    'maxInclusive facet',
    'constraint',
    'source-only',
    {
      currentFindings: [{ code: 'xsd:unsupported-xsd-component', count: 1 }],
    },
  ],
  ['facet-min-exclusive', 'minExclusive facet', 'constraint', 'source-only'],
  ['facet-max-exclusive', 'maxExclusive facet', 'constraint', 'source-only'],
  ['facet-total-digits', 'totalDigits facet', 'constraint', 'source-only'],
  [
    'facet-fraction-digits',
    'fractionDigits facet',
    'constraint',
    'source-only',
  ],
  [
    'built-in-type-ancestry',
    'Built-in type ancestry',
    'relationship',
    'partial',
  ],
  ['complex-extension', 'Complex-content extension', 'relationship', 'partial'],
  [
    'complex-restriction',
    'Complex-content restriction',
    'relationship',
    'partial',
  ],
  [
    'simple-extension',
    'Simple-content extension',
    'relationship',
    'source-only',
  ],
  [
    'simple-content-restriction',
    'Simple-content restriction',
    'relationship',
    'source-only',
  ],
  ['base-type', 'Base-type relationship', 'relationship', 'partial'],
  ['derivation-chain', 'Type derivation chain', 'relationship', 'partial'],
  [
    'derivation-final',
    'Derivation final restriction',
    'constraint',
    'source-only',
  ],
  [
    'derivation-block',
    'Derivation block restriction',
    'constraint',
    'source-only',
  ],
  ['value-constraint', 'Type-system value constraint', 'constraint', 'partial'],
  ['unique', 'unique identity constraint', 'constraint', 'source-only'],
  ['key', 'key identity constraint', 'constraint', 'source-only'],
  ['keyref', 'keyref identity constraint', 'constraint', 'source-only'],
  ['selector', 'Identity-constraint selector', 'content', 'source-only'],
  ['field', 'Identity-constraint field', 'content', 'source-only'],
  ['keyref-target', 'Key-reference target', 'relationship', 'omitted'],
  [
    'notation-declaration',
    'XSD notation declaration',
    'declaration',
    'source-only',
  ],
  [
    'notation-type',
    'XSD notation type relationship',
    'relationship',
    'omitted',
  ],
]);

add(
  'schema-set relationship',
  'xsd.relationship',
  '13.14',
  'Navigation and inspector',
  [
    [
      'include',
      'Schema include',
      'relationship',
      'source-only',
      {
        currentFindings: [{ code: 'xsd:unsupported-xsd-component', count: 39 }],
      },
    ],
    ['import', 'Schema import', 'relationship', 'source-only'],
    ['redefine', 'Schema redefine', 'relationship', 'source-only'],
    ['chameleon-include', 'Chameleon include', 'relationship', 'omitted'],
    [
      'target-namespace',
      'Target-namespace relationship',
      'relationship',
      'partial',
    ],
    [
      'cross-file-type-reference',
      'Cross-file type reference',
      'relationship',
      'partial',
    ],
    [
      'cross-file-element-reference',
      'Cross-file element reference',
      'relationship',
      'partial',
    ],
    [
      'cross-file-attribute-reference',
      'Cross-file attribute reference',
      'relationship',
      'partial',
    ],
    [
      'group-reference',
      'Cross-file group reference',
      'relationship',
      'source-only',
    ],
    [
      'attribute-group-reference',
      'Cross-file attribute-group reference',
      'relationship',
      'source-only',
    ],
    [
      'substitution-group',
      'Substitution-group membership',
      'relationship',
      'source-only',
    ],
    [
      'type-derivation',
      'Cross-file type derivation',
      'relationship',
      'partial',
    ],
    [
      'identity-linkage',
      'Identity-constraint linkage',
      'relationship',
      'omitted',
    ],
    ['shared-dependency', 'Shared dependency', 'relationship', 'partial'],
    [
      'diamond-dependency',
      'Diamond dependency graph',
      'relationship',
      'partial',
    ],
    ['recursive-type', 'Legal recursive type', 'relationship', 'partial'],
    ['recursive-group', 'Legal recursive group', 'relationship', 'source-only'],
    ['dependency-cycle', 'Dependency cycle', 'relationship', 'partial'],
    [
      'source-ownership',
      'Source-document ownership',
      'relationship',
      'complete',
    ],
    [
      'missing-dependency',
      'Missing dependency',
      'relationship',
      'partial',
      { reasonBoundary: 'incomplete-or-blocked-dependency' },
    ],
    [
      'blocked-dependency',
      'Blocked dependency',
      'relationship',
      'partial',
      { reasonBoundary: 'security-or-resource-boundary' },
    ],
    ['containment-edge', 'Containment edge', 'relationship', 'partial'],
    ['ownership-edge', 'Ownership edge', 'relationship', 'partial'],
    ['reference-edge', 'Reference edge', 'relationship', 'partial'],
    ['type-use-edge', 'Type-use edge', 'relationship', 'partial'],
    ['derivation-edge', 'Derivation edge', 'relationship', 'partial'],
    ['substitution-edge', 'Substitution edge', 'relationship', 'omitted'],
    ['identity-edge', 'Identity-linkage edge', 'relationship', 'omitted'],
    [
      'dependency-edge',
      'Schema-dependency edge',
      'relationship',
      'source-only',
    ],
    ['redefinition-edge', 'Redefinition edge', 'relationship', 'omitted'],
  ],
);

add(
  'annotation/foreign/source content',
  'annotation',
  '13.15',
  'Inspector and source view',
  [
    ['xsd-annotation', 'XSD annotation', 'content', 'partial'],
    [
      'xsd-multiple-annotations',
      'Multiple annotation blocks',
      'content',
      'misclassified',
      { currentFindings: [{ code: 'xsd:multiple-annotations', count: 38 }] },
    ],
    [
      'xsd-annotation-placement',
      'Annotation placement on supported components',
      'content',
      'misclassified',
      {
        currentFindings: [
          { code: 'xsd:invalid-annotation-placement', count: 392 },
        ],
      },
    ],
    ['xsd-documentation', 'XSD documentation', 'content', 'partial'],
    ['documentation-language', 'Documentation xml:lang', 'content', 'partial'],
    ['documentation-source', 'Documentation source URI', 'content', 'partial'],
    [
      'documentation-mixed-content',
      'Mixed documentation content',
      'content',
      'partial',
    ],
    ['xsd-appinfo', 'XSD appinfo', 'content', 'partial'],
    ['appinfo-source', 'Appinfo source URI', 'content', 'partial'],
    [
      'nested-foreign-element',
      'Nested foreign element',
      'content',
      'retained-unreachable',
      { reasonBoundary: 'opaque-foreign-semantics' },
    ],
    [
      'foreign-attribute',
      'Foreign attribute',
      'content',
      'source-only',
      { reasonBoundary: 'opaque-foreign-semantics' },
    ],
    [
      'namespace-extension-content',
      'Namespace-qualified extension content',
      'content',
      'retained-unreachable',
      { reasonBoundary: 'opaque-foreign-semantics' },
    ],
    ['schema-annotation', 'Schema-level annotation', 'content', 'partial'],
    [
      'component-annotation',
      'Annotation on a legal component class',
      'relationship',
      'partial',
    ],
    ['xml-comment', 'XML comment', 'content', 'omitted'],
    [
      'processing-instruction',
      'XML processing instruction',
      'content',
      'omitted',
    ],
    [
      'prolog-information',
      'Relevant prolog information',
      'content',
      'source-only',
    ],
    ['raw-source-fragment', 'Exact raw source fragment', 'source', 'partial'],
    ['source-range', 'Source range', 'source', 'complete'],
    ['source-file-identity', 'Source-file identity', 'source', 'complete'],
    [
      'safe-rendering',
      'Safe opaque-content rendering',
      'content',
      'partial',
      { reasonBoundary: 'opaque-foreign-semantics' },
    ],
    [
      'cdata-content',
      'CDATA content in documentation/appinfo',
      'content',
      'partial',
    ],
    [
      'annotation-order',
      'Annotation and entry source order',
      'constraint',
      'partial',
    ],
  ],
);

add('ZIP/package presentation', 'package', '13.16', 'Package Navigation', [
  ['dtd-source-entry', 'Supplied DTD source', 'package-entry', 'partial'],
  ['xsd-source-entry', 'Supplied XSD source', 'package-entry', 'partial'],
  [
    'archive-relative-path',
    'Archive-relative path',
    'package-entry',
    'partial',
  ],
  ['source-order', 'Package source order', 'constraint', 'partial'],
  ['package-root', 'Package root', 'package-entry', 'retained-unreachable'],
  [
    'common-root',
    'Common root directory',
    'package-entry',
    'retained-unreachable',
  ],
  ['root-candidate', 'Root schema candidate', 'package-entry', 'partial'],
  ['include-dependency', 'Include dependency', 'relationship', 'source-only'],
  ['import-dependency', 'Import dependency', 'relationship', 'source-only'],
  [
    'external-entity-dependency',
    'External-entity dependency',
    'relationship',
    'source-only',
  ],
  ['cross-file-reference', 'Cross-file reference', 'relationship', 'partial'],
  ['shared-file', 'Shared file', 'package-entry', 'partial'],
  [
    'source-without-nodes',
    'Schema source without navigable nodes',
    'package-entry',
    'retained-unreachable',
  ],
  [
    'auxiliary-resolution-file',
    'Auxiliary resolution file',
    'package-entry',
    'retained-unreachable',
  ],
  [
    'ignored-entry',
    'Ignored archive entry with reason',
    'package-entry',
    'omitted',
  ],
  [
    'unresolved-reference',
    'Unresolved package reference',
    'relationship',
    'partial',
    { reasonBoundary: 'incomplete-or-blocked-dependency' },
  ],
  [
    'blocked-reference',
    'Blocked package reference',
    'relationship',
    'partial',
    { reasonBoundary: 'security-or-resource-boundary' },
  ],
  [
    'file-standards-status',
    'Per-file standards status',
    'package-entry',
    'retained-unreachable',
  ],
  [
    'file-visualization-status',
    'Per-file visualization status',
    'package-entry',
    'retained-unreachable',
  ],
  ['file-search-access', 'Per-file Search access', 'package-entry', 'partial'],
  [
    'file-source-view-access',
    'Per-file source-view access',
    'package-entry',
    'retained-unreachable',
  ],
  ['non-schema-entry', 'Non-schema archive entry', 'package-entry', 'omitted'],
  ['entry-byte-identity', 'Archive-entry byte identity', 'source', 'partial'],
  [
    'entry-order-independence',
    'ZIP entry-order independence',
    'constraint',
    'complete',
  ],
]);

add(
  'ZIP/package presentation',
  'presentation',
  '13.17',
  'Cross-surface reachability',
  [
    [
      'navigation-discovery',
      'Navigation discovery route',
      'presentation',
      'partial',
    ],
    ['search-discovery', 'Search discovery route', 'presentation', 'partial'],
    ['carousel-context', 'Bounded carousel context', 'presentation', 'partial'],
    ['inspector-detail', 'Inspector detail route', 'presentation', 'partial'],
    ['source-view-route', 'Source-view route', 'presentation', 'partial'],
    [
      'keyboard-reachability',
      'Keyboard reachability',
      'presentation',
      'partial',
    ],
    [
      'screen-reader-semantics',
      'Screen-reader semantics',
      'presentation',
      'partial',
    ],
    [
      'unnamed-context-label',
      'Context label for unnamed constructs',
      'presentation',
      'partial',
    ],
    [
      'declaration-reference-language',
      'Declaration-versus-reference language',
      'presentation',
      'misleading',
    ],
    ['relationship-label', 'Relationship label', 'presentation', 'partial'],
    ['file-ownership-label', 'Owning-file label', 'presentation', 'partial'],
    [
      'continuation-disclosure',
      'Continuation and overflow disclosure',
      'presentation',
      'partial',
    ],
    [
      'dense-structure-bounds',
      'Bounded dense-structure navigation',
      'presentation',
      'partial',
    ],
    [
      'focus-inspector-independence',
      'Focus and inspector independence',
      'presentation',
      'complete',
    ],
    [
      'compact-layout-reachability',
      'Compact-layout reachability',
      'presentation',
      'partial',
    ],
    [
      'large-project-reachability',
      'Large-project reachability',
      'presentation',
      'partial',
    ],
  ],
);

/** @param {StandardsFamily} family */
function defaultFixtureRefs(family) {
  if (family === 'XML/DTD')
    return [
      'tests/fixtures/dtd',
      'tests/fixtures/dtd/complete-coverage/main.dtd',
    ];
  if (family === 'XSD 1.0') return ['tests/fixtures/xsd'];
  if (family === 'schema-set relationship')
    return ['tests/fixtures/xsd/task-13.14-schema-set'];
  if (family === 'annotation/foreign/source content')
    return [
      'tests/fixtures/xsd/annotations.xsd',
      'tests/fixtures/xsd/task-13.15-annotation-completeness.xsd',
    ];
  return ['tests/fixtures/zip'];
}

/** @param {StandardsFamily} family */
function defaultW3cRefs(family) {
  if (family === 'XML/DTD') return ['w3c-xmlconf:selected'];
  if (family === 'XSD 1.0' || family === 'schema-set relationship')
    return ['w3c-xsd-1.0:selected'];
  return [];
}

/** @param {string} primary */
function defaultSecondaryRoutes(primary) {
  return [
    ...new Set(
      ['Navigation', 'Search', 'inspector', 'source view'].filter(
        (route) =>
          !primary.toLocaleLowerCase().includes(route.toLocaleLowerCase()),
      ),
    ),
  ];
}

export function buildCoverageMatrix() {
  const entries = definitions
    .map((definition) => {
      const completedByTask1312 = definition.ownerTask === '13.12';
      const completedByTask1313 = definition.ownerTask === '13.13';
      const completedByTask1314 = definition.ownerTask === '13.14';
      const completedByTask1315 = definition.ownerTask === '13.15';
      const completedByTask1316 = definition.ownerTask === '13.16';
      const completedByTask1317 = definition.ownerTask === '13.17';
      const profile =
        profiles[
          completedByTask1312 ||
          completedByTask1313 ||
          completedByTask1314 ||
          completedByTask1315 ||
          completedByTask1316 ||
          completedByTask1317
            ? 'complete'
            : definition.profile
        ];
      if (!profile) throw new Error(`Unknown profile ${definition.profile}`);
      const currentFindings =
        completedByTask1312 ||
        completedByTask1313 ||
        completedByTask1314 ||
        completedByTask1315 ||
        completedByTask1316 ||
        completedByTask1317
          ? []
          : (definition.currentFindings ?? []);
      const reasonBoundary =
        definition.reasonBoundary ?? profile.reasonBoundary;
      return {
        id: definition.id,
        standardsFamily: definition.standardsFamily,
        constructName: definition.constructName,
        category: definition.category,
        supportedStandardStatus: 'supported-boundary',
        standardsAndCorpusEvidence: familyEvidence[definition.standardsFamily],
        extractionStatus: profile.extractionStatus,
        normalizedModelStatus: profile.normalizedModelStatus,
        sourceIdentityStatus: profile.sourceIdentityStatus,
        rawSourceMarkupStatus: profile.rawSourceMarkupStatus,
        navigationStatus: profile.navigationStatus,
        searchStatus: profile.searchStatus,
        carouselStatus: profile.carouselStatus,
        inspectorStatus: profile.inspectorStatus,
        sourceViewStatus: profile.sourceViewStatus,
        accessibilityStatus: profile.accessibilityStatus,
        existingTestCoverage: {
          status: profile.existingTestCoverageStatus,
          references: defaultFixtureRefs(definition.standardsFamily),
        },
        currentProjectFixtures: defaultFixtureRefs(definition.standardsFamily),
        selectedW3cCases: defaultW3cRefs(definition.standardsFamily),
        hermeticFoundry: {
          observation:
            definition.standardsFamily === 'XML/DTD'
              ? 'not-applicable'
              : 'audited',
          occurrenceCount: null,
          findingCount: currentFindings.reduce(
            (total, finding) => total + finding.count,
            0,
          ),
        },
        currentFindings,
        exactGapClassification: profile.coverageState,
        reasonBoundary,
        intendedPrimaryPresentation: definition.intendedPrimaryPresentation,
        intendedSecondaryPresentationRoutes: defaultSecondaryRoutes(
          definition.intendedPrimaryPresentation,
        ),
        owningFutureTask: definition.ownerTask,
        notes:
          profile.coverageState === 'complete'
            ? 'Current dedicated model and presentation routes are covered by focused tests.'
            : `Current treatment is ${profile.coverageState}; source retention is not counted as semantic visualization.`,
        deterministicEvidenceReferences: [
          ...familyEvidence[definition.standardsFamily],
          'scripts/audit-visualization-coverage.mjs',
        ],
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    schemaVersion: 1,
    auditBoundary:
      'XML 1.0 DTD, W3C XML Schema 1.0, and controlled local schema packages',
    coverageStates,
    reasonBoundaries,
    entries,
  };
}

export { coverageStates, reasonBoundaries };
