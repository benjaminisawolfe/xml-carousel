<script lang="ts">
  import type { XsdAppInfoPresentation } from '../presentation/xsdAnnotationPresentation';
  import InspectorSection from './InspectorSection.svelte';

  export let appInfo: readonly XsdAppInfoPresentation[];
</script>

<InspectorSection title="AppInfo">
  <ul aria-label="AppInfo blocks">
    {#each appInfo as entry (entry.id)}
      <li data-appinfo-entry>
        {#if entry.source}
          <dl>
            <div>
              <dt>Source</dt>
              <dd>{entry.source.displayValue}</dd>
            </div>
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
    padding: var(--space-3) var(--space-4);
    border-left: 3px solid var(--colour-type);
    border-radius: 0 var(--radius-medium) var(--radius-medium) 0;
    background: var(--colour-panel-subtle);
  }

  dl {
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
    font-size: var(--font-size-sm);
    line-height: 1.6;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }

  p.empty {
    color: var(--colour-text-muted);
    font-style: italic;
  }
</style>
