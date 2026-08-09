# Developer Handoff Utilities acceptance audit

## Status

**Task:** 15.5 — Developer Handoff Utilities Stabilization and Acceptance  
**Audit date:** 2026-08-09  
**Repository:** `https://github.com/benjaminisawolfe/xml-carousel.git`  
**Task branch:** `task-15.5-developer-handoff-acceptance`  
**Required baseline commit:** `c35228c94bc38423e61ae3e49f82e9d6f0924f2a`  
**Required baseline tree:** `ae0038e669a885899097e8ea05c1ef5e9c8a580c`

Implementation evidence is complete. The milestone is not closed. The current
state is **READY FOR BEN'S TASK 15.5 MANUAL QA**.

## Scope and method

The audit began from the exact clean Task 15.4 merge with one worktree, empty
staging, Node `v24.16.0`, the public `origin`, protected-document blobs and
dependency blobs verified, and `pnpm-lock.yaml` absent. It inventoried the
integrated Task 15.2–15.4 implementation before any change.

No production defect was found and no production source changed. Task 15.5
adds one semantic acceptance suite, this report, and a narrow architecture-map
update. Evidence combines public-interface and rendered-application tests,
the complete canonical validation chain, selected full offline W3C suites,
and controlled production-build workflows in Chrome and Firefox.

The controlled-browser method reused the repository's no-dependency CDP and
geckodriver lifecycle harness in a temporary ignored `.vite` copy. It served
the unchanged `dist/` through the established loopback hostile-MIME server,
recorded JSON and screenshots, and removed the temporary harness script after
collection. Loopback requests were test infrastructure, not application-data
transmission.

## Integrated feature inventory

- **Task 15.2:** central truthful source presentation, visible standalone or
  package-relative identity, explicit precision labels, independent
  `sourceViewStore`, Focus/Inspector/Search origins, a large modal, inert
  source text, focus containment/restoration, and replacement clearing.
- **Task 15.3:** explicit per-fragment source copying through `copyText(...)`,
  exact retained payloads, truthful result feedback, stable polite status,
  no automatic or legacy fallback copy, and stale-operation suppression.
- **Task 15.4:** explicit Inspector summary copying, pure deterministic
  `formatNodeSummary(...)`, canonical field ordering, bounded direct
  collections, normalized excerpts and Used-by output, truthful source reuse,
  and a distinct shared-clipboard payload.

## Acceptance requirements matrix

| Area | Implementation evidence | Controlled-browser evidence | Result |
| --- | --- | --- | --- |
| Source-view independence | New acceptance suite exercises Focus, Inspector, Search origins against independent navigation, inspection, Search, and zoom snapshots; `AppShell.test.ts` covers rendered integration | DTD, XSD, ZIP, Inspector and Search workflows preserved focus/journey/inspection/query/zoom | Passed during implementation |
| Truthful standalone identity | `sourceMarkupPresentation.test.ts` and new acceptance suite use supplied filenames and reject unsafe fallbacks | `library.dtd`, `attributes.xsd` shown consistently | Passed during implementation |
| Package-relative identity | Long relative-path and absolute Windows/POSIX rejection assertions | ZIP nodes reported `main.xsd` and `included.xsd`, the truthful common-root-stripped package paths | Passed during implementation |
| Location precision | Exact line+column, exact line only, approximate declaration, multiple fragments and unavailable labels are asserted without a fallback coordinate | DTD/XSD/ZIP dialog labels contained textual `exact` precision from retained ranges | Passed during implementation |
| Modal semantics/readability | `SourceViewDialog.test.ts` covers native dialog, accessible name/description, focus trap, Escape, Close, inert text and scrollability | Dialog was named, contained, internally scrollable, whitespace-preserving and monospaced at every viewport | Passed during implementation |
| Inert source safety | Hostile script/image-looking strings remain text; no `{@html}` path | No page errors or console warnings/errors in either browser | Passed during implementation |
| Retained-source fidelity | DTD/XSD extraction tests cover comments, whitespace, quote style, entities, ranges, CRLF and trailing text; copy tests assert `fragment.text` byte-for-byte | DTD, XSD and both ZIP source routes exercised the explicit Clipboard boundary | Passed during implementation |
| Discontiguous DTD source | Selector and dialog tests retain separate ordered fragments and only distinguishable per-fragment copy buttons | Component evidence; no synthetic browser `Copy all` path exists | Passed during implementation |
| Clipboard results | `copyText.test.ts`, dialog/action tests and acceptance suite cover success, unavailable, rejection and stale completion | Both browsers displayed resolved success; limitations are recorded below | Passed during implementation |
| Copy feedback | Component tests verify one stable visible polite atomic status, focus preservation, repeated operations and target clearing | Status appeared without duplicate regions or modal/Inspector closure | Passed during implementation |
| Deterministic summary | Formatter tests and acceptance suite verify byte identity, `\n`, no blank/trailing line, stable ordering, duplicates, excerpts, Used-by and no IDs/time/random/browser state | Same action remained available across browser, viewport, motion and colour modes | Passed during implementation |
| Boundedness | Summary limit is 20; source selector chooses one node; 2,000-result and 10,000-node tests remain bounded | Modal rendered only the selected node's fragment(s); no whole-project DOM was introduced | Passed during implementation |
| Search origin | Search component and AppShell tests assert no centre/inspect/query/order mutation and fallback focus rules | ZIP source opened from preserved Search results; Chrome restored the exact action; Firefox restored the Search box after the result action was replaced | Passed during implementation |
| Inspector origin | AppShell and acceptance tests keep inspected node distinct from carousel focus and source/summary payloads separate | Opening/copying did not navigate; close restored the surviving Inspector source action | Passed during implementation |
| Project replacement | AppShell/project-session tests cover synchronous clear and pending-copy suppression | Replacing ZIP with DTD while source/copy state existed closed the modal and removed old source and both feedback states | Passed during implementation |
| Privacy/network isolation | Clipboard helper and formatter tests prohibit fetch/XHR, persistence, URL encoding, logging and file writes | Captured application requests were loopback-only; no external requests, errors or warnings | Passed during implementation |
| Keyboard/accessibility | Native buttons, named dialog, focus trap, Escape, scrollable reading regions, visible/polite status and forced-colour CSS are tested | Tab/Shift+Tab containment, Escape, focus restoration, reachable actions and inert background passed | Passed during implementation |
| Responsive/reflow | Component CSS contracts cover stacking, internal overflow and 44 px controls | `1440×900`, `390×540`, `844×320`, and 200% root text scaling had no document-level horizontal overflow | Passed during implementation |
| Forced colours | Component contracts assert system-colour boundaries/focus | Chrome forced-colour emulation passed; Firefox harness cannot emulate forced colours, so Firefox relies on the same CSS contract plus ordinary rendered containment | Passed where harness supports it |
| Reduced motion | Handoff components add no animation or required motion | Both reduced-motion profiles matched; relevant controls had no animation and at most the established `0.001s` suppression | Passed during implementation |
| Parser/model/standards authority | Selectors consume retained metadata and Inspector presentation only; no parser object or recursive validation path | DTD/XSD/ZIP imports and replacement remained on existing production boundaries | Passed during implementation |

## Durable automated evidence

The acceptance suite is
`src/tests/DeveloperHandoffUtilitiesAcceptance.test.ts`. Its seven semantic
tests protect:

- truthful standalone/package identity, long paths, unsafe path omission and
  all explicit location precision categories;
- source-view independence for all three origins;
- exact source versus deterministic bounded summary payloads;
- clipboard success, unavailable and failure results;
- inert multi-fragment rendering with explicit per-fragment copy only;
- rendered Search/Inspector/journey/zoom independence and no fetch.

The focused Task 15.5 run covered 17 files and passed **223/223 tests**. It
included source presentation/store/dialog/copy, summary formatter/action,
AppShell, Search, project replacement, DTD/XSD source extraction, real package
integration, large-project adoption, and complete DTD/XSD browser-facing
import integration.

Canonical `npm run validate` passed:

- Xerces runtime: Apache Xerces-C++ 3.3.0, 2 runtime artifacts and 3
  attribution files;
- release integrity: 16 bundled JavaScript components, `invalid-not-sa-022`,
  2 archive entries;
- complete visualization: 221/221 matrix entries, 52 node kinds, 52 edge
  kinds, 5 package-entry kinds, Simplified DocBook 106 Navigation/Search
  records and 0 findings, Hermetic Foundry 3,958 nodes / 3,739 source-markup
  records and 0 findings;
- `svelte-check`: 0 errors, 0 warnings;
- Vitest: **172/172 files, 2,285/2,285 tests**;
- lint and Prettier: passed;
- production build: 310 modules transformed;
- static build, hostile MIME and release/runtime verification: passed.

The separately run `npm run acceptance:complete-visualization` also passed
221/221 with the same matrix digest
`1e31059953b718750a749a23760e7f5540966e988562033ba1dc69b57bed84b2`.

## DTD, XSD and ZIP evidence

- **Standalone DTD:** `library.dtd` covered a structural root and children.
  Existing focused tests also cover ATTLISTs, comments, reuse, recursion,
  cycles, multiple roots and discontiguous retained declarations.
- **Standalone XSD:** `attributes.xsd` covered schema/global element,
  complex/simple types, a reference, attributes and restriction metadata.
  Focused integration additionally covers annotations/documentation, local
  elements, derivations, enumeration and mutual recursion.
- **ZIP:** real `valid-xsd-include.zip` covered `catalog` from `main.xsd` and
  `CatalogType` from `included.xsd`. Each modal showed only its selected
  fragment; source copies contained no package metadata or binary content.
  Search-origin state survived, and replacement removed the obsolete target.

No DTD display path acts as a second standards validator, and no XSD 1.1 or
instance-document product support is claimed.

## Controlled browser evidence

Ignored evidence is under `.vite/developer-handoff-acceptance/` and is excluded
from Git scope by `.gitignore`.

| Browser | Evidence | Result |
| --- | --- | --- |
| Chrome `151.0.7922.77` | DTD/XSD/ZIP, Inspector/Search origins, modal keyboard/focus, source/summary copy, replacement, `1440×900`, 200% text, `390×540`, `844×320`, forced colours, reduced motion, request/error capture | All controlled assertions passed |
| Firefox `153.0.3` with geckodriver `0.37.1` | Same workflows/viewports and reduced-motion profile; forced-colour emulation reported unsupported | All applicable controlled assertions passed |

Reports:

- `chrome.json` — SHA-256
  `57912fd63313798caaf833ad7487efa2a3f6fccb583aa955698ee69abc8d2316`;
- `firefox.json` — SHA-256
  `0d6d054a8bbc6c836a15793c9c006859730072a265a02caadb6ecf95990522d1`;
- 10 ignored PNG screenshots (five per browser) cover desktop DTD, 200% text,
  narrow portrait, short landscape and the requested colour-mode scenario.

### Clipboard limitation

Chrome received an explicit loopback `clipboardReadWrite` permission and all
four explicit copy actions resolved success. Firefox's harness cannot grant or
read back system clipboard permission; its real `navigator.clipboard.writeText`
calls resolved and the UI truthfully reported success, but no OS clipboard
readback is claimed. Exact payload bytes, unavailable API, rejected write and
stale completion are therefore authoritative in the injected automated tests,
not inferred from browser status text.

## Reflow, accessibility and motion observations

The 200% method set the root CSS font size to `200%` in the controlled
production page; it does not claim browser-native zoom telemetry. The modal
header/actions, source metadata, internal source scroll region, Inspector
summary action and status remained reachable and non-overlapping. At
`390×540` the dialog was near-full-screen (`374×524` CSS px) and contained; at
`844×320` it remained internally bounded. No scenario produced document-level
horizontal overflow.

The dialog used its accessible title and location description, focused Close
on entry, contained synthetic Tab/Shift+Tab traversal, closed on Escape, and
kept the application shell inert while open. Handoff controls have no required
animation. Chrome forced-colour emulation retained boundaries, system-colour
controls and focus styling. Firefox forced-colour emulation is a residual
harness limitation rather than a claimed pass.

## Large-project and privacy audit

Source selection is a keyed single-node lookup over already retained metadata;
the modal renders only that node's bounded fragment list. The summary formatter
uses only direct Inspector collections, sorts by presentation order, caps
collections at 20 and never recurses through graph cycles. The canonical
acceptance suite's isolated 10,000-node DTD and 10,000-node XSD cases passed;
Search's 2,000-match test still rendered at most 100 results. No clipboard
history is retained.

The source-view and copy paths contain no fetch/XHR, telemetry, analytics,
backend, remote highlighting, local/session storage, IndexedDB, file write or
URL-encoding path. Browser capture found only loopback production assets and
worker requests. No source or summary content appeared in a request URL.

## Standards, build and security

Offline selected full W3C results:

- DTD: 1,912 pass, 0 fail, 1 unsupported by product boundary, 4
  instance-dependent, 4 optional-error accepted, 20 optional-error reported,
  9 security-blocked, **0 harness errors**;
- XSD 1.0: 171 pass, 0 fail, 3 unsupported, 2 instance-dependent, 0 optional
  accepted/reported, 2 security-blocked, 4 metadata-disputed, **0 harness
  errors**.

The final ignored `dist/` inventory contains 14 files and 3,256,637 bytes.
SHA-256 over each sorted relative UTF-8 path, a NUL byte and its file bytes is
`f3f3648c40eabd183aceba32c29cf9f0b45c4f21776f687bfa871ce037a2b692`.
It was not deployed.

`npm audit --json` retained the known two high-severity transitive development
tool findings (`js-yaml`, `nanoid`) and no others. `npm audit --omit=dev --json`
reported zero vulnerabilities. Dependencies were not changed or remediated.

## Documentation and protected identities

`docs/architecture.md` now narrowly documents the independent source store,
truthful presentation selector, retained-source modal, Clipboard boundary,
exact source copy, deterministic summary formatter, Inspector action,
state-independence and unchanged standards/privacy authority.

Protected baseline identities remained:

- `docs/development-plan.md`:
  `fce6106dcec3ca8d151b77aec234f956cf7d71a8`;
- `docs/style-guide.md`:
  `9a04be1007153e446e2227f4fa0bfe0d83238077`;
- `package.json`: `2dc8a60f688db5b827fd0315bcb27c04cbc3d395`;
- `package-lock.json`: `08788e08e3dc2f1857bf9aa77447e5e2f5416916`;
- `pnpm-lock.yaml`: absent.

Immutable release state remained release commit
`fad25bd26e2d197a4e7d5db364ad5933d67e8c81`, annotated tag `v0.1.0`, tag object
`921fa5d1d6ba0ebea9cc76dbc287f4b1ff77641f`. No private-history repository was
accessed. No deployment, release, version, FTP, DNS, hosting or GitHub Pages
work occurred.

## Residual risks and limits

- Ben's keyboard, OS clipboard, high-contrast and preferred assistive-technology
  observations remain the manual authority.
- Firefox forced-colour emulation and OS clipboard readback were unavailable
  in this harness. Automated semantic coverage and Chrome emulation cover the
  relevant contracts without fabricating Firefox evidence.
- XSD 1.1, XML instance-document product input, remote schema retrieval,
  source editing/round-trip serialization, persisted projects/recent files,
  Safari/WebKit acceptance and manual screen-reader certification remain
  outside this milestone.
- Very large project capacity remains device/browser resource-dependent even
  though the isolated 10,000-node acceptance cases pass.

## Completion gates

| Gate | State |
| --- | --- |
| Focused automated tests | Passed during implementation — 17 files, 223 tests |
| Canonical validation | Passed during implementation — 172 files, 2,285 tests |
| Controlled Chrome and Firefox evidence | Passed during implementation, with stated Firefox capability limits |
| Offline full W3C DTD/XSD selections | Passed during implementation — no failures or harness errors |
| Ben's Task 15.5 manual QA | **Pending Ben manual QA** |
| Task 15.5 exact-tree integration | **Pending exact-tree integration** |
| Hosted CI on exact merge SHA | **Pending hosted CI on exact merge SHA** |

This report does not state or imply that Developer Handoff Utilities is closed.
