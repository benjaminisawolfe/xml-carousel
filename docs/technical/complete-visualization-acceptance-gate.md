# Complete-visualization acceptance gate

Task 13.18 makes supported presentation completeness a deterministic,
network-free release condition. Run it directly with:

```text
npm run acceptance:complete-visualization
```

The canonical `npm run validate` command invokes that decision, and hosted CI
invokes `npm run validate`. Ordinary validation compares generated evidence
with committed evidence and never rewrites tracked files.

## Authority boundary

Apache Xerces-C++ remains the sole standards-validity authority for XML 1.0
DTD and W3C XML Schema 1.0. The acceptance gate consumes Xerces-accepted
results and verifies supported presentation completeness. It is not an XML
parser, a second validity gate, a second normalized graph, or a package
resolver.

Task 13.18 adds no XSD 1.1 support, network retrieval, `file:` access,
host-filesystem discovery, basename fallback, or weakened project-root
security. Unsupported standards features, instance-dependent validation,
security-blocked resolution, optional accepted/reported cases,
metadata-disputed cases, binary entries, ignored entries, and unsafe archive
entries retain their existing classifications; the gate does not silently
promote them to complete support.

## Acceptance contract

The authoritative implementation is
`scripts/complete-visualization-acceptance.mjs`. It derives its decision from:

- the generated 221-row visualization coverage matrix and catalogue;
- the 52 normalized node kinds and 52 normalized edge kinds;
- the five authoritative package-entry kinds;
- the `schemaReachability` contract registry;
- visualization diagnostic policies;
- accepted Simplified DocBook and Hermetic Foundry evidence.

A supported matrix row passes only when its classification and every
presentation layer are `complete`, its finding list is empty, its test and
deterministic evidence exist, its stable ID is unique, and its Task 13.11–13.17
owner remains correct. The committed matrix must be byte-identical to
deterministic regeneration.

Every current node, edge, and package-entry kind must have exactly one
reachability contract. Node and package routes specify availability, action,
target, and stable focus result for Navigation, Search, carousel, inspector,
and source view. Actionable routes require a known activation handler and a
nonempty accessible name. A surface that is semantically inappropriate must
say `not-applicable`; that explicit declaration is complete, not missing.
Inspector-first and source-oriented records do not fabricate carousel focus,
and package records remain package-inventory-first.

Retained opaque, foreign, annotation, appinfo, comment, processing-instruction,
prolog, and other source-oriented content passes only through its established
safe inert routes: retained source ownership, practical inspector/source
reachability, escaped text, and no fabricated semantic relationship.

The following post-Xerces visualization-policy codes are release-blocking for
supported accepted input:

```text
dtd:unresolved-element-reference
dtd:unsupported-declaration
dtd:unsupported-syntax
xsd:invalid-annotation-placement
xsd:multiple-annotations
xsd:unsupported-explicit-local-form
xsd:unsupported-xsd-component
```

The list is generated from the importer diagnostic policies rather than
maintained as a separate classification table. Standards errors, an unsupplied
sibling, unsafe paths, and other non-presentation diagnostics remain governed
by their existing policies.

## Deterministic accepted evidence

The Simplified DocBook fixture is fixed at 46,263 bytes and SHA-256
`a6581df71f08bf6020bf467c80246196bf70e37203ca430588b42487fc6476b2`.
The gate imports it only as already standards-accepted presentation input and
requires 106 element declarations, 106 Navigation records, 106 Search records,
zero visualization findings, and resolved `revision` references.

The committed Hermetic Foundry metadata fixes the accepted external archive at
134,821 bytes and SHA-256
`c17ce1c44cd5aa309bcc652bb43f64e30bc993aef52a0347cfbc799a32886a8f`.
It requires 3,958 normalized nodes, 3,739 source-markup records, 38 schema
sources, 44 ignored entries, three directories, 33 root candidates, no missing
supplied reference, no visualization finding, and the normalized result
SHA-256
`f7afe07f003c8d3423f5c5ec7551afa5d8a320a2626c0f76430c7c1701327a4a`.
Committed permutation evidence must agree for original, reversed, and
deterministically shuffled entry order. The separate exact-archive regression
reruns those permutations. `foundry-common.xsd` alone must still fail because
`foundry-rich-text.xsd` was not supplied.

## Failure behavior

The command exits nonzero with the exact matrix row ID or normalized/package
kind and failed invariant. Focused mutation tests cover incomplete and
misleading rows, duplicate IDs, owner drift, missing and stale reachability
contracts, omitted surfaces, absent handlers, impossible targets, accidental
source-only fallback, unspecified focus, blocking findings, and stale generated
output.

Browser claims remain limited to environments actually rerun for a release.
Automated focus, semantics, responsive containment, and reduced-motion checks
do not claim physical-device or manual screen-reader coverage.
