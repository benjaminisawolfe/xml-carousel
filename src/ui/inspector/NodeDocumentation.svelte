<script lang="ts">
  import type { XsdDocumentationPresentation } from '../presentation/xsdAnnotationPresentation';
  import InspectorSection from './InspectorSection.svelte';

  export let documentation: readonly XsdDocumentationPresentation[];
</script>

<InspectorSection title="Documentation">
  <ul aria-label="Documentation blocks">
    {#each documentation as entry (entry.id)}
      <li>
        {#if entry.language || entry.source}
          <dl>
            {#if entry.language}
              <div>
                <dt>Language</dt>
                <dd>{entry.language.displayValue}</dd>
              </div>
            {/if}
            {#if entry.source}
              <div>
                <dt>Source</dt>
                <dd>{entry.source.displayValue}</dd>
              </div>
            {/if}
          </dl>
        {/if}
        <p class:empty={entry.isEmpty}>{entry.displayText}</p>
      </li>
    {/each}
  </ul>
</InspectorSection>

<style>
  ul {
    display: grid;
    gap: var(--space-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    min-width: 0;
    padding-left: var(--space-4);
    border-left: 3px solid var(--colour-metadata);
  }

  dl {
    display: grid;
    gap: var(--space-1);
    margin: 0 0 var(--space-2);
  }

  dl div {
    display: grid;
    grid-template-columns: minmax(5rem, auto) minmax(0, 1fr);
    gap: var(--space-2);
  }

  dt {
    color: var(--colour-text-muted);
    font-size: var(--font-size-sm);
    font-weight: 650;
  }

  dd {
    min-width: 0;
    margin: 0;
    color: var(--colour-text-secondary);
    font-size: var(--font-size-sm);
    overflow-wrap: anywhere;
  }

  p {
    margin: 0;
    color: var(--colour-text);
    font-size: var(--font-size-base);
    line-height: 1.6;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }

  p.empty {
    color: var(--colour-text-muted);
    font-style: italic;
  }
</style>
