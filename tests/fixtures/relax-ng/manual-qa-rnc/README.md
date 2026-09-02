# RELAX NG Compact Syntax manual QA

This project-authored corpus exercises XML Carousel's source-preserving `.rnc`
front end. Loose fixtures `01`–`08` are valid, `09` is intentionally invalid,
and `10` contains an intentionally blocked remote reference. The `projects/`
directories cover controlled package resolution. Generated ZIPs are transient
test artifacts and are reproduced byte-for-byte by
`scripts/generate-relax-ng-rnc-manual-qa-fixtures.mjs`.

`equivalence/representative-basic.rng` and
`equivalence/representative-basic.rnc` are a source-distinct pair with the
same syntax-neutral semantic model. Use them for the representative browser
equivalence check.

These readable project-authored fixtures complement, but do not replace, the
formal third-party corpus in `../conformance/` or the generated 77-row RELAX NG
complete-visualization matrix.

No fixture is copied from a third-party conformance corpus. Original Compact
Syntax text is the user-facing source; generated RELAX NG XML is never fixture
or project inventory.
