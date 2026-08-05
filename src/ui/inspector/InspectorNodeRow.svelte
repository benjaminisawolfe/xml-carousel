<script lang="ts">
  export let primary: string;
  export let secondary: string | undefined = undefined;
  export let accessibleName: string | undefined = undefined;
  export let onActivate: (() => void) | undefined = undefined;
  export let isTerminalCycleClosure = false;
</script>

<li
  class:terminal-cycle-closure={isTerminalCycleClosure}
  data-inspector-node-row
>
  {#snippet content()}
    <strong>{primary}</strong>
    {#if secondary}
      <span>{secondary}</span>
    {/if}
  {/snippet}
  {#if onActivate}
    <button type="button" aria-label={accessibleName} onclick={onActivate}>
      {@render content()}
    </button>
  {:else}
    <div class="informational" aria-label={accessibleName}>
      {@render content()}
    </div>
  {/if}
</li>

<style>
  li,
  button,
  .informational {
    min-width: 0;
  }

  button,
  .informational {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-1);
  }

  .informational {
    cursor: default;
  }

  .terminal-cycle-closure :is(button, .informational) {
    border-color: var(--colour-metadata);
  }

  button {
    width: 100%;
    min-height: var(--control-min-size);
    padding: var(--space-3);
    border: 1px solid var(--colour-border-subtle);
    border-radius: var(--radius-medium);
    background: var(--colour-panel-subtle);
    color: var(--colour-text);
    font-size: var(--font-size-sm);
    text-align: left;
    cursor: pointer;
    transition:
      border-color var(--duration-instant) var(--ease-standard),
      background-color var(--duration-instant) var(--ease-standard);
  }

  button:hover {
    border-color: var(--colour-accent);
    background: var(--colour-accent-soft);
  }

  button:active {
    background: var(--colour-border-subtle);
  }

  strong,
  span {
    display: block;
    width: 100%;
    min-width: 0;
    overflow-wrap: anywhere;
    text-align: left;
  }

  span {
    color: var(--colour-text-muted);
  }
</style>
