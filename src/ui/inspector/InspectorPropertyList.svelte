<script lang="ts">
  interface InspectorProperty {
    readonly id: string;
    readonly label: string;
    readonly value: string;
  }

  export let items: readonly InspectorProperty[];
</script>

<dl>
  {#each items as item (item.id)}
    <div>
      <dt>{item.label}</dt>
      <dd>{item.value}</dd>
    </div>
  {/each}
</dl>

<style>
  dl {
    display: grid;
    gap: var(--space-3);
    margin: 0;
  }

  dl div {
    display: grid;
    grid-template-columns: minmax(88px, 0.42fr) minmax(0, 1fr);
    gap: var(--space-3);
  }

  dt {
    color: var(--colour-text-muted);
    font-size: var(--font-size-sm);
    font-weight: 700;
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
    color: var(--colour-text);
    font-size: var(--font-size-sm);
  }
</style>
