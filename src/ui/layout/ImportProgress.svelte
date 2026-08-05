<script lang="ts">
  import type { SchemaImportProgressPresentation } from '../presentation/schemaImportProgressPresentation';

  export let presentation: SchemaImportProgressPresentation;
  export let onCancel: () => void;
  export let phase: string | undefined = undefined;
</script>

<section
  class="import-progress"
  role="status"
  aria-live="polite"
  aria-atomic="true"
  aria-labelledby="schema-import-progress-heading"
  data-schema-import-phase={phase}
>
  <span class="progress-mark" aria-hidden="true">i</span>
  <div class="progress-copy">
    <h2 id="schema-import-progress-heading">{presentation.heading}</h2>
    <p>{presentation.message}</p>
    {#if presentation.determinate}
      <progress
        aria-label={presentation.progressLabel}
        value={presentation.value}
        max={presentation.max}
      ></progress>
    {:else}
      <progress aria-label={presentation.progressLabel}></progress>
    {/if}
  </div>
  <button
    type="button"
    onclick={onCancel}
    aria-label={presentation.cancelAccessibleName}>Cancel</button
  >
</section>

<style>
  .import-progress {
    grid-area: import-status;
    z-index: 1;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
    padding: var(--space-3) var(--space-5);
    border-bottom: 1px solid var(--colour-info);
    background: var(--colour-info-soft);
    color: var(--colour-text);
  }

  .progress-mark {
    display: grid;
    width: 24px;
    height: 24px;
    place-items: center;
    border-radius: 50%;
    background: var(--colour-info);
    color: var(--colour-text-inverse);
    font-weight: 800;
  }

  .progress-copy {
    display: grid;
    min-width: 0;
    gap: var(--space-1);
  }

  h2,
  p {
    margin: 0;
    overflow-wrap: anywhere;
  }

  h2 {
    color: var(--colour-info);
    font-size: var(--font-size-base);
    line-height: 1.35;
  }

  p {
    font-size: var(--font-size-sm);
    line-height: 1.45;
  }

  progress {
    width: min(100%, 36rem);
    height: var(--space-2);
    accent-color: var(--colour-info);
  }

  button {
    min-width: var(--control-min-size);
    min-height: var(--control-min-size);
    padding: 0 var(--space-3);
    border: 1px solid var(--colour-info);
    border-radius: var(--radius-medium);
    background: var(--colour-panel);
    color: var(--colour-info);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }

  button:hover {
    background: var(--colour-info-soft);
  }

  @media (max-width: 599px) {
    .import-progress {
      grid-template-columns: auto minmax(0, 1fr);
      padding-inline: var(--space-3);
    }

    button {
      grid-column: 2;
      justify-self: start;
    }
  }
</style>
