# RELAX NG WebAssembly feasibility (Task 17.2)

## Executive result

The approved `.rng` architecture is technically sound. The pinned libxml2
2.15.3 runtime compiles as a small browser/worker-compatible WebAssembly module,
executes with `FILESYSTEM=0`, accepts controlled in-memory project resources,
returns useful structured diagnostics, and agrees with Jing on the bounded
synthetic and external evidence sets. Production `.rng` engine work may proceed.

No acceptable production Compact Syntax front end was established. RNV 1.7
compiled to WebAssembly and parsed standalone strings, but its include and
external implementation opens files directly, it exposes an integer-pattern
representation rather than a source-preserving grammar tree, `rnl_clear` is a
no-op, and upstream documents partial datatype/restriction behavior. Trang is a
useful translation oracle but is Java-based and loses direct `.rnc` diagnostic
and source fidelity. Task 17.3 can integrate the `.rng` engine without claiming
`.rnc` support.

## Task 17.1 contract compliance

The branch was created only after integrated Task 17.1 `main` passed preflight.

| Identity | Value |
| --- | --- |
| Baseline commit | `aa829aa87c20cd5b859634d52996b4c507c5f6cf` |
| Baseline tree | `9d1719c4991d20c7f6ecb7398cc8d6f13512e37a` |
| Contract blob | `048fe869bad3c9147e54d3b1aed04dc4ecf2897b` |
| Test-authority audit blob | `b216fb1c75c306f7e012194cc1311d27c4aa3ad6` |
| Development-plan blob | `4e1215a638ce1b99f47476dd241199635bb5e583` |

The hosted validation run for the Task 17.1 merge passed. Baseline local gates
passed with 174 test files and 2,301 tests, complete visualization 221/221 with
digest `1e31059953b718750a749a23760e7f5540966e988562033ba1dc69b57bed84b2`,
and release integrity with 16 JavaScript components, two archives, and the
`invalid-not-sa-022` negative case.

No production format union, import control, worker request, diagnostic union,
package kind, schema graph kind, source-view behavior, or DTD/XSD authority was
changed by this spike.

## Pinned inputs and reproducibility

| Input | Exact identity |
| --- | --- |
| libxml2 | 2.15.3; official GNOME archive, 3,152,452 bytes; SHA-256 `78262a6e7ac170d6528ebfe2efccdf220191a5af6a6cd61ea4a9a9a5042c7a07` |
| Emscripten | emsdk 6.0.5, commit `dfb9d1a46c3bb8f52e1e6324be23123b9d73c190`; compiler build hash `1db513782be24469589d7cb8a1f1834e9a33f271` |
| CMake / Ninja | 4.4.2 / 1.13.2, reused from the existing Xerces spike tooling |
| Jing | V20241231, tag commit `a6bc0041035988325dfbfe7823ef2c098fc56597`; archive SHA-256 `d11a765f9106e398e01d66aaffb629beb1da21f8a716299e2930a751130bfad2` |
| Trang | V20241231, same tag; archive SHA-256 `eceaa8331377b78fcec6094de8e67d81649bc0c322be3fd2cbb39b4c4c7f3af8` |
| Java | Oracle Java 26.0.2+10-55, HotSpot 64-bit Server VM |
| RNV | commit `c11d5efac7202377259d3bf862d37a1c57af1967`; tree `fb8709bb35ddfc137374f45527b196fcc14b9eca`; deterministic source-archive SHA-256 `40e14cf725a1c1a5555dbb5a1b799cf30c48a680289cedfee5428e5df30ff09e` |
| External spectest | Jing/Trang-pinned `spectest.xml`; SHA-256 `3812289f941d4a1aa8ad0ab0f5e16f85f59d912eec710feb86b6b14a6e942a96` |
| Firefox driver | geckodriver 0.37.1 (`300705c65d1b`); Windows archive SHA-256 `dfed9315abe8d2fbc1b6161a2ee8002452e79cf05ee92fdc653a4e26bc35edd8` |

The official GNOME checksum file and an independently computed SHA-256 agreed.
The official Jing and Trang SHA-1 sidecars also agreed before the SHA-256 values
above were recorded. No newer libxml2 2.15 release superseded 2.15.3 at evidence
time. Downloads, SDKs, source checkouts, build trees, generated translations,
and runtime artifacts are ignored and are reproducible from the manifests.

## Build architecture

The build uses upstream CMake to produce a static libxml2 archive and links only
the narrow C adapter. Enabled capabilities are XML parsing, regexps, XML Schema
datatypes, RELAX NG, and output (needed by the dump probe). HTTP, iconv, ICU,
zlib, Python, threads, modules, catalogs, programs, tests, docs, HTML, XInclude,
XPath, DTD validation, legacy APIs, and debug support are disabled.

The important link flags are `-O2`, `MODULARIZE=1`, `EXPORT_ES6=1`,
`ENVIRONMENT=web,worker,node`, `ALLOW_MEMORY_GROWTH=1`, and `FILESYSTEM=0`.
Only allocation, reset/add/compile/result/version adapter functions and the
minimal Emscripten string/byte helpers are exported. The emitted module has no
CDN or absolute runtime URL.

## libxml2 adapter contract

The conceptual input is `{ attemptId, entryPath, files[] }`; only RELAX NG XML
syntax is accepted. Each file is copied into a bounded virtual-project table.
The serializable result contains attempt ID, engine and actual engine version,
`accepted|invalid|blocked|internal-error`, structured diagnostics, dependency
requests, elapsed time, file count, and total supplied bytes. The spike also
returns bounded DOM/dump probe text; those fields are experimental and are not
proposed as the production contract.

`xmlRelaxNGNewDocParserCtxt` is the recommended production construction. The
original document is parsed with a `project:///path` URL, structured errors, the
same controlled loader, `NONET`, and big-line support, then passed to the RELAX
NG compiler. This preserves base/source identity and resolves relative includes
and external references. `xmlRelaxNGNewMemParserCtxt` accepted a standalone
grammar but had no logical URI, source DOM, or project-relative dependency base,
so it is not recommended. The spike exercised
`xmlRelaxNGSetParserStructuredErrors`, `xmlRelaxNGSetResourceLoader`,
`xmlRelaxNGParse`, `xmlRelaxNGFree`, and `xmlRelaxParserSetIncLImit` (limit 64).

## Resource-loader/security findings

Every dependency reached the custom `xmlResourceLoader`. Safe relative paths
were resolved by libxml2 against the requesting `project:///` source and then
matched by exact normalized project path. Nested paths and shared resources
worked; basename guessing and fallback do not exist. Missing members are
reported as `missing`; HTTP, HTTPS, FTP, `file:`, drive/UNC/absolute paths,
backslashes, percent-encoded paths, and traversal outside the virtual root are
`blocked`. Returning an error ends resolution; the adapter never delegates to
the default loader.

Observed dependency identities included
`project:///schemas/parts/defs.rng`, `project:///../../outside.rng`, and the
normalized encoded attack `project:///../outside.rng`. All unsafe cases were
blocked before any browser I/O. Browser remote-schema HTTP requests: **0**;
browser `file:` requests: **0**; unexpected origins: **0**.

## RELAX NG XML-syntax findings

The project-authored corpus contains 26 classified entries: 16 accepted, four
invalid, and six policy-blocked. It covers empty/text/element/attribute,
choice/group/interleave, optional and repetition, mixed/list, grammar/start/
define/ref/parentRef, both combine modes, name classes and exceptions, XML
Schema datatypes/params/value/data-except, foreign annotations, include,
externalRef, nested and shared dependencies, malformed XML, semantic
restrictions, unknown datatypes, missing resources, remote/file/absolute/
traversal/encoded references. libxml2 produced 26/26 expected classifications.

## Structured diagnostic findings

Structured callbacks provide message, severity, domain, native code, source,
and line. Malformed XML, semantic restriction, and invalid datatype cases had
useful source lines. Missing/blocked dependency failures produced both loader
diagnostics and higher-level RELAX NG diagnostics; the latter sometimes had an
empty source and line 0/-1 while a companion message identified the including
source. Columns were generally 0 and are not trustworthy for RELAX NG semantic
errors. Task 17.4 should preserve absent coordinates rather than fabricate
them, normalize messages by category, and retain native domain/code only as
debug metadata rather than a stable product API.

## Source/model extraction probes

The original libxml2 DOM retained element names, RELAX NG and foreign namespace
URIs, attributes/values, source document identity, source line, child order,
and foreign annotation elements. It does not supply reliable columns or exact
source ranges, so byte/range fidelity still requires the retained original
text and a source-aware extractor.

`xmlRelaxNGDumpTree` was deterministic across repeated runs and useful for
confirming the compiled grammar. It normalizes names and structure, but retains
unresolved include/externalRef syntax and loses original lexical organization,
comments, and foreign annotation/source mapping. It is a debugging/comparison
aid, not a production semantic model. Task 17.6 should model from original RNG
syntax/source while libxml2 remains the acceptance authority.

## Jing comparison

Jing compiled each selected schema without validating an instance. Results:
20 `AGREE`, six `ACCEPTED_BOUNDARY_DIFFERENCE` entries deliberately not run in
Jing because they exercise XML Carousel's stricter no-external-resource policy,
and zero `INVESTIGATE`. Diagnostic prose/count was not compared for equality;
semantic classification and important source localization were.

## Selected RELAX NG test-suite evidence

The public James Clark archive was checksum-pinned but did not include explicit
redistribution terms or the maintained `spectest.xml`, so no suite content is
committed. The exact V20241231 repository copy contains 385 test cases. The
committed selection manifest chooses 14 representative correct/incorrect cases
spanning basic syntax, name classes, grammar definitions, namespaces,
datatypes, and restrictions. libxml2: 14/14; Jing: 14/14; unexpected
disagreements: 0. This remains comparator evidence, not the Task 17.9 gate.

## RNV Compact Syntax findings

Unmodified pinned RNV sources compile under Emscripten 6.0.5 to a 55,623-byte
WASM module (SHA-256
`30eeabed9f35dc61e503146c4606e2f60e2933e4fae0a0f0c488f5ff40729d74`).
The only adapter portability addition is `<stdarg.h>` in project-authored code;
no upstream semantic patch exists. `rnc_stropen` plus `rnl_s` parses standalone
strings and distinguishes tested syntax/restriction errors with line/column
text. Cancellation can use worker termination.

RNV does not meet the production front-end needs. Includes and `external`
delegate to `rnc_open/open/read`, so an in-memory entry cannot supply project
members under `FILESYSTEM=0`. Its internal output is compressed integer pattern
tables rather than a documented source-preserving AST. Annotation syntax is
explicitly skipped, deterministic per-project cleanup is not exposed
(`rnl_clear` is empty), global tables are retained, and upstream documents
partial XML Schema datatype behavior and unchecked restrictions. Substantial
loader/AST/lifecycle work would be required and would exceed a portability
patch.

## Jing/RNV Compact comparison

The compact corpus has 15 classified entries. Twelve cases agree, two
differences are explained RNV file-loader limitations (`include` and
`external`), one remote policy case was deliberately not allowed to contact its
URI, and zero differences remain unexplained. Agreement on standalone cases is
not enough to recommend RNV because the known differences are required product
features and the source/lifecycle limitations remain.

## Trang translation findings

Trang converted 9/9 representative standalone `.rnc` cases and libxml2-WASM
accepted 9/9 generated `.rng` outputs. The route is therefore
**VIABLE_ONLY_FOR_VALIDATION**. It cannot replace original `.rnc` source view;
generated locations do not directly map to the compact source, organization and
comments transform, and multi-file structure may be rewritten. Java/Trang is
not approved or suitable as a browser runtime and remains a development oracle.

## RNG/RNC equivalence findings

The simple, attribute, choice, group, interleave, repetition, definition/ref,
name-class, and datatype pairs have consistent expected meaning: Jing accepts
their compact forms, Trang converts them, and libxml2 accepts the generated XML
forms. Task 17.6/17.8 still needs normalized-model equivalence for name classes,
combine behavior, datatype parameters, annotations, and multi-file identity;
textual equality of Trang output is not an appropriate authority.

## Browser findings

The unchanged emitted module passed at `/` and
`/xml-carousel-relax-ng-spike/`. Controlled Chromium identified itself as
Chrome 151.0.0.0; Firefox was 155.0 with geckodriver 0.37.1. Each browser/path
run covered valid, invalid, local include, local externalRef, missing dependency,
blocked HTTPS, blocked `file:`, valid-after-invalid, hard cancellation, worker
recreation, stale-result suppression, actual runtime version, and horizontal
overflow. All applicable assertions passed, with no page/console errors.

## Network/privacy findings

Controlled Chromium request capture contained only the harness document,
worker, JS glue, and WASM on `127.0.0.1`. Firefox resource timing likewise
contained only the harness origin. The `https://example.invalid/common.rng` and
`file:///etc/passwd` inputs appeared only in adapter diagnostics and dependency
records. Remote schema requests: 0; file requests: 0; unexpected origins: 0.

## Performance/artifacts

These observations are feasibility measurements, not release thresholds.

| Measurement | Result |
| --- | ---: |
| Clean configure/build/link | 8,490.526 ms |
| No-op configure/build/relink | 2,021.967 ms |
| JS glue | 13,974 raw / 4,864 gzip bytes; SHA-256 `ec28397baa30590e280782922ba720e7d980467c166861ed95f479dd5f7f30ac` |
| WASM | 395,813 raw / 148,729 gzip bytes; SHA-256 `7b5af2d7c314bdeb186c9999f51178be017354b247b27f987296705ad8dbbe21` |
| Node instantiation | 4.498 ms |
| Small grammar | 84 bytes; 0.025 ms native compile time |
| Larger synthetic grammar | 12,882 bytes; 7.890 ms native compile time |
| WASM memory after initialization | 17,694,720 bytes |
| After larger run | 17,694,720 bytes |
| After 100 repeated small runs | 17,694,720 bytes |

The artifact is far below the inherited 10 MiB raw / 4 MiB gzip review points.
The Node WASM memory buffer did not grow during the measured sequence. These are
Node/WASM observations, not browser-heap measurements.

## Lifecycle/cancellation findings

One module completed 100 repeated accepted/invalid/accepted classifications
without growth in the WASM buffer. The browser harness then scheduled a delayed
attempt, terminated that worker, created a fresh worker, and accepted a new
grammar; no stale response was delivered. Production should use a disposable
RELAX NG worker per project/attempt boundary, terminate it for hard cancellation
or supersession, discard messages whose attempt ID is no longer current, and
create a clean worker for the next attempt. This spike does not prescribe
long-lived worker reuse.

## Licensing/provenance

libxml2's `Copyright` file records its MIT-style licence. Jing/Trang official
distributions include their copying documentation and remain ignored. RNV's
`COPYING` is BSD-3-Clause. Geckodriver is MPL-2.0 and remains ignored tooling.
The external suite is not committed because repository redistribution terms
were not explicit enough. All committed fixtures and adapters are
project-authored; committed manifests contain only identities, hashes, URLs,
and selections.

## Anti-cruft / artifact disposition

| Artifact/path | Purpose | Disposition | Target task | Removal trigger |
| --- | --- | --- | --- | --- |
| `tools/relax-ng-wasm-spike/native/adapter.*` | libxml2 adapter proof | `PROMOTE_OR_ADAPT_IN_17_3` | 17.3 | Remove spike copy after production adapter/evidence supersedes it |
| `tools/relax-ng-wasm-spike/native/rnv-adapter.c` and `build-rnv.ps1` | RNV fit evidence | `RETAIN_AS_REPRODUCIBILITY_EVIDENCE` | Compact follow-up | Remove when another compact front end is selected |
| `tools/relax-ng-wasm-spike/browser/**` | root/nested lifecycle/security harness | `RETAIN_AS_REPRODUCIBILITY_EVIDENCE` | 17.3 | Remove after equivalent production worker tests exist |
| `tools/relax-ng-wasm-spike/node/spike-client.mjs` and `run-synthetic.mjs` | real runtime/corpus evidence | `PROMOTE_OR_ADAPT_IN_17_3` | 17.3 | Adapt to production worker tests, then remove spike-only client |
| `run-comparison.mjs` / `run-selected-suite.mjs` | Jing/Trang and external comparator | `RETAIN_AS_DEVELOPMENT_COMPARATOR` | 17.9 | Replace only with an equal or stronger pinned comparator gate |
| `run-firefox.mjs` | cross-browser static evidence | `RETAIN_AS_REPRODUCIBILITY_EVIDENCE` | 17.3 | Remove after production browser evidence covers the same assertions |
| `scripts/bootstrap.ps1`, `verify-pins.ps1`, `build.ps1`, `run-focused.ps1`, `serve.ps1` | reproducible provisioning/build/run | `PROMOTE_OR_ADAPT_IN_17_3` | 17.3 | Consolidate when production runtime build owns the pins |
| `manifests/**` | immutable pins and selections | `RETAIN_AS_REPRODUCIBILITY_EVIDENCE` | 17.3/17.9 | Supersede only with reviewed production pins |
| `tests/fixtures/relax-ng-wasm-spike/**` | project-authored RNG/RNC evidence | `PROMOTE_OR_ADAPT_IN_17_3` | 17.3 onward | Move individual cases only when a production authority owns them |
| `.prettierignore`, `eslint.config.js` spike entries | keep ignored downloads/build output outside canonical tooling | `PROMOTE_OR_ADAPT_IN_17_3` | 17.3 | Replace paths when production build output moves |
| ignored `.cache/`, `.tools/`, `build/`, `dist/`, `.evidence/` | downloaded/generated evidence | `REMOVE_AFTER_17_2` | none | Delete at any time; bootstrap/build regenerates them |
| this report and spike `README.md`/`.gitignore` | decision and boundary record | `RETAIN_AS_REPRODUCIBILITY_EVIDENCE` | 17.3 | Keep as historical technical evidence |

No skipped/todo product test, hypothetical production enum, RELAX NG entry in
the 221-case matrix, historical release rewrite, or weakened network test was
introduced.

## Unresolved risks

- libxml2 semantic diagnostics frequently lack a column and sometimes emit
  companion messages without source identity; Task 17.4 needs normalization.
- Exact source ranges require a source-aware extractor over retained text;
  libxml2 DOM lines are not ranges.
- `xmlRelaxNGDumpTree` is not a model API.
- No production-quality browser Compact Syntax parser is selected.
- The bounded external sample is not exhaustive conformance; Task 17.9 owns the
  full authority/gate.

## Production recommendation

| Decision | Result |
| --- | --- |
| libxml2 for `.rng` | **PROCEED** |
| Production Compact Syntax front end | **NO_ACCEPTABLE_RNC_FRONT_END_YET** |
| Task 17.3 readiness | **READY_FOR_17_3** |

Task 17.3 should integrate pinned libxml2 2.15.3 as a separate RELAX NG-only
WASM worker, construct the compiler from an original DOM carrying a
`project:///entry` URI, install the controlled exact-member loader and
structured error callback, disable Emscripten filesystem/network access, apply
the include recursion limit, return attempt-tagged serializable results, and
use worker termination plus attempt-ID suppression for cancellation. Xerces
remains the DTD/XSD authority. Task 17.3 must not expose `.rng` or `.rnc` in the
UI; Task 17.4 may ship `.rng` first. A later bounded Compact Syntax evaluation
must select a source-preserving, in-memory, project-loader-capable browser front
end before `.rnc` is enabled.
