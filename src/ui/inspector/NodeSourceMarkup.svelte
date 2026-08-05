<script lang="ts">
  import type { SchemaNodeSourceMarkup } from '../../schema/model';

  export let nodeId: string;
  export let nodeName: string;
  export let sourceMarkup: SchemaNodeSourceMarkup;

  let disclosure: HTMLDetailsElement;
  let observedNodeId = nodeId;

  $: if (nodeId !== observedNodeId) {
    observedNodeId = nodeId;
    if (disclosure) disclosure.open = false;
  }
</script>

<details class="source-markup" bind:this={disclosure}>
  <summary aria-label={`View source markup for ${nodeName}`}>
    View source markup
  </summary>
  <div class="markup-fragments">
    {#each sourceMarkup.fragments as fragment (fragment.id)}
      <pre class:xsd-markup={sourceMarkup.syntax === 'xsd'}>
        <code>{fragment.text}</code>
      </pre>
    {/each}
  </div>
</details>

<style>
  .source-markup {
    width: 100%;
    margin: 0 0 var(--space-5);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-medium);
    background: var(--colour-panel-subtle);
  }

  summary {
    min-height: var(--control-min-size);
    padding: var(--space-3) var(--space-4);
    color: var(--colour-text);
    font-size: var(--font-size-sm);
    font-weight: 700;
    cursor: pointer;
  }

  summary:focus-visible {
    outline: 3px solid var(--colour-focus-ring);
    outline-offset: 2px;
  }

  .markup-fragments {
    display: grid;
    gap: var(--space-3);
    padding: var(--space-3);
    border-top: 1px solid var(--colour-border-subtle);
  }

  pre {
    width: 100%;
    max-width: 100%;
    max-height: min(20rem, 45vh);
    margin: 0;
    overflow: auto;
    padding: var(--space-3);
    border-radius: var(--radius-small);
    background: var(--colour-code-surface);
    color: var(--colour-code-text);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  pre.xsd-markup {
    white-space: pre;
    overflow-wrap: normal;
    word-break: normal;
  }

  code {
    font-family: var(--font-code);
    font-size: var(--font-size-sm);
  }
</style>
