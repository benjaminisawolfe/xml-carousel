# Xerces production validation boundary

Task 13.3 makes the reviewed Apache Xerces-C++ 3.3.0 WebAssembly adapter the
sole standards-validity authority for production DTD, XSD, and ZIP imports.
The existing TypeScript parsers remain visualization extractors during this
transition; they no longer get to reclassify a Xerces-accepted project as
standards-invalid.

## Integration boundary

Single-file DTD and XSD checks run in the existing schema-import worker after
the browser has read the selected file and before `importDtdSource` or
`importXsdSource` begins. ZIP checks run after existing safe archive discovery,
bounded extraction, UTF-8 decoding, and deterministic manifest ordering, but
before any package source is sent to the visualization extractors.

Every ZIP schema entry that the current package importer deterministically
processes is checked as a root, in manifest order, against the complete
supplied schema-file map. Diagnostics are concatenated in root and native
diagnostic order without deduplication. This preserves current package
selection semantics; a future root-selection UI remains outside this task.

The worker lazily initializes one module promise. A package reuses that module
for its ordered root checks. The native adapter resets its supplied-file map
before every root. The existing client terminates the worker after settlement,
cancellation, supersession, protocol failure, or timeout, so a later import
cannot inherit WASM memory or virtual project files from an earlier attempt.

## Outcomes and diagnostics

- `invalid` becomes a `standards-invalid` report and extraction does not run.
- `blocked` becomes a `blocked-dependency` or `resource-limit` report.
- explicit XSD 1.1 becomes `unsupported-standard` and extraction does not run.
- module initialization or execution failure becomes `engine-internal`. A
  startup failure says, “XML Carousel's standards checker could not start, so
  this file was not checked.” Package-level fallback wording says “this package
  was not checked.” A safe secondary diagnostic identifies a required runtime
  module load failure without exposing a URL, host path, stack, virtual-memory
  address, or native filesystem detail.
- `valid` proceeds to the existing visualization extractor.
- after a valid standalone DTD result, deterministic DTD visualization lint
  may add nonfatal `warning` diagnostics with source and category `dtd-lint`.
  Lint never changes the Xerces standards-validity result.
- an extractor failure after `valid` becomes `visualization-internal`, with
  wording that Xerces accepted the schema and XML Carousel could not build the
  visualization.

The existing Task 13.1 report owns the attempted import and retains complete,
ordered diagnostics up to the explicit safety limit. Cancellation and stale
results do not publish a failure report or replace the active project.

Standalone DTD input now uses two Xerces phases. `loadGrammar` first preparses
the exact user bytes. A second Xerces parser then validates a private XML probe
whose external subset is that same DTD. This second phase is necessary because
grammar preparsing alone accepts declaration-level validity errors, including
an `ID` attribute with a literal or `#FIXED` default. The validating phase
reports Xerces code `xerces-validity:8` with “ID attribute must be #IMPLIED or
#REQUIRED.” Production rejects before extraction.

The probe is deliberately not a fabricated valid instance. Its undeclared
root and empty content trigger a small, documented set of instance-only
diagnostics which are discarded by numeric Xerces domain/code, never message
text. The exact allowlist is validity codes `2`, `6`, `7`, `16`, `21`, and
`75`, and only in the probe phase. DTD declaration diagnostics, external entity
well-formedness diagnostics, and codes such as `4`, `8`, `10`, `11`, `14`,
`23`, `25`, `52`, `74`, `76`, and `77` are retained. Remaining probe source
names are replaced with the real DTD path; invented probe locations never
reach users.

Xerces's public DTD grammar enumerator supplies declared parsed general entity
names to the probe as entity references. This makes Xerces itself detect
recursive entity expansion and read supplied external parsed entities. The
controlled resolver remains the only source of bytes. The one narrow
spec-derived correction promotes Xerces XML warning code `2` (duplicate
notation declaration) to an error because XML 1.0 Fifth Edition §4.7 defines
Unique Notation Name as a validity constraint. No general-purpose validation
parser was added.

Production XSD support remains W3C XML Schema 1.0; XSD 1.1 is not claimed.
ID uniqueness, IDREF resolution, required/fixed attributes on a real element,
and content-model satisfaction remain instance-dependent and do not invalidate
a standalone DTD. The exhaustive rule and fixture audit is in
`docs/technical/dtd-conformance-matrix.md`.

### Accepted DTD visualization lint

DTD lint runs only after Xerces accepts a standalone DTD. It reports an
ATTLIST target without a matching ELEMENT declaration, later duplicate
attribute declarations, and a declaration set that contains ATTLISTs but no
ELEMENTs. Findings retain source ranges, have deterministic order and IDs
after normalization, and remain warnings. Successful imports install the new
project and may show a dismissible amber summary; they do not create a failed
problem report.

An undeclared ATTLIST target is represented by a real `dtdAttributeList` node,
not a fabricated `dtdElement`. Its effective attributes, source declarations,
outline entry, focus card, inspector, and search document remain available.
For duplicate attributes, the first declaration is effective and later
declarations remain visible in source while lint explains that they were
ignored by the visualization.

The key corrected fixture classifications are below. The complete 59-fixture
inventory is in the conformance matrix.

| Fixture or matrix case | Exact classification | Xerces result | Visualization result |
| --- | --- | --- | --- |
| `tests/fixtures/dtd/attlist-undeclared-element.dtd` | `legal-with-lint-warning` | valid, with a Xerces warning | ATTLIST-only project with two DTD lint warnings |
| `tests/fixtures/dtd/duplicate-attribute.dtd` | `legal-with-lint-warning` | valid, with a Xerces warning | first attribute binding effective with one DTD lint warning |
| `tests/fixtures/zip/duplicate-dtd-names.zip` | `legal-and-unremarkable` | both package members valid | paths remain distinct, with no DTD lint warning |
| `attlist-before-element` inline case | `legal-and-unremarkable` | valid, no diagnostic | declaration order is accepted and visualized |
| `tests/fixtures/dtd/broken.dtd` | `not-well-formed-dtd-or-external-entity` | invalid | extraction does not run |
| `tests/fixtures/dtd/unterminated-comment.dtd` | `not-well-formed-dtd-or-external-entity` | invalid | extraction does not run |
| `missing-entity.dtd` and `remote-entity.dtd` spike controls | `security-or-resolution-failure` | blocked | no network or host fallback; extraction does not run |
| duplicate `ELEMENT` fixture | `standards-invalid-declaration` | invalid, code `10` | extraction does not run |
| `tests/fixtures/dtd/unresolved.dtd` | `legal-with-optional-warning` | valid, with Xerces warning `5` | current extractor may reject the unresolved visualization reference |
| duplicate entity inline case | `visualization-regression` | valid, no diagnostic | entity declarations are outside the current extractor subset |
| duplicate notation fixture | `standards-invalid-declaration` | invalid, Xerces detection code `2` promoted per §4.7 | extraction does not run |
| `tests/fixtures/dtd/invalid-id-default.dtd` | `standards-invalid-declaration` | invalid, code `8` | extraction does not run |
| `tests/fixtures/dtd/invalid-enumeration-default.dtd` | `standards-invalid-declaration` | invalid, code `23` | extraction does not run |
| empty DTD inline case | `visualization-regression` | valid, no diagnostic | current import requires a visualizable declaration |
| entity-only inline case | `visualization-regression` | valid, no diagnostic | no supported visualizable declaration is extracted |

XML-instance-only conformance is `instance-dependent`; the committed
`instance-dependent-idrefs.dtd` fixture proves that a legal standalone grammar
is not falsely rejected for absent document IDs or IDREF targets.

## Controlled project and limits

Xerces sees only normalized project-relative paths and bytes supplied by the
current import. HTTP, HTTPS, FTP, `file:`, UNC, drive-letter, absolute,
traversal, encoded traversal, mixed-separator traversal, control-character,
duplicate, and over-limit paths are rejected. Xerces networking and the
Emscripten filesystem are disabled; there is no fallback to browser fetch or a
host filesystem.

The production limits intentionally do not exceed existing ZIP/package limits:

| Limit | Value | Rationale |
| --- | ---: | --- |
| Supplied schema files | 250 | Existing ZIP schema-file maximum |
| Aggregate supplied bytes | 20 MiB | Existing extracted package maximum |
| Normalized path | 512 Unicode code points | Existing archive path maximum |
| Path depth | 32 segments | Existing archive path-depth maximum |
| Dependency depth | 32 levels | Bounded recursive resolution, cycle-safe |
| Retained diagnostics | 500 | Bounded memory without the removed 50/100 caps |
| Worker lifetime | 30 seconds | Hard termination boundary for untrusted work |
| ZIP input/expansion | Existing 20 MiB archive, 1,000 entries, 5 MiB per schema entry | Existing production policy |

When the 500-diagnostic boundary is reached, the final retained diagnostic
explicitly states that truncation occurred.

## Reviewed runtime and reproducibility

The committed files in `src/standards/xerces/runtime` come from Xerces-C++
3.3.0 source SHA-256
`c35a6f04e853bde456c65ec38a4496c7ccf60b27c6989ff4e2149db9ea40648c`
and Emscripten 6.0.5. The accepted build uses `-O2`, JavaScript exception
handling, no LTO, `network=OFF`, and `FILESYSTEM=0`. Upstream source is
unpatched.

| Artifact | Raw bytes | Gzip bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `xerces-runtime.js` | 27,151 | 6,497 | `e00a4618d52f24aa24a8d6d49173cfb2a7556627a7c71ef54650dde00923becc` |
| `xerces-runtime.wasm` | 2,162,515 | 547,399 | `4b12de73b9b8ca974ea9caca2bcf38b7538c4a48fac8f52a98a80cfbdec6ab74` |

`runtime-manifest.json`, the Xerces Apache licence and NOTICE, and the
Emscripten licence are committed beside the artifacts. Normal validation runs
`npm run verify:xerces-runtime`; it checks filenames, pins, configuration,
sizes, gzip sizes, hashes, and attribution without a compiler or network.

Vendor maintenance remains explicit: rebuild through the pinned Task 13.2
bootstrap/build commands, then run `npm run vendor:xerces:publish-runtime`.
Normal installation, tests, and builds never invoke Emscripten, CMake, Ninja,
downloads, or the ignored spike output.

Vite emits the reviewed glue, WASM, manifest, licence, and notice files as
hashed worker-relative assets. The worker resolves them with `new URL(...,
import.meta.url)`, and distribution verification rejects location-specific
paths.

The Task 13.4 adapter correction keeps supplied project paths strict while
resolving dependency references against the referring document directory.
References are percent-decoded and slash-normalized before policy checks;
safe parent segments pop canonical path segments, while a pop above the
virtual root is blocked. Absolute paths, drive paths, schemes, `file:` URLs,
network retrieval, host files, basename fallback, and ambiguous aliases remain
unavailable. No Xerces upstream source was patched.

Reproducibility was verified with two clean invocations of
`npm run spike:xerces:build`, deleting only
`tools/xerces-wasm-spike/build/xerces-js-exceptions` and
`tools/xerces-wasm-spike/dist` before each invocation and making no source
change between them. Both JS outputs and both WASM outputs were byte-identical
with the hashes and sizes above. Publication used
`npm run vendor:xerces:publish-runtime`; the manifest now records the
`common-root-relative-posix` namespace, referring-document base, safe
within-root parent normalization, and disabled external retrieval.

### Static-host MIME portability correction

Manual deployed-build QA exposed a blocking MIME mismatch: the production
worker requested the emitted `assets/xerces-runtime-DR4jJObj.mjs`, and the
static host returned `Content-Type: application/octet-stream`. Chrome rejects
an ECMAScript module before executing it when its response has that MIME type,
so Xerces never initialized. Vite's development server supplied a JavaScript
MIME type for `.mjs`, which is why development-server QA did not reproduce the
deployment failure.

Production publishes the reviewed glue bytes as
`xerces-runtime.js` and continues to let Vite resolve the dynamic module URL.
Ordinary static servers already map `.js` to a JavaScript MIME type; production
has no `.mjs` file, URL, manifest entry, or build reference. The MIME-safe
packaging remains unchanged by the later virtual-project resolver rebuild.

Before starting Emscripten in a browser or worker, the adapter fetches the
worker-relative WASM as bytes, compiles those bytes, and supplies a synchronous
`instantiateWasm` hook to the generated module. This deliberately avoids
`WebAssembly.instantiateStreaming` when a static host returns
`application/octet-stream`, while retaining normal local file loading for the
Node-based runtime tests. A missing or failed WASM response becomes the safe
engine-startup diagnostic, never a schema-validity result.

The deterministic hostile-MIME regression server mounts the same unchanged
`dist` at `/` and `/xml-carousel/`, serves `.js` as JavaScript, and deliberately
serves both `.mjs` and `.wasm` as `application/octet-stream`. Static verification
also rejects any `.mjs` output or `xerces-runtime.mjs` text reference and checks
that the nonempty production worker names the hashed JavaScript and WASM
assets. The remaining host assumptions are only ordinary HTTP static-file
semantics: successful local relative asset requests, byte-preserving responses,
JavaScript MIME for `.js`, and no response rewriting of the hashed files. No
provider-specific MIME rule, backend, network retrieval, or schema/entity
access is required.

## W3C XML conformance audit

The developer harness pins XML W3C Conformance Test Suite 20130923 from
`https://www.w3.org/XML/Test/xmlts20130923.zip`, archive SHA-256
`f9510b3532926e1b4c2e54855b021e4b8a66ec98a5337dcf4ff07e8a41968deb`.
The archive and extraction stay under the ignored
`tools/xerces-wasm-spike/.cache/w3c-xmlconf-20130923/` directory. The committed
manifest records all 2,586 metadata tests, exact per-case expected category,
edition, rules, required files, hashes for committed CI dependencies,
selection/exclusion, and the stable 64-case CI flag. Task 13.9 selects 1,950
applicable cases: 1,735 directly relevant DTD/entity rows and 215 explicitly
nonproduction complete-document rows.

The expanded CI run classifies 43 pass, 1 unsupported, 2
instance-dependent, 2 optional-error accepted, 14 optional-error reported, and
2 blocked by security policy. The expanded full run classifies 1,912 pass, 1
unsupported, 4 instance-dependent, 4 optional-error accepted, 20
optional-error reported, and 9 blocked. Both have zero fail and zero
harness-error. None of the nonpass categories is reported as a pass.

## W3C XSD and external-package evidence

Task 13.9 adds a bounded official W3C XML Schema 1.0 Second Edition harness:
52 offline CI cases and 182 full selected cases across 24 families. CI reports
43 pass, 1 unsupported, 2 instance-dependent, 2 security-blocked, 4
metadata-disputed, and zero fail/optional/harness-error. Full reports 171 pass,
3 unsupported, 2 instance-dependent, 2 security-blocked, 4 metadata-disputed,
and zero fail/optional/harness-error. Three official invalid schemas expose
Xerces-C++ 3.3.0 limitations also rejected by Xerces-J 2.12.2; they remain
unsupported evidence and caused no production adapter rewrite.

The external Hermetic Foundry archive is now verified against a committed
metadata-only expectation. Original, reversed, and deterministically shuffled
entry orders produce the same valid-and-partial project: 38 sources, 2,134
nodes/Search documents/source-markup nodes, zero unresolved references, and
510 findings. Standalone `foundry-common.xsd` remains blocked for its
unsupplied sibling. See
`docs/technical/expanded-conformance-hermetic-regression.md` for the complete
corpus identities, exclusion totals, disagreement ledger, and local commands.
