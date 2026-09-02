# RELAX NG standards and product contract

## Authority and release boundary

This document is the implementation authority for XML Carousel Tasks
17.2–17.10 and the `0.3.0` RELAX NG milestone. XML Carousel `0.3.0` is not
complete until both RELAX NG XML syntax (`.rng`) and RELAX NG Compact Syntax
(`.rnc`) are first-class inputs.

The later user-facing control is **Open RNG**. Task 17.1 adds no control,
placeholder UI, file-picker acceptance, production format branch, or dependency.

Standards authority is routed by schema language:

- Apache Xerces-C++ WebAssembly remains authoritative for DTD and XSD 1.0.
  RELAX NG work must not migrate either existing format away from Xerces.
- libxml2 2.15.3 WebAssembly is the sole production RELAX NG validity
  authority. XML syntax reaches it directly; Compact Syntax reaches it through
  the deterministic Task 17.8 validation mapping.
- The production Compact Syntax front end is project-authored TypeScript. RNV,
  Trang, and Jing remain development evidence/oracles, not browser runtimes or
  production authorities.
- Jing is an independent development and conformance comparator.
- Trang is an independent RNG/RNC translation oracle.

Task 17.2 is the dependency and architecture evidence gate. This contract does
not pin or install libxml2, Jing, Trang, RNV, Java tooling, or another runtime.

## Supported RELAX NG target

The `0.3.0` target covers standalone and supplied multi-file/ZIP projects in
both `.rng` and `.rnc`, including:

- `grammar`, `start`, `define`, `ref`, and `parentRef`;
- `element`, `attribute`, `choice`, `group`, and `interleave`;
- `optional`, `zeroOrMore`, `oneOrMore`, `mixed`, and `list`;
- `text`, `empty`, `notAllowed`, `data`, `value`, `param`, and `except`;
- `include`, `externalRef`, name classes and exclusions;
- `combine="choice"` and `combine="interleave"`;
- datatype libraries, including supported XML Schema datatypes;
- explicitly accepted RELAX NG DTD Compatibility features; and
- annotations, documentation, and foreign content.

Where semantically applicable, RELAX NG must participate truthfully in the
existing Problems, Navigation, Search, carousel, Inspector, source view, Copy
source, Copy node summary, Full/Compact/Overview, focused Overview Inspect, and
ZIP/package-presentation surfaces. Format-specific RELAX NG pattern semantics
must not be forced into DTD or XSD abstractions.

## Explicit `0.3.0` non-goals

The milestone does not include NVDL, Schematron, XML instance-document product
validation, remote retrieval, arbitrary host-filesystem discovery, editing,
export, or persistent project reopening. Tasks 17.x must not add scaffolding for
these features. In particular, the opt-in external-resolution work planned for
`0.4.0` must not leak into `0.3.0`.

## Universal schema-reference rule

> References are schema information even when their targets are unavailable.
> XML Carousel represents the reference faithfully and represents target
> contents only when the target was actually supplied and safely resolved.

This rule applies across formats to:

- DTD external subsets and external entities;
- XSD `xs:include`, `xs:import`, and `xs:redefine`; and
- RELAX NG `include` and `externalRef`.

For `0.3.0`, references may resolve only against bytes the user explicitly
supplied within the controlled project. Literal targets and resolution state
must remain available to appropriate Problems, Inspector, package inventory,
source, Search, Navigation, or dependency presentation even when the target is
missing, ambiguous, blocked, or unavailable. HTTP/HTTPS, `file:`, absolute,
host-filesystem, outside-root traversal, and other external targets are
represented but never retrieved. An unavailable target must not be fabricated,
matched by unsafe basename fallback, or presented as a loaded schema document.

## Source fidelity

Exact user source, source identity, and supported source locations are product
data. If Compact Syntax is translated internally from `.rnc` to equivalent
`.rng`, the generated XML is implementation material. It must never replace the
original `.rnc` in View source, Copy source, source identity, source location,
diagnostic source presentation, package identity, or any other user-facing
source surface.

Equivalent `.rng` and `.rnc` schemas yield equivalent
semantic graphs and relationship meaning while retaining distinct original
source. Task 17.8 owns that executable equivalence and fidelity contract.

The Compact front end is browser/worker-safe, deterministic, supplied-files
only, and dependency-free. Native lexical/syntax diagnostics are emitted before
libxml2 startup. Its transient XML and generated line map exist only within the
attempt; no generated member is added to source storage or ZIP inventory.

## Validator and extractor separation

Standards validation authority and visualization extraction remain separate.
The accepted standards engine decides RELAX NG validity. Extractors normalize
and present accepted schemas; they must not create a second RELAX NG validity
gate. A standards-valid schema must not become invalid because presentation is
partial or does not yet understand a construct. Such a condition is a bounded,
truthful visualization limitation, not standards invalidity.

Common import behavior—cancellation, timeout, stale-result suppression,
replacement safety, diagnostic retention, source privacy, and controlled local
resolution—belongs at the shared lifecycle/security layer. Engine behavior
belongs in engine-specific tests, and schema-language semantics belong in
schema-specific tests.

## Task gates

- **17.2:** prove engine/front-end feasibility, differential behavior, source
  fidelity, diagnostics, controlled resolution, lifecycle, and cleanup.
- **17.3:** integrate the accepted production standards engine and worker
  routing without changing Xerces DTD/XSD authority.
- **17.4:** add standalone `.rng` import, normalized diagnostics, source
  identity, lifecycle behavior, and the **Open RNG** control; extend to `.rnc`
  only when its production path exists.
- **17.5:** add RELAX NG package classification and safe `include`/`externalRef`
  preservation and resolution.
- **17.6:** add the source-preserving RELAX NG semantic model without a second
  validity gate.
- **17.7:** add RELAX NG presentation, Search, Navigation, carousel, Inspector,
  semantic zoom, and package-surface behavior.
- **17.8:** complete Compact Syntax with original-source fidelity and semantic
  equivalence.
- **17.9:** establish dedicated RELAX NG conformance and complete-visualization
  gates. Do not redefine the existing DTD/XSD/ZIP 221/221 matrix.
- **17.10:** stabilize end-to-end behavior and update current-facing product,
  release, and support documentation for `0.3.0`.
