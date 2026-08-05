<script lang="ts">
  import InspectorSection from './InspectorSection.svelte';
  import type { InspectorEnumerationValueSummary } from './inspectorSummary';

  export let values: readonly InspectorEnumerationValueSummary[];
</script>

<InspectorSection title="Allowed values">
  <ul aria-label="Allowed values" data-inspector-enumeration-values>
    {#each values as value (value.order)}
      <li aria-label={value.accessibleLabel}>
        <code>{value.displayValue}</code>
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
    min-width: 0;
    padding: var(--space-3);
    border: 1px solid var(--colour-border-subtle);
    border-radius: var(--radius-medium);
    background: var(--colour-panel-subtle);
  }

  code {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    color: var(--colour-text);
    font-family: var(--font-code);
    font-size: var(--font-size-sm);
    line-height: 1.5;
  }
</style>
