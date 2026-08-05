<script lang="ts">
  import type { SchemaNode } from '../../schema/model';
  import { formatSchemaNodeKind } from './nodePresentation';
  import NodeKindBadge from './NodeKindBadge.svelte';
  import type { ImplementedSemanticZoomPresentation } from './semanticZoomPresentation';

  export let node: SchemaNode;
  export let displayName = node.name;
  export let journeyPosition: number;
  export let showKind: boolean;
  export let isInspected: boolean;
  export let onJump: (nodeId: string, journeyPosition: number) => void;
  export let onToggleInspection: (nodeId: string) => void;
  export let presentation: ImplementedSemanticZoomPresentation = 'full';

  $: motionKey = `history:${journeyPosition}:${node.id}`;
</script>

<li
  class:inspected={isInspected}
  class:compact={presentation === 'compact'}
  class="history-row"
  data-rootward-history-row
  data-journey-position={journeyPosition}
  data-carousel-motion-key={motionKey}
  data-semantic-zoom-rootward-position={journeyPosition}
  data-semantic-zoom-line-role="history"
  data-semantic-zoom-line-node-id={node.id}
>
  <button
    class="jump-action"
    type="button"
    aria-label={`Jump to ${displayName}, earlier in the current path`}
    data-carousel-navigation-action
    data-earlier-path-jump
    onclick={() => onJump(node.id, journeyPosition)}
  >
    <span class="node-name" title={displayName}>{displayName}</span>
    {#if presentation === 'full' && showKind}
      <NodeKindBadge kind={node.kind} />
    {:else}
      <span class="visually-hidden">{formatSchemaNodeKind(node.kind)}</span>
    {/if}
  </button>

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
</li>

<style>
  .history-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    min-width: 0;
    border: 1px dashed var(--colour-border-strong);
    border-radius: var(--radius-medium);
    background: var(--colour-panel-subtle);
    overflow: hidden;
  }

  .history-row.inspected {
    outline: 2px solid var(--colour-danger-action);
    outline-offset: 1px;
  }

  .history-row.compact .jump-action {
    padding: var(--space-1) var(--space-2);
  }

  .history-row.compact .node-name {
    font-size: var(--font-size-xs);
  }

  .jump-action,
  .inspect-action {
    min-width: var(--control-min-size);
    min-height: var(--control-min-size);
    border: 0;
    background: transparent;
    cursor: pointer;
  }

  .jump-action {
    display: grid;
    min-width: 0;
    align-content: center;
    justify-items: start;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-3);
    color: var(--colour-text);
    text-align: left;
  }

  .jump-action:hover {
    background: var(--colour-accent-soft);
  }

  .node-name {
    min-width: 0;
    max-width: 100%;
    overflow-wrap: anywhere;
    font-size: var(--font-size-sm);
    font-weight: 700;
    line-height: 1.25;
  }

  :global(.history-row .kind-badge) {
    justify-self: start;
    min-height: 20px;
    padding-inline: var(--space-2);
    font-size: var(--font-size-xs);
  }

  .inspect-action {
    align-self: stretch;
    padding: var(--space-1) var(--space-2);
    border-left: 1px solid var(--colour-border-subtle);
    color: var(--colour-accent);
    font-size: var(--font-size-xs);
    font-weight: 700;
    line-height: 1.2;
  }

  .inspect-action:hover {
    background: var(--colour-accent-soft);
  }

  .inspect-action.close-inspection {
    color: var(--colour-danger-action);
  }

  .history-row button:focus-visible {
    position: relative;
    z-index: 2;
    outline: 3px solid var(--colour-focus-ring);
    outline-offset: -3px;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @container carousel (max-width: 430px) {
    .history-row {
      grid-template-columns: minmax(0, 1fr);
    }

    .inspect-action {
      border-top: 1px solid var(--colour-border-subtle);
      border-left: 0;
    }
  }

  @media (orientation: landscape) and (max-height: 520px) {
    .jump-action {
      padding: var(--space-1) var(--space-2);
    }

    :global(.history-row .kind-badge) {
      display: none;
    }
  }
</style>
