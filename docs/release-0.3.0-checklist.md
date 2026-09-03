# XML Carousel 0.3.0 Release Checklist

Version: `0.3.0`. Title: `XML Carousel 0.3.0 — Third Public Alpha`.
Release date: `2026-09-02`. Tag policy: annotated `v0.3.0`.
GitHub state: non-draft prerelease. Deployment: not performed; separate authority.

This checklist is frozen in the release preparation tree. Preparation results
are recorded in the [release report](release-0.3.0-release-report.md).
Unchecked publication steps are intentionally pending at source freeze; actual
commit, CI, tag, release, and archive identities belong in the external final
report. No post-tag source update is authorized merely to fill those identities.

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
- [ ] **[Explicit authorization]** Freeze exact paths in an isolated baseline
  Git index; record blobs and SHA-256; require zero whitespace findings.
- [ ] **[Explicit authorization]** Stage the exact frozen tree and create one
  commit, `Release XML Carousel 0.3.0`; verify tree and baseline parent.
- [ ] **[Explicit authorization]** Push release branch; recheck origin/main;
  require hypothetical merge tree equals the frozen tree.
- [ ] **[Explicit authorization]** Merge exact release commit with `--no-ff`,
  message `Merge XML Carousel 0.3.0 release`; verify parents and empty diff.
- [ ] **[Explicit authorization]** Push main; require hosted CI success on its
  exact release merge SHA, then reconfirm main, tree, and version.
- [ ] **[Explicit authorization]** Create and push annotated `v0.3.0` on that
  exact source; verify public annotated object and peeled target.
- [ ] **[Explicit authorization]** Publish non-draft GitHub prerelease with
  exact source identity and the explicit no-deployment statement.
- [ ] **[Codex—instructed]** Independently verify release metadata, public tag
  package version, both source archives, and historical release immutability.
- [ ] **[Codex—instructed]** Verify final clean main/origin/release branch/tag
  state and return external evidence. Retain release branch.

No FTP, hosting upload, live-site release smoke, deployed-byte verification,
or canonical-site deployment is authorized. No uploaded binary release assets.
