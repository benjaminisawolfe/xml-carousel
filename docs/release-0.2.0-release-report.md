# XML Carousel 0.2.0 — Release and Deployment Report

XML Carousel 0.2.0 publication and canonical-site deployment completed on
2026-08-10. This report is the authoritative post-release closure record. The
[candidate report](release-0.2.0-candidate-report.md) remains unchanged as
historical pre-release evidence.

## Publication identity

- Version: `0.2.0`
- Release date: `2026-08-10`
- Annotated tag: `v0.2.0`
- Tag object: `8584d805caa734edbab712c6b4e2b16667304ff9`
- Release source commit: `1c744fd16079cbefcaf1f4c96d69c1897e9727ab`
- Release source tree: `1d246721ef83911fc358bafe3539d01149edec37`
- GitHub Release ID: `367670853`
- Release title: `XML Carousel 0.2.0 — Second Public Alpha`
- Prerelease: `true`
- Draft: `false`
- Attached assets: `0`
- Canonical site: https://xmlcarousel.wolfshafenpress.com/

The GitHub Release was published as a prerelease. Its generated source archives
were available normally; the static-site distribution was not attached as a
custom Release asset.

## Historical candidate identity

Candidate preparation began from commit
`ad46fd4cbb94b7460089cf241f0897930661ecdd`, tree
`b5c0425220514490a6a64b4f3538df5e4d625356`, on branch
`release-0.2.0-candidate`. The reviewed candidate became commit
`4f7581183a4efc0e3f2d5831ee7bce5361cb9d69`, with tree
`1d246721ef83911fc358bafe3539d01149edec37`. It was integrated by merge commit
`1c744fd16079cbefcaf1f4c96d69c1897e9727ab` without a content change.

The unchanged [0.2.0 candidate report](release-0.2.0-candidate-report.md)
records the automated, standards, deterministic-build, controlled-browser, and
pending-state evidence that was true before publication and deployment.

## Exact-SHA hosted CI

Hosted CI passed on the exact release source:

- Workflow run: `31353414205`
- Validate job: `93348391714`
- Tested SHA: `1c744fd16079cbefcaf1f4c96d69c1897e9727ab`
- Result: `success`
- Vitest: 173 test files and 2,295 tests passed
- Svelte: 0 errors and 0 warnings
- Complete visualization: 221/221
- DTD CI: 43 pass / 0 fail
- XSD CI: 43 pass / 0 fail
- Production build: passed
- Portable verification: passed
- Xerces runtime verification: passed
- Hostile-MIME verification: passed
- Release-integrity verification: passed

## Authoritative release distribution

The authorized hosting-neutral distribution contains 14 files totalling
3,257,270 bytes. Its canonical inventory SHA-256 is
`39f0f141b99f43aaeec8de09a189ec4f6ba65b06edbb55008179b8cf3147ddd9`.

| Path | Bytes | SHA-256 |
| --- | ---: | --- |
| `assets/index-BL1wGqMF.js` | 550893 | `a5ce793efcd4bff0d1748c495788dd9c37b1ec3ab18a50a39cb704032ff075b5` |
| `assets/index-COR_keLr.css` | 106339 | `d095ba104feef3b3e18be7b0e31c311de043c19022a7c53bdf2dcb36b0da9aad` |
| `assets/LICENSE.emscripten-B2z4oyCl.txt` | 1326 | `99d9a9616fbde3f5ee22a71d8645799a8522d48526130c5ba6dc27ad15ce01f1` |
| `assets/LICENSE.xerces-CIVX19zl.txt` | 11358 | `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30` |
| `assets/NOTICE.xerces-CKTk4Q_3.txt` | 560 | `95e5cca2ff3d0801841d9d17f0eec16bfb02dd6893ff7e55da4ec5a5dd30aa52` |
| `assets/runtime-manifest-Dn0tC2PW.json` | 1958 | `efb290059722ed95af6e7208e24917e04f6d7dd066de4bb0c28ee78e99518951` |
| `assets/schemaImportWorker-Caeajx9r.js` | 361477 | `7871cd146f0e18705bb2a7b195489883186bdafd032fc27ec43c692a4f215f82` |
| `assets/schemaImportWorker-DmzK6d_I.ts` | 1923 | `56466ecc018a8ec96baa671da561729bda4ab0ced379915977dec904bde88880` |
| `assets/xerces-runtime-BBH8HuGk.js` | 27151 | `e00a4618d52f24aa24a8d6d49173cfb2a7556627a7c71ef54650dde00923becc` |
| `assets/xerces-runtime-C8Jf8PRy.wasm` | 2162515 | `4b12de73b9b8ca974ea9caca2bcf38b7538c4a48fac8f52a98a80cfbdec6ab74` |
| `assets/xml-carousel-logo-DOor6qT5.svg` | 1048 | `49c0e129cb288d974f5c79041e2dd44c854ef328907f9aee270ce8f145820574` |
| `index.html` | 529 | `330b15bde677171ba5f443731695298282f4d0e71f9236e592c2325b04365df7` |
| `LICENSE.txt` | 7048 | `a2010f343487d3f7618affe54f789f5487602331c0a8d03f49e9a7c547cf0499` |
| `THIRD_PARTY_NOTICES.txt` | 23145 | `42634753356d915fab02027d81874fd3b2c73a53fc1a80619cf10f4e3f49f0b0` |

## Publication

Publication completed on 2026-08-10. Annotated tag object
`8584d805caa734edbab712c6b4e2b16667304ff9` identifies the exact release
source. GitHub Release ID `367670853` was published as a non-draft prerelease
with reviewed body SHA-256
`98c40bfd13142a1288e1672f3ce32f1f084cf52af529c2499484a55566ecbe7d`.

Deployment was still pending when the GitHub Release was published. The public
body therefore correctly preserves publication-time wording; synchronization
to the completed deployment state is a separate post-integration action.

## Manual FTP deployment

Ben explicitly authorized canonical-site deployment. The preserved, verified
`dist/` package was used without rebuilding. Every release file was transferred
in Binary/Image mode, all 11 assets were uploaded before the root notice files,
and `index.html` was uploaded last. Ben then reconciled remote release-owned
files to the exact 14-file manifest. No hosting credentials or private remote
filesystem path are part of this record.

## Deployed-byte verification

Every manifest path was fetched over HTTPS using a unique cache-bypass query,
`Cache-Control: no-cache, no-store`, `Pragma: no-cache`, and raw byte handling.
Each response required HTTP 200, the exact byte length, and the exact SHA-256.

- Matched release files: 14 / 14
- Missing release files: 0
- Byte-mismatched release files: 0
- Live canonical inventory SHA-256:
  `39f0f141b99f43aaeec8de09a189ec4f6ba65b06edbb55008179b8cf3147ddd9`

Fresh `/` and `/index.html` responses were byte-identical and matched the
expected 529-byte index. Historical primary bundle URLs
`assets/index-KlEeE3EJ.js` and `assets/index-n4v__Uad.css` returned HTTP 404,
were absent from live HTML, and were not requested by either live browser.

## Production MIME verification

Observed production content types were:

- HTML: `text/html`
- CSS: `text/css`
- JavaScript: `application/javascript`
- JSON: `application/json`
- SVG: `image/svg+xml`
- Licences and notices: `text/plain`
- WebAssembly: `application/octet-stream`
- Retained `.ts` source asset: `video/mp2t`

The retained `.ts` file was byte-verified and is source input retained for
licensing/provenance; it is not an executable browser dependency. The accepted
WebAssembly octet-stream mode loaded successfully in both live browsers.

## Live Chrome verification

Chrome `151.0.7922.77` passed 15/15 lifecycle assertions across 30 replacement
cycles with 0 page errors and 0 console warnings/errors. The live run covered
direct and cache-bypassed loading; built-in and standalone DTD/XSD; resolved
ZIP; invalid-import and cancellation recovery; Search; rootward/leafward
navigation; independent Inspector; Full, Compact, and Overview semantic zoom;
focused Overview Inspect; source identity/location; exact Copy source;
deterministic Copy node summary; responsive containment; reduced motion; two
isolated 10,000-node imports; project replacement; and worker cleanup.

Chrome recorded zero live workers between imports and at completion. Its heap
sample remained within the accepted threshold.

## Live Firefox verification

Firefox `153.0.3` with geckodriver `0.37.1` passed 15/15 lifecycle assertions
across 30 replacement cycles with 0 page errors and 0 console warnings/errors.
It covered the same applicable live import, navigation, semantic-zoom,
focused-Inspect, source/copy, responsive, reduced-motion, large-schema,
recovery, and cleanup workflows.

Firefox completed every import and cancellation at idle and its isolated
session closed cleanly. Firefox heap and Chromium-style CDP worker-target
telemetry are not claimed.

## Network and privacy verification

Chrome captured 243 application requests and Firefox captured 575. Both used
the expected canonical application origin and current 0.2.0 primary bundles.

- Schema-upload requests: 0
- Remote-schema requests: 0
- Analytics, telemetry, or crash-reporting requests: 0
- `file:` requests: 0
- Unexpected application-origin requests: 0
- Old primary-bundle requests: 0

No schema, retained source, or node-summary content was transmitted to an XML
Carousel backend. Normal same-origin static asset requests were expected.

## Alpha limitations

XML Carousel 0.2.0 remains alpha-quality exploratory software. XSD 1.1 and XML
instance-document product input remain unsupported. Projects are read-only;
remote schema retrieval, arbitrary host-filesystem discovery, editing, export,
and persisted project/session reopening remain outside scope. Safari/WebKit and
manual screen-reader certification are not claimed. See
[Known limitations](known-limitations.md) for the complete accepted boundaries.

## Final release conclusion

XML Carousel 0.2.0 publication completed. The canonical deployment matches the
exact authorized 14-file release package. Deployed-byte verification passed.
Live Chrome and Firefox verification passed. No rollback is required.
