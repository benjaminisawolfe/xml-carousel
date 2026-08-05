# Upstream source changes

No Xerces-C++ source patch is applied by this spike.

The first build experiment used `-fwasm-exceptions -flto`. Emscripten 6.0.5's
Binaryen optimizer asserted while validating the linked module. The accepted
experiment therefore uses a separate generated build tree with Emscripten's
JavaScript exception mode (`-fexceptions -sDISABLE_EXCEPTION_CATCHING=0`) and
without LTO. Repeated `-O3` post-link optimizer crashes during adapter
iteration led the accepted build to use `-O2`. These are explicit
compiler-mode changes, not upstream source
transformation.
