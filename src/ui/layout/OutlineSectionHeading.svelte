<script lang="ts">
  export let id: string | undefined = undefined;
  export let label: string;
  export let count: number | undefined = undefined;
</script>

<h3 {id} class="outline-section-heading" data-outline-section-heading>
  <span>{label}</span>
  {#if count !== undefined}<span class="section-count" aria-hidden="true"
      >{count}</span
    >{/if}
</h3>

<style>
  .outline-section-heading {
    display: flex;
    width: 100%;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin: 0 0 var(--space-3);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--colour-border-strong);
    border-radius: var(--radius-medium);
    background: var(--colour-panel-subtle);
    color: var(--colour-text);
    font-size: var(--font-size-md);
    font-weight: 800;
    line-height: 1.35;
  }

  .outline-section-heading > span:first-child {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .section-count {
    flex: 0 0 auto;
    min-width: 1.75em;
    text-align: right;
  }
</style>
