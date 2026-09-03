# XML Carousel 0.3.0 Release Checklist

Version: `0.3.0`. Title: `XML Carousel 0.3.0 — Third Public Alpha`.
Release date: `2026-09-02`. Tag policy: annotated `v0.3.0`.
GitHub state: non-draft prerelease. Deployment: completed.
Canonical site: <https://xmlcarousel.knowone.ca>.

This closure checklist records completed preparation, publication, and deployment
from the retained evidence in the [release report](release-0.3.0-release-report.md).
The immutable release source is `09ba96274e61f8c6486f2fe6eb0a498ed9412e67`, tree
`5bf3a2ba8935e2456f245fd5ebdc1fe87ac3cfd5`. The documentation closure is separate
from that tagged source and remains unstaged and uncommitted for manual QA.

## Completed Release Preparation and Publication

- [x] **[Codex—instructed]** Fetch tags; confirm local/origin `v0.3.0` and its
  GitHub Release are absent before changes. Preserve historical releases.
- [x] **[Codex—instructed]** Start `release-0.3.0` from exact clean baseline
  `edda9ce3125330853c73d1b483be3ca2cfd7ccac`, tree
  `e6d2f80a2987df88315f8b1de99b78b0f887ae70`.
- [x] **[Codex—instructed]** Change only package/root lockfile version metadata,
  release documents, current-release wording, and necessary packaging contracts.
- [x] **[Codex—instructed]** Preserve product inputs, dependency graph, runtimes,
  licenses, corpus, conformance, visualization, and Task 17.10 evidence.
- [x] **[Manual QA]** Carry forward Ben's completed Task 17.10 manual QA and
  approved rootward-left / leafward-right orientation.
- [x] **[Codex—instructed]** Run `npm ci`, `npm ls --all`, `npm audit --json`,
  and `npm audit --omit=dev --json`; zero production vulnerabilities required.
- [x] **[Codex—instructed]** Complete full versioned-tree validation, release
  acceptance, runtime/integrity checks, DTD/XSD CI, lint, and formatting.
- [x] **[Codex—instructed]** Build twice from clean output; compare every
  relative path, byte count, raw byte, and SHA-256. Verify relative `./assets`,
  workers, WASM, licenses/notices, and no corpus/JAR/test/temporary artifacts.
- [x] **[Codex—instructed]** Preserve exact accepted distribution and external
  inventory for separate deployment authority.
- [x] **[Codex—instructed]** Focused production smoke in Chrome and Firefox at
  root and nested mounts: startup, RNG/RNC, Search, Inspect, source, zoom, and
  zero page/console/privacy violations.
- [x] **[Explicit authorization]** Freeze exact paths in an isolated baseline
  Git index; record blobs and SHA-256; require zero whitespace findings.
- [x] **[Explicit authorization]** Stage the exact frozen tree and create one
  commit, `Release XML Carousel 0.3.0`; verify tree and baseline parent.
- [x] **[Explicit authorization]** Push release branch; recheck origin/main;
  require hypothetical merge tree equals the frozen tree.
- [x] **[Explicit authorization]** Merge exact release commit with `--no-ff`,
  message `Merge XML Carousel 0.3.0 release`; verify parents and empty diff.
- [x] **[Explicit authorization]** Push main; require hosted CI success on its
  exact release merge SHA, then reconfirm main, tree, and version.
- [x] **[Explicit authorization]** Create and push annotated `v0.3.0` on that
  exact source; verify public annotated object and peeled target.
  Tag object: `6aae292e03910458b28328f419833b688bb14c16`.
- [x] **[Explicit authorization]** Publish non-draft GitHub prerelease with
  exact source identity; Release ID `381707566`. Its original body recorded
  that deployment had not yet occurred; the corrected body is now prepared
  separately, without mutating the published release during closure.
- [x] **[Codex—instructed]** Independently verify release metadata, public tag
  package version, both source archives, and historical release immutability.
- [x] **[Codex—instructed]** Verify final clean main/origin/release branch/tag
  state and return external evidence. Retain release branch.

## Completed Canonical-Site Deployment

- [x] **[Manual transfer]** Ben confirmed the canonical-host migration and
  completed FTP transfer in Binary/Image mode using the exact preserved release
  distribution: 19 files / 3,826,638 bytes.
- [x] **[Verification]** Canonical-site deployment completed at
  <https://xmlcarousel.knowone.ca>; previous hostname redirects to this site.
- [x] **[Verification]** 19/19 deployed files byte-verified with zero missing or
  mismatched files.
- [x] **[Verification]** Deployed inventory SHA-256 verified:
  `250c34a66ec6240ef63bb08553d49ae7fb3cee4cbda28405b6e6ba29fbed3804`.
- [x] **[Verification]** Chrome live smoke passed 76/76 in Chrome 152.0.7977.65.
- [x] **[Verification]** Firefox live smoke passed 76/76 in Firefox 155.0 with
  geckodriver 0.37.1.
- [x] **[Verification]** Privacy/network checks passed independently in both
  browsers: zero schema-data transmission, remote schema or file retrieval,
  analytics/telemetry/crash requests, unexpected origins, and page/console errors.
- [x] **[Verification]** Old bundles absent from the current index and browser
  requests; three unreferenced physical files recorded for manual cleanup.
- [x] **[Verification]** No rollback required; no rollback performed.
- [x] **[Verification]** Annotated tag and GitHub prerelease unchanged.

## Post-Release Documentation Closure

- [x] **[Preparation]** Add [Using XML Carousel](using-xml-carousel.md), link it
  from README, and refresh the current canonical URL and deployed state.
- [x] **[Preparation]** Refresh release-facing browser/accessibility evidence;
  preserve historical authorities and limitations.
- [x] **[Preparation]** Record final publication/deployment evidence and prepare
  a corrected GitHub Release body for later approval.
- [x] **[Preparation]** Record the [in-app Help follow-up](release-0.3.0-maintenance.md)
  for the next patch; preserve current runtime and release-source bytes.
- [ ] **[Manual QA]** Ben reviews the exact unstaged closure tree, consistency
  audit, regression tests, validation results, and proposed Release body.
- [ ] **[Separate authorization]** Integrate approved documentation and apply
  the prepared Release body update. No integration is part of this task.
- [ ] **[Manual hosting cleanup]** Remove only the three unreferenced 0.2.0
  asset paths identified in the release report; do not delete unknown files.

0.3.0 publication and deployment are complete. No rollback is required.
Post-release closure preparation is complete; manual QA and subsequent
integration remain separate. No binary GitHub Release assets were uploaded.
