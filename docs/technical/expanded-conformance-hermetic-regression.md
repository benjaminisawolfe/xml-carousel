# Expanded conformance and Hermetic regression

## Baseline and audit-first coverage inventory

Task 13.9 starts from commit
`178a54a34bdfc571f868157b0dcf4d5646838469`. Before any new corpus was
downloaded or any expected outcome was changed, the existing conformance,
comparison, production-validation, and Hermetic tooling was inventoried as
follows.

| Suite or corpus | Release and identity | Test family | Metadata expectation | Current selection rule | Current result classification | Production-boundary relevance | Existing automated coverage | Coverage gap | Proposed action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| W3C XML Conformance Test Suite | 20130923; `xmlts20130923.zip`; SHA-256 `f9510b3532926e1b4c2e54855b021e4b8a66ec98a5337dcf4ff07e8a41968deb` | XML 1.0 DTD, entity, document, namespace, and XML 1.1 metadata | `valid`, `invalid`, `not-wf`, or optional `error` | XML 1.0 Fifth Edition applicability plus a DTD/source heuristic | Pass, unsupported boundary, instance-dependent, optional accepted/reported, security-blocked, or harness error | Direct for standalone DTD/external-entity checks; instance-only document constraints remain nonproduction | 2,586 metadata rows inventoried; 1,735 selected; 48 CI rows | The 851 exclusions use only two broad reasons and do not expose every required reason family; CI membership is first-12-per-expectation rather than rule-family coverage | Add deterministic exclusion taxonomy and family metadata, audit every row, expand only honestly evaluable cases, and make CI category/family membership explicit |
| W3C XML Schema Test Suite | W3C `xsdtests` repository commit `7bc3365c652a322f3d762021b3879eb92dae7e30` for the existing three-file bootstrap | XSD 1.0 schema-document validity | Per-file expected valid/invalid values copied into the small bootstrap manifest | Three hand-selected Microsoft-contributed schema files | Binary valid/invalid assertion | Direct for schema-document validity; instance expectations are comparator/harness-only | Three spike cases | No official metadata inventory, bounded cross-family selection, explicit nonpass taxonomy, deterministic generator, or CI/full split | Pin an official distribution and metadata identity, generate a bounded committed manifest, and add explicit XSD CI/full harnesses |
| Xerces-J comparison | Apache Xerces-J 2.12.2 from `C:\Utilities\xerces-2_12_2` | XSD grammar compilation | Comparator reports accepted or rejected | Four local spike fixtures | Stable semantic result only | Independent evidence; never substitutes for W3C metadata | One PowerShell command and Java `SchemaFactory` comparator | No structured comparison manifest, DTD family coverage, nonpass families, Hermetic comparison, or disagreement ledger | Pin/report the installed comparator identity and generate deterministic semantic comparison output across representative XML/DTD, XSD, and Hermetic cases |
| Hermetic Foundry archive | `xml-schemas.zip`; 134,821 bytes; SHA-256 `C17CE1C44CD5AA309BCC652BB43F64E30BC993AEF52A0347CFBC799A32886A8F` | Complete external XSD package plus standalone missing-dependency probe | Accepted production/Xerces and visualization totals | One supplied external archive, discovered deterministically | Valid-and-partial or explicit failure category | Direct production ZIP-import regression | Audit schema version 2 records topology, sources, diagnostics, findings, and standalone result | No committed expectation, exact field-diff verifier, entry-order permutations, normalized project comparison, or per-source localization | Add a compact expectation manifest, field-level verification, original/reversed/shuffled checks, and bounded per-source summaries |
| Synthetic common-root package | Project-owned five-XSD ZIP generated from original fixtures | Common root, safe parent reference, shared dependencies | Successful inventory and no missing/external references | One fixture order | Inventory-only assertions | CI analogue for the external package | Two inventory tests | Does not compare production project/search/visualization results across entry orders or exercise partial visualization and standalone missing dependency together | Add an original synthetic source set and deterministic permutations with normalized production-result equality |
| Production Xerces boundary | Apache Xerces-C++ 3.3.0; committed JS/WASM Task 13.8 identities | DTD, XSD 1.0, ZIP roots, resolver and diagnostics | Xerces status plus product security/resource categories | Product-owned requests and focused fixtures | Valid, invalid, blocked, unsupported, or internal error | Authoritative product boundary | 70 production-validator tests plus worker/package integration coverage | Official XSD metadata and full-corpus disagreement cases are not yet connected to focused regressions | Reuse the adapter unchanged unless a preserved official case proves a narrow adapter defect |

The audit confirmed that the existing architecture should be extended rather
than replaced. Xerces remains the sole standards-validity authority, all
corpus access remains local and controlled, and the product continues to open
DTDs, XSDs, and schema ZIPs rather than arbitrary XML instance documents.

## Expanded W3C XML and DTD evidence

The 20130923 generator now gives every one of the 2,586 metadata rows exactly
one deterministic selected-or-excluded state. The complete exclusion matrix
is 267 XML 1.1-only rows, 59 namespace-only rows, and 310 rows not applicable
to XML 1.0 Fifth Edition. The remaining 1,950 rows are selected: 1,735 exercise
the existing standalone-DTD, external-entity, or supplied-project boundary,
and 215 are explicitly labeled nonproduction complete-XML-document harness
cases. Output-canonicalization metadata is retained on every row; it is not
misrepresented as a production DTD-import result.

The old selection had 1,735 full rows and 48 CI rows. The new selection has
1,950 full rows and 64 CI rows. CI is chosen deterministically across each
test-family/expectation pair and then filled to representative expectation
coverage. Its eight families and full totals are:

| Family | Selected |
| --- | ---: |
| attributes and defaults | 261 |
| conditional sections | 58 |
| DOCTYPE and external subset | 129 |
| elements and content models | 772 |
| external entities and encoding | 72 |
| notations and unparsed entities | 108 |
| parameter and general entities | 335 |
| harness-only XML document well-formedness | 215 |

The CI files are committed as a 90-file, 225,623-byte subset. Every file is
hash-checked from the generated manifest, so neither CI command downloads or
silently skips a corpus. The complete archive remains ignored.

| Level | Pass | Fail | Unsupported | Instance-dependent | Optional accepted | Optional reported | Security-blocked | Harness error |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| old CI | 32 | 0 | 0 | 2 | 2 | 10 | 2 | 0 |
| new CI | 43 | 0 | 1 | 2 | 2 | 14 | 2 | 0 |
| old full | 1,698 | 0 | 1 | 4 | 4 | 19 | 9 | 0 |
| new full | 1,912 | 0 | 1 | 4 | 4 | 20 | 9 | 0 |

The complete-document path is confined to the spike harness and calls the
same native `xml` operation and controlled virtual-project resolver. It adds
no `.xml` product control. Four official invalid cases remain explicitly
instance-dependent: `rmt-e2e-15a`, `rmt-e2e-20`, `inv-not-sa05`, and
`inv-not-sa06`. Xerces-J rejects all four for instance-content, token
normalization, or standalone-normalization constraints, while the current
Xerces-C++ complete-document operation accepts them. Correcting that upstream
semantic difference would require a disproportionate native change, so the
cases remain evidence rather than inflated passes. `x-rmt-008b` remains the
single unsupported product-boundary case.

## Official W3C XML Schema 1.0 suite

The bounded XSD harness pins the W3C distribution
`xsts-2007-06-20.tar.gz`, released 2007-06-20 from
`https://www.w3.org/XML/2004/xml-schema-test-suite/xmlschema2006-11-06/xsts-2007-06-20.tar.gz`.
It is 4,367,182 bytes with SHA-256
`902176b25e4111cf96b08663107521a4992e8ea67aad6b815592a6a5b4b9ea06`.
The extracted top level is `xmlschema2006-11-06/`; `suite.xml` identifies W3C
XML Schema 1.0 Second Edition metadata and points to 32 contribution metadata
files. The distribution's `00COPYRIGHT` identifies the W3C Document Notice and
License; that notice is preserved beside the committed subset.

The deterministic inventory contains 14,383 test groups, 14,328 schema tests,
25,092 instance tests, 14,402 schema-document references, and 25,092
instance-document references. Every case records contribution/test-set IDs,
schema and instance paths, recursively discovered dependencies, expectations,
metadata status, version, family, product relevance, selection, exclusion,
CI membership, and a stable ID. Selected dependency hashes are retained, and
the 55 committed CI dependency files are verified byte-for-byte.

The selection takes up to four positive and four negative schema tests in each
applicable family, then adds bounded disputed, security-policy, and
instance-only evidence. It selects 182 full cases and 52 CI cases across 24
families. The 14,201 exclusions are exact: 13,537 bounded-family sample-limit,
53 instance-only, 588 metadata-disputed, 21 missing-corpus-resource, and 2
security-policy-conflict rows. The complete 15.8 MiB machine manifest records
all rows; the tens of thousands of source files remain ignored.

| Level | Pass | Fail | Unsupported | Instance-dependent | Optional accepted/reported | Security-blocked | Metadata-disputed | Harness error |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| CI | 43 | 0 | 1 | 2 | 0 / 0 | 2 | 4 | 0 |
| full | 171 | 0 | 3 | 2 | 0 / 0 | 2 | 4 | 0 |

The two instance-only rows are `addA006` and `adda007`; they are not counted as
schema-validation passes. The four W3C `queried` outcomes are the three
`addB078` metadata IDs sharing one source plus `isDefault060_2`. The two
security-blocked cases are `anyURI_a004_1339` (FTP) and `schB8` (HTTP). The
three unsupported Xerces-C++ outcomes are `addB033`, `addB036`, and `ctF008`:
their official metadata says invalid, Xerces-J 2.12.2 rejects them, and
Xerces-C++ 3.3.0 accepts them even with schema full checking. The first two
exercise complex content derived from a simple-content base; `ctF008`
exercises mixed versus element-only extension. This is an engine limitation,
not an adapter configuration error, so no product or native source was
changed.

## Independent validator comparison

The independent tool is Apache Xerces-J 2.12.2. Its pinned local
`xercesImpl.jar` has SHA-256
`6fc991829af1708d15aea50c66f0beadcd2cfeb6968e0b2f55c1b0909883fe16`.
The comparator accepts `--mode xml|xsd` and a canonical controlled root,
blocks inputs and dependencies outside that root, and reports structured
semantic outcomes. Its `ACCESS_EXTERNAL_*` compatibility warning under the
Xerces-J 2.12.2 provider is nonfatal because the mandatory controlled
`LSResourceResolver`/`EntityResolver2` remains active.

The comparison set contains 92 cases across 33 families: a positive and
negative representative where available for all eight XML/DTD and 24 XSD
families, every selected nonpass classification, every initial metadata or
Xerces-C++ disagreement, two complete Hermetic roots, and the standalone
Hermetic missing-dependency case. Results were 85 direct agreements, 7
documented boundary differences, and zero unexpected disagreements. The seven
are `x-rmt-008b`, the four queried metadata rows, and the two external-resource
security blocks. Comparator agreement never overrides official metadata.

The three Xerces-C++/Xerces-J conformance disagreements are retained as the
unsupported engine cases described above. The four XML instance-semantic
differences remain instance-dependent. The only comparator harness defect
found was treating an unsupported Xerces-J JAXP access-control property as a
case rejection; the comparator now reports that property mismatch as a
warning and continues with its controlled resolver. No production defect was
reproduced.

## Durable Hermetic Foundry gate

`tests/fixtures/hermetic-foundry/expected-audit.json` has schema version 1 and
contains no archive bytes or schema source. It pins the filename, 134,821-byte
size, SHA-256
`c17ce1c44cd5aa309bcc652bb43f64e30bc993aef52a0347cfbc799a32886a8f`,
82 file entries, 38 XSDs, `xml-schemas/` common root, sorted source list, 39
schema-location references, zero external references, and zero missing
archive references. It also pins production engine identity, per-source path
and SHA, node/root/finding/markup counts, and all deterministic aggregate
fields.

The accepted production result remains partial with 2,134 supported nodes,
2,134 Search documents, 2,134 source-markup nodes, zero unresolved references,
and 510 uncapped findings. The retained detail cap is 50. Exact findings are
392 `xsd:invalid-annotation-placement`, 38 `xsd:multiple-annotations`, and 80
`xsd:unsupported-xsd-component`. Standalone `foundry-common.xsd` remains a
standards failure with `xerces:missing-project-dependency` because its
`foundry-rich-text.xsd` sibling was not supplied.

Original, reversed, and deterministically shuffled ZIP bytes all produce the
same standards status, source set, initial focus, ordered nodes and edges,
Search index, visualization, unresolved references, and markup coverage. The
stable normalized-result SHA-256 is
`61a0ea74342b63a7e967cd97947cc2e83dd730b18252af843479b94840bb8df0` for
all three orders. Verification reports exact JSON-field paths and per-source
rows on any future difference.

The original CC0 synthetic fixture under
`tests/fixtures/hermetic-foundry/synthetic-project/` covers a common root,
nested safe-parent resolution, shared dependencies, annotations/appinfo,
valid unsupported groups/attribute groups, partial visualization, deterministic
Search/project/markup equality across three orders, a standalone missing
dependency inventory, and zero external references. It copies no Hermetic
Foundry schema text and runs in the ordinary production test suite.

## Corrections and preserved production artifacts

Task 13.9 corrected only harness and evidence gaps: deterministic metadata
selection, committed CI fixture hashing, XSD metadata interpretation,
Xerces-J controlled comparison, Hermetic field-level verification, and
synthetic package permutations. No TypeScript production adapter, native
adapter, upstream Xerces source, worker, visualization extractor, or security
policy changed. Therefore no runtime rebuild was performed.

The preserved production identities remain `xerces-runtime.js` at 27,151
bytes and SHA-256
`e00a4618d52f24aa24a8d6d49173cfb2a7556627a7c71ef54650dde00923becc`,
and `xerces-runtime.wasm` at 2,162,515 bytes and SHA-256
`4b12de73b9b8ca974ea9caca2bcf38b7538c4a48fac8f52a98a80cfbdec6ab74`.
The production schema-import worker remains 281,087 bytes and SHA-256
`47dd473239e84e3fb2c03f84554039fde221d375de0892e3d090e3caf0e5d198`
when emitted by the accepted deterministic build.

## Local verification commands

```powershell
# XML 20130923 corpus identity/bootstrap is retained under the existing
# ignored tools/xerces-wasm-spike/.cache/w3c-xmlconf-20130923 path.
npm run w3c:dtd:manifest
npm run w3c:dtd:ci
npm run w3c:dtd:full

npm run spike:xerces:bootstrap-w3c-xsd
npm run w3c:xsd:manifest
npm run w3c:xsd:ci
npm run w3c:xsd:full

npm run spike:xerces:compare -- --Output "$env:TEMP\xml-carousel-task-13-9-xerces-j-comparison.json"
npm run audit:hermetic-foundry:verify -- `
  --path 'E:\Work\Hermetic Foundry\xml-schemas.zip' `
  --output "$env:TEMP\xml-carousel-task-13-9-hermetic.json"
```

The two manifest generators are deterministic: with unchanged pinned caches,
two consecutive runs must leave both manifests and committed CI fixture trees
byte-identical. Full commands fail with a precise bootstrap instruction when
their ignored corpus is missing. Every command returns nonzero for an
unexplained failure or harness error.

## Final validation evidence

The production suite is 137 files and 1,990 passing tests. The complete Xerces
spike is 10 files and 60 passing tests. `svelte-check` reports zero errors and
warnings; ESLint and Prettier pass. Aggregate validation passes runtime
integrity, production tests, static analysis, formatting, build, portable
distribution verification, and hostile-MIME loading. The adversarial audit
passes all six cases with zero external requests, file requests, failed cases,
or live workers.

Two clean production builds with no source change each transformed 288 modules
and produced the same 12-file inventory. Each has exactly one nonempty
JavaScript schema-import worker and no `.mjs`. The worker remains 281,087 bytes
with SHA-256
`47dd473239e84e3fb2c03f84554039fde221d375de0892e3d090e3caf0e5d198`;
the runtime identities match the preserved values above. Root and nested
portable paths and hostile `application/octet-stream` WASM loading pass.

The production lifecycle audit passes Chrome 150.0.7871.187 and Firefox
153.0.1 with 30 mixed cycles and 10 full Hermetic cycles each. Both report no
console warning/error, page error, external request, file request, production
`.mjs`, containment failure, or worker-lifecycle assertion failure. Chrome
measured zero live workers between imports; its first-three/final-three median
heaps were 6,773,836 and 7,279,344 bytes, within the 32 MiB threshold, with a
16,308-byte/cycle slope. Firefox/Gecko does not expose equivalent heap or
worker-target counters to this driver, so those sample fields remain null; its
observable lifecycle assertions passed. Safari/WebKit and actual-device
testing remain unclaimed.
