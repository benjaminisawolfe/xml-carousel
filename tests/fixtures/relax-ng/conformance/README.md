# RELAX NG conformance fixtures

This directory is the offline Task 17.9 standards authority. It is separate
from the readable `manual-qa` and `manual-qa-rnc` fixtures and from the legacy
DTD/XSD/ZIP complete-visualization matrix.

- `upstream/jing-trang-v20241231` preserves the exact pinned specification and
  Compact Syntax suites with their BSD-3-Clause notice.
- `real-world` contains three independently maintained, pinned, redistributable
  schema projects and their governing notices.
- `manifest.json` is generated deterministically and assigns every upstream
  case exactly one selected classification.
- `oracle.json` is regenerated separately with the pinned Jing and Trang
  archives. Ordinary CI verifies it offline and does not run Java.
- `expected-boundaries.json` is the reviewed exact-ID result authority. A new,
  changed, or no-longer-observed difference fails the gate.

Run `npm run relaxng:conformance` for the offline production gate and
`npm run relaxng:oracle` for the development-only oracle audit.

Oracle regeneration requires Java and the exact archives at
`tools/relax-ng-wasm-spike/.cache/comparators/`. Extracted JARs remain ignored
under `tools/relax-ng-wasm-spike/.tools/`; the command verifies archive and JAR
hashes and never downloads a mutable artifact.
