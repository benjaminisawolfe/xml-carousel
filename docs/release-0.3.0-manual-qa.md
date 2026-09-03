# Task 17.10 manual QA

Review the exact unstaged candidate working tree before integration. Use
`npm run dev` or `npm run build` followed by `npm run preview`. Package version
should still be 0.2.0. The candidate is not published by this task.

All paths below are exact repository-relative fixture paths. Open `.rng` and
`.rnc` through **Open RNG**, archives through **Open ZIP**.

| Purpose | Fixture |
| --- | --- |
| Basic RNG | `tests/fixtures/relax-ng/manual-qa/01-basic-grammar.rng` |
| Basic RNC | `tests/fixtures/relax-ng/manual-qa-rnc/01-basic-grammar.rnc` |
| Invalid RNG | `tests/fixtures/relax-ng/manual-qa/09-invalid-schema.rng` |
| Invalid RNC | `tests/fixtures/relax-ng/manual-qa-rnc/09-invalid-syntax.rnc` |
| RNG package | `tests/fixtures/relax-ng/manual-qa/11-multi-file-includes.zip` |
| RNC package | `tests/fixtures/relax-ng/manual-qa-rnc/11-multi-file-includes.zip` |
| RNG blocked reference | `tests/fixtures/relax-ng/manual-qa/17-blocked-external-uri.zip` |
| RNC blocked references | `tests/fixtures/relax-ng/manual-qa-rnc/17-blocked-references.zip` |
| RNG cycle | `tests/fixtures/relax-ng/manual-qa/18-cycle-project.zip` |
| RNC cycles | `tests/fixtures/relax-ng/manual-qa-rnc/18-cycles.zip` |
| Large RNG | `tests/fixtures/relax-ng/manual-qa/07-large-semantic-model-a.rng` |
| Compact semantic model | `tests/fixtures/relax-ng/manual-qa-rnc/07-large-semantic-model-a.rnc` |
| DocBook | `tests/fixtures/relax-ng/conformance/real-world/docbook-5.1/docbook.rng` |
| Mixed DTD/XSD/RNG/RNC | `tests/fixtures/relax-ng/manual-qa-rnc/19-mixed-inventory.zip` |
| DTD smoke | `tests/fixtures/dtd/library.dtd` |
| XSD smoke | `tests/fixtures/xsd/attributes.xsd` |

The existing compact semantic fixture is small despite its filename; the
automated browser audit additionally generates a 1,000-definition RNC stress
input outside the repository. No new checked-in fixture is required for QA.

- **Standalone RNG and RNC:** Open each basic file, Search `book`, Inspect a
  result without moving the carousel, then use **Center this node**. Navigate
  through the panel, cards and drag. Rootward/previous is left; leafward/children
  is right. Open source, close with Escape, and confirm focus returns usefully.
- **Source and copy:** For RNG confirm original XML syntax; for RNC confirm
  original Compact Syntax. Copy source and paste into a plain-text editor.
  Compare it with the exact displayed original fragment. Copy the node summary
  separately; confirm it is a readable summary and neither action navigates.
- **Invalid replacement and Problems:** Load a valid project, then invalid RNG
  and invalid RNC. The old project stays open. Dismiss the banner, reopen the
  retained Problems report, Tab into **Problem details**, scroll with the
  keyboard, close with Escape and retry with a valid input. Successful retry
  clears the old report.
- **Packages:** Open RNG, RNC and mixed packages. Expand schema-source inventory
  and original source. Follow include/external dependencies and inspect source
  identity. Confirm independent source roots and no invented cross-format link.
- **Blocked references:** Inspect the blocked relationship and literal target.
  With browser developer tools Network open, confirm no request to the referenced
  schema or a `file:` URL. Missing/blocked targets should not gain fabricated
  children.
- **Cycles:** Navigate repeatedly through both cycle packages; the carousel and
  Navigation remain usable and bounded. Rootward follows your actual journey.
- **DocBook:** Open, Search `book`, center, inspect and view source. The UI should
  remain usable without rendering the whole graph at once.
- **Zoom and focused Overview Inspect:** Move through Full, Compact and Overview.
  Verify the same focus/path and source target. In Overview, activate focused
  Inspect with pointer and keyboard Space/Enter. Inspect a different result and
  confirm only **Center this node** changes focus.
- **Phone width:** At roughly 390 pixels wide, exercise Search, Inspector,
  source/copy and a long Problems report. Check no horizontal document overflow,
  reachable controls and useful focus after reflow.
- **Keyboard-only flow:** Use Tab/Shift+Tab through import controls, Search,
  Navigation, Inspect, Center, zoom, source and Problems. Use carousel arrows
  and Escape. Text-input arrows must keep their native editing behavior.
- **DTD/XSD smoke:** Open both legacy fixtures and repeat Search, navigation,
  Inspector and source. Confirm the established behavior remains intact.

Chrome/Firefox automation already covers the complete representative matrix;
Ben need not manually duplicate every automated case. Report any discrepancy
against this exact working tree. Do not stage, commit, integrate, tag or release
until the separate approval and exact-tree integration step.
