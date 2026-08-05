# Large manual-QA fixtures

Regenerate these files from the repository root with:

```powershell
node .\scripts\generate-large-manual-qa-fixtures.mjs
```

## DTD

- `dtd/large-10000.dtd`: 10,000 elements. Use for the normal large-project
  activation gate.
- `dtd/large-40000.dtd`: 40,000 elements. Use for the extreme activation,
  search, outline paging, navigation, and inspection gates.

Both files have one wide `root` content model followed by empty child elements.

## XSD

- `xsd/large-10000.xsd`: 10,000 global elements in one namespace-aware schema.
- `xsd/large-40000.xsd`: 40,000 global elements in one namespace-aware schema.

Use these to exercise Schema overview activation, grouped outline paging, search,
and global-element navigation.

## ZIP

- `zip/large-xsd-package-20x1000.zip`: 20 XSD files with 1,000 global elements
  each. The files form a resolved include chain.
- `zip/large-xsd-package-unresolved-10x1000.zip`: 10 XSD files with 1,000 global
  elements each. The resolved include chain also contains one deliberately
  missing include for unresolved-reference presentation.

The ZIP entries use deterministic names, content, timestamps, ordering, and
compression settings.
