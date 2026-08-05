# Adversarial input and path-security stabilization

Task 13.8 audits and hardens the production import boundary at baseline
`bec4d47d84316e8ed20d4f11a6e59b70bad32798`. Apache Xerces-C++ 3.3.0
remains the authoritative standards engine. All imported content remains in the
in-memory virtual project; the application does not retrieve network resources
or read host files.

## Final limits

No accepted limit changed in this task.

| Boundary | Limit | Result at `limit - 1` | At limit | At `limit + 1` |
| --- | ---: | --- | --- | --- |
| ZIP bytes | 20 MiB | accepted for discovery | accepted for discovery | blocked before metadata work |
| ZIP file entries | 1,000 | accepted | accepted | resource-limit failure |
| ZIP schema entries | 250 | accepted | accepted | resource-limit failure |
| Extracted schema entry | 5 MiB | accepted | accepted | bounded extraction failure |
| Aggregate extracted schema bytes | 20 MiB | accepted | accepted | bounded extraction failure |
| Xerces project files | 250 | accepted | accepted | resource-limit failure |
| Xerces project bytes | 20 MiB | accepted | accepted | resource-limit failure |
| Archive/project path | 512 Unicode code points | accepted | accepted | resource-limit failure |
| Archive/project path depth | 32 segments | accepted | accepted | resource-limit failure |
| Dependency depth | 32 edges | accepted | accepted | resource-limit failure |
| Retained diagnostic details | 500 | retained | retained | 499 details plus an explicit terminal truncation diagnostic |
| Worker lifetime | 30 seconds | unchanged | timeout terminates the worker | not applicable |

The package loader now checks an excessive declared uncompressed size before
starting extraction and also counts actual streamed bytes. It pauses and rejects
the entry immediately when the per-entry or aggregate limit is exceeded. A
declared size is only a preflight optimization, never the authoritative check.
No compression-ratio policy was introduced.

## Audit matrix

| Input family | Baseline coverage and reproduced behaviour | Required result | Category/code | Activation and cleanup | Correction |
| --- | --- | --- | --- | --- | --- |
| Archive readability/identity | Zero bytes, truncated/corrupt data, directories, ignored files, unsafe original names, duplicates and sanitized-name mismatches were already covered | Fail atomically | `archive-package` or `security` | Previous project retained; worker ends | Added explicit category normalization and retained-report coverage |
| ZIP byte/count boundaries | One-sided over-limit tests existed | Accept through the exact limit; reject `+1` | `resource-limit` | No partial activation | Added `-1`, exact and `+1` tests for bytes, file entries and schema entries |
| Extracted sizes/compression | Loader accumulated `async('uint8array')` before checking actual bytes | Stop bounded extraction; distrust metadata | `resource-limit` or `archive-package` | Extracted content released after failure | Replaced accumulation with paused JSZip streaming plus declared-size preflight and actual-byte accounting |
| Archive paths | Traversal and collisions were covered, but C1 controls and some exact boundaries were absent | Reject unsafe/control paths; preserve literal percent names; deterministic collision result | `security` or path resource code | No activation | Added C1, code-point/depth boundaries and combined case/NFKC entry-order tests |
| Supplied project paths | TypeScript accepted C1 controls; native/TypeScript agreement was incomplete | Relative canonical POSIX paths only | `security`, or `resource-limit` for length/depth | Adapter does not start on policy failure | Reject C1 and invalid percent input consistently in both layers |
| Dependency references | TypeScript rejected exact `project:///`; query/fragment were accepted; native reported policy blocks as missing | Resolve only local canonical references; distinguish policy from absence | `xerces:security-reference-blocked`, `xerces:missing-project-dependency`, or `xerces:resource-path-limit` | No retrieval; no partial activation | Aligned TypeScript and native resolution and diagnostics |
| Dependency depth/cycles | No explicit pre-adapter depth guard | Accept 31/32, block 33; cycles and diamonds remain cycle-safe | `xerces:resource-dependency-depth` | Adapter not started for depth breach | Added prefix-aware XSD edge scan and DTD SYSTEM/PUBLIC scan, ignoring comments/CDATA/foreign appinfo |
| DTD entities and expansion | Xerces recursion, parameter-entity, conformance and worker lifetime tests existed | Xerces decides validity; local supplied entities work; external retrieval blocked; lifetime bounded | Standards, dependency, security, or timeout resource category | Cancellation/timeout terminates exact worker; recovery works | Extended external parameter-entity depth boundary; preserved native entity behaviour |
| XSD hostile structures | Deep/broad/recursive/annotation/conformance fixtures and tolerant visualization tests existed | Preserve valid complete/partial versus invalid/unsupported distinctions | Standards, unsupported, visualization, dependency, security, or resource category | Fatal cases do not activate | Added depth/cycle and false-edge regressions; no parser replacement |
| Diagnostic retention | Standards reports had a cap; normalized archive/package reports did not expose a separate category or bounded detail list | Exact total with bounded deterministic details | Eight distinct presentation categories | Problems remains available after banner dismissal | Added `security` and `archive-package`, a 500-detail normalized cap, and terminal marker |
| Worker lifecycle | Task 13.7 covered cancel, timeout, late-result rejection, previous-project preservation and immediate recovery | One worker per import, zero live workers after every terminal path | Timeout is `resource-limit` | Previous project remains usable; fresh import succeeds | Reused and included the Task 13.7 controller/client gates |

## Archive path policy

ZIP entry names are canonicalized as archive paths, not URL references. Ordinary
nested POSIX names are accepted. Repeated separators and dot segments normalize
only when the result remains a valid relative entry. Leading slash, UNC, drive,
backslash, root escape, trailing separator on a file, NUL, C0, DEL, C1, overlong
paths and over-deep paths are rejected.

Literal `%2e%2e` and `%252e%252e` archive names stay literal; the archive layer
does not percent-decode them. JSZip's sanitized loaded name is cross-checked with
its unsafe original name so sanitization cannot hide traversal. Portable
identity applies case folding and Unicode NFKC for collision detection, without
creating lookup aliases. Case-only, normalization-equivalent and combined
case/NFKC collisions fail deterministically regardless of entry order.

## Controlled project and reference policy

Supplied files use unique, relative, root-based POSIX paths. Empty, absolute,
UNC, drive, URI-qualified, backslash, repeated-separator, dot, parent, control,
invalid-percent and decoded traversal forms are rejected. Percent decoding is
repeated to expose single-, double- and triple-encoded traversal. Decoded path
length and segment depth are bounded. There is no case, Unicode-normalization,
basename or ambiguous-path fallback.

References resolve against the canonical directory of the referring document.
`child.xsd`, `./child.xsd`, nested paths and safe parents such as
`entities/../common.xsd` are accepted when their normalized result remains
inside the virtual root. Exact `project:///path/to/file.xsd` is the only
qualified internal form. A root escape, malformed `project:` form, absolute,
UNC, drive, `http:`, `https:`, `file:`, `ftp:`, `data:`, `jar:`, empty,
query-bearing, fragment-bearing, control-bearing or invalidly encoded reference
is a security-policy failure. A safe canonical reference to an absent supplied
file is instead a blocked/missing dependency.

No `schemaLocation` or entity identifier is rewritten. Resolution never falls
back to the network, a host filesystem, a basename, case-insensitive lookup or
Unicode-equivalent alias.

## Dependency and expansion policy

The dependency guard follows XSD include/import/redefine elements only when the
schema root's prefix is bound to the XML Schema namespace. Comments, CDATA and
foreign annotation/appinfo do not fabricate edges. DTD SYSTEM and PUBLIC
identifiers participate in the same depth guard. Depths 31 and 32 pass; depth
33 is blocked before native validation. Active-path cycle detection permits
direct/indirect cycles, repeated shared dependencies and diamonds so legal
recursive models are not mistaken for depth attacks.

Xerces remains responsible for XML and schema validity, entity declaration
rules, recursive/mutually recursive entities, conditional sections, notation
interactions and expansion semantics. Only locally supplied virtual-project
resources may resolve. Worker cancellation and the unchanged 30-second lifetime
are the hard execution bounds for expansion or hostile structure workloads.

## Diagnostic policy

The normalized report distinguishes `standards-invalid`,
`blocked-dependency`, `unsupported-standard`, `security`, `resource-limit`,
`engine-internal`, `archive-package` and `visualization-limitation`. Native
policy-blocked references and missing local dependencies use different codes.
Messages do not expose raw host paths, WASM memory details or hostile raw
reference text.

The report retains at most 500 details. When more exist, it retains the first
499 in deterministic order and adds a terminal resource-limit diagnostic while
preserving the exact uncapped total count.

## Native runtime correction

Focused failing spike tests proved that the project-controlled native adapter
did not fully enforce the accepted path policy. Only
`tools/xerces-wasm-spike/native/adapter.cpp` changed; vendored Xerces source and
the pinned 3.3.0 version are unchanged. The adapter now:

- rejects invalid percent encodings during each of three bounded decode passes;
- rejects C0, DEL and UTF-8 encoded C1 controls;
- accepts exact `project:///` only for qualified internal references/base URIs;
- rejects query and fragment components;
- enforces 512 decoded Unicode code points and 32 path segments;
- distinguishes security-policy blocks, path resource limits and missing local dependencies.

Two clean `npm run spike:xerces:build` builds, after removing
`tools/xerces-wasm-spike/build/xerces-js-exceptions` and
`tools/xerces-wasm-spike/dist`, produced byte-identical artifacts with no source
change between builds.

| Artifact | Old size/SHA-256 | New size/SHA-256 |
| --- | --- | --- |
| `xerces-runtime.js` | 27,151 bytes / `FD2DE2CEED27639BDF632E0DE813D6055CDF7D45635C8491B37DA16EDD0C003C` | 27,151 bytes / `E00A4618D52F24AA24A8D6D49173CFB2A7556627A7C71EF54650DDE00923BECC` |
| `xerces-runtime.wasm` | 2,160,019 bytes / `ECBBA542BC0BB6FD1C9A9243BA1666A4A5C08F441C72483EE8E4371C50DC62D7` | 2,162,515 bytes / `4B12DE73B9B8CA974EA9CACA2BCF38B7538C4A48FAC8F52A98A80CFBDEC6AB74` |

Gzip sizes changed from 6,495 to 6,497 bytes for JavaScript and from 546,505
to 547,399 bytes for WASM. The runtime manifest records these identities and
the qualified-namespace, encoding, query/fragment, control-character and
diagnostic-category policies.

## Repeatable audits

Run the focused CI subset or complete local matrix as follows; the output path
must be outside the repository:

```powershell
npm run audit:adversarial-import-boundary -- --ci --output "$env:TEMP\xml-carousel-adversarial-ci.json"
npm run audit:adversarial-import-boundary -- --output "$env:TEMP\xml-carousel-adversarial-full.json"
```

Each case has a 120-second process timeout. The report includes case/family,
expected and actual category/activation, duration, timeout/cancel result, live
worker count, external and `file:` request counts, console errors,
previous-project preservation and recovery result. The completed local audit
ran six cases: six passed, zero failed, zero external requests, zero `file:`
requests and zero live workers.

The ordinary verification matrix also includes:

```powershell
node scripts/audit-standards-engine-lifecycle.mjs --browser chrome --browser-path 'C:\Program Files\Google\Chrome\Application\chrome.exe' --hermetic-path 'E:\Work\Hermetic Foundry\xml-schemas.zip' --mixed-cycles 30 --hermetic-cycles 10 --output "$env:TEMP\lifecycle-chrome.json"
node scripts/audit-standards-engine-lifecycle.mjs --browser firefox --browser-path 'C:\Program Files\Mozilla Firefox\firefox.exe' --geckodriver-path "$env:TEMP\xml-carousel-task-13-8-tools\geckodriver.exe" --hermetic-path 'E:\Work\Hermetic Foundry\xml-schemas.zip' --mixed-cycles 30 --hermetic-cycles 10 --output "$env:TEMP\lifecycle-firefox.json"
npm run audit:hermetic-foundry -- --path 'E:\Work\Hermetic Foundry\xml-schemas.zip' --output "$env:TEMP\hermetic.json"
```

Chrome 150.0.7871.187 and Firefox 153.0.1 each passed 30 mixed
DTD/XSD/ZIP/invalid/cancel/recovery cycles and 10 complete Hermetic Foundry
imports. Both passed root and nested deployment, hostile WASM MIME, zero page
errors, zero console warnings/errors, zero external and `file:` requests, no
`.mjs` production requests, zero live workers between imports, and containment
at 1440x900, 1280x720, 1024x768, 700x900, 412x915, 390x844, 915x412 and
844x390. Chrome's first/final three-cycle heap medians were 6,768,160 and
7,261,984 bytes, within the allowed 33,554,432-byte increase; Firefox WebDriver
does not expose the equivalent heap metric. Chromium viewport emulation is not
actual Samsung hardware testing, and Safari is not claimed.

The unchanged Hermetic archive was 134,821 bytes with SHA-256
`C17CE1C44CD5AA309BCC652BB43F64E30BC993AEF52A0347CFBC799A32886A8F`.
It produced 38 XSD sources, 2,134 supported nodes and a partial visualization
with 510 findings split 392 invalid-annotation-placement, 38
multiple-annotations and 80 unsupported-component. Its 39 safe local
references resolved. The standalone `foundry-common.xsd` probe remained a
blocked dependency because `foundry-rich-text.xsd` was not supplied.

## Deterministic production build

Two clean builds, each followed by `npm run verify:dist -- --base=./`, produced
the same 12-file inventory. The worker changed from the Task 13.7 identity
because it bundles the authorized path-policy, dependency-depth and diagnostic
runtime changes.

| Production file | Bytes | SHA-256 |
| --- | ---: | --- |
| `assets/index-B88Sd999.css` | 78,937 | `1CDEE6D0508D9BE611D6893147079E1C7F5D1FB1515718B510572FCC2B8B563B` |
| `assets/index-D4YH9n55.js` | 407,097 | `32891D20082698EDCED58B741CE2237D392B7C096D97772FC876DB49E20EF2E4` |
| `assets/LICENSE.emscripten-B2z4oyCl.txt` | 1,326 | `99D9A9616FBDE3F5EE22A71D8645799A8522D48526130C5BA6DC27AD15CE01F1` |
| `assets/LICENSE.xerces-CIVX19zl.txt` | 11,358 | `CFC7749B96F63BD31C3C42B5C471BF756814053E847C10F3EB003417BC523D30` |
| `assets/NOTICE.xerces-CKTk4Q_3.txt` | 560 | `95E5CCA2FF3D0801841D9D17F0EEC16BFB02DD6893FF7E55DA4EC5A5DD30AA52` |
| `assets/runtime-manifest-Dn0tC2PW.json` | 1,958 | `EFB290059722ED95AF6E7208E24917E04F6D7DD066DE4BB0C28EE78E99518951` |
| `assets/schemaImportWorker-C-dDNlDC.js` | 281,087 | `47DD473239E84E3FB2C03F84554039FDE221D375DE0892E3D090E3CAF0E5D198` |
| `assets/schemaImportWorker-DmzK6d_I.ts` | 1,923 | `56466ECC018A8EC96BAA671DA561729BDA4AB0CED379915977DEC904BDE88880` |
| `assets/xerces-runtime-BBH8HuGk.js` | 27,151 | `E00A4618D52F24AA24A8D6D49173CFB2A7556627A7C71EF54650DDE00923BECC` |
| `assets/xerces-runtime-C8Jf8PRy.wasm` | 2,162,515 | `4B12DE73B9B8CA974EA9CACA2BCF38B7538C4A48FAC8F52A98A80CFBDEC6AB74` |
| `assets/xml-carousel-logo-DOor6qT5.svg` | 1,048 | `49C0E129CB288D974F5C79041E2DD44C854EF328907F9AEE270CE8F145820574` |
| `index.html` | 529 | `27F2FBCEF42A58D2520060CCFB3BC9FC264DD41B00DEEF995A0343007A6D78F5` |

The verifier found one nonempty JavaScript worker, portable relative asset
paths, six Xerces runtime/attribution assets and no production `.mjs`.

## Validation results

- ESLint and Prettier checks passed; Svelte/TypeScript reported 0 errors and 0 warnings.
- Production Vitest passed 136 files and 1,988 tests.
- The Xerces spike passed 8 files and 51 tests.
- W3C CI remained 32 pass, 0 fail, 0 unsupported, 2 instance-dependent, 2 optional accepted, 10 optional reported, 2 security-blocked and 0 harness errors.
- W3C full remained 1,698 pass, 0 fail, 1 unsupported, 4 instance-dependent, 4 optional accepted, 19 optional reported, 9 security-blocked and 0 harness errors.
- Aggregate validation built 288 modules and passed runtime integrity, portable build and hostile-MIME gates.

## Ben's manual QA

Use bounded test fixtures only:

1. Open a valid project and establish a visible journey, Search and inspector state.
2. Open the prepared archive containing an unsafe path and confirm the previous project remains visible and usable.
3. Dismiss the red banner, reopen **Problems**, close it and confirm focus returns to its opener.
4. Open the prepared bounded resource-limit fixture and confirm it reports a resource failure without activation.
5. Start the deliberately slow bounded fixture, cancel it, and confirm the previous project remains usable.
6. Immediately open a valid DTD, XSD and ZIP in turn.
7. Confirm there is no stale Search, carousel, inspector, warning or Problems state after each success.
8. On the Samsung S26 Ultra, check portrait and landscape for page overflow, clipped Problems content and reachable controls.
9. Repeat the short failure/cancel/recovery sequence and confirm no visible freeze or progressive slowdown.

## Remaining limitations

The visualization extractors intentionally model only their documented DTD and
XSD subsets even though Xerces performs authoritative validation. Device memory
and speed still affect practical capacity inside the hard input and worker
bounds. A timeout can stop worker computation, but it cannot make arbitrary
hostile input useful. Browser QA does not certify Safari or actual Samsung
hardware.
