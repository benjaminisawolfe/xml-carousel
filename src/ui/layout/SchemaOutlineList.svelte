<script lang="ts">
  import { tick } from 'svelte';
  import {
    buildSchemaOutlineListPresentation,
    type SchemaOutlineListRow,
  } from '../presentation/schemaOutlineListPresentation';

  export let groupId: string;
  export let label: string;
  export let rows: readonly SchemaOutlineListRow[];
  export let currentFocusNodeId: string | undefined;
  export let inspectedNodeId: string | undefined;
  export let onCenterNode: (
    row: SchemaOutlineListRow,
    origin: HTMLButtonElement,
  ) => void;
  export let onInspectNode: ((nodeId: string) => void) | undefined = undefined;
  export let includeKindInCenterName = true;

  let query = '';
  let pageStart: number | undefined;
  let trackedGroupId: string | undefined;
  let trackedFocusNodeId: string | undefined;
  let previousButton: HTMLButtonElement | undefined;
  let nextButton: HTMLButtonElement | undefined;

  $: {
    if (trackedGroupId !== groupId) {
      trackedGroupId = groupId;
      trackedFocusNodeId = currentFocusNodeId;
      query = '';
      pageStart = undefined;
    } else if (trackedFocusNodeId !== currentFocusNodeId) {
      trackedFocusNodeId = currentFocusNodeId;
      pageStart = undefined;
    }
  }
  $: presentation = buildSchemaOutlineListPresentation({
    rows,
    label,
    query,
    ...(pageStart === undefined ? {} : { pageStart }),
    ...(currentFocusNodeId ? { currentFocusNodeId } : {}),
  });

  function handleFilter(event: Event): void {
    query = (event.currentTarget as HTMLInputElement).value;
    pageStart = undefined;
  }

  async function movePage(direction: -1 | 1): Promise<void> {
    const count =
      direction < 0 ? presentation.previousCount : presentation.nextCount;
    pageStart = presentation.pageStart + direction * count;
    await tick();
    (direction < 0 ? previousButton : nextButton)?.focus({
      preventScroll: true,
    });
  }

  function clearFilter(): void {
    query = '';
    pageStart = undefined;
  }
</script>

{#if presentation.showFilter}
  <label class="outline-filter">
    <span>Filter {label}</span>
    <input
      type="search"
      value={query}
      aria-label={`Filter ${label}`}
      oninput={handleFilter}
    />
  </label>
{/if}

{#if presentation.currentFocusHiddenByFilter}
  <div class="focus-hidden-note">
    <span>Current node is hidden by this filter.</span>
    <button type="button" onclick={clearFilter}>Clear filter</button>
  </div>
{/if}

{#if presentation.showFilter}
  <p class="outline-status" aria-live="polite">{presentation.statusText}</p>
{/if}

{#if presentation.visibleRows.length > 0}
  <ul>
    {#each presentation.visibleRows as row (row.nodeId)}
      <li
        class:inspected={row.nodeId === inspectedNodeId}
        data-schema-outline-row
      >
        <div class:has-inspect={onInspectNode} class="node-row">
          {#if row.nodeId === currentFocusNodeId}
            <span
              class="node-name current-node"
              aria-current="true"
              data-navigation-current-node
              tabindex="-1"
            >
              {row.displayName}
            </span>
          {:else}
            <button
              class="node-name"
              type="button"
              aria-label={row.activationLabel ??
                (includeKindInCenterName
                  ? `Center ${row.displayName}, ${row.kindLabel}`
                  : `Center ${row.displayName}`)}
              data-center-navigation-entry={row.activationAction !== 'inspect'
                ? true
                : undefined}
              data-inspect-navigation-entry={row.activationAction === 'inspect'
                ? true
                : undefined}
              onclick={(event) => onCenterNode(row, event.currentTarget)}
            >
              {row.displayName}
            </button>
          {/if}
          {#if onInspectNode && row.activationAction !== 'inspect'}
            <button
              class:active={row.nodeId === inspectedNodeId}
              class="inspect-action"
              type="button"
              aria-label={row.nodeId === inspectedNodeId
                ? `${row.displayName} is currently inspected`
                : `Inspect ${row.displayName}`}
              onclick={() => onInspectNode?.(row.nodeId)}
            >
              Inspect
            </button>
          {/if}
        </div>
        <span class="kind-label">{row.kindLabel}</span>
      </li>
    {/each}
  </ul>
{/if}

{#if presentation.previousCount > 0 || presentation.nextCount > 0}
  <div class="paging-controls">
    {#if presentation.previousCount > 0}
      <button
        bind:this={previousButton}
        type="button"
        onclick={() => void movePage(-1)}
      >
        Previous {presentation.previousCount}
      </button>
    {/if}
    {#if presentation.nextCount > 0}
      <button
        bind:this={nextButton}
        type="button"
        onclick={() => void movePage(1)}
      >
        Next {presentation.nextCount}
      </button>
    {/if}
  </div>
{/if}

<style>
  .outline-filter {
    display: grid;
    gap: var(--space-1);
    margin-bottom: var(--space-2);
    color: var(--colour-text-secondary);
    font-size: var(--font-size-xs);
    font-weight: 700;
  }

  .outline-filter input {
    width: 100%;
    min-height: var(--control-min-size);
    padding: 0 var(--space-2);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-medium);
    background: var(--colour-panel);
    color: var(--colour-text);
    font: inherit;
  }

  .outline-status,
  .focus-hidden-note {
    margin: 0 0 var(--space-2);
    color: var(--colour-text-muted);
    font-size: var(--font-size-xs);
    line-height: 1.45;
  }

  .focus-hidden-note {
    display: grid;
    gap: var(--space-1);
  }

  ul {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    min-width: 0;
    padding: var(--space-1);
    border: 1px solid transparent;
    border-radius: var(--radius-medium);
  }

  li.inspected {
    border-color: var(--colour-info);
  }

  .node-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-2);
  }

  .node-row.has-inspect {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .node-name,
  .inspect-action,
  .paging-controls button,
  .focus-hidden-note button {
    min-height: var(--control-min-size);
    border-radius: var(--radius-medium);
    font: inherit;
    cursor: pointer;
  }

  button.node-name {
    max-width: 100%;
    min-width: 0;
    padding: var(--space-2);
    border: 0;
    background: transparent;
    color: var(--colour-accent);
    font-size: var(--font-size-sm);
    font-weight: 700;
    text-align: left;
    overflow-wrap: anywhere;
    white-space: normal;
    word-break: normal;
  }

  button.node-name:hover {
    background: var(--colour-accent-soft);
  }

  .current-node {
    max-width: 100%;
    display: flex;
    min-width: 0;
    align-items: center;
    padding: var(--space-2);
    background: var(--colour-accent-soft);
    box-shadow: inset 3px 0 0 var(--colour-accent);
    color: var(--colour-text);
    font-size: var(--font-size-sm);
    font-weight: 700;
    overflow-wrap: anywhere;
    white-space: normal;
    word-break: normal;
  }

  .inspect-action,
  .paging-controls button,
  .focus-hidden-note button {
    padding: 0 var(--space-2);
    border: 1px solid var(--colour-border);
    background: var(--colour-panel);
    color: var(--colour-text-secondary);
    font-size: var(--font-size-xs);
    font-weight: 700;
  }

  .inspect-action.active {
    border-color: var(--colour-info);
    color: var(--colour-info);
  }

  .kind-label {
    display: block;
    padding-inline: var(--space-2);
    color: var(--colour-text-muted);
    font-size: var(--font-size-xs);
  }

  .paging-controls {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }
</style>
