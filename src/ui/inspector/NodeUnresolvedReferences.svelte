<script lang="ts">
  import type { SchemaSetUnresolvedReferencePresentation } from '../presentation/schemaSetOutlinePresentation';
  import InspectorSection from './InspectorSection.svelte';

  export let references: readonly SchemaSetUnresolvedReferencePresentation[];
</script>

{#if references.length > 0}
  <InspectorSection title="Unresolved references">
    <ul class="unresolved-list">
      {#each references as reference (reference.id)}
        <li>
          <code>{reference.raw}</code>
          <p class="classification">
            {reference.kindLabel} · {reference.reasonLabel}
          </p>
          <p>{reference.explanation}</p>
          {#if reference.candidateSummary}
            <p class="candidates">{reference.candidateSummary}</p>
          {/if}
          <p class="location">
            Source line {reference.line}, column {reference.column}
          </p>
        </li>
      {/each}
    </ul>
  </InspectorSection>
{/if}

<style>
  .unresolved-list {
    display: grid;
    gap: var(--space-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    padding: var(--space-3);
    border: 1px solid var(--colour-warning);
    border-radius: var(--radius-medium);
    background: var(--colour-warning-soft);
  }

  code {
    font-family: var(--font-code);
    font-weight: 700;
    overflow-wrap: anywhere;
  }

  p {
    margin: var(--space-2) 0 0;
    color: var(--colour-text-secondary);
    font-size: var(--font-size-sm);
    line-height: 1.5;
  }

  .classification {
    color: var(--colour-text);
    font-weight: 700;
  }

  .candidates,
  .location {
    color: var(--colour-text-muted);
  }
</style>
