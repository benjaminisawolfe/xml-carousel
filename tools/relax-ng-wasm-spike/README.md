# RELAX NG WebAssembly feasibility spike

This directory is developer-only evidence for Task 17.2. It does not provide
RELAX NG support to the XML Carousel application.

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
