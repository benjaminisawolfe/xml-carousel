# XML Carousel 0.1.0 — Release and Deployment Report

- Report prepared: 2026-08-05
- Release date: 2026-08-05

## Publication identity

- Version: `0.1.0`
- Annotated tag: `v0.1.0`
- Source commit: `fad25bd26e2d197a4e7d5db364ad5933d67e8c81`
- Source tree: `111b14268ce1273ff1717ef193aef267fcaf450a`
- Tag object: `921fa5d1d6ba0ebea9cc76dbc287f4b1ff77641f`
- GitHub Release ID: `365357518`
- Release title: XML Carousel 0.1.0 — First Public Alpha
- Release state: published as a prerelease
- Canonical site: <https://xmlcarousel.wolfshafenpress.com/>
- Deployed inventory SHA-256:
  `2f73adbba3ec0837fd6c4bf5c86e879af1fa0bef7730f14e6afbf0040d412dc0`

## Historical candidate identity

- Version: `0.1.0`
- Planned annotated tag: `v0.1.0`
- Planned release title: XML Carousel 0.1.0 — First Public Alpha
- Source baseline: `5de79c08ef38277a1147658ffe416c04d16111d4`
- Source tree: `07ff8adba5a4a28621bbc740f94897ea2f150ea0`
- Task branch: `task-first-alpha-release-candidate-preparation`
- Node: `v24.16.0`
- npm: `12.0.1`
- Git: `2.55.0.windows.3`
- Operating system: Microsoft Windows NT `10.0.26200.0`
- Repository visibility: public
- Default branch: `main`
- Hosted CI for the exact source baseline: passed

At candidate-preparation preflight, the candidate was not tagged, published as
a GitHub Release, or deployed. Those statements record the historical state at
that gate; the publication identity above records the completed release.

## Source and scope

Candidate-preparation changes are limited to:

- `README.md`;
- `docs/first-public-alpha.md`;
- `docs/release-candidate-report.md`;
- `docs/third-party-licensing.md`;
- `scripts/verify-release-integrity.mjs`; and
- `src/tests/PublicAlphaPackaging.test.ts`.

The correction updates release documentation and its stable verification
contract. It changes no application behavior, UI, styles, parser, Xerces
runtime, worker, fixture, dependency, workflow, package metadata, or build
configuration. `package.json` and `package-lock.json` both remain at `0.1.0`;
there was no dependency refresh and no package-file change.

Protected identities remain:

| Protected file | Git blob | SHA-256 |
| --- | --- | --- |
| `docs/development-plan.md` | `0aa34eebebf2ad252fcc77d869749df283ad553f` | `b6c7d1c7a53a59e20a1145497643dc6435fde37691ee30b36fc636eb8157fa06` |
| `docs/style-guide.md` | `9a04be1007153e446e2227f4fa0bfe0d83238077` | `29aa9fa48125af16560dbac21af7f3b51e680ad9bdcb591c78d26ffcc79afb1e` |

## Audit and integrity

`npm ci` installed the locked dependency tree without changing tracked files.
`npm ls --all` exited successfully with zero invalid, extraneous, or required
unmet dependencies. Platform- and feature-specific optional dependencies were
reported as optional omissions.

`npm audit --json` and `npm audit --omit=dev --json` each reported:

| Severity | Full audit | Production-only audit |
| --- | ---: | ---: |
| Info | 0 | 0 |
| Low | 0 | 0 |
| Moderate | 0 | 0 |
| High | 0 | 0 |
| Critical | 0 | 0 |
| Total | 0 | 0 |

The audit metadata reported 35 production, 286 development, 52 optional, and
320 total dependencies.

`npm run verify:release-integrity` verified 16 bundled JavaScript components,
the archive-backed James Clark `invalid-not-sa-022` case, and its two selected
archive entries. It also verified:

- the CC0 identifier and application licence;
- deterministic `THIRD_PARTY_NOTICES.txt` generation from the lockfile and
  locked package licence sources;
- separate Xerces-C++ and Emscripten attribution identities;
- the unchanged James Clark archive and provenance notice;
- absence of the unpacked James Clark entries;
- offline archive-backed loading with no validation-harness network access;
- W3C and Simplified DocBook notices; and
- validation and portable-packaging integration.

The replacement public repository has clean parentless history and does not
contain the historical unpacked blobs. The former historical repository is
private and archived. This resolves the finding for GitHub repositories under
Ben's control; independent third-party caches or clones may still exist.

## Automated validation

The required commands passed:

- `npm ci`;
- `npm run verify:release-integrity`;
- `npm run validate`;
- `npm run spike:xerces:test`;
- `npm run w3c:dtd:ci`;
- `npm run w3c:dtd:full`;
- `npm run w3c:xsd:ci`;
- `npm run w3c:xsd:full`;
- `npm run spike:xerces:compare`; and
- `npm run acceptance:complete-visualization`.

The canonical `npm run validate` result was:

- 153 test files passed;
- 2,095 tests passed;
- zero Svelte/TypeScript errors and zero warnings;
- ESLint passed;
- formatting passed;
- Apache Xerces-C++ 3.3.0 production runtime verification passed;
- production build completed with 294 transformed modules;
- portable static-build verification passed; and
- hostile-MIME root/nested verification passed.

The Vite large-chunk advisory is informational and does not indicate a failed
build or candidate-integrity defect.

## Standards and visualization evidence

### Complete supported visualization

`npm run acceptance:complete-visualization` passed:

- matrix: 221/221 complete;
- matrix SHA-256:
  `1e31059953b718750a749a23760e7f5540966e988562033ba1dc69b57bed84b2`;
- reachability: 52 node kinds, 52 edge kinds, and five package-entry kinds;
- release-blocking visualization diagnostic codes: seven;
- partial, misleading, retained-unreachable, and source-only supported rows:
  zero; and
- acceptance result: PASS.

This is complete presentation evidence for the supported contracts, not a
claim to support XSD 1.1 or every XML-related standard.

### Xerces spike

`npm run spike:xerces:test` passed 10 test files and 60 tests.

### W3C DTD evidence

| Result category | CI | Full |
| --- | ---: | ---: |
| Pass | 43 | 1,912 |
| Fail | 0 | 0 |
| Unsupported by current product boundary | 1 | 1 |
| Instance-dependent outside standalone DTD check | 2 | 4 |
| Optional error accepted | 2 | 4 |
| Optional error reported | 14 | 20 |
| Blocked by security policy | 2 | 9 |
| Harness error | 0 | 0 |

### W3C XSD 1.0 evidence

| Result category | CI | Full |
| --- | ---: | ---: |
| Pass | 43 | 171 |
| Fail | 0 | 0 |
| Unsupported | 1 | 3 |
| Instance-dependent | 2 | 2 |
| Optional accepted | 0 | 0 |
| Optional reported | 0 | 0 |
| Security-blocked | 2 | 2 |
| Metadata-disputed | 4 | 4 |
| Harness error | 0 | 0 |

### Xerces-J comparison

The Apache Xerces-J 2.12.2 comparison passed 92 cases across 33 families with
zero unexpected disagreements. Comparator warnings about the unsupported
`accessExternalSchema` property did not bypass the controlled local resolver.

## Regression evidence

### Simplified DocBook

The fixed fixture is 46,263 bytes with SHA-256
`a6581df71f08bf6020bf467c80246196bf70e37203ca430588b42487fc6476b2`.
It produced 106 declarations, 106 Navigation records, 106 Search records,
resolved `revision` references, and zero visualization findings.

### Hermetic Foundry and standalone boundary

The supplied external `xml-schemas.zip` archive remained read-only and outside
the repository. Its accepted identity is 134,821 bytes and SHA-256
`c17ce1c44cd5aa309bcc652bb43f64e30bc993aef52a0347cfbc799a32886a8f`.

The exact archive produced:

- classification: valid and complete;
- 85 package entries: 82 files and three directories;
- 38 XSD schema sources and 44 ignored entries;
- 33 root candidates;
- 3,958 normalized nodes;
- 4,043 Search documents;
- 3,739 source-markup records;
- 39 project-local schema-location references;
- zero external or absolute references;
- zero missing archive references;
- zero unresolved package relationships; and
- zero visualization findings, omissions, or placeholders.

Original, reversed, and deterministically shuffled ZIP entry orders all
produced normalized SHA-256
`f7afe07f003c8d3423f5c5ec7551afa5d8a320a2626c0f76430c7c1701327a4a`.

The standalone `foundry-common.xsd` missing-sibling probe failed as intended:
classification `standards invalid`, import status `failure`, blocked dependency
true, and missing project-local dependency `foundry-rich-text.xsd`.

### Adversarial import boundary

All six families passed:

- archive boundaries and paths;
- extracted-size and compression limits;
- project path, reference depth, and cycle policy;
- diagnostic classification and retention;
- worker timeout, cancellation, and recovery; and
- native Xerces path security.

The audit recorded zero failed cases, zero external requests, zero `file:`
requests, and zero live workers after cases.

## Deterministic candidate build

Two clean relative-base builds were independently built, verified, inventoried,
removed, and rebuilt. Both transformed 294 modules and produced the following
identical 14-file inventory:

| Relative path | Bytes | SHA-256 |
| --- | ---: | --- |
| `assets/index-KlEeE3EJ.js` | 512906 | `6a8612a559162542e17d54bccc48d97a6a7dd001daf804013b144c36868f5dc0` |
| `assets/index-n4v__Uad.css` | 86932 | `9613563aed289e612e6f6f53d706a4c72df516058452babca7e0987323230e18` |
| `assets/LICENSE.emscripten-B2z4oyCl.txt` | 1326 | `99d9a9616fbde3f5ee22a71d8645799a8522d48526130c5ba6dc27ad15ce01f1` |
| `assets/LICENSE.xerces-CIVX19zl.txt` | 11358 | `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30` |
| `assets/NOTICE.xerces-CKTk4Q_3.txt` | 560 | `95e5cca2ff3d0801841d9d17f0eec16bfb02dd6893ff7e55da4ec5a5dd30aa52` |
| `assets/runtime-manifest-Dn0tC2PW.json` | 1958 | `efb290059722ed95af6e7208e24917e04f6d7dd066de4bb0c28ee78e99518951` |
| `assets/schemaImportWorker-Caeajx9r.js` | 361477 | `7871cd146f0e18705bb2a7b195489883186bdafd032fc27ec43c692a4f215f82` |
| `assets/schemaImportWorker-DmzK6d_I.ts` | 1923 | `56466ecc018a8ec96baa671da561729bda4ab0ced379915977dec904bde88880` |
| `assets/xerces-runtime-BBH8HuGk.js` | 27151 | `e00a4618d52f24aa24a8d6d49173cfb2a7556627a7c71ef54650dde00923becc` |
| `assets/xerces-runtime-C8Jf8PRy.wasm` | 2162515 | `4b12de73b9b8ca974ea9caca2bcf38b7538c4a48fac8f52a98a80cfbdec6ab74` |
| `assets/xml-carousel-logo-DOor6qT5.svg` | 1048 | `49c0e129cb288d974f5c79041e2dd44c854ef328907f9aee270ce8f145820574` |
| `index.html` | 529 | `5932c95b85274d1bbc224fffcfd1e8a51c7b3fba9a94afc50c6016e88ca52ece` |
| `LICENSE.txt` | 7048 | `a2010f343487d3f7618affe54f789f5487602331c0a8d03f49e9a7c547cf0499` |
| `THIRD_PARTY_NOTICES.txt` | 23145 | `42634753356d915fab02027d81874fd3b2c73a53fc1a80619cf10f4e3f49f0b0` |

The canonical inventory SHA-256 is
`2f73adbba3ec0837fd6c4bf5c86e879af1fa0bef7730f14e6afbf0040d412dc0`.
The complete inventories were byte-for-byte identical.

Exactly one nonempty JavaScript schema-import worker exists:
`assets/schemaImportWorker-Caeajx9r.js`, 361,477 bytes. The emitted TypeScript
source asset is not a second JavaScript worker.

`npm run verify:dist -- --base=./` confirmed two relative HTML assets, six
Xerces runtime/attribution assets, two fixed release notices, safe relative
asset paths, and no source maps or server-only dependency. `LICENSE.txt` and
`THIRD_PARTY_NOTICES.txt` match their repository sources exactly.

The unchanged second build is preserved in ignored `dist/` for manual QA.

## Candidate browser evidence

No inherited browser evidence is used. The repository's controlled lifecycle
and responsive audit was rerun against the exact preserved candidate bytes.

### Chrome 151.0.7922.72

- all 11 lifecycle assertions passed;
- unchanged build passed at root and nested mounts;
- eight requested responsive viewports passed without horizontal or vertical
  page overflow, clipped modal content, or missing core controls;
- four package-presentation viewport audits passed;
- 30 mixed DTD/XSD/ZIP/invalid/cancel/recovery cycles passed;
- 10 complete Hermetic Foundry imports passed;
- zero console warnings/errors and zero page errors;
- zero external, `file:`, or production `.mjs` requests;
- zero live workers between imports; and
- heap first-three median 8,471,940 bytes, final-three median 9,176,440 bytes,
  slope 23,927.45806451613 bytes/cycle, within the 33,554,432-byte allowance.

### Firefox 153.0.1

- all 11 lifecycle assertions passed;
- unchanged build passed at root and nested mounts;
- eight effective responsive content viewports passed without horizontal or
  vertical page overflow, clipped modal content, or missing core controls;
- four package-presentation viewport audits passed;
- 30 mixed cycles and 10 complete Hermetic Foundry imports passed;
- zero console warnings/errors and zero page errors;
- zero external, `file:`, or production `.mjs` requests; and
- zero live workers between imports.

Firefox did not expose heap telemetry, so no Firefox heap-growth result is
claimed. This candidate-stage browser evidence did not claim Safari/WebKit, a
physical Samsung or other mobile device, manual screen-reader hardware,
browser-chrome zoom, deployment by FTP, or canonical-site validation. The
separate live-site evidence is recorded below.

The hostile-MIME audit separately passed at root and `/xml-carousel/`: 16
requests, 2/2 HTML asset references, WASM served as
`application/octet-stream`, JavaScript with a JavaScript MIME type, readable
licences/notices at both mounts, and no `.mjs` production request.

## Manual QA result

Ben's manual release-candidate QA passed before publication. The manual result
covered the release-candidate functional, large-schema, responsive, keyboard,
and release-readiness gates that were available in the tested environments.
Untested limitations remain explicit: no Safari/WebKit, physical-device,
manual screen-reader, browser-chrome zoom, or Firefox heap evidence is claimed.
Reduced-motion evidence is browser-emulated rather than manual OS testing.

## FTP deployment

Ben completed manual FTP deployment of the exact preserved 14-file static-site
package. No production rebuild followed publication, and the repository did
not gain a deployment workflow or GitHub Pages configuration.

## First deployed-byte attempt

The first cache-bypassed comparison found one mismatch:
`assets/xerces-runtime-BBH8HuGk.js`. The authoritative file was 27,151 bytes
with SHA-256
`e00a4618d52f24aa24a8d6d49173cfb2a7556627a7c71ef54650dde00923becc`;
the initial live file was 27,149 bytes with SHA-256
`ccf2afe14cc1130e93d780ae65c09272e955a708e3d24fa7424f79f94f1d1779`.
The final two authoritative CRLF line endings had been normalized to LF during
the first FTP transfer. The blocked finding remains part of the retained
release evidence.

## Binary transfer correction

Ben reuploaded only the mismatched Xerces runtime in FTP binary/image mode.
The immediate cache-bypassed gate then returned the authoritative 27,151 bytes
and SHA-256
`e00a4618d52f24aa24a8d6d49173cfb2a7556627a7c71ef54650dde00923becc`,
with a direct byte-for-byte match.

## Final deployed-byte verification

Fresh verification downloaded all 14 expected paths from
<https://xmlcarousel.wolfshafenpress.com/>. Missing, unexpected, mismatched,
and media-type-violation counts were all zero. `/` and `/index.html` were
byte-identical, and the final live inventory SHA-256 was
`2f73adbba3ec0837fd6c4bf5c86e879af1fa0bef7730f14e6afbf0040d412dc0`,
exactly matching the published package.

## Live Chrome verification

Chrome 151.0.7922.72 passed direct load and reload, expected static assets,
Book DTD and Library XSD samples, valid DTD/XSD/ZIP imports, Help focus
restoration, Search and Inspect journey behavior, rootward/leafward/spatial
navigation, escaped source, malformed-input preservation, cancellation and
stale-result protection, project replacement, responsive containment,
browser-emulated reduced motion, large-schema smoke, and final worker cleanup.

## Live Firefox verification

Firefox 153.0.1 passed the same applicable live-site flows. Firefox enforced a
500-CSS-pixel minimum effective width for the two narrowest requested portrait
windows; those effective viewports still passed containment. Firefox heap
telemetry was unavailable and is not claimed.

## Network and privacy verification

Application traffic used only `xmlcarousel.wolfshafenpress.com`. Counts were
zero for external, `file:`, mixed-content, production `.mjs`, schema-upload,
analytics, telemetry, crash-reporting, update-check, and unexpected
schema-retrieval requests. Console errors, page errors, failed required
requests, unhandled rejections, and surviving XML Carousel workers were zero.

## GitHub Release metadata correction

GitHub Release `365357518` was published under annotated tag `v0.1.0` as a
prerelease with the approved title and no attached assets. After deployment
verification, its body was corrected in place to remove a U+000B formatting
defect and stale pre-deployment statements. The corrected public body has
SHA-256
`58193b9c6d822ea338439c3ebea395a095a37550a00da64f8bab8f1dedeab00a`.
The title, tag, prerelease/draft state, assets, tag object, and tag target were
unchanged.

## Final release conclusion

Publication completed. The canonical deployment matches the exact release
package, the public Release metadata was corrected, and immutable annotated tag
`v0.1.0` remains on release commit
`fad25bd26e2d197a4e7d5db364ad5933d67e8c81`. No production rebuild followed
publication. XML Carousel remains alpha-quality exploratory software and is
ready for post-alpha feature development within its documented limitations.
