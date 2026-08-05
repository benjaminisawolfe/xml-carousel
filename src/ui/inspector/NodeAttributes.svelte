<script lang="ts">
  import InspectorSection from './InspectorSection.svelte';
  import type { InspectorAttributeSummary } from './inspectorSummary';

  export let attributes: readonly InspectorAttributeSummary[];
  export let title = 'Attributes';
</script>

<InspectorSection {title}>
  <ul aria-label={title} data-inspector-attributes>
    {#each attributes as attribute (attribute.nodeId)}
      <li data-inspector-attribute-row>
        <strong>{attribute.name}</strong>
        {#each attribute.detailLines as detailLine, detailIndex (detailIndex)}
          <span>{detailLine}</span>
        {/each}
      </li>
    {/each}
  </ul>
</InspectorSection>

<style>
  ul {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: grid;
    gap: var(--space-1);
    min-width: 0;
    padding: var(--space-3);
    border: 1px solid var(--colour-border-subtle);
    border-radius: var(--radius-medium);
    background: var(--colour-panel-subtle);
  }

  strong {
    overflow-wrap: anywhere;
    color: var(--colour-text);
    font-size: var(--font-size-sm);
  }

  span {
    min-width: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    color: var(--colour-text-secondary);
    font-family: var(--font-code);
    font-size: var(--font-size-sm);
    line-height: 1.5;
  }
</style>
