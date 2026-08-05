# Tolerant visualization extraction

## Authority boundary

XML Carousel applies three distinct decisions in order:

1. Apache Xerces-C++/WebAssembly decides XML, DTD, and XSD 1.0 standards acceptance. Its errors remain fatal standards diagnostics.
2. The archive and package resolver enforces selected-file, path, encoding, size, entity, and dependency boundaries. Missing required resources and security-limit failures remain fatal.
3. The visualization adapter builds the normalized project. A specifically classified unsupported-but-valid construct becomes a nonfatal visualization finding; an invariant or integrity failure remains an internal visualization failure.

There is no general “downgrade after Xerces” rule. `src/schema/visualization/diagnosticPolicy.ts` exhaustively maps the current DTD and XSD parse, build, and import codes, plus archive and package codes. Type-level `Record` checks and focused tests fail when a code is added without an explicit decision.

The policy classes are `visualization-warning`, `internal-extraction-failure`, `project-resolution-failure`, `security-resource-failure`, and `obsolete-standards-gate`. Existing DTD lint is a separate advisory channel and is not a standards or visualization-completeness decision.

## Result model and bounds

Every successful DTD, XSD, or ZIP import carries a `VisualizationResult`. Its summary records `complete` or `partial`, the uncapped total, exact uncapped counts by finding code, retained-detail count, omitted-construct count, and placeholder count. Finding detail is sorted deterministically and capped by `MAX_RETAINED_VISUALIZATION_FINDINGS` at 50 before worker transfer. The uncapped total and code counts are preserved even when only 50 records cross the worker boundary.

Finding IDs are deterministic report-local IDs. Findings are plain structured-clone-safe data and may retain source-file identity, exact source range, construct kind/name, and source markup. They never carry Xerces pointers, DOM nodes, WASM addresses, parser ASTs, or virtual runtime paths.

The worker normalizes retained findings through the existing diagnostic representation using source/category `visualization`. It does not create a second diagnostic-report store. The active project separately owns the summary and bounded findings, so dismissing a yellow notice cannot delete project metadata.

## DTD behavior

After Xerces acceptance, supported `ELEMENT` and `ATTLIST` declarations, content-model edges, comments, attributes, and source markup are built normally. The current extractor reports these omissions:

- general and parameter entity declarations;
- notation declarations and unparsed entities;
- top-level parameter-entity references and conditional-section syntax that the local scanner cannot directly model;
- relationships to declarations made available through expansion but absent from the scanner's normalized declaration set.

Exact declaration/reference source is retained when the scanner supplies a trustworthy range. An unresolved reference after Xerces acceptance omits only that relationship; it does not invent a target node or edge. ATTLIST-only projects and DTD lint remain supported. If no trustworthy navigable declaration can be built, the result is an internal valid-but-unvisualizable failure, never “invalid DTD.”

## XSD behavior

The parser already preserves deferred XML elements. After Xerces acceptance, explicitly classified `unsupported-xsd-component` records, schema-level annotation ordering that is legal to Xerces but narrower in the local extractor, and the existing explicit-local-form limitation become visualization findings while supported siblings continue through the builder. Current reported omissions include `simpleContent`, unions/lists not modeled as restrictions, unsupported facets/components, identity constraints, wildcards, groups, attribute groups, and include/import declarations not represented as graph declarations.

Foreign annotation and appinfo XML is already retained as safe raw annotation metadata and therefore is not automatically counted as omitted. Acceptance does not imply full visualization support.

## Packages

The complete immutable project map is assembled before any entry is validated. Its canonical Xerces namespace is the common-root-stripped, package-relative POSIX path. `schemaLocation` is resolved from the referring document's canonical directory, so safe `..` segments may move upward only while the normalized target stays inside the virtual root. No basename aliases or schema-text rewriting are used.

Likely XSD entry schemas are selected from the include/import graph: every unreferenced XSD is a root, then the lexically first still-unreachable member is added for each otherwise-unreachable cycle. This is only a deterministic root-selection heuristic; Xerces remains the standards validator. DTD members remain independent roots. Every accepted source, including supporting XSDs that are not roots, stays in package metadata and in the project file map.

Each source is extracted only after the controlled package has passed the standards boundary. Package source IDs preserve archive identity internally while displayed source filenames use package-relative paths, so same-basename paths remain distinct. Per-file totals and exact code counts are summed, retained details are re-sorted and re-capped once at the package boundary, and report-local finding IDs are regenerated deterministically.

A partial member cannot abort supported members. Required dependency failures, unsafe paths, encoding failures, archive/resource limits, graph collisions, and package invariants remain fatal. Project replacement stays atomic.

## Placeholder and presentation policy

Task 13.4 uses reported omissions, not graph placeholders. A placeholder would imply node identity and relationships that the current adapter cannot prove. Consequently:

- Search indexes only supported real nodes and never offers a false centering action;
- the outline contains only supported real nodes and its existing bounded lists;
- the inspector presents only supported real nodes;
- unsupported source excerpts live in active-project visualization findings for later Problems/source presentation work.

This is deliberately honest: supported declarations remain searchable, navigable, inspectable, and source-backed, while unsupported constructs are counted and retained without fabricated graph semantics. Task 13.4 does not add a Problems modal, clickable additional count, global Problems control, or placeholder journey action.

## Notice and lifecycle

A complete project has no visualization notice. A partial project uses the existing yellow, polite warning area with “Project loaded with limited visualization” wording and the uncapped construct total. DTD lint and visualization warnings share one bounded nonfatal notice. The additional-count text is plain text, and the dismiss control retains the application-wide 44 CSS-pixel minimum.

The controller keeps the active project's undismissed notice snapshot while a later attempt is reading or processing. A red failed-attempt banner has priority. Dismissing that banner restores the active partial notice. Cancellation also restores it. Notice dismissal affects only that active-project instance; complete replacement, another partial replacement, and sample activation clear or replace notice state atomically. Standards diagnostic reports remain independent.

## Security

Tolerant extraction does not change Xerces validation, entity limits, archive limits, safe-path canonicalization, encoding rules, or the selected-project resolver. It adds no network access, `file:` access, host-filesystem lookup, or external retrieval. Finding retention is bounded before cloning and source markup is rendered as text.

## Hermetic Foundry audit

`npm run audit:hermetic-foundry -- --path '<CORPUS_PATH>'` performs a deterministic, non-networked read-only scan through the production Xerces, extractor, package, worker, and Search-index pipeline. It accepts a directory or a `.dtd`, `.xsd`, or `.zip` path, prints a human summary, and writes deterministic JSON to the operating-system temporary directory by default. `--output` is allowed only outside the corpus directory.

The report classifies each scanned item as standards invalid, valid and complete, valid and partial, unsupported standard, or internal failure. It includes input SHA-256, independent ZIP inventory and reference resolution, selected standards-entry paths, exact finding-code counts, retained supported-node counts, source files, and a standalone common-schema dependency probe. Loose files in a directory are audited individually; multi-file dependency projects should be supplied as their project ZIP so controlled auxiliary resources are available together.

The authorized `xml-schemas.zip` acceptance artifact (134,821 bytes; SHA-256 `c17ce1c44cd5aa309bcc652bb43f64e30bc993aef52a0347cfbc799a32886a8f`) contains 82 files, 38 XSDs under common root `xml-schemas/`, and 39 local `schemaLocation` references with zero independently missing targets. The production audit classifies the complete ZIP as valid and partial, retains 2,134 supported nodes from all 38 sources, reports 510 omissions with zero placeholders (`invalid-annotation-placement`: 392, `multiple-annotations`: 38, `unsupported-xsd-component`: 80), and has no internal failure. The archive remains external acceptance input and is not committed.
