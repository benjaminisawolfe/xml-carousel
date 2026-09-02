# Architecture

This document describes the code currently shipped by XML Carousel. It is a
map of responsibilities and state boundaries. The exact standards and evidence
boundary is maintained in [Standards support](standards-support.md).

## Static application boundary

XML Carousel is a static browser application. `index.html` provides the mount
point, `src/main.ts` mounts `src/app/App.svelte`, and Vite compiles the Svelte
and TypeScript sources. There is no application server, database, account
system, telemetry endpoint, or schema-upload API. Browser APIs supply file
selection, local storage for one welcome preference, and Web Workers.

The production Vite build uses a relative public base. HTML assets resolve
from the document directory, while generated workers and chunks resolve from
their emitted module URLs. No deployment hostname or mount directory is a
runtime dependency.

## Schema model

`src/schema/model/` defines the normalized `SchemaProject`, nodes, edges,
source-file records, relationship kinds, validation, and indexed query
helpers. DTD, XSD, sample, and package imports all converge on this model.
Format-specific detail stays in metadata maps owned by the active-project
store rather than changing the shared graph shape. The standalone RELAX NG
preview also uses this model, but deliberately activates only one source-first
schema node until structural RELAX NG normalization is implemented.

Stable node IDs connect the normalized graph, search index, navigation path,
inspector target, and presentation state. `validateSchemaProject.ts` checks a
candidate before activation, while `schemaProjectQueryIndex.ts` provides
project-scoped lookups without requiring every view to rebuild maps.

## DTD import

Apache Xerces-C++ first authoritatively prepares and validates the supplied DTD
grammar inside the controlled virtual project. After acceptance,
`src/schema/dtd/` performs source-preserving declaration scanning,
element/content-model and ATTLIST extraction, bounded entity handling, comment
and processing-instruction retention, source-markup extraction, and complete
project construction. This TypeScript layer presents Xerces-accepted input; it
is not another standards validator.

## XSD import

Apache Xerces-C++ first authoritatively validates XML Schema 1.0 grammars.
`src/schema/xsd/` then performs namespace-aware, source-preserving extraction,
XSD AST normalization, structural/type/relationship/annotation projection, and
project construction. It retains declarations, references, ownership,
derivation, identity, dependency, redefinition, substitution, foreign content,
XML metadata, and exact source through their appropriate presentation routes.
XSD 1.1 remains unsupported.

## ZIP packages

`src/app/import/schemaArchive/` validates ZIP metadata and discovers `.dtd`
and `.xsd` members using canonical safe paths. `src/app/import/schemaPackage/`
decodes bounded entries, imports each member, remaps source-local IDs, merges
the normalized projects, resolves eligible XSD references across package
members, and records unresolved or ambiguous references. JSZip is the only
archive implementation; package processing does not fetch referenced network
resources.

The controlled Xerces map uses common-root-stripped package-relative POSIX
paths and is complete before validation begins. Likely XSD roots are the
unreferenced include/import graph members plus one deterministic representative
for each otherwise-unreachable cycle; supporting files remain in the map and
package metadata. Relative parent segments are accepted only when canonical
resolution from the referring schema stays inside the virtual root.

## Standalone RELAX NG import

`src/standards/relaxng/` owns the libxml2 RELAX NG 2.15.3 WebAssembly adapter,
typed worker protocol, disposable worker client, and production worker.
Standalone `.rng` imports transfer the exact selected bytes to this worker;
the worker validates only the one supplied virtual file and has no network or
host-filesystem resolver. `src/schema/relaxng/` then creates the intentionally
minimal source-first project only after a standards-valid result, retaining the
complete original text without inventing structural relationships.

This path is separate from the Xerces DTD/XSD/ZIP worker because the engines
and protocols have different responsibilities. It does not add `.rng` to ZIP
classification or resolve RELAX NG `include`/`externalRef` dependencies.

## Worker protocol and lifecycle

`src/app/import/schemaImportWorkerClient.ts` creates a module worker from
`src/workers/schemaImportWorker.ts`. The typed protocol in
`schemaImportWorkerProtocol.ts` carries one DTD, XSD, or ZIP request, progress
events, and one terminal success or failure. The runtime parses, builds, and
prepares the search index off the main thread. Standalone RNG validation uses
its dedicated RELAX NG worker protocol and returns only standards validation
outcomes; the controller builds the small source-first project after success.

`schemaFileImportController.ts` owns one shared revision and active-task
authority across DTD, XSD, RNG, and ZIP. A new request, explicit cancellation,
external sample activation, or teardown invalidates stale work and terminates
whichever worker owns the attempt. Request IDs and terminal-response guards
prevent an old result from replacing a newer project across formats.

## Activation and state ownership

Worker results are structured-clone data. `src/app/stores/projectSession.ts`
validates a replacement, primes query indexes, resets ID-only navigation and
inspector state, clears the independent source-view target, adopts the project
into the active-project store, and then signals presentation reset. This order
prevents old-project IDs from being observed against a new project.

The active project owns the normalized model and format metadata. Replacing a
session is atomic from the application’s perspective: projects are not merged
across separate Open or sample actions, and a failed import leaves the current
project available.

## Search

`src/app/search/` normalizes search text, creates a deterministic
project-scoped index, and executes grouped queries. Search is prepared in the
worker for imported projects when possible and adopted only when its project
ID matches. `src/ui/search/` presents grouped results with separate journey and
inspection actions; result selection reconstructs a valid structural path
rather than mutating the graph.

## Journey and inspector

`src/app/stores/navigationStore.ts` owns the carousel journey as a project ID
and ordered node path. Navigation transitions validate real structural edges,
support rootward return and reconstructed paths, and stop recursive cycle
closures at a terminal doorway.

`src/app/stores/inspectorStore.ts` owns a separate optional node ID.
Inspection never advances the journey. On project replacement it is cleared,
and its selectors resolve contained children and incoming relationships only
against the matching active project.

## Presentation and large projects

`src/ui/carousel/` derives a bounded visual window from the full journey and
outgoing relationships. It shows a focused card, a limited leafward branch
window, and a compact earlier-path window instead of rendering the whole
schema. The inspector independently filters long child lists, while outline
and schema-set presentation modules produce bounded, deterministic view data.
Import and search preparation in a worker reduces main-thread blocking;
activation still performs deliberate main-thread adoption and rendering.

## Welcome, Help, and samples

`src/schema/samples/` imports raw, checked-in Book DTD and Library XSD assets
through the production parsers and exposes a prepared catalog.
`src/app/samples/` activates a selected sample through the same project-session
boundary as local imports. `src/ui/help/WelcomeHelpDialog.svelte` supplies the
welcome and Help interface. Only the user’s “do not show on startup” choice is
stored in local storage; the selected sample and imported projects are not.

## Accessibility and keyboard model

The UI uses native buttons, links, file inputs, headings, dialogs, and status
regions where those semantics apply. The Help dialog restores focus. Carousel
controls implement spatial arrow-key movement based on visible geometry,
while normal Tab behavior remains available. Import progress, cancellation,
navigation changes, and relevant states have accessible names or
announcements. CSS honors `prefers-reduced-motion`, and compact layouts avoid
requiring the complete desktop rail.

These mechanisms are covered by component and integration tests, but they are
not a substitute for testing every assistive-technology and browser
combination.

## Source markup and safe text

DTD and XSD importers retain declaration-oriented source excerpts keyed by
normalized node ID; the standalone RELAX NG preview retains the complete `.rng`
text as its one node's source range. `sourceMarkupPresentation.ts` is the central presentation
boundary for source identity, explicit location precision, and safe fragment
selection. It uses a supplied standalone filename or a package-relative path,
rejects absolute paths, and omits identity or coordinates when the retained
evidence cannot support them.

`sourceViewStore.ts` owns only the active project ID, source node ID, and
opening origin. It is independent of journey, Inspector, Search, and semantic
zoom state and is cleared synchronously during project replacement.
`SourceViewDialog.svelte` renders selected retained fragments as inert,
whitespace-preserving text in a dedicated modal; schema content is not
injected as executable HTML. Its explicit source-copy actions pass exactly one
retained fragment to the narrow `copyText(...)` Clipboard API boundary.
Discontiguous DTD fragments remain separate rather than being synthetically
joined.

The Inspector's explicit `Copy node summary` action uses the same Clipboard
boundary with the separate, deterministic plain-text output of
`formatNodeSummary(...)`. That pure formatter consumes bounded Inspector
presentation data, reuses truthful source presentation, and does not traverse
the graph or read journey, Search, modal, browser, clock, or persistence state.
Opening source or copying either payload does not navigate, change the
Inspector target, or change Search state.

Clipboard writes stay local to the browser: the source and summary paths do
not fetch, persist, upload, or log their payloads. These presentation and copy
features do not add parser, resolver, model, validation, or standards
authority. Retained ranges identify declarations; they do not provide source
editing, round-trip serialization, or a general line-number service.

## Tests

Tests live beside focused modules and in `src/tests/` for application-level
integration. `tests/fixtures/` contains representative valid, invalid,
recursive, multi-file, and large manual-QA inputs. Vitest runs in jsdom with a
shared setup that supplies controlled browser boundaries. Source-contract
tests cover safety and workflow invariants that are meaningful without a live
browser, while production-preview QA covers real emitted workers and assets.

## Build and distribution

`npm run build` emits one portable static site with a relative public base.
Output is written to ignored `dist/`. Its `index.html`, JavaScript, CSS,
dynamic chunks, and worker resolve relative to the application directory, so
the same unchanged artifact can be served from a domain root or a nested
directory. No server hostname or mount path is compiled into the application.

`scripts/verify-static-build.mjs` enforces relative HTML assets, safely maps
them beneath `dist/assets/`, verifies both separately emitted relative workers,
and checks built-in sample presence, source maps, browser-only output, the
application CC0 license, and consolidated third-party notices. Xerces, libxml2,
and Emscripten licences and the Xerces NOTICE remain separately emitted, hashed
runtime assets. `scripts/verify-release-integrity.mjs` checks the source
documentation, locked notices, third-party fixture provenance, and packaging
contract before the build.
Distribution consists of placing the contents of `dist/` in a web-served
directory. Transfer and hosting tooling are outside the application
architecture. CI validates the portable artifact but does not deploy it. The
canonical hostname, `https://xmlcarousel.wolfshafenpress.com/`, is metadata
and documentation rather than a runtime build argument.
