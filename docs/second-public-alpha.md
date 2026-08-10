# XML Carousel 0.2.0 — Second Public Alpha

- Release date: 2026-08-10
- Annotated tag: `v0.2.0`
- Published source commit: `1c744fd16079cbefcaf1f4c96d69c1897e9727ab`
- GitHub Release: published as a prerelease
- GitHub Release ID: `367670853`
- Canonical site: https://xmlcarousel.wolfshafenpress.com/
- Deployment: completed by manual FTP
- Deployed-byte verification: passed
- Live inventory SHA-256:
  `39f0f141b99f43aaeec8de09a189ec4f6ba65b06edbb55008179b8cf3147ddd9`

XML Carousel 0.2.0 is the published and deployed second public alpha. Annotated
tag `v0.2.0` identifies the exact published source, and the canonical site
serves the exact verified 14-file release distribution. Hosted CI, deployed-byte
verification, and live Chrome and Firefox verification passed.

## Highlights

Since 0.1.0, XML Carousel has expanded from its first public foundation into a
more complete local schema-exploration tool. The supported-presentation gate is
221/221 complete across DTD, XSD 1.0, and multi-file ZIP constructs. Problems
remain available through normalized standards diagnostics, while declarations,
relationships, annotations, source evidence, and package membership have
dedicated routes through Navigation, Search, carousel focus, the Inspector,
source view, and package inventory.

The release adds semantic zoom, richer developer handoff utilities, broad
responsive and accessibility hardening, and stronger adversarial import and
path handling. It remains alpha-quality exploratory software rather than a
stable or production-certified release.

## Standards and validation

Apache Xerces-C++ 3.3.0 compiled to WebAssembly remains the authoritative XML,
DTD, and XML Schema 1.0 standards boundary. XML Carousel normalizes the engine's
diagnostics and makes the complete Problems collection reachable; its extraction
and presentation layers do not act as a second validator.

Supported DTD visualization and supported XSD 1.0 structure, types,
constraints, relationships, annotations, appinfo, and foreign content are
covered by the complete 221/221 presentation gate. ZIP projects retain explicit
package-relative identity and resolve dependencies only from supplied members.

## Visualization and navigation

Schema constructs are reachable through their truthful primary presentation:
Navigation, Search, carousel focus, Inspector, source view, Problems, or package
inventory. Relationship kinds remain distinct rather than being flattened into
a generic parent/child model. Navigation changes the journey; Inspect remains an
independent view of a declaration.

Large and dense projects use bounded carousel neighbourhoods. Project
replacement, cancelled imports, invalid imports, and stale worker results keep
their documented state-safety boundaries.

## Semantic zoom

Full, Compact, and Overview presentations let users choose the amount of visual
detail without changing project or journey state. Compact retains concise
relationship context and Inspect actions. Overview presents a wider names-first
neighbourhood with semantic relationship lines and keeps a direct Inspect action
for the focused node while context cards continue to navigate normally.

## Developer handoff utilities

The Inspector and focused Full presentation expose truthful standalone
filenames or package-relative source paths and only claim line/column precision
supported by retained parser evidence. A dedicated modal shows large retained
source fragments as inert, whitespace-preserving text.

`Copy source` copies exactly one retained source fragment. `Copy node summary`
produces deterministic, human-readable plain text from bounded Inspector data.
Neither action navigates, changes Search, uploads content, or writes project
data.

## Accessibility and responsive behaviour

The integrated application includes keyboard and focus-management contracts,
responsive/reflow coverage, forced-colour instrumentation where supported, and
reduced-motion behavior. Source and Help dialogs restore focus, visible controls
retain accessible names, and long names remain contained at enlarged text and
narrow layouts.

Automated accessibility evidence is not manual screen-reader certification.
Safari/WebKit is not an acceptance target for this release.

## Security and privacy

Selected schemas are processed locally in the browser, including validation and
parsing work in a Web Worker. XML Carousel has no application backend for schema
content and includes no analytics, telemetry, or crash-reporting integration.
Normal static-site requests still retrieve HTML, JavaScript, CSS, WebAssembly,
and licence assets from the application host.

Remote schema retrieval, arbitrary host-filesystem discovery, `file:` URL
access, ambiguous basename fallback, and package paths that escape the supplied
virtual project root are blocked. Dependencies resolve only from explicitly
supplied files.

## Distribution

The release is one hosting-neutral 14-file static distribution built with
relative `./assets/...` references. The same exact files run at a domain root or
nested directory without rebuilding. No XML Carousel application backend is
required.

The canonical deployment used Binary/Image transfer mode for every file and
was verified byte-for-byte with cache bypass. The live inventory contains
3,257,270 bytes and has canonical SHA-256
`39f0f141b99f43aaeec8de09a189ec4f6ba65b06edbb55008179b8cf3147ddd9`.

## Known limitations

- XSD 1.1 is not supported.
- XML instance-document validation is not a product input.
- Projects are read-only; schema editing and export are not implemented.
- Remote schema retrieval and arbitrary host-filesystem discovery are blocked.
- Dependencies resolve only from explicitly supplied project files.
- Persisted recent projects and session reopening are not implemented.
- Safari/WebKit and manual screen-reader certification are not claimed.
- Capacity depends on browser, device memory, schema shape, and package size.

See [Known limitations](known-limitations.md) for the complete accepted
boundaries.

## Upgrade and testing notes

This release does not change the portable hosting model used by 0.1.0. Users
testing unfamiliar schemas should keep all required local dependencies together
in a ZIP with their relative paths preserved. Failed or cancelled replacement
imports should leave the active project available.

Publication, deployment, deployed-byte verification, and live browser evidence
are recorded in the [0.2.0 release and deployment
report](release-0.2.0-release-report.md). The unchanged [0.2.0 candidate
report](release-0.2.0-candidate-report.md) remains historical pre-release
evidence.

## Further documentation

- [Standards support](standards-support.md)
- [Known limitations](known-limitations.md)
- [Third-party licensing](third-party-licensing.md)
- [0.2.0 release checklist](release-0.2.0-checklist.md)
- [0.2.0 release and deployment report](release-0.2.0-release-report.md)
- [Historical 0.2.0 candidate report](release-0.2.0-candidate-report.md)
- [Historical 0.1.0 release notes](first-public-alpha.md)
