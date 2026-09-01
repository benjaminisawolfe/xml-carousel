# RELAX NG production standards engine

## Task 17.3 boundary

Task 17.3 establishes a production-quality internal standards engine for RELAX
NG XML syntax (`.rng`). It does not add an Open RNG action, a picker, package
classification, a semantic model, visualization, Search, Navigation, or
Inspector support. RELAX NG Compact Syntax (`.rnc`) remains explicitly
unsupported and unimplemented. Task 17.4 is responsible for the first
user-facing single-file `.rng` workflow.

Apache Xerces-C++ remains authoritative for DTD and XSD 1.0. The new engine is
language-specific and does not replace or route either existing format through
libxml2.

## Engine and reproducible identity

The engine is libxml2 2.15.3, built without upstream patches from
`https://download.gnome.org/sources/libxml2/2.15/libxml2-2.15.3.tar.xz`
(SHA-256
`78262a6e7ac170d6528ebfe2efccdf220191a5af6a6cd61ea4a9a9a5042c7a07`).
The toolchain is emsdk 6.0.5 at commit
`dfb9d1a46c3bb8f52e1e6324be23123b9d73c190`, compiler build hash
`1db513782be24469589d7cb8a1f1834e9a33f271`, CMake 4.4.2, and Ninja 1.13.2.

The production configuration enables XML parsing, regular expressions, XML
Schema datatypes, and RELAX NG. It disables HTTP, iconv, ICU, zlib, Python,
threads, modules, catalog support, programs, tests, documentation, HTML,
XInclude, XPath, DTD validation, legacy/debug/output support, and Emscripten's
filesystem. The Emscripten environment is `web,worker,node`; runtime schema
network and host-filesystem retrieval are forbidden.

Two clean builds produced identical reviewed artifacts:

| Artifact | Raw bytes | gzip bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `libxml2-relaxng-runtime.js` | 14,084 | 4,907 | `1cb2021f60c120b7130875f9b7e967ea0a35b00ae70f5e8b262cf82411668868` |
| `libxml2-relaxng-runtime.wasm` | 383,299 | 145,306 | `f587a4f9e2722bc5c132586de9224b2acf6ee22afa812889a3c6d70dc0a7af80` |

The gzip measurements above use the deterministic offline runtime verifier.
Run the explicit maintenance workflow with:

```text
npm run spike:relaxng:build-production
npm run vendor:relaxng:publish-runtime
npm run verify:relaxng-runtime
```

Ordinary install, test, and build commands never invoke Emscripten, CMake,
Ninja, a download, or vendor publication. The runtime manifest records all
pins, options, policies, artifact identities, and licence identities without a
timestamp or machine-specific path. `npm run validate` verifies the committed
runtime offline.

## Native adapter and controlled resources

The retained native adapter is the single authoritative libxml2 integration
core. A compile-time production surface exposes only reset, add-file, compile,
engine-version, and result-JSON operations (plus Emscripten memory helpers).
Spike-only DOM serialization and compiled-tree dump probes are absent from the
production build.

Every supplied member receives an exact normalized, common-root-relative POSIX
identity. Native source URLs use `project:///path`. `include` and `externalRef`
are resolved relative to the referring member; safe parent segments are
allowed only while remaining within the project root. Resolution has no
basename fallback. Remote schemes, `file:`, absolute/drive/UNC paths, escaped
traversal, controls, queries, fragments, missing members, and ambiguous paths
never fall through to a libxml2 default loader or browser fetch.

Shared Xerces/RELAX-NG project policy limits are 250 files, 20 MiB aggregate
input, 512 decoded path code points, 32 path segments, 500 retained
diagnostics, and a 30-second worker lifetime. libxml2's RELAX NG include
recursion limit is 64. Limit failures have the `resource-limit` category rather
than ordinary schema invalidity, and diagnostic truncation retains a final
explicit truncation diagnostic.

## Diagnostics

The adapter preserves libxml2 domain/code identity, severity, complete message,
dependency-request outcome, and trustworthy positive line numbers. A source is
reported only when it maps exactly from `project:///` to a supplied project
member. libxml2 columns are intentionally omitted because this boundary did not
establish them as trustworthy. Normalized results distinguish `valid`,
`invalid`, `blocked`, and `internal-error`; runtime/load exceptions become
fixed safe engine-internal messages and never schema invalidity or raw exception
text.

## Disposable worker/client lifecycle

`relaxNgStandardsWorker.ts` is separate from the existing Xerces import worker.
It accepts one guarded RELAX-NG-specific request, produces at most one terminal
result, mutates no application state, performs no presentation work, and closes.
The narrow client carries an attempt ID and enforces one request/one terminal
result. Success, failure, cancellation, timeout, supersession, stale/mismatched
result, and protocol failure all terminate the worker. A subsequent attempt
therefore receives a fresh virtual project and fresh WASM/native state.

Focused tests execute the committed libxml2 2.15.3 runtime for valid/invalid
grammar constructs, includes and external references, nested and safe-parent
resolution, hostile references, missing members, limits, diagnostics, and
state reset. Protocol/client tests cover malformed input, matching attempt IDs,
hard cancel, hard timeout, supersession, stale suppression, startup/runtime
failure, and worker disposal.

## Browser portability and MIME evidence

The developer-only harness imports `src/standards/relaxng/**` and bundles the
exact production client, worker, JavaScript glue, WASM, manifest, and licences.
It does not fork production validation logic. Generated harness output and
evidence remain ignored.

Firefox 155.0 and Chrome 152.0.0.0 passed the unchanged bundle at `/` and
`/xml-carousel-relax-ng-production/`, both with normal MIME types and with WASM
served as `application/octet-stream`. Each browser/MIME mode completed 24
assertions across the two paths: real libxml2 identity, valid and invalid
schemas, local include, local external reference, blocked HTTPS and `file:`,
missing member, valid after invalid, hard cancellation, stale suppression, and
worker recreation. Every mode recorded zero page errors, unexpected console
errors, remote schema requests, `file:` requests, and unexpected origins. The
Chrome hostile-MIME response header was independently confirmed as
`application/octet-stream`; its 64-request server audit contained only local
harness paths.

## Licensing and application distribution

The exact libxml2 upstream licence and the Emscripten runtime-layer licence sit
beside the production runtime and are hash-bound by the manifest/verifier.
`docs/third-party-licensing.md` records their roles and identities. Jing, Trang,
and RNV are not production dependencies.

The ordinary Task 17.3 application build intentionally emits no libxml2,
RELAX-NG worker, RELAX-NG licence, or startup request because no user-facing
caller exists. It therefore leaves the current 0.2.0 `THIRD_PARTY_NOTICES.txt`
release asset unchanged. Task 17.4 must route `.rng` into this client and then
extend ordinary distribution attribution/static/hostile-MIME verification.

Chrome inspection of the ordinary built application confirmed that the top bar
contains exactly `Open DTD`, `Open XSD`, and `Open ZIP`, with no `Open RNG`.
The loaded entry document referenced only the ordinary hashed application
JavaScript and CSS; the distribution contains no libxml2 or RELAX-NG artifact
that could generate a startup request.

## Spike artifact disposition

| Task 17.2 artifact | Before | Task 17.3 disposition |
| --- | --- | --- |
| libxml2 native adapter/build/synthetic runner | promote or adapt | Adapter is the shared authoritative core with a narrow production compile surface; build/publisher adapted; synthetic runner retained for regression evidence |
| Jing/Trang comparison scripts | development comparator | Retained unchanged as development comparator evidence |
| RNV adapter/build evidence | reproducibility evidence | Retained unchanged; not a production dependency |
| browser/Firefox spike harness | reproducibility evidence | Retained; a small separate exact-production harness was added without duplicating validation logic |
| pin/selection manifests | reproducibility evidence | Retained and used by the production build/publisher |
| project-authored fixtures | promote or adapt | Reused directly by real production-runtime tests |
| ignored downloads/builds/evidence | remove after spike | Remain ignored and disposable; production publication copies only the reviewed runtime/licence set |
