# Xerces-C++ WebAssembly feasibility spike

This directory is an isolated, developer-only Task 13.2 experiment. It is not
imported by the production XML Carousel application or schema-import worker.

Pinned inputs are recorded in `versions.json`. Downloaded source, the local SDK,
build trees, and generated browser artifacts are narrowly ignored beneath this
directory. After one online bootstrap, both bootstrap scripts support `-Offline`.

Canonical commands:

```powershell
npm run spike:xerces:bootstrap-source
npm run spike:xerces:bootstrap-toolchain
npm run spike:xerces:bootstrap-build-tools
npm run spike:xerces:bootstrap-w3c
npm run spike:xerces:build
npm run spike:xerces:test
npm run spike:xerces:build-harness
npm run spike:xerces:verify-harness
npm run spike:xerces:compare
npm run spike:xerces:benchmark
npm run spike:xerces:dev -- --host 127.0.0.1
npm run spike:xerces:serve-harness
```

After the first successful bootstrap, source, toolchain, build-tool, and W3C
integrity checks can be repeated without network access by appending
`-- -Offline` to the corresponding bootstrap command.

The harness has its own Vite entry and output directory. The normal `npm run
build` neither reads nor generates spike artifacts.
