# XML Carousel 0.3.0 — Release and Deployment Report

Release date: 2026-09-02. Title: **XML Carousel 0.3.0 — Third Public Alpha**.
Public repository: `benjaminisawolfe/xml-carousel`.

Publication and canonical-site deployment are complete. The exact preserved
release distribution is deployed at <https://xmlcarousel.knowone.ca>, with all
19 files byte-verified and independent live Chrome and Firefox smoke passed.
No rollback is required. This post-release documentation update records the
completed work without changing the annotated tag or deployed runtime bytes.

## Source and Publication Identity

- Historical preparation baseline: `edda9ce3125330853c73d1b483be3ca2cfd7ccac`
- Historical preparation tree: `e6d2f80a2987df88315f8b1de99b78b0f887ae70`
- Release branch: `release-0.3.0`
- Version: `0.3.0`; package and both root lockfile versions agree.
- Release task commit: `1e476dacd17b3c2003fc18d6224d16f72452a981`
- Release source commit: `09ba96274e61f8c6486f2fe6eb0a498ed9412e67`
- Release task/source tree: `5bf3a2ba8935e2456f245fd5ebdc1fe87ac3cfd5`
- Annotated tag: `v0.3.0`
- Tag object: `6aae292e03910458b28328f419833b688bb14c16`
- Tag target: `09ba96274e61f8c6486f2fe6eb0a498ed9412e67`
- GitHub title: `XML Carousel 0.3.0 — Third Public Alpha`
- GitHub Release ID: `381707566`; draft: `false`; prerelease: `true`.
- Published at: `2026-09-03T03:28:43Z` (2026-09-02 in the release timezone).
- Hosted CI: [run 33711160857](https://github.com/benjaminisawolfe/xml-carousel/actions/runs/33711160857),
  validate job `100510728653`, completed successfully on the release source.
- Canonical site: <https://xmlcarousel.knowone.ca>
- Deployment: completed using the exact preserved release distribution.

Both historical tags/releases were present unchanged before preparation;
`v0.3.0` was absent locally, at origin, and in GitHub releases. Historical
`v0.2.0` retains tag object `8584d805caa734edbab712c6b4e2b16667304ff9`
and source commit `1c744fd16079cbefcaf1f4c96d69c1897e9727ab`.

The release task was merged with `--no-ff`; its tree equals the release merge
tree, with no integration edits. The published annotated tag object and target
were independently verified. GitHub zipball and tarball contents matched every
blob in the exact tagged tree, with no missing or extra files. Historical
0.1.0/0.2.0 release metadata, tag objects, and targets remained unchanged.

## Scope and Historical Contracts

No product source or behavior changes. Dependencies/devDependencies, lockfile
resolutions/integrities, corpus, licenses, runtimes, and browser/conformance/
visualization evidence remain unchanged. `pnpm-lock.yaml` is absent.
The original release changed version metadata and release packaging records.
The closure adds user documentation, completed deployment records, and narrow
documentation regression tests. Licensing and historical release records need
no edits. The [user guide](using-xml-carousel.md) explains current operation;
the [maintenance follow-up](release-0.3.0-maintenance.md) records runtime Help
corrections for a later patch, not this immutable release.

The [source record](release-0.3.0-source-record.json) preserves the baseline
README and root package identities for the two historical 0.2.0 packaging
suites. Their original expected values and assertions remain unchanged; only
their historical input binding changes. A separate 0.3.0 suite checks current
release truth and pins the historical snapshot and preserved records.

The release acceptance verifier normalizes only the three authorized version
fields when comparing against historical candidate production inputs. It also
checks the independently recorded current digest. No matrix generator,
catalogue, browser harness, or accepted evidence record changes.

- Candidate production-input SHA-256:
  `c628736f9d80c6e00fce2017ff98caffa45d84dee837726d01b1ac7f6ef65d67`
- Release production-input SHA-256:
  `5df05a36560cdbe07e623bb0af461d5507bdc327fff66260fd395660dbf96840`

The difference is exclusively `package.json.version`, `package-lock.json.version`,
and `package-lock.json.packages[""].version`, each `0.2.0` to `0.3.0`.
The unchanged [candidate record](release-0.3.0-candidate.md) remains historical
prepublication evidence, including its original version and pending decisions.

## Historical Release Audit and Validation

`npm ci` and `npm ls --all` passed. `npm audit --omit=dev --json` reports zero
production vulnerabilities. The full audit reports two high-severity transitive
development-only advisories: `js-yaml` (GHSA-5p4m-2wfm-xmqj) and `nanoid`
(GHSA-2v37-7h3g-55p8). This follows the existing policy: production findings
block release; these recorded development-only findings do not require
dependency remediation under this authority. No audit fix or update was run.

`npm run validate` passed: 193/193 Vitest files and 2,450/2,450 tests;
Svelte/TypeScript: 0 errors and 0 warnings. Both runtime verifiers, release
integrity, 221-row visualization, RELAX NG conformance and 77-row visualization,
lint, formatting, relative-base build, distribution verification, and hostile
MIME verification passed. `npm run acceptance:relaxng-release` passed 60/60.
DTD CI passed 3 tests (1 intentional skip; 64 classified cases); XSD CI passed
6 tests (1 intentional skip; 52 classified cases). Both had zero unexpected
failures and harness errors.

An initial run exposed an optional-parameter type annotation in the new
packaging verifier; it was corrected before acceptance. Two later full runs
hit an existing Search test's 5-second timeout. That unchanged test passed
alone in 1.54 seconds, and the complete unchanged suite then passed with four local Vitest workers
(VITEST_MAX_FORKS=4, VITEST_MIN_FORKS=1) on this 28-logical-CPU host. No
product code, test timeout, or test expectation was changed to address it.
The standard Vite large-chunk advisory remains nonblocking.

## Preserved Acceptance

The [release notes](third-public-alpha.md) record the frozen authority values:
60/60 Task 17.10, 221/221 historical visualization, 77/77 RELAX NG visualization,
and 385 spectest + 90 compacttest = 475 selected with zero excluded,
investigations, or harness errors. The reviewed 40 product-boundary and
2 security-policy differences remain explicit.

Chrome 152.0.7977.65 and Firefox 155.0 each passed 233/233 Task 17.10 checks;
geckodriver 0.37.1 revision 300705c65d1b and axe-core 4.13.0 were used.
There were 72 representative axe screens and zero serious/critical findings.
Ben's manual QA is complete per the release authority. No Safari/WebKit,
manual screen-reader, or physical-phone certification is claimed.

## Distribution and Release Smoke

Two clean-output builds produced identical raw bytes, relative paths, sizes,
and per-file SHA-256: **19 files, 3,826,638 bytes**.
Canonical inventory SHA-256:
`250c34a66ec6240ef63bb08553d49ae7fb3cee4cbda28405b6e6ba29fbed3804`.
This is also byte-identical to the accepted Task 17.10 distribution; version
metadata does not appear in runtime assets. The canonical inventory hashes
JSON.stringify(sorted [{path,sha256}], null, 2) plus LF; the external manifest
also records every byte size. Relative assets, workers, WASM and notices
passed verification; no test corpus, JARs, source maps or temporary files ship.
The exact accepted distribution and its inventory were preserved externally
and subsequently used for the completed manual deployment.

Because the release integrity verifier changed, the unchanged browser harness
was rerun in full: Chrome and Firefox each passed 233/233 on final release
bytes at both `/` and `/xml-carousel/`. Each run includes 26 focused checks
covering startup, RNG/RNC import, Search/Inspect, exact original source/copy,
and Full/Compact/Overview. Each also passed 36 axe screens with zero
serious/critical findings. Page errors, unexpected console errors, remote
schema requests, file requests and unexpected origins were all zero. Original
Task 17.10 browser evidence remains unchanged; these are separate release
observations. Browser automation reads byte-identical build output; the
preserved copy is independently reverified against that inventory.
Both source archives were compared against the exact public tag tree.
GitHub archive hashes are observations; the annotated tag and commit/tree are
the canonical immutable source identity.

## Canonical-Site Deployment

Ben confirmed the intentional migration to <https://xmlcarousel.knowone.ca>
and completion of the manual FTP transfer in Binary/Image mode for all files.
The previous hostname, `xmlcarousel.wolfshafenpress.com`, redirects with HTTP
301 to the new canonical host. The assistant performed no hosting writes.

Cache-bypassed observations at `2026-09-03T04:08:13.987Z` verified HTTP 200,
exact raw-byte lengths, and exact SHA-256 for **19/19 files / 3,826,638 bytes**.
There were zero missing or mismatched files. The deployed canonical inventory
SHA-256 is
`250c34a66ec6240ef63bb08553d49ae7fb3cee4cbda28405b6e6ba29fbed3804`.
The root and `index.html` were 529 bytes with SHA-256
`75990378aebb4b7dd70e586f2ff514c825eca9c62887387acbceb29fd13c52ce`.
The complete verified file inventory appears below.

HTML, executed JavaScript/workers, CSS, WASM, manifests, and licence/notice
assets had suitable MIME types. Both WASM files were `application/wasm` and
both standards engines ran successfully in each browser. The retained `.ts`
provenance asset was served as `video/mp2t`; it is not an executed browser
dependency and remained byte-exact.

Independent fresh-session live smoke passed:

| Browser | Version | Checks | UTC Start | UTC Completion |
| --- | --- | ---: | --- | --- |
| Chrome | 152.0.7977.65 | 76/76 | 2026-09-03T04:12:29.862Z | 2026-09-03T04:12:40.190Z |
| Firefox | 155.0; geckodriver 0.37.1, revision 300705c65d1b | 76/76 | 2026-09-03T04:13:03.342Z | 2026-09-03T04:13:18.207Z |

Both covered startup, RNG/RNC import, Search, Navigation, carousel journey,
independent Inspect, original source/copy, Full/Compact/Overview, focused
Overview Inspect, narrow viewports, retained Problems after invalid
replacement, blocked references, workers, and runtimes. Each also passed 16
axe scans with zero reported violations; these live scans are separate from
the 72-screen release acceptance. Incomplete axe checks are retained in the
external evidence; no broader accessibility certification is implied.

| Live Request/Error Category | Chrome | Firefox |
| --- | ---: | ---: |
| Normal application static requests | 50 | 50 |
| Approved legacy redirect navigation | 1 | 1 |
| Automatic same-origin favicon GET | 1 | 1 |
| Total observed requests | 52 | 52 |
| Schema-data transmission | 0 | 0 |
| Remote schema retrieval | 0 | 0 |
| File retrieval | 0 | 0 |
| Analytics/telemetry/crash requests | 0 | 0 |
| Unexpected origins or application paths | 0 | 0 |
| Old bundle requests | 0 | 0 |
| Page, console, or instrumentation errors | 0 | 0 |

The automatic favicon request returned 404 and was accounted for separately:
the accepted index declares no favicon asset, and the request carried no
schema data. The first Chrome audit over-classified that request; the external
audit classification was corrected and fresh runs of both browsers passed.
No application code or broad network allowlist changed.

Three known 0.2.0 assets remained HTTP 200, with their historical hashes:
`assets/index-BL1wGqMF.js`, `assets/index-COR_keLr.css`, and
`assets/schemaImportWorker-Caeajx9r.js`. The accepted index references none and
neither browser requested them. Manual hosting cleanup remains for those exact
paths only; their absence has not been claimed.

Rollback was not required and was not performed. The historical 0.2.0
deployment identity was retained as a rollback reference; a complete exact
0.2.0 distribution was not located and no replacement was rebuilt. Because
Ben's transfer preceded confirmation here, the observed live baseline was
already 0.3.0, not an independently captured pre-overwrite 0.2.0 state.

Retained external evidence includes `release-0.3.0-publication-state.json`,
`release-0.3.0-archive-verification.json`, and `deployment-0.3.0-live/` containing
`deployment-report.md`, `live-byte-verification.json`, `chrome-verified.json`,
`firefox.json`, and `final-integrity.json`. These are under
`C:/Users/Administrator/.codex/visualizations/2026/09/02/01a063fb-af7f-7572-a742-d08ace54349a/`.
Final deployment integrity was checked at `2026-09-03T04:14:01.729Z`: source,
tag, package version, and GitHub prerelease were unchanged.

## Post-Release Closure

The [checklist](release-0.3.0-checklist.md) records completed publication and
deployment. Documentation closure is prepared on `release-0.3.0-closure` for
manual QA, unstaged and uncommitted. The corrected GitHub Release body is a
handoff artifact only; the published body remains unchanged pending separate
approval. Ben subsequently authorized the full local validation command,
including its build, while keeping the external preserved release distribution
and deployment untouched. No redeployment, tag movement, or runtime Help edit
is part of this documentation work.

## Verified Distribution Inventory

| Relative path | Bytes | SHA-256 |
| --- | ---: | --- |
| `LICENSE.txt` | 7048 | `a2010f343487d3f7618affe54f789f5487602331c0a8d03f49e9a7c547cf0499` |
| `THIRD_PARTY_NOTICES.txt` | 23204 | `bac8d3d998d63bd4d772e6c012ecdc39e547ba4e590abcbf4e9993824ecb3fee` |
| `assets/LICENSE.emscripten-B2z4oyCl.txt` | 1326 | `99d9a9616fbde3f5ee22a71d8645799a8522d48526130c5ba6dc27ad15ce01f1` |
| `assets/LICENSE.libxml2-Dw3jice5.txt` | 1314 | `5d4873884a890122a4b9b20ad56ac6f7da1d796a5bfcf04a427970ac96217626` |
| `assets/LICENSE.xerces-CIVX19zl.txt` | 11358 | `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30` |
| `assets/NOTICE.xerces-CKTk4Q_3.txt` | 560 | `95e5cca2ff3d0801841d9d17f0eec16bfb02dd6893ff7e55da4ec5a5dd30aa52` |
| `assets/index-B_K6vnFA.js` | 581117 | `1350a8d78f92cf2b78cc0c04f1f7c10db76dd7bb8b1fc999fe0d945dfae6e482` |
| `assets/index-DtCt0c7U.css` | 106339 | `a5c31e19a81615167a42390674e082c1796cf0ad6e7ad9c1f7b860a8bd342881` |
| `assets/libxml2-relaxng-runtime-CJjnU_TS.js` | 14084 | `1cb2021f60c120b7130875f9b7e967ea0a35b00ae70f5e8b262cf82411668868` |
| `assets/libxml2-relaxng-runtime-DWck1noo.wasm` | 383299 | `f587a4f9e2722bc5c132586de9224b2acf6ee22afa812889a3c6d70dc0a7af80` |
| `assets/relaxNgStandardsWorker-pls-HboB.js` | 68536 | `8428132164e55f56fbdb1482061ddd0e4a0bddab0775c0a19764d2d770da889e` |
| `assets/runtime-manifest-B8ZAhBmz.json` | 3709 | `c8e4d6ade03cbc8eb27fed13484ef39df25ee070d9e4c03aff861d526410a1ad` |
| `assets/runtime-manifest-Dn0tC2PW.json` | 1958 | `efb290059722ed95af6e7208e24917e04f6d7dd066de4bb0c28ee78e99518951` |
| `assets/schemaImportWorker-DmzK6d_I.ts` | 1923 | `56466ecc018a8ec96baa671da561729bda4ab0ced379915977dec904bde88880` |
| `assets/schemaImportWorker-Qx5TPuXr.js` | 429620 | `2d5e8458d573f0e8ae626abd0eb38a6eaf6a500d4444e73b094b6e1eed0c57d0` |
| `assets/xerces-runtime-BBH8HuGk.js` | 27151 | `e00a4618d52f24aa24a8d6d49173cfb2a7556627a7c71ef54650dde00923becc` |
| `assets/xerces-runtime-C8Jf8PRy.wasm` | 2162515 | `4b12de73b9b8ca974ea9caca2bcf38b7538c4a48fac8f52a98a80cfbdec6ab74` |
| `assets/xml-carousel-logo-DOor6qT5.svg` | 1048 | `49c0e129cb288d974f5c79041e2dd44c854ef328907f9aee270ce8f145820574` |
| `index.html` | 529 | `75990378aebb4b7dd70e586f2ff514c825eca9c62887387acbceb29fd13c52ce` |
