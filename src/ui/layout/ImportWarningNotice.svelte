<script lang="ts">
  import type { SchemaDiagnostic } from '../../app/import/schemaDiagnosticReport';
  import type { VisualizationSummary } from '../../schema/visualization';

  export let filename: string;
  export let diagnostics: readonly SchemaDiagnostic[];
  export let totalWarningCount: number;
  export let visualizationSummary: VisualizationSummary | undefined = undefined;
  export let onDismiss: () => void;

  $: firstWarning =
    diagnostics[0]?.message ??
    'Supported declarations remain available in the project.';
  $: additionalCount = Math.max(0, totalWarningCount - 1);
</script>

<section
  class="import-warning"
  aria-live="polite"
  aria-labelledby="schema-import-warning-heading"
  data-schema-import-warning
>
  <span class="warning-mark" aria-hidden="true">!</span>
  <div class="warning-copy">
    <h2 id="schema-import-warning-heading">
      {visualizationSummary?.completeness === 'partial'
        ? 'Project loaded with limited visualization'
        : `DTD loaded with ${totalWarningCount} ${totalWarningCount === 1 ? 'warning' : 'warnings'}`}
    </h2>
    {#if visualizationSummary?.completeness === 'partial'}
      <p>
        XML Carousel does not yet represent
        {visualizationSummary.totalFindingCount}
        {visualizationSummary.totalFindingCount === 1
          ? 'construct'
          : 'constructs'}.
      </p>
    {/if}
    <p>{firstWarning}</p>
    {#if additionalCount > 0}
      <p class="additional-warnings">
        {additionalCount} more {additionalCount === 1 ? 'warning' : 'warnings'}
      </p>
    {/if}
  </div>
  <button
    type="button"
    onclick={onDismiss}
    aria-label={visualizationSummary?.completeness === 'partial'
      ? `Dismiss limited-visualization warning for ${filename}`
      : `Dismiss DTD warnings for ${filename}`}>Dismiss</button
  >
</section>

<style>
  .import-warning {
    grid-area: import-status;
    z-index: 1;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: start;
    gap: var(--space-3);
    min-width: 0;
    padding: var(--space-3) var(--space-5);
    border-bottom: 1px solid var(--colour-warning);
    background: var(--colour-warning-soft);
    color: var(--colour-text);
  }

  .warning-mark {
    display: grid;
    width: 24px;
    height: 24px;
    place-items: center;
    border-radius: 50%;
    background: var(--colour-warning);
    color: var(--colour-text-inverse);
    font-weight: 800;
  }

  .warning-copy {
    min-width: 0;
  }

  h2,
  p {
    margin: 0;
    overflow-wrap: anywhere;
  }

  h2 {
    color: var(--colour-warning);
    font-size: var(--font-size-base);
    line-height: 1.35;
  }

  p {
    margin-top: var(--space-1);
    font-size: var(--font-size-sm);
    line-height: 1.45;
  }

  .additional-warnings {
    color: var(--colour-text-secondary);
    font-weight: 600;
  }

  button {
    min-width: var(--control-min-size);
    min-height: var(--control-min-size);
    padding: 0 var(--space-3);
    border: 1px solid var(--colour-warning);
    border-radius: var(--radius-medium);
    background: var(--colour-panel);
    color: var(--colour-warning);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }

  button:hover {
    background: var(--colour-warning-soft);
  }

  @media (max-width: 599px) {
    .import-warning {
      grid-template-columns: auto minmax(0, 1fr);
      padding-inline: var(--space-3);
    }

    button {
      grid-column: 2;
      justify-self: start;
    }
  }
</style>
