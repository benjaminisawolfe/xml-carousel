<script lang="ts">
  export let title: string;
  export let description: string | undefined = undefined;

  $: headingId = `inspector-${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')}-heading`;
</script>

<section aria-labelledby={headingId} data-inspector-section>
  <h3 id={headingId}>{title}</h3>
  {#if description}
    <p class="description">{description}</p>
  {/if}
  <slot />
</section>

<style>
  section {
    padding: var(--space-5) 0;
    border-top: 1px solid var(--colour-border-subtle);
  }

  section:first-child {
    padding-top: 0;
    border-top: 0;
  }

  h3 {
    margin-bottom: var(--space-3);
    font-size: var(--font-size-md);
  }

  .description {
    margin: calc(-1 * var(--space-2)) 0 var(--space-3);
    color: var(--colour-text-muted);
    font-size: var(--font-size-sm);
  }
</style>
