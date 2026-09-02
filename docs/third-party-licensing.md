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
- libxml2 2.15.3 compiled to JavaScript/WebAssembly for the user-facing
  standalone `.rng` workflow. Its authoritative repository copy is
  `src/standards/relaxng/runtime/LICENSE.libxml2.txt`; the adjacent
  `LICENSE.emscripten.txt` covers its generated runtime layer;
- JavaScript originating from Svelte 5.56.7, `clsx` 2.1.1, `esm-env` 1.2.2,
  and JSZip 3.10.1. JSZip's reviewed browser bundle incorporates Pako and its
  promise, stream, and scheduling helpers.

`THIRD_PARTY_NOTICES.txt` is deterministically assembled from `package-lock.json`
and the exact license files shipped by the locked npm packages. It includes the
16 package notices conservatively required by the measured production bundle.
The full Xerces and Emscripten texts remain separate assets and are referenced
from that consolidated notice.

## Production RELAX NG runtime

The repository also contains the Task 17.3 production RELAX NG engine:
libxml2 2.15.3 compiled to JavaScript/WebAssembly with Emscripten 6.0.5. Its
pinned source is `libxml2-2.15.3.tar.xz` from GNOME, SHA-256
`78262a6e7ac170d6528ebfe2efccdf220191a5af6a6cd61ea4a9a9a5042c7a07`.
libxml2's exact upstream MIT-style licence is preserved as
`src/standards/relaxng/runtime/LICENSE.libxml2.txt`; the Emscripten-generated
runtime layer is covered by the adjacent `LICENSE.emscripten.txt`.

This runtime is the authoritative engine for RELAX NG XML-syntax grammar
compilation. Task 17.4 makes it reachable from the ordinary application only
after the user selects a standalone `.rng` file. The ordinary distribution now
includes the lazy RELAX NG worker, runtime, manifest, libxml2 licence, and the
shared Emscripten licence; `THIRD_PARTY_NOTICES.txt` names those shipped roles.

Jing, Trang, RNV, and their Java/native tooling remain development-only
comparison or reproducibility evidence. They are not production dependencies.

The XML Carousel logo and built-in Book DTD and Library XSD samples have no
third-party ownership or license marker in repository history and are treated
as project-controlled material. No fonts, photographs, or externally licensed
images are shipped. Production source maps are not emitted.

## Test-only third-party material

- Jing/Trang V20241231 test authorities are pinned to commit
  `a6bc0041035988325dfbfe7823ef2c098fc56597` under the retained BSD-3-Clause
  `copying.txt`. The redistributed `spectest.xml` and `compacttest.xml` blobs,
  provenance, and SHA-256 identities are recorded in
  `tests/fixtures/relax-ng/conformance/manifest.json`. Jing/Trang archives and
  JARs are ignored development tools and are not committed or distributed.
- DocBook 5.1 schema evidence is pinned to DocBook commit
  `7bf26df21266c00d38ea1d3033bcd70c2b280a59` and retains the schema-specific
  perpetual redistribution notice. EPUBCheck 5.3.0 and Validator.nu 26.8.30
  Compact Syntax evidence retain their MIT license texts and exact pinned
  commits. All three projects live only under the test corpus and are excluded
  from production builds.

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

The replacement public repository has clean history beginning with parentless
root `c87854ecd922ca916a6f28c176281c10a6af0970`. The former historical
repository was renamed `benjaminisawolfe/xml-carousel-history-private` and is
private and archived. The replacement public repository contains neither
historical unpacked blob; the only permitted public-tree form is the unchanged
`tests/fixtures/third-party/james-clark-xmltest/xmltest.zip` archive described
above.

The introducing commit and forbidden object IDs remain recorded as historical
identities:

- introducing commit: `70917bef925c7e86a31b2b2802dea0f68907d5f3`;
- `022.xml`: `b639f2551cccbc2a4b6264e1c199dd236c943185`;
- `022.ent`: `26f2d8beb2acdf8d2a062831ce2790f449e33f69`.

Anonymous web, API, object, and fresh-clone verification found those objects
absent from the replacement public repository. The migration resolves the
finding for GitHub repositories under Ben's control. Independent third-party
caches or clones may still exist outside Ben's control, and no claim is made
that every historical copy has disappeared.

The complete read-only audit is recorded in
[`technical/xmltest-history-audit.md`](technical/xmltest-history-audit.md).
The private archived repository must remain private and unaltered. The XML
Carousel website remains separately hosted; the migration did not move it to
GitHub Pages.

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
