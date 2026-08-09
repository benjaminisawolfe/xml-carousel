<script lang="ts">
  import { copyText, type CopyText } from '../source/copyText';

  export let summaryText: string | undefined = undefined;
  export let targetKey: string;
  export let copySummaryText: CopyText = copyText;

  let copyFeedback = '';
  let copyOperationRevision = 0;
  let observedTargetKey: string | undefined;

  $: currentTargetKey = summaryText ? targetKey : undefined;
  $: if (currentTargetKey !== observedTargetKey) {
    observedTargetKey = currentTargetKey;
    copyFeedback = '';
    copyOperationRevision += 1;
  }

  async function handleCopy(): Promise<void> {
    if (!summaryText || !currentTargetKey) return;

    const operationRevision = ++copyOperationRevision;
    const copiedTargetKey = currentTargetKey;
    const result = await copySummaryText(summaryText);
    if (
      operationRevision !== copyOperationRevision ||
      copiedTargetKey !== currentTargetKey ||
      !summaryText
    ) {
      return;
    }

    copyFeedback = result.succeeded
      ? 'Copied node summary'
      : result.reason === 'unavailable'
        ? 'Copy unavailable'
        : "Couldn't copy node summary";
  }
</script>

{#if summaryText}
  <div class="node-summary-copy-action" data-node-summary-copy-action>
    <button
      type="button"
      data-copy-node-summary
      onclick={() => void handleCopy()}
    >
      Copy node summary
    </button>
    <p data-node-summary-copy-status aria-live="polite" aria-atomic="true">
      {copyFeedback}
    </p>
  </div>
{/if}

<style>
  .node-summary-copy-action {
    display: grid;
    grid-template-columns: minmax(0, auto) minmax(0, 1fr);
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
    margin: 0 0 var(--space-4);
  }

  button {
    min-width: var(--control-min-size);
    min-height: var(--control-min-size);
    padding: 0 var(--space-3);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-medium);
    background: var(--colour-panel);
    color: var(--colour-text);
    font-weight: 700;
    cursor: pointer;
  }

  button:hover {
    border-color: var(--colour-accent);
    color: var(--colour-accent);
  }

  button:focus-visible {
    outline: 3px solid var(--colour-focus-ring);
    outline-offset: 2px;
  }

  p {
    min-width: 0;
    min-height: 1.25em;
    margin: 0;
    color: var(--colour-text-secondary);
    font-size: var(--font-size-sm);
    font-weight: 700;
    overflow-wrap: anywhere;
  }

  @media (max-width: 479px) {
    .node-summary-copy-action {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--space-2);
    }

    button {
      width: 100%;
    }
  }

  @media (forced-colors: active) {
    button {
      border-color: ButtonText;
      background: ButtonFace;
      color: ButtonText;
    }

    button:focus-visible {
      outline-color: Highlight;
    }
  }
</style>
