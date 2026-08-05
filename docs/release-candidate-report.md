# XML Carousel 0.1.0 — Release Candidate Report

> Historical Task 12.3 candidate record. Its counts and environment describe
> that candidate, not the current release boundary. See
> [Standards support](standards-support.md),
> [Known limitations](known-limitations.md), and the current
> [release checklist](release-checklist.md).

Report date: 2026-07-31

## Candidate identity

- Release version: `0.1.0`
- Source baseline: `c6af0c4cded3445478fa74a3cc737378e1c61af4`
- Candidate branch: `task-12.3-first-public-alpha-candidate`
- Node: `v24.16.0`
- npm: `12.0.1`
- Operating system: Microsoft Windows `10.0.26200`
- Browser: Codex in-app Chromium browser; the control surface did not expose
  the exact Chromium version
- Repository visibility: private when queried during preflight
- Baseline CI: completed successfully for the exact source baseline

This report combines the Task 12.3 candidate evidence with final portable
distribution verification based on integrated source commit
`08bf2c235d12dc0ad01aeb661abee2e3ed1bc078`.

## Final portable distribution

The build creates one server-agnostic artifact whose HTML references its
JavaScript and stylesheet relative to `index.html`. The worker URL is resolved
relative to the JavaScript module. The unchanged contents of `dist/` can
therefore be copied into any directory served by a static web server, whether
that directory is at a domain root or nested beneath it. XML Carousel does not
require a backend.

The final local build and portable-artifact verifier passed. The generated
`index.html` referenced:

- `./assets/index-BTnfMNFp.js` (372,165 bytes); and
- `./assets/index-fDzE7e11.css` (70,845 bytes).

The artifact contained exactly one non-empty worker:
`assets/schemaImportWorker-ll5tt6Dr.js` (246,258 bytes).

At `2026-07-31T06:31:40.6313014+00:00`, an independent cache-bypassed
read-only check of <https://xmlcarousel.wolfshafenpress.com/> returned HTTP 200.
The live HTML referenced the exact same JavaScript and stylesheet basenames as
the local artifact. The resolved JavaScript, stylesheet, and worker each
returned HTTP 200 with the expected media type and byte count. The in-app
browser rendered the Book DTD experience, closed and reopened Help, observed
the expected script and stylesheet, and reported no console warnings or
errors.

Separately from that independently observed evidence, the user confirmed that
they manually copied the contents of `dist/` to the live location and that the
site loaded successfully. No hosting account, transfer method, or server
configuration is part of the repository contract.

## Automated validation

| Gate | Result |
| --- | --- |
| `npm ci` | Passed; 271 packages installed and no tracked file changed |
| `npm run validate` | Passed |
| Svelte/TypeScript check | 0 errors and 0 warnings |
| Tests | 121 test files; 1,799 tests passed |
| Lint | Passed |
| Formatting | Passed |
| Whitespace | `git diff --check` passed |
| Portable build and verification | Passed with relative base `./` |
| Build modules | 271 transformed modules |
| Worker | `assets/schemaImportWorker-ll5tt6Dr.js`; 246,258 bytes |
| Generated output | `dist/` remained ignored and untracked |

The corrected top-bar suite contains 21 passing tests. Its source contracts
preserve DTD/XSD/ZIP labels, accessible names, file-picker wiring,
enabled/disabled behavior, compact Help and Navigation, and
`var(--control-min-size)` as the import controls' uncancelled minimum inline
size.

## Functional smoke matrix

| Area | Result and evidence |
| --- | --- |
| Startup and welcome | Book DTD loaded; unchecked and checked welcome preferences behaved correctly across reload |
| Help | Open, close, Escape, containment, and focus restoration passed |
| Built-in DTD | Sample comment, structure, attributes, Search, and escaped markup passed |
| Built-in XSD | Elements, named types, annotations, appinfo, enumeration, Search, references, and markup passed |
| Local files | Valid DTD and XSD imports passed |
| Packages | Resolved and supported unresolved-reference ZIPs passed |
| Failure handling | Malformed XSD preserved the current project and showed a safe error |
| Cancellation | Large worker imports remained cancellable and preserved the current project |
| Stale work | A cancelled worker result did not replace a later project |
| Search | Bounded name Search and Center/Inspect actions passed; documentation/comment coverage also passes rendered integration tests |
| Navigation | Pointer rootward/leafward, spatial arrow journeys, Enter/Space contracts, and independent inspection passed |
| Source and metadata | DTD comments/attributes and XSD source, documentation, appinfo, enumeration, derivation, and references rendered safely |
| Replacement | Search, outline, journey, and inspection state did not leak between projects |

## Large-schema matrix

Times are file-selection-to-first-observed active-project presentation. A
zero-millisecond focus result means the focused card was already present in
the same observation as project activation.

| Fixture | Activation | Focus after activation | Initial outline | Visible cards | Search | Filter | Result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| DTD 10,000 | 252 ms | 0 ms | 100 rows | 6 | 100 bounded results; 36 ms observation | 39 ms | Pass |
| DTD 40,000 | 915 ms | 0 ms | 100 rows | 6 | Bounded and usable | 67 ms | Pass |
| XSD 10,000 | 17,696 ms | 0 ms | 100 rows | 6 | 139 ms | 41 ms | Pass |
| XSD 40,000 | first observed at 320,916 ms | 0 ms | 100 rows | 6 | 175 ms | 70 ms | Pass |
| Resolved ZIP 20 × 1,000 | 6,498 ms | 0 ms | overview + 100 rows | 6 | 155 ms | 34 ms | Pass |
| Deferred-include ZIP 10 × 1,000 | 3,279 ms | 0 ms | overview + 100 rows | 6 | 144 ms | 31 ms | Pass with known limitation |

Every 40,000-node gate passed: there was no unresponsive-page dialog, crash,
out-of-memory failure, or console error; initial outline rows stayed at 100;
the focused card appeared within five seconds of worker completion; and
Search, filtering, distant centring, navigation, and inspection remained
usable. The XSD worker's long total duration is significant but remained
responsive and cancellable throughout.

The unresolved large fixture contains a deliberately missing `xs:include`.
Include/import components are deferred in this alpha, so that include is not
presented as a supported unresolved graph reference. This is the documented
limitation and was not changed in Task 12.3.

Large-to-small and small-to-large replacement removed previous project,
Search, filter, journey, and inspector state. No browser error, memory
warning, or stale activation was observed.

## Responsive matrix

All measurements are unrounded CSS pixels from `getBoundingClientRect()`.
Visible compact labels remained DTD, XSD, ZIP, `?`, and Nav while accessible
names remained Open DTD, Open XSD, Open ZIP, Open XML Carousel help, and Open
schema navigation.

| Viewport | DTD | XSD | ZIP | Help | Navigation | Page overflow |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1440 × 900 | 104.421875 × 44 | 103.4375 × 44 | 97.171875 × 44 | 65.96875 × 44 | not shown | 0 |
| 1280 × 800 | 104.421875 × 44 | 103.4375 × 44 | 97.171875 × 44 | 65.96875 × 44 | not shown | 0 |
| 1024 × 768 | 104.421875 × 44 | 103.4375 × 44 | 97.171875 × 44 | 65.96875 × 44 | 108.78125 × 44 | 0 |
| 915 × 412 | 104.421875 × 44 | 103.4375 × 44 | 97.171875 × 44 | 65.96875 × 44 | 108.78125 × 44 | 0 |
| 844 × 390 | 63.1875 × 44 | 62.21875 × 44 | 55.953125 × 44 | 44 × 44 | 108.78125 × 44 | 0 |
| 412 × 915 | 44 × 44 | 44 × 44 | 44 × 44 | 44 × 44 | 44 × 44 | 0 |
| 390 × 844 | 44 × 44 | 44 × 44 | 44 × 44 | 44 × 44 | 44 × 44 | 0 |
| 360 × 800 | 44 × 44 | 44 × 44 | 44 × 44 | 44 × 44 | 44 × 44 | 0 |
| 360 × 225 | 44 × 44 | 44 × 44 | 44 × 44 | 44 × 44 | 44 × 44 | 0 |

No visible core control overlapped another or was hidden. Core controls,
Search, the navigation drawer, carousel, inspector, and Help remained
reachable. At 915 pixels the Navigation edge landed on a fractional layout
coordinate at the viewport boundary; the browser reported zero overflow and
no visible overlap or inaccessible content.

## Accessibility matrix

| Check | Result |
| --- | --- |
| Target sizing | Passed at every required viewport |
| Visible focus | Passed where the browser automation could move focus |
| Native inputs | File inputs retained labels, accept filters, and picker wiring |
| Dialog | Native dialog role, modal semantics, heading/description associations, Escape, containment contract, and focus restoration passed |
| Announcements | Import progress/cancellation and focused-node status regions were exposed |
| Disabled state | During worker import all three import actions were disabled and only the active format was busy |
| Source safety | DTD and XSD source remained escaped text |
| Accessibility tree | Banner, navigation, main, complementary inspector, dialog, regions, headings, articles, buttons, searchboxes, checkbox, and statuses had meaningful roles and names |

### Manual accessibility gates

The in-app browser control surface could not change browser zoom, emulate
`prefers-reduced-motion: reduce`, or synthesize native Enter/Space activation
on focused buttons. Its current media state reported
`prefers-reduced-motion: no-preference`. The automated spatial-keyboard,
dialog, reduced-motion, focus, and native-input contracts all passed, but they
are not represented here as real manual 200% zoom, reduced-motion, or
keyboard-only tests.

No connected Chrome control surface was available. Windows Narrator with
Chromium/Chrome was therefore not executed. Real 200% browser zoom, manually
enabled reduced motion, a complete keyboard-only workflow, and Windows
Narrator with a current browser remain explicit manual publication gates.

## Portable artifact preview evidence

The same unchanged portable artifact previously passed direct load and reload
from a domain-root preview and two nested application-directory previews.
Across those previews, the logo, samples, Help, welcome behavior, local file
imports, worker cancellation, disabled states, and focus restoration passed.
Script, stylesheet, and worker requests stayed relative to each application
directory. No asset 404, console warning or error, horizontal overflow, mixed
content, or root escape was observed.

## Task 12.4 corrective focus, reflow, and alignment evidence

The corrective production artifact contained four files and retained one
worker asset. Its deterministic inventory digest was
`2dde95c240bef9990c25310da59a06dbb53a8cadaf241ed33fe61f014d8b04d9`.
The inventory and digest were identical before and after all three preview
mounts.

- Successful DTD, XSD, and ZIP imports focused the new current-card `h2`
  (`tabindex="-1"`), not an Open control. An immediate Right Arrow moved
  `library` to `shelf`, XSD `book` to `BookType`, and ZIP `root` to `Shared`.
- A failed DTD preserved the active ZIP project and did not focus the new
  carousel. Cancelling the 40,000-node XSD restored Open XSD; the late worker
  window neither replaced the ZIP project nor moved focus.
- The stage `ResizeObserver` rebuilt leafward capacity from actual stage
  bounds. At the 1440 × 900 magnification-equivalent sequence, the five-child
  chapter changed from 5 cards to 3 / `+2 more`, then 2 / `+3 more`, and
  returned through 3 / `+2 more` to all 5 cards. Search `title`, inspected
  node `title`, current node `chapter`, and the journey were preserved.
- The complete 5 viewport × 5 magnification-level matrix covered 1440 × 900,
  1024 × 768, 844 × 390, 412 × 915, and 390 × 844 at 100%, 125%, 150%, 175%,
  and 200% effective CSS viewports. Every rendered child remained within the
  stage, every `+n more` count matched the five-child fixture, repeated
  contraction/expansion restored cards, and no page overflow was reported.
- When a focused `note*` card became hidden, focus moved to the centred
  `chapter` heading while Search and inspector state remained intact. A
  focused `title` card that remained rendered retained focus.
- At the screenshot-like 1024 × 768 / 150% equivalent layout, the full
  Navigation button rectangle was `x=507.16, y=5.5, width=82.81, height=44`;
  the label rectangle was
  `x=516.16, y=19.7, width=64.81, height=15.59`. Both centres were
  `(548.56, 27.5)`, with no clipping. Compact Nav also measured 44 × 44 with
  a centre delta no greater than 0.01 CSS pixels.
- The same unchanged `dist/` loaded and reloaded at a root directory and two
  nested application directories. Each preview completed DTD/XSD/ZIP import,
  focus-handoff, immediate-arrow, reflow, and Navigation checks. Script and
  stylesheet requests remained relative to each directory; the logo remained an
  inline data URI; worker-backed imports succeeded; console warning/error
  logs were empty; and no asset 404 appeared.

The in-app browser could not synthesize native keyboard activation of the file
chooser or change the browser chrome's zoom setting. The magnification checks
therefore used the corresponding effective CSS viewport dimensions. Real
keyboard-only chooser activation and browser-chrome zoom remain manual
publication gates.

## Task 13.19 focused-card and branch-windowing correction

The focused-card overflow came from an unconstrained focus anchor and a card
whose internal scrolling was enabled only by a short-landscape media query.
Dense Schema overview metadata could therefore enlarge the card beyond the
measured motion stage. The branch regression had a separate cause: the
leafward fan selected a static 1/2/3/5/7-card tier from stage dimensions but
did not verify the rendered height of mixed-height cards, gaps, lane label,
or continuation controls.

`SchemaCarousel.svelte` now gives the focus anchor the motion stage's definite
height. `FocusCard.svelte` keeps the declaration kind, complete wrapping name,
and Inspect/Close Inspection action in fixed grid rows; the established
Schema overview heading continues to convey schema identity without a
redundant badge. Retained detail sits in a labelled, keyboard-focusable
vertical scroll region. The region has no
horizontal scrollbar, contains wheel overscroll, implements isolated touch
pointer scrolling, and remains excluded from carousel gesture and spatial-key
handling. Existing bounded relationship and documentation summaries retain
truthful continuation counts. Complete retained preview text remains readable
in the scroll region, while the existing Inspector and source surfaces remain
the complete routes for declaration detail.

`BranchFan.svelte` and `RootwardPath.svelte` use the shared
`renderedVerticalWindowFits` gate in `carouselWindowing.ts`. The existing stage
tiers are now only upper bounds. After rendering, each lane compares its whole
actual border box with the measured stage height plus six CSS pixels of
focus-ring clearance at each edge, then reduces capacity one item at a time
until it fits. This directly includes mixed card heights, headings, nested
rootward history, gaps, and whichever continuation controls are present, and
stops without oscillating once the rendered lane fits. The immediate previous
rootward card remains pinned; earlier history contracts from two rows to one
when required.

Leafward hidden counts continue to come from the positional window's exact
`hiddenBeforeCount` and `hiddenAfterCount`; the forward control now renders
`+1 more destination` or `+n more destinations`. Rootward controls likewise
report exact closer/earlier path-step counts. Only visible window items are in
the DOM and normal Tab/screen-reader order. Button, wheel, spatial-keyboard,
and rootward-history paging retain access to every hidden item. Project/focus
changes reset the relevant window, while ordinary measured reflow clamps the
preserved start and keeps a keyboard-selected relationship visible where
possible. No relationship semantics, semantic zoom, graph layout, Search,
Navigation, package resolution, or inspector architecture changed.

Focused automated validation passed 158/158 tests across carousel windowing,
mixed-height adaptive branches, rootward paging, dense focused-card content,
long names, pointer gestures, navigation, and spatial keyboard navigation. A
separate touch-scroll regression confirms that an 80-pixel touch movement
scrolls the bounded summary by 80 pixels. These fixtures cover zero/one/exact/
one-over/many destinations, singular and plural continuation counts, long and
mixed-height cards, dense DTD content models, dense XSD metadata and
documentation, hidden-card absence, continuation activation, focus
preservation, and reduced-motion contracts.

Real production-browser checks used the built-in dense Library XSD Schema
overview at 1440 × 900, 1280 × 720, 1024 × 768, 768 × 900, 390 × 844, and
844 × 390, plus 1024 × 600 and 640 × 480 effective reflow reductions. At every
size the focused outer box stayed within the stage, remained above the legend,
kept its heading and Inspect action inside the card, and introduced neither
summary nor page-level horizontal overflow. Every rendered rootward and
leafward item stayed within the stage. Continuation counts changed with the
measured capacity, desktop continuation activation reached hidden leafward and
rootward entries, and scrolling the dense focus summary changed its scroll
position without moving the leafward window. The bottom orientation legend
was retained and remained unobscured.

All correction work remains unstaged and uncommitted on the existing Task
13.19 branch.

### Branch-window range-indicator corrective pass 2

The failed first visual result came from a stale final-build artifact, not a
selector-specificity, component-scope, cascade, wrapper, or token error. The
production path under test still rendered
`<p class="visually-hidden" role="status" aria-live="polite"
aria-atomic="true">`; it contained neither the source
`branch-window-range` class nor the component's Svelte scope class, and the
compiled CSS contained no matching branch-range rule. Consequently, the
global `body` rule supplied 15px UI text, weight 400, the neutral
`var(--colour-text)` value `rgb(23, 33, 43)`, and a 1.5 line-height. The global
`h1, h2, h3, p` rule removed only the paragraph's block-start margin; the user
agent paragraph rule supplied block display and the remaining 15px
block-end margin. The similarly named component-scoped
`.visually-hidden.svelte-*` rules belonged to other components and did not
match this unscoped paragraph. Its observed final computed values were thus
15px, 400, `rgb(23, 33, 43)`, 22.5px line-height, `block`, and
`0px 0px 15px` margin.

`src/ui/carousel/BranchFan.svelte`, which directly owns the status paragraph,
now renders `<p class="branch-window-range svelte-1lfgubu"
data-branch-window-range ... role="status">` in the final minified bundle.
Its component-scoped `.branch-window-range` rule applies
`var(--font-size-xs)`, weight 700, line-height 1.25, zero margin, left
alignment, and `var(--colour-accent)`. The token resolves to
`rgb(35, 103, 201)` (`#2367c9`), a saturated primary blue that is visibly
distinct from the dark neutral body value. Inward end anchoring and an
explicit minmax lane track keep ordinary intrinsic text on one line; the
large-total data state confines four-or-more-digit totals to the rail and
permits safe wrapping. No `!important`, arbitrary colour, opacity, background,
border, link, button, chip, or badge treatment was introduced.

The rebuilt production result computes to 12px, 700,
`rgb(35, 103, 201)`, 15px line-height, `block`, and zero margin at 1440 × 900,
768 × 900, 390 × 844, and 844 × 390. Nine-branch status text stayed on one
line at all four viewports. A 9,999-branch browser fixture wrapped its exact
`Showing branches 2–2 of 9999.` status to two 15px lines inside the rail.
Neither case overlapped a continuation control, focused card, or bottom
orientation legend, and neither introduced page-level horizontal overflow.
The production browser audit also confirmed the 12px/700/accent treatment was
obvious beside the 15px/400 neutral body copy. The observed ordinary ranges
and cards remained synchronized after responsive measurement: 2–3 at
1440 × 900, 3–5 at 768 × 900, 4–6 at 390 × 844, and 5–5 at 844 × 390.

The final-build verifier now requires the actual rendered element hook,
matching compiled Svelte scope, typography/accent/containment declarations,
and large-total modifier. The portable build produced
`assets/index-KlEeE3EJ.js` and `assets/index-n4v__Uad.css`; running
`npm run verify:dist -- --base=./` accepted the rebuilt artifacts. Focused
validation used `npm test -- --run src/ui/carousel/BranchFanAdaptive.test.ts
src/ui/carousel/CarouselWindowingUi.test.ts
src/ui/carousel/carouselWindowing.test.ts
src/ui/carousel/CarouselLongNameContainment.test.ts
src/tests/CarouselGesture.test.ts src/tests/CarouselNavigation.test.ts
src/tests/PublicAlphaPackaging.test.ts` and passed 142/142 tests across seven
files. `npm run check` reported zero diagnostics, `npm run lint` passed, and
`npm run build -- --base=./` completed with 294 transformed modules. Tests
cover presence and absence, exact range and total, computed token values,
non-interactivity and Tab-order exclusion, large-total containment, the
compiled production rule, continuation counts, and post-measurement live-text
synchronization.

The paragraph remains informational, non-focusable, and after the continuation
controls in DOM and screen-reader order. The synchronization change only keeps
the announcement aligned with an already measured smaller visible window; it
does not change the windowing calculation, branch capacity selection,
continuation counts, paging, keyboard behavior, or accessible control names.
All Task 13.19 work remains unstaged and uncommitted on the existing branch.

## Dependency audit

`npm audit --json` reported 0 critical, 5 high, 0 moderate, 0 low, and 0
informational advisories.

The affected paths are development-tooling paths:

- direct development dependency `eslint@9.39.5`;
- `@eslint/config-array@0.21.2` and `@eslint/eslintrc@3.3.6`;
- `minimatch@3.1.5` through ESLint;
- `minimatch@10.2.5` through
  `typescript-eslint`/`@typescript-eslint/typescript-estree`;
- `brace-expansion@1.1.16` and `brace-expansion@5.0.7`.

The advisory is an unbounded brace-expansion denial of service in glob
processing. npm offers only a major ESLint `10.8.0` change for the audited
tree. These packages are used by local lint/type tooling, are not production
dependencies, and none of their names appeared in the generated browser
output. No credible first-alpha browser-runtime or distribution blocker
was identified. No audit fix or dependency change was performed.

## Distribution conclusion

No distribution blocker remains for revision `0.1.0`. The portable build,
verifier, root and nested preview evidence, live asset comparison, functional
smoke coverage, large-schema checks, responsive checks, and dependency audit
all passed.

Real manual 200% browser zoom, reduced motion, keyboard-only file selection,
and Narrator/browser combinations were not executable through the available
browser control surface. They remain documented accessibility coverage
limitations, not distribution blockers. A source tag or hosted release entry
was not required for this task and is not claimed in this report.

### Non-blocking observations

- The 40,000-node XSD worker took 320.916 seconds to reach the first observed
  active project, while remaining responsive and cancellable.
- The five high npm advisories are confined to development tooling.
- XSD include/import declarations remain deferred as documented.
