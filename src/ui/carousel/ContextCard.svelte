<script lang="ts">
  import type { SchemaEdgeKind, SchemaNode } from '../../schema/model';
  import { formatOutgoingRelationshipLabel } from '../presentation/schemaRelationshipPresentation';
  import type { ContextCardStructureSummary } from './contextCardSummary';
  import { formatSchemaNodeKind } from './nodePresentation';
  import NodeKindBadge from './NodeKindBadge.svelte';
  import type { ImplementedSemanticZoomPresentation } from './semanticZoomPresentation';

  export let node: SchemaNode;
  export let displayName = node.name;
  export let occurrence = '';
  export let direction: 'rootward' | 'leafward';
  export let contextLabel: string | undefined = undefined;
  export let relationshipId: string | undefined = undefined;
  export let relationshipKind: SchemaEdgeKind | undefined = undefined;
  export let relationshipLabel: string | undefined = undefined;
  export let relationshipDisposition: 'advance' | 'terminalCycleClosure' =
    'advance';
  export let terminalLabel: string | undefined = undefined;
  export let focusedNodeKind: SchemaNode['kind'] | undefined = undefined;
  export let onActivate: () => void;
  export let isInspected: boolean;
  export let onToggleInspection: (nodeId: string) => void;
  export let visibleOrder: number | undefined = undefined;
  export let isGesturePreview = false;
  export let isKeyboardSelected = false;
  export let motionKey: string;
  export let showKind: boolean;
  export let structureSummary: ContextCardStructureSummary | undefined =
    undefined;
  export let presentation: ImplementedSemanticZoomPresentation = 'full';
  export let journeyPosition: number | undefined = undefined;

  $: isDtdContainment =
    direction === 'leafward' &&
    relationshipKind === 'contains' &&
    node.kind === 'dtdElement';
  $: directionLabel =
    contextLabel ??
    (direction === 'rootward'
      ? 'Previous step'
      : (relationshipLabel ??
        (isDtdContainment
          ? 'Destination'
          : formatOutgoingRelationshipLabel(
              relationshipKind ?? 'contains',
              focusedNodeKind,
              node.kind,
            ))));
  $: semanticName = `${displayName}${occurrence}`;
  $: visibleName = presentation === 'overview' ? displayName : semanticName;
  $: accessibleName =
    direction === 'rootward'
      ? `Navigate rootward to ${semanticName}, ${formatSchemaNodeKind(node.kind)}`
      : isDtdContainment
        ? `Navigate leafward to ${semanticName}, ${formatSchemaNodeKind(node.kind)}`
        : `Navigate leafward through ${directionLabel} to ${semanticName}, ${formatSchemaNodeKind(node.kind)}`;
</script>

<article
  class:rootward={direction === 'rootward'}
  class:leafward={direction === 'leafward'}
  class:gesture-preview={isGesturePreview}
  class:keyboard-selected={isKeyboardSelected}
  class:inspected={isInspected}
  class:terminal-cycle-closure={relationshipDisposition ===
    'terminalCycleClosure'}
  class:compact={presentation === 'compact'}
  class:overview={presentation === 'overview'}
  class="context-card"
  aria-label={`${directionLabel} ${semanticName}`}
  data-carousel-gesture-origin
  data-carousel-leafward-candidate-id={direction === 'leafward'
    ? node.id
    : undefined}
  data-carousel-leafward-candidate-edge-id={direction === 'leafward'
    ? relationshipId
    : undefined}
  data-carousel-visible-order={direction === 'leafward'
    ? visibleOrder
    : undefined}
  data-gesture-preview={isGesturePreview ? 'true' : undefined}
  data-keyboard-selected={isKeyboardSelected ? 'true' : undefined}
  data-carousel-motion-key={motionKey}
  data-semantic-zoom-leafward-edge-id={direction === 'leafward'
    ? relationshipId
    : undefined}
  data-semantic-zoom-rootward-position={direction === 'rootward'
    ? journeyPosition
    : undefined}
  data-semantic-zoom-line-role={direction}
  data-semantic-zoom-line-node-id={node.id}
  data-journey-position={journeyPosition}
  data-relationship-disposition={relationshipDisposition}
>
  {#snippet cardBody()}
    {#if presentation === 'full'}
      <span class="context-direction">{directionLabel}</span>
    {/if}
    <span class="node-name" title={visibleName}>{visibleName}</span>
    {#if presentation === 'compact' && relationshipDisposition === 'terminalCycleClosure'}
      <span
        class="recursive-marker"
        title={terminalLabel ?? 'Already present in this path'}
        aria-hidden="true">↺</span
      >
    {:else if presentation !== 'overview' && terminalLabel}
      <span class="terminal-label">{terminalLabel}</span>
    {/if}
    {#if presentation === 'full' && showKind}
      <NodeKindBadge kind={node.kind} />
    {/if}
  {/snippet}

  {#if relationshipDisposition === 'terminalCycleClosure'}
    <div
      class="context-body"
      aria-label={`${directionLabel} ${semanticName}. ${terminalLabel ?? 'Already present in this path'}`}
      title={terminalLabel ?? 'Already present in this path'}
      data-carousel-terminal-cycle-closure
    >
      {@render cardBody()}
    </div>
  {:else}
    <button
      type="button"
      aria-label={accessibleName}
      data-carousel-navigation-action
      onclick={onActivate}
    >
      {@render cardBody()}
    </button>
  {/if}

  {#if presentation === 'full' && structureSummary}
    <div
      class="context-structure"
      aria-label={`Structure summary for ${displayName}`}
      data-context-card-structure-summary
    >
      <span>{structureSummary.visibleText}</span>
      {#if structureSummary.hiddenDestinationCount > 0}
        <span
          class="context-structure-overflow"
          aria-label={`${structureSummary.hiddenDestinationCount} additional destinations`}
          data-context-card-destination-overflow
        >
          +{structureSummary.hiddenDestinationCount} more
        </span>
      {/if}
    </div>
  {/if}

  {#if presentation !== 'overview'}
    <div class="card-actions">
      <button
        class:close-inspection={isInspected}
        class="inspect-action"
        type="button"
        aria-label={isInspected
          ? `Close inspection for ${displayName}`
          : `Inspect ${displayName}`}
        aria-pressed={isInspected}
        data-inspect-node-id={node.id}
        data-carousel-gesture-ignore
        onclick={() => onToggleInspection(node.id)}
      >
        {isInspected ? 'Close Inspection' : 'Inspect'}
      </button>
    </div>
  {/if}
</article>

<style>
  .context-card {
    min-width: var(--context-card-compact-min-width);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-large);
    background: var(--colour-panel-raised);
    box-shadow: var(--shadow-low);
    overflow: hidden;
    transform: scale(1);
    transition:
      border-color var(--duration-gesture-preview) var(--ease-standard),
      box-shadow var(--duration-gesture-preview) var(--ease-standard),
      opacity var(--duration-gesture-preview) var(--ease-standard),
      transform var(--duration-gesture-preview) var(--ease-standard);
  }

  .context-card.gesture-preview {
    z-index: 2;
    border-color: var(--colour-gesture-preview);
    box-shadow: var(--shadow-gesture-preview);
    outline: 3px solid var(--colour-gesture-preview);
    outline-offset: 2px;
    transform: scale(var(--gesture-preview-scale));
  }

  .context-card.rootward {
    border-left: 3px solid var(--colour-metadata);
  }

  .context-card.leafward {
    border-right: 3px solid var(--colour-element);
  }

  .context-card.terminal-cycle-closure {
    border-right-color: var(--colour-metadata);
  }

  .context-card.keyboard-selected {
    z-index: 2;
    border-color: var(--colour-keyboard-selection);
    background: var(--colour-keyboard-selection-soft);
    box-shadow: var(--shadow-keyboard-selection);
  }

  .context-card.compact > button,
  .context-card.compact .context-body {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
  }

  .context-card.compact .node-name {
    font-size: var(--font-size-sm);
    line-height: 1.25;
  }

  .context-card.compact .card-actions {
    padding: var(--space-1);
  }

  .context-card.overview > button,
  .context-card.overview .context-body {
    align-items: center;
    padding: var(--space-1) var(--space-2);
  }

  .context-card.overview .node-name {
    font-size: var(--font-size-sm);
    line-height: 1.2;
  }

  .context-card > button,
  .context-body {
    display: grid;
    width: 100%;
    min-width: var(--control-min-size);
    min-height: var(--control-min-size);
    gap: var(--space-1);
    padding: var(--space-3);
    border: 0;
    background: transparent;
    color: var(--colour-text-secondary);
    cursor: pointer;
    text-align: left;
    transition:
      background-color var(--duration-instant) var(--ease-standard),
      color var(--duration-instant) var(--ease-standard);
  }

  .context-body {
    cursor: default;
  }

  .context-card > button:hover {
    background: var(--colour-accent-soft);
    color: var(--colour-text);
  }

  .context-card button:focus-visible {
    position: relative;
    z-index: 3;
    outline-offset: -3px;
  }

  .context-direction {
    color: var(--colour-text-muted);
    font-size: var(--font-size-xs);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .terminal-label {
    color: var(--colour-text-muted);
    font-size: var(--font-size-xs);
    font-weight: 600;
  }

  .recursive-marker {
    color: var(--colour-metadata);
    font-size: var(--font-size-lg);
    font-weight: 700;
    line-height: 1;
  }

  .node-name {
    min-width: 0;
    overflow-wrap: anywhere;
    color: var(--colour-text);
    font-size: var(--font-size-md);
    font-weight: 700;
  }

  :global(.context-card .kind-badge) {
    justify-self: start;
    min-height: 22px;
    padding-inline: var(--space-2);
    font-size: var(--font-size-xs);
  }

  .context-structure {
    display: grid;
    gap: var(--space-1);
    padding: 0 var(--space-3) var(--space-3);
    overflow-wrap: anywhere;
    color: var(--colour-text-secondary);
    font-family: var(--font-code);
    font-size: var(--font-size-xs);
  }

  .context-structure-overflow {
    color: var(--colour-text-muted);
    font-family: var(--font-ui);
    font-weight: 700;
  }

  .card-actions {
    display: flex;
    min-height: var(--control-min-size);
    align-items: center;
    padding: var(--space-1);
    border-top: 1px solid var(--colour-border-subtle);
    background: var(--colour-panel-subtle);
  }

  .inspect-action {
    width: 100%;
    min-height: var(--control-min-size);
    padding: 0 var(--space-2);
    border: 1px solid var(--colour-accent);
    border-radius: var(--radius-medium);
    background: var(--colour-accent);
    color: var(--colour-text-inverse);
    font-size: var(--font-size-xs);
    font-weight: 700;
    line-height: 1.2;
    cursor: pointer;
  }

  .inspect-action:hover {
    background: var(--colour-accent-hover);
  }

  .inspect-action:active {
    background: var(--colour-accent-active);
  }

  .inspect-action.close-inspection {
    border-color: var(--colour-danger-action);
    background: var(--colour-danger-action);
    color: var(--colour-danger-action-text);
  }

  .inspect-action.close-inspection:hover {
    border-color: var(--colour-danger-action-hover);
    background: var(--colour-danger-action-hover);
  }

  .inspect-action.close-inspection:active {
    border-color: var(--colour-danger-action-active);
    background: var(--colour-danger-action-active);
  }

  .inspect-action.close-inspection:disabled {
    border-color: var(--colour-danger-action-disabled);
    background: var(--colour-danger-action-disabled);
    color: var(--colour-danger-action-disabled-text);
    cursor: not-allowed;
  }

  @media (max-width: 699px), (max-height: 699px) {
    .context-card > button,
    .context-body {
      padding: var(--space-2) var(--space-3);
    }

    .context-direction,
    :global(.context-card .kind-badge) {
      display: none;
    }

    .context-structure {
      padding: 0 var(--space-3) var(--space-2);
    }

    .node-name {
      max-width: 100%;
      overflow: visible;
      overflow-wrap: anywhere;
      font-size: var(--font-size-sm);
      white-space: normal;
      word-break: normal;
    }
  }

  @media (orientation: landscape) and (max-height: 520px) {
    .context-card {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(60px, auto);
    }

    .context-card > button,
    .context-body {
      grid-column: 1;
      grid-row: 1;
      padding: var(--space-2);
    }

    .context-structure {
      grid-column: 1;
      grid-row: 2;
      padding: 0 var(--space-2) var(--space-2);
    }

    .card-actions {
      grid-column: 2;
      grid-row: 1 / span 2;
      min-height: var(--control-min-size);
      padding: 0;
      border-top: 0;
      border-left: 1px solid var(--colour-border-subtle);
    }

    .inspect-action {
      min-height: var(--control-min-size);
      border-radius: 0;
    }

    .context-card.overview {
      display: block;
    }
  }

  @container carousel (max-width: 640px) {
    .node-name {
      max-width: 100%;
      overflow: visible;
      overflow-wrap: anywhere;
      font-size: var(--font-size-sm);
      white-space: normal;
      word-break: normal;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .context-card {
      transition-duration: var(--duration-instant);
    }

    .context-card > button {
      transition-duration: var(--duration-instant);
    }
  }

  @media (forced-colors: active) {
    .context-card {
      border-color: CanvasText;
      background: Canvas;
      color: CanvasText;
      box-shadow: none;
    }

    .context-card.rootward {
      border-left: 4px dotted CanvasText;
    }

    .context-card.leafward {
      border-right: 4px solid LinkText;
    }

    .context-card.terminal-cycle-closure {
      border-right: 4px double Highlight;
    }

    .context-card.gesture-preview {
      outline: 3px dotted Highlight;
      box-shadow: none;
    }

    .context-card.keyboard-selected {
      border: 3px double Highlight;
      background: Canvas;
      box-shadow: none;
    }

    .context-card.inspected {
      outline: 2px solid LinkText;
      outline-offset: 1px;
    }

    .context-card button,
    .context-body,
    .node-name,
    .context-direction,
    .terminal-label,
    .recursive-marker {
      color: CanvasText;
    }

    .card-actions {
      border-color: CanvasText;
      background: Canvas;
    }

    .inspect-action {
      border-color: ButtonText;
      background: ButtonFace;
      color: ButtonText;
    }

    .inspect-action.close-inspection {
      border-style: double;
      border-color: Highlight;
      background: ButtonFace;
      color: ButtonText;
    }

    .context-card button:focus-visible {
      outline-color: Highlight;
    }
  }
</style>
