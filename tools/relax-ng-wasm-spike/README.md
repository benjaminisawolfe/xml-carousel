# RELAX NG WebAssembly feasibility spike

This directory retains Task 17.2 comparison/reproducibility evidence and the
Task 17.3 build/publication tooling. It does not provide a user-facing RELAX NG
import workflow to the XML Carousel application.

Prerequisites and third-party sources are checksum-pinned in `manifests/` and
are downloaded into ignored directories. The libxml2 adapter accepts only
supplied virtual-project members and never delegates to libxml2's file or
network loader.

Run the focused Node evidence after bootstrapping/building:

```powershell
.\tools\relax-ng-wasm-spike\scripts\bootstrap.ps1
.\tools\relax-ng-wasm-spike\scripts\build.ps1
node .\tools\relax-ng-wasm-spike\node\run-synthetic.mjs
```

Launch the static browser harness:

```powershell
.\tools\relax-ng-wasm-spike\scripts\serve.ps1
```

Then open the root or nested URL printed by the server.

Build and publish the production XML-syntax runtime explicitly:

```powershell
npm run spike:relaxng:build-production
npm run vendor:relaxng:publish-runtime
npm run verify:relaxng-runtime
npm run test:relaxng-production
```

Build and serve the developer-only harness that imports the exact production
client and worker:

```powershell
npm run spike:relaxng:build-production-harness
npm run spike:relaxng:serve-production-harness
```

Set `XML_CAROUSEL_RELAX_NG_HOSTILE_MIME=1` before starting that server to serve
WASM (and any MJS request) as `application/octet-stream`. Generated builds,
downloads, and browser evidence remain ignored. Jing/Trang comparison, RNV,
the original spike harness, pinned manifests, and project-authored fixtures are
retained as development evidence.
