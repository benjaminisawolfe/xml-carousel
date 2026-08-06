# Semantic zoom acceptance audit

## Audit identity

- Audit date: 2026-08-05
- Repository: `E:\Work\XML Carousel\xml-carousel`
- Branch: `task-14.5-semantic-zoom-acceptance-audit`
- Baseline commit: `275a34b119ffce52a704663056b8dfa6eb83e8c5`
- Baseline tree: `0a36137572736a2161a59df173b600357ed70fb8`
- Node: `v24.16.0` (`.node-version` is `24.16.0`)
- Controlled Chrome: `Chrome/151.0.7922.72`
- Controlled Firefox: `Firefox 153.0.3`, driven by geckodriver `v0.37.1`

The exact preflight passed before the task branch was created: `HEAD`, local
`main`, and `origin/main` were the required baseline; the worktree and staging
area were clean; there were no untracked files; and one worktree existed.

## Contract and method

Semantic zoom is ephemeral presentation state with three genuine levels: Full
detail, Compact, and Overview. It does not alter schema project data, the
current node, the navigation journey, inspection state, or persisted browser
storage. On layouts smaller than 1024 CSS px wide or 600 CSS px high, rendered
state falls back to Full while the requested level is retained and restored
when the layout becomes eligible again.

Evidence was assembled from the integrated semantic-zoom unit/component suites,
the new milestone-level acceptance suite, canonical validation, and the existing
production-build lifecycle harness in controlled Chrome and Firefox. No private
archive or private repository was accessed. Transient JSON and screenshots are
ignored under `.vite/semantic-zoom-acceptance/`.

## Public fixture inventory

| Fixture | Selection reason |
| --- | --- |
| `tests/fixtures/keyboard-navigation/branching-navigation.dtd` | Standalone DTD, leaf, recursive terminal closure, small and dense branch fans, and keyboard navigation. |
| `tests/fixtures/keyboard-navigation/branching-navigation.xsd` | Standalone XSD, mixed node kinds, branching, and keyboard navigation. |
| `tests/fixtures/zip/valid-xsd-include.zip` | Public multi-file ZIP import and replacement persistence. |
| `tests/fixtures/hermetic-foundry/synthetic-project/` | Four-file public synthetic Hermetic Foundry package; converted deterministically to an ignored local ZIP. |
| `tests/fixtures/semantic-zoom/relationship-lines.xsd` | Stacked destinations and the Compact/Overview A/B/C relationship-line sequence. |
| `tests/fixtures/dtd/large-10000.dtd` | Successful 10,000-node DTD import, Search, and all three presentations. |
| `tests/fixtures/xsd/large-10000.xsd` | Successful 10,000-node XSD import, Search, and all three presentations. |
| `tests/fixtures/dtd/large-40000.dtd` | Existing import-cancellation and worker cleanup path. |
| Existing sample, visualization-coverage, and carousel fixtures | Shared destinations, duplicate edges, deep journeys, long names, package overview, focus, announcements, side windows, drag, Search, and inspector contracts. |

No new persistent fixture was necessary.

## Acceptance matrix

The following matrix names every audited dimension. A category passes only when
its focused assertions and, where browser-observable, production-build harness
checks pass together.

| Axis | Required categories | Evidence and result |
| --- | --- | --- |
| Presentation | Full detail; Compact; Overview | All pass in component/integration tests and both browsers. Accepted Full content remains present; Compact keeps names, truthful edge occurrence, Inspect/Close, and bounded lines; Overview is names-only with semantic accessible labels and no visible or tabbable Inspect. |
| Format | Standalone DTD; standalone XSD; multi-file ZIP; Hermetic Foundry multi-file | All four import publicly and retain requested Overview in both browsers; project and navigation data do not acquire zoom state. |
| Graph shape | Structural leaf; single destination; small fan; Compact-dense fan; Overview-dense fan; deep journey; shared destination; duplicate visible edges; terminal cycle; long names; mixed kinds; package overview | Covered by public fixtures and existing plus new focused suites. Windowing is bounded, edge identity stays distinct, cycles terminate, and long names wrap. |
| Navigation/entry | Direct card; pointer drag leafward/rootward; vertical drag branch; spatial keyboard; Search Centre; Search Inspect; previous step; earlier-path Jump; side-window buttons; side-window wheel | Passes across the integrated focused suites; the lifecycle harness repeats card, keyboard, Search Centre/Inspect, and side-window flows without presentation-state mutation. |
| Zoom input | Zoom in; Zoom out; range pointer/input; range keyboard; control wheel; rapid repeat; transition reversal; direct Full-to-Overview | Passes. Boundary events are not consumed, consumed changes settle once, native browser zoom chords are not prevented, and motion artifacts clean up. |
| Environment | Normal motion; reduced motion; forced colours where supported; 125/150/200% text; 125/150/200/400% magnification-equivalent CSS viewport reflow; Navigation panel open/closed; Inspector open/closed | Passes. Chrome supplied forced-colour instrumentation; Firefox supplied reduced-motion coverage but reports the unsupported instrumentation listed below. |
| Browser | Controlled Chrome; controlled Firefox | Both final harness reports have all 13 top-level assertions true. |

## State, content, navigation, focus, and announcements

- Fresh load and reload use requested/effective Full; there is no semantic-zoom
  `localStorage` or IndexedDB persistence.
- Requested state persists through navigation, Search, inspection, project
  session reset, and DTD/XSD/ZIP/Hermetic replacement. Constrained layout renders
  Full without losing the request; eligible desktop restoration recovers it.
- Zoom never changes current node, journey path, project object, shared-node
  identity, inspection data, or parser/import state.
- Full content is unchanged. Compact omits Full secondary summaries while
  retaining names, edge-specific occurrence truth, Inspect/Close, and lines.
  Overview visible cards contain names only, have no Inspect target, keep hidden
  relationship/kind/occurrence semantics in accessible names, preserve native
  navigation, show more context when space permits, and keep terminal closures
  non-advancing.
- Explicit zoom controls retain focus. Connected navigation controls retain or
  receive their documented fallback. Disappearing Inspect/summary/control targets
  fall back to the corresponding card, Jump, or focus heading; no audited
  transition leaves focus on `body`. Project replacement does not transfer focus
  unexpectedly. Focus-visible styling remains structurally visible.
- Announcements are one per consumed change, deduplicated for same-value range
  noise, absent at boundaries and during responsive fallback/restoration, and
  independent from truthful navigation and side-window announcements.

## Relationship-line acceptance

Compact and Overview both passed the XSD A/B/C browser sequence: A has stacked
leafward destinations, B has previous-to-focus plus focus-to-destination, and C
restores A exactly. Focus, source, target, and edge keys were correct; coordinates
were finite and stage-relative; endpoints met card boundaries; corridors stayed
bounded; state-B paths disappeared before C; Full cleared all paths; and restored
presentations redrew after idle. Overview exposed seven A/C destinations versus
five in Compact.

Focused geometry and component tests additionally cover DTD relationships,
duplicate edge keys to a shared node, terminal closures, hidden journey gaps,
branch/history window redraw, rapid/reversed changes, reduced motion, stale-line
clearing on replacement, and frame/observer cleanup. Existing thresholds were not
weakened. Forced-colour CSS uses distinct solid, `2 4`, and `9 4` patterns for
leafward, rootward, and terminal lines, respectively.

## Responsive and accessibility results

Both browsers passed all 14 required viewports:

`1440x900`, `1280x720`, `1280x600`, `1100x600`, `1024x768`,
`1024x600`, `1024x599`, `1023x600`, `768x900`, `412x915`,
`390x844`, `915x412`, `844x390`, and `320x800`.

The exact boundary passed: 1024x600 is eligible; 1024x599 and 1023x600
are ineligible. Eligible controls were contained, unclipped, and complete.
Ineligible layouts removed the control, rendered Full, retained requested
Overview, kept focus and core controls reachable, and had no document-level
horizontal overflow.

Text scales 125%, 150%, and 200% passed with visible focus/current level and no
horizontal overflow. Magnification-equivalent CSS viewport reflow at 125%, 150%,
200%, and 400% passed; the 400% equivalent used 320x640 CSS px and did not require
ordinary two-dimensional scrolling. This was not browser-native page zoom.

The accessibility contracts pass: exactly one named `Semantic zoom` group; a
native range with description and `aria-valuetext`; dynamic button names; visible
current level; minimum target sizing; no hidden duplicate control; accurate
control-local wheel behavior; uncaptured Ctrl/Meta-wheel and `+`, `-`, `0` native
zoom inputs; native touch-action semantics; intended per-presentation tab order;
and no hidden Overview Inspect. Chrome forced-colour emulation verified visible
control, range, disabled state, focus, and non-colour-only relationship patterns.
Automated accessibility assertions passed. Manual screen-reader testing was not
performed.

## Large-schema, performance, and lifecycle results

The new final browser evidence directly imported both public 10,000-node files,
selected Full/Compact/Overview, and found `node00001` through Search:

| Browser/fixture | Import | Search result | Visible cards Full/Compact/Overview | Maximum total DOM elements | Horizontal overflow |
| --- | ---: | ---: | --- | ---: | --- |
| Chrome DTD | 1,004 ms | 1 ms | 4 / 6 / 8 | 1,409 | No |
| Chrome XSD | 18,818 ms | 2 ms | 4 / 6 / 8 | 642 | No |
| Firefox DTD | 1,104 ms | 3 ms | 4 / 6 / 8 | 1,409 | No |
| Firefox XSD | 16,963 ms | 2 ms | 4 / 6 / 8 | 642 | No |

The project identity and idle import phase remained stable through each zoom
cycle. The durable suite separately imports both files, asserts at least 10,000
nodes, and proves project/journey identity across all three levels. Window helpers
cap Compact leafward work at 7 cards, Overview at 11 cards, and Overview earlier
journey work at 5 rows even for 10,000-entry inputs. Geometry and transition work
is proportional to that visible window rather than schema size. Existing Search,
side-window, no-unbounded-queue, 40,000-node cancellation, and project-replacement
tests remained green.

Chrome completed 30 mixed lifecycle cycles: first-three median heap 9,354,968
bytes, final-three median 9,976,080 bytes, slope 20,926.691 bytes/cycle, within
the allowed 33,554,432-byte increase. Live worker targets were zero between
imports. Firefox completed the full UI/format/large-schema matrix and three mixed
cleanup cycles; heap, event-listener, and worker-target instrumentation is not
available from this Firefox driver.

## Privacy and browser results

Chrome recorded 237 browser requests and 569 server requests, all required local
production-build traffic: external, `file:`, schema-upload, analytics, telemetry,
crash-reporting, and update-check requests were all zero. Required local requests
succeeded. Console warnings/errors and page errors were both zero. Live workers
between imports were zero.

Firefox recorded 133 local server requests, zero console warnings/errors, and zero
page errors. Direct Firefox browser-request interception is unsupported, so the
Firefox privacy conclusion relies on the isolated loopback server log, application
behavior, and the equivalent direct Chrome request audit; it is not presented as
Firefox request-event telemetry. Firefox heap, event-listener, worker-target, and
forced-colour emulation are likewise unsupported. These limitations are
non-blocking because the corresponding contracts have Chrome browser evidence and
durable cross-browser-independent tests.

Final controlled reports:

- Chrome: `.vite/semantic-zoom-acceptance/chrome.json`, SHA-256
  `0af79fc73d2a335ce83a4cf24f44a36df8179f98f01a24cb150fc758fd12483b`
- Firefox: `.vite/semantic-zoom-acceptance/firefox.json`, SHA-256
  `a05468b6523c244ea5eb27f2975ac7355a69e601c40eb571b42550cd7db92914`

Required Chrome screenshots are under
`.vite/semantic-zoom-acceptance/screenshots/chrome/`. Representative SHA-256
digests are:

- Full: `754ed13e13c3a50745cdc8fdefd1250c4398a1113520b4719efcc0df26572a87`
- Compact A/B/C: `b399ebcf5877eefbe08a66abcaf6d145e925890e872bad3be8221fad0d937240`,
  `74269f2b96789705575babd30d5bf6b42e53c3fe7cbc4bf481d482b1bfa9a4e2`,
  `488a3e7cbe52e2d2ded1020f0d5bcdca55b1a3e16fd5be39dfe2406a5d8d2017`
- Overview A/B/C: `5cc3b6fee5a4f0ef508fb6b130b340cf33376792b67495746fdd9955384c7e54`,
  `32b7affc6f91945cbc0ca44f943d53a5346070059c6122524c24216336dbaa43`,
  `927d64ba41e04eee5c6c69e431d4ec48a18037878318fd2c62595e5ee8742e2b`
- Forced colours: `eb995b0c93296996ac88b1127e33defc8dd98bd792f96110547352e873099fd6`
- 1024x600: `764c0c5346b8a4713c223a5104728f525bd17d3d2880a5c72c15889cbf8d7f7c`
- 320 CSS px reflow: `ec921d51f1254b0563e12fb7e05947a2a04dbb0d12ef45c1cb35534b8db2ce44`

## Automated validation

- `npm ci`: PASS; 272 packages audited, zero vulnerabilities, and no tracked
  file change.
- New acceptance suite: 10/10 tests passed, including direct public 10,000-node
  DTD/XSD imports.
- Semantic-zoom focused set: 13 files and 171 tests passed before the large-file
  evidence enhancement; the affected acceptance suite was rerun afterward and
  passed 10/10. The final canonical run is authoritative for the finished tree.
- Canonical `npm run validate`: PASS; complete-visualization matrix 221/221,
  Svelte diagnostics 0 errors/0 warnings, 165/165 test files and 2,220/2,220
  tests, lint, format check, production build, static-build verification, and
  hostile-MIME verification.
- `npm audit --json` and `npm audit --omit=dev --json`: zero vulnerabilities.
- `npm run format:check`, `git diff --check`, and harness `node --check`: PASS.

## Defects, corrections, and limitations

No semantic-zoom product defect was found, so no production UI, parser, resolver,
schema model, standard, fixture, dependency, version, release, or deployment file
was changed. Audit-only improvements add the milestone integration suite, extend
the existing lifecycle harness with Hermetic persistence, the full responsive
matrix, required screenshots, and explicit 10,000-node DTD/XSD cycles, and record
this report.

Known non-blocking limitations are: no manual screen-reader session; no physical
touch-device or physical pointer session; no browser-native page-zoom run (the
audit uses magnification-equivalent CSS viewport reflow and verifies that native
zoom input is not captured); Chrome-only forced-colour emulation and heap/worker
telemetry; unsupported direct Firefox browser-request telemetry; and the public
synthetic Hermetic fixture rather than any private archive. Manual visual and
assistive-technology acceptance remains the next human review step.

## Conclusion

All required semantic-zoom acceptance categories have passing durable or
controlled-browser evidence. No blocker or product correction remains. The
feature is ready for final semantic zoom manual acceptance.
