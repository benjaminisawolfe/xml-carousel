<script lang="ts">
  import { tick } from 'svelte';

  export let accessibleName: 'Filter child structures' | 'Filter declarations';
  export let query: string;
  export let status: string;
  export let emptyMessage: string | undefined = undefined;
  export let remainingCount = 0;
  export let onQueryChange: (query: string) => void;
  export let onShowMore: () => void;

  let inputElement: HTMLInputElement;
  $: showMoreCount = Math.min(50, remainingCount);

  function handleInput(event: Event): void {
    onQueryChange((event.currentTarget as HTMLInputElement).value);
  }

  async function clearQuery(): Promise<void> {
    onQueryChange('');
    await tick();
    inputElement.focus();
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || query === '') return;
    event.stopPropagation();
    event.preventDefault();
    void clearQuery();
  }
</script>

<div class="inspector-list-filter">
  <div class="filter-row">
    <input
      bind:this={inputElement}
      type="search"
      value={query}
      aria-label={accessibleName}
      placeholder={accessibleName}
      autocomplete="off"
      spellcheck={false}
      on:input={handleInput}
      on:keydown={handleKeydown}
    />
    {#if query !== ''}
      <button
        type="button"
        class="clear-button"
        on:click={() => void clearQuery()}
      >
        Clear
      </button>
    {/if}
  </div>
  <p class="filter-status" role="status" aria-live="polite" aria-atomic="true">
    {status}
  </p>
  {#if emptyMessage}
    <p class="empty-message">{emptyMessage}</p>
  {/if}
  {#if remainingCount > 0}
    <button type="button" class="show-more" on:click={onShowMore}>
      Show {showMoreCount} more
    </button>
  {/if}
</div>

<style>
  .inspector-list-filter {
    display: grid;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }

  .filter-row {
    display: flex;
    gap: var(--space-2);
  }

  input {
    min-width: 0;
    min-height: 44px;
    flex: 1;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-medium);
    background: var(--colour-panel);
    color: var(--colour-text);
    font: inherit;
  }

  button {
    min-height: 44px;
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-medium);
    background: var(--colour-panel);
    color: var(--colour-accent);
    font: inherit;
    font-weight: 650;
    cursor: pointer;
  }

  .clear-button {
    min-width: 44px;
    padding: 0 var(--space-3);
  }

  .show-more {
    width: 100%;
    padding: var(--space-2) var(--space-3);
  }

  button:hover {
    border-color: var(--colour-accent);
    background: var(--colour-accent-soft);
  }

  input:focus-visible,
  button:focus-visible {
    outline: 3px solid var(--colour-focus-ring);
    outline-offset: 2px;
  }

  .filter-status,
  .empty-message {
    margin: 0;
    color: var(--colour-text-muted);
    font-size: var(--font-size-sm);
  }
</style>
