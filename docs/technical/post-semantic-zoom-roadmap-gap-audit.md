# Post-semantic-zoom roadmap gap audit

## 1. Baseline identity

- Audit date: 2026-08-06
- Repository: public XML Carousel repository
- Task branch: `task-15.1-post-semantic-zoom-roadmap-audit`
- Baseline commit: `b0e20bc9326fbb57db07018946b38ee84b2b1086`
- Baseline tree: `433c9e945f9043b096db3087c06115197990b23b`
- Released revision: `0.1.0`, annotated tag `v0.1.0`

The audit began with `HEAD`, local `main`, and `origin/main` at the baseline,
with a clean worktree, empty staging area, no untracked files, and one
worktree. The public issue backlog contained zero open issues. No non-public
repository or archive was accessed.

## 2. Audit method

The audit reconciled intent, implementation, evidence, and product boundaries
rather than interpreting old unchecked boxes as defects. It used five passes:

1. compare every Spiral 0–12 Build and Acceptance Criteria item with current
   source, tests, and superseding orientation notes;
2. trace the completed Tasks 13.1–13.19 and 14.1–14.5 milestone groups through
   technical reports, current source, tests, and public history;
3. classify every known-limitation section and every tracked debt-marker match;
4. audit current user workflows, standards, accessibility, capacity, release,
   and documentation evidence; and
5. score only viable milestones, then apply qualitative judgment to close
   scores instead of treating the arithmetic as a decision.

Candidate primary dispositions use exactly this vocabulary:
`complete`, `partially complete`, `approved future feature`,
`evidence-only gap`, `release/process debt`, `documentation debt`,
`deliberate product boundary`, `standards boundary`, `security boundary`,
`obsolete/superseded`, and `new proposal`.

## 3. Reviewed sources

Required documents reviewed in full or by their applicable complete sections:

- `docs/development-plan.md`
- `docs/style-guide.md`
- `docs/known-limitations.md`
- `docs/standards-support.md`
- `docs/architecture.md`
- `docs/release-checklist.md`
- `docs/release-candidate-report.md`
- `docs/technical/semantic-zoom-acceptance-audit.md`
- `README.md`
- `package.json`

Supporting evidence included every Markdown report under `docs/technical/`, the
complete-visualization matrix and acceptance gate, current public Git history
from its parentless root through `main`, `.github/workflows/ci.yml`, and the
architecture under `src/app/`, `src/schema/`, `src/standards/`, `src/ui/`,
`src/workers/`, `src/tests/`, `scripts/`, and `tests/fixtures/`.

## 4. Original Spiral 0–12 reconciliation

The old left/right statements are evaluated against the superseding current
orientation: rootward context is visually left and leafward context visually
right. Gesture content moves carousel-style: drag left goes leafward and drag
right goes rootward.

### Spiral 0 — Project setup and concept skeleton

**Build:** Vite/Svelte/TypeScript app — **complete**; app shell — **complete**;
top bar, navigation panel, carousel, and inspector regions — **complete**;
placeholder sample data — **superseded** by parser-backed Book DTD and Library
XSD samples; test framework — **complete**; formatting/linting — **complete**.

**Acceptance:** production build — **complete**; local development server —
**complete**; basic layout — **complete**; no backend — **complete**;
placeholder carousel — **superseded** by the functional carousel; placeholder
inspector — **superseded** by the functional inspector; unit test — **complete**.

### Spiral 1 — Hardcoded carousel prototype

**Build:** normalized nodes/edges — **complete**; hardcoded sample graph —
**superseded** by parser-backed samples using the normalized model; journey path
state — **complete**; focused card — **complete**; rootward cards on the right —
**superseded** by the accepted left-side orientation; leafward fan on the left —
**superseded** by the accepted right-side orientation; card activation —
**complete**; Details/Inspect control — **complete** under the current `Inspect`
label; independent inspector state — **complete**; animation — **complete**.

**Acceptance:** prominent focused card — **complete**; children on the left —
**superseded**; rootward path on the right — **superseded**; card centring —
**complete**; Inspect without centring — **complete**; non-centred inspection —
**complete**; Center this node — **complete**; smooth focus transition —
**complete**, including reduced-motion handling.

### Spiral 2 — Drag gesture prototype

**Build:** horizontal drag detection — **complete**; vertical branch selection —
**complete**; drag preview — **complete**; release threshold — **complete**;
cancel behaviour — **complete**; rootward journey drag — **complete**; selected
target feedback — **complete**.

**Acceptance:** left/up, left/centre, and left/down leafward selection —
**complete**; rightward rootward movement — **complete**; below-threshold
non-navigation — **complete**; preview — **complete**; Escape/right-click
cancellation — **complete**; click navigation retained — **complete**.

### Spiral 3 — Focused card and inspector detail

**Build:** node-specific presentations — **complete**; focused summaries —
**complete**; child summaries — **complete**; attribute summaries — **complete**;
documentation/comment indicators — **complete**; inspector sections —
**complete**; source placeholder — **superseded** by escaped retained source.

**Acceptance:** focused name/kind/content/count/relationship/documentation
orientation — **complete** through applicable truthful presentations; complete
node details — **complete**; children — **complete**; attributes — **complete**;
incoming/used-by relationships — **complete**; inspection without journey
change — **complete**.

### Spiral 4 — Basic DTD parser

**Build:** ELEMENT, ATTLIST, content models, names, sequences, choices,
occurrence, PCDATA, and comments — **complete**. Current DTD support extends to
entities, notations, conditional sections, processing instructions, source
ownership, and Xerces-authoritative validation.

**Acceptance:** open DTD — **complete**; navigation listing — **complete**;
carousel entry — **complete**; leafward content-model relationships —
**complete**; attributes — **complete**; occurrence — **complete**; comments
preserved — **complete**; preceding-comment attachment — **complete**;
schema-level unattached comments — **complete**.

### Spiral 5 — XSD parser MVP

**Build:** schema, elements, complex/simple types, sequence/choice/all,
attributes, restrictions/extensions/enumerations, type/ref/base, and occurrence
— **complete**. The current XSD 1.0 presentation contract is substantially
broader and Xerces is the validity authority.

**Acceptance:** open XSD — **complete**; global elements and named types in
Navigation — **complete**; element relationships — **complete**; type
references — **complete**; enumerations — **complete**; occurrence —
**complete**; derivation relationships — **complete**.

### Spiral 6 — XSD documentation and appinfo

**Build:** annotation, documentation, appinfo, ownership attachment, text/raw
XML retention, card excerpts, inspector sections, and search indexing — all
**complete**.

**Acceptance:** relevant card excerpts — **complete**; full inspector content —
**complete**; separate appinfo — **complete**; `xml:lang` — **complete**;
`source` — **complete**; raw escaped XML — **complete**; no unsafe `innerHTML` —
**complete**.

### Spiral 7 — Search and teleportation

**Build:** search names, documentation, comments, types, attributes, grouped
results, Centre, Inspect, and journey reconstruction — all **complete**.

**Acceptance:** name and documentation/comment queries — **complete**; result
kind/source identity — **complete**; Centre — **complete**; Inspect without
centring — **complete**; moderate-schema responsiveness — **complete**, with
worker-prepared indexing, a 100-result UI bound, and large-index debounce.

### Spiral 8 — ZIP and multi-file schema sets

**Build:** JSZip import, mixed DTD/XSD discovery, merged project indexing,
source ownership, project-local reference resolution, and schema-set outline —
all **complete**.

**Acceptance:** open ZIP — **complete**; discover supported members —
**complete**; source identity — **complete**; grouped Navigation — **complete**;
inspector source — **complete**; same-package XSD relationships — **complete**;
“unresolved references are visible but nonfatal” — **superseded** where a
required missing dependency must fail under the authoritative controlled
project boundary; nonfatal package inventory and eligible unresolved-reference
presentations remain available where semantically valid.

### Spiral 9 — Large schema usability

**Build:** bounded branch windows — **complete**; hidden-count/range indicators
— **complete**; branch window controls — **complete**; inspector filtering —
**complete**; worker parsing — **complete**; progress/cancellation — **complete**;
large fixtures and tests — **complete**.

**Acceptance:** bounded/readable branch fan — **complete**; sibling navigation
and filtering — **complete**; substantial parsing off the main thread —
**complete**; progress — **complete**; “large schemas remain usable” —
**partially complete** because 10,000-node evidence is strong but capacity is
device-, density-, memory-, cloning-, and format-dependent rather than universal.

### Spiral 10 — Source view and developer utility

**Build:** preserve snippets — **complete**; show declarations — **complete**;
copy node summary — **not implemented**; copy source snippet — **not
implemented**; source line numbers where available — **partially complete**
because line/column ranges are retained but ordinary inspected-source UI does
not expose them; highlight referenced names in snippets — **not implemented**.

**Acceptance:** raw source in inspector — **complete**; copy source — **not
implemented**; source file and approximate location — **partially complete**;
safe escaped display — **complete**.

This is the clearest unfinished original product slice. It can be completed
without turning the application into an editor.

### Spiral 11 — Accessibility and keyboard navigation

**Build:** keyboard focus states — **complete**; spatial left/right navigation —
**complete** under current visual orientation; up/down branch movement —
**complete**; Enter/card activation — **complete**; dedicated `I`/`D` shortcut —
**not implemented**, while native keyboard access to every Inspect button is
**complete**; Escape cancellation/closure — **complete**; focus rings —
**complete**; user setting for reduced motion — **superseded** by the system
`prefers-reduced-motion` contract.

**Acceptance:** core keyboard navigation — **complete**; keyboard inspection —
**complete**; visible focus — **complete**; reduced-motion operation —
**complete**; accessible labels — **complete**.

### Spiral 12 — Polish, packaging, and first public alpha

**Build:** Welcome/Help — **complete**; samples — **complete**; invalid-file
reporting — **complete** and expanded to full retained Problems; project reset —
**complete** through sample/session replacement rather than a destructive reset;
portable static build — **complete**; README — **complete**; architecture —
**complete**; known limitations — **complete**.

**Acceptance:** clean build — **complete**; run/build documentation —
**complete**; sample DTD/XSD — **complete**; ZIP — **complete**; no backend —
**complete**; limitations documented — **complete**; alpha usable for feedback —
**complete**, published as revision `0.1.0`.

## 5. Post-alpha sequence reconciliation

The revised sequence is exhausted:

| Sequence item | Completed evidence | Disposition |
| --- | --- | --- |
| Xerces-C++ WebAssembly feasibility and architecture | Task 13.2 feasibility report, pinned adapter/toolchain, browser and resolver evidence | complete |
| Authoritative standards-validation boundary | Tasks 13.3 and 13.7–13.9; production Xerces runtime, diagnostics, lifecycle, adversarial, W3C, comparison, and Hermetic gates | complete |
| Tolerant visualization extraction | Task 13.4 and Tasks 13.10–13.19; classified findings and 221/221 complete supported presentation | complete |
| Complete problem-report modal | Task 13.5; shared accessible complete-report dialog and banner opener | complete |
| Persistent Problems access | Task 13.6; retained `Problems (N)` control and tested report lifecycle | complete |
| Desktop semantic zoom | Tasks 14.1–14.5; Full/Compact/Overview, UX hardening, acceptance audit, and exact-SHA hosted-CI correction | complete |

Tasks 13.1–13.17 completed diagnostic retention, Xerces integration,
tolerance, Problems, complete visualization, package, annotation, and
release-gap work. Tasks 13.18–13.19 locked deterministic acceptance and
release-facing standards/licensing boundaries. Tasks 14.1–14.5 completed
desktop semantic zoom. Corrective merge `b0e20bc9326fbb57db07018946b38ee84b2b1086`
closed its hosted-CI setup issue. No listed revised-sequence item remains.

## 6. Known-limitations classification

| Section or separable boundary | Primary classification | Evidence, value, and recommended action |
| --- | --- | --- |
| Standards scope: XSD 1.0 and no XML-instance product input | stable intentional boundary | Xerces and conformance evidence are explicit. Preserve unless Ben makes a separate standards-product decision. |
| Supplied-files-only resolution | stable intentional boundary | Local-only deterministic resolution prevents network, drive, and path escape. Preserve; do not weaken for feature count. |
| Presentation routes | stable intentional boundary | Navigation/Search/inspector/source/package routes are 221/221 complete. Do not force every construct into a carousel card. |
| Read-only presentation | candidate future feature | Editing/export is absent but would change product identity and risk. Keep as a decision question, not an inferred gap. |
| ZIP and resource limits | stable intentional boundary | Limits are tested security/resource controls. Revisit only with measured evidence and an explicit safety review. |
| Capacity | candidate performance task | 10,000-node and bounded-DOM evidence is strong, but XSD import cost is material and universal capacity is unproved. Profile before changing limits. |
| In-memory-only projects | candidate future feature | Reload loses the project. Persistence/reopening has user value but requires storage, permission, privacy, and browser-support decisions. |
| Browser and accessibility evidence | candidate evidence task | Chrome/Firefox automation is strong; Safari, physical devices, manual screen readers, and native page zoom remain unclaimed. Tie any evidence milestone to a release goal. |
| Deployment and privacy | stable intentional boundary | Static, local-first, no backend/telemetry/retrieval is core architecture. Preserve. |
| Repository-history licensing status | candidate documentation update | The historical closure is stable. Future release docs should preserve the concise boundary without reopening or accessing non-public material. |

## 7. Source-marker findings

The tracked search excluded the dependency lockfile and counted textual
matches. Terms overlap, so counts are search occurrences rather than unique
defects.

| Marker | Count | Exhaustive classification |
| --- | ---: | --- |
| `TODO` / `FIXME` | 0 / 0 | No actionable engineering markers. |
| `HACK` | 1 | False positive: style guide rejection of “hacker” styling. |
| `XXX` | 7 | Standards-fixture payload text, not comments or debt. |
| `placeholder` | 43 | Visualization result vocabulary and zero-placeholder assertions; HTML input placeholders; an inspector layout class; historical prototype wording. No unfinished production placeholder was found. |
| `temporary` | 22 | Temporary directories and transient motion/worker audit state with cleanup assertions; no temporary product architecture. |
| `later` | 60 | Test chronology, fixture prose, licence text, and legacy diagnostic wording. Two XSD diagnostic messages say “later task”; their constructs now have complete supported routes or explicit cross-file deferral, making the wording documentation/message debt rather than proof of missing presentation. |
| `future` | 259 | 221 committed visualization-matrix ownership fields plus tests, scripts, licences, and planning prose. The 221/221 gate, not the field label alone, determines current completeness. |
| `not implemented` | 1 | Development-plan requirement that a valid DTD must not be limited merely because presentation was not implemented; not a current defect statement. |
| `unsupported` / `not supported` | 282 / 11 | Explicit standards, extension, archive, MIME, parser-diagnostic, and security classifications with tests. These are primarily deliberate boundaries, not hidden TODOs. |
| `deferred` | 173 | Mostly typed XSD parse/build and package-resolution intermediate states; package resolution consumes eligible deferrals. One planning occurrence is historical. This is implementation vocabulary, not 173 roadmap items. |

No release-blocking defect marker was found. The stale “later task” diagnostic
wording is low-priority documentation/message debt and must not be “fixed” in
this audit.

## 8. Open-issue findings

The public GitHub repository returned `[]` for open issues at audit start.
There is therefore no issue-backed next milestone and no existing public issue
whose priority can be inferred. Roadmap approval should be followed by creating
bounded issues or equivalent tracking records rather than letting the roadmap
and backlog diverge.

## 9. Standards and visualization findings

- Xerces-C++ 3.3.0 is the sole XML 1.0 standalone-DTD and XSD 1.0 authority
  within the controlled project architecture.
- The supported presentation gate is 221/221 complete: 52 node kinds, 52 edge
  kinds, five package-entry kinds, and no partial, misleading,
  retained-unreachable, or source-only applicable row.
- Unsupported-valid, instance-dependent, optional, metadata-disputed, and
  security-blocked outcomes remain explicit. They are not disguised defects.
- Package resolution is deterministic, project-local, path-safe, and complete
  for supplied files. Remote retrieval, drive crawling, arbitrary `file:`
  access, and ambiguous basename fallback are security boundaries.
- Diagnostics and Problems distinguish standards, project resolution,
  security/resource, visualization, and internal categories.
- XSD 1.1 and XML-instance product validation require product/standards
  decisions; repository evidence does not authorize them.

No remaining supported-presentation implementation gap was found.

## 10. Workflow and product findings

| Workflow | Current result | Remaining friction or boundary |
| --- | --- | --- |
| Open DTD / XSD / ZIP | complete | Supplied-files-only dependency boundary is intentional. |
| Navigate | complete | Bounded journey, pointer, touch, card, side-window, and spatial-keyboard routes exist. |
| Search | complete | Global grouped search is bounded and indexed; inspector already filters current children/declarations. |
| Inspect | complete | Independent target, Center this node, long-list filtering, metadata, source, and relationships exist. |
| View source | partially complete | Safe exact fragments exist, but ordinary source UI lacks copy actions and visible source range. |
| Review Problems | complete | Complete dialog and persistent report access exist. |
| Change semantic zoom | complete | Desktop Full/Compact/Overview is accepted and non-persistent by design. |
| Replace project | complete | Atomic replacement and failure/cancellation preservation are tested. |
| Help and samples | complete | Parser-backed DTD/XSD samples and welcome preference are tested. |

Meaningful missing utilities are copying a node summary and exact source
fragment, with visible source location. Project reopening, session history,
comparison, and editing are larger product proposals, not accidental omissions.
Documentation/appinfo already has truthful Search/inspector/source routes; making
it navigable as ordinary containment could misstate schema semantics.

## 11. Accessibility and platform findings

Production contracts cover native semantics, focus restoration, keyboard-only
navigation, forced-colour patterns, reduced motion, touch-capable controls,
responsive reflow, and magnification-equivalent layouts. Controlled production
evidence covers Chrome and Firefox.

The following are **evidence-only gaps**, not observed production defects:

- Safari/WebKit execution;
- physical Samsung or other device testing;
- manual Narrator or another screen-reader/browser session;
- browser-native page zoom rather than CSS viewport equivalence; and
- a physical large touch display.

These should become a milestone only when Ben names a release/browser support
goal and can supply the needed environment and human assessment.

## 12. Performance and capacity findings

Proven capacity includes direct 10,000-node DTD/XSD imports, 40,000-node
cancellation/search/windowing regressions, a deterministic 20-by-1,000 XSD ZIP,
bounded carousel/outline/inspector/search presentation, worker termination, and
Chrome lifecycle memory evidence. Compact/Overview geometry remains proportional
to the visible window rather than total schema size.

Material observations:

- controlled-browser 10,000-node XSD import took approximately 17–19 seconds;
- exact-SHA hosted CI later took 69.787 seconds for the isolated 10,000-node XSD
  test, compared with 440 ms for DTD;
- activation still incurs structured-clone, validation, index adoption, and
  first-presentation work on the main thread; and
- Firefox heap/worker-target instrumentation and universal device capacity are
  unproved.

No measured memory leak or release-blocking capacity defect exists. Before
raising any resource limit, a performance milestone should profile parse,
extraction, clone, index, activation, and render phases independently. The
current archive, path, dependency, diagnostic, and worker-lifetime limits are
intentional safety boundaries.

## 13. Documentation, release, and process findings

| Finding | Primary disposition | Recommended action |
| --- | --- | --- |
| No post-semantic-zoom roadmap | release/process debt | Resolved for review by the companion working roadmap; establish approval and issue-creation gates. |
| Empty public issue backlog | release/process debt | After roadmap approval, create bounded tracking items; do not infer approval from this audit. |
| First-alpha checklist remains entirely unchecked and future-oriented | documentation debt | Preserve it as historical first-alpha procedure; later create a version-neutral next-release checklist in a separate task. |
| Semantic-zoom audit says final hosted closure is pending | documentation debt | Record as stale post-integration status; update only in a separate approved documentation closure if desired. |
| Release report has historical pre-semantic-zoom totals | obsolete/superseded | Keep as historical release evidence; do not rewrite it into a current validation report. |
| Development plan says “post-1.0” while revision is `0.1.0` | documentation debt | Treat its current-state addendum and implemented app as authority; do not edit the protected plan here. |
| README, architecture, standards support, and known limitations | complete | Current core boundaries agree: static, local-first, read-only, XSD 1.0, controlled supplied files. |
| Hosted CI runtime and large XSD cost | release/process debt | Monitor reliability and consider the ranked performance milestone; do not weaken direct coverage. |

## 14. Candidate scoring

Scores are 1–5. Higher is better. Technical risk and implementation size are
reverse-scored: 5 means low risk or small size. Weights are intentionally
coarse:

| Dimension | Weight |
| --- | ---: |
| User value | 25% |
| Strategic fit | 20% |
| Technical risk, reverse-scored | 15% |
| Implementation size, reverse-scored | 10% |
| Testability | 10% |
| Independence from unresolved product decisions | 10% |
| Release-readiness benefit | 10% |

| Rank | Candidate | Primary disposition | UV | Fit | Risk | Size | Test | Independent | Release | Weighted total | Estimated tasks |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | Developer handoff utilities | partially complete | 4 | 5 | 5 | 4 | 5 | 5 | 4 | 4.55 | 4 |
| 2 | Large-project performance and capacity hardening | new proposal | 5 | 5 | 3 | 3 | 5 | 5 | 5 | 4.50 | 5 |
| 3 | Accessibility and platform evidence | evidence-only gap | 3 | 4 | 5 | 4 | 3 | 2 | 5 | 3.70 | 3 |
| 4 | In-memory project/session history | new proposal | 4 | 4 | 3 | 3 | 4 | 4 | 3 | 3.65 | 4 |
| 5 | Persistent local project reopening | new proposal | 5 | 4 | 2 | 2 | 3 | 1 | 4 | 3.35 | 5 |
| 6 | Schema comparison workflow | new proposal | 5 | 3 | 1 | 1 | 4 | 1 | 3 | 2.90 | 6+ |

The 0.05 difference between the first two candidates is not meaningful
precision. Developer handoff wins the qualitative tie because it closes the
only clear partially completed original spiral, is independently testable, and
does not require a storage, standards, or product-identity decision.

### Candidate dossiers

#### Developer handoff utilities

- **Evidence:** source fragments and ranges exist; no clipboard/copy action is
  present; Spiral 10 explicitly planned copy summary and source.
- **User value:** move trustworthy schema context into an editor, issue, review,
  or conversation without manual retyping.
- **Scope:** visible source location, copy exact source fragment, and copy a
  deterministic node summary.
- **Risk:** low; clipboard permission/failure and accessible confirmation need
  deliberate handling.
- **Dependencies:** existing inspector/source presentation and active-project
  metadata.
- **Recommended action:** recommend as the next milestone, awaiting Ben’s
  approval; keep editing, saving, and path export out of scope.

#### Large-project performance and capacity hardening

- **Evidence:** strong bounded UI, but 10,000-node XSD cost is 17–19 seconds in
  controlled browsers and 69.787 seconds in hosted CI.
- **User value:** faster first useful view and more predictable large-package
  operation.
- **Scope:** measurement first, then targeted parse/extract/clone/index/activate
  work without raising safety limits by default.
- **Risk:** medium; optimizations can alter parser/extractor ownership and memory.
- **Dependencies:** stable profiling harness and representative DTD/XSD/ZIP
  corpora.
- **Recommended action:** first alternative; begin after handoff utilities or
  sooner if Ben prioritizes large-schema latency.

#### Accessibility and platform evidence

- **Evidence:** Safari, physical devices, manual screen readers, and native page
  zoom are unclaimed.
- **User value:** defensible support claims and earlier discovery of platform
  interoperability defects.
- **Scope:** evidence and only separately scoped corrections if findings arise.
- **Risk:** low technically, but dependent on hardware, browser, and human QA.
- **Dependencies:** Ben’s target platform/release criteria.
- **Recommended action:** evidence-only later milestone tied to a release goal.

#### In-memory project/session history

- **Evidence:** replacement is atomic but only the active project is retained.
- **User value:** recover recent work within the current page without reopening
  files.
- **Scope:** bounded in-memory history with explicit memory policy.
- **Risk:** medium due to large graph retention and stale-state semantics.
- **Dependencies:** memory budget and UX decision.
- **Recommended action:** defer pending approval; consider before persistent
  reopening because it avoids storage permissions.

#### Persistent local project reopening

- **Evidence:** reload restores the sample; only Welcome preference persists.
- **User value:** resume work without repeatedly selecting project files.
- **Scope:** metadata-only recent list or browser-held file/content persistence;
  those choices have different privacy and compatibility profiles.
- **Risk:** high relative to current architecture.
- **Dependencies:** explicit privacy, storage, permission, browser-support, and
  retention decisions.
- **Recommended action:** defer for Ben’s product decision and a threat-model
  review.

#### Schema comparison workflow

- **Evidence:** no compare/diff model or UI exists.
- **User value:** understand changes between schema revisions.
- **Scope:** matching, semantic diff model, dual-project ownership, navigation,
  presentation, and export decisions.
- **Risk:** high and product-shaping.
- **Dependencies:** identity/matching semantics and desired output format.
- **Recommended action:** later proposal only after explicit approval.

## 15. Rejected and deferred candidates

| Candidate | Primary disposition | Evidence | User value | Scope / risk / dependencies | Recommended action |
| --- | --- | --- | --- | --- | --- |
| XSD 1.1 | standards boundary | Xerces/product contract is XSD 1.0 | Useful to an unknown subset | Large validator, extraction, corpus, and documentation expansion; requires Ben’s standard decision | Do not schedule by inference. |
| XML instance-document validation | deliberate product boundary | Instances are conformance inputs, not product inputs | Different validation use case | New workflow and result model; product decision required | Keep out of current roadmap. |
| Remote schema/catalog retrieval | security boundary | Local supplied-files-only resolver is intentional | Convenience for networked projects | Privacy, SSRF-like retrieval policy, reproducibility, cache, offline behavior | Reject absent a separate security design. |
| Filesystem crawling or arbitrary `file:` access | security boundary | Explicitly blocked and tested | Convenience only | Breaks local controlled-project boundary and browser portability | Reject. |
| Schema editing and round-trip save/export | deliberate product boundary | Current product is read-only and source-preserving, not an editor | Potentially high for a different product | Fidelity, mutation, validation, undo, save permissions, data-loss risk | Defer to explicit product decision. |
| Documentation/appinfo as ordinary navigable containment | deliberate product boundary | Already complete through Search, inspector, source, and applicable cards | Limited | Could falsely imply structural containment | Retain truthful existing routes unless Ben requests a distinct non-containment navigation design. |
| Search within current children | complete | Inspector already filters child structures and declarations; global Search is indexed | Existing value delivered | No demonstrated gap | Do not duplicate. |
| Browser-chrome zoom telemetry in app | deliberate product boundary | Native zoom input is intentionally not captured | Little product value | Browser privacy/platform restrictions | Use manual evidence, not telemetry. |

## 16. Recommended next milestone

### Audit recommendation

The original audit recommendation was **Developer handoff utilities**, awaiting
Ben’s approval. That recommendation followed the evidence and scores above; the
later decision does not change the original scoring exercise.

- **Problem statement:** XML Carousel can reveal exact, trustworthy schema
  context but makes users manually select or retype it when moving that context
  into their development workflow.
- **User benefit:** one deliberate action copies an exact source fragment or a
  concise node summary with source identity and location.
- **Why now:** it closes the clearest partial original spiral, builds on mature
  inspector/source data, and avoids unresolved persistence or standards choices.
- **Fit:** it strengthens XML Carousel as a read-only explorer rather than
  changing it into an editor.
- **Non-goals:** editing, round-trip saving, whole-project export, remote
  retrieval, persistent project storage, analytics, and navigation-path file
  formats.
- **Architecture impact:** a small pure presentation/serialization layer and a
  UI clipboard boundary; no schema-model, parser, resolver, worker, or backend
  change should be required.
- **Risk:** clipboard availability, permission denial, deterministic text,
  accessibility announcements, and accidental inclusion of misleading or
  excessive content.
- **Dependencies:** existing inspector, source ranges, source file identity,
  and safe text presentation.
- **Manual QA:** keyboard-only use, screen-reader announcement sanity,
  permission-denied fallback, DTD/XSD/ZIP source identity, long names, and
  compact layouts.
- **Release implications:** suitable for a later feature release, potentially
  `0.2.0`, only after Ben chooses version/release intent; it does not require a
  backend or deployment change.

### Ben’s approved development-plan decision

Ben’s authoritative development-plan update approves exactly one next
milestone, **Developer Handoff Utilities**, dated 2026-08-06. The approved cycle
is ordered as follows:

1. **Task 15.2 — Visible Source Identity, Location, and Source Modal Foundation**
2. **Task 15.3 — Safe Copy-Source Action**
3. **Task 15.4 — Deterministic Copy-Node-Summary Action**
4. **Task 15.5 — Developer Handoff Utilities Stabilization and Acceptance**

The dedicated source-view modal is Ben’s approved refinement of the milestone,
not a finding produced by the original scoring exercise. It must be a large,
readable, safely escaped, retained-source surface with truthful source identity
and location states, accessible dialog behavior, independent source-view state,
and no mutation of the carousel journey, inspector target, Search state, active
project, or semantic zoom. It must not fabricate line or column values or
present reconstructed model markup as original source.

### Future implementation work

Approval establishes the milestone and task boundaries; it does not state that
Task 15.2 or any later task has started or completed. Future implementation must
retain the application’s static, local-first, read-only and supplied-files-only
boundaries. Clipboard writes require explicit user action; Copy source uses
retained source, while Copy node summary produces deterministic plain text. No
version, release, deployment, parser, resolver, schema-model, or backend change
is authorized by this decision.

## 17. Alternative milestones

1. **Large-project performance and capacity hardening:** the strongest
   alternative and effectively tied in score. Prefer it first if large-XSD
   latency is Ben’s primary concern.
2. **Accessibility and platform evidence:** high release-readiness value when
   Safari, native zoom, screen-reader, or physical-device support becomes an
   explicit target.
3. **In-memory session history:** useful continuity without persistent storage,
   but requires a memory budget and interaction design.
4. **Persistent reopening or schema comparison:** later product proposals after
   the unresolved decisions below are answered.

## 18. Unresolved product decisions

Repository evidence cannot answer these for Ben:

1. Should XML Carousel reopen recent local projects, and if so may it persist
   bytes, file handles, metadata only, or nothing without a fresh user choice?
2. Should the product remain read-only, or eventually support schema editing and
   export?
3. Should XSD 1.0 remain the standards boundary, or is XSD 1.1 a product goal?
4. Is Safari/WebKit support a release requirement?
5. Is manual Narrator or other screen-reader certification/evidence required
   for the next release?
6. Should documentation/appinfo gain an optional non-containment navigation
   route beyond its current Search/inspector/source presentation?
7. Is project comparison/diff a desired core workflow?
8. Should the next approved feature target a `0.2.0` release, or continue as
   unreleased development?
9. Should large-schema latency outrank the developer handoff recommendation?
10. Does Ben want an `I`/`D` inspector shortcut, given that native keyboard
    access already works?

## 19. Conclusion

Revision `0.1.0`, Tasks 13.1–13.19, and Tasks 14.1–14.5 form a complete current
baseline. The revised enhancement sequence is exhausted and semantic-zoom
acceptance is closed. No release-blocking product defect was found.

The audit recommended a bounded next step without inventing a new product:
finish the partial developer-utility slice with visible source location and
safe copy actions. Ben subsequently approved that milestone and refined Task
15.2 to include the dedicated source-view modal; implementation has not started.
Large-project performance remains the close unapproved alternative;
accessibility/platform work remains evidence-only; standards, retrieval, and
editing boundaries remain decisions or non-goals rather than defects.
