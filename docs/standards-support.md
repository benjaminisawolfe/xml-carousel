# Standards support

This is the current release-facing statement of XML Carousel's validation,
presentation, resolver, security, and test boundaries. Detailed presentation
evidence remains in the
[complete-visualization coverage audit](technical/complete-visualization-coverage-audit.md)
and its [acceptance gate](technical/complete-visualization-acceptance-gate.md).
RELAX NG has separate
[conformance and visualization authorities](technical/relax-ng-conformance-and-visualization-authority.md)
so its evidence does not rewrite the historical DTD/XSD/ZIP matrix.

## Supported inputs and validation authority

XML Carousel accepts standalone `.dtd`, `.xsd`, RELAX NG XML-syntax `.rng`, and
RELAX NG Compact Syntax `.rnc` files, plus ZIP packages that preserve DTD, XSD,
and RELAX NG project-relative
paths.
Apache Xerces-C++ 3.3.0, compiled to WebAssembly, is the authoritative parser
and validator for XML 1.0, standalone DTD grammar preparation, and XML Schema
1.0 / XSD 1.0 within the implemented controlled-project architecture. libxml2
RELAX NG 2.15.3, also compiled to WebAssembly, is the authoritative validator
for standalone and ZIP-supplied `.rng` and internally translated `.rnc` input.
The `.rnc` lexer/parser and source map are project-authored TypeScript; generated
XML is transient and never replaces original source. XSD 1.1 is not supported. XML instance documents are
conformance-harness inputs, not an XML Carousel product input format.

Only after Xerces accepts input do XML Carousel's TypeScript layers extract
source-preserving structures, build the normalized project, and prepare the
user interface. Those layers are not a second standards validator. A
presentation limitation must not turn otherwise Xerces-valid input into a
standards-invalid result.

## Standalone RELAX NG

**Open RNG** validates selected `.rng` or `.rnc` bytes in a dedicated disposable
worker. XML syntax reaches libxml2 directly; Compact Syntax is parsed and
serialized to deterministic transient XML in memory. The worker does not
resolve `include` or `externalRef` targets from the disk, network, or another
unsupplied source. A required dependency therefore produces a missing or
security-blocked result; the standalone path performs zero external fetches.

A valid schema activates the shared RELAX NG semantic model and presentation:
grammar starts, definitions, patterns, name classes, datatypes, annotations,
Search, Navigation, carousel, Inspector, semantic zoom, and exact retained
source. Equivalent XML and Compact Syntax project to equivalent meaning while
retaining distinct filenames, lexical text, and ranges. Invalid,
blocked, cancelled, and internal-failure attempts leave the active project
unchanged.

## RELAX NG in ZIP packages

**Open ZIP** recognizes case-insensitive `.rng` and `.rnc` members and retains one
source-document node and the complete exact UTF-8 source for each member.
libxml2 receives all and only supplied same-syntax-family RELAX NG members and
validates deterministic roots; Xerces continues to receive DTD/XSD roots and
their controlled resources. There is no implicit `.rnc`/`.rng` substitution.

RELAX NG `include` and `externalRef` relationships are extracted
namespace-correctly for package inventory, Problems, Search, and source
routing. Safe local targets resolve by exact canonical package path. Literal
targets remain visible when missing or blocked by external-URI, filesystem, or
root-traversal policy, and no target document is fabricated. A standards-invalid
or dependency-blocked RNG document can remain inspectable with a truthful
entry status. Accepted members use the same bounded semantic graph and rich
presentation as standalone input; shared targets and cycles remain links rather
than expanded copies.

## DTD support

For Xerces-accepted DTD input, supported presentation includes element and
ATTLIST declarations; named, tokenized, enumerated, and notation attributes;
general and parameter entities; notations; conditional sections; content-model
structure and references; external project-local dependencies; comments;
processing instructions; declaration order; source ownership; and exact escaped
source markup. Instance-dependent validity constraints remain outside
standalone DTD grammar preparation.

External identifiers resolve only when the referenced bytes were explicitly
supplied inside the controlled virtual project. Network-based external entities,
arbitrary `file:` resources, host-drive lookup, and paths escaping the project
root are not supported.

## XSD 1.0 support

Supported XML Schema 1.0 presentation includes:

- global and local declarations, and declarations distinct from references;
- named and anonymous simple and complex types;
- elements, attributes, groups, attribute groups, compositors, and occurrence;
- simple, complex, mixed, and empty content plus element and attribute wildcards;
- qualification controls;
- simple-type restriction, list, union, and supported XSD 1.0 facets;
- extension, restriction, derivation, and built-in type ancestry;
- identity constraints, selectors, fields, and key-reference linkage;
- include, import, redefine, chameleon include, and cross-file references;
- substitution groups, shared dependencies, recursion, and cycles;
- annotations, documentation, appinfo, foreign content, comments, processing
  instructions, prolog metadata, source ownership, and exact escaped source.

This list summarizes implemented XSD 1.0 contracts. It is not a claim that XML
Carousel implements XSD 1.1 or every feature of every XML-related standard.

## Presentation contract

Support does not mean that every construct becomes a carousel card. Depending
on its semantics, the primary route may be Navigation, Search, carousel focus,
the inspector, source view, or package inventory. Relationships retain their
specific meaning: declaration, reference, containment, ownership, type use,
derivation, substitution, identity linkage, schema dependency, redefinition,
source ownership, and package membership are not collapsed into a generic
parent/child claim.

The deterministic release gate is:

```text
npm run acceptance:complete-visualization
```

`npm run validate` invokes it. Current accepted DTD/XSD/ZIP evidence is 221/221
complete, with zero partial, misleading, retained-unreachable, or source-only
rows. The separate `npm run acceptance:relaxng-complete-visualization` authority
is 77/77 complete with digest
`b5798413268b6f874ea1f9ef24909765153562bd4c04ae046fca02ea0476a5fc`.
It covers the supported RNG/RNC semantic, package, source, Search, Navigation,
Inspector, and zoom contracts without adding rows to the 221-row authority.
The result is an implementation-completeness statement for the matrix's
supported presentation contracts, not proof of universal standards coverage.

Matrix terminology means:

- `complete`: the applicable supported contract is extracted, retained,
  reachable, truthful, accessible, and tested;
- `partial`: an applicable contract is represented but an intended semantic or
  presentation obligation remains incomplete;
- `misleading`: the representation suggests semantics the source does not have;
- `retained-unreachable`: retained evidence has no practical user route;
- `source-only`: only raw/source retention exists where richer presentation is
  required;
- `not-applicable`: the surface would be semantically false for that construct
  and is intentionally unavailable.

The accepted conformance result categories are `unsupported`,
`instance-dependent`, `optional accepted`, `optional reported`,
`security-blocked`, and `metadata-disputed`. They are explicit boundaries, not
passes disguised as failures or failures disguised as passes.

## Multi-file projects and controlled resolution

The approved complete-project workflow is a ZIP that preserves relative paths.
Only files explicitly supplied by the user are available. Safe `..` segments
may resolve from the referring document's directory only when normalization
stays inside the virtual project root.

XML Carousel does not crawl the host filesystem, inherit siblings from the
selected file's original disk folder, use ambiguous basename fallback, retrieve
remote schemas, resolve arbitrary `file:` URLs, or escape the controlled root.
Unsafe archive paths are blocked. Binary and ignored entries are classified
rather than parsed, and missing
supplied dependencies are reported.

For example, opening `foundry-common.xsd` by itself fails when
`foundry-rich-text.xsd` was not supplied, even if that sibling exists elsewhere
on the computer. Opening a complete ZIP containing both files makes the safe
relative dependency available. This is intentional security and reproducible
project behavior, not a parser defect.

## Accepted release evidence

The current repository-backed evidence includes:

- W3C DTD CI: 43 pass, zero fail; DTD full: 1,912 pass, zero fail;
- W3C XSD CI: 43 pass, zero fail; XSD full: 171 pass, zero fail;
- zero conformance-harness errors, with accepted boundary categories retained;
- pinned RELAX NG corpus: 385 specification cases and 90 Compact Syntax cases,
  all selected and executed, with zero unexplained Jing/Trang disagreements;
- RELAX NG real-world corpus: DocBook, EPUBCheck, and Validator.nu, with the
  Validator.nu custom WHATWG datatype library retained as an explicit product
  boundary rather than misreported as schema invalidity;
- dedicated RELAX NG complete visualization: 77/77 and zero findings;
- Xerces-J comparison: 92 cases across 33 families, zero unexpected
  disagreements;
- Simplified DocBook: 46,263 bytes, SHA-256
  `a6581df71f08bf6020bf467c80246196bf70e37203ca430588b42487fc6476b2`,
  106 declarations, 106 Navigation records, 106 Search records, zero
  visualization findings;
- Hermetic Foundry: 3,958 normalized nodes, 3,739 source-markup records, 38
  schema sources, 44 ignored entries, three directories, 33 root candidates,
  zero visualization findings, and zero missing supplied references;
- Hermetic original/reversed/shuffled normalized SHA-256
  `f7afe07f003c8d3423f5c5ec7551afa5d8a320a2626c0f76430c7c1701327a4a`;
- adversarial audit: 6/6 families, zero external requests, zero `file:`
  requests, and zero surviving workers.

Exact changing evidence belongs in generated reports and technical audits, not
in marketing claims.

## Browser, responsive, and accessibility evidence

Automated production-browser evidence covers Chrome 151.0.7922.72 and Firefox
153.0.1. Chrome requested viewports were 1440×900, 1280×720, 1024×768,
768×900, 412×915, 390×844, 915×412, and 844×390. Firefox can enforce a larger
effective content width than a requested narrow viewport.

The evidence covers focus, semantics, responsive containment, reduced motion,
and browser lifecycle. It does not claim Safari/WebKit execution, physical
Samsung-device QA, manual screen-reader hardware testing, or browser-chrome
zoom telemetry.

## Authoritative documentation map

| Topic | Primary source |
| --- | --- |
| Project overview and supported inputs | `README.md` |
| Standards architecture, presentation, resolver, security, and evidence | this document |
| Remaining product limitations | `docs/known-limitations.md` |
| Visualization implementation evidence | `docs/technical/complete-visualization-coverage-audit.md` |
| Visualization release decision | `docs/technical/complete-visualization-acceptance-gate.md` |
| Application license | `LICENSE` |
| Third-party attribution and fixture terms | `docs/third-party-licensing.md` |
| Distributed production notices | `THIRD_PARTY_NOTICES.txt` and emitted standards-runtime attribution files |
| Runtime identities and attribution hashes | `src/standards/xerces/runtime/runtime-manifest.json` and `src/standards/relaxng/runtime/runtime-manifest.json` |
| Maintainer release procedure | `docs/release-checklist.md` |
