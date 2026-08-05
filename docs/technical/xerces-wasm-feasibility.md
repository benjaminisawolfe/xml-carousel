# Xerces-C++ WebAssembly feasibility

## Executive result

Apache Xerces-C++ 3.3.0 can be compiled to a browser-loadable WebAssembly
module and can validate supplied XSD 1.0 grammars and preparse standalone DTD
grammars without network or host-filesystem access. The experiment preserves
project-relative source identities, resolves only supplied dependencies,
returns structured diagnostics, runs in a disposable worker, and loads from
both root and nested static paths. It is technically suitable as the basis of
a Task 13.3 production design, but it should not be integrated unchanged: the
production phase needs a product-level resource policy, an attribution review,
broader corpus work, and a deliberate worker lifecycle/performance design.

This is an isolated developer experiment. It is not imported by the XML
Carousel application, does not replace the production parser, and never reads
or mutates the active project.

## Pinned inputs and reproducibility

| Input | Pin | Integrity |
| --- | --- | --- |
| Xerces-C++ | 3.3.0, `xerces-c-3.3.0.zip` from the Apache archive | SHA-256 `c35a6f04e853bde456c65ec38a4496c7ccf60b27c6989ff4e2149db9ea40648c`, verified |
| emsdk | tag 6.0.5, commit `dfb9d1a46c3bb8f52e1e6324be23123b9d73c190` | Git commit verified; installed compiler reports Emscripten 6.0.5 |
| CMake | 4.4.2, Windows x86-64 archive | SHA-256 `e8139d85b3813bc38833142ae1940472e9a587e9b5d2718ac1804c60f4e57a64`, verified |
| Ninja | 1.13.2, Windows archive | SHA-256 `07fc8261b42b20e71d1720b39068c2e14ffcee6396b76fb7a795fb460b78dc65`, verified |
| Selected W3C corpus | `w3c/xsdtests` commit `7bc3365c652a322f3d762021b3879eb92dae7e30` | Per-case SHA-256 values in `tests/fixtures/xerces-wasm-spike/w3c-selected-cases.json` |

The downloaded archives, extracted source, emsdk, build tools, W3C case
contents, build trees, and outputs live only in narrowly ignored directories
under `tools/xerces-wasm-spike`. Bootstrap scripts verify pins and support an
`-Offline` integrity/reuse mode after the first successful download. No emsdk
environment was activated permanently or globally.

## Build architecture

`scripts/build.ps1` invokes project-local CMake and Ninja through the pinned
emsdk toolchain. Xerces is a static Release library with `network=OFF`, the
in-memory message loader, `nothreads`, the POSIX file manager, the iconv
transcoder supplied by Emscripten, and SSE2 disabled. ICU is not linked.

The accepted adapter link uses:

```text
-O2
-fexceptions
-sDISABLE_EXCEPTION_CATCHING=0
-sMODULARIZE=1
-sEXPORT_ES6=1
-sENVIRONMENT=web,worker,node
-sALLOW_MEMORY_GROWTH=1
-sFILESYSTEM=0
```

Only the adapter entry points, allocation functions, and minimal Emscripten
runtime helpers are exported. The normal Vite build has no dependency on the
source, SDK, tools, build tree, or generated spike module.

No upstream Xerces source patch or scripted source transformation is used. An
initial `-fwasm-exceptions -flto` experiment hit a Binaryen validation
assertion, and repeated `-O3` post-link optimization attempts also crashed.
The accepted build therefore uses Emscripten JavaScript exception handling,
no LTO, and `-O2`. This compiler-mode compromise is the principal build risk to
revisit when upgrading Emscripten.

## Adapter and worker contract

The TypeScript request is a plain serializable object:

```text
{ attemptId, format: "xsd" | "dtd", entryPath,
  files: [{ path, bytes: Uint8Array }] }
```

The response contains the same attempt ID; engine name and runtime version;
`valid`, `invalid`, `unsupported`, `blocked`, or `internal-error`; a diagnostic
array; and elapsed time, file count, and input-byte metrics. Diagnostics align
with the Task 13.1 shape: stable ID, error/warning/info severity, message,
optional file, line, column and code, and a source category. Xerces-C++ does
not expose the Xerces-J-style schema error keys through `SAXParseException`, so
native parse diagnostics use a severity-level Xerces code while retaining the
full message and location. Project-policy diagnostics have specific codes such
as `xerces-spike:resolution-blocked`.

The C++ boundary copies every path and byte buffer before returning from the
call. It resets the native project map before each attempt and reports the
actual runtime version, 3.3.0. The browser client rejects and terminates any
older attempt before creating a replacement worker; request IDs suppress stale
messages. Cancellation terminates the worker, which also discards its WASM
memory and virtual project. Automated and browser tests confirmed recreation,
stale-result rejection, cleanup, and valid-invalid-valid repetition.

## XSD 1.0 findings

The real module correctly accepted simple, recursive, and advanced XSD 1.0
schemas covering facets, lists, unions, complex-type extension, identity
constraints, substitution groups, and wildcards. It resolved local
`xs:include` and `xs:import` dependencies, including two different
`common.xsd` files in separate directories. It rejected malformed schemas and
grammar errors with useful source lines and columns and emitted multiple
diagnostics when Xerces recovered far enough to continue.

Missing, remote, and traversal dependencies produce a blocked result rather
than a misleading valid result. An explicit XSD 1.1 requirement is detected
and returned as unsupported; XSD 1.1 itself remains outside scope. This spike
compiles an entry grammar and its declared dependency graph. It does not merge
unreferenced same-namespace XSD files merely because they are present in a
package.

## Standalone DTD findings

`XercesDOMParser::loadGrammar(..., Grammar::DTDGrammarType, true)` provides a
real standalone DTD grammar-preparse path; it does not fabricate an XML
instance. Valid declarations, local parameter entities, and conditional
sections were accepted. Broken element declarations, broken attribute lists,
multiple syntax errors, missing parameter entities, remote entities, and
declaration warnings produced the expected valid, invalid, or blocked states
with locations where Xerces supplies them.

The limitation is semantic: preparsing checks DTD grammar declarations and
constraints, but document-validity rules that require an XML instance cannot
be exercised by a standalone DTD alone. The harness states this explicitly.

## Resolver and security findings

The adapter exposes a controlled virtual project rather than Emscripten's
filesystem. Paths are normalized as project-relative identities and nested
directories are preserved. Resolution is limited to the supplied file map.
Network support is disabled in Xerces and `-sFILESYSTEM=0` removes the
Emscripten filesystem layer.

The shared path policy rejects HTTP, HTTPS, FTP and file URLs; UNC and drive
paths; absolute paths; dot traversal; percent-encoded and double-encoded
traversal; mixed separators; control characters; and paths longer than 1,024
characters. Missing local dependencies and rejected references receive
specific blocked diagnostics. Browser tests confirmed both XSD and DTD remote
references are blocked, with no console errors or retrieval attempt.

The developer harness proposes, but does not establish as production policy,
limits of 1,000 files, 64 MiB aggregate input, and 1,024 characters per path.
Task 13.3 must select measured production limits, ZIP expansion controls,
diagnostic caps, per-attempt timeouts, and a policy for very deep dependency
graphs. Worker termination is the reliable hard-cancellation mechanism.

## Corpus and comparison results

The focused suite contains committed synthetic XSD and DTD fixtures plus a
manifest for three checksum-pinned official W3C cases. All 35 tests passed.
The selected W3C outcomes were:

| Case | Expected | Xerces-WASM |
| --- | --- | --- |
| `msxsdtest/identityConstraint/idC001` | valid | valid |
| `ms/simpleType/stE001` | valid | valid |
| `ms/simpleType/stE002` | invalid | invalid |

The repository and its documented local paths contain no Hermetic Foundry
schema package or approved corpus archive. No broad host-filesystem search or
unapproved download was performed. The directory and ZIP harness is ready for
that corpus when an exact authorized source is supplied, but no Hermetic result
is claimed.

Xerces-J 2.12.2, using the public JAXP `SchemaFactory`, independently agreed on
the valid simple schema, the invalid grammar-error schema, and the valid local
include and import cases. Both engines located the duplicate declaration,
unresolved type, and illegal facet on the same source lines; wording and count
differed. The public Java schema API has no equivalent standalone-DTD grammar
compile operation, so no DTD comparison is represented as performed.

## Performance and artifacts

The first clean Xerces/adapter build on the audited Windows host took 150.368
seconds. An adapter-only incremental link took 4.89 seconds during iteration;
the final no-op configured build, including configuration and manifest work,
took 5.207 seconds. The direct artifacts are:

| Artifact | Raw | Gzip |
| --- | ---: | ---: |
| `xerces-spike.wasm` | 2,143,916 bytes | 541,061 bytes |
| `xerces-spike.mjs` | 27,151 bytes | 6,500 bytes |

These are below the spike review thresholds of 10 MiB raw and 4 MiB gzip for
WASM. A Node 24.16.0 x64 benchmark, with the WASM bytes already read, measured
five instantiations at 3.202 ms median and 4.387 ms p95. Twenty-five warm
156-byte validations measured 0.156 ms median and 0.402 ms p95, with one
18.730 ms initialization outlier. Five 2,000,272-byte validations measured
628.690 ms median and 1,140.341 ms p95. The exported WASM memory was 17,498,112
bytes after initialization and small repetitions, growing to 52,625,408 bytes
after the large repetitions. It did not grow across the 25 small runs.

Real Chromium worker runs include worker creation, fetch/instantiation,
transfer, and rendering overhead. Small XSD and DTD cases showed approximately
23-51 ms wall time and 9-15 ms native engine time. Immediate cancellation of a
2,000,272-byte input recreated the worker and returned the harness to a clean
cancelled state. Browser tooling did not expose a reliable per-worker heap
measurement, so the Node/WASM buffer measurements above are not described as
browser memory. Hermetic timing is unavailable with the corpus.

The static harness build contains one HTML document and five referenced assets
and was verified unchanged at `/` and `/xml-carousel-spike/`. It loads the
same emitted relative URLs in both locations. Including the direct module,
manifest, licence/NOTICE copies, and duplicated static-harness assets, the
ignored spike output contains 12 generated files totaling 4,483,333 bytes.

## Browser findings

Chromium manual QA covered valid and invalid XSDs, multiple diagnostics, local
include/import, missing and remote dependencies, valid and invalid standalone
DTDs, local and remote parameter entities, repeated runs, cancellation,
directory upload with duplicate basenames, ZIP upload, and ZIP entry selection.
Both root and nested deployments successfully loaded and ran the real 3.3.0
module. At 1440x900, 1024x768, and 700x900, document scroll width equalled
client width; no horizontal overflow was observed. No browser console warning
or error was recorded. The active XML Carousel application was never opened or
connected to the experiment.

## Licence and NOTICE findings

Xerces-C++ is distributed under Apache License 2.0 and its source archive
contains a NOTICE crediting the Apache Software Foundation and original IBM
portions. The build copies `LICENSE.xerces.txt` and `NOTICE.xerces.txt` beside
the generated module. The pinned emsdk repository uses the MIT/Expat licence;
the build also copies `LICENSE.emscripten.txt` for the generated runtime layer.
These observations are an engineering inventory, not legal advice. Before a
production distribution, Task 13.3 must determine how the notices integrate
with XML Carousel's CC0 project licence, audit any linked Emscripten system
libraries, and verify that the final packaged distribution retains all
required texts.

## Unresolved risks and production boundaries

- Re-test compiler exception mode, optimizer level, and Binaryen stability on
  every emsdk upgrade; do not silently re-enable LTO or `-O3`.
- Keep the C++ adapter project-owned and narrow. Do not adopt an opaque wrapper
  or expose Xerces/Emscripten filesystem and networking APIs.
- Retain project-relative source identity and the supplied-file-only resolver;
  prohibit network and arbitrary host access.
- Decide whether a reusable warm worker is worth the memory residency. If so,
  preserve termination for cancel/timeout and prove cleanup across projects.
- Add production-calibrated file, byte, expanded-ZIP, dependency-depth,
  diagnostic-count, time, and memory limits before accepting untrusted input.
- Expand W3C coverage and run an authorized Hermetic Foundry corpus. Add
  cross-browser performance and long-run memory/cancellation testing.
- Map diagnostics into Task 13.1 without promising stable native numeric codes,
  and preserve engine wording rather than treating it as UI API.
- Keep XSD 1.1, XML-instance validation, network catalogs, production badges,
  problem-modal work, and active-project integration outside this spike.

The recommended next step is a bounded Task 13.3 integration design that first
settles resource limits, worker reuse versus disposal, package-level schema
selection semantics, attribution packaging, and expanded corpus acceptance.
The evidence supports continuing, but those modifications are prerequisites
for making Xerces authoritative in any production path.

PROCEED WITH MODIFICATIONS
