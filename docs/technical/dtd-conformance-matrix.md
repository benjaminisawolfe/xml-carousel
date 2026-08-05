# XML 1.0 DTD conformance matrix

This is the Task 13.3 standalone-DTD boundary audit against XML 1.0 Fifth
Edition. It contains 56 audited rules: 12 grammar productions, 18
well-formedness constraints, 22 validity constraints, and 4 compatibility or
processor-warning rules. The committed W3C manifest supplies the complete test
ID index; `W3C §x` below means every selected manifest row whose `SECTIONS`
metadata names that section, not an inferred filename match.

The result abbreviations are: **G** = `loadGrammar` enforces it, **P** = the
validating probe exposes it, **E** = expansion of declared parsed general
entities in the probe exposes it, **I** = requires a real XML instance,
**R** = controlled resolver, **W** = nonfatal Xerces/lint warning, and **N/A** =
outside standalone-DTD operation. “Product” is the production result before
visualization extraction.

## Grammar productions (12)

| # | XML section and rule | Scope | `loadGrammar` | Validating parse / product | W3C and project fixtures | Status / limitation |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | §2.8 `[28]` doctypedecl wrapper | requires instance | N/A | I; standalone input has no wrapper | W3C §2.8 | covered by XML harness, not a standalone rejection |
| 2 | §2.8 `[30]` external subset | declaration-checkable | G | P; invalid | W3C §2.8; `malformed-element.dtd` | covered |
| 3 | §2.8 `[29]` markup declaration sequence | declaration-checkable | G | P; invalid | W3C §2.8; `broken.dtd` | covered |
| 4 | §3.2 `[45]` element declaration | declaration-checkable | G | P; invalid | W3C §3.2; `malformed-element.dtd` | covered |
| 5 | §3.2 `[46]` `EMPTY`/`ANY` content spec | declaration-checkable | G | P; invalid | W3C §3.2; `valid.dtd` | covered |
| 6 | §3.2.1 `[47-50]` children/choice/sequence | declaration-checkable | G | P; invalid | W3C §3.2.1; `library.dtd` | covered |
| 7 | §3.2.2 `[51]` mixed content | declaration-checkable | G | P; invalid | W3C §3.2.2 | covered |
| 8 | §3.3 `[52-53]` ATTLIST/attribute definitions | declaration-checkable | G | P; invalid | W3C §3.3; `malformed-attlist.dtd` | covered |
| 9 | §3.3.1 `[54-59]` attribute-type grammar | declaration-checkable | G | P; invalid | W3C §3.3.1; `attributes.dtd` | covered |
| 10 | §3.3.2 `[60]` default-declaration grammar | declaration-checkable | G | P; invalid | W3C §3.3.2; `invalid-id-fixed-default.dtd` | covered |
| 11 | §4.2 `[70-76]` entity declarations and IDs | declaration/reference | G/R | P/E/R; invalid or blocked | W3C §4.2; parameter/entity fixtures | covered within supplied project |
| 12 | §4.7/§3.4 notation and conditional-section grammar | declaration/external entity | G | P; invalid | W3C §4.7/§3.4; notation/conditional fixtures | covered |

## Well-formedness constraints (18)

| # | XML section and rule | Scope | `loadGrammar` | Validating parse / product | W3C and project fixtures | Status / limitation |
| ---: | --- | --- | --- | --- | --- | --- |
| 13 | §2.2 Legal Character | DTD/entity bytes | G | P/E; invalid | W3C §2.2 | covered |
| 14 | §2.5 comment syntax and no `--` | declaration-checkable | G | P; invalid | W3C §2.5; comment fixtures | covered |
| 15 | §2.6 PI syntax/reserved `xml` target | declaration-checkable | G | P; invalid | W3C §2.6 | covered |
| 16 | §4.4 Entity Value literal recognition | declaration-checkable | G | P/E; invalid | W3C §4.4 | covered |
| 17 | §4.2.2 system/public literal syntax | declaration-checkable | G | P/R; invalid or blocked | W3C §4.2.2 | covered |
| 18 | §4.1 `[69]` parameter-entity reference syntax | declaration-checkable | G | P; invalid | W3C §4.1 | covered |
| 19 | §2.8 PEs in Internal Subset | instance internal subset | N/A | I; invalid | W3C §2.8 | XML harness only |
| 20 | §2.8 PE Between Declarations | declaration-checkable | G (`263`) | P; invalid | W3C `not-wf-not-sa-009`; `improper-pe-nesting.dtd` | covered |
| 21 | §2.8 Proper Declaration/PE Nesting WFC | declaration/external entity | G | P; invalid | W3C §2.8; PE fixtures | covered |
| 22 | §4.1 Entity Declared | instance/entity expansion | partial | E or I; invalid | W3C §4.1 | general entities forced; document-only refs remain I |
| 23 | §4.1 Parsed Entity | entity expansion | partial | E; invalid | W3C §4.1 | covered |
| 24 | §4.1 No Recursion | entity expansion | no | E (`205`); invalid | W3C `not-wf-ext-sa-001`; recursive fixtures | covered for parsed general and PE/general cycles |
| 25 | §4.3.1 text declaration syntax | referenced external entity | no | E/R; invalid | W3C §4.3.1 | covered when supplied and referenced |
| 26 | §4.3.2 well-formed external parsed entity | referenced external entity | no | E/R; invalid | W3C §4.3.2; `malformed-chapter.ent` | covered when supplied |
| 27 | §3.4 conditional sections only in external subsets | declaration-checkable | G | P; invalid | W3C §3.4 | covered |
| 28 | §3.4 conditional keyword/bracket balance | declaration-checkable | partial | P (`52`); invalid | W3C §3.4; malformed conditional fixture | covered |
| 29 | §3.3.2 No External Entity References in defaults | declaration/reference | G/R | P; invalid/blocked | W3C §3.3.2 | covered |
| 30 | §4.3.3 encoding-declaration match | referenced external entity | no | E/R; invalid | W3C §4.3.3 | covered when entity is supplied/read |

## Validity constraints (22)

| # | XML section and rule | Scope | `loadGrammar` | Validating parse / product | W3C and project fixtures | Status / limitation |
| ---: | --- | --- | --- | --- | --- | --- |
| 31 | §2.8 Root Element Type | instance | N/A | I; not applied to standalone DTD | W3C §2.8 | probe root mismatch code is suppressed |
| 32 | §3 Element Valid | instance | N/A | I | W3C §3 | probe-only content codes suppressed |
| 33 | §3.2 Unique Element Type Declaration | declaration | accepts | P (`10`); invalid | W3C §3.2; `duplicate-element.dtd` | covered |
| 34 | §3.2.1 children occurrence/order | instance | N/A | I | W3C §3.2.1 | outside standalone boundary |
| 35 | §3.2.2 No Duplicate Types in mixed content | declaration | partial | P; invalid | W3C §3.2.2 | covered |
| 36 | §3.3 Required Attribute | instance | N/A | I | W3C §3.3 | probe code `6` suppressed |
| 37 | §3.3 Fixed Attribute Default | instance | N/A | I | W3C §3.3 | outside standalone boundary |
| 38 | §3.3 Attribute Value Type | instance | N/A | I | W3C §3.3 | outside standalone boundary |
| 39 | §3.3.2 Attribute Default Value Syntactically Correct | declaration | accepts | P (`23/25`); invalid | W3C §3.3.2; default fixtures | covered |
| 40 | §3.3.1 Enumeration | declaration/default | accepts | P (`23`); invalid | W3C §3.3.1; enumeration fixture | covered |
| 41 | §3.3.1 No Duplicate Tokens | declaration | accepts | P (`77`); invalid | W3C §3.3.1; duplicate-token fixture | covered |
| 42 | §3.3.1 ID lexical type | instance | N/A | I | W3C §3.3.1 | outside standalone boundary |
| 43 | §3.3.1 One ID per Element Type | declaration | accepts | P (`11`); invalid | W3C §3.3.1; multiple-ID fixture | covered |
| 44 | §3.3.1 ID Attribute Default | declaration | accepts | P (`8`); invalid | W3C §3.3.1; literal and `#FIXED` fixtures | covered |
| 45 | §3.3.1 ID uniqueness | instance | N/A | I | W3C §3.3.1; instance-dependent fixture | outside standalone boundary |
| 46 | §3.3.1 IDREF resolution | instance | N/A | I | W3C §3.3.1; instance-dependent fixture | outside standalone boundary |
| 47 | §3.3.1 ENTITY/ENTITIES names denote unparsed entities | instance | N/A | I | W3C §3.3.1 | outside standalone boundary |
| 48 | §3.3.1 Notation Attributes declarations | declaration | accepts | P (`14`); invalid | W3C §3.3.1; undeclared notation fixture | covered |
| 49 | §3.3.1 One Notation Per Element Type | declaration | accepts | P (`76`); invalid | W3C §3.3.1; multiple notation attrs | covered |
| 50 | §3.3.1 No Notation on Empty Element | declaration | accepts | P (`74`); invalid | W3C §3.3.1; empty notation fixture | covered |
| 51 | §4.7 Unique Notation Name | declaration | warning `2` | Xerces code promoted to error; invalid | W3C §4.7; `duplicate-notation.dtd` | narrow Xerces-code severity correction |
| 52 | §4.7 Notation Declared for unparsed entity | declaration | accepts | P (`4`); invalid | W3C §4.7; unparsed-entity fixture | covered |

## Compatibility and warning rules (4)

| # | XML section and rule | Scope | `loadGrammar` | Validating parse / product | W3C and project fixtures | Status / limitation |
| ---: | --- | --- | --- | --- | --- | --- |
| 53 | §3.3 first attribute binding on duplicate definitions | declaration | W (`3`) | W; valid plus DTD lint | W3C §3.3; duplicate-attribute fixtures | first declaration remains effective |
| 54 | §4.2 first entity binding on duplicate declarations | declaration | accepted | accepted; valid | W3C §4.2 | legal, no fabricated error |
| 55 | §3.2/§3.3 undeclared names in models/ATTLIST targets | declaration | W (`5/6`) | W; valid and lint where visualized | W3C §3.2/§3.3; undeclared fixtures | never promoted to fatal |
| 56 | §3.2.1 deterministic content models compatibility error | declaration | Xerces-dependent | P; report if Xerces reports | W3C §3.2.1 | retained as engine diagnostic; no custom parser |

## Probe and implementation boundary

Production first passes the exact user bytes to `loadGrammar` and then parses
an internal XML document with the DTD as a `project:///` external subset. The
root is `__xml_carousel_probe__`; parsed general entity names obtained from the
Xerces `DTDGrammar` are referenced as content so recursion and supplied
external parsed entities are read by Xerces. No network or host filesystem is
available.

Only probe-phase validity codes `2`, `6`, `7`, `16`, `21`, and `75` are
discarded: undeclared synthetic element, missing required attribute, synthetic
content mismatch, empty/content occurrence variants, and EMPTY-element
content. Codes `8`, `11`, `23`, `25`, `77`, `74`, `76`, `14`, `4`, and every
DTD/XML WFC diagnostic are retained. Remaining probe filenames are remapped to
the real DTD path with invented line/column data removed.

The sole supplemental standards correction is XML §4.7 Unique Notation Name:
Xerces detects it as `xerces-xml:2` but labels it a warning, so the adapter
promotes that exact code to an error. No second DTD parser was added.

## W3C corpus identity and totals

The source is XML W3C Conformance Test Suite 20130923,
`xmlts20130923.zip`, SHA-256
`f9510b3532926e1b4c2e54855b021e4b8a66ec98a5337dcf4ff07e8a41968deb`.
The machine manifest is
`tests/fixtures/w3c-xmlconf-20130923/dtd-selected-tests.json`. Task 13.9 audits
all 2,586 metadata rows, selects 1,950 applicable XML 1.0 Fifth Edition cases,
and marks 64 for CI. Of the selected rows, 1,735 are directly relevant to the
standalone DTD/entity product boundary and 215 are explicitly nonproduction
complete-XML-document harness cases. The 636 exclusions are deterministic:
267 XML 1.1-only, 59 namespace-only, and 310 not applicable to the Fifth
Edition. The complete suite stays ignored; the 90 required CI files are
committed and hash-verified.

The expanded CI result is 43 pass, 1 unsupported boundary, 2
instance-dependent, 2 optional-error accepted, 14 optional-error reported, 2
security-blocked, and zero fail/harness-error. The expanded full result is
1,912 pass, 1 unsupported boundary, 4 instance-dependent, 4 optional-error
accepted, 20 optional-error reported, 9 security-blocked, and zero
fail/harness-error.
Unsupported, instance-dependent, optional, and blocked results are never
counted as passes.

## Fixture audit (59 fixtures)

Every DTD/external-entity fixture and the two DTD ZIPs was re-read. The groups
below record the declarations, applicable rule, standalone result, lint and
visualization result, instance distinction, old preparse behaviour, and
corrected result. A semicolon-separated path list means each named fixture has
that same audit row.

| Classification (count) | Fixtures | Actual content and rule | Corrected standards / lint / visualization / instance result |
| --- | --- | --- | --- |
| `standards-invalid-declaration` (15) | existing `invalid-id-default.dtd`, `invalid-enumeration-default.dtd`; conformance `duplicate-element`, `duplicate-notation`, `duplicate-enumeration-token`, `invalid-enumeration-default`, `invalid-id-default`, `invalid-id-fixed-default`, `invalid-nmtoken-default`, `multiple-id-attributes`, `multiple-notation-attributes`, `notation-on-empty-element`, `undeclared-notation-attribute`, `undeclared-unparsed-entity-notation`; spike `duplicate.dtd` | duplicate declaration or §3.3/§4.7 ID, default, enumeration, or notation VC; preparse accepted most | invalid in P (`2/4/8/10/11/14/23/25/74/76/77`); no lint/extraction; instance-independent |
| `not-well-formed-dtd-or-external-entity` (13) | existing `broken.dtd`, `unterminated-comment.dtd`; conformance `external-entity-malformed.dtd`, `external-general-entity-malformed.dtd`, `improper-pe-nesting.dtd`, `malformed-chapter.ent`, `malformed-conditional-section.dtd`, `malformed-declarations.ent`, `recursive-general-entities.dtd`, `recursive-parameter-entity.dtd`; spike `malformed-attlist.dtd`, `malformed-element.dtd`, `multiple-errors.dtd` | malformed declaration/comment/conditional/entity, improper PE nesting, or recursive entity; preparse missed some expansion-only cases | G/P/E rejects; no lint/extraction; source path retained where Xerces provides it |
| `legal-with-optional-warning` (6) | existing `attlist-undeclared-element.dtd`, `duplicate-attribute.dtd`, `unresolved.dtd`; conformance `duplicate-attribute.dtd`, `undeclared-attlist-target.dtd`, `undeclared-child.dtd` | legal duplicate attribute first-binding or undeclared target/content name; Xerces codes `3/5/6` | valid; supported ATTLIST/duplicate cases lint and visualize; no instance claim |
| `legal-and-unremarkable` (10) | `attributes.dtd`, `library.dtd`, `multiple-roots.dtd`; conformance `valid-id-implied.dtd`, `valid-id-required.dtd`, `valid-unparsed-entity.dtd`; spike `conditional.dtd`, `parameter/declarations.ent`, `parameter/main.dtd`, `valid.dtd` | legal declarations, external PE include, or multiple possible document elements | valid; no fatal lint; visualization where supported; instance validity not asserted |
| `instance-dependent` (3) | `cycle.dtd`, `self-recursion.dtd`, conformance `instance-dependent-idrefs.dtd` | recursive element models are legal; ID uniqueness/IDREF resolution require document values | valid standalone; no false rejection; real-instance result deliberately N/A |
| `security-or-resolution-failure` (2) | spike `missing-entity.dtd`, `remote-entity.dtd` | referenced local file absent or network URL | blocked by R; no fallback, lint, or visualization |
| `visualization-regression` (8) | `comment-text-safety.dtd`, `comments.dtd`, `large-10000.dtd`, `large-40000.dtd`, `source-markup.dtd`, keyboard `branching-navigation.dtd`; ZIP `duplicate-dtd-names.zip`, `mixed-xsd-dtd.zip` | legal comments/literals, large declaration sets, source markup, navigation branches, or package path separation | standards valid; existing visualization/size/package tests retained; same basenames stay distinct |
| `engine-regression` (2) | conformance `probe-content-model.dtd`, `probe-required-attribute.dtd` | DTD intentionally declares the synthetic root with unsatisfied content/required attribute | valid because only probe-induced instance codes are filtered; internal path never escapes |

No fixture was renamed or deleted. The exact invalid ID-default fixture is
`tests/fixtures/dtd/conformance/invalid-id-default.dtd`; it is
`standards-invalid-declaration`, reports that an ID attribute must be
`#IMPLIED` or `#REQUIRED`, and never reaches visualization.
