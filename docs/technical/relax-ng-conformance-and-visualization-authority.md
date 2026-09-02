# RELAX NG conformance and visualization authority

Task 17.9 freezes two authorities that are separate from the historical
DTD/XSD/ZIP complete-visualization evidence:

```text
npm run relaxng:conformance
npm run acceptance:relaxng-complete-visualization
```

Both run offline in ordinary `npm run validate`. The legacy command remains
221/221 with digest
`1e31059953b718750a749a23760e7f5540966e988562033ba1dc69b57bed84b2`.
The RELAX NG matrix is 77/77 with digest
`b5798413268b6f874ea1f9ef24909765153562bd4c04ae046fca02ea0476a5fc`.

## Corpus and provenance

The upstream authority is `relaxng/jing-trang` V20241231 at commit
`a6bc0041035988325dfbfe7823ef2c098fc56597`. The exact redistributed files are
the BSD-3-Clause `copying.txt`, `mod/rng-validate/test/spectest.xml`, and
`mod/rng-schema/test/compacttest.xml`. Their Git blob IDs and SHA-256 values are
in the generated `tests/fixtures/relax-ng/conformance/manifest.json`.

The harness parses 385 `spectest.xml` test-case units. Twenty-three cases carry
31 named resources, which are reconstructed in per-case virtual directories so
XML Base and local reference behavior are tested without host or network
access. It also parses all 90 `compacttest.xml` units. All 475 cases are
selected; excluded count is zero. Every case has a stable ID and exactly one
authority classification.

Three independent real-world projects are pinned:

| Project | Commit | Entry SHA-256 | Schema files | Licence/result |
| --- | --- | --- | ---: | --- |
| DocBook 5.1 | `7bf26df21266c00d38ea1d3033bcd70c2b280a59` | `91efb6b3c98c65458dde6e75aceff1ada44386d956a34ec68279b615425df83b` | 1 | schema redistribution grant; production-valid |
| EPUBCheck 5.3.0 | `029831b8f477e4519e9734c984ee24357547a698` | `557d1c4443acf7f2587c11a3dfee9841470ed7c65db2b49ce4ff3d22aa0ca9f0` | 3 | MIT; production-valid |
| Validator.nu 26.8.30 | `f84563f28898457af3cb76ec8c820cf17a2174c4` | `765159f80933d0662e495cbfe355b0fabd182872d4d809a9f0b3c976ff5140d2` | 26 | MIT; custom WHATWG datatype-library boundary |

The fixtures and notices are test-only. Static/release-integrity verification
proves they are not copied into `dist`.

## Jing and Trang audit

The oracle regeneration command verifies the pinned archive SHA-256 values:

```text
Jing:  d11a765f9106e398e01d66aaffb629beb1da21f8a716299e2930a751130bfad2
Trang: eceaa8331377b78fcec6094de8e67d81649bc0c322be3fd2cbb39b4c4c7f3af8
```

It additionally records JAR SHA-256 values
`ea5e9026244d977e607d8b52212d6871498ece51939f9c49d0e7a77aad91133a`
and `7d0fa570a1957dd0bf8cf1adf06259a79cf1045418f8da6002c712d44c32f4a3`.
Jing agrees on all 385 specification schema classifications. Trang agrees on
85/90 translation units. Four units intentionally lack resources or are
fragment-only when invoked through the standalone CLI; one invalid annotation
unit is accepted by both pinned CLIs despite their own compacttest authority.
Those five cases carry documented expected oracle/harness records. There are
zero unexplained oracle disagreements.

Jing and Trang are development oracles only. Production remains the
source-preserving RNC front end followed by libxml2 RELAX NG 2.15.3 WASM.

## Product result classification

The gate separates translation, standards compilation, semantic equivalence,
and security. Current measured output is:

```text
spectest: 378 agreements, 7 exact product boundaries
compact translation: 82 agreements
compact standards probe: 75 Jing agreements
compact semantic comparison: 35 direct agreements
expected security-policy differences: 2
INVESTIGATE: 0
harness errors: 0
```

The reviewed authority contains 40 expected product-boundary records and two
expected security-policy-difference records across all stages and real-world
fixtures. Each record includes case ID, source, reason, production outcome, and
oracle outcome. These records expose rather than forgive differences: any new,
changed, or disappearing result fails. The boundaries include seven permissive
libxml2 results, rare Compact Syntax escape/annotation forms, remaining
semantic-normalization cases, and the Validator.nu datatype library.

Task 17.9 corrected invalid Compact Syntax namespace/annotation, Unicode
escape, name-class-exclusion, and data-except handling; supplied the predefined
XSD datatype binding; retained valid empty included modules; and canonicalized
implicit/explicit grouping plus irrelevant namespace declarations. Negative
controls prove choice, group, interleave, scope, and targets are not collapsed.

## Visualization and source fidelity

The deterministic 77-row matrix is generated from
`scripts/relax-ng-visualization-catalogue.mjs`. Every row states its intended
card/context presentation, Navigation and carousel reachability, Inspector and
Search route, source owner, zoom identity, and executable evidence. Rows cover
all supported patterns and name classes, physical/effective definitions,
annotations, package states, cycles/shared targets, bounds, exact RNG/RNC
source, and Full/Compact/Overview identity.

Acceptance builds actual semantic models and presentation projects. Paired RNG
and RNC remain semantically equivalent while View Source and Inspector retain
the original syntax and range; generated RNG XML never appears on a
source-facing surface. Search, focus-card relationships, and Inspector retain
the same semantic node ID at all zoom levels.

## Security and reproducibility

No gate performs live corpus access. Remote, `file:`, absolute-host, and
outside-root references remain visible but blocked. Only explicitly supplied
project files resolve, with exact extensions and no RNG/RNC fallback. Parser
bounds remain 250,000 Compact Syntax tokens and 256 nesting levels.

`npm run relaxng:oracle` is the separate Java audit. It requires exact ignored
archives/JARs already present under `tools/relax-ng-wasm-spike`; it never
downloads `latest`. The committed manifest, oracle, boundary authority, and
matrix omit timestamps, host paths, elapsed time, and random values. Repeated
generation must be byte-identical.

## Manual QA

1. Run both Task 17.9 commands and confirm zero investigate/harness errors and
   77/77 visualization.
2. Run the legacy visualization command and confirm 221/221 and its historical
   digest.
3. Open a paired RNG/RNC fixture, compare semantic navigation, and confirm View
   Source remains XML versus Compact Syntax respectively.
4. Open DocBook or EPUBCheck and inspect Search, Navigation, Inspector, source,
   and zoom. Validator.nu must truthfully report its custom datatype boundary.
5. Smoke one existing DTD and XSD plus the RNG/RNC blocked-reference fixtures;
   no external schema request should occur.
