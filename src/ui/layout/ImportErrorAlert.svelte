<script lang="ts">
  import type { SchemaDiagnosticReport } from '../../app/import/schemaDiagnosticReport';
  import type { SchemaImportFailurePresentation } from '../../app/import/schemaImportFailureFormatter';

  export let presentation: SchemaImportFailurePresentation;
  export let report: SchemaDiagnosticReport;
  export let onViewAll: (origin: HTMLElement) => void;
  export let onDismiss: () => void;

  $: canViewAll = report.totalCount > 1;
  $: viewAllAccessibleName = `View all ${report.totalCount} problems for ${report.attemptedFileName}`;
</script>

<section
  class="import-error"
  role="alert"
  aria-labelledby="schema-import-error-heading"
>
  <span class="error-mark" aria-hidden="true">!</span>
  <div class="error-copy">
    <h2 id="schema-import-error-heading">{presentation.heading}</h2>
    <p>{presentation.message}</p>
    {#if canViewAll && presentation.additionalProblemsText}
      <button
        type="button"
        class="additional-problems"
        aria-label={viewAllAccessibleName}
        onclick={(event) => onViewAll(event.currentTarget)}
        >{presentation.additionalProblemsText}</button
      >
    {/if}
  </div>
  <div class="error-actions">
    {#if canViewAll}
      <button
        type="button"
        class="view-all-action"
        aria-label={`${viewAllAccessibleName} using the complete report`}
        onclick={(event) => onViewAll(event.currentTarget)}
        >View all problems</button
      >
    {/if}
    <button
      class="dismiss-action"
      type="button"
      onclick={onDismiss}
      aria-label="Dismiss import error">Dismiss</button
    >
  </div>
</section>

<style>
  .import-error {
    grid-area: import-status;
    z-index: 1;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: start;
    gap: var(--space-3);
    min-width: 0;
    padding: var(--space-3) var(--space-5);
    border-bottom: 1px solid var(--colour-error);
    background: var(--colour-error-soft);
    color: var(--colour-text);
  }

  .error-mark {
    display: grid;
    width: 24px;
    height: 24px;
    place-items: center;
    border-radius: 50%;
    background: var(--colour-error);
    color: var(--colour-text-inverse);
    font-weight: 800;
  }

  .error-copy {
    min-width: 0;
  }

  h2,
  p {
    margin: 0;
    overflow-wrap: anywhere;
  }

  h2 {
    color: var(--colour-error);
    font-size: var(--font-size-base);
    line-height: 1.35;
  }

  p {
    margin-top: var(--space-1);
    font-size: var(--font-size-sm);
    line-height: 1.45;
  }

  .additional-problems {
    display: inline-flex;
    min-height: var(--control-min-size);
    align-items: center;
    margin-top: var(--space-1);
    padding: 0 var(--space-1);
    border: 0;
    border-radius: var(--radius-small);
    background: transparent;
    color: var(--colour-accent);
    font: inherit;
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 0.18em;
    cursor: pointer;
  }

  .additional-problems:hover {
    color: var(--colour-accent-hover);
    text-decoration-thickness: 2px;
  }
  .additional-problems:active {
    color: var(--colour-accent-active);
  }

  .error-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  .view-all-action,
  .dismiss-action {
    min-width: var(--control-min-size);
    min-height: var(--control-min-size);
    padding: 0 var(--space-3);
    border: 1px solid var(--colour-error);
    border-radius: var(--radius-medium);
    background: var(--colour-panel);
    color: var(--colour-error);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }

  .view-all-action:hover,
  .dismiss-action:hover {
    background: var(--colour-error-soft);
  }

  @media (max-width: 599px) {
    .import-error {
      grid-template-columns: auto minmax(0, 1fr);
      padding-inline: var(--space-3);
    }

    .error-actions {
      grid-column: 2;
      justify-self: start;
      justify-content: flex-start;
    }
  }
</style>
