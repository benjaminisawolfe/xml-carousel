# Unreleased 0.3.0 candidate acceptance

This is the Task 17.10 stabilization and decision record, not a published
release. Package version remains **0.2.0**. Integration, hosted CI, versioning,
tagging, publication and deployment require separate explicit decisions after
Ben's manual QA of the unstaged working tree.

## Scope and baseline

The candidate adds first-class RELAX NG XML and Compact Syntax support to the
shared DTD, XSD 1.0 and ZIP exploration workflow. Supported inputs are `.dtd`,
`.xsd`, `.rng`, `.rnc` and supplied ZIP projects. RELAX NG uses the shared
Search, Navigation, carousel, Inspector, Problems, source/copy and
Full/Compact/Overview presentation.

Authorized baseline:

- Commit: `228397c1474c23549257ca78dff13689b3098686`
- Tree: `a3f2f6c7f7eeed7a7241132323ca5ac7bd95f688`
- Stabilization branch: `task-17.10-relax-ng-stabilization`

Xerces-C++ WASM remains the DTD/XSD validity authority. libxml2 WASM 2.15.3
remains the RNG authority. The source-preserving Compact Syntax parser creates
transient validation XML for libxml2; every user-facing source surface keeps
the original `.rnc` text. Jing and Trang remain development oracles only.

## Demonstrated corrections

1. Search used `aria-expanded` on a searchbox role that does not support it.
   The attribute was removed from the input; the compact disclosure button
   retains it.
2. Closed Search controls referred to an absent results panel through
   `aria-controls`. The relation is now present only while its target exists.
3. Small muted labels failed normal-text contrast against canvas and subtle
   panel backgrounds. The muted token changed from `#6b7785` to `#606d7a`,
   with a 4.5:1 regression gate on all four intended light surfaces.
4. A long retained RNC Problems report could scroll at phone width but offered
   no keyboard-focusable reading area. The named Problem details region is
   now tabbable, scrollable by keyboard, and included in the modal focus loop.

The actual production changes are limited to `SchemaSearch.svelte`,
`ProblemReportDialog.svelte` and the muted token in `tokens.css`. No parser,
resolver, semantic model, standards engine or navigation architecture changed.
Ben confirmed **rootward left, leafward right**, preserving the approved style
guide and the development plan's superseding orientation section. The reversed
diagram in Task 17.10 section 19 is not implemented.

## Evidence and decision authority

The [60-row acceptance matrix](technical/relax-ng-release-acceptance-matrix.json)
is derived from the [reviewed evidence record](technical/relax-ng-release-browser-evidence.json)
by `scripts/relax-ng-release-acceptance.mjs`. Each row names its requirement,
expected and actual result, browser checks, automated tests/gates, status and
limitations. Browser observations are required independently in Chrome and
Firefox at **both** `/` and `/xml-carousel/`.

`npm run acceptance:relaxng-release` verifies canonical matrix bytes and the
current production-input digest. It fails when required browser evidence,
privacy observations or a release gate fails or disappears. It verifies a
reviewed record; it does not claim to rerun browsers or replace `npm run validate`.
Machine logs, timings, screenshots, profiles, generated stress files, browser
binaries and driver binaries remain outside the repository. The deterministic
record excludes timestamps, host paths and local server ports.

## Browser and accessibility acceptance

Both browsers use the production `dist` artifact with WASM deliberately served
as `application/octet-stream`, plus independent request/error capture. Chrome
capture attaches to worker targets as well as the page. Firefox uses WebDriver
and BiDi network/log events. Exact versions and results are recorded in the
evidence JSON; the final gate summary below is updated from completed runs.

Coverage includes valid/invalid standalone RNG/RNC, include/external/nested
packages, shared/cyclic graphs, incomplete and blocked references, mixed
four-format ZIP inventory, exact source for every retained text member in
representative packages, and ZIP-order permutation. DocBook 5.1 and the pinned
EPUBCheck/Validator.nu schemas reuse the existing licensed corpus. The latter
two are packaged transiently from supplied schema bytes without remote retrieval.

Large-model evidence combines existing fixtures and DocBook with an audit-only,
deterministic 1,000-definition RNC grammar. DOM bounds come from production
window constants, not an invented performance threshold. Observed timing and
resource variation stays in external logs.

Search Inspect and Center, Navigation Enter, card pointer and drag, rootward
history, copy/source, and focused Overview Inspect are exercised. Full,
Compact and Overview compare semantic focus, journey, Search result IDs,
Inspector identity and source target. Keyboard checks include Tab, Shift+Tab,
Enter, Space, Escape and carousel arrows; arrows inside Search remain native.

Actual viewport widths are checked at **1440×900, 768×900 and 390×844** in
both browsers. Phone checks include Search, Inspector, source/copy and long
retained Problems. axe-core **4.13.0** checks representative screens against
WCAG 2/2.1 A/AA rules. No serious or critical finding is accepted. This does not
claim manual Narrator, Safari/WebKit or physical-phone certification.

The external axe tool is pinned to SHA-256
`c24f097bd2f451d4f933e8bc7d8d539f8672a2ebcb5cc9f9f3eec8ca9470a0c1`
for `package/axe.min.js` from `axe-core@4.13.0`. npm package integrity is
`sha512-UzGt8zg7Ny8djbYMhxl2zuEevVa7r2gJjYY5Lwr1xM7+XU2nd6CkIWFTVcCIbAP63vSz71NaVyyuSk9lHKcy0A==`.
Its MPL-2.0 package licence is retained with the external tooling.

## Lifecycle, privacy and source boundaries

The audit counts production Worker creation/termination through a test-only
wrapper, cancels actual processing workers, then imports fresh valid schemas.
It also holds real browser File-read and clipboard promises to exercise cancel,
supersede and replacement before late settlement. Controller/client tests cover
late worker messages. No production-only testing path is introduced.

Clipboard tests compare the exact string passed to `navigator.clipboard.writeText`;
the external harness captures that API boundary. System clipboard paste is
included in Ben's manual QA. Source modal text must be an exact retained
original fragment; package inventory text must equal the whole original member.
Generated RNC validation XML must never leak through either route.

Only local application/static asset requests are allowed. HTTPS schema,
`file:` and escaping traversal references remain blocked. Supplied ZIP paths
do not cause filesystem lookup, basename guessing, cross-syntax fallback or
external requests. Retained Problems use original source identities; missing
coordinates remain omitted when reliable mapping is unavailable.

## Frozen authorities and known limits

| Authority | Result required | Approved digest |
| --- | --- | --- |
| Historical DTD/XSD/ZIP visualization | 221/221 | `1e31059953b718750a749a23760e7f5540966e988562033ba1dc69b57bed84b2` |
| RELAX NG visualization | 77/77, zero findings | `b5798413268b6f874ea1f9ef24909765153562bd4c04ae046fca02ea0476a5fc` |
| RELAX NG conformance manifest | 385 spectest + 90 compacttest; 475 selected; zero excluded | `806824774b9c5d04ed4b784d7b6db3680c56dcfa8c34fc813f2753afab5bd6d4` |
| Jing/Trang oracle | No investigations or unexpected harness errors | `053dcf0670e26e4bb5509e4234d0533e45e9f1843ebaddba2b306dc7c484d39c` |

The reviewed **40 product-boundary and 2 security-policy differences** remain
explicit. Validator.nu's custom WHATWG datatype library is not registered in
the production engine. Other reviewed Compact Syntax/oracle differences remain
case-ID-specific in the existing authority. These are not relabelled as passes.
XSD 1.1 and XML instance validation remain out of scope. No remote or arbitrary
filesystem schema retrieval is enabled; external retrieval is deferred to 0.4.
See [known limitations](known-limitations.md).

## Licensing and bundle audit

The audit preserves Xerces licence/NOTICE, Emscripten and libxml2 licences,
and the consolidated notices for 16 locked npm package roles. Production
attributions remain reachable through Help and the static notice assets.
Jing/Trang corpus BSD terms, DocBook redistribution permission, and EPUBCheck
and Validator.nu MIT licences remain with their exact test-only source.
No third-party text was normalized and no corpus file or authority changed.

`verify:release-integrity`, both runtime verifiers, the conformance provenance
checks and `verify:dist` enforce these boundaries. Distribution inspection
rejects JARs, conformance XML, real-world test corpus, oracle JSON, temporary
files and source maps. Dependencies/devDependencies and `package-lock.json`
are unchanged; `pnpm-lock.yaml` remains absent. The package description now
accurately includes RNG and RNC, and the two acceptance commands use existing
tooling without a new application package.

## Reproduction

Use the repository's Node 24/npm setup. Build first, then run both browsers:

```text
npm run build
npm run acceptance:relaxng-browser -- --browser chrome --browser-path <chrome-executable> --axe-path <external-axe.min.js> --output <external-chrome-report.json>
npm run acceptance:relaxng-browser -- --browser firefox --browser-path <firefox-executable> --geckodriver-path <geckodriver-executable> --axe-path <external-axe.min.js> --output <external-firefox-report.json>
```

Install no browser tooling as an application dependency. Obtain the pinned axe
package with `npm pack axe-core@4.13.0 --pack-destination <external-tools>` and
extract it there. The browser command rejects a mismatching bundle digest.
Review raw reports before updating the sanitized evidence; `--write` on the
matrix command rebuilds only the matrix from that reviewed evidence.

Run the full gates:

```text
npm run validate
npm run w3c:dtd:ci
npm run w3c:xsd:ci
npm run relaxng:oracle
npm run acceptance:relaxng-release
git diff --check
```

For authority repeatability, run the conformance generator (without `--write`),
RELAX NG visualization acceptance, both manual-QA generators with `--verify`,
and the oracle command twice. Each rebuild is compared with the preserved
canonical authority. For build repeatability, run `npm run build` twice;
compare `distInventory()` from the release-acceptance script after each clean
Vite build, including filenames and every file's raw-byte SHA-256.

## Final gate summary

| Gate | Completed result |
| --- | --- |
| `npm run validate` | PASS; 192 test files, 2,445 tests; zero Svelte/TypeScript errors or warnings |
| Lint and formatting | PASS within the complete gate |
| Runtime and release-integrity verification | PASS; pinned Xerces/libxml2 assets and 16 locked npm attribution roles |
| DTD CI | PASS; 3 tests, 1 deliberately skipped full-corpus test; 64 categorized cases, zero failures/harness errors |
| XSD CI | PASS; 6 tests, 1 deliberately skipped full-corpus test; 52 categorized cases, zero failures/harness errors |
| Chrome 152.0.7977.65 | PASS; 233 checks and 36 axe screens across both mounts |
| Firefox 155.0; geckodriver 0.37.1 (`300705c65d1b`) | PASS; 233 checks and 36 axe screens across both mounts |
| Serious/critical axe findings | Zero in each browser after the four corrections |
| Privacy and browser errors | Zero page errors, unexpected console errors, remote schema requests, file requests or unexpected origins |
| Worker cleanup | Zero live workers and balanced creation/termination in each browser and mount |
| Authority repetition | Two byte-identical rebuild/verification runs; all approved digests unchanged |
| Production build repetition | All 19 artifact paths and byte hashes identical; final validation build matches too |
| Static and hostile MIME verification | PASS at `/` and `/xml-carousel/`; WASM served as `application/octet-stream` |
| Historical and RELAX NG visualization | 221/221 and 77/77, approved digests unchanged, zero findings |
| RELAX NG conformance | 475 selected, zero excluded/investigations/harness errors; reviewed 40 product and 2 security differences retained |
| `npm run acceptance:relaxng-release` | PASS; all 60 rows |
| Whitespace | Tracked diff and all eight added first-party files checked; zero findings |

Matrix SHA-256:
`032bedd8e0dcb32d753a718861d9d311010c5dbed8eb89aeecf1a1dd0fb91397`.
Production input digest:
`c628736f9d80c6e00fce2017ff98caffa45d84dee837726d01b1ac7f6ef65d67`.
Sorted distribution path/hash inventory digest:
`250c34a66ec6240ef63bb08553d49ae7fb3cee4cbda28405b6e6ba29fbed3804`.

No Task 17.10 release-blocking finding remains. Vite's existing advisory for
the main chunk exceeding 500 kB remains non-blocking; no capacity guarantee or
new performance threshold is inferred from these observations.

**READY_FOR_0_3_0_RELEASE**

Ben's [manual QA checklist](release-0.3.0-manual-qa.md) remains the next human
gate before any integration authority is prepared.
