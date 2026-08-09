<script lang="ts">
  import type { SourceViewPresentation } from '../presentation/sourceMarkupPresentation';

  export let presentation: SourceViewPresentation;
  export let onViewSource: (origin: HTMLButtonElement) => void = () => {};
  export let compact = false;
</script>

{#if presentation.sourceIdentity || presentation.sourceAvailable}
  <section
    class:compact
    class="source-orientation"
    aria-label="Source"
    data-source-orientation
  >
    <div class="source-metadata">
      {#if presentation.sourceIdentity}
        <p class="source-identity">
          <strong
            >{presentation.sourceIdentity.kind === 'packageRelativePath'
              ? 'Package path'
              : 'Source file'}:</strong
          >
          <span>{presentation.sourceIdentity.label}</span>
        </p>
      {/if}
      <p class="source-location">
        <strong>Location:</strong> <span>{presentation.location.label}</span>
      </p>
    </div>
    {#if presentation.sourceAvailable}
      <button
        class="view-source"
        type="button"
        aria-label={`View source for ${presentation.displayName}`}
        aria-haspopup="dialog"
        aria-controls="source-view-dialog"
        data-view-source-node-id={presentation.nodeId}
        onclick={(event) => onViewSource(event.currentTarget)}
      >
        View source
      </button>
    {/if}
  </section>
{/if}

<style>
  .source-orientation {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
    margin: 0 0 var(--space-4);
    padding: var(--space-3);
    border: 1px solid var(--colour-border-subtle);
    border-radius: var(--radius-medium);
    background: var(--colour-panel-subtle);
  }

  .source-orientation.compact {
    align-items: start;
  }

  .source-metadata {
    display: grid;
    gap: var(--space-1);
    min-width: 0;
  }

  p {
    min-width: 0;
    margin: 0;
    color: var(--colour-text-secondary);
    font-size: var(--font-size-sm);
    line-height: 1.45;
    overflow-wrap: anywhere;
  }

  strong {
    color: var(--colour-text);
  }

  .source-identity span {
    font-family: var(--font-code);
  }

  .view-source {
    min-width: var(--control-min-size);
    min-height: var(--control-min-size);
    padding: 0 var(--space-3);
    border: 1px solid var(--colour-accent);
    border-radius: var(--radius-medium);
    background: var(--colour-panel);
    color: var(--colour-accent);
    font-weight: 700;
    cursor: pointer;
  }

  .view-source:hover {
    background: var(--colour-accent-soft);
  }

  .view-source:focus-visible {
    outline: 3px solid var(--colour-focus-ring);
    outline-offset: 2px;
  }

  @media (max-width: 479px) {
    .source-orientation {
      grid-template-columns: minmax(0, 1fr);
    }

    .view-source {
      width: 100%;
    }
  }

  @media (forced-colors: active) {
    .source-orientation {
      border-color: CanvasText;
      background: Canvas;
    }

    .view-source {
      border-color: ButtonText;
      background: ButtonFace;
      color: ButtonText;
    }

    .view-source:focus-visible {
      outline-color: Highlight;
    }
  }
</style>
