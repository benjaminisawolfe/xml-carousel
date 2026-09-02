# RELAX NG normalized semantic model

## Boundary

Task 17.6 adds an internal, source-preserving semantic model for standards-valid
RELAX NG XML syntax. libxml2 RELAX NG 2.15.3 remains the only production
validity authority. The TypeScript extractor and binder never reject a schema,
replace libxml2 diagnostics, or turn a semantic limitation into standards
invalidity.

The existing source-first `SchemaProject` remains unchanged: standalone and ZIP
RNG sources still produce one `relaxNgSchema` document node per supplied source.
The semantic model is retained only in active-project metadata. Search,
Navigation, carousel, Inspector, Full, Compact, Overview, and package-outline
presentation do not consume it. Task 17.7 owns that mapping.

## Layers and parser reuse

The pipeline is:

```text
retained RNG source
  -> existing namespace-aware XSD XML lexer/parser and source map
  -> RELAX NG source parser boundary
  -> package-reference projection
  -> semantic construction and graph binding
```

`relaxNgSourceParser.ts` is the one lower-level RELAX NG source traversal.
Task 17.5 `include`/`externalRef` extraction now projects from it, so package
resolution and semantic extraction cannot diverge through separate XML lexers.
The package reference projection remains usable for readable invalid or blocked
sources; it does not depend on semantic eligibility.

## Project-level shape

`RelaxNgSemanticModel` is versioned plain data containing ordered arrays of:

- semantic documents and grammar scopes;
- physical start and define clauses;
- effective start symbols and named definition groups;
- explicit pattern and name-class unions;
- params, include components, annotations, and typed documentation;
- graph bindings and bounded semantic findings.

It contains no DOM nodes, `Map`, `Set`, classes, functions, browser `File`
objects, native handles, or repeated source text. The complete original source
continues to live once in existing source storage; semantic constructs retain
source-file IDs and ranges. The model survives `structuredClone`, worker
`postMessage`, and JSON serialization.

## Identity and source fidelity

Every source-backed construct receives a deterministic ID derived from its
source-file ID, RELAX NG semantic role, and parser source order. Effective
symbols use deterministic IDs derived from their owning grammar and semantic
name. IDs do not use randomness, object identity, memory addresses, or byte
offsets.

Source-backed records retain `sourceFileId`, a UTF-16 source range, and source
order. Named or valued constructs additionally retain reliable attribute or
content ranges for `name`, `href`, `combine`, `type`, `datatypeLibrary`, `ns`,
value, and param data where the shared XML AST provides them. Missing precision
is omitted rather than fabricated. Exact lexical value source is retained
separately from decoded semantic value.

## Grammar scopes and symbols

Every `grammar` creates a real scope with its document, parent grammar, owning
pattern, starts, definition groups, includes, and source identity. Nested
grammars are never flattened. A `parentRef` therefore resolves against its
actual parent grammar rather than a same-named local definition.

Physical `<start>` and `<define>` clauses remain separate records. Effective
start symbols and named definition groups link contributing clauses and retain
`choice` or `interleave` combine information without inventing a source range
for a synthetic group. `ref` and `parentRef` records link to group IDs; targets
are not copied or recursively substituted. Direct and mutual recursion are
ordinary bounded graph cycles.

## Pattern and name-class unions

The pattern union explicitly represents `grammar`, `element`, `attribute`,
`choice`, `group`, `interleave`, `optional`, `zeroOrMore`, `oneOrMore`, `mixed`,
`list`, `text`, `empty`, `notAllowed`, `data`, `value`, `ref`, `parentRef`, and
`externalRef`.

Element and attribute shorthand names and explicit child name classes normalize
to one first-class name-class union: `name`, `anyName`, `nsName`, and `choice`.
`anyName` and `nsName` exclusions link to structured name-class records. Name
records preserve the lexical QName plus determinable local name and namespace
URI. Unprefixed attribute names correctly remain in no namespace unless an
explicit RELAX NG `ns` changes that meaning.

`data` retains effective datatype library, type, ordered params, and structured
except patterns. `value` retains decoded and exact-source lexical forms, type,
datatype context, and namespace bindings needed for QName-like values.
Terminal patterns remain explicit; `notAllowed` is not an extractor failure.

## Namespace and datatype contexts

Each pattern retains explicit context when written and the effective inherited
`ns` and `datatypeLibrary` values. Explicit empty values remain distinct from
absence. Context is passed immutably during construction; ancestor objects are
never mutated. RELAX NG target names are not confused with the namespace of the
XML elements that encode RELAX NG syntax.

## Includes, external references, and package eligibility

An include is a grammar component with literal `href`, range, package
relationship ID/status, optional target document/grammar links, and physical
override start/define clauses. Resolved target contributions are linked, not
cloned. Overrides remain source-owned by the including document; non-overridden
target groups are exposed through contribution-group links. Shared targets
exist once, and visited scope IDs terminate include cycles.

An `externalRef` remains a first-class pattern with literal `href`, range,
package relationship identity/status, and optional target document/root links.
Missing, ambiguous, blocked, or external targets never receive fabricated
semantics and never trigger retrieval.

For ZIPs, semantic eligibility is the deterministic dependency closure of every
libxml2-valid RNG root, following only resolved RNG include/externalRef
relationships. Invalid, missing, ambiguous, and blocked roots remain available
through Task 17.5 source-first package information but do not imply a valid
semantic document. A shared dependency accepted through any valid closure is
modeled once.

## Annotations and DTD Compatibility metadata

Foreign-namespace elements and attributes are retained as inert structured
metadata on their nearest semantic owner with namespace/local/qualified names,
attributes, text, range, and order. DTD Compatibility
`a:documentation` additionally becomes typed documentation with text,
`xml:lang`, owner, range, and order. `a:defaultValue` becomes structured
attribute-pattern metadata. This is preservation, not a second DTD
Compatibility validator, and no raw metadata is rendered as HTML.

## Integration, lifecycle, and findings

The dedicated standalone worker appends semantic data only after a `valid`
libxml2 result. If extraction fails, the worker returns the unchanged valid
standards result, omits the model, and records a nonfatal semantic finding. ZIP
semantic construction runs after root standards results are known. Worker
termination and existing attempt/revision ownership discard cancelled,
superseded, timed-out, or stale semantic work.

The small finding vocabulary is limited to extractor-internal,
unresolved-binding, unsupported-valid-construct, and unavailable-range cases.
Findings are internal semantic/presentation evidence, never standards errors.
The model-integrity validator checks duplicate IDs, missing graph targets,
grammar/pattern/name-class identities, source identities, and range shape for
tests and development assertions only.

## Task 17.7 handoff

Task 17.7 may map this retained model into RELAX NG-specific presentation,
Search, Navigation, carousel, Inspector, and semantic-zoom behavior. It must
continue to preserve the validator/extractor boundary, reference identity,
source ranges, graph sharing, and the existing no-retrieval policy.
