# W3C XML Schema 1.0 conformance fixtures

This directory pins the W3C XML Schema Test Suite distribution
`xsts-2007-06-20.tar.gz` (4,367,182 bytes; SHA-256
`902176b25e4111cf96b08663107521a4992e8ea67aad6b815592a6a5b4b9ea06`).
The official source is
`https://www.w3.org/XML/2004/xml-schema-test-suite/xmlschema2006-11-06/xsts-2007-06-20.tar.gz`.

`selected-tests.json` inventories every considered schema test from the 32
official metadata files and records deterministic selection or exclusion.
`ci-corpus/` contains only the official files needed by the bounded offline CI
subset. The complete corpus remains in the ignored spike cache and is never
committed.

The W3C distribution's notice is preserved in `00COPYRIGHT`. Its materials are
provided under the W3C Document Notice and License identified there.
