# Third-party licensing and attribution

This engineering inventory records the repository and distribution licensing
sources used by XML Carousel. It is not legal advice.

## XML Carousel license

XML Carousel's project-authored material is dedicated to the public domain
under CC0 1.0 Universal. The authoritative source is the repository-root
`LICENSE`, and `package.json` identifies it as `CC0-1.0`. Production builds
include an exact byte copy as `LICENSE.txt`.

CC0 does not apply to third-party code, runtime assets, or fixtures identified
below. Their own terms remain controlling.

## Shipped runtime components

The production distribution contains:

- Apache Xerces-C++ 3.3.0 compiled to JavaScript/WebAssembly. Authoritative
  repository copies are
  `src/standards/xerces/runtime/LICENSE.xerces.txt` and
  `src/standards/xerces/runtime/NOTICE.xerces.txt`;
- Emscripten 6.0.5 runtime support. Its authoritative repository copy is
  `src/standards/xerces/runtime/LICENSE.emscripten.txt`;
- JavaScript originating from Svelte 5.56.7, `clsx` 2.1.1, `esm-env` 1.2.2,
  and JSZip 3.10.1. JSZip's reviewed browser bundle incorporates Pako and its
  promise, stream, and scheduling helpers.

`THIRD_PARTY_NOTICES.txt` is deterministically assembled from `package-lock.json`
and the exact license files shipped by the locked npm packages. It includes the
16 package notices conservatively required by the measured production bundle.
The full Xerces and Emscripten texts remain separate assets and are referenced
from that consolidated notice.

The XML Carousel logo and built-in Book DTD and Library XSD samples have no
third-party ownership or license marker in repository history and are treated
as project-controlled material. No fonts, photographs, or externally licensed
images are shipped. Production source maps are not emitted.

## Test-only third-party material

- The W3C XML Schema 1.0 subset preserves the upstream `00COPYRIGHT` and W3C
  Document Notice and License in
  `tests/fixtures/w3c-xsd-1.0/2007-06-20/`.
- Simplified DocBook 4.1.2.5 preserves its copyright and perpetual permission
  notice inside `tests/fixtures/dtd/sdocbook/sdocbook.dtd`.
- The external Hermetic Foundry archive is not committed or distributed; only
  project-authored expectation and localization metadata are retained.
- The selected W3C XML conformance evidence includes James Clark case
  `invalid-not-sa-022`. XML Carousel stores the original 107,060-byte
  `xmltest.zip` unchanged under
  `tests/fixtures/third-party/james-clark-xmltest/`. Tests verify its SHA-256,
  read `xmltest/readme.html`, and load the required XML/entity entries directly
  into memory. The unpacked entries are absent from the current worktree and
  production distribution. The archive is excluded from CC0; its governing
  redistribution terms are inside the archive. Ordinary validation is offline.

## James Clark current-tree and history status

The current-tree redistribution is remediated by replacing the two unpacked
files with the unchanged archive. The public Git history still contains the
earlier unpacked blobs. This is an **unresolved historical redistribution**:
an explicit repository-history decision is required before release.

The introducing commit is
`70917bef925c7e86a31b2b2802dea0f68907d5f3`. The historical blobs are:

- `022.xml`: `b639f2551cccbc2a4b6264e1c199dd236c943185`;
- `022.ent`: `26f2d8beb2acdf8d2a062831ce2790f449e33f69`.

The complete read-only ref and GitHub audit is recorded in
[`technical/xmltest-history-audit.md`](technical/xmltest-history-audit.md).
Task 13.19 does not rewrite history, force-push, delete branches or tags, or
contact GitHub Support.

## Deterministic checks and distribution

Run:

```text
npm run verify:release-integrity
```

The command verifies the application license, locked package notices, Xerces
and Emscripten identities, archive and provenance invariants, absence of
unpacked XML test entries, canonical documentation statements, packaging
configuration, and canonical-validation integration. It is offline,
deterministic, file-specific on failure, and does not rewrite tracked files.

`npm run validate` invokes it before building. Static-build and hostile-MIME
verification then require `LICENSE.txt`, `THIRD_PARTY_NOTICES.txt`, the Xerces
license and NOTICE, and the Emscripten license in both root and nested portable
deployments.
