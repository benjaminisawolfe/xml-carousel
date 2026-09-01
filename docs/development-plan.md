# XML Carousel Development Plan

# **1\. Project Summary**

**XML Carousel** is a serverless, browser-based visual navigation tool for XML schemas, including both formal XML Schemas/XSDs and Document Type Definitions/DTDs.

The goal is not to generate a static schema poster or documentation dump. The goal is to let users **travel through a schema** using an animated carousel metaphor.

The current schema node appears as a large focused card in the center of the screen. Nodes closer to the document root appear to the right. Nodes farther from the document root appear to the left. Dragging horizontally moves through schema depth; dragging vertically while moving horizontally selects among sibling branches.

The project should be developed using a **spiral RAD model**: build a small working prototype, evaluate the interaction, refine it, then add capability in successive spirals.

---

# **2\. Core Product Concept**

## **2.1 Spatial Model**

The carousel represents schema navigation like this:

leafward / children  ←  current focus  →  rootward / parents

The **center card** is the currently focused schema node.

The **right side** shows rootward context:

* parent elements  
* containing declarations  
* using declarations  
* previous nodes in the user’s navigation path

The **left side** shows leafward context:

* child elements  
* content-model members  
* contained particles  
* referenced types or definitions  
* available branches

The key principle is:

> Horizontal movement changes schema depth. Vertical movement chooses among branches.

Example DTD:

\<\!ELEMENT book (front.matter, book.content, index)\>

When `book` is focused, the three child branches appear to the left:

front.matter  
book.content  
index

Dragging left/up focuses `front.matter`.

Dragging left/center focuses `book.content`.

Dragging left/down focuses `index`.

Dragging right moves back toward `book`’s parent/rootward path.

---

# **3\. Product Principles**

## **3.1 Do Not Draw the Whole Schema**

XML Carousel must avoid the “schema hairball” problem.

It should not try to render every node and every edge at once. The UI should show:

* where the user is  
* where they came from  
* what nearby paths are available  
* what selected node means  
* how to move deeper or rootward

The schema graph may be large internally, but the visible UI should remain local, navigable, and legible.

## **3.2 The Carousel Shows a Journey, Not the Entire Graph**

XSD schemas are often graphs, not trees. A type may be reused by many elements. An element may be referenced from multiple places.

The carousel should preserve the **navigation path the user took**, rather than pretending each schema node has only one parent.

Example:

book → chapter → author → personType

If `personType` is also used by `editor`, the carousel still shows the path through `author`. The inspector can show that `personType` is also used elsewhere.

## **3.3 Focused Card Is Not the Inspector**

The center card should orient the user. It should not become a full documentation panel.

The right-side inspector provides deeper details.

---

# **4\. Recommended Technical Stack**

XML Carousel should be a static, serverless browser application.

Recommended stack:

TypeScript  
Svelte \+ Vite  
Plain CSS / CSS modules  
SVG for connector lines  
HTML/CSS cards for schema nodes  
Web Workers for parsing large schemas  
IndexedDB for local cache / recent projects  
JSZip for ZIP import  
Vitest for unit tests  
Playwright for UI and gesture tests

Avoid, at least initially:

Server-side backend  
Database server  
Mandatory cloud upload  
Heavy graph visualization libraries  
Complex framework routing  
SSR  
Generic graph-layout engines

The application should run entirely in the browser.

Build output should be static files:

npm run build  
/dist

The `/dist` folder should be deployable to GitHub Pages, Netlify, a local static server, or opened through a browser-compatible static workflow.

---

# **5\. Project Architecture**

Recommended source structure:

src/  
  app/  
    App.svelte  
    stores/  
      schemaProjectStore.ts  
      navigationStore.ts  
      viewportStore.ts  
      inspectorStore.ts

  schema/  
    model/  
      SchemaNode.ts  
      SchemaEdge.ts  
      SchemaProject.ts  
      SchemaPath.ts  
      SchemaAnnotation.ts  
      DtdComment.ts

    xsd/  
      parseXsd.ts  
      resolveXsdReferences.ts  
      xsdIndex.ts

    dtd/  
      parseDtd.ts  
      dtdContentModel.ts  
      dtdCommentAttachment.ts

    normalize/  
      buildSchemaGraph.ts

  ui/  
    layout/  
      AppShell.svelte  
      TopBar.svelte  
      LeftPanel.svelte  
      InspectorPanel.svelte

    carousel/  
      SchemaCarousel.svelte  
      FocusCard.svelte  
      ContextCard.svelte  
      BranchFan.svelte  
      ConnectorLayer.svelte

    cards/  
      ElementCard.svelte  
      ComplexTypeCard.svelte  
      SimpleTypeCard.svelte  
      AttributeCard.svelte  
      DtdElementCard.svelte  
      DtdAttributeCard.svelte

    inspector/  
      NodeInspector.svelte  
      SourceSnippet.svelte  
      UsedByList.svelte  
      AttributeList.svelte  
      ChildrenList.svelte  
      DocumentationPanel.svelte  
      CommentsPanel.svelte

  workers/  
    schemaParseWorker.ts

  tests/

Architectural rule:

> Parsers produce a normalized schema graph. UI components consume that graph. UI components must not directly perform XML archaeology.

---

# **6\. Normalized Schema Model**

The UI should consume a normalized graph model that works for both XSDs and DTDs.

## **6.1 Schema Node Kinds**

XSD node kinds:

schema  
globalElement  
localElement  
complexType  
simpleType  
attribute  
attributeGroup  
group  
sequence  
choice  
all  
extension  
restriction  
enumeration  
import  
include

DTD node kinds:

dtdElement  
dtdContentModel  
dtdAttributeList  
dtdAttribute  
dtdEntity  
dtdNotation

## **6.2 Schema Edge Kinds**

Possible edge kinds:

contains  
typeOf  
extends  
restricts  
references  
usesAttribute  
usesAttributeGroup  
usesGroup  
substitutes  
imports  
includes  
usedBy

## **6.3 Navigation Path**

Maintain a path separate from the schema graph.

navigationPath \= \[book, book.content, chapter, section, para\]

The carousel uses this path to determine what appears rootward/right of the focused card.

The schema graph is used to determine children, references, used-by relationships, and alternate possible paths.

---

# **7\. User Interface Design**

## **7.1 Main Layout**

The app should have four major areas:

Top bar  
Left navigation/search panel  
Central animated carousel  
Right inspector panel

## **7.2 Top Bar**

Include:

XML Carousel app name  
Open XSD / DTD / ZIP button  
Search field  
View mode selector  
Reset view  
Settings / help

## **7.3 Left Panel**

Include:

Loaded schema set outline  
Global/root elements  
Named complex types  
Named simple types  
DTD elements  
Recent paths  
Search results

## **7.4 Central Carousel**

The carousel is the primary interface.

It should show:

Current focused node in center  
Rootward path cards trailing to the right  
Leafward child/branch cards to the left  
Connector lines between visible related nodes  
Smooth animation when focus changes

Cards should shrink as they recede from the center.

The visible carousel should always remain readable. It must not pack hundreds of schema parts onto the screen.

## **7.5 Right Inspector**

The inspector shows full detail for a specific inspected node.

Important rule:

> Opening the inspector must be a specific visible action. Ordinary card click must center/focus the card in the carousel.

Card body click:

Center/focus this card in the carousel.

Card “Inspect” or “Details” control:

Open or update the side inspector for this card.

The carousel focus and inspector target are separate pieces of state:

carouselFocusNodeId  
inspectorNodeId

Usually they will be the same, but they do not have to be.

If the inspector is showing a node that is not currently centered, the inspector should include:

Center this node

---

# **8\. Focused Card Content**

The central focused card should answer five questions quickly:

What am I looking at?  
What kind of schema thing is this?  
What does it contain?  
What constrains it?  
Where can I go next?

The focused card should include:

Display name  
Node kind  
Namespace/prefix when relevant  
Type/reference/base type when relevant  
Occurrence/cardinality when relevant  
Compact content model or child summary  
Attribute count  
Documentation/comment indicator  
Used-by count or parent-path hint  
Short documentation/comment excerpt when available

Example DTD card:

book  
DTD element

Content model  
(front.matter, book.content, index)

Children  
1\. front.matter  
2\. book.content  
3\. index

Attributes: 4  
Comment: yes  
Used by: 1  
Details

Example XSD element card:

hf:identity  
element

type: hf:entityIdentityType  
occurs: 1  
namespace: foundry

Children: 5  
Attributes: 1  
Documentation: yes  
Used by: hf:entity  
Details

Example XSD complex type card:

hf:entityIdentityType  
complexType

model: sequence  
children: 5  
attributes: 1

Used by:  
\- hf:identity

Documentation: yes  
Details

Example simple type card:

hf:entityKindType  
simpleType

base: xs:string  
restriction: enumeration  
values: 14

character, creature, covenant, laboratory…  
Details

---

# **9\. Card Interaction Rules**

Each card has two intentional interaction types.

## **9.1 Card Body Click**

Clicking the main card body:

Centers/focuses that card in the carousel.

## **9.2 Inspect / Details Control**

Each card should expose a deliberate control:

Details  
Inspect  
ⓘ  
Open details

Clicking that control:

Opens the side inspector for that card.  
Does not center the card unless the card is already focused.  
Does not trigger the ordinary card click.

Implementation guidance:

function onCardClick(nodeId: string) {  
  navigation.focusNode(nodeId);  
}

function onInspectClick(event: MouseEvent, nodeId: string) {  
  event.stopPropagation();  
  inspector.open(nodeId);  
}

---

# **10\. Drag Gesture Rules**

A drag has both horizontal and vertical movement.

If horizontal movement is below threshold, do not navigate.

If x \< 0:  
  user is navigating leafward.

If x \> 0:  
  user is navigating rootward.

When navigating leafward:

Identify visible child/branch cards.  
Choose the branch whose vertical center is closest to the drag endpoint.  
Preview that card by enlarging/highlighting it.  
On release past threshold, make it the focus.

When navigating rootward:

Move to the previous node in the current navigation path.  
If there is no parent/path node, do nothing.

Additional rules:

Escape cancels drag.  
Right-click cancels drag.  
Clicking a visible card jumps directly to it.  
Keyboard navigation should eventually support arrow-key movement.

---

# **11\. Handling Too Many Children**

Schemas often contain very large sequences or choice groups. The carousel must not display all children at once if that would become unreadable.

MVP rule:

Show at most 7 branch cards in the carousel fan:  
\- selected/nearest branch  
\- three above  
\- three below

If more branches exist, display compact indicators:

\+12 above  
\+8 below

The inspector always shows the full child list.

The branch fan can later support scrolling, filtering, and search-within-children.

---

# **12\. XSD Annotation and Documentation Handling**

XSD has formal documentation structures.

Example:

\<xs:annotation\>  
  \<xs:documentation xml:lang="en"\>  
    Human-readable documentation.  
  \</xs:documentation\>  
  \<xs:appinfo\>  
    Machine-readable or tool-specific data.  
  \</xs:appinfo\>  
\</xs:annotation\>

Rule:

> Attach `xs:annotation` content to the nearest schema node or schema particle that owns it.

Annotations can belong to:

schema  
element  
complexType  
simpleType  
attribute  
attributeGroup  
group  
sequence  
choice  
all  
restriction  
extension  
enumeration

Normalized model:

interface SchemaAnnotation {  
  kind: "documentation" | "appinfo";  
  text: string;  
  rawXml: string;  
  xmlLang?: string;  
  source?: string;  
}

Handling rules:

xs:documentation is human-facing documentation.  
xs:appinfo is tool/machine-facing metadata.  
Preserve both.  
Show documentation excerpts on cards.  
Show full documentation in the inspector.  
Show appinfo in the inspector, but do not treat it as ordinary prose.  
Preserve raw XML for source view.  
Extract plain text for search.  
Preserve xml:lang and source attributes when present.

Security rule:

Do not render annotation XML using unsafe innerHTML.  
Documentation may contain markup-like content.  
Store raw XML, but render sanitized text or a safely parsed representation.

Default MVP rule:

Do not make xs:annotation, xs:documentation, or xs:appinfo ordinary carousel nodes.  
Treat them as metadata attached to schema nodes.

Possible later feature:

Setting: Show documentation/appinfo as navigable nodes.

---

# **13\. DTD Comment Handling**

DTD has no formal equivalent to XSD documentation. Comments should be preserved and used as informal documentation where appropriate.

Example:

\<\!-- The root element for a book document. \--\>  
\<\!ELEMENT book (front.matter, book.content, index)\>

Rule:

> DTD comments are preserved as source comments and may be attached as documentation to nearby declarations using conservative heuristics.

DTD comment attachment rules:

1\. A comment immediately before a declaration attaches to that declaration  
   if only whitespace occurs between the comment and declaration.

2\. A comment on the same line immediately after a declaration attaches as  
   a trailing comment.

3\. Consecutive comments before a declaration are combined in order.

4\. Comments separated from a declaration by another declaration are not attached.

5\. Unattached comments are stored as schema-level comments.

6\. All comments preserve source order and source location when available.

Example:

\<\!-- Front matter includes title page and optional preface. \--\>  
\<\!ELEMENT front.matter (title.page, preface?)\>

The `front.matter` card may show:

Comment: "Front matter includes title page and optional preface."

Inspector display:

Nearby DTD comment  
Front matter includes title page and optional preface.

Comment model:

interface DtdComment {  
  text: string;  
  raw: string;  
  sourceFile?: string;  
  startLine?: number;  
  endLine?: number;  
  attachedToNodeId?: string;  
  attachmentKind: "preceding" | "trailing" | "schema-level" | "section";  
}

For MVP, `section` may be omitted or treated as schema-level.

---

# **14\. Spiral Development Plan**

The project should proceed through multiple RAD-style spirals.

Each spiral should include:

Plan  
Prototype/build  
Review  
Revise  
Stabilize  
Commit

Each spiral should produce a working application, even if incomplete.

---

## **Spiral 0: Project Setup and Concept Skeleton**

### Goal

Create the initial static browser app project and establish architecture.

### Build

Create Vite \+ Svelte \+ TypeScript app.  
Add basic app shell.  
Add top bar, left panel, central carousel area, right inspector area.  
Add placeholder sample data.  
Add test framework.  
Add formatting/linting.

### Acceptance Criteria

App builds with npm run build.  
App runs locally with npm run dev.  
Basic layout appears.  
No backend is required.  
There is a placeholder central carousel area.  
There is a placeholder inspector.  
There is at least one unit test.

### Review Questions

Does the app shell feel suitable for a document/navigation tool?  
Is the carousel visually central?  
Are the side panels useful but not dominant?

---

## **Spiral 1: Hardcoded Carousel Prototype**

### Goal

Prove the carousel metaphor before implementing real parsing.

Use a hardcoded DTD-like schema tree.

Example:

\<\!ELEMENT book (front.matter, book.content, index)\>  
\<\!ELEMENT front.matter (title.page, preface?)\>  
\<\!ELEMENT book.content (chapter+)\>  
\<\!ELEMENT chapter (title, section\*)\>  
\<\!ELEMENT index (index.entry+)\>

### Build

Implement normalized SchemaNode and SchemaEdge types.  
Create hardcoded sample schema graph.  
Create navigation path state.  
Render focused center card.  
Render rootward cards to the right.  
Render leafward branch fan to the left.  
Implement body click to center card.  
Implement Details/Inspect control.  
Implement separate inspector state.  
Implement basic animation.

### Acceptance Criteria

User sees a large focused center card.  
Child branches appear to the left.  
Rootward path appears to the right.  
Clicking a card centers it.  
Clicking Details opens inspector without centering.  
Inspector can show a non-centered node.  
Inspector includes “Center this node.”  
The carousel updates smoothly when focus changes.

### Review Questions

Does this feel like travelling through the schema?  
Is the rootward/leafward direction intuitive?  
Are card sizes and spacing readable?  
Does separating click and inspect feel correct?

---

## **Spiral 2: Drag Gesture Prototype**

### Goal

Implement the distinctive drag behaviour.

### Build

Implement horizontal drag detection.  
Implement vertical branch selection.  
Implement drag preview state.  
Implement release threshold.  
Implement cancel behaviour.  
Implement rootward drag to parent/path node.  
Add visual feedback for selected drag target.

### Acceptance Criteria

Dragging left/up selects upper child.  
Dragging left/center selects middle child.  
Dragging left/down selects lower child.  
Dragging right moves to rootward parent/path node.  
Dragging below threshold does not navigate.  
Drag target is visually previewed.  
Escape or right-click cancels drag.  
Click navigation still works.

### Review Questions

Is the drag direction obvious?  
Does vertical branch selection feel natural?  
Are accidental navigations rare?  
Does the animation clarify the movement?

---

## **Spiral 3: Focused Card and Inspector Detail**

### Goal

Make cards and inspector useful enough to evaluate the product.

### Build

Implement specific card types.  
Implement focused-card summaries.  
Implement child summaries.  
Implement attribute summaries.  
Implement documentation/comment indicators.  
Implement full inspector sections.  
Implement source snippet placeholder.

### Acceptance Criteria

Focused card shows name, kind, content/type, child count, attribute count, used-by hint, and documentation/comment indicator.  
Inspector shows full node details.  
Inspector shows children.  
Inspector shows attributes.  
Inspector shows used-by information.  
Inspector can be opened without changing carousel focus.

### Review Questions

Does the focused card orient without overwhelming?  
Is the inspector clearly deeper than the card?  
Are the labels understandable to both casual and technical users?

---

## **Spiral 4: Basic DTD Parser**

### Goal

Load and navigate a real DTD.

### Build

Support:

\<\!ELEMENT name (...)\>  
\<\!ATTLIST name ...\>  
basic content models  
child names  
sequences: (a, b, c)  
choices: (a | b | c)  
occurrence markers: ?, \*, \+  
\#PCDATA  
comments

### Acceptance Criteria

User can open a .dtd file.  
DTD elements appear in left panel.  
Clicking a DTD element opens it in the carousel.  
Content model children appear as leafward branches.  
Attributes appear in card summaries and inspector.  
Occurrence markers are displayed.  
DTD comments are preserved.  
Immediately preceding comments attach to declarations.  
Unattached comments are stored as schema-level comments.

### Review Questions

Does DTD navigation feel natural?  
Are content models represented clearly?  
Are comments useful without being misleading?

---

## **Spiral 5: XSD Parser MVP**

### Goal

Load and navigate a basic XSD.

### Build

Support:

xs:schema  
xs:element  
xs:complexType  
xs:simpleType  
xs:sequence  
xs:choice  
xs:all  
xs:attribute  
xs:restriction  
xs:extension  
xs:enumeration  
type  
ref  
base  
minOccurs  
maxOccurs

### Acceptance Criteria

User can open a .xsd file.  
Global elements appear in left panel.  
Named complex types appear in left panel.  
Named simple types appear in left panel.  
Element children appear as leafward branches.  
Type references can be followed.  
Simple type enumerations appear in inspector.  
Occurrence constraints display correctly.  
Extension/restriction relationships are visible.

### Review Questions

Is XSD graph reuse handled without breaking the carousel metaphor?  
Does following type references feel like moving through a doorway?  
Are complexType/simpleType distinctions clear?

---

## **Spiral 6: XSD Documentation and AppInfo**

### Goal

Make formal XSD documentation useful.

### Build

Parse xs:annotation.  
Parse xs:documentation.  
Parse xs:appinfo.  
Attach annotations to nearest owning node or particle.  
Store text and raw XML.  
Show documentation excerpts on cards.  
Show full documentation in inspector.  
Show appinfo separately in inspector.  
Add documentation text to search index.

### Acceptance Criteria

XSD documentation appears on relevant cards.  
Full documentation appears in inspector.  
AppInfo is preserved and shown separately.  
xml:lang is preserved when present.  
source attribute is preserved when present.  
Raw XML is available in source/detail view.  
Unsafe innerHTML is not used.

### Review Questions

Is documentation visible enough?  
Does it clutter the carousel?  
Is appinfo clearly distinguished from human-facing documentation?

---

## **Spiral 7: Search and Teleportation**

### Goal

Make large schemas navigable.

### Build

Implement search across node names.  
Search documentation text.  
Search DTD comments.  
Search types and attributes.  
Display grouped search results.  
Clicking a result centers that node.  
Opening Details from a result inspects that node.  
Rebuild carousel path where possible.

### Acceptance Criteria

User can search by element/type/attribute name.  
User can search documentation/comment text.  
Results show node kind and source file.  
Clicking a result centers the node.  
Details opens inspector without centering.  
Search is fast on moderate schemas.

### Review Questions

Can the user recover instantly if lost?  
Does search feel like teleportation into the carousel?  
Are result labels specific enough?

---

## **Spiral 8: ZIP and Multi-File Schema Sets**

### Goal

Support practical schema packages.

### Build

Add JSZip import.  
Allow opening .zip containing .xsd and/or .dtd files.  
Index multiple files as one schema project.  
Track source file for each node.  
Resolve same-package references where possible.  
Display schema set outline.

### Acceptance Criteria

User can open a ZIP file.  
App discovers XSD and DTD files.  
Schema nodes record source file.  
Left panel groups nodes by file/type.  
Inspector shows source file.  
Basic same-package XSD references resolve.  
Unresolved references are visible but nonfatal.

### Review Questions

Does multi-file navigation remain comprehensible?  
Are unresolved references explained clearly?  
Is source-file identity visible enough?

---

## **Spiral 9: Large Schema Usability**

### Goal

Prevent the UI from collapsing under large schemas.

### Build

Limit branch fan to visible sibling window.  
Show \+N above / \+N below indicators.  
Add branch fan scrolling.  
Add child filtering in inspector.  
Move expensive parsing to Web Worker.  
Add loading/progress states.  
Add performance tests with large schema samples.

### Acceptance Criteria

Large child lists do not overflow the carousel.  
Branch fan remains readable.  
User can scroll/filter siblings.  
Parsing does not freeze the UI.  
Progress indicator appears during parsing.  
Large schemas remain usable.

### Review Questions

Does the app still feel like a carousel with large documents?  
Do users understand when children are hidden above/below?  
Is performance acceptable?

---

## **Spiral 10: Source View and Developer Utility**

### Goal

Make XML Carousel useful for real schema work.

### Build

Preserve source snippets.  
Show source declaration in inspector.  
Add “copy node summary.”  
Add “copy source snippet.”  
Add source line numbers where available.  
Highlight referenced names in source snippets.

### Acceptance Criteria

Inspector shows raw source for selected node.  
User can copy source snippet.  
User can see source file and approximate location.  
Source display is safe and escaped.

### Review Questions

Does source view make the visual navigation more trustworthy?  
Can a developer use this to understand and edit a schema?

---

## **Spiral 11: Accessibility and Keyboard Navigation**

### Goal

Make XML Carousel usable without relying only on mouse gestures.

### Build

Add keyboard focus states.  
Arrow left/right navigates leafward/rootward.  
Arrow up/down selects sibling branch.  
Enter centers selected card.  
I or D opens inspector/details.  
Escape cancels drag or closes transient UI.  
Ensure visible focus rings.  
Add reduced-motion setting.

### Acceptance Criteria

Core navigation works with keyboard.  
Inspector can be opened with keyboard.  
Focus states are visible.  
Reduced-motion mode avoids disorienting animation.  
Cards and controls have accessible labels.

### Review Questions

Is keyboard navigation logical?  
Does reduced motion preserve clarity?  
Can users operate the app without drag gestures?

---

## **Spiral 12: Polish, Packaging, and First Public Alpha**

### Goal

Prepare a usable alpha release.

### Build

Add welcome/help screen.  
Add sample schemas.  
Add error reporting for invalid files.  
Add project reset.  
Add static deployment configuration.  
Add README.  
Add architecture notes.  
Add known limitations.

### Acceptance Criteria

Project builds cleanly.  
README explains how to run and build.  
User can load sample DTD.  
User can load sample XSD.  
User can load ZIP.  
No backend is required.  
Known limitations are documented.  
Alpha release is usable for feedback.

### Review Questions

Can someone understand XML Carousel in five minutes?  
Does the demo communicate the carousel concept?  
Is the alpha stable enough for outside testing?

---

# **15\. Initial MVP Instruction for Codex**

The first coding task should be limited to Spiral 0 and Spiral 1\.

Suggested Codex prompt:

Build the initial XML Carousel prototype as a static browser-based application using Svelte, Vite, and TypeScript.

The first implementation must not parse real schemas yet. Use a hardcoded DTD-like sample schema graph. The goal is to prove the carousel navigation metaphor.

Requirements:

\- Create a Vite \+ Svelte \+ TypeScript app.  
\- The app must run entirely in the browser with no backend.  
\- Create an app shell with top bar, left panel, central carousel area, and right inspector panel.  
\- Implement a normalized schema graph model with SchemaNode and SchemaEdge types.  
\- Use hardcoded sample nodes based on a simple book DTD:  
  \- book  
  \- front.matter  
  \- book.content  
  \- index  
  \- title.page  
  \- preface  
  \- chapter  
  \- section  
  \- index.entry  
\- Render the current focused node as a large centered card.  
\- Render rootward navigation-path cards to the right.  
\- Render leafward child/branch cards to the left.  
\- Clicking a card body must center/focus that card.  
\- Each card must have a Details or Inspect control.  
\- Clicking Details/Inspect must open the side inspector for that card without also centering the card.  
\- Carousel focus and inspector target must be separate pieces of state.  
\- If the inspector shows a non-focused node, include a “Center this node” action.  
\- Add basic smooth animation for focus changes.  
\- Add unit tests for navigation-path state and card click versus inspect behaviour.  
\- Do not use a graph visualization library.  
\- Keep parser logic out of the UI; real parsing will be added in later spirals.

---

# **16\. Definition of Done for Each Spiral**

Each spiral is complete only when:

The app builds.  
The app runs locally.  
Core behaviour for the spiral is implemented.  
Existing tests pass.  
New tests cover the important new behaviour.  
The UI remains usable.  
No large unrelated refactors are mixed into the spiral.  
Known limitations are documented.

Each spiral should end with a review before proceeding to the next one.

---

# **17\. Current Non-Negotiable Design Decisions**

Project name: XML Carousel.

Serverless browser app.

No backend required.

No cloud upload required.

The carousel is the primary navigation metaphor.

Current focus is centered.

Rootward context appears to the right.

Leafward/child context appears to the left.

Horizontal dragging changes schema depth.

Vertical dragging selects sibling branches.

The carousel shows the user’s journey path, not the entire schema graph.

The focused card is an orientation card, not a full inspector.

Opening the inspector requires a deliberate Details/Inspect control.

Ordinary card click centers/focuses the card.

XSD annotations are formal metadata attached to schema nodes.

DTD comments are informal documentation attached conservatively to nearby declarations.

Do not render huge full-schema graphs by default.

---

# **18\. Current-State Superseding Notes**

Revision `0.1.0` is complete. Future feature work begins from the latest clean, synchronized `main` branch and must preserve the accepted production, testing, responsive, accessibility, and local-first behaviours.

Where older portions of the development plan conflict with the implemented application, the current application behaviour, current style guide, latest accepted task documentation, and this addendum take precedence.

## **18.1 Current Carousel Orientation**

The implemented spatial orientation is:

rootward / previous step  ←  current focus  →  leafward / children

Accordingly:

* rootward journey context appears to the **left** of the current focus;  
* leafward destinations and children appear to the **right**;  
* the centred card remains the current journey focus;  
* clicking or activating a navigation card changes the journey;  
* **Inspect** remains a separate explicit action and must not change the journey.

This orientation supersedes older passages that describe rootward context on the right and leafward context on the left.

## **18.2 Current Import and Rendering Baseline**

Future feature work must not regress the following accepted behaviours:

* DTD, XSD, and ZIP imports are processed locally in the browser.  
* Large import work uses a Web Worker.  
* Failed, cancelled, stale, or dismissed imports do not incorrectly move keyboard focus.  
* A successful import moves focus to the new current-focus carousel heading.  
* A failed import leaves the previously loaded project, journey, search state, and inspector state intact.  
* The carousel recalculates visible capacity from its actual rendered surface.  
* Browser zoom, magnification, orientation changes, and container resizing do not leave stale cards or transforms.  
* Search, journey state, inspector state, and the active project survive responsive carousel reflow.  
* The inspector target remains independent from the carousel focus.  
* Small-screen and compact layouts must avoid horizontal page overflow.  
* Production output remains a static, portable, location-independent build with no application backend.  
* Selected schema files remain local to the browser and are not uploaded to an XML Carousel service.

## **18.3 Feature-Enhancement Development Rules**

Each post-1.0 enhancement should:

* preserve the existing normalized schema model and journey-state separation;  
* avoid unrelated deployment, packaging, release, or hosting work;  
* be divided into bounded tasks when architecture, interaction, and stabilization can be reviewed separately;  
* leave implementation changes unstaged and uncommitted for manual QA;  
* add focused automated tests and run the complete validation suite;  
* place persistent test-only sample files under `tests/fixtures/`;  
* include real-browser QA at relevant desktop, compact, keyboard, browser-zoom, and reduced-motion states;  
* preserve the portable relative build and nonempty schema-import worker;  
* retain local and remote task branches after integration unless explicitly instructed otherwise.

## **18.4 Completed Diagnostic Foundation**

Task 13.1, **Diagnostic Retention and Normalization**, is complete and integrated.

The application now has:

* one normalized diagnostic representation for DTD, XSD, ZIP, and project-level failures;  
* complete ordered diagnostic reports associated with import attempts;  
* deterministic report-local diagnostic identifiers;  
* retained filename, line, column, code, severity, source, and related-node metadata when available;  
* complete messages without application-level truncation;  
* preserved duplicate diagnostics;  
* normalized diagnostics crossing the worker boundary;  
* separation between retained report data and transient banner visibility;  
* accepted lifecycle behaviour for success, failure, cancellation, stale work, empty picker dismissal, and built-in sample activation.

This diagnostic boundary should be reused by the Xerces work. It should not be replaced with an unrelated second reporting system.

---

# **19\. Revised Post-1.0 Enhancement Sequence**

The revised order is:

1. **Xerces-C++ WebAssembly feasibility and architecture**  
2. **Authoritative standards-validation boundary**  
3. **Tolerant visualization extraction**  
4. **Complete problem-report modal**  
5. **Persistent Problems access**  
6. **Desktop semantic zoom**

The earlier Task 13.2 instructions for the problem-report modal are superseded and must not be used as the next implementation task.

The modal remains an approved feature. It is deferred so that the interface can present diagnostics from the standards engine XML Carousel intends to trust.

---

# **20\. Standards-Compliance Architecture**

## **20.1 Problem Statement**

The current homegrown DTD/XSD parser serves both as:

* a validity gate; and  
* a visualization-model extractor.

That combination is no longer acceptable.

The parser does not fully implement the relevant XML, DTD, and W3C XML Schema rules. As a result:

* valid schemas may be rejected;  
* invalid schemas may be diagnosed incompletely or incorrectly;  
* Hermetic Foundry schemas may be blocked from loading because XML Carousel does not understand a valid construct;  
* validation behaviour can diverge from established XML processors;  
* improving standards coverage construct by construct would be expensive and fragile.

## **20.2 Architectural Decision**

XML Carousel will adopt **Apache Xerces-C++**, compiled to WebAssembly, as its authoritative standards parser and validator for the supported standards.

The central rule is:

> **Xerces decides whether the supplied XML, DTD, or XSD is valid under XML Carousel’s supported standards. XML Carousel decides how much of a valid schema it can visualize.**

The homegrown parser must cease being the authority on validity.

## **20.3 Target Processing Pipeline**

The intended pipeline is:

User-selected DTD, XSD, or ZIP package  
                ↓  
Controlled in-browser project filesystem  
                ↓  
Xerces-C++ WebAssembly in the schema-import worker  
                ├─ XML parsing  
                ├─ DTD/XSD standards checking  
                ├─ local include/import/entity resolution  
                └─ normalized standards diagnostics  
                ↓  
XML Carousel visualization adapter  
                ├─ supported constructs → normalized schema graph  
                ├─ unsupported valid constructs → warnings/placeholders/omissions  
                └─ no second fatal validity decision  
                ↓  
Search, carousel, inspector, source view, and problem reporting

## **20.4 Authority and Responsibility Boundaries**

### **Xerces is responsible for**

* XML well-formedness;  
* namespace-aware XML parsing;  
* DTD grammar and declaration processing within the supported boundary;  
* W3C XML Schema 1.0 parsing and checking;  
* schema-document relationships such as supported includes and imports;  
* standards-level constraint checking;  
* source-aware parser and validation diagnostics;  
* controlled resolution of project-local dependencies.

### **The XML Carousel adapter is responsible for**

* converting parsed schema structures into the normalized schema graph;  
* identifying nodes and relationships useful to the carousel;  
* preserving journey-path semantics;  
* attaching XSD documentation, appinfo, and DTD comments for presentation;  
* creating card and inspector summaries;  
* identifying valid constructs that XML Carousel does not yet visualize;  
* reporting visualization limitations without mislabeling the schema as invalid.

### **The UI is responsible for**

* showing whether the attempted project is valid under the supported standard;  
* distinguishing standards errors from visualization warnings;  
* preserving the previous active project after a failed import;  
* presenting complete normalized diagnostics;  
* indicating when a valid project is only partially visualized.

## **20.5 Updated Architectural Rule**

The earlier architectural rule:

> Parsers produce a normalized schema graph. UI components consume that graph.

is refined to:

> Xerces-C++ performs authoritative standards parsing and validation. A tolerant XML Carousel adapter converts the Xerces result into the normalized schema graph. UI components consume the normalized graph and normalized diagnostics; they do not perform XML or schema archaeology.

## **20.6 Standards Support Boundary**

The initial supported standards target is:

* XML parsing as required for supported DTD and XSD workflows;  
* DTD parsing and declaration checking;  
* W3C XML Schema **1.0** parsing and checking;  
* local XSD includes and imports supplied in the selected project or ZIP;  
* local DTD entities and related resources supplied in the selected project where supported by the adapter.

The initial implementation does **not** promise XSD 1.1.

If an input requires XSD 1.1, XML Carousel should identify it as outside the supported standard rather than silently treating it as ordinary XSD 1.0.

Product documentation should name the engine and supported standards. It should not claim abstract or absolute “100% W3C compliance.”

A suitable eventual statement is:

> XML Carousel uses Apache Xerces-C++ for XML, DTD, and W3C XML Schema 1.0 checking.

## **20.7 Project-Controlled WebAssembly Adapter**

The preferred production architecture is a thin, project-controlled C++/Emscripten adapter around a pinned official Xerces-C++ release.

Third-party Xerces WebAssembly wrappers may be studied during the feasibility spike, used as references, or used temporarily for comparison. They should not become an unexamined permanent dependency.

The project-controlled adapter should expose only the operations XML Carousel needs, conceptually including:

initializeStandardsEngine()  
checkXsdProject(files, entryFile, options)  
checkDtdProject(files, entryFile, options)  
disposeStandardsEngine()

Cancellation may be implemented through the existing worker lifecycle, including terminating superseded work, rather than requiring a public cooperative-cancellation function inside Xerces.

The adapter output should be plain serializable data compatible with the existing normalized diagnostic-report boundary.

## **20.8 Parsed Representation for Visualization**

The preferred final architecture is:

Xerces parse/validation result  
          ↓  
XML Carousel adapter  
          ↓  
normalized schema graph

The long-term design should avoid:

Xerces validates raw source  
          ↓  
homegrown parser reparses the same raw source as a mandatory second gate

During transition, some existing extraction code may remain. However:

* Xerces acceptance must be authoritative;  
* valid schemas must not be rejected solely because the extractor lacks support;  
* extractor failures must be converted into bounded visualization warnings;  
* extraction should progressively move to Xerces DOM, SAX/SAX2 events, or an adapter-owned intermediate representation.

The feasibility spike must determine which Xerces API produces the best balance of:

* source location;  
* schema structure access;  
* performance;  
* memory use;  
* implementation complexity;  
* worker serialization;  
* tolerance of partially supported visualization constructs.

---

# **21\. Validity, Visualization, and User-Facing Status**

## **21.1 Required Status Distinction**

XML Carousel must distinguish at least these outcomes:

### **Invalid under the supported standard**

The attempted project does not open.

The existing active project remains visible where applicable.

The user receives the complete Xerces-derived standards report.

Example:

Schema status: Invalid XSD 1.0  
The attempted schema could not be opened.

### **Valid and fully visualized**

The project opens normally.

Example:

Schema status: Valid XSD 1.0  
Visualization: Complete

The exact wording may be less prominent in the final interface, but the state must exist architecturally.

### **Valid but partially visualized**

The project opens.

Supported structures are available in Search, the carousel, inspector, and source view.

Unsupported valid constructs produce warnings or bounded placeholders.

Example:

Schema status: Valid XSD 1.0  
Visualization: Partial  
XML Carousel does not yet represent 3 constructs.

### **Unsupported standard or unsupported required feature**

The project should receive a clear unsupported-capability result rather than being mislabeled as malformed.

Example:

This schema requires XSD 1.1, which this version of XML Carousel does not support.

## **21.2 Fatal Conditions**

A project may be rejected when:

* the XML is not well formed;  
* Xerces determines that the DTD or XSD is invalid under the supported standard;  
* a required local include, import, or entity cannot be resolved from the supplied project;  
* the archive or selected file cannot be read safely;  
* a security or resource limit is exceeded;  
* the requested standard is explicitly unsupported;  
* an unrecoverable internal engine failure prevents a trustworthy result.

## **21.3 Nonfatal Visualization Conditions**

The following should normally be nonfatal after Xerces accepts the project:

* a valid XSD construct not yet represented by the normalized graph;  
* a valid facet not yet displayed on cards;  
* a relationship not yet exposed in the carousel;  
* unfamiliar but legal annotation or appinfo content;  
* legal extension points intended for another tool;  
* a declaration that can be retained in source/search form but not fully modelled;  
* incomplete visual support for an otherwise valid DTD construct.

These conditions should generate visualization warnings, not “schema invalid” errors.

## **21.4 Hermetic Foundry Acceptance Requirement**

The Hermetic Foundry schema corpus is a primary project acceptance corpus.

For each Hermetic Foundry schema package:

* Xerces must receive the complete required local file set;  
* if Xerces accepts the package under XML Carousel’s supported standard, XML Carousel must open it;  
* unsupported visualization constructs must not block the entire project;  
* supported elements, types, attributes, documentation, appinfo, relationships, and source markup should remain available;  
* omitted or partial structures must be reported honestly;  
* if Xerces rejects the package, XML Carousel must show the exact standards diagnostics rather than a generic homegrown-parser failure.

The feasibility and migration tasks must record which Hermetic Foundry constructs are:

* fully visualized;  
* partially visualized;  
* retained only in source/search form;  
* not yet represented.

---

# **22\. Security, Locality, and Resource Controls**

## **22.1 Controlled Project Filesystem**

Xerces must operate against a controlled virtual project filesystem built only from user-selected files and application-owned fixtures/samples.

The resolver must:

* resolve project-local relative paths;  
* normalize path separators consistently;  
* preserve meaningful user-facing source paths;  
* reject traversal outside the virtual project root;  
* distinguish files with identical basenames in different directories;  
* avoid exposing arbitrary host filesystem paths.

## **22.2 External Retrieval**

By default, the standards engine must not:

* access the network;  
* download remote schemas or DTDs;  
* resolve arbitrary `file:` URLs;  
* read files outside the selected project;  
* follow external entities beyond the controlled project boundary.

When a required external resource is not supplied, XML Carousel should report it as unresolved rather than retrieving it silently.

Future opt-in network resolution would require a separate security and privacy design and is outside this milestone.

## **22.3 Entity and Expansion Safety**

The adapter must apply safe limits to:

* entity expansion;  
* recursion;  
* document size;  
* schema count;  
* dependency depth;  
* diagnostic count where memory safety requires a bound;  
* parser time and worker lifetime;  
* aggregate ZIP extraction size;  
* path count and path length.

A security limit must produce a clear diagnostic. It must not masquerade as an ordinary standards error.

## **22.4 Worker Isolation and Cancellation**

Xerces should run inside the existing schema-import worker or a tightly controlled successor worker.

The implementation must preserve:

* cancellation;  
* stale-result rejection;  
* current-attempt identity;  
* no active-project replacement from stale work;  
* deterministic cleanup of worker resources;  
* no main-thread blocking for substantial imports.

If a cancelled or superseded Xerces operation cannot be interrupted cooperatively, terminating and recreating the worker is acceptable when done safely and predictably.

## **22.5 Portable Static Build**

The WASM and any companion assets must:

* be produced or copied by the project’s reproducible build;  
* load from relative paths;  
* work at a domain root or nested deployment path;  
* pass the existing portable distribution verification;  
* remain compatible with a static server and no application backend;  
* remain local to the deployed application;  
* not depend on a CDN or runtime download.

---

# **23\. Revised Diagnostics and Problem-Reporting Plan**

## **23.1 Diagnostic Categories**

The normalized diagnostic system should distinguish:

* **standards errors** from Xerces;  
* **standards warnings** from Xerces;  
* **project-resolution errors** from ZIP/import handling;  
* **security/resource-limit diagnostics**;  
* **visualization warnings** from the XML Carousel adapter;  
* **internal errors** where the engine or adapter fails unexpectedly.

The exact source enum may evolve, but the UI must not present all categories as if they meant the same thing.

## **23.2 Diagnostic Normalization**

Xerces diagnostics should be converted into the existing normalized report model.

Preserve, when available:

* severity;  
* complete message;  
* source filename;  
* line;  
* column;  
* Xerces error code or domain;  
* standards stage or subsystem;  
* related schema component;  
* deterministic ordering;  
* repeated diagnostics.

Do not expose raw pointers, WASM memory addresses, internal virtual filesystem prefixes, or unhelpful implementation identifiers.

## **23.3 Problem-Report Modal**

After the standards engine and tolerant extraction boundary are established, implement the previously approved complete problem-report interface:

* clickable **N more problems** text;  
* separate **View all problems** button;  
* one shared accessible modal;  
* complete untruncated messages;  
* grouping by source file;  
* visible severity;  
* file, line, column, and code where available;  
* correct distinction between the failed attempted import and the still-visible active project;  
* focus trap and focus restoration;  
* compact and desktop responsiveness;  
* safe plain-text rendering.

A single-problem report may continue to rely on the complete banner message without exposing a redundant modal opener.

## **23.4 Persistent Problems Access**

A later task should add a compact global control such as:

Problems (8)

This control should reopen the retained report after the main banner is dismissed.

The report lifecycle remains:

* a later failed import replaces the report;  
* a successful import clears the previous failed-import report;  
* cancellation, stale results, and empty picker dismissal do not replace or clear it incorrectly;  
* cross-session diagnostic history remains outside initial scope.

## **23.5 Visualization Warnings**

A valid but partially visualized project should not use the same red failed-import banner as an invalid project.

Visualization limitations should use a distinct, nonfatal presentation, for example:

This is a valid XSD 1.0 project.  
XML Carousel does not yet visualize 3 constructs.  
View visualization details

The exact control and severity treatment should follow the style guide and later usability review.

---

# **24\. Xerces-C++ Migration Milestone**

## **24.1 Task 13.2 — Xerces-C++ WebAssembly Feasibility Spike**

### **Goal**

Determine whether a pinned Xerces-C++ build can operate reliably inside XML Carousel’s static browser architecture before production parsing is replaced.

### **Required investigations**

The spike should evaluate:

* reproducible Xerces-C++ compilation with Emscripten on the project’s Windows development environment;  
* Vite integration;  
* worker loading;  
* relative WASM asset loading at domain-root and nested paths;  
* XSD 1.0 validation;  
* DTD parsing/checking;  
* local include/import resolution;  
* controlled local entity resolution;  
* complete diagnostic capture;  
* source filename, line, and column quality;  
* memory use and performance;  
* cancellation and stale-worker behaviour;  
* cleanup and repeated imports;  
* security restrictions;  
* current fixture compatibility;  
* Hermetic Foundry schema compatibility.

### **Spike implementation boundary**

The spike must not immediately replace the production parser.

It should use a separate experimental path, harness, test adapter, or development-only comparison route.

It must not silently change user-visible validity decisions before the spike is reviewed.

### **Required spike corpus**

At minimum:

* current XML Carousel valid DTD fixtures;  
* current XML Carousel valid XSD fixtures;  
* deliberately malformed DTDs and XSDs;  
* ZIP and multi-file projects;  
* local includes and imports;  
* recursive schemas;  
* namespaces and chameleon includes where represented;  
* DTD parameter entities and conditional sections where supported;  
* identity constraints;  
* substitution groups;  
* simple-type union and list;  
* restriction facets;  
* complex-content and simple-content derivation;  
* wildcards;  
* selected W3C XML and XML Schema conformance cases;  
* the complete Hermetic Foundry schema corpus.

### **Independent comparison**

Compare representative results against at least one independent mature validator, such as:

* Xerces-J;  
* Liquid Studio;  
* Visual Studio’s XML Schema processor;  
* `xmllint`/libxml2 where the feature is supported.

The purpose is to identify integration or adapter errors, not to require identical prose diagnostics.

### **Spike acceptance criteria**

The spike succeeds only if:

* Xerces compiles reproducibly;  
* the WASM loads in the worker;  
* no application backend is introduced;  
* the same unchanged build loads at root and nested paths;  
* supported XSD 1.0 projects are checked correctly;  
* supported DTD inputs are checked through a defined Xerces path;  
* local dependencies resolve from supplied files;  
* external retrieval is blocked;  
* diagnostics preserve useful source identity and location;  
* cancellation and stale-result protections remain viable;  
* memory and performance are acceptable for representative projects;  
* Hermetic Foundry schemas can be processed far enough to determine whether they are standards-valid and whether current visualization support is the remaining limitation;  
* build and distribution impacts are documented;  
* production adoption risks are documented.

### **Spike deliverable**

The task report must recommend one of:

1. proceed with the proposed project-controlled Xerces adapter;  
2. proceed with modifications;  
3. perform a second focused spike;  
4. reject the approach and document why.

No production replacement should occur without review.

## **24.2 Task 13.3 — Authoritative Xerces Validation Boundary**

### **Goal**

Make Xerces the authoritative validity engine while preserving existing import lifecycle and diagnostic behaviour.

### **Build**

* integrate the reviewed Xerces adapter into the production worker;  
* route DTD, XSD, and supported project checking through Xerces;  
* normalize Xerces diagnostics into the Task 13.1 report model;  
* preserve active-project state on failure;  
* preserve cancellation and stale-worker protections;  
* identify unsupported standards explicitly;  
* keep the existing extractor temporarily where required;  
* ensure the extractor cannot override Xerces validity with a contradictory homegrown validity result.

### **Acceptance criteria**

* invalid projects are rejected on Xerces standards results;  
* standards-valid projects proceed to visualization extraction;  
* homegrown validity checks no longer reject a Xerces-valid project;  
* diagnostic files, lines, and columns are accurate where Xerces supplies them;  
* successful-import focus behaviour remains intact;  
* portable build verification passes;  
* worker assets are present and nonempty;  
* no external retrieval occurs;  
* Hermetic Foundry schemas accepted by Xerces proceed beyond the validity boundary.

## **24.3 Task 13.4 — Tolerant Visualization Extraction**

### **Goal**

Ensure a valid project opens even when XML Carousel cannot fully visualize every construct.

### **Build**

* classify extraction results as complete, partial, or failed internally;  
* convert unsupported valid constructs into visualization warnings;  
* preserve source markup for unsupported constructs;  
* retain searchable declaration identity where feasible;  
* create bounded placeholder or omitted-construct records where useful;  
* prevent one unsupported construct from aborting an otherwise valid project;  
* progressively move extraction toward Xerces-produced structures.

### **Acceptance criteria**

* a Xerces-valid project is not rejected solely because the visualization adapter lacks support;  
* supported structures remain navigable;  
* unsupported structures are disclosed;  
* the active project can be marked as partially visualized;  
* warnings are distinct from standards errors;  
* Hermetic Foundry schemas accepted by Xerces load into XML Carousel;  
* known unsupported Hermetic Foundry constructs are enumerated rather than blocking the project.

## **24.4 Task 13.5 — Complete Problem-Report Modal**

Implement the approved banner-link, button, modal, multi-file grouping, accessibility, and focus-restoration design using the standards-aware normalized report.

Do not duplicate or replace the retained report state.

## **24.5 Task 13.6 — Persistent Problems Access**

Add the global **Problems (N)** access point after banner dismissal, along with final report lifecycle and responsive QA.

## **24.6 Task 13.6 — Persistent Problems Access**

Preserve the existing Task 13.6 subsection as written.

Immediately after it, add:

---

## **24.7 Task 13.7 — Standards-Engine Browser and Lifecycle Stabilization**

### **Goal**

Stabilize the production Xerces integration across supported browsers and repeated real-world use without changing the accepted validity boundary or diagnostic architecture.

### **Build**

* verify current supported desktop and mobile browsers;  
* exercise repeated DTD, XSD, and ZIP imports in one application session;  
* verify worker creation, cancellation, disposal, restart, and failure recovery;  
* verify memory is released after project replacement and repeated large imports;  
* verify stale-result protection during rapid replacement and cancellation;  
* verify native dialog, focus, warning, and retained-problem lifecycles remain correct during repeated imports;  
* verify nested static deployment and hostile-MIME operation across supported browsers;  
* identify and correct browser-specific runtime or worker defects;  
* add focused regression tests and real-browser coverage for discovered defects.

### **Acceptance criteria**

* supported browsers load the same portable production build successfully;  
* repeated valid and invalid imports do not leak stale project, worker, modal, warning, or diagnostic state;  
* cancellation and worker restart remain reliable;  
* representative repeated large imports do not show unbounded memory growth;  
* project replacement leaves one authoritative active project;  
* diagnostic and visualization state remain correctly separated;  
* root and nested-path deployments remain functional;  
* no backend, network schema retrieval, or host-filesystem fallback is introduced;  
* all existing production, W3C, security, runtime, and Hermetic Foundry gates pass.

---

## **24.8 Task 13.8 — Adversarial Inputs, Limits, and Path-Security Stabilization**

### **Goal**

Harden the production import boundary against malformed, hostile, oversized, recursive, and path-manipulating inputs while preserving correct handling of valid local projects.

### **Build**

* expand malformed and adversarial DTD, XSD, XML, and ZIP coverage;  
* test deeply nested content models and schema structures;  
* test recursive entities, recursive schema relationships, and cycle handling;  
* test archive-entry count, compressed-size, uncompressed-size, and path-length limits;  
* test entity expansion and parser resource limits;  
* test path normalization, `.` and `..`, repeated separators, encoded traversal, drive-letter paths, UNC paths, absolute paths, control characters, and external URI schemes;  
* verify safe parent references remain accepted only when their canonical result stays within the virtual project root;  
* verify external network, `file:`, host-filesystem, and ambiguous basename fallback remain blocked;  
* ensure every blocked condition produces a clear security or resource-limit diagnostic rather than a standards-invalid message;  
* store every persistent new input under `tests/fixtures/`.

### **Acceptance criteria**

* traversal beyond the virtual project root is blocked;  
* safe normalized parent references within the project root still resolve;  
* no external or host-filesystem retrieval occurs;  
* archive and parser limits fail safely and predictably;  
* adversarial inputs cannot freeze the interface or leave a stale worker or partial project active;  
* security and resource-limit failures retain complete reports;  
* standards-invalid, unsupported-standard, security, resource-limit, and internal-engine outcomes remain distinct;  
* complete validation and portable-build gates pass.

---

## **24.9 Task 13.9 — Expanded Conformance and Hermetic Foundry Regression Coverage**

### **Goal**

Increase confidence in the authoritative standards boundary and tolerant visualization layer by expanding independent conformance coverage and making the Hermetic Foundry corpus a durable regression gate.

### **Build**

* expand selected W3C XML and DTD coverage beyond the current manifest where useful;  
* expand selected W3C XML Schema 1.0 coverage where a reproducible project-controlled harness is practical;  
* retain explicit classifications for required, optional, unsupported, instance-dependent, and security-blocked cases;  
* compare representative outcomes with an independent mature validator where useful;  
* add focused regressions for every production adapter defect found through conformance testing;  
* keep harness failures distinct from standards outcomes;  
* preserve deterministic manifests and repeatable corpus execution;  
* strengthen the Hermetic Foundry inventory and audit so source count, supported-node count, finding count, finding categories, dependency resolution, and partial-visualization status are checked explicitly;  
* verify ZIP entry order cannot change the Hermetic Foundry result;  
* ensure the external Hermetic Foundry archive remains outside the repository unless a separately approved fixture subset is intentionally added.

### **Acceptance criteria**

* expanded selected conformance suites have zero unexplained failures and zero harness errors;  
* accepted optional and instance-dependent classifications are documented;  
* adapter defects discovered by independent comparison receive regression tests;  
* Hermetic Foundry continues to load as standards-valid and partially visualized;  
* Hermetic Foundry source, node, finding, and category totals are deterministic unless an explicitly reviewed visualization improvement changes them;  
* standalone missing-dependency behaviour remains correct;  
* the complete external archive remains untracked;  
* production, runtime, security, portability, and deterministic-build gates pass.  
  ---

  ## **24.10 Task 13.10 — Complete Visualization Coverage Audit**

  ### **Goal**

Create an authoritative, testable inventory of every construct XML Carousel must represent from a standards-valid DTD, XSD 1.0 schema, or ZIP schema package.

The audit must identify every place where XML Carousel currently:

* represents a construct completely;  
* represents only part of its meaning;  
* preserves it only as source markup;  
* omits it;  
* misclassifies it;  
* creates a misleading node or relationship.

This task establishes the complete implementation backlog. It must not treat partial visualization as an acceptable final product state.

### **Product requirement**

For every standards-valid input within XML Carousel’s supported standards boundary:

* every declaration, component, particle, constraint, annotation, reference, dependency, and relationship must be represented;  
* every construct must be reachable through at least one appropriate combination of the carousel, Navigation, Search, inspector, and source view;  
* every construct must retain its source identity and source markup;  
* no construct may disappear merely because XML Carousel lacks a specialized card or inspector presentation;  
* opaque foreign or vendor-specific content must still be preserved and presented safely, even when XML Carousel cannot interpret its private semantics.

Complete representation does **not** mean rendering the entire schema graph simultaneously. The carousel may remain bounded, contextual, and journey-based.

### **Build**

* Create a machine-readable visualization-coverage matrix.  
* Inventory the complete supported DTD grammar and declaration surface.  
* Inventory the complete supported XSD 1.0 component and relationship surface.  
* Inventory ZIP and multi-file package structures, including ignored-entry disclosure.  
* Map every construct through:  
  * standards validation;  
  * extraction;  
  * normalized model;  
  * project storage;  
  * Navigation;  
  * Search;  
  * carousel presentation;  
  * inspector presentation;  
  * source view;  
  * accessibility representation;  
  * automated tests.  
* Audit the selected W3C XML/DTD corpus.  
* Audit the selected W3C XSD 1.0 corpus.  
* Audit every existing project fixture.  
* Audit the complete external Hermetic Foundry package.  
* Record exact per-construct and per-source omissions.  
* Separate:  
  * unsupported standards;  
  * opaque foreign semantics;  
  * missing visualization implementation;  
  * extraction defects;  
  * misleading presentation;  
  * unreachable but retained content.  
* Add focused regression tests that prove each discovered gap exists before later implementation tasks address it.  
* Produce an ordered implementation backlog for Tasks 13.11–13.17.

  ### **Acceptance criteria**

* Every supported DTD construct appears in the coverage matrix.  
* Every supported XSD 1.0 construct appears in the coverage matrix.  
* Every ZIP/package presentation responsibility appears in the coverage matrix.  
* Every current visualization finding maps to a specific missing or defective capability.  
* No finding remains classified only as a generic “unsupported component” when its actual construct is known.  
* Hermetic Foundry’s current visualization findings are localized by source and construct.  
* The audit distinguishes source preservation from meaningful visualization.  
* No silent omission remains undiscovered in the audited corpora.  
* The matrix and reports are deterministic.  
* Existing validity, security, runtime, browser, and lifecycle gates pass.  
* No semantic-zoom implementation begins.  
  ---

  ## **24.11 Task 13.11 — Complete DTD Visualization**

  ### **Goal**

Represent every construct in a standards-valid XML 1.0 DTD supported by the authoritative Xerces boundary.

A valid DTD must not produce a visualization limitation merely because XML Carousel has not implemented its presentation.

### **Build**

Represent and make reachable:

* element declarations;  
* `EMPTY`;  
* `ANY`;  
* mixed content;  
* child-content models;  
* sequences;  
* choices;  
* nested content groups;  
* occurrence operators;  
* undeclared names that remain legal under XML rules;  
* `ATTLIST` declarations;  
* all XML attribute types;  
* enumerations;  
* notation-valued attributes;  
* `#REQUIRED`;  
* `#IMPLIED`;  
* `#FIXED`;  
* literal defaults;  
* multiple attribute declarations attached to one element;  
* internal general entities;  
* external general entities;  
* parameter entities;  
* parsed entities;  
* unparsed entities;  
* entity replacement relationships;  
* notation declarations;  
* notation relationships;  
* conditional sections;  
* declaration comments;  
* processing instructions where present;  
* declaration order;  
* source ranges and raw declaration markup;  
* project-local external subset and entity dependencies.

For constructs that do not naturally belong in the primary carousel journey:

* expose them through Navigation and Search;  
* provide a meaningful inspector presentation;  
* preserve and show source markup;  
* connect them to related declarations without inventing false containment.

  ### **Acceptance criteria**

* Every valid DTD construct in the coverage matrix has a defined normalized representation.  
* Every declaration is searchable and inspectable.  
* Every declaration has source markup.  
* Content-model structure is navigable without flattening away meaning.  
* Attribute declarations retain type, default, enumeration, notation, and declaration-order information.  
* Entity and notation declarations remain distinct from elements.  
* Legal undeclared-name cases are presented without being falsely labelled invalid.  
* External project-local relationships are visible and accurate.  
* No standards-valid DTD fixture produces a visualization warning caused by missing DTD implementation.  
* Selected W3C DTD presentation regressions pass.  
* Large and recursive DTDs remain bounded and usable.  
* No full-graph visualization is introduced.  
  ---

  ## **24.12 Task 13.12 — Complete XSD 1.0 Structural Visualization**

  ### **Goal**

Represent every structural component and particle in a standards-valid W3C XML Schema 1.0 schema.

### **Build**

Represent and make reachable:

* schema documents;  
* target namespaces;  
* namespace bindings relevant to schema interpretation;  
* global and local element declarations;  
* global and local attribute declarations;  
* named and anonymous simple types;  
* named and anonymous complex types;  
* model-group definitions;  
* attribute-group definitions;  
* element references;  
* attribute references;  
* group references;  
* attribute-group references;  
* sequences;  
* choices;  
* `all` groups;  
* nested particles;  
* minimum and maximum occurrence constraints;  
* unbounded occurrence;  
* simple content;  
* complex content;  
* mixed content;  
* empty complex content;  
* element wildcards;  
* attribute wildcards;  
* process-content rules;  
* default and fixed values;  
* local qualification and form defaults;  
* abstract elements and types;  
* nillable elements;  
* block and final controls;  
* declaration order;  
* source identity and source markup.

Preserve the distinction among:

* declaration;  
* reference;  
* type definition;  
* content-model particle;  
* reusable group;  
* wildcard;  
* occurrence wrapper.

Do not collapse distinct XSD components into generic element-like nodes.

### **Acceptance criteria**

* Every structural XSD 1.0 construct in the coverage matrix has a defined normalized representation.  
* Local and global declarations remain distinguishable.  
* Anonymous types remain reachable from their owning declaration.  
* References do not masquerade as declarations.  
* Compositor and occurrence structure remains accurate.  
* Wildcards retain namespace and process-content information.  
* Every represented component is searchable where naming permits.  
* Anonymous and unnamed components remain reachable through contextual labels.  
* Inspector and source view expose complete structural details.  
* Valid supported structural constructs no longer create visualization-limit warnings.  
* Selected W3C XSD presentation regressions pass.  
  ---

  ## **24.13 Task 13.13 — Complete XSD 1.0 Type-System and Constraint Visualization**

  ### **Goal**

Represent the complete supported XSD 1.0 type system, derivation model, facets, and constraints.

### **Build**

Represent and make reachable:

* simple-type restriction;  
* simple-type list;  
* simple-type union;  
* all XSD 1.0 constraining facets;  
* enumeration values;  
* patterns;  
* whitespace rules;  
* length constraints;  
* numeric bounds;  
* digit constraints;  
* built-in type ancestry;  
* complex-content extension;  
* complex-content restriction;  
* simple-content extension;  
* simple-content restriction;  
* base-type relationships;  
* derivation chains;  
* final and block restrictions;  
* value constraints;  
* identity constraints;  
* `unique`;  
* `key`;  
* `keyref`;  
* selector expressions;  
* field expressions;  
* key-reference targets;  
* notation declarations;  
* notation type relationships.

XPath-like selector and field expressions must be preserved exactly and shown safely even when XML Carousel does not otherwise interpret them.

### **Acceptance criteria**

* Every XSD 1.0 facet in the supported boundary is represented.  
* List and union member types are not flattened into generic restrictions.  
* Type derivation is navigable in both directions where useful.  
* Base and derived types retain their distinct source identities.  
* Identity constraints are searchable and inspectable.  
* `keyref` relationships point to the correct key or unique constraint.  
* Selector and field expressions are visible with source markup.  
* No supported type-system or constraint construct is omitted.  
* Valid supported constraints no longer produce visualization-limit warnings.  
* Selected W3C XSD presentation regressions pass.  
  ---

  ## **24.14 Task 13.14 — Complete XSD Relationship and Schema-Set Visualization**

  ### **Goal**

Represent every supported relationship across an XSD 1.0 schema set accurately, including multi-file and namespace-sensitive relationships.

### **Build**

Represent and make reachable:

* `include`;  
* `import`;  
* `redefine`;  
* chameleon includes;  
* target-namespace relationships;  
* cross-file type references;  
* cross-file element references;  
* cross-file attribute references;  
* group and attribute-group references;  
* substitution-group membership;  
* type derivation;  
* identity-constraint references;  
* shared dependencies;  
* diamond dependency graphs;  
* legal recursive types and groups;  
* dependency cycles;  
* source-document ownership;  
* unresolved or blocked relationships where the project is incomplete.

Create relationship types that distinguish:

* containment;  
* declaration ownership;  
* reference;  
* type use;  
* derivation;  
* substitution;  
* identity-constraint linkage;  
* schema dependency;  
* redefinition.

Do not imply containment where only a reference exists.

### **Acceptance criteria**

* Every supported cross-component relationship has an explicit normalized edge type.  
* Every relationship points to the correct source and target.  
* Cycles remain bounded and do not create infinite duplication.  
* Shared dependencies remain shared rather than copied into misleading duplicate structures.  
* Chameleon includes preserve the effective namespace context.  
* Redefinitions preserve both original and redefined identities and relationships.  
* Missing dependencies remain visible as project-resolution outcomes, not fabricated nodes.  
* ZIP entry order cannot change the normalized relationship result.  
* All relationships remain understandable without relying only on colour.  
* Selected W3C schema-set regressions pass.  
  ---

  ## **24.15 Task 13.15 — Annotation, Appinfo, Foreign Content, and Source Completeness**

  ### **Goal**

Ensure that every meaningful piece of source content is preserved and presented, including content whose private semantics XML Carousel cannot interpret.

### **Build**

Represent and make reachable:

* every `xs:annotation`;  
* multiple annotations where the standards permit or Xerces accepts them;  
* every `xs:documentation`;  
* `xml:lang`;  
* documentation `source`;  
* mixed documentation content;  
* every `xs:appinfo`;  
* appinfo `source`;  
* nested foreign elements;  
* foreign attributes;  
* namespace-qualified extension content;  
* schema-level annotations;  
* annotations attached to every legal component type;  
* XML comments;  
* processing instructions;  
* source-document prolog information relevant to understanding the schema;  
* exact raw source fragments;  
* source ranges;  
* source-file identity.

For opaque foreign content:

* preserve the complete markup;  
* display it safely as structured or source content;  
* retain namespace and attribute information;  
* do not invent semantics;  
* do not omit it.

  ### **Acceptance criteria**

* Every annotation and annotation entry is reachable.  
* Multiple annotation blocks are preserved in source order.  
* Documentation text and mixed markup remain faithful to the source.  
* Appinfo and foreign content are never silently discarded.  
* Opaque content is clearly identified as preserved content whose private semantics are not interpreted.  
* Every component exposes its complete relevant source markup.  
* Every source-only fallback is recorded in the coverage matrix.  
* No known standard XSD or DTD construct relies only on raw-source fallback after its dedicated implementation task is complete.  
* Hermetic Foundry annotation and appinfo findings are eliminated as implementation gaps.  
* Safe plain-text and markup rendering pass security review.  
  ---

  ## **24.16 Task 13.16 — Complete ZIP and Multi-File Presentation**

  ### **Goal**

Present the complete supplied schema package, not merely the subset of declarations that happen to become carousel nodes.

### **Build**

Provide an accessible package representation for:

* every supplied DTD and XSD source;  
* archive-relative paths;  
* source order;  
* package root;  
* common root directory;  
* included and imported dependencies;  
* external-entity dependencies;  
* cross-file references;  
* shared files;  
* root schema candidates;  
* files with no navigable declaration nodes;  
* accepted auxiliary files used by schema resolution;  
* ignored archive entries, with an explicit reason for ignoring them;  
* unresolved references;  
* blocked references;  
* per-file validation and visualization status;  
* per-file Search and source-view access.

A non-schema entry need not be interpreted as schema, but it must not disappear silently from the package inventory.

### **Acceptance criteria**

* Every archive entry is either represented or explicitly listed as ignored with a reason.  
* Every schema source is openable in source view.  
* Every schema source has an accessible package-level entry.  
* Cross-file navigation identifies both source and target files.  
* Shared dependencies appear once as shared sources.  
* Entry order does not alter the normalized package.  
* Files without carousel nodes remain discoverable.  
* Search can identify declarations across all schema sources.  
* Inspector and source view always identify the owning file.  
* Hermetic Foundry exposes all 38 source files and all supported content.  
* No supplied supported construct is lost during package assembly.  
  ---

  ## **24.17 Task 13.17 — Visualization UX and Reachability Audit**

  ### **Goal**

Prove that complete model coverage results in a usable interface rather than a technically complete but inaccessible data structure.

### **Build**

Audit every construct and relationship through:

* carousel navigation;  
* Navigation outline;  
* Search;  
* inspector;  
* source view;  
* keyboard operation;  
* screen-reader semantics;  
* desktop layouts;  
* compact layouts;  
* Samsung-sized portrait and landscape layouts;  
* browser zoom;  
* reduced motion;  
* large schemas;  
* long names;  
* deep recursion;  
* broad branch sets;  
* cycles and shared references.

Define an appropriate primary presentation for each construct class.

A construct may be primarily presented outside the carousel when forcing it into the journey metaphor would be misleading. It must still be reachable, inspectable, and source-linked.

Add:

* stable contextual labels for unnamed components;  
* clear declaration-versus-reference language;  
* relationship labels;  
* file ownership;  
* continuation and overflow disclosure;  
* bounded navigation for dense structures.

  ### **Acceptance criteria**

* Every construct in the coverage matrix has at least one tested discovery route.  
* Every construct has an inspector or equivalent detailed presentation.  
* Every construct links to its source.  
* Named constructs are searchable.  
* Unnamed constructs are reachable contextually.  
* No valid construct is reachable only by manually reading the entire source file.  
* No interaction implies a false relationship.  
* Complete coverage remains usable on large projects.  
* Focus and inspection remain separate.  
* Compact layouts do not lose access to any construct class.  
* Keyboard and assistive-technology routes are complete.  
* The carousel remains contextual and bounded.  
  ---

## 

## **24.18 Task 13.18 — Complete Visualization Regression and Acceptance**

### **Goal**

Establish complete visualization and presentation as a release gate.

Partial visualization caused by missing XML Carousel implementation must no longer be accepted.

### **Build**

* Convert the Task 13.10 coverage matrix into an executable regression gate.  
* Add presentation-level tests for every supported DTD construct.  
* Add presentation-level tests for every supported XSD 1.0 construct.  
* Add relationship-level tests for every supported edge type.  
* Add ZIP and multi-file completeness tests.  
* Add Search, Navigation, inspector, and source-view reachability tests.  
* Run complete presentation coverage over:  
  * selected W3C XML/DTD cases;  
  * selected W3C XSD 1.0 cases;  
  * all persistent project fixtures;  
  * synthetic complete-coverage projects;  
  * the external Hermetic Foundry package.  
* Audit every remaining visualization finding.  
* Remove transitional generic “unsupported component” handling for constructs now implemented.  
* Retain safe fallback presentation only for:  
  * explicitly unsupported standards;  
  * opaque foreign semantics that are nevertheless fully preserved and displayed;  
  * incomplete projects with missing or blocked dependencies.

  ### **Acceptance criteria**

* No standards-valid supported DTD construct is omitted.  
* No standards-valid supported XSD 1.0 construct is omitted.  
* No supported construct is represented only by a generic placeholder when its semantics are known.  
* Every supported construct is discoverable, inspectable, and source-linked.  
* Every supported relationship is accurate.  
* Every source in a ZIP package is represented.  
* Every non-schema ZIP entry is represented in the package inventory or explicitly identified as ignored.  
* The executable coverage matrix reports no unexplained gaps.  
* Selected W3C presentation suites have zero unexplained failures.  
* Hermetic Foundry has zero omitted supported constructs.  
* Hermetic Foundry produces no visualization findings caused by missing XML Carousel implementation.  
* Any remaining warning names an explicitly unsupported standard, incomplete dependency, or opaque foreign semantic boundary.  
* Complete projects expose no partial-visualization warning.  
* Existing validity, security, lifecycle, browser, accessibility, portability, and deterministic-build gates pass.  
* A formal review recommends either:  
  * proceed to Task 13.19; or  
  * complete a bounded corrective visualization task before proceeding.

Semantic zoom must not begin until this task passes.

---

## **24.19 Task 13.19 — Standards Support, Visualization Completeness, Limitations, Licensing, and Attribution**

### **Goal**

Bring user-facing and technical documentation into exact agreement with the stabilized standards engine and the completed visualization implementation.

### **Build**

* Document the supported XML, DTD, and XSD standards boundary.  
* Document complete visualization coverage within that supported boundary.  
* Document intentionally unsupported standards.  
* Document the distinction among:  
  * standards validity;  
  * blocked or missing dependencies;  
  * security failure;  
  * resource-limit failure;  
  * unsupported standard;  
  * opaque foreign semantics;  
  * internal failure.  
* Document project-local include, import, and entity-resolution policy.  
* Document blocked external retrieval and traversal behavior.  
* Document all relevant resource limits.  
* Document supported browser and deployment expectations.  
* Document how ZIP entries and ignored non-schema files are presented.  
* Document how arbitrary appinfo and foreign content are preserved.  
* Remove stale migration, spike, provisional, and partial-visualization language.  
* Review redistributed Xerces, Emscripten, W3C corpus-subset, and related licence and notice obligations.  
* Verify that production attribution files are complete, accurate, and reachable.  
* Perform a final documentation-to-runtime and documentation-to-visualization consistency audit.

  ### **Acceptance criteria**

* Users can determine exactly which standards are supported.  
* Users can determine how every supported construct is presented.  
* Documentation does not describe missing implementation as an acceptable visualization limitation.  
* Technical documentation matches the tested resolver and security policy.  
* Opaque foreign semantics are distinguished from omitted content.  
* Known limitations are explicit, current, and outside the completed supported boundary.  
* All redistributed third-party licence and notice obligations are satisfied.  
* Production attribution files remain present in deterministic builds.  
* No documentation claims remote retrieval, backend operation, XSD 1.1 support, or semantic interpretation that the application does not provide.  
* Documentation-only changes pass formatting, link, build, and complete repository validation.  
  ---

## **24.20 Visualization Completion Gate Before Semantic Zoom**

The Desktop Semantic Zoom milestone must not begin until Task 13.18 has passed.

Semantic zoom changes how already-supported schema information is presented at different levels of detail. It must not be used to conceal missing extraction, missing model support, omitted constructs, incomplete Search coverage, or incomplete inspector coverage.

The required order is:

1. Task 13.9 — Expanded Conformance and Hermetic Foundry Regression Coverage.  
2. Task 13.10 — Complete Visualization Coverage Audit.  
3. Task 13.11 — Complete DTD Visualization.  
4. Task 13.12 — Complete XSD 1.0 Structural Visualization.  
5. Task 13.13 — Complete XSD 1.0 Type-System and Constraint Visualization.  
6. Task 13.14 — Complete XSD Relationship and Schema-Set Visualization.  
7. Task 13.15 — Annotation, Appinfo, Foreign Content, and Source Completeness.  
8. Task 13.16 — Complete ZIP and Multi-File Presentation.  
9. Task 13.17 — Visualization UX and Reachability Audit.  
10. Task 13.18 — Complete Visualization Regression and Acceptance.  
11. Task 13.19 — Standards Support, Visualization Completeness, Limitations, Licensing, and Attribution.  
12. Tasks 14.1–14.6 — Desktop Semantic Zoom.  
* 

---

# **25\. Desktop Semantic Zoom**

## **25.1 Goal**

Add three desktop-only semantic presentation levels for exploring more of the schema neighbourhood without replacing the existing detailed carousel.

Semantic zoom follows the standards-engine and diagnostics work because it depends on a trustworthy, tolerant normalized schema graph.

## **25.2 Semantic Zoom Levels**

### **Detail**

The existing full carousel presentation.

It remains:

* the default presentation;  
* the only presentation on small or unsupported surfaces;  
* the authoritative detailed interaction model.

### **Context**

A mid-zoom presentation showing more generations of nearby schema structure.

Each visible node should show:

* element or declaration name;  
* occurrence information when contextually meaningful;  
* an explicit **Inspect** control.

Connector lines show visible relationships to ancestors and descendants.

### **Overview**

A zoomed-out presentation showing a broader bounded neighbourhood.

Each visible node should show only its name, with connector lines between visible relationships.

The overview must not attempt to display the entire schema regardless of size.

## **25.3 Desktop-Only Availability**

Availability should be based on the actual rendered carousel surface, using the existing responsive measurement architecture rather than user-agent detection.

When the rendered surface is below the supported threshold:

* the application forces Detail;  
* zoom controls are absent;  
* wheel zoom is inactive;  
* the existing compact carousel remains unchanged.

Shrinking below the threshold returns to Detail without losing project, journey, search, or inspector state.

Enlarging again does not unexpectedly restore a previously hidden zoom level.

## **25.4 Interaction**

* Overview node activation focuses the node and enters Context.  
* Activating a nonfocused Context node changes focus while remaining in Context.  
* Activating the focused Context node enters Detail.  
* **Inspect** remains independent.  
* Wheel or trackpad zoom applies only over the carousel surface.  
* Navigation, inspector, and modal scrolling retain ordinary behaviour.  
* Browser-level zoom commands remain browser functions.

## **25.5 Bounded Neighbourhood**

Context and Overview must be:

* depth-limited;  
* viewport-bounded;  
* cycle-safe;  
* reuse-aware;  
* deterministic;  
* compatible with partially visualized projects.

Unsupported or omitted schema structures must not cause infinite expansion or misleading connector relationships.

## **25.6 Recommended Task Breakdown**

1. Semantic zoom state and desktop availability.  
2. Context-mode neighbourhood and node presentation.  
3. SVG connector layer and viewport continuation.  
4. Overview mode.  
5. Wheel input, transitions, accessibility, performance, and stabilization.

The previously documented detailed semantic-zoom acceptance criteria remain applicable unless changed by later design review.

---

# **26\. Updated Definition of Done for Standards-Engine Tasks**

A Xerces-related task is complete only when:

* the task’s bounded goal is met;  
* existing import, focus, cancellation, stale-worker, responsive, and inspector behaviours remain intact;  
* focused automated tests pass;  
* the complete automated suite passes;  
* the production build succeeds;  
* portable distribution verification succeeds;  
* all required worker and WASM assets are present and nonempty;  
* root and nested-path asset loading are tested where applicable;  
* external retrieval is demonstrably blocked;  
* resource-limit behaviour is tested where applicable;  
* Hermetic Foundry schema results are explicitly reported;  
* new persistent test inputs are stored under `tests/fixtures/`;  
* licences and attribution obligations for added third-party source or binaries are identified;  
* manual browser QA is complete;  
* known limitations are documented;  
* no unrelated refactor is mixed into the task;  
* implementation remains unstaged and uncommitted until manual QA approval.

---

# **27\. Review Gate Before Task 13.2 Instructions**

Before preparing the Xerces feasibility-spike instructions, confirm or resolve:

* the exact Xerces-C++ release to pin;  
* whether Emscripten is installed globally, installed through a reproducible project toolchain, or invoked through a documented build environment;  
* where Xerces source and build scripts belong in the repository;  
* whether generated WASM is committed, generated during build, or produced by a separate reproducible vendor-build step;  
* the acceptable initial WASM size;  
* the minimum supported browsers;  
* the initial DTD entry strategy for standalone `.dtd` files;  
* the source-location expectations for XSD and DTD diagnostics;  
* the location of the complete Hermetic Foundry test corpus;  
* which selected W3C conformance cases should be vendored or fetched outside the repository;  
* third-party licence and notice-file requirements;  
* whether the feasibility spike may use an existing wrapper solely as a comparator.

The Codex instructions must then use:

* the latest clean synchronized `main` baseline;  
* an exact task branch;  
* strict Git preflight;  
* a nonproduction spike boundary;  
* focused tests and full validation;  
* explicit root and nested-path WASM loading tests;  
* real-browser QA;  
* exact artifact-size reporting;  
* an unstaged and uncommitted completion state.

# **28\. Approved Post-Semantic-Zoom Milestone**

## **28.1 Current Completed Baseline**

XML Carousel `0.1.0` is complete as the first public alpha.

The following major post-alpha development work is also complete:

* Tasks 13.1–13.17, including the Xerces-C++ WebAssembly standards boundary, normalized diagnostics, tolerant visualization, complete problem reporting, persistent Problems access, package presentation, visualization coverage, and release-gap audits.  
* Tasks 14.1–14.5, including Full, Compact, and Overview semantic zoom, semantic relationship lines, responsive fallback, accessible transitions, forced-colour support, and final semantic-zoom acceptance.  
* The Task 14.5 hosted-CI correction.  
* Final semantic-zoom milestone acceptance and exact-SHA hosted CI.

Future work begins from the latest clean, synchronized `main` branch and must preserve the accepted standards, privacy, accessibility, responsive, performance, and local-first boundaries.

The next approved milestone is:

> **Developer Handoff Utilities**

Approval date: **2026-08-06**

---

## **28.2 Developer Handoff Utilities**

### **Goal**

Help users transfer trustworthy information from XML Carousel into editors, issue reports, technical documentation, email, chat, and other developer workflows.

This milestone must improve access to retained source and node information without turning XML Carousel into:

* a schema editor;  
* a source-code IDE;  
* a serializer;  
* a round-trip authoring tool;  
* a project export system.

XML Carousel remains a read-only, local-first schema exploration application.

### **Core Boundaries**

The following rules are non-negotiable:

* XML Carousel does not edit, rewrite, save, or replace schema source.  
* Xerces remains the authoritative standards parser and validator.  
* No new parser, resolver, or schema-model authority is introduced.  
* Source display and copying use retained source text whenever available.  
* XML or DTD declarations must not be reconstructed from the normalized graph and presented as original source.  
* Source identity and source location must be truthful.  
* Exact line or column values must never be fabricated.  
* Approximate, declaration-level, or unavailable locations must be labelled honestly.  
* Copied node summaries are deterministic plain text intended for human communication.  
* Copied summaries are not a serialization or interchange format.  
* Clipboard writes occur only after an explicit user action.  
* Copied source and summaries remain local to the browser.  
* XML Carousel does not transmit clipboard content to an application backend.  
* This milestone does not imply a version change, release, or deployment.

---

## **28.3 Source View Modal**

The existing source-view presentation is too constrained for comfortable reading.

Source should therefore open in a dedicated modal rather than being confined to a small inspector section or compact inline view.

### **Goal**

Provide a large, readable, focused source-viewing surface while preserving the independence of:

* carousel focus;  
* inspector target;  
* navigation journey;  
* Search state;  
* active project;  
* semantic zoom level.

Opening or closing source view must not change any of those states.

### **Opening Source View**

Source view must require a deliberate, visible action, such as:

View source

The control may appear in appropriate places such as:

* the focused card;  
* the inspector;  
* Search results where a declaration has retained source;  
* package inventory or source-oriented views where applicable.

Activating **View source** opens the modal for the selected declaration or source record.

It must not:

* centre the node;  
* navigate the carousel;  
* change the inspector target;  
* copy anything automatically;  
* open source for an unrelated declaration.

### **Modal Presentation**

The source modal should provide:

* a clear title identifying the declaration or node;  
* source filename or package-relative path;  
* truthful source location information;  
* the retained source fragment or declaration;  
* a large, scrollable reading area;  
* monospaced text;  
* safe escaped rendering;  
* preserved whitespace;  
* readable line spacing;  
* visible line numbers where trustworthy line boundaries are retained;  
* horizontal scrolling for long source lines;  
* optional line wrapping if it can be implemented without obscuring source fidelity;  
* a **Copy source** action where retained source is available;  
* a clear **Close** action.

The modal should use substantially more screen space than the current source presentation.

On desktop, it may occupy most of the available viewport while retaining visible margins.

On narrow screens, it should use an appropriately contained near-full-screen layout without introducing document-level horizontal overflow.

### **Readability Requirements**

The source modal must favour reading and inspection over compactness.

Requirements include:

* source text must not be reduced to an unusually small font;  
* long lines must remain accessible;  
* indentation and significant whitespace must be preserved;  
* XML markup must remain visually distinguishable;  
* source must never be rendered through unsafe `innerHTML`;  
* focus indicators must remain visible;  
* modal controls must remain reachable at 200% text scaling;  
* source text must remain usable in forced-colour and reduced-motion environments.

Syntax colouring may be used only if:

* the uncoloured text remains readable;  
* colour is not the only means of distinguishing content;  
* source fidelity is not changed;  
* unsafe HTML is not introduced.

### **Modal Accessibility**

The source modal must:

* use appropriate dialog semantics;  
* have an accessible name;  
* move focus into the modal when opened;  
* trap focus while open;  
* support Escape to close;  
* restore focus to the control that opened it;  
* keep source text keyboard-scrollable;  
* provide accessible names for Copy and Close;  
* announce copy success or failure without moving focus unnecessarily;  
* avoid background carousel keyboard navigation while open.

### **Source Truth Rules**

The modal must show the most accurate retained source representation available.

Possible source-location states include:

Exact line and column

Exact line only

Declaration-level or approximate location

Source identity with no retained location

The UI must distinguish these states honestly.

It must not display misleading information such as:

Line 1

when line 1 is merely a default, placeholder, or inferred value rather than a retained source location.

When exact location is unavailable, use language such as:

Declaration location unavailable

Approximate declaration location

Source file known; line unavailable

### **Modal State**

Source-view state should be independent from inspection state.

A suitable conceptual model is:

sourceViewTarget

sourceViewOrigin

sourceViewIsOpen

Closing source view returns the user to the same carousel, Search, inspector, and semantic-zoom state that existed before it opened.

Replacing the active project must close obsolete source view and clear stale source targets.

---

## **28.4 Task 15.2 — Visible Source Identity, Location, and Source Modal Foundation**

### **Goal**

Make the source origin of focused and inspected declarations immediately understandable and introduce the dedicated source-view modal.

### **Required Visible Result**

Users can see, where available:

Source filename or package-relative path

Declaration location

Location precision or confidence

View source

Activating **View source** opens the new modal with the retained declaration or source fragment.

### **Required Source Identity**

For ZIP and multi-file projects, use project-relative paths such as:

project-root/types/common.xsd

Do not expose absolute local filesystem paths.

Standalone files may show their supplied filename.

### **Required Location Distinctions**

The interface must distinguish:

Exact line and column

Exact line only

Declaration-level or approximate location

Source known but location unavailable

Do not fabricate source coordinates.

### **Architecture Boundary**

* Reuse retained source and location metadata.  
* Do not reparse source inside UI components.  
* Do not change Xerces authority.  
* Do not introduce remote or filesystem lookup.  
* Do not derive source location from presentation order.  
* Keep modal state separate from carousel and inspector state.

### **Tests**

Automated coverage must include:

* standalone DTD;  
* standalone XSD;  
* multi-file ZIP;  
* package-relative source paths;  
* declarations with exact locations;  
* declarations without retained locations;  
* long filenames and paths;  
* source containing markup-like text;  
* modal open and close;  
* Escape behaviour;  
* focus trapping and restoration;  
* project replacement;  
* Search-origin opening;  
* inspector-origin opening;  
* responsive containment;  
* 200% text scaling;  
* forced colours;  
* no journey or inspection mutation.

### **Manual QA**

Ben should verify that:

* source identity is immediately understandable;  
* no misleading line numbers appear;  
* the modal is substantially easier to read than the old source presentation;  
* source remains readable at desktop and narrow layouts;  
* focus returns to the correct opening control;  
* opening source does not navigate or change inspection;  
* DTD, XSD, and ZIP source fragments are faithful.

---

## **28.5 Task 15.3 — Safe Copy-Source Action**

### **Goal**

Allow users to copy the retained source fragment displayed in the source modal.

### **Required Visible Result**

The modal provides a deliberate native control:

Copy source

After successful copying, provide concise feedback:

Copied source

If copying fails, the interface must provide truthful feedback and must not claim success.

### **Source Fidelity Rules**

The copied text must:

* come from retained source;  
* preserve retained spelling;  
* preserve namespace prefixes;  
* preserve significant whitespace;  
* preserve comments included in the retained fragment;  
* preserve declaration ordering;  
* preserve escaped characters as source text;  
* exclude unrelated hidden project content;  
* exclude binary package entries.

Do not reconstruct markup from the normalized schema model.

### **Clipboard Rules**

* Clipboard writes require explicit user activation.  
* Use the browser Clipboard API where available.  
* Preserve keyboard operation.  
* Handle permission denial.  
* Handle unavailable Clipboard API.  
* Do not add a dependency solely for clipboard access.  
* Do not copy automatically when the modal opens.  
* Do not copy automatically when the inspected or focused node changes.  
* Do not transmit copied content.  
* Do not close the modal after copying unless a later explicit UX decision requires it.

### **Feedback and Focus**

Copy feedback should:

* be understandable without relying on colour;  
* use an appropriate polite announcement;  
* not steal focus;  
* not create repeated duplicate announcements;  
* clear or update appropriately when the source target changes.

### **Tests**

Automated coverage must include:

* successful clipboard write;  
* rejected clipboard write;  
* unavailable Clipboard API;  
* retained DTD source;  
* retained XSD source;  
* ZIP-relative source;  
* comments and whitespace;  
* special characters;  
* focus retention;  
* accessible announcement;  
* repeated copy;  
* project replacement;  
* no navigation or inspector mutation;  
* no external request.

### **Manual QA**

Ben should verify that copied source matches the visible retained source exactly and pastes cleanly into:

* a text editor;  
* an issue tracker;  
* email or chat;  
* technical documentation.

---

## **28.6 Task 15.4 — Deterministic Copy-Node-Summary Action**

### **Goal**

Provide a stable, readable summary of a schema node for issue reports, developer notes, technical documents, chat, and email.

### **Required Visible Result**

Provide a deliberate control:

Copy node summary

The control may appear in the inspector and other appropriate node-detail surfaces.

It must not replace **Copy source**. The two actions serve different purposes.

### **Summary Contract**

The summary must be deterministic plain text.

It may include truthful available fields such as:

Name

Node kind

Source file or package-relative path

Source location

Type

Base type

Reference

Occurrence

Content model or structural destinations

Attribute information

Documentation or comment indicator

Short documentation or comment excerpt

Incoming use count

The exact fields and order must be defined in one central formatter.

Unavailable fields should normally be omitted rather than filled with misleading placeholders.

### **Plain-Text Example**

A possible summary shape is:

Name: hf:identity

Kind: Global element

Source: project-root/entity.xsd

Location: Line 42, column 3

Type: hf:entityIdentityType

Occurs: 1

Structural destinations: 5

Attributes: 1

Documentation: Defines the stable identity of an entity.

Used by: 1 declaration

The exact final wording should follow existing XML Carousel terminology.

### **Determinism Requirements**

For the same project and node, the summary must have:

* stable field ordering;  
* stable relationship ordering;  
* stable newline behaviour;  
* stable occurrence wording;  
* no timestamps;  
* no random identifiers;  
* no transient animation or focus state;  
* no absolute local paths;  
* no browser-dependent formatting;  
* no hidden UI-only metadata.

### **Non-Goals**

The copied summary is not:

* XML;  
* DTD source;  
* JSON interchange;  
* a complete project export;  
* a reconstructed declaration;  
* a guaranteed permanent external API;  
* a replacement for source view;  
* a substitute for the full inspector.

The summary should remain readable when pasted into systems that do not render Markdown.

### **Clipboard and Feedback Rules**

Use the same explicit-action, success, failure, focus, announcement, and privacy rules as **Copy source**.

### **Tests**

Automated coverage must include:

* representative DTD elements;  
* DTD attributes;  
* XSD elements and types;  
* ZIP package paths;  
* shared nodes;  
* duplicate edges;  
* cycles;  
* long names;  
* missing optional metadata;  
* stable relationship ordering;  
* repeated formatting determinism;  
* newline stability;  
* clipboard success and failure;  
* accessibility;  
* no state mutation;  
* no absolute paths.

### **Manual QA**

Ben should paste summaries into several external contexts and confirm that they are:

* understandable without XML Carousel;  
* technically accurate;  
* concise enough for handoff;  
* stable across repeated copies;  
* clearly different from raw source.

---

## **28.7 Task 15.5 — Developer Handoff Utilities Stabilization and Acceptance**

### **Goal**

Perform the final acceptance and stabilization audit for source identity, source modal, source copying, and node-summary copying.

### **Required Audit Areas**

The audit must cover:

* truthful source identity;  
* truthful location precision;  
* no fabricated line or column values;  
* modal readability;  
* modal focus containment and restoration;  
* retained-source fidelity;  
* deterministic summary formatting;  
* clipboard success and failure;  
* keyboard operation;  
* announcements;  
* responsive containment;  
* 200% text scaling;  
* magnification-equivalent reflow;  
* forced colours;  
* reduced motion where applicable;  
* standalone DTD;  
* standalone XSD;  
* multi-file ZIP;  
* package-relative source paths;  
* project replacement;  
* Search and inspector origins;  
* large-project boundedness;  
* privacy and network isolation;  
* controlled Chrome and Firefox evidence;  
* technical documentation;  
* no parser, model, validation, or standards regression.

### **Completion Boundary**

The Developer Handoff Utilities milestone closes only after:

* focused automated tests pass;  
* complete validation passes;  
* controlled-browser evidence passes;  
* Ben’s manual QA passes;  
* exact-scope integration succeeds;  
* staged, task, hypothetical-merge, actual-merge, and final trees match;  
* hosted CI succeeds for the exact merge SHA.

---

## **28.8 Later Roadmap Candidates**

The following remain roadmap candidates and are not approved implementation work:

Large-project performance and capacity

Accessibility and platform evidence

In-memory session history

Persistent local project reopening

Schema comparison

They should not receive Task 16 numbers until separately reviewed and approved.

---

## **28.9 Unresolved Product Decisions**

The following decisions remain open:

* Whether XML Carousel should remain permanently read-only or eventually support editing/export.  
* Whether future standards work should remain limited to XSD 1.0 or include XSD 1.1.  
* Whether Safari/WebKit support is a release requirement.  
* Whether manual screen-reader testing or certification is required.  
* Whether projects should persist and reopen across reloads.  
* Whether documentation and appinfo should optionally become navigable nodes.  
* Whether schema comparison should become a core workflow.  
* Whether Developer Handoff Utilities should form a `0.2.0` release.  
* Whether large-project performance should immediately follow this milestone.  
* Whether explicit `I` or `D` inspector keyboard shortcuts should be added.

These decisions must not be inferred from approval of Developer Handoff Utilities.

---

# **29\. XML Carousel 0.3.0 — RELAX NG Support and Universal Reference Representation**

## **29.1 Release Goal**

Version 0.3.0 adds first-class **RELAX NG** support while preserving the standards rigor, supplied-files-only security model, normalized diagnostics, source fidelity, semantic zoom, Search, Navigation, Inspector, and Developer Handoff Utilities established for DTD and XSD.

The release should support both principal RELAX NG syntaxes:

* RELAX NG XML syntax (`.rng`)
* RELAX NG Compact Syntax (`.rnc`)

Preferred production architecture:

```text
DTD / XSD 1.0
    ↓
Apache Xerces-C++ WASM

RELAX NG XML syntax
    ↓
libxml2 WASM

RELAX NG Compact Syntax
    ↓
compact-syntax front end
    ↓
equivalent RELAX NG representation
    ↓
libxml2 WASM
```

Development/conformance roles:

```text
Jing
    → RELAX NG reference validation/comparison

Trang
    → RNG/RNC translation oracle

RNV
    → candidate production Compact Syntax front end, subject to feasibility and differential-testing evidence
```

The production Compact Syntax front end must be selected by evidence in Task 17.2. RNV is a candidate, not a pre-approved standards authority.

Apache Xerces-C++ remains authoritative for DTD and XSD. Adding libxml2 must not trigger migration of already accepted DTD/XSD validation away from Xerces.

## **29.2 Task 17.1 — RELAX NG Standards and Product Contract**

Define the exact 0.3.0 RELAX NG boundary before production implementation.

Target supported scope:

* RELAX NG 1.0 XML syntax (`.rng`)
* RELAX NG Compact Syntax (`.rnc`)
* standalone schemas
* ZIP/multi-file projects
* `grammar`, `start`, `define`, `ref`, `parentRef`
* `element`, `attribute`
* `choice`, `group`, `interleave`
* `optional`, `zeroOrMore`, `oneOrMore`
* `mixed`, `list`, `text`, `empty`, `notAllowed`
* `data`, `value`, `param`, `except`
* `include`, `externalRef`
* name classes, including `name`, `anyName`, `nsName`, choice, and exclusions
* `combine="choice"` and `combine="interleave"`
* datatype libraries, including XML Schema datatypes where supported
* RELAX NG DTD Compatibility features where explicitly supported
* annotations, documentation, and foreign content
* exact retained source
* truthful source identity/location
* Problems, Navigation, Search, carousel focus, Inspector, source view
* Copy source and Copy node summary
* Full, Compact, and Overview semantic zoom

Outside 0.3.0:

* NVDL
* Schematron
* XML instance-document validation as a product workflow
* remote schema retrieval
* arbitrary host-filesystem discovery
* editing/export
* persistent project reopening

The standards validator remains authoritative. Extraction/presentation must not become a second RELAX NG validator.

## **29.3 Task 17.2 — libxml2 and Compact-Syntax Feasibility Spike**

### libxml2-WASM feasibility

Prove:

```text
.rng source in memory
    ↓
RELAX NG schema compilation
    ↓
accepted / rejected standards result
    ↓
structured diagnostics
```

Exercise valid/invalid schemas, namespaces, datatype libraries, `include`, `externalRef`, diagnostics, controlled project-local resource loading, missing dependencies, blocked HTTP/HTTPS, blocked `file:`, traversal, recursive includes, cycles, cancellation, stale-result replacement, repeated loading, and cleanup.

The production libxml2 build must not independently retrieve resources from the network or filesystem.

### Jing differential comparison

Run representative cases through libxml2 and Jing, classify every disagreement, and establish explicit accepted boundaries before production adoption.

### Compact Syntax feasibility

Evaluate:

* RNV compiled to WASM
* parser/API suitability
* source-range and error-location fidelity
* preservation of original `.rnc` source
* Trang as a reference translation oracle
* Jing validation of equivalent `.rng` and `.rnc`

Select the production Compact Syntax front end only after evidence supports standards suitability, source fidelity, diagnostics, cancellation, and integration.

## **29.4 Task 17.3 — Production RELAX NG Standards Engine**

Integrate the accepted RELAX NG engine into the production worker architecture.

```text
                    XML Carousel
                         │
             ┌───────────┴───────────┐
             │                       │
      Xerces-C++ WASM           libxml2 WASM
             │                       │
        DTD / XSD 1.0            RELAX NG
             │                       │
             └───────────┬───────────┘
                         │
             normalized diagnostics
                         │
             schema-specific extractors
                         │
              normalized schema graph
                         │
                    XML Carousel
```

Require pinned/reproducible source and builds, licensing, worker integration, cancellation, stale-result suppression, resource limits, static portability, hostile-MIME coverage, no external retrieval, and root/nested deployment support.

Do not replace Xerces with libxml2 for DTD or XSD.

## **29.5 Task 17.4 — Standalone RNG Import and Diagnostics**

Add the user-facing import control:

```text
Open DTD
Open XSD
Open RNG
Open ZIP
```

**Open RNG** is the approved UI label.

The final control accepts both `.rng` and `.rnc`. The first implementation phase may enable `.rng` before `.rnc`, but 0.3.0 is not complete until both are supported.

For standalone `.rng`, establish classification, import lifecycle, standards validation, Problems, cancellation, replacement safety, filename/source identity, exact retained source, and initial source view.

Do not build the complete RELAX NG visualization in this task.

## **29.6 Task 17.5 — RELAX NG Multi-File, URI Reference, and Package Resolution**

Add project dependency handling before rich visualization.

Support `include`, `externalRef`, nested relative paths, safe `..` normalization inside the virtual root, shared dependencies, cycles, missing dependencies, duplicate basenames, ambiguous targets, blocked traversal, blocked filesystem paths, blocked `file:` URIs, and blocked HTTP/HTTPS URIs.

The 0.3.0 rule remains:

> Dependencies resolve only from files explicitly supplied by the user.

Remote URIs must be **preserved and visualized without retrieval**.

Example:

```text
main.rng
    │
    └── externalRef
            ↓
       https://example.org/common.rng
       Blocked external reference
```

Do not manufacture a fake schema target and do not match a remote URI to a ZIP member by basename.

## **29.7 Task 17.6 — RELAX NG Normalized Semantic Model**

Build a first-class pattern-oriented model covering at least:

* grammar, start, define, ref, parentRef
* element, attribute
* choice, group, interleave
* optional, zeroOrMore, oneOrMore
* mixed, list, text, empty, notAllowed
* data, value, param, except
* include, externalRef
* name classes and exclusions
* annotations/documentation/foreign content
* combine
* datatype-library and namespace context

Preserve source order, source identity, exact fragments, supported source ranges, relationship semantics, original reference text, and resolution state.

The extractor must not reject a standards-valid schema merely because visualization does not yet understand a construct.

## **29.8 Task 17.7 — RELAX NG Visualization and Navigation**

Design a presentation that respects RELAX NG's pattern-oriented nature.

Primary navigation entities should normally emphasize:

* grammar
* start pattern
* named definitions
* element patterns
* include/external relationships

Composition operators such as choice, group, interleave, repetition, attributes, name classes, and datatype constraints should be presented contextually rather than automatically becoming carousel cards.

The Inspector may expose richer pattern detail than the carousel.

## **29.9 Task 17.8 — RELAX NG Compact Syntax**

Enable production `.rnc` support after the XML-syntax semantic model is stable.

Equivalent `.rng` and `.rnc` schemas should produce equivalent semantic graphs and relationship meaning, while preserving distinct original source.

For `.rnc`:

* View source shows original Compact Syntax
* Copy source copies original Compact Syntax
* diagnostics/source locations refer to original source where supported
* package identity remains the `.rnc` file

Any internally generated XML representation is an implementation artifact and must never be presented as the user's source.

## **29.10 Task 17.9 — RELAX NG Conformance and Complete Visualization Gate**

Use:

```text
RELAX NG specification/test corpus
            +
Jing differential comparison
            +
real-world RELAX NG grammars
```

Use Trang as an independent RNG/RNC translation oracle.

Add a deterministic complete-visualization matrix for supported RELAX NG constructs.

Equivalent RNG/RNC fixtures should prove semantic equivalence while retaining faithful syntax-specific source.

## **29.11 Task 17.10 — RELAX NG Stabilization and 0.3.0 Acceptance**

Run end-to-end acceptance for standalone/multi-file RNG and RNC, valid/invalid schemas, incomplete packages, cycles, blocked external references, large grammars, Search, Navigation, Inspector, Problems, source modal, copy utilities, semantic zoom, focused Overview Inspect, accessibility/responsive behavior, Chrome, Firefox, deterministic build, cleanup, privacy/no-network behavior, licensing, and release documentation.

0.3.0 is not complete until both `.rng` and `.rnc` are first-class supported inputs.

## **29.12 Universal Schema Reference Representation Rule**

Formalize this cross-format rule:

> **References are schema information even when their targets are unavailable. XML Carousel should visualize the reference faithfully; it should visualize target contents only when the target was actually supplied and safely resolved.**

Apply to:

### DTD

* external subsets
* external parameter entities
* relevant external general entities

### XSD

* `xs:include`
* `xs:import`
* `xs:redefine`

### RELAX NG

* `include`
* `externalRef`

Common states:

```text
Resolved locally
Missing from supplied project
Ambiguous local reference
Blocked external URI
Blocked filesystem reference
Blocked traversal reference
```

Make literal targets visible through appropriate Inspector, package-inventory, Problems, source-view, and dependency/navigation surfaces.

Blocked remote references may be terminal relationship presentations but must not masquerade as loaded schema documents.

---

# **30\. XML Carousel 0.4.0 — Secure External Schema Resolution**

## **30.1 Release Goal**

Version 0.4.0 adds **controlled external resource resolution** for:

* DTD
* XSD 1.0
* RELAX NG XML syntax
* RELAX NG Compact Syntax

Headline requirement:

> **Secure external schema resolution for DTD, XSD, and RELAX NG, with imported resources becoming first-class members of the active XML Carousel project.**

Fetched resources must retain canonical identity, requested URI, redirected/final URI where applicable, source/provenance, validator participation, normalized nodes/relationships, Search, Navigation, Inspector, source view, and dependency relationships.

## **30.2 Task 18.1 — External Resolution Security and Product Contract**

Define supported schemes, opt-in behavior, redirect policy/limits, CORS behavior, timeouts, per-resource and total size limits, resource-count/depth limits, cycle handling, caching, cancellation, stale-result suppression, credential-bearing URI policy, privacy disclosure, and failure/retry behavior.

Opening a schema must not silently contact arbitrary domains.

Preferred UX:

```text
This schema references 4 external resources.

3 HTTPS resources may be retrieved.
1 file: reference is blocked.

[Load external references]
```

## **30.3 Task 18.2 — Controlled HTTP/HTTPS Resource Resolver**

Create one XML Carousel-owned resolver for URI policy, HTTP/HTTPS fetching, redirects, final URI, raw bytes, MIME metadata, limits, timeouts, cancellation, cycles, provenance, diagnostics, and per-project caching.

Xerces/libxml2 must not independently perform network retrieval.

## **30.4 Task 18.3 — External Project Resource Model**

Fetched resources become explicit project members.

Track:

```text
Requested URI
Final resolved URI
Fetch status
Origin/provenance
Content length
Source text
Validator status
Importing resources
Dependencies
Dependents
```

Distinguish:

```text
supplied local resource
fetched remote resource
missing local resource
blocked reference
failed remote fetch
browser/CORS blocked fetch
invalid fetched schema
```

## **30.5 Task 18.4 — DTD External Resolution**

Implement DTD external resolution first because DTD is foundational to XML and is the logical starting point for external-resource semantics.

Support and strictly bound:

* external DTD subsets
* external parameter entities
* relevant external general entities used during grammar construction
* nested external entity references
* relative URI resolution
* HTTP/HTTPS
* redirects
* cycles
* missing/failed resources
* browser/CORS failures
* encoding
* source identity/provenance

Define strict limits for expansion, depth, total fetched bytes, resource count, recursion, and repeated references.

Preserve Xerces as the authoritative DTD standards engine while supplying only XML Carousel-approved resources.

## **30.6 Task 18.5 — XSD External Resolution**

Implement controlled resolution for:

* `xs:include`
* `xs:import`
* `xs:redefine`

Preserve their distinct XML Schema namespace and composition semantics.

Cover target namespaces, chameleon includes, imports, redefine behavior, relative and remote URIs, redirects, chained dependencies, cycles, shared dependencies, failures, CORS, invalid fetched schemas, and provenance.

Xerces remains authoritative for XSD 1.0.

## **30.7 Task 18.6 — RELAX NG External Resolution**

Implement controlled resolution for RNG and RNC:

* `include`
* `externalRef`
* mixed local/remote graphs
* relative/remote URIs
* redirects
* cycles/shared resources
* missing/failed resources
* CORS
* source/provenance fidelity

A remotely fetched dependency and an equivalent supplied dependency should produce the same semantic result, differing only in provenance/resolution state.

## **30.8 Task 18.7 — External Dependency Visualization and Source UX**

Distinguish:

```text
Resolved — supplied locally
Resolved — fetched remotely
Missing local resource
Blocked by XML Carousel policy
Remote fetch failed
Remote fetch blocked by browser/CORS
Remote validation failed
```

Show requested URI, final redirected URI, local/package path, provenance, importing relationship, resolution status, and validation status as appropriate.

Successful remote resources become navigable/searchable/inspectable/source-viewable. Blocked/failed references remain terminal reference presentations.

## **30.9 Task 18.8 — Caching, Replacement, and Cancellation**

Add bounded in-memory per-project caching, deduplicate shared dependencies, cancel outstanding requests on project replacement, suppress stale results, clean up worker/network state, and avoid persistent background activity.

Persistent cross-session caching is not required unless separately approved.

## **30.10 Task 18.9 — Adversarial Network and URI Security Audit**

Cover redirect chains/loops, cross-origin redirects, huge resources, excessive counts/depth, cycles, malformed URIs, unsupported schemes, `file:`, `data:`, credential-bearing URLs, URI normalization collisions, hostile MIME, HTTP errors, empty responses, invalid encodings/schemas, slow responses, cancellation, stale results, CORS denial, and mixed local/remote graphs.

Distinguish browser/platform restrictions from XML Carousel policy.

## **30.11 Task 18.10 — External-Resolution Acceptance and 0.4.0 Stabilization**

Run end-to-end acceptance across:

### DTD

* external subset
* parameter entities
* grammar-relevant external entities
* chains/cycles/failures/security limits

### XSD

* include
* import
* redefine
* namespaces
* chained/shared dependencies
* cycles/failures

### RELAX NG

* RNG include/externalRef
* RNC equivalents
* chained/shared dependencies
* cycles/failures

### Cross-cutting

* explicit external-fetch opt-in
* replacement/cancellation/stale-result protection
* provenance
* Search/Navigation/Inspector/Problems/source/copy
* semantic zoom
* Chrome/Firefox
* CORS classification
* deterministic diagnostics
* privacy/network reporting
* bounded resource use
* licensing/release documentation

0.4.0 is complete only when permitted, browser-accessible external dependencies can be safely retrieved, validated, incorporated into the project graph, and fully explored without weakening XML Carousel's privacy/security boundaries.

---

# **31\. Approved Release Progression**

```text
0.2.0
DTD + XSD 1.0
complete supported visualization
semantic zoom
developer handoff utilities
verified static release

        ↓

0.3.0
RELAX NG XML syntax
RELAX NG Compact Syntax
libxml2-WASM production RELAX NG engine
Jing/Trang differential evidence
universal cross-format dependency-reference representation
remote references visualized but not retrieved

        ↓

0.4.0
controlled external HTTP/HTTPS schema resolution
DTD external resources
XSD include/import/redefine
RELAX NG include/externalRef
fetched resources become first-class project members
opt-in network access
provenance, caching, cancellation, CORS and security controls
```

Governing architectural principle:

> **XML Carousel owns resource resolution. Standards engines validate resources supplied to them by XML Carousel; they do not independently crawl the filesystem or network.**

Governing presentation principle:

> **A reference is meaningful schema information whether or not its target can be resolved. XML Carousel should always represent the reference truthfully and should represent target contents only when those contents were actually supplied or successfully retrieved under the active project policy.**
