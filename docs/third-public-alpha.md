# XML Carousel 0.3.0 — Third Public Alpha

Release date: 2026-09-02. Version: `0.3.0`. Annotated tag: `v0.3.0`.
This is alpha-quality exploratory software, published as a non-draft GitHub
prerelease after the exact release source passes hosted CI. The public release
body records that source commit; this document is frozen before publication.

Canonical site: <https://xmlcarousel.wolfshafenpress.com/>. Canonical-site
deployment is separate and has not been performed under this release authority.
This release does not claim live-site 0.3.0 smoke or deployed-byte verification.

## First-class RELAX NG

RELAX NG XML syntax (`.rng`) and Compact Syntax (`.rnc`) join DTD and XSD as
first-class inputs. Open standalone schemas, multi-file ZIP projects, and mixed
DTD/XSD/RNG/RNC packages. Supplied project members retain their relative paths.

DTD/XSD validity uses Apache Xerces-C++ WASM. RNG validity uses libxml2 WASM
2.15.3. The source-preserving RNC parser produces a transient RNG validation
form for libxml2. Jing and Trang are development/conformance oracles only.

RELAX NG uses shared Search, Navigation, carousel, Inspector, Problems, source
modal, Copy Source, and semantic zoom in Full / Compact / Overview. The
approved orientation remains rootward left and leafward right.

User source remains original RNG XML for `.rng` and original Compact Syntax
for `.rnc`. Generated RNC validation XML is never user-facing source.

## Accepted evidence

The unchanged Task 17.10 decision is `READY_FOR_0_3_0_RELEASE`: 60 / 60 PASS.
The [candidate record](release-0.3.0-candidate.md) documents stabilization and
the reviewed browser, accessibility, privacy, lifecycle, and manual QA boundary.

| Authority | Result | SHA-256 |
| --- | --- | --- |
| Task 17.10 acceptance matrix | 60 / 60 PASS | `032bedd8e0dcb32d753a718861d9d311010c5dbed8eb89aeecf1a1dd0fb91397` |
| Historical DTD/XSD/ZIP visualization | 221 / 221 | `1e31059953b718750a749a23760e7f5540966e988562033ba1dc69b57bed84b2` |
| RELAX NG visualization | 77 / 77; 0 findings | `b5798413268b6f874ea1f9ef24909765153562bd4c04ae046fca02ea0476a5fc` |
| RELAX NG conformance manifest | 385 spectest + 90 compacttest = 475 selected; 0 excluded | `806824774b9c5d04ed4b784d7b6db3680c56dcfa8c34fc813f2753afab5bd6d4` |
| Jing/Trang oracle | 0 investigations; 0 harness errors | `053dcf0670e26e4bb5509e4234d0533e45e9f1843ebaddba2b306dc7c484d39c` |

The 40 reviewed product-boundary and 2 security-policy differences remain
explicit in the conformance authority; they have not been relabelled as passes.

Candidate production-input SHA-256:
`c628736f9d80c6e00fce2017ff98caffa45d84dee837726d01b1ac7f6ef65d67`.
Release production-input SHA-256:
`5df05a36560cdbe07e623bb0af461d5507bdc327fff66260fd395660dbf96840`.
Only the package version and the two root lockfile version fields explain the
difference. The release integrity contract reproduces the candidate digest
after normalizing those three fields to `0.2.0`; product inputs and dependency
data remain bound. The candidate matrix and browser evidence are unchanged.

Reviewed browser acceptance is Chrome 152.0.7977.65: 233 / 233 and Firefox
155.0: 233 / 233, using geckodriver 0.37.1, revision 300705c65d1b. axe-core
4.13.0 examined 72 representative screens with 0 serious/critical findings.
The release report separately records focused smoke of the release distribution
in both browsers at `/` and `/xml-carousel/`.

## Privacy, security, and limits

Schema processing remains local-first with no schema upload backend, no remote
schema retrieval in 0.3.0, and no arbitrary host filesystem retrieval.
Dependency resolution is supplied-files-only. Blocked HTTPS/file/traversal
references remain visible but unfetched. Normal application asset requests
still go to the static host.

XSD 1.1 is unsupported. XML instance validation is not a product input.
Validator.nu's custom WHATWG datatype-library boundary remains unsupported.
Unreliable RNC diagnostic coordinates are omitted when they cannot be mapped
safely. Remote/external resolution is deferred to 0.4. Safari/WebKit is not
release-certified; manual screen-reader and physical-phone certification are
not claimed.

The production dependency audit reports zero vulnerabilities. Two high-severity
development-only advisories affect transitive `js-yaml` and `nanoid`; the
existing release policy permits recording these without dependency remediation.
No dependency version, resolution, integrity, or production license changed.

See [standards support](standards-support.md), [known limitations](known-limitations.md),
[third-party licensing](third-party-licensing.md), [release checklist](release-0.3.0-checklist.md),
[release report](release-0.3.0-release-report.md), and the
[release source record](release-0.3.0-source-record.json).
