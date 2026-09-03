<script lang="ts">
  import { tick } from 'svelte';
  import type { SchemaDiagnosticReport } from '../../app/import/schemaDiagnosticReport';
  import {
    formatFailedImportSummary,
    formatFailureClassifications,
    formatSeveritySummary,
    groupProblemReportDiagnostics,
    PROBLEM_REPORT_DIALOG_ID,
    presentDiagnosticCategory,
    presentDiagnosticSeverity,
    presentDiagnosticSource,
    shouldShowGroupHeadings,
  } from './problemReportPresentation';

  export let open = false;
  export let report: SchemaDiagnosticReport | undefined = undefined;
  export let hasActiveProject = false;
  export let onClose: (reason: 'close' | 'escape') => void = () => {};

  let dialog: HTMLDialogElement;
  let closeButton: HTMLButtonElement;

  $: groups = report ? groupProblemReportDiagnostics(report) : [];
  $: showGroupHeadings = report
    ? shouldShowGroupHeadings(report, groups)
    : false;
  $: classifications = report
    ? formatFailureClassifications(report)
    : undefined;
  $: if (dialog) void synchronizeDialog(open && report !== undefined);

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
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
    )
      event.stopPropagation();
  }

  function handleCancel(event: Event): void {
    event.preventDefault();
    onClose('escape');
  }
</script>

<dialog
  bind:this={dialog}
  id={PROBLEM_REPORT_DIALOG_ID}
  class="problem-report-dialog"
  aria-modal="true"
  aria-labelledby="problem-report-title"
  aria-describedby="problem-report-summary"
  tabindex="-1"
  oncancel={handleCancel}
  onkeydown={handleKeydown}
>
  {#if report}
    <div class="dialog-frame">
      <header class="dialog-header">
        <div>
          <p class="eyebrow">Import problems</p>
          <h2 id="problem-report-title">
            Problems in {report.attemptedFileName}
          </h2>
        </div>
        <button
          bind:this={closeButton}
          class="close-action"
          type="button"
          aria-label={`Close problems for ${report.attemptedFileName}`}
          onclick={() => onClose('close')}>Close</button
        >
      </header>

      <!-- svelte-ignore a11y_no_noninteractive_tabindex (The scrollable report must support keyboard reading.) -->
      <div
        class="dialog-content"
        role="region"
        aria-label="Problem details"
        tabindex="0"
      >
        <section id="problem-report-summary" class="report-summary">
          <p class="severity-summary">{formatSeveritySummary(report)}</p>
          {#if classifications}
            <p><strong>Failure classification:</strong> {classifications}.</p>
          {/if}
          <p>{formatFailedImportSummary(report)}</p>
          {#if hasActiveProject}
            <p>The previously loaded project remains open.</p>
          {/if}
        </section>

        <div class="diagnostic-groups">
          {#each groups as group (group.id)}
            <section
              class:grouped={showGroupHeadings}
              class="diagnostic-group"
              aria-labelledby={showGroupHeadings
                ? `problem-${group.id}`
                : undefined}
            >
              {#if showGroupHeadings}
                <h3 id={`problem-${group.id}`}>{group.label}</h3>
              {/if}
              <ol class="diagnostic-list">
                {#each group.diagnostics as diagnostic (diagnostic.id)}
                  <li class={`diagnostic-item severity-${diagnostic.severity}`}>
                    <span class="severity"
                      >{presentDiagnosticSeverity(diagnostic.severity)}</span
                    >
                    <p class="diagnostic-message">{diagnostic.message}</p>
                    {#if diagnostic.line !== undefined || diagnostic.column !== undefined || diagnostic.code || diagnostic.source || diagnostic.category || diagnostic.relatedNodeId}
                      <dl class="diagnostic-metadata">
                        {#if diagnostic.line !== undefined}<div>
                            <dt>Line&nbsp;</dt>
                            <dd>{diagnostic.line}</dd>
                          </div>{/if}
                        {#if diagnostic.column !== undefined}<div>
                            <dt>Column&nbsp;</dt>
                            <dd>{diagnostic.column}</dd>
                          </div>{/if}
                        {#if diagnostic.code}<div>
                            <dt>Code&nbsp;</dt>
                            <dd>{diagnostic.code}</dd>
                          </div>{/if}
                        {#if diagnostic.category}<div>
                            <dt>Category&nbsp;</dt>
                            <dd>
                              {presentDiagnosticCategory(diagnostic.category)}
                            </dd>
                          </div>{/if}
                        {#if diagnostic.source}<div>
                            <dt>Source&nbsp;</dt>
                            <dd>
                              {presentDiagnosticSource(diagnostic.source)}
                            </dd>
                          </div>{/if}
                        {#if diagnostic.relatedNodeId}<div>
                            <dt>Related component&nbsp;</dt>
                            <dd>{diagnostic.relatedNodeId}</dd>
                          </div>{/if}
                      </dl>
                    {/if}
                  </li>
                {/each}
              </ol>
            </section>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</dialog>

<style>
  .problem-report-dialog {
    width: min(880px, calc(100vw - 2 * var(--space-4)));
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
  .problem-report-dialog::backdrop {
    background: rgb(23 33 43 / 58%);
  }
  .dialog-frame {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    max-height: calc(100dvh - 2 * var(--space-4));
    overflow: hidden;
  }
  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--colour-border-subtle);
    background: var(--colour-panel-raised);
  }
  .dialog-header > div,
  .dialog-content,
  .diagnostic-group,
  .diagnostic-item {
    min-width: 0;
  }
  .eyebrow {
    margin: 0 0 var(--space-1);
    color: var(--colour-error);
    font-size: var(--font-size-xs);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  h2,
  h3,
  p,
  dl,
  ol {
    margin: 0;
  }
  h2 {
    overflow-wrap: anywhere;
    font-size: var(--font-size-xl);
    line-height: 1.25;
  }
  h3 {
    overflow-wrap: anywhere;
    font-size: var(--font-size-md);
  }
  .close-action {
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
  .close-action:hover {
    border-color: var(--colour-accent);
    color: var(--colour-accent);
  }
  .dialog-content {
    padding: var(--space-5);
    overflow: auto;
    overscroll-behavior: contain;
  }
  .report-summary {
    padding: var(--space-4);
    border-left: 4px solid var(--colour-error);
    border-radius: var(--radius-medium);
    background: var(--colour-error-soft);
  }
  .report-summary p + p {
    margin-top: var(--space-1);
  }
  .severity-summary {
    font-weight: 700;
  }
  .diagnostic-groups {
    display: grid;
    gap: var(--space-5);
    margin-top: var(--space-5);
  }
  .diagnostic-group.grouped {
    display: grid;
    gap: var(--space-3);
  }
  .diagnostic-list {
    display: grid;
    gap: var(--space-3);
    padding: 0;
    list-style: none;
  }
  .diagnostic-item {
    padding: var(--space-4);
    overflow-wrap: anywhere;
    border: 1px solid var(--colour-border);
    border-left-width: 4px;
    border-radius: var(--radius-large);
    background: var(--colour-panel);
  }
  .severity-error {
    border-left-color: var(--colour-error);
  }
  .severity-warning {
    border-left-color: var(--colour-warning);
  }
  .severity-info {
    border-left-color: var(--colour-info);
  }
  .severity {
    font-weight: 700;
  }
  .diagnostic-message {
    margin-top: var(--space-2);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .diagnostic-metadata {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-4);
    margin-top: var(--space-3);
    color: var(--colour-text-secondary);
    font-size: var(--font-size-sm);
  }
  .diagnostic-metadata div {
    display: inline-flex;
    min-width: 0;
    gap: var(--space-1);
  }
  .diagnostic-metadata dt {
    font-weight: 700;
  }
  .diagnostic-metadata dd {
    min-width: 0;
    margin: 0;
    font-family: var(--font-code);
    overflow-wrap: anywhere;
  }
  @media (max-width: 599px) {
    .problem-report-dialog {
      width: calc(100vw - 2 * var(--space-2));
      max-height: calc(100dvh - 2 * var(--space-2));
    }
    .dialog-frame {
      max-height: calc(100dvh - 2 * var(--space-2));
    }
    .dialog-header,
    .dialog-content {
      padding: var(--space-3);
    }
    .dialog-header {
      align-items: flex-start;
    }
    .diagnostic-item {
      padding: var(--space-3);
    }
  }
  @media (orientation: landscape) and (max-height: 300px) {
    .problem-report-dialog,
    .dialog-frame {
      max-height: calc(100dvh - 2 * var(--space-1));
    }
    .dialog-header {
      padding-block: var(--space-2);
    }
    .dialog-content {
      padding-block: var(--space-3);
    }
  }
</style>
