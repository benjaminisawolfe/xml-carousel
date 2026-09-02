# Task 17.6 RELAX NG semantic-model manual QA

All files in this directory are project-authored UTF-8 fixtures. They remain the
readable human-QA complement to the third-party formal corpus in
`../conformance/` and the generated RELAX NG visualization matrix. Opening a
valid fixture now exercises grammar, definitions, patterns, Search, Navigation,
Inspector, exact source, and stable Full/Compact/Overview identity.

## Loose files — use Open RNG

| Fixture                                | Exercise                                                                                   | Expected result                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `01-basic-grammar.rng`                 | Grammar, start, define, ref, elements and attributes                                       | Valid; semantic presentation and exact source                   |
| `02-pattern-operators.rng`             | Group, choice, interleave, optional, repetition, mixed and list                            | Valid; exact source remains available                           |
| `03-name-classes.rng`                  | Lexical/prefixed names, name-class choice, `anyName`/`nsName` exclusions                   | Valid; name classes are reachable and inspectable               |
| `04-datatypes-and-values.rng`          | Datatype library, data params, data except and values                                      | Valid; structured details, Search, and exact source             |
| `05-annotations-and-compatibility.rng` | Documentation, foreign metadata and DTD Compatibility `defaultValue`                       | Valid; inert metadata remains searchable/inspectable            |
| `06-nested-grammar-parent-ref.rng`     | Nested grammar and parent-scope `parentRef` binding                                        | Valid; parent-scope target is navigable                         |
| `07-large-semantic-model-a.rng`        | Large catalog model with definitions, recursion, contexts, annotations and foreign content | Valid; **11,283 bytes**                                         |
| `08-large-semantic-model-b.rng`        | Large publishing model with combined definitions, recursive sections, tables and media     | Valid; **11,308 bytes**                                         |
| `09-invalid-schema.rng`                | Undefined `ref`                                                                            | Standards-invalid; active project remains unchanged             |
| `10-blocked-external-ref.rng`          | HTTPS `externalRef`                                                                        | Blocked dependency; no network request and no fabricated target |

## Packages — use Open ZIP

| Fixture                          | Exercise                                                       | Expected result / relationships to inspect                                                             |
| -------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `11-multi-file-includes.zip`     | Two resolved includes and combined definitions                 | `main.rng` resolves `parts/common.rng` and `parts/types.rng`                                           |
| `12-external-ref-project.zip`    | Resolved nested external reference                             | `main.rng` resolves `patterns/address.rng`                                                             |
| `13-shared-dependency.zip`       | Two independent roots sharing one dependency                   | Both catalogs resolve the same `shared/item.rng` source once                                           |
| `14-nested-include-project.zip`  | Nested include and safe `../` normalization                    | `main.rng` → `levels/first.rng` → `common/base.rng`                                                    |
| `15-mixed-large-rng-project.zip` | Multiple roots with two large RNG members and one small member | Both 11 KiB loose models are present as independent large members                                      |
| `16-missing-dependency.zip`      | Missing include beside an available independent root           | Missing relationship remains visible; no target is fabricated                                          |
| `17-blocked-external-uri.zip`    | Blocked HTTPS and `file:` targets                              | Both literal targets remain visible and unfetched                                                      |
| `18-cycle-project.zip`           | Include cycle and externalRef cycle                            | Cycles terminate; source/relationships remain inspectable even where standards validation reports them |

For every successful open, confirm the top bar still contains Open DTD, Open
XSD, Open RNG, and Open ZIP; source view/copy is exact; semantic names and
documentation are searchable; Inspector shows structured semantics;
Full/Compact/Overview preserve identity; and the browser makes no schema
retrieval request.

`manifest.json` records deterministic byte sizes, SHA-256 identities, members,
roots, and expected relationship outcomes. Regenerate the committed ZIPs and
manifest with:

```text
node scripts/generate-relax-ng-manual-qa-fixtures.mjs
```
