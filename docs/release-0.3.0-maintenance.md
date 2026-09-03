# XML Carousel 0.3.0 Maintenance Follow-Up

## In-App Help for the Next Patch

Update in-app Help for first-class RNC support and broader Search wording.
The current `src/ui/help/WelcomeHelpDialog.svelte` introduction names only
standalone RELAX NG XML-syntax files and XML-syntax package members, while its
later validation section correctly names `.rng/.rnc`. It also says
“Search jumps to declarations.” These are wording defects, not limits on the
accepted 0.3.0 functionality described in [Using XML Carousel](using-xml-carousel.md).

The next reviewed runtime task should:

1. Name both RELAX NG XML (`.rng`) and RELAX NG Compact Syntax (`.rnc`) in the
   introductory standalone and ZIP-package descriptions.
2. State explicitly: **Open RNG accepts both `.rng` and `.rnc`.**
3. Replace the declaration-only Search description with concise wording such
   as: “Search finds elements, definitions, attributes, references,
   documentation, and source context. Choose a result to navigate, or Inspect
   to read details without moving your journey.” Follow the actual action
   offered for non-navigable and package-entry results.
4. Preserve rootward-left / leafward-right orientation, keyboard handling,
   focus management, accessible names, and inspection independence.

Make these changes on a new patch/development branch with normal QA and release
treatment. They change production JavaScript and must not be deployed under
the existing immutable `v0.3.0` tag. No executable TODO or skipped tests are
created for this follow-up. The closure task leaves the Help file unchanged.

## Bound Package Homepage Metadata

`package.json.homepage` still names the previous hostname. That package file
is part of the accepted production-input digest, so it remains unchanged in
this documentation-only closure. Correct the homepage under the next reviewed
production-input change. Current user documentation uses
<https://xmlcarousel.knowone.ca>; the old hostname redirects there.

## Hosting and Publication Follow-Up

The [release report](release-0.3.0-release-report.md) records three unreferenced
0.2.0 files remaining on the host. Their exact relative paths are
`assets/index-BL1wGqMF.js`, `assets/index-COR_keLr.css`, and
`assets/schemaImportWorker-Caeajx9r.js`. Manual cleanup is limited to these
known application assets. No hosting writes are part of closure.

The corrected GitHub Release body is prepared as an external handoff artifact.
Apply it only after manual QA and separate approval. A link to the new guide
must target the subsequently integrated documentation on `main`, since the
guide does not exist in the immutable `v0.3.0` tree.
