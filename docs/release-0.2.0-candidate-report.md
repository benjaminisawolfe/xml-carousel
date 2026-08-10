# XML Carousel 0.2.0 Candidate Report

Candidate preparation began on 2026-08-09. This report records candidate-only
evidence; it is not a publication or deployment record.

## Candidate identity

- Repository: `https://github.com/benjaminisawolfe/xml-carousel.git`
- Baseline commit: `ad46fd4cbb94b7460089cf241f0897930661ecdd`
- Baseline tree: `b5c0425220514490a6a64b4f3538df5e4d625356`
- Candidate branch: `release-0.2.0-candidate`
- Package version: `0.2.0`
- Planned annotated tag: `v0.2.0`
- Recommended title: `XML Carousel 0.2.0 — Second Public Alpha`
- Recommended GitHub Release state: prerelease, non-draft at publication
- Canonical site: https://xmlcarousel.wolfshafenpress.com/

The preflight started from the required clean baseline with empty staging and
exactly one worktree. The public origin was confirmed before network checks;
the prohibited private-history repository was not accessed.

## Source and scope

Candidate scope is limited to release identity, current/historical README
framing, version-specific release records, packaging tests, and a narrow update
to controlled-browser release tooling for the already-integrated focused
Overview Inspect action. Production application source and behavior are
unchanged.

The following release-facing documents were audited and found current outside
the candidate-specific README changes:

- `docs/architecture.md` already describes Developer Handoff Utilities,
  retained-source safety, both copy operations, and their state independence;
- `docs/standards-support.md` retains the accepted standards and 221/221
  presentation boundaries;
- `docs/known-limitations.md` retains the accepted product, browser, capacity,
  privacy, and deployment boundaries;
- `docs/third-party-licensing.md` remains correct because dependencies and
  third-party material did not change.

`scripts/verify-release-integrity.mjs` remains a generic licensing, provenance,
standards, and packaging authority. Dedicated 0.2.0 candidate tests provide the
version-specific document/state contract, so the integrity script did not need
a version-coupled change.

## Version and package identity

Only three version values changed:

- `package.json.version`: `0.1.0` to `0.2.0`;
- `package-lock.json.version`: `0.1.0` to `0.2.0`;
- `package-lock.json.packages[""].version`: `0.1.0` to `0.2.0`.

The baseline package blobs were:

- `package.json`: `2dc8a60f688db5b827fd0315bcb27c04cbc3d395`;
- `package-lock.json`: `08788e08e3dc2f1857bf9aa77447e5e2f5416916`.

The semantic lockfile comparison found no dependency version, resolved URL,
integrity value, licence metadata, optional flag, engine, or dependency-edge
change. `pnpm-lock.yaml` remains absent.

## Candidate file identities

Final non-report candidate identities are:

| Path | Git blob | SHA-256 |
| --- | --- | --- |
| `README.md` | `6e1c977b4cf5f30a95d03ebb4dbd1e6ab83c9ecf` | `49cdfa5685f50425a5a07d6cce915a30a2ff046fc5cbedc2cf98595530aab2a9` |
| `package-lock.json` | `581bb7bb0119a96d6907d674c75ad9b42b400a8c` | `b0b82f6a822a900d6b717f75bbeb5b3135d95c0cc71fc98c8975ca9a946cd706` |
| `package.json` | `b3c202a65cb49a418cce1853e490f66831c5608c` | `77d277bd9eaaa4884b623d85600603875d0b6abd9a924f83496f00a3a9a57c62` |
| `scripts/audit-standards-engine-lifecycle.mjs` | `5dce72d9dc703e4c0e154fdfcf9657f1adaae9d6` | `3992cb309a92079dbb00a31b62087dddb41e60eab8a540145044b745172747f3` |
| `src/tests/PublicAlphaPackaging.test.ts` | `12fe605e28c66ad6ad3984b582eb3c4ac9d76ab9` | `db9ee0b232cc08d42ccdac2888f7e72b5c947ee89b70b9f6197a9d4786ddc659` |
| `docs/release-0.2.0-checklist.md` | `cf8520e0d28c9f84df04f192bf0392e3a6244a79` | `0db4bbe6e88f0e80df1e973302ff6c6be21210339e09821d6198b9ab45111fad` |
| `docs/second-public-alpha.md` | `8fa950aa175d305e07395486019badfbdc68f3d0` | `f8c96c2b381c2962a374dbd74b4e2e5864bf50d78c4ce96c3aa3bb3d1a9dd8f7` |
| `src/tests/Release020CandidatePackaging.test.ts` | `ae704ef0fec7f1e95934d95a49f0c03d34763721` | `755b6088f52cfe2105c7a70bf5327ecd94d38936799e3e92526306326aa56c9a` |

The report's own final Git blob and SHA-256 are necessarily reported in the
external Codex handoff rather than embedded recursively here.

## Protected and historical identities

The protected documents remain byte-identical:

- `docs/development-plan.md` blob:
  `fce6106dcec3ca8d151b77aec234f956cf7d71a8`;
- `docs/style-guide.md` blob:
  `9a04be1007153e446e2227f4fa0bfe0d83238077`.

The published 0.1.0 release records remain byte-identical:

- `docs/first-public-alpha.md` blob:
  `9886527e4746e86d746c39ab4782904ad2ee607e`;
- `docs/release-candidate-report.md` blob:
  `9a37e9936bf249c61d475d0580f9c7963d47f530`;
- `docs/release-checklist.md` blob:
  `05de57faf7dae13d2417a9e4d02247bb2746a864`.

The immutable 0.1.0 publication identity remains annotated tag object
`921fa5d1d6ba0ebea9cc76dbc287f4b1ff77641f`, release commit
`fad25bd26e2d197a4e7d5db364ad5933d67e8c81`, and GitHub Release ID
`365357518`.

## Audit and integrity

Candidate environment:

- OS: Windows NT `10.0.26200.0`;
- Node: `v24.16.0`;
- npm: `12.0.1`;
- Git: `2.55.0.windows.3`.

`npm ci` installed 271 packages and audited 272. npm 12 reported that the
`esbuild@0.28.1` install script was blocked by its local allow-scripts policy;
the locked Windows platform package remained usable, and all builds and checks
passed. `npm ls --all` completed with exit code zero and the documented optional
platform/peer packages absent.

`npm audit --json` reported 2 high-severity transitive development-tool
findings, 0 critical, 0 moderate, 0 low, and 0 informational findings:

- `js-yaml` through ESLint tooling;
- `nanoid` through PostCSS tooling.

This matches the known baseline. `npm audit --omit=dev --json` reported zero
production vulnerabilities across every severity. No dependency remediation or
lockfile refresh was performed.

`npm run verify:release-integrity` passed: 16 bundled JavaScript components,
archive-backed `invalid-not-sa-022`, and 2 archive entries. The production
Xerces runtime check passed with Apache Xerces-C++ 3.3.0, 2 runtime artifacts,
and 3 attribution files.

## Automated validation

The final `npm run validate` passed in 80.3 seconds. Its canonical results were:

- Svelte/TypeScript: 0 errors and 0 warnings;
- Vitest: 173 test files and 2,295 tests passed;
- ESLint: passed;
- Prettier: passed;
- production build: 310 modules transformed;
- portable static verifier: passed;
- hostile-MIME verifier: passed.

The suite directly includes the Developer Handoff Utilities acceptance,
Overview focused-Inspect integration, 10,000-node isolated semantic-zoom loads,
40,000-node bounded DOM/cancellation paths, adversarial imports, unresolved
reference behavior, package presentation, stale-result protection, responsive
layout, focus, reduced-motion, and forced-colour contracts.

## Standards and visualization evidence

`npm run acceptance:complete-visualization` passed independently:

- matrix: 221/221 complete;
- canonical digest:
  `1e31059953b718750a749a23760e7f5540966e988562033ba1dc69b57bed84b2`;
- reachability: 52 node kinds, 52 edge kinds, and 5 package-entry kinds;
- release-blocking visualization codes: 7, all satisfied;
- Simplified DocBook: 106 Navigation/Search records and 0 findings;
- committed Hermetic Foundry baseline: 3,958 nodes, 3,739 source-markup
  records, and 0 findings.

`npm run w3c:dtd:full` passed with 1,912 passes, 0 failures, 1 unsupported by
the current product boundary, 4 instance-dependent, 4 optional errors accepted,
20 optional errors reported, 9 security-policy blocks, and 0 harness errors.

`npm run w3c:xsd:full` passed with 171 passes, 0 failures, 3 unsupported, 2
instance-dependent, 0 optional accepted, 0 optional reported, 2 security
blocks, 4 metadata disputes, and 0 harness errors.

The practical Xerces-J 2.12.2 comparison also passed. Its pinned JAR SHA-256 was
`6fc991829af1708d15aea50c66f0beadcd2cfeb6968e0b2f55c1b0909883fe16`.
Across 89 cases and 31 families, 82 agreed directly, 7 were accepted documented
boundary differences, and 0 were unexpected disagreements. The optional
external Hermetic Foundry archive was absent, so the comparison used the pinned
W3C corpora; the committed Hermetic baseline remained covered by the 221/221
acceptance gate.

## Major post-0.1 regression evidence

The canonical test/acceptance gates cover the major post-0.1 features: normalized
Problems access; complete supported DTD/XSD/ZIP presentation; Full, Compact, and
Overview semantic zoom; focused Overview Inspect; source identity and location;
the source modal; exact retained-source copying; deterministic node summaries;
responsive/accessibility behavior; adversarial paths; and large-project state
safety.

The controlled-browser harness was narrowly corrected from its historical
Task-14 expectation of zero Overview Inspect actions. It now requires exactly
one focused Overview action, no context-card Inspect actions, a successful
Inspector open/close cycle, and unchanged project, current node, semantic zoom,
and Search state. The same release-only harness now also directly exercises both
built-in samples, source identity/location, modal containment, exact source
copying, repeated deterministic node-summary copying, and state independence.

## Deterministic candidate build

Two independent clean relative-base builds each transformed 310 modules and
produced byte-identical 14-file inventories totalling 3,257,270 bytes:

| Relative path | Bytes | SHA-256 |
| --- | ---: | --- |
| `assets/index-BL1wGqMF.js` | 550893 | `a5ce793efcd4bff0d1748c495788dd9c37b1ec3ab18a50a39cb704032ff075b5` |
| `assets/index-COR_keLr.css` | 106339 | `d095ba104feef3b3e18be7b0e31c311de043c19022a7c53bdf2dcb36b0da9aad` |
| `assets/LICENSE.emscripten-B2z4oyCl.txt` | 1326 | `99d9a9616fbde3f5ee22a71d8645799a8522d48526130c5ba6dc27ad15ce01f1` |
| `assets/LICENSE.xerces-CIVX19zl.txt` | 11358 | `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30` |
| `assets/NOTICE.xerces-CKTk4Q_3.txt` | 560 | `95e5cca2ff3d0801841d9d17f0eec16bfb02dd6893ff7e55da4ec5a5dd30aa52` |
| `assets/runtime-manifest-Dn0tC2PW.json` | 1958 | `efb290059722ed95af6e7208e24917e04f6d7dd066de4bb0c28ee78e99518951` |
| `assets/schemaImportWorker-Caeajx9r.js` | 361477 | `7871cd146f0e18705bb2a7b195489883186bdafd032fc27ec43c692a4f215f82` |
| `assets/schemaImportWorker-DmzK6d_I.ts` | 1923 | `56466ecc018a8ec96baa671da561729bda4ab0ced379915977dec904bde88880` |
| `assets/xerces-runtime-BBH8HuGk.js` | 27151 | `e00a4618d52f24aa24a8d6d49173cfb2a7556627a7c71ef54650dde00923becc` |
| `assets/xerces-runtime-C8Jf8PRy.wasm` | 2162515 | `4b12de73b9b8ca974ea9caca2bcf38b7538c4a48fac8f52a98a80cfbdec6ab74` |
| `assets/xml-carousel-logo-DOor6qT5.svg` | 1048 | `49c0e129cb288d974f5c79041e2dd44c854ef328907f9aee270ce8f145820574` |
| `index.html` | 529 | `330b15bde677171ba5f443731695298282f4d0e71f9236e592c2325b04365df7` |
| `LICENSE.txt` | 7048 | `a2010f343487d3f7618affe54f789f5487602331c0a8d03f49e9a7c547cf0499` |
| `THIRD_PARTY_NOTICES.txt` | 23145 | `42634753356d915fab02027d81874fd3b2c73a53fc1a80619cf10f4e3f49f0b0` |

The canonical inventory SHA-256 is
`39f0f141b99f43aaeec8de09a189ec4f6ba65b06edbb55008179b8cf3147ddd9`.
It hashes the UTF-8/LF, ordinal-path-sorted rows
`relative-path<TAB>bytes<TAB>sha256<LF>`. Both builds produced this digest and
zero inventory differences.

Exactly one nonempty JavaScript schema-import worker exists:
`assets/schemaImportWorker-Caeajx9r.js`, 361,477 bytes. The `.ts` asset is
retained source input, not a second JavaScript worker. `npm run verify:dist --
--base=./` confirmed relative `./assets/...` references, two HTML-referenced
assets, six Xerces runtime/attribution assets, two release notices, root/nested
portability, no source maps, and normalized repository/distribution licence and
notice identity.

`npm run verify:hostile-mime` passed at `/` and `/xml-carousel/`: 16 requests,
2/2 HTML assets, WebAssembly served as `application/octet-stream`, and no
production `.mjs`. The unchanged final build remains in ignored `dist/` for
manual QA. The temporary comparison copies were removed after their inventories
matched so repository-wide lint would not traverse generated JavaScript.
The final aggregate-validation rebuild reproduced the same 14-file digest, so
the preserved `dist/` is byte-identical to the browser-tested candidate.

## Controlled Chrome evidence

Chrome `151.0.7922.77` passed all 14 top-level assertions against the preserved
candidate build. The run completed 30 mixed lifecycle cycles, 8 responsive
viewports, root and nested deployment smokes, two isolated 10,000-node imports,
invalid/cancelled replacement recovery, and worker cleanup. Heap sampling stayed
within its threshold: first-three median 9,785,820 bytes, final-three median
10,425,724 bytes, allowed increase 33,554,432 bytes.

The run directly covered built-in Book DTD and Library XSD, standalone DTD/XSD,
resolved ZIP, Search, carousel navigation, Inspector independence,
Full/Compact/Overview, the single focused Overview Inspect action, relationship
lines, project replacement, source identity and exact location, source-modal
containment, two identical deterministic node-summary copies, and an exact
retained-source copy. It recorded 0 page errors and 0 console warnings/errors.

Chrome also supplied supported forced-colour instrumentation: controls, range,
disabled state, focus, and distinct relationship patterns remained visible.
Reduced-motion transitions completed without animation artifacts. Ten current
screenshots are retained with the machine-readable report under ignored
`.vite/release-0.2.0-candidate/`.

## Controlled Firefox evidence

Firefox `153.0.3` with geckodriver `0.37.1` passed the same 14 top-level
assertions and 30 mixed lifecycle cycles against the same candidate bytes. It
covered the same import, navigation, semantic-zoom, focused Overview Inspect,
developer-handoff, responsive, large-schema, recovery, and worker-cleanup
scenarios with 0 page errors and 0 console warnings/errors.

The controlled profile supplied reduced-motion evidence. Firefox reported the
harness's forced-colour emulation as unsupported, so forced-colour evidence is
claimed from Chrome only. Firefox does not expose the Chromium-style request
event list through this WebDriver harness; the local hostile-MIME server still
recorded its 575 candidate-asset requests, and the no-external-request boundary
is supported by the controlled loopback server plus the product's resolver and
network tests.

## Privacy and network evidence

Chrome captured 243 browser requests and all used the harness loopback origin.
Its hostile-MIME server recorded 579 requests. Firefox's server recorded 575
requests, also solely for the locally served candidate. Neither browser produced
a `file:` request, page error, console warning/error, remote-schema request, or
unexpected production `.mjs` request.

The captured traffic consists of HTML, JavaScript, CSS, WebAssembly, SVG,
runtime manifests, and licence/notice assets served from the controlled static
site. Clipboard instrumentation retained copied text only inside the temporary
browser page for comparison; it did not transmit it. No XML Carousel backend,
analytics, telemetry, crash reporting, remote host, or unexpected origin
received schema, source, or node-summary content.

## Large-project evidence

Canonical validation and controlled-browser evidence must retain coverage for
`large-10000.dtd`, `large-10000.xsd`, `large-40000.dtd`, `large-40000.xsd`, the
20-by-1000 XSD package, and the unresolved-reference package. The browser harness
loads the two 10,000-node fixtures separately and exercises cancellation/worker
cleanup with the established 40,000-node fixture.

The candidate browser runs successfully imported and searched both 10,000-node
fixtures in isolated flows and rendered all three semantic-zoom presentations
with at most 20 visible carousel cards. All 30 mixed cycles used the 40,000-node
DTD cancellation path and ended with no live worker. Canonical validation passed
the 40,000-node bounded-DOM, cancellation, unresolved-reference, and package
contracts.

The committed `large-40000.xsd`, resolved `large-xsd-package-20x1000.zip`, and
unresolved `large-xsd-package-unresolved-10x1000.zip` remain established manual
fixtures and were not combined into the short-timeout browser run. Ben's final
manual QA retains a practical large-schema smoke rather than requiring all of
those resource-intensive loads in one session.

## Candidate manual-QA status

Ben final release QA: pending

The required manual handoff covers core DTD/XSD/ZIP imports, invalid-import state
preservation, navigation and all semantic-zoom levels, focused Overview Inspect,
source/copy utilities, accessibility/reflow, a practical large-schema smoke,
privacy, and candidate identity.

## Publication and deployment status

Release-candidate integration: pending

Hosted CI on exact candidate merge SHA: pending

Annotated v0.2.0 tag: not created

GitHub Release: not created

Deployment: not performed

Live-site verification: not performed

The canonical site remains the published 0.1.0 deployment. No publication,
production rebuild, file transfer, or live-site claim is made for 0.2.0.

## Residual limitations

XSD 1.1 and XML instance-document product input remain unsupported. Projects are
read-only; editing, export, remote schema retrieval, arbitrary host-filesystem
discovery, and persisted recent-project/session reopening are not implemented.
Dependencies resolve only from explicitly supplied project files. Safari/WebKit
and manual screen-reader certification are not claimed. Practical capacity
depends on browser, device resources, schema shape, and package size.

## Candidate conclusion

Candidate automated validation, complete standards/visualization evidence,
deterministic-build proof, and controlled Chrome/Firefox evidence all pass. No
release-blocking product defect or new production vulnerability was found. The
unstaged candidate is ready for Ben's XML Carousel 0.2.0 release-candidate manual
QA.

Manual QA, integration, exact-SHA hosted CI, tag/publication authorization,
binary-mode deployment, deployed-byte verification, and live-site smoke remain
separate pending gates.
