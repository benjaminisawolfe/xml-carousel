# XML Carousel 0.1.0 — First Public Alpha

> Historical pre-Task-13.x release note. Current validation, visualization,
> resolver, security, browser, and licensing claims are maintained in
> [Standards support](standards-support.md),
> [Known limitations](known-limitations.md), and
> [Third-party licensing](third-party-licensing.md).

Version 0.1.0 is XML Carousel's first public alpha. Its planned publication
identifier is the annotated tag `v0.1.0`; that tag and the corresponding GitHub
Release will be created only after explicit publication authorization.

This alpha is intended for early testers who work with schema definitions and
can help evaluate whether relationship journeys make unfamiliar structures
easier to understand.

## What is included

- Local DTD, XSD, and ZIP package opening
- A normalized, searchable schema project built from supported declarations
- A carousel journey for following structural relationships
- Independent inspection of declarations, attributes, documentation,
  enumerations, derivations, comments, source excerpts, and unresolved package
  references where applicable
- Worker-based parsing, progress, cancellation, and guarded project activation
- Bounded presentation and committed 10,000/40,000-declaration QA fixtures for
  large-schema testing
- Pointer, touch, spatial keyboard, reduced-motion, desktop, and compact-layout
  support
- Built-in Book DTD and Library XSD samples with an integrated Help dialog

## Inputs and privacy

The candidate accepts `.dtd`, `.xsd`, and `.zip` files. Selected files are
processed in the browser and are not uploaded to an XML Carousel backend. The
application is a static site and requires no backend, although a hosted copy
still makes ordinary network requests for its own site assets.

## Testing status

The final automated release-candidate validation passed:

- 121 test files and 1,799 tests;
- zero Svelte/TypeScript check errors or warnings;
- lint, formatting, and whitespace checks;
- 271 transformed modules; and
- one `assets/schemaImportWorker-ll5tt6Dr.js` worker asset of 246,258 bytes.

Revision 0.1.0 has one portable relative-base artifact. The contents of
`dist/` may be placed in any directory served by a static web server, and the
same unchanged files can run from a domain root or nested directory. The
portable distribution was successfully uploaded and loaded at the canonical
public URL, <https://xmlcarousel.wolfshafenpress.com/>.

The release review also covers browser smoke tests, committed large-schema
fixtures, and compact target sizing. Environment-limited accessibility checks
that remain honest coverage limitations are identified in the
[release-candidate report](release-candidate-report.md).

This is not a claim of complete DTD or XSD conformance. Read
[Known limitations](known-limitations.md) before choosing test material.

## Useful feedback

Alpha feedback is most useful when it describes:

- which schema relationship you expected to follow and what was unclear;
- whether Search, the journey, or Inspect best supported the task;
- unsupported DTD/XSD constructs encountered in real files;
- package references that resolved unexpectedly or remained unresolved;
- import responsiveness and cancellation on large inputs;
- keyboard, screen-reader, zoom, compact-layout, or reduced-motion behavior;
- terminology, documentation, and privacy wording that could be clearer.
