# Standards support

This is the current release-facing statement of XML Carousel's validation,
presentation, resolver, security, and test boundaries. Detailed presentation
evidence remains in the
[complete-visualization coverage audit](technical/complete-visualization-coverage-audit.md)
and its [acceptance gate](technical/complete-visualization-acceptance-gate.md).

## Supported inputs and validation authority

XML Carousel accepts standalone `.dtd`, `.xsd`, and RELAX NG XML-syntax `.rng`
files, plus ZIP packages that preserve DTD, XSD, and RNG project-relative
paths.
Apache Xerces-C++ 3.3.0, compiled to WebAssembly, is the authoritative parser
and validator for XML 1.0, standalone DTD grammar preparation, and XML Schema
1.0 / XSD 1.0 within the implemented controlled-project architecture. libxml2
RELAX NG 2.15.3, also compiled to WebAssembly, is the authoritative validator
for standalone and ZIP-supplied `.rng` input. XSD 1.1 is not supported. RELAX
NG Compact Syntax (`.rnc`) is also not supported. XML instance documents are
conformance-harness inputs, not an XML Carousel product input format.

Only after Xerces accepts input do XML Carousel's TypeScript layers extract
source-preserving structures, build the normalized project, and prepare the
user interface. Those layers are not a second standards validator. A
presentation limitation must not turn otherwise Xerces-valid input into a
standards-invalid result.

## Standalone RELAX NG XML syntax

**Open RNG** validates the selected `.rng` bytes in a dedicated disposable
worker. The worker passes the exact selected bytes to libxml2 and does not
resolve `include` or `externalRef` targets from the disk, network, or another
unsupplied source. A required dependency therefore produces a missing or
security-blocked result; the standalone path performs zero external fetches.

A valid schema activates a deliberately minimal source-first project: one
RELAX NG schema node, no inferred structural relationships, the deterministic
filename identity, the validation engine identity, and the complete retained
source. Navigation, Inspector, Search, and source view remain truthful, but
structural RELAX NG extraction and visualization are not yet available. The UI
reports that limitation as a nonfatal visualization finding rather than
pretending the source-only preview is a complete semantic graph. Invalid,
blocked, cancelled, and internal-failure attempts leave the active project
unchanged.

## RELAX NG XML syntax in ZIP packages

**Open ZIP** recognizes case-insensitive `.rng` members and retains one
source-document node and the complete exact UTF-8 source for each member.
libxml2 receives all and only supplied RNG members and validates deterministic
RNG roots; Xerces continues to receive DTD/XSD roots and their controlled
resources. The engines remain separate standards authorities.

RELAX NG `include` and `externalRef` relationships are extracted
namespace-correctly for package inventory, Problems, Search, and source
routing. Safe local targets resolve by exact canonical package path. Literal
targets remain visible when missing or blocked by external-URI, filesystem, or
root-traversal policy, and no target document is fabricated. A standards-invalid
or dependency-blocked RNG document can remain inspectable with a truthful
entry status. This package representation is intentionally source-only; grammar
and pattern normalization and rich structural visualization are not yet
implemented.

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
rows. The intentionally source-first standalone RELAX NG preview is outside
that historical matrix until its structural presentation tasks are complete.
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
Unsafe archive paths are blocked. Binary and ignored entries, including
unsupported `.rnc` members, are classified rather than parsed, and missing
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
