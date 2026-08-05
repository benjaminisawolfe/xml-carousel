<script lang="ts">
  export let nodeName: string;
  export let nodeKindLabel: string;
  export let sourceFilename: string | undefined = undefined;
  export let showCenterAction: boolean;
  export let onCenter: () => void;
  export let onClose: () => void;
</script>

<div class="inspector-header">
  <div>
    <p class="eyebrow">Inspector</p>
    <h2>{nodeName}</h2>
    <p class="node-context">
      {nodeKindLabel}{#if sourceFilename}
        · {sourceFilename}{/if}
    </p>
  </div>

  <div class="header-actions">
    {#if showCenterAction}
      <button
        class="center-action"
        type="button"
        aria-label={`Center inspected node ${nodeName}`}
        onclick={onCenter}
      >
        Center this node
      </button>
    {/if}
    <button
      class="close-action"
      type="button"
      aria-label={`Close inspector for ${nodeName}`}
      data-inspector-close
      onclick={onClose}
    >
      Close
    </button>
  </div>
</div>

<style>
  .inspector-header {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    min-height: var(--panel-header-height);
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-5);
    border-bottom: 1px solid var(--colour-border);
    background: var(--colour-panel);
  }

  .eyebrow {
    margin-bottom: var(--space-1);
    color: var(--colour-text-muted);
    font-size: var(--font-size-xs);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  h2 {
    margin: 0;
    overflow-wrap: anywhere;
    font-size: var(--font-size-lg);
    line-height: 1.25;
  }

  .node-context {
    margin: var(--space-1) 0 0;
    color: var(--colour-text-secondary);
    font-size: var(--font-size-sm);
    line-height: 1.4;
    overflow-wrap: anywhere;
  }

  .header-actions {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  button {
    min-height: var(--control-min-size);
    padding: 0 var(--space-3);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-medium);
    font-size: var(--font-size-sm);
    font-weight: 700;
    cursor: pointer;
  }

  .center-action {
    border-color: var(--colour-accent);
    background: var(--colour-accent);
    color: var(--colour-text-inverse);
  }

  .center-action:hover {
    background: var(--colour-accent-hover);
  }

  .close-action {
    background: var(--colour-panel-subtle);
    color: var(--colour-text-secondary);
  }

  .close-action:hover {
    background: var(--colour-border-subtle);
    color: var(--colour-text);
  }

  @media (max-width: 1279px) {
    .inspector-header {
      align-items: flex-start;
    }

    .header-actions {
      flex-direction: column-reverse;
    }
  }

  @media (max-width: 899px) {
    .header-actions {
      flex-direction: row;
    }
  }
</style>
