# RELAX NG test-authority audit

## Decision

The current repository has no executable test that meets the Task 17.1 evidence
threshold for deletion, collapse, or immediate refactoring. No test is
classified as `IMPLEMENTATION_DETAIL_COUPLING`, `TRANSITIONAL_MIGRATION_ONLY`,
or `DUPLICATE_REDUNDANT`.

Current DTD, XSD, ZIP, security, lifecycle, accessibility, presentation, and
historical-release tests remain authoritative. Several generic-looking unions,
routers, and counts correctly describe the `0.2.0` product but must be
generalized by the task that adds the corresponding RELAX NG behavior. They are
kept unchanged now: Task 17.1 adds no dead RNG/RNC branches, placeholder UI, or
executable expected failures.

## Method and baseline

The audit traced production types through callers and inspected assertions, not
only filenames. Search covered format unions, import routing, controls, package
classification and summaries, standards authority, dependency and path policy,
diagnostic source/kind unions, Search/Navigation, source/copy, semantic zoom,
complete visualization, controlled-browser lifecycle, packaging, release
integrity, hard-coded counts, and skipped/todo tests.

The pre-audit executable baseline passed:

- `npm run validate`: 174 test files and 2,301 tests; 0 Svelte errors and 0
  warnings; lint, formatting, build, static-build, hostile-MIME, release, and
  runtime checks passed.
- `npm run acceptance:complete-visualization`: 221/221, digest
  `1e31059953b718750a749a23760e7f5540966e988562033ba1dc69b57bed84b2`.
- `npm run verify:release-integrity`: 16 bundled JavaScript components,
  `invalid-not-sa-022`, and 2 archive entries verified.

## Classification summary

The table below audits 43 suite/assertion groups.

| Authority | Groups | Decision |
| --- | ---: | --- |
| `CURRENT_PRODUCT_CONTRACT` | 9 | Keep |
| `CURRENT_SECURITY_CONTRACT` | 7 | Keep |
| `FORMAT_BASELINE_DTD_XSD` | 8 | Keep; add format-specific RELAX NG coverage later |
| `HISTORICAL_RELEASE_INTEGRITY` | 5 | Keep; never generalize into `0.3.0` evidence |
| `FUTURE_GENERALIZATION_REQUIRED` | 14 | Keep now; generalize in the named implementing task |
| `IMPLEMENTATION_DETAIL_COUPLING` | 0 | No cleanup justified |
| `TRANSITIONAL_MIGRATION_ONLY` | 0 | No cleanup justified |
| `DUPLICATE_REDUNDANT` | 0 | No cleanup justified |

## Assertion authority and change map

“Trigger” is the first production behavior that makes the current assertion
shape incomplete. “Replacement coverage” is applicable only after that trigger;
no existing coverage is removed by this task.

| Path / suite | Assertion or assumption | Authority classification | Current relevance | Action | Reason | Retirement/generalization trigger | Target task | Replacement coverage, if removed/refactored |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `src/app/import/schemaFileImportController.test.ts` — filename/options | Exact `.dtd`, `.xsd`, `.zip` extensions and format-separated DTD/XSD source IDs | `FUTURE_GENERALIZATION_REQUIRED` | Correct accepted inputs and identity today | Keep for now | RNG/RNC acceptance before a working importer would be dead behavior | Standalone RNG/RNC import exists | 17.4, 17.8 | Add RNG/RNC helper cases with production import; retain DTD/XSD/ZIP cases |
| `schemaFileImportController.test.ts` — cancellation/replacement/report lifecycle | Cancel, supersession, stale suppression, atomic replacement, retained diagnostics, destroy | `CURRENT_PRODUCT_CONTRACT` | Shared behavior required for every format | Keep | Tests observable lifecycle and state, not a private mechanism | None; extend shared contract when RNG uses controller | 17.3–17.4 | — |
| `schemaFileImportController.test.ts` — three activation targets | DTD/XSD/ZIP request/result matching and exact activation target | `FUTURE_GENERALIZATION_REQUIRED` | Correct router for implemented targets | Keep for now | A fourth production result requires deliberate routing, not a placeholder branch | Production RELAX NG result and activation boundary exist | 17.3–17.4 | Extend capability/router matrix; preserve exact existing activations |
| `src/app/import/schemaImportFailureFormatter.test.ts` — format fallbacks | DTD/XSD/ZIP fallback wording | `FUTURE_GENERALIZATION_REQUIRED` | Correct user messages today | Keep for now | RNG fallback is meaningless before normalized RNG diagnostics/import | Standalone RNG failure can reach Problems | 17.4 | Add RNG/RNC wording beside existing cases |
| `schemaImportFailureFormatter.test.ts` — safe context | Safe entry/location display; no local path, unsafe entry, source text, offsets, or exception leakage | `CURRENT_SECURITY_CONTRACT` | Privacy boundary applies to all imports | Keep | Strong behavior-level security coverage with distinct unsafe inputs | Never retire; extend diagnostic inputs | 17.3–17.5 | — |
| `src/app/import/schemaDiagnosticReport.test.ts` and `schemaDiagnosticReport.ts` unions | Diagnostic formats/sources currently DTD/XSD/ZIP/XML/project/visualization | `FUTURE_GENERALIZATION_REQUIRED` | Correct normalized reports today | Keep for now | New source/kind values require a real engine/import producer | RNG diagnostics are normalized | 17.3–17.4 | Add accepted RELAX NG diagnostic source/format with normalization tests |
| `src/workers/schemaImportWorkerProtocol.test.ts` and protocol types | Request/result union contains DTD, XSD, ZIP | `FUTURE_GENERALIZATION_REQUIRED` | Clone-safe exhaustive current protocol | Keep for now | Dead protocol variants weaken exhaustiveness and add unreachable messages | Production worker handles RELAX NG | 17.3 | Add engine-specific request/result variant plus protocol validation |
| `src/app/import/schemaImportWorkerClient.test.ts` | Transfer rules, exact-once settlement, timeout, cancel, constructor/message failure, cleanup | `CURRENT_PRODUCT_CONTRACT` | Shared worker safety/lifecycle | Keep | Distinct failure modes and observable termination signals | Never retire; parameterize only when needed | 17.3 | — |
| `src/workers/schemaImportWorkerXerces.test.ts` and runtime tests | Worker routes DTD/XSD through Xerces and preserves Xerces outcomes | `FORMAT_BASELINE_DTD_XSD` | Xerces must remain DTD/XSD authority | Keep | Engine-specific coverage is intentionally not generic | None | — | Separate RELAX NG engine tests in 17.3 |
| `src/ui/layout/TopBarImport.test.ts` — controls/inputs/routing | Exactly Open DTD/Open XSD/Open ZIP, three inputs, accept hints, callbacks | `FUTURE_GENERALIZATION_REQUIRED` | Exact current UI and accessibility contract | Keep for now | Open RNG is Task 17.4 behavior; pre-adding it is prohibited | User-facing standalone RNG import exists | 17.4 | Update visible-control matrix and add one `.rng,.rnc` input/callback contract |
| `TopBarImport.test.ts` — busy/focus/target behavior | Native controls, shared disable/busy state, focus recovery, target size, safe UI boundary | `CURRENT_PRODUCT_CONTRACT` | Required accessible import behavior | Keep | Visible behavior remains required with another control | Extend capability matrix when Open RNG ships | 17.4 | — |
| `src/tests/AppShell.test.ts` — implemented import controls | Three controls feed one coordinated controller and format-neutral alert | `FUTURE_GENERALIZATION_REQUIRED` | Correct composition today | Keep for now | Shell must gain RNG only with the working UI/controller path | Open RNG is wired end to end | 17.4 | Add RNG callback/focus evidence; preserve DTD/XSD/ZIP assertions |
| `src/tests/Task92WorkerImportUi.test.ts` | Reading/processing progress, immediate cancel, focus restoration, late-result rejection | `CURRENT_PRODUCT_CONTRACT` | Shared visible lifecycle behavior | Keep | Protects user-visible and stale-work contracts independent of engine | Add RNG case only when engine is integrated | 17.3–17.4 | — |
| `src/app/import/schemaArchive/*` discovery tests and `schemaArchiveTypes.ts` | Schema members are `.xsd` or `.dtd`; other entries auxiliary/ignored/directory | `FUTURE_GENERALIZATION_REQUIRED` | Correct ZIP discovery today | Keep for now | RNG/RNC package classification belongs with actual package import | RELAX NG package import begins | 17.5 | Extend discovery/inventory classification with `.rng`/`.rnc` fixtures |
| `src/app/import/schemaPackage/schemaPackageTypes.ts` | Source format XSD/DTD, entry kinds, dependency kinds, XSD/DTD counts | `FUTURE_GENERALIZATION_REQUIRED` | Correct normalized package model today | Keep for now | Premature kinds/counts create impossible entries and inflate reachability | RNG/RNC ZIP members are supported | 17.5 | Capability-driven package source/kind/count contracts and reachability |
| `src/app/import/schemaPackage/schemaPackageIntegration.test.ts` | XSD cross-file resolution and mixed DTD/XSD collision-safe identities | `FORMAT_BASELINE_DTD_XSD` | Required completed package semantics | Keep | Format-specific XSD namespace and DTD identity behavior remains valid | None | — | Separate RELAX NG package semantics in 17.5–17.6 |
| `src/app/import/schemaPackage/task1316CompletePackagePresentation.test.ts` — inventory counts | Exact XSD/DTD entry classifications, counts, source routes, stable ZIP order | `FUTURE_GENERALIZATION_REQUIRED` | Authoritative current package inventory | Keep for now | Existing fixture remains DTD/XSD; generic count shape grows only with classified RNG | RELAX NG members enter package inventory | 17.5 | Add RELAX NG package fixture/gate; retain this fixture's exact counts |
| `src/ui/layout/SchemaSetOutline.test.ts`, `SchemaSetOutline.svelte`, presentation types | XSD/DTD source groups and explicit XSD/DTD summary counts | `FUTURE_GENERALIZATION_REQUIRED` | Truthful current package outline | Keep for now | UI must not display zero/dead RNG categories | Package model supplies RNG/RNC sources | 17.5, 17.7 | Extend source labels/count presentation with visible RELAX NG entries |
| `src/app/import/schemaPackage/xsdPackageReferenceResolver.test.ts` | `xs:include`/`import`/`redefine`, namespaces, chameleon schemas, ambiguous/missing references | `FORMAT_BASELINE_DTD_XSD` | XSD-specific standards/presentation semantics | Keep | Must not be forced into generic RELAX NG resolution | None | — | Separate RELAX NG `include`/`externalRef` resolver tests in 17.5 |
| `src/app/import/schemaPackage/schemaPackageEntryRoots.test.ts` | XSD include graph roots, safe parents, cycles, comment false positives | `FORMAT_BASELINE_DTD_XSD` | XSD entry-root semantics remain required | Keep | RELAX NG root selection has different grammar semantics | None | — | Separate RELAX NG root tests in 17.5–17.6 |
| `src/app/import/schemaPackage/dtdCompletePackage.test.ts` | Complete DTD package external resources and distinct source ownership | `FORMAT_BASELINE_DTD_XSD` | DTD external-resource baseline | Keep | RELAX NG does not supersede DTD behavior | None | — | Add RELAX NG sibling coverage in 17.5 |
| `task1316CompletePackagePresentation.test.ts` — dependency presentation | Literal `rawTarget`, resolved/missing/blocked state, source/dependent routes and Search | `CURRENT_PRODUCT_CONTRACT` | Existing implementation of universal reference principle | Keep | Stable cross-format behavior worth reusing without weakening DTD/XSD | RELAX NG references are modeled | 17.5–17.7 | — |
| `src/app/import/schemaPackage/dtdDependencyPath.test.ts` | Blocks backslashes, absolute/drive/scheme/`file:`/remote/outside-root DTD targets | `CURRENT_SECURITY_CONTRACT` | Supplied-files-only DTD boundary | Keep | Future opt-in retrieval does not weaken `0.3.0` policy | Never during 17.x | 17.5 | — |
| `src/app/import/schemaArchive/schemaArchivePath.test.ts` | Canonical POSIX paths, depth/length, no host semantics, no percent decoding | `CURRENT_SECURITY_CONTRACT` | Shared ZIP containment boundary | Keep | Applies unchanged to RELAX NG packages | Never during 17.x | 17.5 | — |
| `src/app/import/schemaArchive/schemaArchiveSecurity.test.ts` | Traversal/collision/sanitization/control-character limits and safe diagnostics | `CURRENT_SECURITY_CONTRACT` | Shared archive attack boundary | Keep | Independent fixtures and failure modes are not duplicates | Never during 17.x | 17.5 | — |
| `src/standards/xerces/productionValidator.test.ts` — controlled paths | Missing/remote entities, `file:`, host, traversal, encoding, separator, ambiguity, map reset | `CURRENT_SECURITY_CONTRACT` | Existing engine resolver security | Keep | RELAX NG resolver should share policy, not delete Xerces evidence | Never; add parallel engine coverage | 17.2–17.3, 17.5 | — |
| `productionValidator.test.ts` — validity/conformance | Xerces version, DTD/XSD validity, includes/imports, XSD 1.1 boundary, DTD probe rules | `FORMAT_BASELINE_DTD_XSD` | Authoritative DTD/XSD engine evidence | Keep | Xerces remains authoritative for these formats | None | — | Dedicated RELAX NG engine/conformance suites in 17.2–17.3, 17.9 |
| `src/app/import/schemaArchive/schemaArchiveDependency.test.ts` | JSZip direct dependency and `package-lock.json` as sole lockfile | `CURRENT_PRODUCT_CONTRACT` | Reproducible ZIP implementation boundary | Keep | RELAX NG package support does not require a new ZIP implementation | Only an explicit dependency architecture change | 17.2–17.3 | — |
| `src/tests/ProjectSearchUiIntegration.test.ts` | DTD/XSD names, annotations/comments, references, source groups, Centre/Inspect, replacement | `FORMAT_BASELINE_DTD_XSD` | Current Search semantics and format-specific content | Keep | RELAX NG needs sibling semantics, not mutation of DTD/XSD fixtures | None | — | Add RELAX NG Search suite in 17.7–17.8 |
| `src/app/search/projectSearchIndex.ts` package-kind tests/usages | XSD/DTD/auxiliary entries are package sources; dependency `rawTarget` is indexed | `FUTURE_GENERALIZATION_REQUIRED` | Correct package Search categorization today | Keep for now | New package kinds must originate in the package model | RNG/RNC entry kinds exist | 17.5, 17.7 | Extend capability/category table and Search assertions |
| `src/tests/AppShell.test.ts` and source-view/copy suites — source truth | Exact retained source, separate Copy source/summary, modal focus, stale-copy suppression | `CURRENT_PRODUCT_CONTRACT` | Universal source-fidelity behavior | Keep | Required unchanged for `.rng` and especially original `.rnc` | Extend with actual RNG/RNC sources | 17.4, 17.8 | — |
| `AppShell.test.ts` and failure/copy tests — privacy/no network | Copy/source actions do not request network resources or expose private paths | `CURRENT_SECURITY_CONTRACT` | Local-first privacy boundary | Keep | Compact translation and external refs must not bypass it | Never during 17.x | 17.4–17.8 | — |
| Navigation, Inspector, carousel, Overview-focused-Inspect suites | Focus and inspection are independent; navigation bounded and truthful | `CURRENT_PRODUCT_CONTRACT` | Core product interaction model | Keep | RELAX NG presentation must join without changing these semantics | Extend with RELAX NG nodes | 17.7 | — |
| `src/tests/SemanticZoomAcceptanceAudit.test.ts` — required public formats | Current format matrix is DTD, XSD, ZIP/Hermetic | `FUTURE_GENERALIZATION_REQUIRED` | Correct `0.2.0` milestone evidence | Keep for now | RELAX NG has no presentation to audit yet | RELAX NG visualization is complete enough for milestone gate | 17.9 | Add dedicated RNG/RNC semantic-zoom cases; do not rewrite historical evidence |
| Semantic-zoom component/integration suites — behavior | Full/Compact/Overview bounds, focus, Search, Inspect, transitions, accessibility | `CURRENT_PRODUCT_CONTRACT` | Format-neutral behavior remains required | Keep | Strong visible behavior contracts with distinct edge cases | Add RELAX NG fixtures when presented | 17.7–17.9 | — |
| `src/tests/CompleteVisualizationAcceptance.test.ts` and matrix generator | Exactly 221 current rows, 52 node/edge kinds, 5 package-entry kinds, stable digest | `FORMAT_BASELINE_DTD_XSD` | Authoritative DTD/XSD/ZIP presentation baseline | Keep unchanged | It is deliberate evidence, not a fragile proxy for all future formats | Never inflate; create RELAX NG gate | 17.9 | New dedicated RELAX NG matrix; top-level command may aggregate both gates |
| `scripts/audit-standards-engine-lifecycle.mjs` plus acceptance binding | Chrome/Firefox imports, cancellation, cleanup, zero external/`file:` requests, zero live workers | `CURRENT_SECURITY_CONTRACT` | Browser-level lifecycle and network evidence | Keep | Distinct real-browser boundary not duplicated by unit tests | Extend only after RELAX NG production path works | 17.3, 17.9 | — |
| `src/tests/PublicAlphaPackaging.test.ts` | `0.1.0` public-alpha docs, workflow, portable artifact, nondeployment facts | `HISTORICAL_RELEASE_INTEGRITY` | Immutable first-release evidence | Keep; do not generalize | Old release did not support RNG | Never | — | Future `0.3.0` packaging suite |
| `src/tests/Release020CandidatePackaging.test.ts` | Exact `0.2.0` candidate report, branch/version and browser evidence | `HISTORICAL_RELEASE_INTEGRITY` | Immutable candidate-stage evidence | Keep; do not generalize | Candidate facts must not drift with current development | Never | — | Future `0.3.0` candidate suite |
| `src/tests/Release020ClosurePackaging.test.ts` | Exact `0.2.0` release/deployment/digests/browser versions and closure | `HISTORICAL_RELEASE_INTEGRITY` | Immutable released facts | Keep; do not generalize | RNG cannot be backfilled into `0.2.0` | Never | — | Future `0.3.0` closure suite |
| `src/tests/ReleaseIntegrity.test.ts` | Third-party archive bytes, no extraction, canonical documentation/licensing verifier | `HISTORICAL_RELEASE_INTEGRITY` | Protects accepted release evidence and fixture provenance | Keep | Distinct byte-integrity and packaging boundary | New dependencies add separate current evidence | 17.2–17.3, 17.10 | — |
| Historical release/technical reports and their text-asset assertions | Exact 0.1/0.2 reports, 221/221, browser versions, digests, Xerces task conclusions | `HISTORICAL_RELEASE_INTEGRITY` | Immutable engineering/release evidence | Keep; do not rewrite | Later architecture does not alter historical truth | Never | — | New `0.3.0` reports/tests |
| Current-facing docs assertions in README/support/limitations/architecture | Product currently says DTD/XSD/ZIP and Xerces authority | `FUTURE_GENERALIZATION_REQUIRED` | Correct for shipped `0.2.0` | Keep during implementation; update at acceptance | Premature claims would advertise unsupported RNG | RELAX NG ships as first-class input | 17.10 | Update current-facing docs and add `0.3.0` release assertions |

## Dependency and reference authority

The existing tests distinguish four contracts that later tasks must preserve:

1. **Resolution security remains current.** Archive canonicalization, supplied
   map containment, traversal/scheme/host blocking, no ambiguous basename
   fallback, resource limits, and safe diagnostic redaction remain mandatory.
2. **Reference preservation is product information.** Current package
   relationships retain `rawTarget`, kind, source, and resolved/missing/blocked
   state and expose them through package, Search, source, and owner routes. Task
   17.5 must extend this principle to RELAX NG `include` and `externalRef`, and
   must identify any DTD/XSD reference-presentation gaps without weakening
   resolution rules.
3. **Remote retrieval remains prohibited throughout Tasks 17.x.** HTTP/HTTPS,
   `file:`, absolute, host, and outside-root targets may be represented but must
   not be fetched or matched to fabricated/local targets.
4. **The `0.4.0` retrieval roadmap is not current test behavior.** Do not add
   passing tests for network resolution until the relevant Task 18.x security
   and product contract is implemented.

## Current-facing documentation change map

Historical reports and task audits are evidence and must not be rewritten.
These current-facing documents are correct for the released `0.2.0` product but
will become incomplete as the named production behavior lands.

| Document | Current statement | Why currently correct | Stale at | Required future wording |
| --- | --- | --- | --- | --- |
| `README.md` | DTD/XSD/ZIP inputs; Xerces is authoritative; 221/221 | Accurately describes `0.2.0` | 17.4 for input preview; 17.10 for release claims | List `.rng`/`.rnc` and Open RNG only when working; route DTD/XSD authority to Xerces and RELAX NG authority to the accepted engine; keep 221/221 scoped |
| `docs/architecture.md` | Worker/import/model/package paths carry DTD/XSD/ZIP; Xerces validation sections | Accurately describes implemented architecture | 17.3–17.8 | Add separate RELAX NG engine, import, semantic-model, Compact-source, and package/reference paths without replacing Xerces sections |
| `docs/standards-support.md` | Accepted inputs are DTD/XSD/ZIP; Xerces authority; supported presentation is 221/221 | Accurate support contract today | 17.10 | Add accepted RNG/RNC scope and engine authority; describe original `.rnc` fidelity; present existing and RELAX NG gates separately |
| `docs/known-limitations.md` | DTD/XSD standards scope, no remote/host retrieval, DTD/XSD ZIP limits | Accurate limitations today | 17.5 and 17.10 | Add RELAX NG limitations/reference representation; retain no-retrieval rule and clarify gate scope |
| `docs/post-alpha-roadmap.md` | Completed DTD/XSD/Xerces milestones and the then-approved next milestone | Historical planning context that remains truthful | Do not rewrite as implementation docs | Preserve; use the development plan and this contract for 0.3.0 authority |
| `docs/technical/xerces-production-validation-boundary.md` | Xerces is the sole authority for production DTD/XSD/ZIP in Task 13.3 | Correct Task 13.3/current-format boundary | Never rewrite historical wording; qualify in new/current docs by 17.3/17.10 | “Xerces is authoritative for DTD and XSD 1.0; the accepted RELAX NG engine is authoritative for RNG/RNC; routing is language-specific.” |
| `docs/technical/complete-visualization-coverage-audit.md` and matrix | 221 DTD/XSD/ZIP rows complete | Deliberate completed baseline evidence | Never inflate | Preserve; Task 17.9 creates a dedicated RELAX NG matrix and may aggregate commands |
| Release reports/checklists for 0.1.0/0.2.0 | Historical formats, versions, browser evidence, counts, digests | Immutable release facts | Never | Add new `0.3.0` candidate/closure documents instead |

## Normative anti-cruft rules for Tasks 17.x

1. **No dead format branches.** Do not add `'rng'`, `'rnc'`, `rng-source`, or
   Open RNG to a production union, router, package model, or UI until its task
   implements reachable behavior. Do not add placeholders or future-only
   callers.
2. **No skipped/todo RELAX NG suites.** Do not accumulate `it.skip`,
   `describe.skip`, or `test.todo`. Add executable cases with the contract they
   test; keep future matrices in documentation until then.
3. **Do not inflate or redefine 221/221.** It remains scoped evidence for the
   supported DTD/XSD/ZIP presentation matrix. Task 17.9 owns a dedicated RELAX
   NG gate; a later top-level command may aggregate the two gates.
4. **Prefer capability-driven generalization.** Shared format capability tables,
   lifecycle contracts, and resolver-security helpers are preferred where
   semantics are common. Do not copy chains of `if dtd / else if xsd / else if
   rng`, and do not erase legitimate DTD content-model, XSD namespace, or RELAX
   NG pattern differences.
5. **Test at the right layer.** Shared tests own replacement safety,
   cancellation, stale suppression, diagnostic retention, source privacy, and
   controlled local resolution. Engine suites own Xerces, the accepted RELAX
   NG engine, and the Compact front end. Schema-specific suites own language
   semantics. UI suites prefer visible and accessible behavior over private
   enum shape.
6. **Remove superseded tests in the superseding task.** When a task changes a
   contract, update/remove the old assertion in that same task and identify its
   replacement. Do not keep contradictory tests or pre-delete a still-correct
   one.
7. **Hard-coded counts require authority.** Counts may pin immutable release
   facts, a named conformance matrix, or a fixture inventory. They must not be a
   fragile proxy for “all formats” in a growing product.

## Future-generalization map

| Task | Existing seams to change only when the task implements them |
| --- | --- |
| 17.2 | Add spike-only engine/front-end/conformance/security evidence; do not touch production unions or current gates |
| 17.3 | Add accepted RELAX NG engine request/result routing, diagnostics, lifecycle, cleanup, build/licensing, and engine-specific tests; retain Xerces tests |
| 17.4 | Generalize standalone format/diagnostic/controller/UI/AppShell seams and add Open RNG with reachable `.rng` behavior |
| 17.5 | Generalize archive classification, package source kinds/counts, outline/Search categories, and safe `include`/`externalRef` preservation/resolution |
| 17.6 | Add source-preserving RELAX NG model and extractor tests without a second validity gate |
| 17.7 | Add RELAX NG Search, Navigation, carousel, Inspector, source, copy-summary, semantic-zoom, and package presentation tests |
| 17.8 | Add `.rnc` input and original-source/diagnostic/package-identity fidelity plus RNG/RNC semantic equivalence |
| 17.9 | Create dedicated RELAX NG conformance and complete-visualization gates and extend controlled-browser/semantic-zoom acceptance; preserve 221/221 |

Task 17.10 owns final current-facing support/release documentation and new
`0.3.0` packaging/closure evidence. Historical `0.1.0` and `0.2.0` suites remain
unchanged.

## Cleanup result

Executable tests changed or deleted: **none**. No replacement fixture or test is
needed. The current 174-file, 2,301-test baseline remains intact, no RELAX NG
fixture corpus was added, and the repository contains no skipped/todo RELAX NG
tests.

