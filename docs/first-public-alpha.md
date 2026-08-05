# XML Carousel 0.1.0 — First Public Alpha

- Release date: pending publication
- Planned annotated tag: `v0.1.0`
- GitHub Release: not yet created
- Current candidate deployment: not yet performed

XML Carousel 0.1.0 is a first public alpha candidate for early testing. The
tag, GitHub Release, and deployment remain separate publication actions that
require Ben's explicit authorization.

## What XML Carousel does

XML Carousel is a local-first static browser application for exploring DTD,
XML Schema 1.0, and ZIP schema packages. It turns a schema project into a
connected set of cards. Following a relationship advances or revisits the
carousel journey; **Inspect** opens related detail independently without
changing that journey.

The alpha provides:

- standalone DTD and XSD opening;
- ZIP and multi-file projects with preserved relative paths;
- Navigation, grouped Search, carousel focus, independent inspection, escaped
  source view, and complete package inventory routes;
- worker-based import progress and cancellation with stale-result protection;
- bounded presentation for compact viewports and large schemas; and
- pointer, touch, spatial keyboard, responsive, and reduced-motion contracts.

Apache Xerces-C++ 3.3.0 compiled to WebAssembly is the authoritative XML 1.0,
DTD, and XML Schema 1.0 validator. After Xerces accepts input, XML Carousel's
TypeScript layers extract source-preserving structures into a normalized
project and present every supported contract through an appropriate interface.
Those extraction and presentation layers are not a second standards validator.
XSD 1.1 and universal support for every XML-related standard are not claimed.

## Multi-file resolution, privacy, and security

Dependencies resolve only from files explicitly supplied inside the controlled
project. A ZIP should preserve project-relative paths. Safe parent references
may normalize inside the virtual project root, but XML Carousel does not crawl
the host filesystem, use ambiguous basename fallback, retrieve remote schemas,
open arbitrary `file:` URLs, or allow references to escape the project root.

Selected schema content is processed locally in the browser and is not
uploaded to an XML Carousel backend. XML Carousel has no application backend,
account system, analytics, or telemetry endpoint. Loading a hosted copy still
causes ordinary requests to that host for the application's HTML, JavaScript,
CSS, WebAssembly, licence, and notice assets.

Project-authored material is dedicated under CC0. Third-party runtime
components and fixtures retain their own terms, and production builds include
the required notices and licence texts.

## Current candidate evidence

Automated preparation for the exact candidate source and deterministic
production bytes passed:

- 153 test files and 2,095 tests;
- zero Svelte/TypeScript errors or warnings;
- 221/221 complete supported-visualization contracts;
- 1,912 DTD full-suite passes and 0 fails;
- 171 XSD full-suite passes and 0 fails; and
- 92 Xerces-J comparison cases with 0 unexpected disagreements.

Fresh controlled runs against the exact candidate build passed in Chrome
151.0.7922.72 and Firefox 153.0.1. They covered root and nested serving,
responsive containment, reduced-motion configuration, DTD/XSD/ZIP import,
cancellation and recovery, repeated Hermetic Foundry imports, request
boundaries, and worker cleanup. No inherited browser evidence is used for this
candidate.

The same verified relative-base files can be placed in any directory served by
a static web server and work at a domain root or nested path. They have not yet
been copied to or verified at the intended canonical public site.

## Alpha warning and pending QA

This is an alpha candidate, not a stability or universal-conformance promise.
Manual release-candidate QA remains pending for functional smoke flows, large
schemas, responsive layouts, keyboard-only use, browser-chrome zoom, reduced
motion, a screen-reader/browser pairing, and a physical mobile device if
available.

This candidate does not claim Safari/WebKit coverage, physical Samsung-device
testing, manual screen-reader hardware testing, Firefox heap telemetry,
browser-chrome zoom results, FTP deployment, or canonical-site validation.

Review [Standards support](standards-support.md),
[Known limitations](known-limitations.md), the detailed
[release-candidate report](release-candidate-report.md), and
[Third-party licensing](third-party-licensing.md) before testing unfamiliar
schemas.

## Useful feedback

Alpha feedback is most useful when it records the exact input and environment
and explains:

- which relationship or declaration was difficult to find or understand;
- whether Search, the journey, or Inspect best supported the task;
- which supported or unsupported DTD/XSD construct was encountered;
- whether project-local dependencies resolved as expected;
- import responsiveness and cancellation behavior for large inputs;
- keyboard, screen-reader, zoom, compact-layout, or reduced-motion behavior;
  and
- any console error, unexpected network request, privacy concern, or unclear
  terminology.
