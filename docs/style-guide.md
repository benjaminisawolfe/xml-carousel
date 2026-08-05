# XML Carousel Style Guide

# 1\. Purpose

This style guide defines the visual language, interaction presentation, component styling, motion behaviour, accessibility requirements, and interface terminology for **XML Carousel**.

It is intended to serve as practical implementation guidance. Where possible, it specifies concrete dimensions, tokens, behaviours, and acceptance criteria rather than general aesthetic aspirations.

The style guide applies to:

* The top application bar  
* The left navigation and search panel  
* The central schema carousel  
* Focused and contextual schema cards  
* Connector lines  
* The right inspector panel  
* Search results  
* Documentation and comment displays  
* Source-code displays  
* Loading, warning, and error states  
* Keyboard and reduced-motion modes  
* Responsive layouts

---

# **2\. Understanding of XML Carousel**

XML Carousel is a serverless, browser-based application for visually navigating:

* XML Schema documents and schema sets  
* Document Type Definitions  
* Relationships among elements, types, attributes, particles, declarations, references, and content-model members

It is not intended to display an entire schema as a conventional node-and-edge graph.

Instead, it presents a local, animated view centred on the user’s current location in the schema.

rootward / parents / prior path  ←  current focus  →  leafward / children

The central card represents the current focus.

The right side presents possible leafward destinations, such as:

* Child elements  
* Content-model members  
* Referenced definitions  
* Contained particles  
* Other available branches

The left side presents rootward context from the user’s current navigation path.

The interface therefore shows the user’s **journey through the schema**, rather than attempting to flatten the complete schema graph into one view.

The defining spatial model is:

> Horizontal position communicates depth; vertical position distinguishes among branches.

The visual destination sides do not finalize pointer-drag vectors. A carousel-style swipe may move content opposite the visible destination side, so drag direction must be validated during the gesture prototype.

---

# **3\. Confirmed Major Design Decisions**

The following decisions are treated as non-negotiable unless explicitly revised.

## **3.1 Application architecture**

XML Carousel is:

* Browser-based  
* Serverless  
* Static-deployable  
* Local-first  
* Usable without uploading schemas to a remote service  
* Designed to work without a backend or database server

## **3.2 Primary interface**

The carousel is the primary navigation interface.

The application contains four major regions:

Top bar  
Left navigation and search panel  
Central carousel  
Right inspector panel

The side panels support the carousel. They must not visually overpower it.

## **3.3 Spatial direction**

* Current focus is centred.  
* Rootward context appears to the left.
* Leafward branches appear to the right.
* Horizontal position communicates schema depth.
* Vertical branch-selection mechanics remain provisional until the gesture prototype is tested.
* Pointer drag direction remains provisional until the gesture prototype is tested.

These directions must remain consistent throughout the application.

## **3.4 Journey path rather than complete graph**

The internal schema representation may be a graph.

The visible carousel preserves the path through which the user reached the current node.

A reused XSD type may therefore appear in different journey contexts without implying that it has only one parent.

## **3.5 Card and inspector separation**

The focused card is an orientation device.

It is not a complete documentation display.

The right inspector contains full details.

## **3.6 Separate focus and inspection state**

Carousel focus and inspector target are separate state values.

carouselFocusNodeId  
inspectorNodeId

The inspector may display a node that is not currently centred.

When that occurs, the inspector must provide a visible **Center this node** action.

## **3.7 Card interaction**

Clicking the main body of a card:

* Centres that card  
* Changes carousel focus  
* Does not automatically open the inspector

Clicking a deliberate **Details**, **Inspect**, or information control:

* Opens the inspector for that card  
* Does not centre the card  
* Must not trigger the card body action

## **3.8 Documentation treatment**

XSD annotations are formal metadata.

* `xs:documentation` is human-facing documentation.  
* `xs:appinfo` is machine-facing or tool-specific metadata.  
* Both are preserved.  
* Documentation excerpts may appear on cards.  
* Full documentation and appinfo appear separately in the inspector.  
* Raw XML is escaped and preserved for source view.  
* Annotation XML is never inserted through unsafe `innerHTML`.

DTD comments are informal documentation.

* Attached comments are displayed as nearby DTD comments.  
* They must not be described as formal schema documentation.  
* Unattached comments remain available as schema-level comments.

---

# **4\. Visual Design Principles**

## **4.1 The interface should feel exploratory, not diagrammatic**

XML Carousel should resemble a precise navigational instrument rather than a graph editor.

The visual hierarchy should emphasize:

1. Current location  
2. Immediate destinations  
3. Previous path  
4. Detailed explanation  
5. Global navigation

The interface should not resemble:

* A giant node map  
* A flowchart editor  
* A UML modeller  
* A source-code IDE with a small visualization added  
* A dashboard dominated by metrics

## **4.2 Calm technical clarity**

The application should look sophisticated without becoming decorative.

Use:

* Clear typography  
* Spacious card interiors  
* Restrained colour  
* Fine borders  
* Soft elevation  
* Smooth, purposeful motion  
* Consistent alignment

Avoid:

* Neon-on-black “hacker” styling  
* Heavy gradients  
* Glassmorphism that reduces legibility  
* Excessive shadows  
* Cartoon imagery  
* Large decorative icons  
* Constant motion  
* Colour-coded clutter

## **4.3 Focus through scale and position**

The focused node should be obvious primarily because it is:

* Centred  
* Larger  
* More detailed  
* More opaque  
* More strongly elevated

Colour may reinforce focus, but colour must not be the only focus indicator.

## **4.4 Local context over density**

The interface should show fewer things clearly rather than many things faintly.

When a schema region contains too many nodes:

* Window the visible branch list  
* Show overflow indicators  
* Provide filtering or scrolling  
* Put the full list in the inspector

Do not shrink cards until their text becomes unreadable.

---

# **5\. Design Tokens**

Use CSS custom properties for all shared visual values.

The values below define the initial light theme.

:root {  
  /\* Surfaces \*/  
  \--colour-canvas: \#f4f6f8;  
  \--colour-panel: \#ffffff;  
  \--colour-panel-subtle: \#eef2f5;  
  \--colour-panel-raised: \#ffffff;  
  \--colour-code-surface: \#18212b;

  /\* Text \*/  
  \--colour-text: \#17212b;  
  \--colour-text-secondary: \#52606d;  
  \--colour-text-muted: \#6b7785;  
  \--colour-text-inverse: \#f8fafc;  
  \--colour-code-text: \#e6edf3;

  /\* Borders \*/  
  \--colour-border: \#cbd5df;  
  \--colour-border-subtle: \#dde4ea;  
  \--colour-border-strong: \#8fa0af;

  /\* Primary interaction \*/  
  \--colour-accent: \#2367c9;  
  \--colour-accent-hover: \#1854aa;  
  \--colour-accent-active: \#12458e;  
  \--colour-accent-soft: \#e7f0fc;

  /\* Schema categories \*/  
  \--colour-element: \#2367c9;  
  \--colour-type: \#7656b5;  
  \--colour-attribute: \#287a57;  
  \--colour-particle: \#a15d00;  
  \--colour-reference: \#8a4778;  
  \--colour-metadata: \#607080;

  /\* Status \*/  
  \--colour-info: \#2367c9;  
  \--colour-success: \#26734d;  
  \--colour-warning: \#9a5b00;  
  \--colour-error: \#b3261e;

  \--colour-info-soft: \#e7f0fc;  
  \--colour-success-soft: \#e7f5ed;  
  \--colour-warning-soft: \#fff2d9;  
  \--colour-error-soft: \#fdebea;

  /\* Focus \*/  
  \--colour-focus-ring: \#6b47d6;

  /\* Shape \*/  
  \--radius-small: 4px;  
  \--radius-medium: 8px;  
  \--radius-large: 14px;  
  \--radius-card: 16px;

  /\* Elevation \*/  
  \--shadow-low: 0 1px 3px rgb(23 33 43 / 10%);  
  \--shadow-medium: 0 8px 24px rgb(23 33 43 / 14%);  
  \--shadow-focus: 0 16px 42px rgb(23 33 43 / 20%);

  /\* Spacing \*/  
  \--space-1: 4px;  
  \--space-2: 8px;  
  \--space-3: 12px;  
  \--space-4: 16px;  
  \--space-5: 20px;  
  \--space-6: 24px;  
  \--space-8: 32px;  
  \--space-10: 40px;  
  \--space-12: 48px;

  /\* Motion \*/  
  \--duration-instant: 80ms;  
  \--duration-fast: 140ms;  
  \--duration-standard: 260ms;  
  \--duration-panel: 180ms;  
  \--duration-deliberate: 360ms;

  \--ease-standard: cubic-bezier(0.2, 0.8, 0.2, 1);  
  \--ease-enter: cubic-bezier(0.16, 1, 0.3, 1);  
  \--ease-exit: cubic-bezier(0.4, 0, 1, 1);

  /\* Layout \*/  
  \--top-bar-height: 56px;  
  \--left-panel-width: 320px;  
  \--inspector-width: 420px;  
  \--content-min-width: 480px;  
}

These values should be centralized. Components should not introduce arbitrary, untracked colours or spacing values.

---

# **6\. Typography**

## **6.1 Font stacks**

The application must not require an externally hosted font.

Use a native interface stack:

\--font-ui:  
  Inter,  
  ui-sans-serif,  
  system-ui,  
  \-apple-system,  
  BlinkMacSystemFont,  
  "Segoe UI",  
  sans-serif;

Use a native monospace stack for schema syntax and source:

\--font-code:  
  "Cascadia Code",  
  "SFMono-Regular",  
  Consolas,  
  "Liberation Mono",  
  Menlo,  
  monospace;

## **6.2 Type scale**

\--font-size-xs: 0.75rem;     /\* 12px \*/  
\--font-size-sm: 0.8125rem;   /\* 13px \*/  
\--font-size-base: 0.9375rem; /\* 15px \*/  
\--font-size-md: 1rem;        /\* 16px \*/  
\--font-size-lg: 1.125rem;    /\* 18px \*/  
\--font-size-xl: 1.375rem;    /\* 22px \*/  
\--font-size-2xl: 1.75rem;    /\* 28px \*/

## **6.3 Usage**

### **Application title**

* 18–20px  
* Weight 650 or 700  
* Never all capitals

### **Focused card name**

* 24–28px  
* Weight 700  
* May wrap to two lines  
* Must not truncate unless an accessible full-name tooltip or label is provided

### **Context card name**

* 16–18px  
* Weight 650  
* Maximum two lines

### **Node-kind labels**

* 12–13px  
* Weight 600  
* Slightly increased letter spacing  
* Sentence case, not full uppercase

### **Body text**

* 14–15px  
* Line height 1.45–1.6

### **Schema expressions**

Use monospace for:

* Content models  
* Qualified names  
* Occurrence expressions  
* XPath-like paths  
* Source snippets  
* XML syntax

Do not use monospace for ordinary interface labels.

---

# **7\. Main Layout**

## **7.1 Desktop grid**

At widths of 1280px or greater, use a four-region layout:

┌─────────────────────────────────────────────────────────┐  
│ Top bar                                                 │  
├──────────────┬──────────────────────────┬───────────────┤  
│ Left panel   │ Carousel                 │ Inspector     │  
│              │                          │               │  
└──────────────┴──────────────────────────┴───────────────┘

Recommended dimensions:

* Top bar: 56px high  
* Left panel: 280–360px, default 320px  
* Inspector: 360–480px, default 420px  
* Carousel: receives all remaining width  
* Minimum viable carousel width: 480px

Use CSS Grid for the application shell.

.app-shell {  
  display: grid;  
  grid-template:  
    "topbar topbar topbar" var(--top-bar-height)  
    "left carousel inspector" minmax(0, 1fr)  
    / var(--left-panel-width) minmax(var(--content-min-width), 1fr)  
      var(--inspector-width);  
  min-height: 100dvh;  
}

## **7.2 Panel hierarchy**

The canvas behind the carousel uses `--colour-canvas`.

The side panels use `--colour-panel`.

Panels are separated from the carousel using borders, not large shadows.

.left-panel {  
  border-right: 1px solid var(--colour-border);  
}

.inspector-panel {  
  border-left: 1px solid var(--colour-border);  
}

## **7.3 Carousel space**

The carousel area must have:

* Generous empty space around cards  
* No visible scrollbars during normal navigation  
* A stable centre point  
* Enough padding that focused-card elevation is not clipped  
* A clear distinction from the side panels

The carousel background may include a very subtle static grid or radial tonal shift, but this must remain nearly imperceptible and must not suggest fixed graph coordinates.

---

# **8\. Top Bar**

## **8.1 Purpose**

The top bar contains project-level actions, not node-level details.

It should include:

* Application name  
* Open file or ZIP action  
* Current project or schema-set name  
* Search access  
* View or settings access  
* Help

## **8.2 Styling**

* Height: 56px  
* Background: white or panel colour  
* Bottom border: 1px solid  
* Horizontal padding: 16–20px  
* Controls vertically centred  
* No oversized branding area

## **8.3 Button hierarchy**

Use:

* One primary button for opening a schema when no project is loaded  
* Neutral buttons for ordinary project actions  
* Icon buttons only for universally recognizable actions  
* Text plus icon for important or uncommon actions

Do not hide the main file-opening action behind an unlabeled icon.

---

# **9\. Schema Card System**

## **9.1 Shared card anatomy**

Every schema card should use the same broad anatomy:

┌──────────────────────────────────────┐  
│ Kind indicator           Inspect ⓘ  │  
│                                      │  
│ Display name                         │  
│ Secondary identity or namespace      │  
│                                      │  
│ Primary structural summary           │  
│ Constraints or relationship summary  │  
│                                      │  
│ Metadata indicators                  │  
└──────────────────────────────────────┘

Recommended internal regions:

1. Header  
2. Identity  
3. Structural summary  
4. Metadata or status footer

## **9.2 Focused card**

Recommended default dimensions:

* Width: 360–420px  
* Minimum height: 230px  
* Maximum practical height: 330px

Focused cards should use:

* `--radius-card`  
* `--shadow-focus`  
* Stronger border  
* Full opacity  
* Complete compact summary  
* A permanently visible Inspect control

The focused card should not require hover to expose essential actions.

## **9.3 Context cards**

Recommended dimensions:

* Width: 210–270px  
* Minimum height: 130px  
* Reduced detail  
* Lower elevation  
* Shorter documentation excerpts or no excerpt  
* Inspect control visible on hover, keyboard focus, or touch selection

A context card must still expose its Inspect control without requiring a mouse. On touch devices, the control should always remain visible.

## **9.4 Card background**

Cards should normally use the neutral panel colour.

Node categories should be indicated with a restrained accent treatment, such as:

* A 4px top border  
* A small kind icon  
* A tinted kind badge

Do not fill the entire card with a saturated category colour.

## **9.5 Node-category treatments**

Suggested category mapping:

* Elements: blue  
* Complex and simple types: violet  
* Attributes and attribute groups: green  
* Sequences, choices, and particles: amber  
* References and reused definitions: magenta  
* Imports, includes, and schema metadata: slate

Colour must be accompanied by a text label or icon.

## **9.6 Name handling**

Qualified names should preserve their prefixes.

Examples:

hf:identity  
xs:string  
book.content

When the prefix is not the most important part, it may be visually de-emphasized without being removed.

Long names may wrap. Avoid middle truncation because it can obscure meaningful suffixes.

## **9.7 Card details control**

Preferred visible label:

Inspect

An information icon may accompany the label.

For narrow context cards, an icon-only control is acceptable only when:

* It has an accessible name  
* It has a tooltip  
* Its meaning is consistent throughout the application

Implementation behaviour:

function handleCardActivation(nodeId: string) {  
  navigation.focusNode(nodeId);  
}

function handleInspectActivation(  
  event: MouseEvent | KeyboardEvent,  
  nodeId: string  
) {  
  event.stopPropagation();  
  inspector.open(nodeId);  
}

The Inspect control must not be nested in a way that creates invalid interactive HTML, such as a button inside another button.

Use a non-button card container with separate internal buttons, or use distinct interactive regions.

---

# **10\. Focused Card Content**

The focused card should answer:

1. What is this?  
2. What kind of schema construct is it?  
3. What does it contain?  
4. What constrains it?  
5. Where can the user go next?

## **10.1 Required information**

Display when applicable:

* Display name  
* Node kind  
* Namespace or prefix  
* Type, reference, or base type  
* Cardinality  
* Compact content model  
* Child count  
* Attribute count  
* Documentation or comment presence  
* Used-by count  
* Current parent-path hint  
* Short documentation or comment excerpt

## **10.2 Information priority**

Highest priority:

* Name  
* Kind  
* Main type or content model  
* Immediate branches

Medium priority:

* Occurrence  
* Attributes  
* Used-by count  
* Namespace

Lower priority:

* Source file  
* Source line  
* Extended relationships  
* Full documentation  
* Raw source

Lower-priority information belongs in the inspector.

## **10.3 Empty values**

Do not display rows such as:

Documentation: none  
Attributes: 0  
Used by: 0

unless the absence itself is important.

Prefer omission over repetitive empty-state labels.

---

# **11\. Carousel Depth, Scaling, and Placement**

## **11.1 Stable focus position**

The focused card must remain at a stable visual centre.

Navigation should animate surrounding cards through the centre rather than allowing the whole interface to drift unpredictably.

## **11.2 Rootward path**

Show no more than three fully rendered rootward cards.

Suggested scale and opacity:

| Rootward depth | Scale | Opacity |
| ----- | ----- | ----- |
| Current focus | 1.00 | 1.00 |
| One step left | 0.84 | 0.88 |
| Two steps left | 0.70 | 0.70 |
| Three steps left | 0.58 | 0.48 |

Earlier path nodes may collapse into a compact indicator such as:

\+4 earlier

Text inside receding cards must not be scaled below a legible rendered size. Components may switch to a simpler compact card rather than continuously shrinking full content.

## **11.3 Leafward branch fan**

Place the leafward branch fan to the right of the focused card.

Show at most seven branch cards:

* Selected or nearest branch  
* Three branches above  
* Three branches below

Additional branches appear as:

\+12 above  
\+8 below

The central candidate branch may be:

* Slightly larger  
* More opaque  
* More strongly bordered

During a drag, the currently previewed destination receives the strongest treatment.

## **11.4 Vertical spacing**

Branch cards should overlap neither each other nor connector labels.

Recommended vertical gap:

* 12–20px between context cards  
* Increased to at least 24px where cards contain two-line names

## **11.5 Depth cues**

Use a combination of:

* Scale  
* Opacity  
* Elevation  
* Detail reduction  
* Position

Do not add blur to receding cards. Blur makes labels inaccessible and creates unnecessary rendering cost.

---

# **12\. Animation and Motion**

## **12.1 Motion purpose**

Motion should communicate:

* Which node became focused  
* Which direction the user travelled  
* Which branch is being previewed  
* Whether the inspector opened or changed target  
* Whether a panel appeared or disappeared

Motion should never exist merely to make the interface look active.

## **12.2 Focus transition**

Recommended duration:

260ms

Recommended easing:

cubic-bezier(0.2, 0.8, 0.2, 1\)

During leafward navigation:

* Destination branch moves toward the centre  
* Previous focus moves leftward into the path
* Other branches reposition around the new focus

During rootward navigation:

* Previous path card moves into the centre  
* Former focus moves rightward into available branch context where applicable

The animation should preserve spatial continuity.

## **12.3 Drag behaviour**

Rootward destinations remain visually left and leafward destinations remain visually right. The corresponding physical drag vectors are intentionally not prescribed here. Test whether content should track the pointer or move carousel-style in the opposite direction during the drag-gesture prototype, then document the validated mapping.

While dragging:

* Movement follows the pointer directly  
* No transition easing is applied to the directly manipulated layer  
* The nearest branch target is highlighted  
* A subtle threshold indicator may appear  
* Navigation is not committed until release

When the user releases below threshold:

* Cards return to their resting positions  
* Return duration should be approximately 140–180ms

## **12.4 Branch preview**

Branch preview changes should use approximately:

120–140ms

Avoid dramatic scaling. A change from 0.76 to 0.82 is sufficient.

## **12.5 Inspector motion**

Inspector opening or closing:

* 180–220ms  
* Small horizontal translation plus opacity  
* No bounce

Changing the inspected node while the panel is already open should generally update content without replaying the full panel-opening animation.

## **12.6 No spring overshoot by default**

Do not use elastic or bouncing motion for normal schema navigation.

The application should feel controlled and precise.

---

# **13\. Reduced-Motion Mode**

Respect:

@media (prefers-reduced-motion: reduce)

Also provide an application setting when practical.

In reduced-motion mode:

* Disable card travel animations  
* Disable scaling animations  
* Disable parallax-like effects  
* Use an immediate layout change or a short crossfade  
* Keep durations at 0–80ms  
* Preserve destination highlighting  
* Preserve drag threshold feedback without animating the whole carousel

Example:

@media (prefers-reduced-motion: reduce) {  
  \*,  
  \*::before,  
  \*::after {  
    scroll-behavior: auto \!important;  
  }

  .carousel-card,  
  .inspector-panel,  
  .connector-layer {  
    transition-duration: 60ms \!important;  
    animation: none \!important;  
  }  
}

Reduced motion must preserve comprehensibility. It should not simply remove all state-change feedback.

---

# **14\. Connector Lines**

## **14.1 Role**

Connector lines clarify immediate relationships.

They are not intended to display every edge in the schema graph.

Only render connectors among visible carousel cards.

## **14.2 Placement**

Use an SVG layer behind the cards.

Cards  
Connector SVG  
Carousel background

The connector layer must not intercept pointer events.

.connector-layer {  
  pointer-events: none;  
}

## **14.3 Styling**

Default connector:

* 1.5px  
* Neutral slate  
* Moderate opacity  
* Smooth curve

Active or previewed connector:

* 2.5px  
* Accent colour  
* Full opacity

Optional edge distinctions:

* Solid: containment or current journey path  
* Dashed: reference or reuse relationship  
* Dotted: secondary informational relationship

Do not encode more than three line styles in the carousel.

More detailed edge kinds belong in the inspector.

## **14.4 Labels**

Connector labels should be rare.

Use them only when the relationship would otherwise be ambiguous, such as:

type  
ref  
extends  
restricts

Labels should:

* Use 12px text  
* Have a small opaque background  
* Remain horizontal  
* Avoid crossing card boundaries

## **14.5 Crossing avoidance**

Because only local context is displayed, connectors should ordinarily not cross.

When a layout would cause excessive crossings:

* Reduce the visible relationship set  
* Reorder branches  
* Move secondary relationships to the inspector

Do not introduce a general-purpose graph-routing engine merely to preserve every edge.

---

# **15\. Icons and Controls**

## **15.1 Icon style**

Use one consistent icon family.

Preferred characteristics:

* Simple line icons  
* Approximately 1.75–2px stroke  
* Rounded joins  
* No filled multicolour illustrations

## **15.2 Node-kind icons**

Icons may reinforce node kinds, but every node must also include a text label.

Suggested concepts:

* Element: angle brackets or outlined node  
* Type: structured block or braces  
* Attribute: tag or key-value marker  
* Sequence: ordered horizontal marks  
* Choice: branching fork  
* Documentation: book or document  
* DTD comment: speech bubble  
* Reference: link  
* Inspect: information circle  
* Source: code brackets

## **15.3 Control sizing**

Minimum target size:

44 × 44 CSS pixels

Compact desktop controls may appear visually smaller while retaining a 44px interactive target through padding.

## **15.4 Button states**

Every button must provide:

* Default state  
* Hover state  
* Active state  
* Keyboard-focus state  
* Disabled state  
* Busy state where applicable

Disabled controls should remain legible and should include an explanation when the reason is not obvious.

## **15.5 Focus rings**

Use a high-contrast focus ring.

:focus-visible {  
  outline: 3px solid var(--colour-focus-ring);  
  outline-offset: 2px;  
}

Do not remove outlines without replacing them.

---

# **16\. Right Inspector Panel**

## **16.1 Purpose**

The inspector explains the selected node in depth.

It should not behave like a second carousel.

## **16.2 Header**

The inspector header should remain visible while its content scrolls.

Include:

* Node name  
* Node kind  
* Close control  
* Source-file identity where useful  
* **Center this node** when the inspected node is not focused

Recommended hierarchy:

Node name  
Kind · source file

\[Center this node\] \[Close\]

## **16.3 Sections**

Recommended inspector sections:

1. Overview  
2. Structure  
3. Attributes  
4. Constraints  
5. Relationships  
6. Documentation  
7. AppInfo  
8. DTD comments  
9. Source

Only show sections relevant to the node.

## **16.4 Section styling**

Use:

* Clear section headings  
* Thin separators or bounded section cards  
* 16–20px vertical spacing  
* Definition-list layouts for short properties  
* Tables only for genuinely tabular information

Avoid turning every property into an isolated boxed tile.

## **16.5 Long lists**

Child, attribute, enumeration, and used-by lists should support:

* Filtering  
* Stable row alignment  
* Keyboard navigation  
* Clear node-kind labels  
* Inspect and centre actions

Rows should be top-aligned when text wraps.

## **16.6 Inspector scroll**

The inspector scrolls independently of the carousel.

Opening a different node should reset the inspector to the top unless the change occurred through an in-panel relationship that benefits from preserving context.

---

# **17\. Left Navigation and Search Panel**

## **17.1 Purpose**

The left panel provides global entry points and recovery tools.

It may contain:

* Root or global elements  
* Named complex types  
* Named simple types  
* DTD elements  
* Schema files  
* Recent paths  
* Search results

It should not attempt to reproduce every relationship in the schema.

## **17.2 Section styling**

Use collapsible sections with:

* Clear headings  
* Item counts where useful  
* Stable indentation  
* Visible expand/collapse controls  
* No more than three indentation levels in the main outline

Deep structural navigation belongs in the carousel and inspector.

## **17.3 Navigation rows**

Each row should include:

* Name  
* Node-kind icon  
* Optional source file  
* Optional match context  
* Inspect control where space permits

Clicking the row name centres the node.

Opening the inspector must remain a separate action.

## **17.4 Current-state indicators**

The left panel should distinguish:

* Current carousel focus  
* Current inspector target  
* Search-result selection

These must not all use the same styling.

Recommended treatment:

* Carousel focus: accent left border plus soft accent background  
* Inspector target: information icon or thin secondary outline  
* Keyboard selection: focus ring

---

# **18\. Search Result Styling**

## **18.1 Grouping**

Group results by meaningful categories, such as:

* Elements  
* Types  
* Attributes  
* DTD declarations  
* Documentation and comments  
* Source files

Do not group merely by the order in which results were found.

## **18.2 Result anatomy**

Each result should show:

Name  
Node kind · source file  
Matched text or structural context

Example:

hf:identity  
element · foundry.xsd  
Documentation: “Defines the persistent identity…”

## **18.3 Match highlighting**

Highlight matching text with:

* Stronger font weight  
* Soft background tint

Do not rely on colour alone.

Avoid bright yellow marker styling across large text blocks.

## **18.4 Actions**

A result should support two distinct actions:

* Select the result body to centre the node  
* Use Inspect to open its inspector without centring

## **18.5 Search empty states**

Use specific language.

Preferred:

No nodes matched “identityType”.  
Try a shorter name, a namespace prefix, or documentation text.

Avoid:

Nothing found.

---

# **19\. Source-Code Display**

## **19.1 Purpose**

Source view builds trust by connecting normalized visual information to the original declaration.

## **19.2 Styling**

Use:

* Monospace font  
* 13–14px text  
* Line height 1.55  
* Escaped source  
* Horizontal scrolling by default  
* Optional wrapping  
* Visible line numbers when available

Recommended dark source surface:

.source-view {  
  background: var(--colour-code-surface);  
  color: var(--colour-code-text);  
  border-radius: var(--radius-medium);  
  font-family: var(--font-code);  
  font-size: 0.8125rem;  
  line-height: 1.55;  
}

A dark source block is acceptable inside the otherwise light interface because it clearly distinguishes literal source from descriptive interface content.

## **19.3 Controls**

Provide:

* Copy source  
* Wrap lines toggle  
* Open source context where available

Copy confirmation should be brief and nonmodal.

## **19.4 Safety**

Source must be displayed as text.

Never insert source XML or DTD declarations through unsafe HTML rendering.

---

# **20\. XSD Documentation Display**

## **20.1 Card excerpts**

Cards may show a short documentation excerpt when available.

Rules:

* Maximum two or three lines  
* Plain text  
* Preserve meaningful whitespace only where necessary  
* Add an ellipsis when truncated  
* Do not render arbitrary embedded markup

Use a documentation icon and a label such as:

Documentation

## **20.2 Inspector documentation**

Full documentation appears in a dedicated section.

Display:

* Language, when `xml:lang` exists  
* Source URI or identifier, when `source` exists  
* Plain-text content  
* Multiple documentation blocks in source order

Example:

Documentation  
Language: en

Defines the persistent identity shared by all foundry entities.

## **20.3 Multiple languages**

When several languages are present:

* Prefer the current application language when a match exists  
* Provide a language selector  
* Preserve all variants  
* Do not silently discard nonselected languages

## **20.4 AppInfo**

AppInfo must appear separately from documentation.

Use a more technical treatment:

* Metadata icon  
* Neutral or violet-tinted section  
* Monospace where the data is structured  
* Raw XML view as an explicit secondary disclosure

Label it:

AppInfo

Do not describe appinfo as ordinary documentation.

---

# **21\. DTD Comment Display**

## **21.1 Distinction from XSD documentation**

DTD comments must be visually recognizable as informal nearby commentary.

Preferred label:

DTD comment

or:

Nearby DTD comment

Do not label a DTD comment simply as “Documentation” without qualification.

## **21.2 Card treatment**

Attached DTD comment excerpts may use:

* Speech-bubble icon  
* Neutral or warm-grey tint  
* Slightly dashed left border  
* Maximum two or three lines

## **21.3 Inspector treatment**

Display:

* Comment text  
* Attachment kind  
* Source location when available  
* Whether it precedes or trails the declaration

Example:

Nearby DTD comment  
Immediately precedes this declaration

Front matter includes the title page and optional preface.

## **21.4 Schema-level comments**

Unattached comments belong in a schema-level comments section.

They should not be presented as though they definitively describe the nearest declaration.

---

# **22\. Status and Feedback States**

## **22.1 General rules**

Every state must combine:

* Icon  
* Short heading  
* Explanatory text  
* Colour  
* Relevant action

Colour alone is insufficient.

## **22.2 Information**

Use for:

* Parsing progress  
* Optional capabilities  
* Nonfatal notices  
* Successful reference resolution summaries

Style:

* Blue icon or border  
* Soft blue background

## **22.3 Success**

Use sparingly.

Examples:

* Schema loaded  
* Source copied  
* Local project restored

Do not leave permanent large success banners after ordinary operations.

## **22.4 Warning**

Use for:

* Unresolved references  
* Unsupported declarations  
* Partial parsing  
* Ambiguous DTD comment attachment  
* Large branch sets being windowed

Warnings must explain whether navigation remains safe.

Example:

Three references could not be resolved.  
The schema remains available, but those destinations cannot be opened.

## **22.5 Error**

Use for:

* Invalid input  
* Corrupt ZIP files  
* Parsing failure  
* Unsupported encoding that prevents reading  
* Internal state failure

An error must say:

1. What failed  
2. What remains available  
3. What the user can do next

Avoid exposing raw stack traces in the main interface.

Technical details may appear in an expandable disclosure.

## **22.6 Inline state placement**

Place a state near the component or file it affects.

Do not use global banners for a problem confined to one node or reference.

---

# **23\. Loading and Parsing States**

## **23.1 Initial loading**

When opening a schema:

* Keep the top bar and shell visible  
* Show a centred progress region  
* Display the current stage where known  
* Allow cancellation when practical

Possible stages:

Reading files  
Parsing declarations  
Resolving references  
Building navigation index  
Preparing search

## **23.2 Skeletons**

Use skeleton placeholders only when the approximate final layout is already known.

Do not animate large shimmering surfaces across the carousel.

A restrained opacity pulse is sufficient.

## **23.3 Background work**

When parsing continues in a Web Worker:

* Keep the interface responsive  
* Show progress without blocking unrelated controls  
* Prevent navigation into incomplete nodes  
* Clearly mark partial results

---

# **24\. Accessibility**

## **24.1 Standard**

Target WCAG 2.2 AA.

## **24.2 No gesture-only actions**

Every drag operation must have an equivalent through:

* Click or tap  
* Keyboard  
* Accessible controls

## **24.3 Keyboard model**

Recommended behaviour:

* Left Arrow: move rootward
* Right Arrow: move leafward or enter branch selection
* Up and Down Arrows: change selected sibling branch  
* Enter: centre the selected card  
* `I` or `D`: inspect the selected card  
* Escape: cancel drag, close transient UI, or exit branch-selection mode

Keyboard instructions must be discoverable in help and accessible descriptions.

## **24.4 Semantic structure**

Use:

* Landmarks for top bar, navigation, main carousel, and inspector  
* Headings in logical order  
* Buttons for actions  
* Lists for node collections  
* Definition lists for property/value groups  
* Tables only for tabular data

Do not use clickable `div` elements without full keyboard semantics.

## **24.5 Carousel announcements**

When focus changes, announce the new focus through a restrained live region.

Example:

Focused: hf:identity, element. Five children, one attribute.

Do not announce every animation frame or pointer preview.

## **24.6 Contrast**

Text and essential controls must meet AA contrast requirements.

Muted text may not become so light that it fails contrast merely because it is secondary.

## **24.7 Zoom**

The application must remain usable at 200% browser zoom.

Side panels should collapse or overlay rather than forcing the carousel into an unusably narrow column.

## **24.8 Touch**

All important actions must work without hover.

Inspect controls must be visible or readily discoverable on touch devices.

---

# **25\. Responsive Layout**

## **25.1 Wide desktop: 1280px and above**

Show:

* Left panel  
* Carousel  
* Inspector when open

Panels may be resizable within defined limits.

## **25.2 Compact desktop and tablet: 900–1279px**

The carousel remains primary.

Recommended behaviour:

* Left panel collapses into a drawer  
* Inspector overlays the right side or uses a narrower fixed width  
* Only one side panel may be open at a time when space is limited

## **25.3 Small tablet and mobile: below 900px**

Use:

* Full-width carousel  
* Left navigation as a modal drawer  
* Inspector as a bottom sheet or full-screen detail view  
* Persistent top-bar controls for opening both

The inspector must still be a deliberate action.

## **25.4 Narrow mobile: below 600px**

Adjust:

* Focused card width to available viewport minus 32px  
* Context cards to compact summaries  
* Branch fan to fewer visible siblings  
* Connector complexity downward  
* Side-by-side inspector actions into stacked controls

Do not merely scale the entire desktop interface down.

## **25.5 Mobile gestures**

Horizontal page scrolling must not compete with carousel dragging.

Use pointer capture and `touch-action` carefully.

The gesture region should allow vertical page or panel scrolling where expected while preserving intentional carousel navigation.

---

# **26\. Language and Tone**

## **26.1 General tone**

Interface language should be:

* Precise  
* Calm  
* Direct  
* Technically accurate  
* Understandable without being patronizing

Avoid:

* Cute error messages  
* Excessive metaphor  
* Unexplained abbreviations  
* Jokes during errors  
* Vague commands such as “Go”  
* Anthropomorphizing the schema

The name **XML Carousel** provides enough metaphor. Labels should usually describe actual operations.

## **26.2 Preferred labels**

Use:

Open schema  
Open XSD  
Open DTD  
Open ZIP  
Inspect  
Center this node  
Children  
Attributes  
Used by  
References  
Documentation  
AppInfo  
DTD comments  
Source  
Copy source  
Reset view  
Recent paths  
Unresolved references

Avoid:

Dive in  
Warp  
Travel here  
Take me there  
Magic link  
Mystery node  
Oops\!

## **26.3 Rootward and leafward terminology**

“Rootward” and “leafward” are useful conceptual terms but may be unfamiliar.

In ordinary interface help, pair them with plain descriptions:

Move rootward to the previous node in your path.  
Move leafward to one of this node’s children or referenced structures.

Do not require users to understand the terms before using the application.

## **26.4 Error language**

Use specific, recoverable language.

Preferred:

This XSD could not be parsed because the closing tag for xs:sequence is missing near line 142\.

Avoid:

Invalid file.

## **26.5 Help text**

Explain actions in terms of results.

Preferred before drag-direction testing is complete:

Choose a child to move deeper into the schema. During the gesture prototype, test how horizontal drag direction and vertical branch choice should work together.

Avoid:

Use two-dimensional vector input to select an adjacent schema node.

---

# **27\. Component-State Requirements**

Each interactive component should be implemented and tested in the following states where applicable:

* Default  
* Hover  
* Keyboard focus  
* Active or pressed  
* Selected  
* Inspected  
* Drag preview  
* Disabled  
* Loading  
* Error  
* Reduced motion  
* Narrow layout  
* High zoom

Carousel focus and inspector state must remain visually distinguishable.

---

# **28\. Initial Implementation Priorities**

The first prototype should establish the style system before attempting complete visual polish.

Implement first:

1. Global tokens  
2. Application shell  
3. Focused card  
4. Context card  
5. Node-kind badges  
6. Separate card and Inspect interactions  
7. Inspector header and sections  
8. Basic connector styling  
9. Carousel depth scaling  
10. Keyboard focus states  
11. Reduced-motion behaviour  
12. Responsive panel collapse

Defer:

* Complete dark theme  
* Elaborate connector labels  
* User-configurable category colours  
* Custom icon illustration  
* Dense visualizations  
* Advanced theme editor  
* Decorative motion

---

# **29\. Codex Implementation Rules**

Codex should follow these rules when implementing the interface.

## **29.1 Token discipline**

* Use CSS custom properties.  
* Do not hard-code repeated colours or dimensions in components.  
* Add new shared values to the token layer.  
* Keep component-specific values local only when they are genuinely unique.

## **29.2 Component separation**

Maintain distinct components for:

* Focus card  
* Context card  
* Branch fan  
* Connector layer  
* Left navigation row  
* Search result  
* Inspector section  
* Documentation block  
* DTD comment block  
* Source view  
* Status message

Do not create one giant card component with large amounts of node-kind branching unless shared structure clearly outweighs the complexity.

## **29.3 State separation**

Do not infer inspector state from carousel focus.

Do not automatically update `inspectorNodeId` whenever `carouselFocusNodeId` changes unless the user has enabled an explicit future preference that requests that behaviour.

## **29.4 Safe markup**

* Escape source XML and DTD text.  
* Do not use unsafe `innerHTML` for documentation, appinfo, source, or comments.  
* Use safe parsed representations where formatted content is eventually supported.

## **29.5 Motion performance**

Animate transform and opacity where possible.

Avoid repeatedly animating:

* Width  
* Height  
* Top  
* Left  
* Large box shadows  
* Complex SVG path recalculation on every frame

During dragging, use `requestAnimationFrame` where necessary to prevent excessive updates.

## **29.6 Testing**

Add tests for:

* Card body centres node  
* Inspect control does not centre node  
* Inspector can target a nonfocused node  
* Center this node changes carousel focus  
* Reduced-motion mode suppresses travel animation  
* Keyboard navigation mirrors gesture navigation  
* Hidden branch counts are accurate  
* Focus and inspected styles remain distinct  
* Source and annotation content are escaped

---

# **30\. Visual Acceptance Checklist**

A spiral involving user-interface work should not be considered complete until the following questions can be answered affirmatively.

## **Layout**

* Is the carousel unquestionably the primary region?  
* Can the focused card breathe without touching panel edges?  
* Do side panels remain useful without dominating the screen?  
* Does the application remain usable at 200% zoom?

## **Cards**

* Is the focused card immediately recognizable?  
* Are context cards readable?  
* Can long names wrap safely?  
* Is Inspect visibly separate from card centring?  
* Are node kinds identifiable without relying only on colour?

## **Navigation**

* Is rootward context consistently on the left?
* Are leafward branches consistently on the right?
* Does movement preserve spatial continuity?  
* Are excessive branches windowed rather than crushed together?

## **Inspector**

* Can it display a nonfocused node clearly?  
* Is Center this node shown when appropriate?  
* Are documentation, appinfo, comments, and source clearly separated?  
* Do long lists scroll or filter safely?

## **Motion**

* Does motion explain navigation?  
* Are drag previews immediate?  
* Are there no decorative bounce effects?  
* Does reduced-motion mode remain clear?

## **Accessibility**

* Can all actions be completed by keyboard?  
* Are focus rings visible?  
* Are touch targets sufficiently large?  
* Are focus changes announced appropriately?  
* Is no essential meaning conveyed by colour alone?

## **Language**

* Are labels direct and consistent?  
* Are errors specific and recoverable?  
* Is formal XSD documentation distinguished from informal DTD comments?  
* Are unfamiliar directional terms explained in plain language?

---

# **31\. Overall Visual Direction**

XML Carousel should feel like a carefully designed schema-navigation instrument:

* More spatial than a documentation browser  
* More focused than a graph viewer  
* More approachable than an XML IDE  
* More technically trustworthy than a decorative visualization

Its strongest visual moment should be the focused schema card surrounded by a legible set of possible paths.

Everything else should support that moment.
