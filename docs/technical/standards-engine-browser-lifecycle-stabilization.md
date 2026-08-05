# Standards-engine browser and lifecycle stabilization

## Scope and baseline

Task 13.7 was audited and implemented on
`task-13.7-standards-engine-lifecycle-stabilization` from baseline
`162c4737c9349738296c85202797c6dab5cd1b39`. The accepted architecture is
unchanged: each import owns one fresh module worker, Xerces remains the
authoritative validity boundary, visualization remains tolerant, and the app
retains one active project and one diagnostic report. No backend, upload,
external retrieval, file-URL resolution, browser storage, worker pool, or
persistent worker was introduced.

The audited worker-client paths were success, standards failure, worker
failure, cancel, timeout, `error`, `messageerror`, malformed protocol, wrong
request ID, wrong format, constructor failure, `postMessage` failure, a
throwing progress observer, throwing listener cleanup, and throwing
termination. Controller coverage included destruction, supersession,
cancellation, successful activation, activation failure, warning/report
retention, and rapid A/B/C replacement. Store inspection confirmed successful
project activation resets navigation and inspector before atomically replacing
the active project; Search rebuilds from the active project/session revision.
No obsolete store reference requiring a disposal API was found.

## Defects and corrections

Two deterministic regressions exposed concrete cleanup defects:

1. A browser exception from one `removeEventListener` call prevented the
   remaining cleanup, worker termination, and promise settlement.
2. A worker task whose `cancel()` threw could escape controller cancellation,
   supersession, or destruction.

`schemaImportWorkerClient.ts` now clears the timer first, attempts each listener
removal independently, nulls the live worker before best-effort termination,
and releases its progress observer and resolver on settlement. It retains only
request ID, format, and filename in terminal callbacks. `schemaFileImportController.ts`
now treats cancellation cleanup as best effort while revision ownership remains
the authoritative stale-publication guard.

The ZIP test verifies that the transferred buffer is the client's one required
copy: the worker-message buffer is detached by structured transfer while the
caller-owned archive remains attached and byte-identical. Cancellation and
supersession clear the controller's active task reference. No second archive
copy was added.

Focused fake-worker tests prove exact-once settlement/termination, timer
clearing, listener-removal attempts, harmless repeated cancellation, ignored
late terminal/progress events, throwing cleanup behavior, and progress-observer
isolation. Restart tests cover constructor failure, `postMessage` failure,
runtime error, `messageerror`, protocol failure, timeout, and cancel; every
follow-up creates a distinct worker, reports progress, succeeds, and leaves all
prior workers terminated. Controller tests cover idempotent destruction with a
throwing cancel, late publication after destruction, rapid A/B/C late delivery,
and `DTD -> XSD -> ZIP -> DTD -> ZIP -> XSD` replacement with one activation per
success and report clearing.

Existing rendered integration coverage continues to exercise failed-import
state preservation, warning restoration, retained Problems priority and focus,
dialog closure/report replacement, Search/inspector/journey replacement,
cancellation, and immediate retry. The full production suite passed with 136
files and 1,926 tests; the two focused files passed 84 tests.

## Browser and tooling matrix

| Browser/tool | Version | Status and scope |
| --- | --- | --- |
| Google Chrome, Blink/V8 | 150.0.7871.187 | Installed real browser on Windows; automated production build, root and nested mounts, hostile MIME, eight viewports, 30 mixed cycles, 10 Hermetic cycles, CDP forced GC/heap/DOM/worker/network/console audit |
| Mozilla Firefox, Gecko/SpiderMonkey | 153.0.1 | Installed real browser on Windows; automated with temporary GeckoDriver 0.37.1; root and nested mounts, hostile MIME, DTD/XSD/ZIP, invalid import, cancellation/restart, Hermetic ZIP, capabilities, console and network |
| Microsoft Edge | 150.0.4078.105 installed | Recorded but not exercised because current installed Chrome satisfied required Chromium-engine coverage |
| Codex in-app browser, Chromium | environment-provided | Independent production root-load and real DTD file-chooser import smoke |
| WebKit/Safari | unavailable | No existing WebKit runtime and no Safari-capable host; Safari was **not** tested and compatibility is not claimed |
| Samsung S26 Ultra | unavailable to automation | Chromium viewport emulation is recorded below; it is not an actual-device claim and Ben's device pass remains required |

No permanent browser-testing dependency was added. Firefox automation used a
temporary Mozilla GeckoDriver outside the repository. Chrome used a temporary
profile and the DevTools protocol. Temporary profiles and JSON audit output
were also outside the repository.

Across Chrome and Firefox, feature checks passed for module workers,
WebAssembly, relative worker/WASM loading, native `<dialog>`, `inert`,
`structuredClone`, transferable `ArrayBuffer`, and all three file inputs. Root
and `/xml-carousel/` production mounts each completed DTD, XSD, and ZIP imports.
The hostile server returned WASM as `application/octet-stream`; there were no
production `.mjs`, `file:` or external-host requests, and no application
console warnings/errors or page errors.

## Viewports

Chrome exercised every required CSS viewport. Help was opened at each size to
check modal containment. All rows had no page-level horizontal overflow, no
modal clipping, required Open/Help controls present, and the carousel below the
top bar.

| Requested viewport | Top-bar bottom | Carousel top | Result |
| --- | ---: | ---: | --- |
| 1440 x 900 | 56 | 146.9375 | pass |
| 1280 x 720 | 56 | 146.9375 | pass |
| 1024 x 768 | 56 | 165.78125 | pass |
| 700 x 900 | 56 | 165.78125 | pass |
| 412 x 915 | 56 | 240.625 | pass |
| 390 x 844 | 56 | 240.625 | pass |
| 915 x 412 | 56 | 165.78125 | pass |
| 844 x 390 | 56 | 165.78125 | pass |

Successful import focused the new focused-card heading. Repeated imports left
no stale carousel transform or old-project UI. The Samsung dimensions above
are emulation only; touch capability was enabled for the four Samsung sizes.

## Quantitative lifecycle and memory audit

The reproducible runner is `scripts/audit-standards-engine-lifecycle.mjs`. It
serves the unchanged production `dist` at root and a nested mount through the
hostile-MIME server, uses fresh browser profiles, performs three warm-up
imports, and then runs 30 measured mixed cycles. Each mixed cycle performs valid
DTD, valid XSD, valid ZIP, standards-invalid DTD, large-DTD cancellation, and a
successful DTD replacement. After settlement it forces GC, waits for two
animation frames, and records heap, Chromium DOM counters, document element
count, app worker targets, retained-problem count, focused heading, and active
project. It then imports the unchanged Hermetic Foundry ZIP ten times.

Search-index document count and active graph node count are not exposed by the
production application and were not inferred through test-only production
telemetry. Store-level tests instead verify index revision/replacement, while
the visible project, element count, retained report, and worker target list were
recorded in the production browser.

### Complete mixed-cycle samples

All mixed samples ended on `library.dtd`, with focused-card heading focus,
zero retained problems, zero app workers, 180 document elements, and a constant
Chromium DOM-counter value of 3,810.

| Cycle | Used heap (bytes) |
| ---: | ---: |
| 1 | 6,576,624 |
| 2 | 6,766,888 |
| 3 | 6,817,288 |
| 4 | 6,909,496 |
| 5 | 6,968,132 |
| 6 | 6,954,132 |
| 7 | 6,981,648 |
| 8 | 7,044,584 |
| 9 | 7,106,896 |
| 10 | 7,096,020 |
| 11 | 7,148,260 |
| 12 | 7,142,424 |
| 13 | 7,140,816 |
| 14 | 7,145,420 |
| 15 | 7,154,692 |
| 16 | 7,157,944 |
| 17 | 7,190,304 |
| 18 | 7,180,852 |
| 19 | 7,187,920 |
| 20 | 7,190,116 |
| 21 | 7,209,980 |
| 22 | 7,224,736 |
| 23 | 7,219,240 |
| 24 | 7,241,652 |
| 25 | 7,228,040 |
| 26 | 7,235,868 |
| 27 | 7,239,128 |
| 28 | 7,275,640 |
| 29 | 7,259,660 |
| 30 | 7,265,312 |

The first-three median is 6,766,888 bytes. The final-three median is
7,265,312 bytes, an increase of 498,424 bytes. The allowed increase is
`max(20%, 32 MiB)` = 33,554,432 bytes, so the quantitative gate passes by
33,056,008 bytes. Least-squares slope is 16,463.29 bytes per cycle. Samples are
not monotonically increasing, the DOM count is constant, and the slope is small
relative to the alarm threshold; no lifecycle leak was established.

### Complete Hermetic package samples

All samples activated `xml-schemas.zip`, with zero retained problems, zero app
workers, 377 document elements, and a constant Chromium DOM-counter value of
4,341.

| Cycle | Used heap (bytes) |
| ---: | ---: |
| 1 | 20,190,092 |
| 2 | 20,367,128 |
| 3 | 20,377,264 |
| 4 | 20,376,256 |
| 5 | 20,377,964 |
| 6 | 20,379,564 |
| 7 | 20,380,136 |
| 8 | 20,391,128 |
| 9 | 20,389,068 |
| 10 | 20,395,672 |

## Conformance, artifacts, and external corpus

Validation results:

- ESLint and Prettier: pass; Svelte/TypeScript: 0 errors, 0 warnings.
- Production: 136 files, 1,926 tests.
- Xerces spike: 8 files, 46 tests.
- W3C CI: 32 pass, 0 fail, 0 unsupported, 2 instance-dependent, 2 optional
  accepted, 10 optional reported, 2 security-blocked, 0 harness errors.
- W3C full: 1,698 pass, 0 fail, 1 unsupported, 4 instance-dependent, 4
  optional accepted, 19 optional reported, 9 security-blocked, 0 harness
  errors.
- Runtime integrity, portable static build, hostile MIME, traversal/path
  policy, external-retrieval security, and aggregate validation: pass.

Two clean builds, without a source change between them, each transformed 288
modules and produced byte-identical 12-file inventories:

| Path | Bytes | SHA-256 |
| --- | ---: | --- |
| `index.html` | 529 | `20C142992D66C03927ED13FBDEF294342AE50CEB140BC2A6FD6EB1A3D13003F8` |
| `assets/index-B88Sd999.css` | 78,937 | `1CDEE6D0508D9BE611D6893147079E1C7F5D1FB1515718B510572FCC2B8B563B` |
| `assets/index-CEqNm4Eh.js` | 406,251 | `1218B2128CC75F29DE55993F00D3D26B355E53F84A586FD13E06D25FFAC96AFC` |
| `assets/LICENSE.emscripten-B2z4oyCl.txt` | 1,326 | `99D9A9616FBDE3F5EE22A71D8645799A8522D48526130C5BA6DC27AD15CE01F1` |
| `assets/LICENSE.xerces-CIVX19zl.txt` | 11,358 | `CFC7749B96F63BD31C3C42B5C471BF756814053E847C10F3EB003417BC523D30` |
| `assets/NOTICE.xerces-CKTk4Q_3.txt` | 560 | `95E5CCA2FF3D0801841D9D17F0EEC16BFB02DD6893FF7E55DA4EC5A5DD30AA52` |
| `assets/runtime-manifest-BqeY31yD.json` | 1,680 | `F36268BC37040EA9A623AD65C2281C763AFBE31689BEE171E829D605A7A83BF2` |
| `assets/schemaImportWorker-CynylNdo.js` | 278,710 | `39FE8FAEB9ED60F470A5FCCB255566504F135996BF02265D3ACD410A20495B33` |
| `assets/schemaImportWorker-DmzK6d_I.ts` | 1,923 | `56466ECC018A8EC96BAA671DA561729BDA4AB0CED379915977DEC904BDE88880` |
| `assets/xerces-runtime-DNVu8YhF.js` | 27,151 | `FD2DE2CEED27639BDF632E0DE813D6055CDF7D45635C8491B37DA16EDD0C003C` |
| `assets/xerces-runtime-rOwl3xz7.wasm` | 2,160,019 | `ECBBA542BC0BB6FD1C9A9243BA1666A4A5C08F441C72483EE8E4371C50DC62D7` |
| `assets/xml-carousel-logo-DOor6qT5.svg` | 1,048 | `49C0E129CB288D974F5C79041E2DD44C854EF328907F9AEE270CE8F145820574` |

The production worker and both Xerces artifacts exactly match the accepted
basenames, sizes, and hashes. No worker-runtime or native/runtime source was
changed or rebuilt.

The external Hermetic Foundry archive remained read-only and outside the
repository: 134,821 bytes, SHA-256
`C17CE1C44CD5AA309BCC652BB43F64E30BC993AEF52A0347CFBC799A32886A8F`.
The ordinary audit reports 38 XSD sources, 2,134 supported nodes, and partial
visualization with 510 findings: 392 invalid annotation placements, 38 multiple
annotations, and 80 unsupported components. The standalone
`foundry-common.xsd` dependency probe remains standards-invalid because the
unsupplied `foundry-rich-text.xsd` is blocked. No network access occurred.

Toolchain: Node 24.16.0, npm 12.0.1, Vite 7.3.6, Vitest 3.2.7,
Svelte Check 4.7.4, and Git 2.55.0.windows.3.

## Ben's Samsung S26 Ultra manual QA

Use the production build on the actual device in both portrait and landscape:

1. Open a valid DTD, XSD, and ZIP, then repeat the sequence twice. Confirm each
   project replaces the last and Search, Navigation, Inspector, source, and
   carousel show only the current project.
2. Start a large import, cancel after progress appears, and immediately open a
   valid file. Confirm the second import succeeds and focus reaches its centered
   card heading.
3. With a valid project open, import an invalid file. Confirm the project,
   journey, Search, inspector, and carousel stay unchanged.
4. Dismiss the red banner, open **Problems (N)**, close it, and confirm focus
   returns to the Problems control.
5. Load a partial project with the yellow warning, fail a later import, dismiss
   the red banner, and confirm the yellow warning returns while Problems still
   opens the latest failed-attempt report.
6. Rotate portrait to landscape and back with Help and Problems open in turn.
   Confirm each modal remains contained and closes safely with usable fallback
   focus.
7. Repeat project replacement and cancellation for several minutes. Confirm no
   stale results appear, controls remain responsive, and there is no visible
   progressive slowdown.

This checklist is the actual-device verification; desktop viewport emulation
does not replace it.
