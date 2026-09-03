# XML Carousel 0.3.0 — Release Preparation Report

Release date: 2026-09-02. Title: **XML Carousel 0.3.0 — Third Public Alpha**.
Public repository: `benjaminisawolfe/xml-carousel`.

This is the record frozen before the release commit. The external final report
will record actual publication identities after exact-source hosted CI, tagging,
and GitHub publication. This file does not assert that pending steps completed.
Canonical-site deployment has not been performed under this release authority.

## Source and publication boundary

- Baseline commit: `edda9ce3125330853c73d1b483be3ca2cfd7ccac`
- Baseline tree: `e6d2f80a2987df88315f8b1de99b78b0f887ae70`
- Branch: `release-0.3.0`
- Version: `0.3.0`; package and both root lockfile versions agree.
- Release task commit/tree: pending source freeze and commit.
- Release source commit/tree: pending exact no-ff merge and hosted CI.
- Annotated tag: `v0.3.0`; object: pending.
- GitHub title: `XML Carousel 0.3.0 — Third Public Alpha`
- GitHub Release ID: pending; intended state: non-draft prerelease.
- Canonical site: <https://xmlcarousel.wolfshafenpress.com/>
- Deployment: not performed; separate authority required.

Both historical tags/releases were present unchanged before preparation;
`v0.3.0` was absent locally, at origin, and in GitHub releases. Historical
`v0.2.0` retains tag object `8584d805caa734edbab712c6b4e2b16667304ff9`
and source commit `1c744fd16079cbefcaf1f4c96d69c1897e9727ab`.

## Scope and historical contracts

No product source or behavior changes. Dependencies/devDependencies, lockfile
resolutions/integrities, corpus, licenses, runtimes, and browser/conformance/
visualization evidence remain unchanged. `pnpm-lock.yaml` is absent.
Known-limitations changes only release-state wording; licensing needs no edit.

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

## Audit and validation

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

## Preserved acceptance

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

## Distribution and focused smoke

Two clean-output builds produced identical raw bytes, relative paths, sizes,
and per-file SHA-256: **19 files, 3,826,638 bytes**.
Canonical inventory SHA-256:
`250c34a66ec6240ef63bb08553d49ae7fb3cee4cbda28405b6e6ba29fbed3804`.
This is also byte-identical to the accepted Task 17.10 distribution; version
metadata does not appear in runtime assets. The canonical inventory hashes
JSON.stringify(sorted [{path,sha256}], null, 2) plus LF; the external manifest
also records every byte size. Relative assets, workers, WASM and notices
passed verification; no test corpus, JARs, source maps or temporary files ship.
An exact accepted distribution and its inventory are preserved externally for
separate deployment authority.

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
Both source archives will later be compared against the exact public tag tree.
GitHub archive hashes are observations; the annotated tag and commit/tree are
the canonical immutable source identity.

The [checklist](release-0.3.0-checklist.md) separates preparation from publication.
No canonical-site deployment, live-site release verification, uploaded binary
asset, or post-tag source mutation is part of this release authority.


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
