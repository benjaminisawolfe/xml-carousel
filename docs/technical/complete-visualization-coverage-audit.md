# Complete visualization coverage audit

## Scope and method

Task 13.10 established this audit at baseline
`34079e24797ac003aa5719085c6888852bfeb04b`. Tasks 13.11 through 13.17 update
its DTD, XSD structural, type-system, relationship, annotation, source,
complete package-presentation, and cross-surface reachability evidence from
repository baseline `4fa9853856ec5ae065548a08f9377f8d8d6e80a5`.
Apache Xerces-C++ 3.3.0
remains the sole authority for XML 1.0 DTD and W3C XML Schema 1.0 validity.
This audit does not add another validity gate and does not interpret XML
instance documents as an XML Carousel product format.

The audit follows accepted input through four distinct questions:

1. Did Xerces accept the source within the controlled local-project boundary?
2. Did the tolerant extractor retain the construct's exact identity and
   semantics in the normalized project?
3. Can a user discover and inspect it through Navigation, Search, the bounded
   carousel, the inspector, or source view?
4. Are source linkage, relationships, accessible naming, and keyboard routes
   correct?

Source retention alone answers only part of the second question. A construct
is not counted as complete merely because a full source file or a generic
normalized node exists.

The evidence set is:

- the 2,586-row W3C XML 20130923 manifest, including all 1,950 selected rows
  and the 64-case CI selection;
- the 14,383-group W3C XSD 1.0 manifest, including the bounded 182-case full
  selection and 52-case CI selection;
- all 311 persistent files currently under `tests/fixtures/`;
- existing parser, builder, model, presentation, security, lifecycle, and
  deterministic-build tests;
- the complete external Hermetic Foundry archive, whose accepted identity is
  134,821 bytes and SHA-256
  `c17ce1c44cd5aa309bcc652bb43f64e30bc993aef52a0347cfbc799a32886a8f`.

The external archive is never copied into the repository. The committed
Hermetic localization contains only noncopyrighted evidence metadata: source
paths, ranges, construct identities, matrix mappings, and counts.

## Architecture inspected

| Area | Current implementation | Audit conclusion |
| --- | --- | --- |
| Standards acceptance | `validateWithProductionXerces` and the worker-owned import runtime | Authoritative and separate from visualization findings |
| DTD extraction | Xerces-gated lexer/parser, bounded internal parameter-entity token expansion, source-preserving extended scanner, complete-project builder, comment and source-markup builders | Complete supported declaration inventory, content-model, entity, notation, conditional-section, PI, dependency, order, and source evidence without a second validity gate |
| XSD extraction | XML AST, bounded XSD AST, post-Xerces structural, type-system, relationship, annotation, foreign-content, and XML-source projection, project builder, metadata and source-markup builders | Complete Tasks 13.12–13.15 declarations, structures, types, constraints, schema relationships, annotation content, and XML source metadata without a second validity gate |
| ZIP assembly | Complete safe-entry discovery, deterministic classification, decoding, entry-root selection, per-file import, remapping, path/namespace relationship resolution | Every supplied safe file and directory has a stable inventory identity; schema, auxiliary, ignored, root, shared, missing, and blocked states are explicit and ZIP-order independent |
| Normalized model | 52 node kinds and 52 edge kinds | DTD, XSD structural/type-system/schema-set, annotation/foreign/XML-source, semantic ownership, reference, dependency, redefinition, chameleon context, substitution, sharing, cycle, and source-order identities remain distinct |
| Project storage | Frozen project, metadata maps, source maps, package inventory/summary, unresolved-reference maps | Retains clone-safe per-entry evidence and bounded text source without serializing archive bytes |
| Finding policy | Post-Xerces diagnostic policy and bounded retained detail | Correctly nonfatal; the former 39 Task 13.14 and 430 Task 13.15 findings are eliminated by complete reachable representations, not suppressed or reclassified |
| Reachability contract | Exhaustive `schemaReachability` registries for all normalized node kinds, edge kinds, and package-entry kinds | Primary/secondary routes, actions, targets, labels, and explicit non-applicable surfaces are deterministic and completeness-tested without duplicating the normalized graph |
| Navigation | Schema-set outline, complete package inventory, per-file detail/source disclosure, and contract-selected centre/inspect actions | Every applicable declaration and retained/package record has a truthful action; contextual structures remain reachable through their owner without fabricated containment |
| Search | One document per normalized node plus typed package-entry documents, semantic search terms, and contract-selected actions | Every searchable kind has a precise kind label, source context, accessible action, and either centre, inspect, or package-inventory activation |
| Carousel | Contextual window from normalized relationships | Journeys remain bounded and cycle-safe; declaration/reference and edge semantics remain distinct, while inspector/source-first and package-only records are explicitly non-carousel |
| Inspector | Node-specific summaries plus package/file detail presentations in Navigation | Every supported kind has a detailed target or package-detail equivalent, precise labels, related-target controls, and source access where applicable |
| Source view | Per-node fragments plus bounded complete text for package entries | Every user-source construct and safe textual package record has escaped source access; standard built-in types and non-text/binary records are explicitly non-applicable |
| Accessibility | Native controls, semantic headings/details/lists, complete accessible action names, focus/inspection separation, and keyboard navigation | Meaning is not color-only; declaration/reference status, relationship action, current state, counts, and source/package status remain keyboard and screen-reader reachable |
| Conformance and lifecycle | DTD/XSD manifests, Xerces-J comparison, Hermetic, adversarial, worker/browser, portable-build checks | Reused unchanged as regression boundaries |

The normalized model recognizes these node classes:
`schema`, `globalElement`, `localElement`, `elementReference`, `complexType`,
`simpleType`, `attribute`, `attributeReference`, `attributeGroup`,
`attributeGroupReference`, `group`, `groupReference`, `sequence`, `choice`, `all`,
`simpleContent`, `complexContent`, `elementWildcard`, `attributeWildcard`,
`extension`, `restriction`, `list`, `union`, `facet`, `enumeration`,
`builtInType`, `identityConstraint`, `selector`, `field`, `xsdNotation`,
`import`, `include`, `redefine`, `xsdAnnotation`, `xsdDocumentation`,
`xsdAppInfo`, `xsdForeignElement`, `xsdComment`,
`xsdProcessingInstruction`, `xsdProlog`, `dtdElement`,
`dtdContentModel`, `dtdAttributeList`, `dtdAttribute`, `dtdEntity`,
`dtdParameterEntity`, `dtdNotation`, `dtdElementReference`,
`dtdConditionalSection`, `dtdComment`, `dtdProcessingInstruction`, and
`dtdDependency`.

The edge classes are `contains`, `typeOf`, `extends`, `restricts`,
`references`, `usesAttribute`, `usesAttributeGroup`, `usesGroup`,
`substitutes`, `imports`, `includes`, `usedBy`, `contentModelMember`,
`contentModelReference`, `referencesElementName`,
`referencesUndeclaredElementName`,
`appliesAttributesToElement`, `attributeBelongsToList`, `entityUsesNotation`,
`attributeAllowsNotation`, `dependsOnResource`, `commentAttachesTo`,
`sourceOrderAdjacent`, `sourceDocumentOwns`, `ownsComponent`,
`particleMember`, `ownsAnonymousType`, `referencesDeclaration`, `ownsContent`,
and `wildcardMember`, plus `ownsTypeVariety`, `ownsFacet`, `derivesFrom`,
`listItemType`, `unionMemberType`, `ownsIdentityConstraint`, `ownsSelector`,
`ownsField`, `keyrefTargets`, `notationConstraint`, `ownsSchemaRelationship`,
`ownsAnnotation`, `ownsAnnotationEntry`, `ownsForeignContent`, `ownsXmlMetadata`,
`dependsOnSchema`, `redefinesSchema`, `redefinesComponent`, `chameleonNamespaceContext`,
`substitutionGroupMember`, `dependencyCycleMember`, and `sharesDependency`.
All are covered by the machine-tested reachability and relationship-label
registries; that registry is UI capability metadata, not a second graph.

## Canonical matrix and audit command

The canonical machine-readable inventory is
`docs/technical/visualization-coverage-matrix.json`. It is generated from
`scripts/visualization-coverage-catalogue.mjs`; every row expands to the same
fixed schema and is sorted by stable identifier.

Every entry records:

- standards family, construct name and category;
- supported-boundary and evidence references;
- separate extraction, normalized-model, source-identity, raw-markup,
  Navigation, Search, carousel, inspector, source-view, accessibility, and
  test states;
- project, W3C, and Hermetic evidence;
- exact overall gap and reason classifications;
- current finding codes and counts where applicable;
- intended primary and secondary presentation routes;
- owner task from 13.11 through 13.17.

The bounded state vocabulary is `complete`, `partial`, `source-only`,
`omitted`, `misclassified`, `misleading`, `retained-unreachable`,
`not-applicable`, and `not-observed`. The independent reason boundary is one
of `missing-visualization-implementation`, `extraction-defect`,
`presentation-defect`, `reachability-defect`, `unsupported-standard`,
`opaque-foreign-semantics`, `incomplete-or-blocked-dependency`, or
`security-or-resource-boundary`.

Commands:

```powershell
npm run visualization:coverage:matrix
npm run audit:visualization-coverage:verify
npm run audit:visualization-coverage -- `
  --hermetic-archive 'E:\Work\Hermetic Foundry\xml-schemas.zip' `
  --output-json "$env:TEMP\xml-carousel-visualization-coverage.json" `
  --output-text "$env:TEMP\xml-carousel-visualization-coverage.md"
```

The runner rejects schema omissions, duplicate or unsorted identifiers,
unknown states, unsafe/absolute evidence paths, owner tasks outside
13.11–13.17, a checked matrix that differs from its generator, an uncatalogued
Hermetic finding, changed finding totals, unstable localization, and ZIP-order
dependence. Outputs contain no timestamp, random identifier, or absolute host
path.

## Current totals

The matrix contains 221 entries.

| Standards family | Entries |
| --- | ---: |
| XML/DTD | 51 |
| XSD 1.0 structural, type-system, and constraint | 77 |
| Schema-set relationship | 30 |
| Annotation, foreign, and source content | 23 |
| ZIP/package presentation and cross-surface reachability | 40 |

| Overall state | Entries |
| --- | ---: |
| Complete | 221 |
| Partial | 0 |
| Source-only | 0 |
| Omitted | 0 |
| Misclassified | 0 |
| Misleading | 0 |
| Retained but unreachable | 0 |

| Reason boundary | Entries |
| --- | ---: |
| Missing visualization implementation | 0 |
| Presentation defect | 213 |
| Extraction defect | 0 |
| Reachability defect | 0 |
| Opaque foreign semantics | 4 |
| Incomplete or blocked dependency | 2 |
| Security or resource boundary | 2 |

Layer totals explain why source preservation cannot be used as the completion
metric:

| Layer | Complete | Partial | Source-only | Omitted | Other |
| --- | ---: | ---: | ---: | ---: | ---: |
| Extraction | 221 | 0 | 0 | 0 | 0 |
| Normalized model | 221 | 0 | 0 | 0 | 0 |
| Source identity | 221 | 0 | 0 | 0 | 0 |
| Raw source markup | 221 | 0 | 0 | 0 | 0 |
| Navigation | 221 | 0 | 0 | 0 | 0 |
| Search | 221 | 0 | 0 | 0 | 0 |
| Carousel | 221 | 0 | 0 | 0 | 0 |
| Inspector | 221 | 0 | 0 | 0 | 0 |
| Source view | 221 | 0 | 0 | 0 | 0 |
| Accessibility | 221 | 0 | 0 | 0 | 0 |

“Complete” characterizes the intended route and its deterministic evidence.
It does not mean every construct participates in every surface: explicit
per-kind `not-applicable` capabilities prevent source-first, standard-reference,
and package-only records from being falsely centred in the carousel.

## DTD completion

All 51 `dtd.*` rows are complete at every audited layer. Xerces acceptance
remains authoritative; only accepted sources enter the source-preserving
completion adapter. The normalized project now retains explicit content-model
grammar and occurrences, declared reference particles with explicit declaration
targets, legal undeclared-name references without fabricated declarations,
each ATTLIST and attribute declaration, distinct entity and
notation categories, conditional sections, comments, processing instructions,
dependency sources, source order, exact source ownership, and raw markup.

The byte-for-byte corrective fixture
`tests/fixtures/dtd/sdocbook/sdocbook.dtd` is 46,263 bytes, 1,569 lines, has
SHA-256 `a6581df71f08bf6020bf467c80246196bf70e37203ca430588b42487fc6476b2`,
and contains 106 explicit element declarations. Tests lock all 106 normalized
declarations, Navigation and Search inventory totals, deterministic source
order, the five resolved `revision` particles, internal parameter-entity model
and declaration contribution, project-local external reconciliation, and
ZIP-order/path-scope isolation.

Dense or non-journey declarations use dedicated Navigation, Search, inspector,
and source routes. Element and content-model exploration remains a bounded,
cycle-safe carousel. Supported legal DTD constructs no longer generate a
partial-visualization finding merely because their presentation was absent.

## XSD structural completion

All 44 `xsd.struct.*` rows are complete at every audited layer. After Xerces
acceptance, the tolerant structural projection retains distinct schema files,
global/local declarations, declaration and reference particles, named and
anonymous types, group and attribute-group definitions/references, nested
compositors, exact occurrence use sites, simple/complex/mixed/empty content,
element/attribute wildcards, namespace and `processContents` constraints,
qualification controls, value constraints, abstract/nillable/block/final
controls, ownership, declaration order, and source markup.

Named definitions are exposed in Navigation and Search. Local and anonymous
structures remain owner-contextual and use deterministic source-aware IDs.
The bounded carousel follows semantic ownership, particle, type, and
declaration-reference edges; the inspector and source view expose plain
semantic properties and exact use-site fragments. Complete structural support
does not claim the later facet, derivation-chain, schema-set, annotation, or
package-presentation work assigned to Tasks 13.13–13.16.

## XSD type-system and constraint completion

All 33 `xsd.type.*` rows are complete at every audited layer. The normalized
project distinguishes restriction, list, union, every XSD 1.0 facet,
declaration-order and lexical facet values, repeated and fixed facets,
application-owned built-in type ancestry, and all four complex/simple-content
derivation forms. Direct-base and bounded full-ancestry relationships remain
distinct, cycle safe, and navigable; `final`, `block`, default, and fixed
values preserve their exact lexical form and applicability.

`unique`, `key`, and `keyref` declarations, selector and ordered field
expressions, key-reference targets, XSD notation declarations, and
`xs:NOTATION` enumeration targets now have individual deterministic nodes,
semantic edges, Search documents, contextual Navigation, inspector details,
and exact source routes. XPath expressions and pattern facets remain inert
data and are never evaluated. Standard built-in nodes are explicitly marked
as application-owned reference data and never claim user-source markup.

## Schema-set relationship completion

Package validation and resolution handle controlled local files, safe relative
parents, shared dependencies, cycles, and missing/blocked resources. Dedicated
include/import/redefine nodes, chameleon and redefinition identity, distinct
component-reference edges, and complete package-level relationship summaries
expose that topology without turning it into a whole-project graph.

Shared, diamond, and cyclic dependencies remain deterministic and bounded;
resolved, missing, and security-blocked resources retain distinct outcomes.
Containment, ownership, reference, type use, derivation, substitution,
identity linkage, dependency, and redefinition remain distinct in normalized
edges and in the Task 13.17 relationship-label registry.

## Annotation, foreign-content, and source completeness

Task 13.15 gives every annotation block and documentation/appinfo entry a
stable, source-ordered graph identity owned by its exact schema component.
Typed metadata preserves language and source attributes, mixed text and CDATA,
foreign elements and attributes with namespace context, raw XML, exact ranges,
and source-file identity. Nested comments and processing instructions are
owned by their containing entry or foreign element; schema/prolog comments,
processing instructions, and the XML declaration are independently reachable.

Schema-level annotation multiplicity and interspersed placement now follow the
XSD 1.0 schema grammar while component-only cardinality and first-child rules
remain enforced on components. This removes the former 392 placement and 38
multiple-annotation findings by correcting extraction and adding complete
Navigation, Search, carousel, inspector, source-view, and accessibility routes.
Opaque HTML/SVG/MathML/vendor-looking content is retained as inert text and
escaped source only; no URI is fetched and no markup is interpreted.

## ZIP and multi-file completion

The package result retains schema source summaries, archive-relative paths,
source order, root nodes and candidate reasoning, validation results,
cross-file resolver state, and every safe supplied entry. Schema files with no
nodes, auxiliary resolver files, non-schema content, ignored entries, and
directories have stable package identities with explicit classification and
reason text.

Per-file standards/visualization status, Search access, source availability,
dependency summaries, accessible ownership labels, counts, and independent
collapsed disclosures are complete. Text sources open as escaped inert text;
binary or directory source actions remain explicitly unavailable.

## Presentation-path completion

Navigation, Search, carousel, inspector, and source view now have a shared,
exhaustive capability contract for every normalized kind and package record.
Named and contextual constructs receive stable labels; action names include
the precise declaration/reference kind; every searchable record selects a
truthful centre, inspect, source, or package-inventory action.

Facets, enumerations, annotations, documentation, preserved opaque content,
comments, processing instructions, prolog records, and built-in standard types
are inspector-first. Search and applicable Navigation groups inspect these
records without fabricating carousel containment. Package entries remain
package-inventory-first and never masquerade as normalized carousel nodes.

The carousel remains correctly bounded and contextual. Explicit
`not-applicable` contracts require complete Navigation/Search/inspector/source
routes instead of whole-graph rendering. Native controls, logical headings,
wrapped long content, independent focus/inspection state, and close/reset
regressions supply the keyboard, screen-reader, compact-layout, and lifecycle
evidence for those routes.

## W3C and persistent-fixture evidence

The selected DTD inventory covers eight families: attributes/defaults,
conditional sections, external subsets, elements/content models, external
entities/encoding, notations/unparsed entities, parameter/general entities,
and complete-document well-formedness evidence. The presentation audit does
not reinterpret optional, instance-dependent, unsupported-engine, or
security-blocked outcomes as visualization defects.

The selected XSD inventory covers 24 families, including annotations,
attribute/model groups, chameleon include, complex/simple content, facets,
identity constraints, include/import, list/union, notation, recursion,
redefine, substitution groups, and wildcards. Those family selections prove
standards-boundary relevance; they do not prove presentation completeness.

Persistent fixtures contain 72 DTDs, 114 XSDs, 12 entity files, 69 XML
documents, one binary dependency, and 13 ZIPs. Focused tests prove complete
DTD behavior and the retained XSD/package warning boundaries. The
characterization test locks
the complete matrix, Hermetic localization, gap counts, stable ordering,
absolute-path exclusion, and deterministic CLI output.

## Hermetic Foundry localization

The accepted production result is 38 XSD sources, 3,958 supported nodes,
3,958 Search documents, 3,739 source-markup nodes, zero visualization findings,
zero unresolved supplied references, and complete visualization. All 38
sources retain annotation/source identities.

| Former generic code | Actual construct | Count | Matrix owner |
| --- | --- | ---: | --- |
| `xsd:invalid-annotation-placement` | Schema-level annotation placement | 0 (formerly 392) | `annotation.xsd-annotation-placement` / 13.15 complete |
| `xsd:multiple-annotations` | Multiple schema-level annotations | 0 (formerly 38) | `annotation.xsd-multiple-annotations` / 13.15 complete |

The former five pattern, three `minInclusive`, one `maxInclusive`, one
simple-union, 39 schema-include, and 430 annotation findings owned by Tasks
13.13–13.15 are eliminated. No finding was reclassified or suppressed.

The localization now contains zero records. Persistent focused fixtures and
the normalized Hermetic graph retain the former source paths, exact ranges,
owners, and independently reachable content identities.

Original, reversed, and deterministic-shuffled source orders all produce the
same zero-record result and localization SHA-256:
`05cfd72bc72f1bcef9ba51dc4d0d5e7218c37778de6b412afbf9ccd49d9e6215`.
The complete accepted production result independently retains normalized hash
`f8877321057cec6652caefe53dbf959bef5612ad67366f25728311212a685bd4`.
Opening `foundry-common.xsd` without `foundry-rich-text.xsd` remains a blocked
missing-dependency failure.

## Ordered Tasks 13.11–13.17 backlog

### Task 13.11 — Complete DTD Visualization

Completed all 51 `dtd.*` entries. Evidence includes the focused complete-DTD
fixture, selected W3C entity, notation, conditional-section, ATTLIST,
content-model, and external-subset families, and extraction/model/package/UI
regressions. Hermetic impact remains not applicable. The task added the
distinct AST/model identities, semantic edges, discovery groups, bounded
contextual carousel routes, detailed inspector/source targets, declaration
order, and accessible relationship names described above.

### Task 13.12 — Complete XSD 1.0 Structural Visualization

Completed all 44 `xsd.struct.*` entries and eliminated its 31 Hermetic
findings: two attribute-group definitions, eleven attribute-group references,
two model-group definitions, ten group references, and six simple-content
constructs. Evidence includes the focused Task 13.12 structural fixture,
selected W3C families, the exact Hermetic archive and ZIP permutations, and
model/package/Navigation/Search/inspector/source regressions. Tasks
13.13–13.15 build on these stable component identities; no later-task finding
was reclassified as structural completion.

### Task 13.13 — Complete XSD Type-System and Constraint Visualization

Completed all 33 `xsd.type.*` entries and eliminated its ten Hermetic
findings: five patterns, three `minInclusive`, one `maxInclusive`, and one
union. Evidence includes focused single-file and cross-file fixtures, exact
lexical/source-order assertions, ZIP-order permutations, built-in ancestry,
derivation-chain, identity/keyref, notation, Navigation, Search, carousel,
inspector, and source regressions. It builds only on the stable Task 13.12
component identities and does not claim the Task 13.14 schema-set UX.

### Task 13.14 — Complete XSD Relationship and Schema-Set Visualization

Completed all 30 `xsd.relationship.*` entries and eliminated the 39 Hermetic
include findings. Schema relationship declarations now have deterministic,
source-owned nodes and distinct dependency, redefinition, chameleon-context,
substitution, sharing, and cycle edges. Project-local resolution retains the
lexical location, normalized source-relative path, target namespace, owning
files, status, source markup, and effective chameleon namespace without
copying declarations or implying containment. Missing, ambiguous, traversal,
scheme, and encoded-traversal outcomes remain truthful and network-free.
Focused schema-set fixtures cover include/import/redefine, locationless import,
two namespace contexts, cross-file QNames, substitution, sharing/diamonds,
recursion, cycles, same basenames, ZIP-order permutations, Search, inspector,
source view, and textual relationship labels. Task 13.12 component identities
and Task 13.13 type/constraint identities remain the resolution foundation.

### Task 13.15 — Annotation, Appinfo, Foreign Content, and Source Completeness

Complete. All 23 `annotation.*` entries are complete and the former 430
Hermetic annotation findings are zero. Repeated/interspersed schema annotations,
every annotation entry, foreign content, comments, PIs, prolog data, and exact
source fragments have stable owned identities. Search/Navigation expose safe
contextual targets; carousel summaries are bounded; inspector/source view use
escaped text and source; accessibility retains textual kind, ownership,
language, source, namespace, and safety labels.

### Task 13.16 — Complete ZIP and Multi-File Presentation

Complete. All 24 `package.*` entries are complete. Archive discovery now
retains every safe supplied file and explicit directory with path-aware,
order-stable identity, original-order metadata, deterministic presentation
order, size metadata, schema/auxiliary/ignored classification, and an exact
reason. Clone-safe per-file records connect source ownership, declaration,
Search, and source-markup counts to include/import/redefine and external-entity
dependencies, dependents, root candidates, selected entries, shared sources,
and distinct missing/blocked outcomes. Navigation provides package/file detail
and safe escaped source disclosures; typed Search results open those entries
without fabricating carousel components or binary previews.

The exact Hermetic archive produces 85 inventory records: 82 files and three
directories, comprising 38 complete XSD sources and 44 ignored non-schema text
files, with no auxiliary, binary, blocked, zero-node, or unresolved entries.
All 82 files are safely source-viewable; 33 roots are candidates. Its package
root is `xml-schemas`, package-inventory SHA-256 is
`87daa2e27ccb3a0d48a0b23b831d4997cbea5fa2af3522457a5096b5cd6d97cc`,
and original/reversed/deterministically shuffled archives agree. Schema truth
remains 3,958 nodes, 3,739 source-markup records, zero findings, zero unresolved
supplied references, and valid/complete. The combined worker Search index now
contains 4,043 documents: 3,958 schema-node documents plus 85 typed package
entry documents.

### Task 13.17 — Visualization UX and Reachability Audit

Completed all 16 `presentation.*` entries and validated the presentation
statuses on every other row. The exhaustive UI capability registry maps all
52 normalized node kinds, all 52 edge kinds, and all five package-entry kinds
to truthful discovery, activation, inspector, source, and non-applicable
surfaces. Search and Navigation no longer assume that centring is correct for
every result. Declaration/reference labels, precise relationship language,
source ownership, continuation controls, accessible names, and stable
inspector/source actions are tested across standalone and package projects.

The bounded carousel, independent focus/inspection state, keyboard and
screen-reader semantics, compact/zoom containment, reduced motion, large
inventories, long content, cycles, and shared-reference behavior remain under
focused component, integration, lifecycle, and real-browser regression. All
221 rows are complete; no retained-unreachable or source-only gap remains.

## Audit limitations

- The matrix is exhaustive against the supported XML 1.0 DTD and XSD 1.0
  responsibilities enumerated for Task 13.10, not XSD 1.1 or arbitrary XML
  instance features.
- W3C suites validate standards behavior; they do not contain a normative UI
  oracle. Presentation classifications are evidence-backed characterization
  decisions and later tasks intentionally update them.
- The complete Hermetic package provides strong real-project evidence but is
  one vendor schema family. Opaque private semantics are preserved, not
  interpreted.
- Screen-reader and layout conclusions are supported by automated semantics,
  focus, containment, and browser-lifecycle checks plus Chrome and Firefox
  execution; they are not a substitute for every assistive-technology/device
  combination.
- The audit does not claim Safari or physical Samsung-device execution.
- Tasks 13.11 and 13.12 change tolerant extraction and presentation after
  successful Xerces acceptance. They do not change the native adapter, committed Xerces runtime,
  resolver security boundary, or worker lifecycle policy.

The matrix retains its bounded state vocabulary for future regression
detection, but this audit has no remaining partial, source-only, omitted,
misleading, misclassified, or retained-unreachable row. Task 13.17 does not
begin semantic zoom or later acceptance/documentation work.

Task 13.18 turns this evidence into the deterministic release decision
described in [Complete-visualization acceptance gate](complete-visualization-acceptance-gate.md).
The gate is invoked by `npm run validate`; the audit remains the evidence
producer it reuses rather than a competing release definition.
