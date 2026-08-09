<script lang="ts">
  import { tick } from 'svelte';
  import type { SourceViewPresentation } from '../presentation/sourceMarkupPresentation';
  import { copyText, type CopyText } from './copyText';

  export const SOURCE_VIEW_DIALOG_ID = 'source-view-dialog';

  export let open = false;
  export let presentation: SourceViewPresentation | undefined = undefined;
  export let onClose: (reason: 'close' | 'escape') => void = () => {};
  export let copySourceText: CopyText = copyText;

  let dialog: HTMLDialogElement;
  let closeButton: HTMLButtonElement;
  let copyFeedback = '';
  let copyOperationRevision = 0;
  let observedTargetKey: string | undefined;

  $: if (dialog) void synchronizeDialog(open && presentation !== undefined);
  $: currentTargetKey =
    open && presentation?.sourceAvailable
      ? `${presentation.projectId}:${presentation.nodeId}`
      : undefined;
  $: if (currentTargetKey !== observedTargetKey) {
    observedTargetKey = currentTargetKey;
    copyFeedback = '';
    copyOperationRevision += 1;
  }

  async function synchronizeDialog(shouldOpen: boolean): Promise<void> {
    if (shouldOpen && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      await tick();
      closeButton?.focus({ preventScroll: true });
      return;
    }
    if (!shouldOpen && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }

  function focusableElements(): HTMLElement[] {
    return Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => !element.hasAttribute('hidden'));
  }

  function containTab(event: KeyboardEvent): void {
    const focusable = focusableElements();
    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (
      event.shiftKey &&
      (document.activeElement === first ||
        !dialog.contains(document.activeElement))
    ) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === last ||
        !dialog.contains(document.activeElement))
    ) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose('escape');
    } else if (event.key === 'Tab') containTab(event);
    else if (
      [
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        'PageUp',
        'PageDown',
        'Home',
        'End',
      ].includes(event.key)
    ) {
      event.stopPropagation();
    }
  }

  function handleCancel(event: Event): void {
    event.preventDefault();
    onClose('escape');
  }

  async function handleCopySource(text: string): Promise<void> {
    const operationRevision = ++copyOperationRevision;
    const targetKey = currentTargetKey;
    const result = await copySourceText(text);
    if (
      operationRevision !== copyOperationRevision ||
      targetKey !== currentTargetKey ||
      !open ||
      !presentation?.sourceAvailable
    ) {
      return;
    }
    copyFeedback = result.succeeded
      ? 'Copied source'
      : result.reason === 'unavailable'
        ? 'Copy unavailable'
        : "Couldn't copy source";
  }
</script>

<dialog
  bind:this={dialog}
  id={SOURCE_VIEW_DIALOG_ID}
  class="source-view-dialog"
  aria-modal="true"
  aria-labelledby="source-view-title"
  aria-describedby="source-view-location"
  tabindex="-1"
  oncancel={handleCancel}
  onkeydown={handleKeydown}
>
  {#if presentation}
    <div class="dialog-frame">
      <header class="dialog-header">
        <div>
          <p class="eyebrow">
            Retained {presentation.syntax?.toUpperCase()} source
          </p>
          <h2 id="source-view-title">{presentation.displayName}</h2>
          <p class="node-kind">{presentation.nodeKindLabel}</p>
        </div>
        <div class="dialog-actions">
          {#if presentation.fragments.length === 1}
            <button
              class="copy-action"
              type="button"
              data-copy-source
              onclick={() =>
                void handleCopySource(presentation.fragments[0]!.text)}
            >
              Copy source
            </button>
          {/if}
          <button
            bind:this={closeButton}
            class="close-action"
            type="button"
            aria-label={`Close source for ${presentation.displayName}`}
            onclick={() => onClose('close')}
          >
            Close
          </button>
        </div>
      </header>

      <div class="dialog-content">
        <section class="source-summary" aria-label="Source location">
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
          <p id="source-view-location">
            <strong>Location:</strong>
            {presentation.location.label}
          </p>
        </section>

        <p
          class="copy-status"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {copyFeedback}
        </p>

        <div class="source-fragments">
          {#each presentation.fragments as fragment, index (fragment.id)}
            <section
              class="source-fragment"
              aria-labelledby={`source-fragment-${index + 1}`}
            >
              <header class="fragment-header">
                <div>
                  <h3 id={`source-fragment-${index + 1}`}>
                    {presentation.fragments.length === 1
                      ? 'Retained declaration'
                      : `Retained fragment ${index + 1}`}
                  </h3>
                  <p>{fragment.location.label}</p>
                </div>
                {#if presentation.fragments.length > 1}
                  <button
                    class="copy-action fragment-copy-action"
                    type="button"
                    data-copy-source-fragment={index + 1}
                    aria-label={`Copy source fragment ${index + 1} for ${presentation.displayName}`}
                    onclick={() => void handleCopySource(fragment.text)}
                  >
                    Copy source
                  </button>
                {/if}
              </header>
              <!-- svelte-ignore a11y_no_noninteractive_tabindex (the retained source reading region must be keyboard-scrollable) -->
              <pre
                tabindex="0"
                aria-label={`${presentation.fragments.length === 1 ? 'Retained source' : `Retained source fragment ${index + 1}`} for ${presentation.displayName}`}
                data-source-reading-region><code>{fragment.text}</code></pre>
            </section>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</dialog>

<style>
  .source-view-dialog {
    width: min(1120px, calc(100vw - 2 * var(--space-6)));
    max-width: 100%;
    height: min(840px, calc(100dvh - 2 * var(--space-6)));
    max-height: calc(100dvh - 2 * var(--space-6));
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--colour-border-strong);
    border-radius: var(--radius-card);
    background: var(--colour-panel-raised);
    color: var(--colour-text);
    box-shadow: var(--shadow-focus);
  }

  .source-view-dialog::backdrop {
    background: rgb(23 33 43 / 58%);
  }

  .dialog-frame {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    height: 100%;
    max-height: inherit;
    overflow: hidden;
  }

  .dialog-actions {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    min-width: 0;
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--colour-border-subtle);
  }

  .dialog-header > div,
  .dialog-content,
  .source-summary,
  .source-fragment {
    min-width: 0;
  }

  h2,
  h3,
  p {
    margin: 0;
  }

  .eyebrow {
    margin-bottom: var(--space-1);
    color: var(--colour-accent);
    font-size: var(--font-size-xs);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  h2 {
    overflow-wrap: anywhere;
    font-size: var(--font-size-xl);
    line-height: 1.25;
  }

  .node-kind {
    margin-top: var(--space-1);
    color: var(--colour-text-secondary);
    font-size: var(--font-size-sm);
  }

  .close-action,
  .copy-action {
    flex: 0 0 auto;
    min-width: var(--control-min-size);
    min-height: var(--control-min-size);
    padding: 0 var(--space-4);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-medium);
    background: var(--colour-panel);
    color: var(--colour-text);
    font-weight: 700;
    cursor: pointer;
  }

  .close-action:hover,
  .copy-action:hover {
    border-color: var(--colour-accent);
    color: var(--colour-accent);
  }

  .close-action:focus-visible,
  .copy-action:focus-visible,
  pre:focus-visible {
    outline: 3px solid var(--colour-focus-ring);
    outline-offset: 2px;
  }

  .dialog-content {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: var(--space-4);
    padding: var(--space-5);
    overflow: hidden;
  }

  .copy-status {
    min-height: 1.25em;
    color: var(--colour-text-secondary);
    font-size: var(--font-size-sm);
    font-weight: 700;
  }

  .source-summary {
    display: grid;
    gap: var(--space-1);
    padding: var(--space-3) var(--space-4);
    border-left: 4px solid var(--colour-accent);
    border-radius: var(--radius-medium);
    background: var(--colour-accent-soft);
    color: var(--colour-text-secondary);
    overflow-wrap: anywhere;
  }

  .source-summary strong {
    color: var(--colour-text);
  }

  .source-identity span {
    font-family: var(--font-code);
  }

  .source-fragments {
    display: grid;
    gap: var(--space-4);
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .source-fragment {
    display: grid;
    grid-template-rows: auto minmax(10rem, 1fr);
    min-height: min(28rem, 100%);
    overflow: hidden;
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-medium);
    background: var(--colour-code-surface);
  }

  .fragment-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--colour-border);
    background: var(--colour-panel-subtle);
  }

  .fragment-header > div {
    display: grid;
    min-width: 0;
    gap: var(--space-1);
  }

  .fragment-header h3 {
    font-size: var(--font-size-sm);
  }

  .fragment-header p {
    color: var(--colour-text-secondary);
    font-size: var(--font-size-xs);
    text-align: right;
  }

  .fragment-copy-action {
    flex: 0 0 auto;
  }

  pre {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    min-height: 0;
    margin: 0;
    overflow: auto;
    padding: var(--space-4);
    background: var(--colour-code-surface);
    color: var(--colour-code-text);
    white-space: pre;
    tab-size: 2;
  }

  code {
    font-family: var(--font-code);
    font-size: var(--font-size-sm);
    line-height: 1.55;
  }

  @media (max-width: 699px) {
    .source-view-dialog {
      width: calc(100vw - 2 * var(--space-2));
      height: calc(100dvh - 2 * var(--space-2));
      max-height: calc(100dvh - 2 * var(--space-2));
    }

    .dialog-header,
    .dialog-content {
      padding: var(--space-3);
    }

    .dialog-header {
      align-items: flex-start;
      flex-wrap: wrap;
    }

    .fragment-header {
      display: grid;
    }

    .fragment-copy-action {
      justify-self: start;
    }

    .fragment-header p {
      text-align: left;
    }
  }

  @media (orientation: landscape) and (max-height: 320px) {
    .source-view-dialog {
      height: calc(100dvh - 2 * var(--space-1));
      max-height: calc(100dvh - 2 * var(--space-1));
    }

    .dialog-header {
      padding-block: var(--space-2);
    }

    .dialog-content {
      gap: var(--space-2);
      padding-block: var(--space-2);
    }

    .source-summary {
      padding-block: var(--space-2);
    }
  }

  @media (forced-colors: active) {
    .source-view-dialog,
    .source-fragment,
    .fragment-header,
    .source-summary {
      border-color: CanvasText;
    }

    .source-summary,
    .fragment-header,
    pre {
      background: Canvas;
      color: CanvasText;
    }

    .close-action,
    .copy-action {
      border-color: ButtonText;
      background: ButtonFace;
      color: ButtonText;
    }

    .close-action:focus-visible,
    .copy-action:focus-visible,
    pre:focus-visible {
      outline-color: Highlight;
    }
  }
</style>
