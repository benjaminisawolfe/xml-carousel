# Using XML Carousel

## What XML Carousel Does

XML Carousel is a browser-based, read-only explorer for XML schemas. It helps
you follow relationships, inspect definitions and constraints, and read the
source that supplied them. Your schema files stay in your browser: processing
is local, and XML Carousel has no schema-upload backend.

You can open DTD (`.dtd`), XML Schema 1.0 (`.xsd`), RELAX NG XML (`.rng`),
RELAX NG Compact Syntax (`.rnc`), and ZIP schema projects. XML instance
documents (the documents a schema describes) are not an input to this explorer.

## Getting Started

1. Visit <https://xmlcarousel.knowone.ca>.
2. Close **Help** with **Start exploring** to try the built-in Book DTD sample.
   Open **Help** again to load the Book DTD or Library XSD sample.
3. Click a card to bring it to the centre. Try **Inspect** on a different card
   to read its details without moving your place.
4. Use an import control when you are ready to explore your own schema:

| Control | Choose |
| --- | --- |
| **Open DTD** | A standalone `.dtd` file |
| **Open XSD** | A standalone `.xsd` file |
| **Open RNG** | A standalone `.rng` or `.rnc` file |
| **Open ZIP** | A ZIP containing a complete schema project and its dependencies |

**Open RNG accepts both `.rng` and `.rnc` files.** You do not need to convert
Compact Syntax to XML first.

A successful import replaces the current project. Finish or cancel an import
before starting another. Reloading the page restores the default sample;
projects are held in memory, not saved between visits.

## Understanding the Main Screen

- The **top bar** contains the import controls, **Help**, and panel controls.
- **Navigation** lists the project's available schema records. For a ZIP it
  also provides package and source context. Choose an entry to explore it.
- The **central carousel** shows the current focus and nearby relationships.
- The **Inspector** shows details for the node you choose to inspect.
- **Search** finds names and other retained schema information across the project.
- **Problems** provides import diagnostics, including missing or blocked references.

On a narrow screen, use the panel controls to reach the information you need.
Long lists and panels can scroll independently.

## Navigating the Carousel

The direction is always:

```text
rootward / previous journey step ← current focus → leafward / available destinations
```

Click a destination card to navigate. The rootward side records the route you
took; it is not necessarily every schema parent. A definition can be reused
from several places, and a relationship can lead back to something you have
already visited. Follow the relationship labels to understand the connection.

**Inspect** opens details without navigating. In the Inspector,
**Center this node** makes the inspected node the carousel focus and therefore
does navigate. You can also choose a node through Navigation or Search.

For pointer navigation, drag left to move leafward and right to move rootward.
Move up or down during a drag to choose a branch. Clicking a card remains an
alternative to dragging.

With keyboard focus in the carousel:

- **Down Arrow** selects the first leafward destination; **Up Arrow** selects
  the last. Use Up and Down to move through the available destinations.
- **Right Arrow** enters the first destination from the current focus, or the
  destination you have explicitly selected.
- **Enter** or **Space** activates an explicitly selected destination.
- **Left Arrow** or **Escape** returns from a selected destination to the
  current focus. From the current focus, Left Arrow returns one journey step.

Use **Tab** to reach buttons such as Inspect. Arrow keys in a text field retain
their normal text-editing role.

## Search

Search can find elements, types and definitions, attributes, references,
documentation and comments where retained, and package or source context.
Try a short distinctive name first; check each result's kind, filename, and
matching context when several results share a name.

For a navigable result, activate its main name button to navigate. Its
accessible action name begins with **Center**. The separate **Inspect** button
opens details without changing the journey. Some results instead offer an
inspection or package-entry action because they do not represent a navigable
card; follow the action shown for that result.

Search is broader than a list of declarations, but it is not a raw-text search
of every byte in every file. If a phrase is not indexed, open the relevant
source or use Navigation and the package inventory to locate it.

## Inspector

The Inspector brings together the selected node's details: source information,
constraints, attributes, documentation, and relationships such as related
definitions and **Used by** links. Available sections depend on the schema
construct. Incoming links show what uses a node; outgoing links show what it
refers to or contains. Not every relationship means parent and child.

**Inspecting a node does not change the current carousel journey.** This lets
you compare a related definition while keeping your place. Use
**Center this node** when you decide to navigate to it.

## Source View and Copy Tools

Use **View Source** where offered to open retained source for the selected
item. The source identity and available location information help you find its
original file. A node may show a relevant fragment rather than the whole file.

**Copy Source** copies the retained source text. **Copy node summary** copies a
plain-text description of the node; it is a summary, not a replacement schema
file. These tools do not edit or save your project.

For `.rnc`, source remains the original Compact Syntax. Internally generated
validation XML is never shown or copied as user source. Locations are displayed
only when they can be mapped reliably to the original input.

## Full, Compact, and Overview

Use **Full**, **Compact**, and **Overview** to change visual density:

- **Full** shows more detail on cards.
- **Compact** reduces card detail while keeping relationships available.
- **Overview** gives a smaller view of the surrounding structure.

All three show the same schema or project and retain the same focus and
journey. Switching density does not reload or convert the schema. Overview
still provides an explicit **Inspect** action, including for the focused node.

## Multi-File Projects

Use **Open ZIP** when a schema needs other files. Opening one file does not
give XML Carousel access to neighbouring files on your computer.

1. Put the entry schema and all required local dependencies in one project folder.
2. Preserve their relative paths when creating the ZIP. For example, a schema
   referring to `parts/common.xsd` needs that file at the corresponding path
   relative to the referring schema inside the archive.
3. Open the ZIP and review the package inventory and Problems.

This applies to DTD external dependencies; XSD `include`, `import`, and
`redefine`; RNG `include` and `externalRef`; and RNC `include` and `external`.
ZIPs may contain several supported schema formats. RELAX NG dependencies must
be supplied in the appropriate syntax family: XML Carousel does not silently
substitute `.rng` for `.rnc`, convert a dependency, or guess from its basename.

## Missing and Blocked References

In an inspectable project, XML Carousel retains a reference even when its
target is unavailable. It does not invent a missing target. A standalone
schema that requires an unavailable dependency cannot complete its import;
a ZIP may retain affected entries and their diagnostic status for inspection.

Remote references are not automatically fetched. `file:` references and paths
escaping the ZIP's project root are blocked. A relative `..` segment is usable
only when it stays inside that root after resolving the referring file's path.
Supplying a ZIP does not remove these restrictions.

## Problems and Invalid Files

An invalid import shows **Problems**. A failed replacement leaves the currently
loaded project available, so you can continue exploring it. Problems can
retain useful diagnostics after you dismiss the immediate error; return to
Problems to review them. A successful retry clears the failed-import diagnostics.

Read the message and source filename before changing your file. A line or
column may be omitted when XML Carousel cannot reliably map the diagnostic to
the original source, especially with Compact Syntax. Missing coordinates do
not mean the file was accepted.

## Privacy and Security

Schema contents are processed locally in your browser. XML Carousel has no
schema-upload backend and no analytics, telemetry, or crash-reporting
integration. It does not search your drive or fetch referenced schemas.

Loading the site still makes normal static-asset requests to the application
host for HTML, JavaScript, CSS, and validator files. This is not a promise that
the browser itself is offline; browser extensions and hosting infrastructure
are outside the application's control.

## Supported Standards and Important Limits

DTD/XML and XSD 1.0 validation use Apache Xerces; RNG and RNC validation use
libxml2. Compact Syntax is translated internally for validation while the
original source is retained for exploration.

XSD 1.1 and XML instance validation are outside the supported product scope.
Remote external retrieval is deferred. Schemas depending on Validator.nu's
custom WHATWG datatype library meet an unsupported-library boundary; do not
interpret that as proof the schema is invalid. Safari is not release-certified.

See [Standards Support](standards-support.md) for supported constructs and
[Known Limitations](known-limitations.md) for resource limits, browser coverage,
and remaining standards boundaries.

## Troubleshooting

| Situation | What to Try |
| --- | --- |
| My schema says a dependency is missing. | Include the dependency in a ZIP and preserve its path relative to the referring schema. Selecting the entry file alone cannot supply sibling files. |
| My ZIP opens but a reference is blocked. | Check for a remote URL, `file:` URL, absolute path, or path escaping the project. Supply permitted local dependencies and correct references in your own editor, then reopen the ZIP. |
| My RNC file shows an error without a line number. | Read the diagnostic and filename. Check the original Compact Syntax in your editor; coordinates are omitted when mapping would be unreliable. |
| Search did not find what I expected. | Shorten the query, check the result context, or inspect the relevant source. Not all raw source text becomes a searchable record. |
| The carousel has many branches. | Try Compact or Overview, select a branch with Up/Down, or find a specific node in Search or Navigation. Inspect lets you examine a branch before entering it. |
| I opened the wrong file. | Use the appropriate Open control again or load a built-in sample from Help. A successful import replaces the project; a failed one keeps the current project available. |

## Where to Learn More

- [Standards Support](standards-support.md)
- [Known Limitations](known-limitations.md)
- [Third-Party Licensing](third-party-licensing.md)
- [0.3.0 Release Notes](third-public-alpha.md)
- [GitHub Repository](https://github.com/benjaminisawolfe/xml-carousel)
- [Open XML Carousel](https://xmlcarousel.knowone.ca)
