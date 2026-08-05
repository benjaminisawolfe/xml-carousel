# First public alpha release checklist

This checklist is for a future explicitly authorized release-candidate pass. It
is not executed by adding it to the repository.

Markers:

- **[Codex—instructed]** may be performed by Codex only within a future,
  explicit task instruction.
- **[Manual QA]** requires a person to assess browser behavior.
- **[Explicit authorization]** changes public or difficult-to-reverse state and
  must not be inferred.

## First alpha decisions

- Version: `0.1.0`
- Planned tag: `v0.1.0`
- Tag policy: annotated
- Release title: XML Carousel 0.1.0 — First Public Alpha
- Task branches: retain
- Visibility change: requires explicit publication authorization
- Distribution: portable static files; transfer and hosting are selected
  outside this repository
- Candidate evidence: [release-candidate report](release-candidate-report.md)

## Repository and version

- [ ] **[Codex—instructed]** Confirm `main`, `origin/main`, staging, the
      worktree, and the sole worktree are clean and synchronized.
- [ ] **[Explicit authorization]** Decide the first-alpha version.
- [ ] **[Codex—instructed]** Apply the same version to `package.json` and
      `package-lock.json` without dependency refresh.
- [ ] **[Explicit authorization]** Decide the release commit and annotated,
      signed, lightweight, or no-tag policy.
- [ ] **[Explicit authorization]** Decide which integrated task branches to
      retain; do not delete them by implication.
- [ ] **[Codex—instructed]** Confirm no uncommitted or generated output is
      included.

## Automated validation

- [ ] **[Codex—instructed]** Run `npm ci`.
- [ ] **[Codex—instructed]** Run `npm run verify:release-integrity` and review
      the application-license, package-notice, fixture-provenance, and
      documentation checks.
- [ ] **[Codex—instructed]** Run `npm run validate`.
- [ ] **[Codex—instructed]** Confirm the complete-visualization gate reports
      221/221 complete with no partial, misleading, retained-unreachable, or
      source-only row.
- [ ] **[Codex—instructed]** Build once with the relative base and verify the
      portable artifact with `npm run verify:dist -- --base=./`.
- [ ] **[Codex—instructed]** Confirm `dist/index.html` uses only relative
      `./assets/...` references or an equivalent safe relative form.
- [ ] **[Codex—instructed]** Confirm the same unchanged `dist/` can be served
      from a domain root or nested directory without rebuilding.
- [ ] **[Codex—instructed]** Confirm the portable build contains one nonempty
      `schemaImportWorker-*.js` asset.
- [ ] **[Codex—instructed]** Compare two clean builds byte-for-byte, including
      fixed `LICENSE.txt` and `THIRD_PARTY_NOTICES.txt` files.
- [ ] **[Codex—instructed]** Confirm CI succeeds for the release commit.

## Functional smoke QA

- [ ] **[Manual QA]** Confirm the initial Book DTD sample and both states of the
      persisted welcome preference across reload.
- [ ] **[Manual QA]** Open, close, and reopen Help; confirm focus restoration.
- [ ] **[Manual QA]** Open a valid DTD, XSD, and resolved multi-file ZIP.
- [ ] **[Manual QA]** Confirm an invalid import preserves the current project.
- [ ] **[Manual QA]** Start and cancel a large import; confirm stale work cannot
      activate.
- [ ] **[Manual QA]** Search by name and documentation and use both journey and
      Inspect result actions.
- [ ] **[Manual QA]** Navigate rootward and leafward with pointer controls.
- [ ] **[Manual QA]** Navigate visible carousel controls spatially with arrow
      keys and retain normal Tab behavior.
- [ ] **[Manual QA]** Inspect a related node without changing the journey.
- [ ] **[Manual QA]** Check escaped source markup, comments, documentation, and
      appinfo as applicable.
- [ ] **[Manual QA]** Replace one active project with another and confirm no
      mixed outline, search, journey, or inspector state remains.

## Large-schema QA

- [ ] **[Manual QA]** Follow `tests/fixtures/LARGE-MANUAL-QA.md`.
- [ ] **[Manual QA]** Exercise `large-10000.dtd` and `large-10000.xsd`.
- [ ] **[Manual QA]** Retain the accepted 40,000-node activation and rendering
      gates with `large-40000.dtd` and `large-40000.xsd`.
- [ ] **[Manual QA]** Exercise the committed 20-by-1,000 XSD package and the
      unresolved-reference package.
- [ ] **[Manual QA]** Record device, browser, import time, cancellation
      behavior, activation responsiveness, and any long task or memory issue.

## Responsive and accessibility QA

- [ ] **[Manual QA]** Check established wide desktop, compact desktop/tablet,
      and narrow mobile viewports with no horizontal page overflow.
- [ ] **[Manual QA]** Confirm visible focus, dialog containment, Escape/close
      behavior, and focus restoration.
- [ ] **[Manual QA]** Confirm file inputs and other native controls remain
      keyboard operable.
- [ ] **[Manual QA]** Confirm progress, cancellation, navigation, search
      results, and error announcements are understandable.
- [ ] **[Manual QA]** Enable reduced motion and confirm carousel transitions
      and focus remain usable.
- [ ] **[Manual QA]** Check zoom and at least one current screen-reader/browser
      pairing; record the exact pairing and findings.
- [ ] **[Codex—instructed]** Keep automated claims limited to Chrome
      151.0.7922.72 and Firefox 153.0.1 evidence. Do not convert requested CSS
      viewports into Safari, physical-device, screen-reader-hardware, or
      browser-chrome zoom claims.

## Distribution

- [ ] **[Explicit authorization]** Decide whether and when the repository
      becomes public.
- [ ] **[Codex—instructed]** Run `npm ci`.
- [ ] **[Codex—instructed]** Run `npm run validate`.
- [ ] **[Codex—instructed]** Run `npm run build`.
- [ ] **[Codex—instructed]** Run
      `npm run verify:dist -- --base=./`.
- [ ] **[Codex—instructed]** Confirm `dist/index.html` uses relative
      `./assets/...` references or an equivalent relative form.
- [ ] **[Codex—instructed]** Confirm exactly one nonempty
      `schemaImportWorker-*.js` exists.
- [ ] **[Codex—instructed]** Confirm the build contains exact repository copies
      of `LICENSE.txt` and `THIRD_PARTY_NOTICES.txt`, plus one Xerces license,
      one Xerces NOTICE, and one Emscripten license asset.
- [ ] **[Codex—instructed]** Run hostile-MIME verification and confirm all
      license/notice files remain readable at both root and nested mounts.
- [ ] **[Manual QA]** Copy the contents of `dist/` into the chosen web-served
      directory.
- [ ] **[Manual QA]** Direct-load and reload
      `https://xmlcarousel.wolfshafenpress.com/`.
- [ ] **[Manual QA]** Confirm JavaScript, CSS, chunks, logo, built-in samples,
      Help, and the schema import worker load from the canonical site.
- [ ] **[Manual QA]** Open DTD, XSD, and ZIP inputs on the deployed site.
- [ ] **[Manual QA]** Check browser console and network logs for errors,
      warnings, 404s, mixed content, and unexpected requests.
- [ ] **[Manual QA]** Re-read the deployed local-processing/privacy wording
      against observed network behavior and confirm no schema contents are
      uploaded to an XML Carousel backend.

## Documentation

- [ ] **[Codex—instructed]** Recheck README commands, status, links, and intended
      site wording.
- [ ] **[Codex—instructed]** Recheck architecture against the release source.
- [ ] **[Codex—instructed]** Update verified limitations when behavior changed.
- [ ] **[Codex—instructed]** Finalize release notes with the approved version,
      date, validation totals, and verified deployed URL.
- [ ] **[Codex—instructed]** Confirm the CC0 identifier and checked-in licence
      agree.
- [ ] **[Codex—instructed]** Review
      `docs/technical/xmltest-history-audit.md`. The historical repository is
      private and archived; the replacement public repository has one
      parentless clean root and passed anonymous forbidden-object verification.
      Third-party caches or clones outside Ben's control may still persist.
- [ ] **[Codex—instructed]** Confirm XML Carousel's CC0 wording excludes
      third-party runtime components and fixtures.

## Release publication

- [ ] **[Explicit authorization]** Merge the approved release changes.
- [ ] **[Explicit authorization]** Create the approved optional annotated or
      signed tag.
- [ ] **[Explicit authorization]** Create and publish the GitHub Release using
      the finalized notes.
- [ ] **[Manual QA]** Perform the post-release smoke on the exact published
      commit and URL.
- [ ] **[Explicit authorization]** If a release-blocking defect appears, choose
      rollback: unpublish the release if appropriate, restore the last
      known-good commit through a reviewed forward change, and document the
      outcome. Do not force-push or delete release history by default.
