# XML Carousel 0.2.0 Release Checklist

## Release identity

- Version: `0.2.0`
- Planned tag: `v0.2.0`
- Tag policy: annotated
- Recommended title: `XML Carousel 0.2.0 — Second Public Alpha`
- Recommended GitHub Release state: prerelease, non-draft at publication
- Canonical site: https://xmlcarousel.wolfshafenpress.com/
- Candidate report: [release-0.2.0-candidate-report.md](release-0.2.0-candidate-report.md)

Authority markers have distinct meanings:

- **[Codex—instructed]** work is authorized by the release-candidate preparation
  instructions.
- **[Manual QA]** work requires Ben to inspect or exercise the candidate.
- **[Explicit authorization]** work changes public or shared release state and
  must not occur without Ben's later approval.

## Candidate preparation

- [x] **[Codex—instructed]** Start from commit
  `ad46fd4cbb94b7460089cf241f0897930661ecdd`, tree
  `b5c0425220514490a6a64b4f3538df5e4d625356`, on the dedicated
  `release-0.2.0-candidate` branch.
- [x] **[Codex—instructed]** Preserve the 0.1.0 release documents, annotated tag,
  release commit, and public GitHub Release as immutable history.
- [x] **[Codex—instructed]** Update only the package and root-package versions in
  package metadata; retain the dependency graph unchanged.
- [x] **[Codex—instructed]** Prepare current README, release notes, checklist,
  report, and packaging contracts without changing product behavior.
- [x] **[Codex—instructed]** Confirm `v0.2.0` and a GitHub Release for it are
  absent before candidate work.

## Candidate automated validation

- [x] **[Codex—instructed]** Run `npm ci` and `npm ls --all` from the candidate.
- [x] **[Codex—instructed]** Record `npm audit --json` and
  `npm audit --omit=dev --json`; any production vulnerability blocks release.
- [x] **[Codex—instructed]** Run `npm run verify:release-integrity`.
- [x] **[Codex—instructed]** Run `npm run validate` and record exact test and
  validation counts.
- [x] **[Codex—instructed]** Run
  `npm run acceptance:complete-visualization` and require 221/221 with the
  canonical matrix digest.
- [x] **[Codex—instructed]** Run `npm run w3c:dtd:full` and
  `npm run w3c:xsd:full` without a conformance regression.
- [x] **[Codex—instructed]** Run the established Xerces comparison/regression if
  its external prerequisites are available.
- [x] **[Codex—instructed]** Run `npm run format:check` and `git diff --check`.

## Deterministic candidate distribution

- [x] **[Codex—instructed]** Run `npm run build` and
  `npm run verify:dist -- --base=./`.
- [x] **[Codex—instructed]** Produce two independent clean builds and require
  identical file inventories, bytes, per-file SHA-256 values, and canonical
  inventory digest.
- [x] **[Codex—instructed]** Preserve the verified candidate `dist/`; do not
  rebuild between deterministic proof and controlled-browser evidence.
- [x] **[Codex—instructed]** Require exactly one nonempty
  `schemaImportWorker-*.js`, relative `./assets/...` references, no unintended
  source maps, and correct root/nested behavior.
- [x] **[Codex—instructed]** Require repository/distribution licence and notice
  normalization, Xerces/Emscripten licence assets, runtime verification, and
  hostile-MIME verification.

## Controlled browser evidence

- [x] **[Codex—instructed]** Exercise the exact preserved candidate bytes in
  controlled Chrome and record the exact browser version.
- [x] **[Codex—instructed]** Exercise the exact preserved candidate bytes in
  controlled Firefox and record the exact browser/geckodriver versions.
- [x] **[Codex—instructed]** Cover built-in DTD/XSD, standalone DTD/XSD, resolved
  ZIP, invalid/cancelled replacement safety, Search, journey, independent
  Inspector, Full/Compact/Overview, focused Overview Inspect, source identity,
  source modal, both copy actions, responsive/reflow, large schemas, and worker
  cleanup.
- [x] **[Codex—instructed]** Record reduced-motion evidence in both browsers and
  forced-colour evidence where the controlled browser supports it.
- [x] **[Codex—instructed]** Require no page errors, unexpected console warnings,
  application data transmission, external requests, remote schema requests, or
  `file:` requests. Distinguish expected loopback harness traffic.

## Ben's final release QA

- [ ] **[Manual QA]** Test built-in Book DTD and Library XSD, representative
  standalone DTD/XSD, a resolved ZIP, and invalid import state preservation.
- [ ] **[Manual QA]** Test rootward/leafward journey, Navigation, Search,
  Inspector independence, Full/Compact/Overview, focused Overview Inspect, and
  normal Overview Context navigation.
- [ ] **[Manual QA]** Confirm source filename/package path and precision, large
  source modal, exact Copy source, and deterministic Copy node summary.
- [ ] **[Manual QA]** Check keyboard focus, Help/source-modal focus restoration,
  200% text, narrow reflow, short landscape, high contrast/forced colours, and
  reduced motion where practical.
- [ ] **[Manual QA]** Perform a practical large-schema import/navigation smoke.
- [ ] **[Manual QA]** Use DevTools Network to confirm schema/source/summary
  content does not leave the application host.
- [ ] **[Manual QA]** Confirm candidate documents say 0.2.0 candidate,
  publication pending, and deployment pending.

## Release-candidate integration and exact-SHA CI

- [ ] **[Explicit authorization]** Stage and commit the reviewed candidate only
  after Ben's final release QA passes.
- [ ] **[Explicit authorization]** Integrate the candidate using the separately
  authorized release workflow without changing candidate content.
- [ ] **[Explicit authorization]** Run hosted CI on the exact candidate merge SHA
  and require every release gate to pass.
- [ ] **[Explicit authorization]** Record the final merge commit/tree and prove
  the release files match the reviewed candidate.

## Tag and publication authorization

- [ ] **[Explicit authorization]** Create annotated tag `v0.2.0` on the exact
  approved release commit; do not move or replace an existing tag.
- [ ] **[Explicit authorization]** Push the approved release branch/commit and
  annotated tag.
- [ ] **[Explicit authorization]** Create and publish the GitHub Release titled
  `XML Carousel 0.2.0 — Second Public Alpha` as a prerelease and non-draft.
- [ ] **[Explicit authorization]** Verify the public tag object, release target,
  title, notes, prerelease state, and source archives before deployment.

## Manual deployment authorization

- [ ] **[Explicit authorization]** Confirm the authoritative release inventory
  and obtain separate permission to deploy its exact files.
- [ ] **[Explicit authorization]** Use binary/image transfer mode for all release
  files. Do not use FTP ASCII/text mode for HTML, CSS, JavaScript, text, licence,
  or WebAssembly files.
- [ ] **[Explicit authorization]** Transfer the contents of `dist/` without a
  production rebuild and preserve filenames and directory structure.

## Deployed-byte verification

- [ ] **[Explicit authorization]** Fetch every release file with cache bypass and
  compare its bytes and SHA-256 to the authoritative release inventory.
- [ ] **[Explicit authorization]** Treat one missing, extra, or byte-different
  release file as a blocker; correct it and repeat the complete comparison.
- [ ] **[Explicit authorization]** Confirm production MIME behavior and relative
  root asset loading from the deployed bytes.

## Live-site smoke

- [ ] **[Manual QA]** Run fresh Chrome and Firefox smoke checks against the
  canonical site after deployed-byte verification passes.
- [ ] **[Manual QA]** Recheck imports, navigation, semantic zoom, focused Overview
  Inspect, source/copy utilities, narrow layout, and privacy/network behavior.
- [ ] **[Manual QA]** Confirm the live site exposes the exact authorized 0.2.0
  distribution and no stale 0.1.0 assets.

## Final release closure

- [ ] **[Explicit authorization]** Update release records with actual tag,
  GitHub Release, deployment inventory, byte verification, live-browser, and
  manual-QA evidence only after each event occurs.
- [ ] **[Explicit authorization]** Confirm no rollback is required and close the
  release only when publication, deployment, byte identity, and live smoke all
  pass.

Candidate-stage publication and deployment actions intentionally remain
unchecked.
