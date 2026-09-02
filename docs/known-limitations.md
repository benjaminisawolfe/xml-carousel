# Known limitations

This document records current release boundaries. For supported behavior and
evidence, see [Standards support](standards-support.md).

## Standards scope

Apache Xerces-C++ is authoritative for XML 1.0, standalone DTD grammar
preparation, and XML Schema 1.0 validity within XML Carousel's controlled
project architecture. XSD 1.1 is not supported. XML instance documents are not
an XML Carousel product input, so instance-dependent DTD and XSD constraints
cannot be evaluated from a standalone grammar alone.

libxml2 RELAX NG 2.15.3 is authoritative for standalone and ZIP-supplied RELAX
NG XML `.rng` and Compact Syntax `.rnc` validity. Compact Syntax uses a
project-authored, in-memory front end. Task 17.9 measures it against all 90
pinned Compact Syntax translation cases and records exact reviewed differences
instead of silently filtering them. ZIP packages resolve local `include` and
`externalRef` targets only from safely supplied members of the same syntax
family, while missing and blocked references remain visible. Neither workflow
searches for or fetches dependencies, and there is no cross-syntax fallback.

The 221/221 complete-visualization result covers only the historical
DTD/XSD/ZIP presentation contracts. RELAX NG has a separate 77/77 matrix; the
two authorities are intentionally not combined or inflated. Neither matrix is
proof that every version or optional feature of every XML-related standard is
implemented.
Accepted test boundaries remain explicit: unsupported, instance-dependent,
optional accepted, optional reported, security-blocked, and metadata-disputed.

The Task 17.9 corpus currently records 40 expected product-boundary results and
two expected security-policy differences. Notable boundaries are seven
specification cases that libxml2 accepts more permissively than Jing, remaining
rare Compact Syntax escape/annotation translation forms, semantic-oracle
normalization gaps, and Validator.nu's unregistered custom WHATWG datatype
library. These are exact case-ID findings in
`tests/fixtures/relax-ng/conformance/expected-boundaries.json`; a new,
changed, or disappearing difference fails until the authority is reviewed.
There are zero `INVESTIGATE` and zero harness-error results.

## Supplied-files-only resolution

Dependencies resolve only from files explicitly supplied by the user. XML
Carousel does not crawl the host filesystem, inherit disk-folder siblings,
retrieve remote resources, use remote catalogs, open arbitrary `file:` URLs,
or use basename fallback between ambiguous paths.

For complete multi-file projects, supply a ZIP preserving relative paths. Safe
parent-directory references may normalize within the virtual project root;
absolute paths, schemes, encoded traversal, and traversal beyond the root are
blocked. Opening `foundry-common.xsd` alone fails when
`foundry-rich-text.xsd` was not supplied. That failure is intentional security
and reproducibility behavior.

## Presentation routes

Not every supported construct appears as a carousel card. Some constructs are
correctly Navigation-, Search-, inspector-, source-, or package-inventory-first.
An explicit `not-applicable` surface is complete when showing that construct on
the surface would falsely imply containment or another relationship.

The application is read-only. It does not edit, rewrite, export, or save schema
source. Source view presents escaped retained text and declaration-oriented
fragments; it is not a round-trip editor or a line/column source IDE.

## ZIP and resource limits

ZIP processing is bounded:

- at most 20 MiB of archive data;
- at most 1,000 file entries;
- at most 250 DTD/XSD/RNG members;
- at most 512 Unicode code points and 32 path segments per entry;
- at most 5 MiB per extracted schema member;
- at most 20 MiB total extracted schema content.

Unsafe paths, duplicate canonical paths, unreadable archives, unsupported
encodings, and unsupported ZIP features fail with diagnostics. Binary and
ignored entries remain classified in package inventory instead of being parsed.
Diagnostic details are capped while retaining an explicit uncapped total where
supported.

## Capacity and persistence

Worker parsing, bounded carousel windows, and indexed presentation reduce
main-thread work, but usable project size remains dependent on browser memory,
device performance, compression, relationship density, structured cloning, and
rendering cost. The committed large fixtures are regression targets, not a
universal capacity guarantee.

Projects live only in memory for the current page. Reloading restores the
default sample. The only persisted application preference is whether Welcome
and Help opens automatically.

## Browser and accessibility evidence

Current automated production-browser evidence covers Chrome 151.0.7922.72 and
Firefox 153.0.1. Chrome requested viewports are 1440×900, 1280×720, 1024×768,
768×900, 412×915, 390×844, 915×412, and 844×390. Firefox may enforce a larger
effective content width for narrow requested viewports.

The repository does not claim Safari/WebKit coverage, physical Samsung-device
QA, manual Narrator or other screen-reader hardware testing, or browser-chrome
zoom telemetry. Automated semantics, keyboard, focus, reduced-motion, and
responsive tests are not a substitute for every assistive-technology/device
combination.

## Deployment and privacy

Schema contents are processed locally and are not uploaded to an XML Carousel
backend. There is no backend, analytics, telemetry, account system, update
check, or schema-retrieval service. Loading a hosted build still downloads the
application's static assets from its host; hosting providers, browser
extensions, and the user's environment remain outside XML Carousel's control.

The server must provide ordinary byte-preserving static hosting and a
JavaScript MIME type for `.js`. The verified WASM path tolerates
`application/octet-stream`. Root and nested-directory deployments use the same
portable artifact.

## Repository-history licensing status

The current tree stores James Clark's `xmltest` collection only as the verified
unchanged archive permitted by its embedded terms. The former public Git
history contained two unpacked entries; that repository is now private and
archived. The replacement public repository began with a parentless clean root
and contains neither historical blob. Anonymous web, API, and fresh-clone
checks confirmed the forbidden objects are not publicly retrievable.

This closes the former unresolved historical redistribution finding for GitHub
repositories under Ben's control. Independent third-party caches or clones of
the formerly public history may persist outside that control. XML Carousel's
website remains hosted and deployed separately by FTP; no GitHub Pages or
website migration was part of the repository-history remediation.
