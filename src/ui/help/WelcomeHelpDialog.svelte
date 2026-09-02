<script module lang="ts">
  export type WelcomeHelpCloseReason = 'close' | 'escape' | 'start';
</script>

<script lang="ts">
  import { tick } from 'svelte';
  import {
    builtInSampleCatalog,
    type BuiltInSampleId,
  } from '../../schema/samples/sampleCatalog';

  export let open = false;
  export let sampleActionsDisabled = false;
  export let sampleError: string | undefined = undefined;
  export let suppressAutomaticWelcome = false;
  export let onClose: (reason: WelcomeHelpCloseReason) => void = () => {};
  export let onLoadSample: (sampleId: BuiltInSampleId) => void = () => {};

  let dialog: HTMLDialogElement;
  let closeButton: HTMLButtonElement;

  $: if (dialog) {
    void synchronizeDialog(open);
  }

  async function synchronizeDialog(shouldOpen: boolean): Promise<void> {
    if (shouldOpen && !dialog.open) {
      if (typeof dialog.showModal === 'function') {
        dialog.showModal();
      } else {
        dialog.setAttribute('open', '');
      }
      await tick();
      closeButton?.focus({ preventScroll: true });
      return;
    }
    if (!shouldOpen && dialog.open) {
      if (typeof dialog.close === 'function') {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
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
      return;
    }
    if (event.key === 'Tab') {
      containTab(event);
      return;
    }
    if (
      event.key === 'ArrowLeft' ||
      event.key === 'ArrowRight' ||
      event.key === 'ArrowUp' ||
      event.key === 'ArrowDown'
    ) {
      event.stopPropagation();
    }
  }

  function handleCancel(event: Event): void {
    event.preventDefault();
    onClose('escape');
  }
</script>

<dialog
  bind:this={dialog}
  class="welcome-help-dialog"
  aria-modal="true"
  aria-labelledby="welcome-help-title"
  aria-describedby="welcome-help-description welcome-help-privacy welcome-help-instructions"
  tabindex="-1"
  oncancel={handleCancel}
  onkeydown={handleKeydown}
>
  <div class="dialog-frame">
    <header class="dialog-header">
      <div>
        <p class="eyebrow">Welcome and Help</p>
        <h2 id="welcome-help-title">Welcome to XML Carousel</h2>
      </div>
      <button
        bind:this={closeButton}
        class="close-action"
        type="button"
        aria-label="Close XML Carousel help"
        onclick={() => onClose('close')}
      >
        Close
      </button>
    </header>

    <div class="dialog-content">
      <p id="welcome-help-description" class="product-description">
        XML Carousel is a browser-based explorer for DTD files, XML Schema / XSD
        files, standalone RELAX NG XML-syntax files, and ZIP packages containing
        DTD, XSD, or RELAX NG XML-syntax schema files.
      </p>

      <p id="welcome-help-privacy" class="privacy-statement">
        <strong>Your schema files stay in your browser.</strong>
        XML Carousel does not upload them to a server.
      </p>

      <section id="welcome-help-instructions" aria-labelledby="navigation-help">
        <h3 id="navigation-help">Move through a schema</h3>
        <ul>
          <li>Click a card to centre it.</li>
          <li>
            Use <strong>Inspect</strong> to open details without changing carousel
            focus.
          </li>
          <li>
            Drag horizontally or use the arrow keys to move rootward and
            leafward.
          </li>
          <li>Use Up and Down to select a leafward branch.</li>
          <li>
            Right enters the first or selected leafward destination; Left
            returns toward the previous journey step.
          </li>
          <li>Search jumps to declarations.</li>
        </ul>
      </section>

      <section class="sample-section" aria-labelledby="sample-help">
        <h3 id="sample-help">Try a built-in sample</h3>
        {#if sampleActionsDisabled}
          <p id="sample-import-note" class="sample-note">
            Finish or cancel the current import before loading a sample.
          </p>
        {/if}
        {#if sampleError}
          <p class="sample-error" role="alert">{sampleError}</p>
        {/if}
        <div class="sample-list">
          {#each builtInSampleCatalog as sample (sample.id)}
            <article class="sample-option">
              <div>
                <h4>{sample.displayName}</h4>
                <p>{sample.description}</p>
              </div>
              <button
                class="sample-action"
                type="button"
                disabled={sampleActionsDisabled}
                aria-describedby={sampleActionsDisabled
                  ? 'sample-import-note'
                  : undefined}
                onclick={() => onLoadSample(sample.id)}
              >
                Load sample {sample.format.toUpperCase()}
              </button>
            </article>
          {/each}
        </div>
      </section>

      <section aria-labelledby="standards-licensing-help">
        <h3 id="standards-licensing-help">Validation and licences</h3>
        <p>
          Apache Xerces-C++ is the authoritative XML, DTD, and XML Schema 1.0
          validator. libxml2 RELAX NG is the authoritative standalone and
          ZIP-package .rng validator. XML Carousel resolves only safely supplied
          package dependencies and does not retrieve remote or host-filesystem
          dependencies; structural RELAX NG visualization is not available yet.
        </p>
        <p>
          Read the bundled <a href="./LICENSE.txt">XML Carousel licence</a>
          and <a href="./THIRD_PARTY_NOTICES.txt">third-party notices</a>.
        </p>
      </section>
    </div>

    <footer class="dialog-footer">
      <label class="welcome-preference">
        <input type="checkbox" bind:checked={suppressAutomaticWelcome} />
        <span>Don't Show This Again</span>
      </label>
      <button
        class="start-action"
        type="button"
        onclick={() => onClose('start')}
      >
        Start exploring
      </button>
    </footer>
  </div>
</dialog>

<style>
  .welcome-help-dialog {
    width: min(720px, calc(100vw - 2 * var(--space-4)));
    max-width: 100%;
    max-height: calc(100dvh - 2 * var(--space-4));
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--colour-border-strong);
    border-radius: var(--radius-card);
    background: var(--colour-panel-raised);
    color: var(--colour-text);
    box-shadow: var(--shadow-focus);
  }

  .welcome-help-dialog::backdrop {
    background: rgb(23 33 43 / 58%);
  }

  .dialog-frame {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    max-height: calc(100dvh - 2 * var(--space-4));
    overflow: hidden;
  }

  .dialog-header,
  .dialog-footer {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-4) var(--space-5);
    background: var(--colour-panel-raised);
  }

  .dialog-header {
    justify-content: space-between;
    border-bottom: 1px solid var(--colour-border-subtle);
  }

  .dialog-footer {
    justify-content: space-between;
    flex-wrap: wrap;
    border-top: 1px solid var(--colour-border-subtle);
  }

  .welcome-preference {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--control-min-size);
    padding-inline: var(--space-2);
    font-weight: 600;
    cursor: pointer;
  }

  .welcome-preference input {
    width: 20px;
    height: 20px;
    margin: 0;
    accent-color: var(--colour-accent);
  }

  .welcome-preference input:focus-visible {
    outline: var(--focus-ring-width) solid var(--colour-focus);
    outline-offset: var(--focus-ring-offset);
  }

  .dialog-content {
    min-width: 0;
    padding: var(--space-5);
    overflow: auto;
    overscroll-behavior: contain;
  }

  .eyebrow {
    margin: 0 0 var(--space-1);
    color: var(--colour-accent);
    font-size: var(--font-size-xs);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  h2,
  h3,
  h4 {
    margin: 0;
  }

  h2 {
    font-size: var(--font-size-xl);
  }

  h3 {
    margin-bottom: var(--space-2);
    font-size: var(--font-size-lg);
  }

  h4 {
    font-size: var(--font-size-base);
  }

  .product-description {
    font-size: var(--font-size-md);
  }

  .privacy-statement {
    padding: var(--space-3) var(--space-4);
    border-left: 4px solid var(--colour-info);
    border-radius: var(--radius-medium);
    background: var(--colour-info-soft);
  }

  section {
    margin-top: var(--space-5);
  }

  ul {
    margin: 0;
    padding-left: var(--space-5);
  }

  li + li {
    margin-top: var(--space-1);
  }

  a {
    color: var(--colour-accent);
  }

  a:focus-visible {
    outline: var(--focus-ring-width) solid var(--colour-focus);
    outline-offset: var(--focus-ring-offset);
  }

  .sample-note,
  .sample-error {
    margin-bottom: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-medium);
  }

  .sample-note {
    background: var(--colour-warning-soft);
    color: var(--colour-text);
  }

  .sample-error {
    background: var(--colour-error-soft);
    color: var(--colour-error);
  }

  .sample-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-3);
  }

  .sample-option {
    display: grid;
    align-content: space-between;
    gap: var(--space-3);
    min-width: 0;
    padding: var(--space-4);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-large);
    background: var(--colour-panel-subtle);
  }

  .sample-option p {
    margin: var(--space-1) 0 0;
    color: var(--colour-text-secondary);
    font-size: var(--font-size-sm);
  }

  button {
    min-width: var(--control-min-size);
    min-height: var(--control-min-size);
    padding: 0 var(--space-4);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-medium);
    background: var(--colour-panel);
    color: var(--colour-text);
    font-weight: 600;
    cursor: pointer;
  }

  button:not(:disabled):hover {
    border-color: var(--colour-accent);
    color: var(--colour-accent);
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.68;
  }

  .sample-action,
  .start-action {
    border-color: var(--colour-accent);
    background: var(--colour-accent);
    color: var(--colour-text-inverse);
  }

  .sample-action:not(:disabled):hover,
  .start-action:hover {
    border-color: var(--colour-accent-hover);
    background: var(--colour-accent-hover);
    color: var(--colour-text-inverse);
  }

  @media (max-width: 599px) {
    .welcome-help-dialog {
      width: calc(100vw - 2 * var(--space-2));
      max-height: calc(100dvh - 2 * var(--space-2));
    }

    .dialog-frame {
      max-height: calc(100dvh - 2 * var(--space-2));
    }

    .dialog-header,
    .dialog-footer,
    .dialog-content {
      padding: var(--space-3);
    }

    .sample-list {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (orientation: landscape) and (max-height: 300px) {
    .welcome-help-dialog,
    .dialog-frame {
      max-height: calc(100dvh - 2 * var(--space-1));
    }

    .dialog-header,
    .dialog-footer {
      padding-block: var(--space-2);
    }

    .dialog-content {
      padding-block: var(--space-3);
    }
  }
</style>
