# XML Carousel

## Overview

XML Carousel is a browser-based explorer for XML schema definitions. It turns
DTD, XSD, and ZIP schema packages into a connected set of cards: choose a
relationship to move through the schema as a journey, or inspect a declaration
without changing that journey.

The application is a static, local-first site. Selected files are read and
processed in the browser, including parsing work performed in a Web Worker. No
XML Carousel backend is required.

## Privacy

XML Carousel does not upload selected schema files to an XML Carousel backend.
File contents are processed locally by the browser. Loading the application
itself can still involve normal network requests to the site host for HTML,
JavaScript, CSS, and other application assets.

## Try it

On startup, the built-in Book DTD sample is ready to explore. Open **Help** for
an introduction or to switch between the built-in Book DTD and Library XSD
samples. Use **Open DTD**, **Open XSD**, or **Open ZIP** to replace the active
project with a local file.

Selecting a relationship card advances or revisits the carousel journey.
**Inspect** opens details independently, so checking a related declaration does
not move the current journey. Search groups matching declarations and offers
the same navigation and inspection actions. Pointer, touch, and spatial
keyboard controls are available; use the arrow keys from a focused carousel
control and follow the visible control labels.

## Supported capabilities

- XML 1.0 DTD grammar and XML Schema 1.0 validity through the authoritative
  Apache Xerces-C++ 3.3.0 WebAssembly engine
- Complete supported DTD and XSD 1.0 presentation through Navigation, Search,
  carousel focus, inspector, source view, and package inventory
- ZIP packages containing DTD and XSD files, with project-local dependencies
  resolved only from explicitly supplied members and preserved relative paths
- Worker-based import with progress and cancellation
- Precise declaration, reference, ownership, type, derivation, substitution,
  dependency, redefinition, source, and package relationships
- Adaptive presentation for large schemas and compact viewports
- Built-in DTD and XSD samples plus keyboard-accessible Help

The deterministic supported-presentation gate is currently 221/221 complete.
That result is an implementation-completeness statement for the documented
contracts, not a claim to support every XML-related standard. XSD 1.1 is not
supported. See [Standards support](docs/standards-support.md) and
[Known limitations](docs/known-limitations.md).

## Multi-file projects and security

Use **Open ZIP** for a complete multi-file project. The ZIP must preserve the
project's relative paths. XML Carousel never searches the host drive for
siblings, uses ambiguous basename fallback, retrieves remote schemas, or opens
arbitrary `file:` URLs. A standalone file with an unsupplied dependency fails
even when that dependency exists elsewhere on the computer.

Safe relative parent segments are accepted only when they normalize inside the
controlled virtual project root. Unsafe archive paths and references escaping
that root are blocked.

## Development

The checked-in Node version is `24.16.0`; use Node 24 for local development and
CI parity.

```sh
npm ci
npm run dev
```

Useful commands:

- `npm run build` creates the portable production build in `dist/`.
- `npm run preview` serves the current production build locally.
- `npm run validate` runs the complete non-writing release gate.
- `npm run verify:release-integrity` checks documentation, licensing,
  attribution, archive provenance, and packaging invariants offline.
- `npm run check` runs Svelte and TypeScript checks.
- `npm test` runs the Vitest suite.
- `npm run lint` runs ESLint.
- `npm run format:check` checks formatting without rewriting files.
- `npm run verify:dist -- --base=./` verifies an existing portable build.

## Distribution

Create and verify the portable production build:

```sh
npm run build
npm run verify:dist -- --base=./
```

The build is written to `dist/`. Copy the contents of `dist/` into any
directory served by a static web server. Because the generated asset URLs are
relative, the same build can run from a domain root or a nested directory.

Serve the application from the directory URL, normally with a trailing slash.
The server must deliver the generated files with their normal MIME types. No
application backend is required.

The intended canonical public site is
<https://xmlcarousel.wolfshafenpress.com/>. Deployment and verification of the
exact current candidate bytes require a separate authorized publication step.

## Project documentation

- [Architecture](docs/architecture.md)
- [Standards support](docs/standards-support.md)
- [Known limitations](docs/known-limitations.md)
- [Third-party licensing and attribution](docs/third-party-licensing.md)
- [First public alpha release notes](docs/first-public-alpha.md)
- [Release-candidate report](docs/release-candidate-report.md)
- [Release checklist](docs/release-checklist.md)
- [Development plan](docs/development-plan.md)
- [Style guide](docs/style-guide.md)

## Status

Version 0.1.0 is the planned first public alpha. It has not yet been tagged,
published as a GitHub Release, or deployed as the current candidate. Read the
[release notes](docs/first-public-alpha.md), [known
limitations](docs/known-limitations.md), and
[release-candidate report](docs/release-candidate-report.md) before testing it
with unfamiliar schemas.

This alpha is suitable for exploratory testing. Apache Xerces-C++ is the
authoritative XML, DTD, and XML Schema 1.0 validator within the controlled
project architecture. XML Carousel's post-Xerces extraction and presentation
layers are not a second validator. XSD 1.1, XML-instance product import,
network retrieval, and host-filesystem discovery remain outside scope.

## Licence

The project is dedicated to the public domain under
[CC0 1.0 Universal](LICENSE). Third-party components and fixtures retain their
own terms; see [Third-party licensing](docs/third-party-licensing.md) and the
distributed [notices](THIRD_PARTY_NOTICES.txt).
