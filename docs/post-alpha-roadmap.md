# XML Carousel post-alpha roadmap

## Status legend

- **Approved next work:** the single Developer Handoff Utilities milestone
  recorded in the authoritative development plan.
- **Recommended, awaiting Ben’s approval:** an audit recommendation that has not
  yet received an explicit decision.
- **Deferred:** viable later work that is not authorized.
- **Non-goal:** outside the current product or safety boundary.
- **Evidence-only:** validation of an existing behavior or support claim, not a
  presumed feature implementation.

This roadmap follows the authoritative development plan. Ben approved the next
milestone on 2026-08-06, but this planning record does not state that Task 15.2
has started or authorize any release action.

## Current completed baseline

- Revision `0.1.0` is the published first public alpha.
- Tasks 13.1–13.19 completed normalized diagnostics, the Xerces-C++ 3.3.0
  WebAssembly authority, tolerant extraction, complete Problems access,
  controlled project resolution, conformance/security/lifecycle hardening,
  complete supported visualization, and release-boundary documentation.
- The supported visualization matrix is 221/221 complete.
- Tasks 14.1–14.5 completed Full, Compact, and Overview desktop semantic zoom,
  transition/accessibility hardening, and final acceptance.
- The Task 14.5 hosted-CI setup correction is integrated at baseline commit
  `b0e20bc9326fbb57db07018946b38ee84b2b1086`, tree
  `433c9e945f9043b096db3087c06115197990b23b`.
- Semantic-zoom milestone acceptance is closed.
- The application remains static, local-first, read-only, backend-free, and
  limited to explicitly supplied DTD, XSD 1.0, and ZIP project files.

## Approved next milestone

### Developer handoff utilities

**Status:** approved in Ben’s development plan on 2026-08-06; implementation has
not started.

**Problem:** source fragments and normalized node context are trustworthy and
visible, but users cannot deliberately copy an exact fragment or a concise node
summary. Source ranges are retained but not ordinarily shown with the inspected
source.

**Visible outcome:** focused and inspected declarations show truthful source
identity/location where available. A deliberate View source action opens a
dedicated, substantially more readable source-view modal without changing the
journey, inspector target, Search state, active project, or semantic zoom. The
modal offers a keyboard-accessible action to copy retained source, and node
detail surfaces offer a separate action to copy a deterministic plain-text node
summary. Success and failure are announced without changing navigation or
inspection.

**Why this milestone:** it completes the partial original developer-utility
spiral, has high value and low architectural risk, and strengthens the existing
read-only explorer rather than introducing storage, editing, or a new standard.

**Architecture boundary:** add independent source-view state, pure
presentation/serialization helpers, and a small clipboard interaction boundary
in the UI. Reuse retained source, truthful location metadata, active-project
metadata, and existing presentation contracts. Do not reconstruct source from
schema nodes or change parsers, resolvers, the worker protocol, validation
authority, or project activation.

**Risks:** unavailable clipboard API, denied permissions, stale inspected state,
misleading summaries, very long source, duplicate announcements, and compact
layout pressure.

**Dependencies:** current inspector/source presentation, source file ownership,
normalized relationships, safe-text rendering, and existing focus/live-region
contracts.

**Manual-QA needs:** Chrome and Firefox; keyboard-only activation; one manual
screen-reader sanity pass if available; permission-denied behavior; DTD, XSD,
and ZIP source identity; long/unusual names; compact viewport; reduced motion;
and proof that copied text never changes project or journey state.

**Release implication:** this is feature work appropriate for a later feature
release. Whether it becomes `0.2.0` is an unresolved Ben decision. It does not
require deployment, hosting, backend, dependency, standards, or package-version
changes during implementation.

## Approved task sequence for the next milestone

The milestone and sequence are approved planning decisions. No task below is
described as started or complete, and implementation still requires separate
task instructions.

### Task 15.2 — Visible Source Identity, Location, and Source Modal Foundation

- **Implementation boundary:** expose truthful supplied filenames or
  package-relative paths and distinguish exact, approximate/declaration-level,
  and unavailable locations without fabricated coordinates. Introduce
  independent source-view state and reuse retained source without reparsing it
  in UI components.
- **Visible result:** a deliberate View source action opens a dedicated modal
  with a clear source identity, truthful location state, retained source, safe
  escaped rendering, preserved whitespace, and a large scrollable reading area.
  Opening or closing it does not change carousel focus, inspector target,
  navigation journey, Search state, active project, or semantic zoom.
- **Tests:** standalone DTD/XSD and multi-file ZIP ownership, exact and missing
  locations, package-relative and long paths, markup-like source, modal open and
  close, Escape, focus trap/restoration, project replacement, Search and
  inspector origins, responsive containment, 200% text scaling, forced colours,
  and no journey/inspection mutation.
- **Manual-QA focus:** source truthfulness, substantial readability improvement,
  faithful DTD/XSD/ZIP fragments, desktop and narrow layouts, and correct focus
  restoration.
- **Dependency:** existing retained source and source-location metadata.
- **Integration boundary:** source identity/location presentation and the
  dedicated modal foundation; no clipboard write, parser/model change, remote
  lookup, or filesystem lookup yet.

### Task 15.3 — Safe Copy-Source Action

- **Implementation boundary:** copy exactly the retained source fragment shown
  in the source modal through an injectable clipboard adapter; handle
  unsupported and rejected writes as visible non-destructive failures.
- **Visible result:** a named Copy source action with restrained success/failure
  status.
- **Tests:** exact bytes/text, multiple DTD fragments, XSD fragment, clipboard
  absence/rejection, rapid repeat, focus retention, no HTML execution, and no
  project/navigation mutation.
- **Manual-QA focus:** browser permission states, keyboard use, announcements,
  and pasting into a plain-text editor.
- **Dependency:** Task 15.2 source modal and presentation.
- **Integration boundary:** clipboard adapter and source modal only; no
  whole-file or project export.

### Task 15.4 — Deterministic Copy-Node-Summary Action

- **Implementation boundary:** create a pure plain-text summary from existing
  presentation data: name, kind, source identity/location, and a bounded set of
  applicable facts and relationships.
- **Visible result:** a separate Copy node summary action; it must not be
  confused with Copy source or Center this node.
- **Tests:** representative DTD/XSD/package node kinds, missing optional fields,
  repeated/shared relationships, long values, stable ordering, and bounded
  output.
- **Manual-QA focus:** usefulness when pasted into an issue/review, accessible
  naming, action distinction, and compact layout.
- **Dependency:** Task 15.2 formatting contracts; may reuse Task 15.3 clipboard
  adapter.
- **Integration boundary:** inspector/presentation only; no schema mutation,
  editing, or custom export format.

### Task 15.5 — Developer Handoff Utilities Stabilization and Acceptance

- **Implementation boundary:** integrate and audit the completed utilities
  across project replacement, Search Inspect, carousel Inspect, responsive
  layouts, and error boundaries.
- **Visible result:** stable copy utilities for DTD, XSD, and ZIP projects with
  no stale text or state leakage.
- **Tests:** milestone-level acceptance, canonical validation, production-build
  smoke, privacy/no-network assertions, and clipboard cleanup.
- **Manual-QA focus:** end-to-end workflows, reduced motion, keyboard, focus,
  browser permission failure, and optional manual screen-reader evidence.
- **Dependency:** Tasks 15.2–15.4.
- **Integration boundary:** acceptance and corrective stabilization only; any
  discovered production defect receives a separate bounded correction rather
  than scope expansion.

## Later candidate milestones

### Large-project performance and capacity hardening

**Status:** deferred; strongest alternative.

Profile 10,000-node DTD/XSD and large ZIP work by Xerces validation,
source-preserving extraction, structured clone, search-index construction,
activation, and first presentation. Optimize only measured bottlenecks. Preserve
direct large-import tests, current safety limits, worker cancellation, complete
visualization, and deterministic results. This candidate may move ahead of the
recommended milestone if Ben explicitly prioritizes large-XSD latency.

### Accessibility and platform evidence

**Status:** evidence-only and deferred until a support/release target exists.

Run Safari/WebKit, browser-native page zoom, physical-device/touch, and manual
screen-reader evidence with exact platform reporting. Evidence findings do not
automatically authorize production fixes; defects would receive separate
corrective tasks.

### In-memory project/session history

**Status:** deferred, awaiting product and memory-budget decisions.

Offer a bounded way to revisit recently active projects in the current page.
This is less invasive than persistence but can retain large graphs and requires
clear eviction, failure, navigation, and privacy behavior.

### Persistent local project reopening

**Status:** deferred, awaiting Ben’s explicit product decision.

Possible designs—metadata-only history, persisted bytes, or browser-held file
handles—have materially different privacy, permission, portability, and Safari
implications. No design is selected here.

### Schema comparison

**Status:** deferred, awaiting product definition.

Comparison needs matching semantics, dual-project ownership, a normalized diff
model, navigation/presentation choices, and an output decision. It is not a
small extension of the current one-active-project architecture.

## Dependencies and ordering

1. Ben’s development plan records Developer Handoff Utilities as the one
   approved next milestone.
2. Each approved implementation task receives separate bounded instructions
   before coding begins.
3. Approved Developer Handoff Utilities tasks proceed in order 15.2 → 15.3 →
   15.4 → 15.5 because the source modal, location, and clipboard contracts are
   shared foundations.
4. Performance work begins with measurement and may be reordered ahead only by
   explicit approval.
5. Evidence-only work requires target environments and acceptance criteria
   before scheduling.
6. Persistence, editing, XSD 1.1, and comparison require product decisions
   before architecture tasks.

## Explicit non-goals

- weakening supplied-files-only resolution, archive/path limits, or other
  security boundaries;
- remote schema retrieval, remote catalogs, filesystem crawling, arbitrary
  `file:` access, or a backend;
- claiming XSD 1.1 or XML-instance product support;
- schema editing, round-trip saving, or whole-project export within the approved
  milestone;
- persisting selected schema contents without an approved privacy/storage
  design;
- treating documentation/appinfo as structural containment merely to create
  more carousel cards;
- capturing or suppressing native browser zoom controls;
- deployment, tag, Release, hosting, FTP, DNS, or GitHub Pages changes; and
- accessing non-public historical material.

## Review gates

### Roadmap approval gate

Passed on 2026-08-06: Ben selected Developer Handoff Utilities and refined its
first task to include the dedicated source-view modal. Later candidate
milestones remain unapproved.

### Task-design gate

Every approved task must define visible result, implementation boundary,
focused tests, manual QA, dependency, and integration boundary before coding.

### Architecture and safety gate

Local-first operation, one authoritative Xerces boundary, normalized project
and journey/inspector separation, supplied-files-only resolution, safe text,
worker lifecycle, and portable static hosting remain non-negotiable unless Ben
explicitly opens a product/architecture decision.

### Acceptance gate

Each implementation task must pass focused tests and canonical validation.
UI-facing milestones require applicable browser, keyboard, responsive,
reduced-motion, and accessibility review. Direct large-schema coverage must not
be weakened to improve CI timing.

### Release gate

Feature completion does not itself authorize a version change, tag, Release,
deployment, or hosted-site update. Ben must separately choose whether approved
work forms `0.2.0`, another prerelease, or unreleased development.

## Product decisions required before later work

- local project reopening and permitted persistence material;
- continued read-only scope versus editing/export;
- XSD 1.0 versus XSD 1.1;
- Safari/WebKit as a release target;
- manual screen-reader evidence expectations;
- optional non-containment navigation for documentation/appinfo;
- project comparison/diff as a core workflow;
- in-memory project-history memory budget;
- priority of large-schema latency versus handoff utilities; and
- `0.2.0` versus continued unreleased development.
