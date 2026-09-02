<script lang="ts">
  import type {
    SchemaFileFormat,
    SchemaFileImportOutcome,
    SchemaFileImportState,
    SchemaArchiveReadableFile,
    SchemaReadableFile,
  } from '../../app/import/schemaFileImportController';
  import xmlCarouselLogo from '../../assets/xml-carousel-logo.svg';
  import { PROBLEM_REPORT_DIALOG_ID } from '../problems/problemReportPresentation';
  import SchemaSearch from '../search/SchemaSearch.svelte';
  import type { SourceViewOrigin } from '../../app/stores/sourceViewStore';

  export let projectIdentity: string;
  export let projectStatus: string | undefined = undefined;
  export let projectAccessibleLabel = 'Active schema project';
  export let importState: SchemaFileImportState;
  export let isNavigationOpen = false;
  export let onOpenDtdFile: (
    file: SchemaReadableFile,
  ) => Promise<SchemaFileImportOutcome>;
  export let onOpenXsdFile: (
    file: SchemaReadableFile,
  ) => Promise<SchemaFileImportOutcome>;
  export let onOpenRngFile: (
    file: SchemaReadableFile,
  ) => Promise<SchemaFileImportOutcome> = async () => ({ status: 'stale' });
  export let onOpenZipFile: (
    file: SchemaArchiveReadableFile,
  ) => Promise<SchemaFileImportOutcome> = async () => ({ status: 'stale' });
  export let onToggleNavigation: () => void = () => {};
  export let onSearchIntent: () => void = () => {};
  export let retainedProblemCount: number | undefined = undefined;
  export let retainedProblemFilename: string | undefined = undefined;
  export let onOpenProblems: (origin: HTMLElement) => void = () => {};
  export let onOpenHelp: () => void = () => {};
  export let onOpenSource: (
    nodeId: string,
    origin: SourceViewOrigin,
    originElement: HTMLElement,
  ) => void = () => {};

  let dtdOpenButton: HTMLButtonElement;
  let xsdOpenButton: HTMLButtonElement;
  let rngOpenButton: HTMLButtonElement;
  let zipOpenButton: HTMLButtonElement;
  let navigationButton: HTMLButtonElement;
  let helpButton: HTMLButtonElement;
  let dtdFileInput: HTMLInputElement;
  let xsdFileInput: HTMLInputElement;
  let rngFileInput: HTMLInputElement;
  let zipFileInput: HTMLInputElement;

  $: activeImportFormat =
    importState.status === 'reading' || importState.status === 'processing'
      ? importState.format
      : undefined;
  $: isImporting = activeImportFormat !== undefined;
  $: retainedProblemAccessibleName =
    retainedProblemCount === undefined || retainedProblemFilename === undefined
      ? undefined
      : `Open retained problem report for ${retainedProblemFilename.trim() || 'selected file'}, ${retainedProblemCount} ${retainedProblemCount === 1 ? 'problem' : 'problems'}`;

  export function focusOpenButton(format: SchemaFileFormat = 'dtd'): void {
    (format === 'dtd'
      ? dtdOpenButton
      : format === 'xsd'
        ? xsdOpenButton
        : format === 'rng'
          ? rngOpenButton
          : zipOpenButton
    )?.focus();
  }

  function inputFor(format: SchemaFileFormat): HTMLInputElement {
    return format === 'dtd'
      ? dtdFileInput
      : format === 'xsd'
        ? xsdFileInput
        : format === 'rng'
          ? rngFileInput
          : zipFileInput;
  }

  export function focusNavigationToggle(): void {
    navigationButton?.focus({ preventScroll: true });
  }

  export function focusHelpButton(): void {
    helpButton?.focus({ preventScroll: true });
  }

  function openFilePicker(format: SchemaFileFormat): void {
    const input = inputFor(format);
    input.value = '';
    input.click();
  }

  async function handleFileSelection(
    format: SchemaFileFormat,
    event: Event,
  ): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';

    if (!file) {
      focusOpenButton(format);
      return;
    }

    await (format === 'dtd'
      ? onOpenDtdFile(file)
      : format === 'xsd'
        ? onOpenXsdFile(file)
        : format === 'rng'
          ? onOpenRngFile(file)
          : onOpenZipFile(file));
  }
</script>

<header class="top-bar">
  <h1 class="app-brand">
    <img class="app-logo" src={xmlCarouselLogo} alt="XML Carousel" />
  </h1>

  <div
    class="import-actions"
    role="group"
    aria-label="Open schema file or ZIP package"
  >
    <button
      bind:this={dtdOpenButton}
      class="primary-action"
      type="button"
      aria-busy={activeImportFormat === 'dtd' ? 'true' : undefined}
      aria-controls="dtd-file-input"
      disabled={isImporting}
      onclick={() => openFilePicker('dtd')}
      aria-label={activeImportFormat === 'dtd' ? 'Opening DTD' : 'Open DTD'}
    >
      <span class="full-import-label" aria-hidden="true">
        {activeImportFormat === 'dtd' ? 'Opening…' : 'Open DTD'}
      </span>
      <span class="compact-import-label" aria-hidden="true">
        {activeImportFormat === 'dtd' ? 'Opening…' : 'DTD'}
      </span>
    </button>
    <button
      bind:this={xsdOpenButton}
      class="primary-action secondary-import"
      type="button"
      aria-busy={activeImportFormat === 'xsd' ? 'true' : undefined}
      aria-controls="xsd-file-input"
      disabled={isImporting}
      onclick={() => openFilePicker('xsd')}
      aria-label={activeImportFormat === 'xsd' ? 'Opening XSD' : 'Open XSD'}
    >
      <span class="full-import-label" aria-hidden="true">
        {activeImportFormat === 'xsd' ? 'Opening…' : 'Open XSD'}
      </span>
      <span class="compact-import-label" aria-hidden="true">
        {activeImportFormat === 'xsd' ? 'Opening…' : 'XSD'}
      </span>
    </button>
    <button
      bind:this={rngOpenButton}
      class="primary-action secondary-import"
      type="button"
      aria-busy={activeImportFormat === 'rng' ? 'true' : undefined}
      aria-controls="rng-file-input"
      disabled={isImporting}
      onclick={() => openFilePicker('rng')}
      aria-label={activeImportFormat === 'rng' ? 'Opening RNG' : 'Open RNG'}
    >
      <span class="full-import-label" aria-hidden="true">
        {activeImportFormat === 'rng' ? 'Opening…' : 'Open RNG'}
      </span>
      <span class="compact-import-label" aria-hidden="true">
        {activeImportFormat === 'rng' ? 'Opening…' : 'RNG'}
      </span>
    </button>
    <button
      bind:this={zipOpenButton}
      class="primary-action secondary-import"
      type="button"
      aria-busy={activeImportFormat === 'zip' ? 'true' : undefined}
      aria-controls="zip-file-input"
      disabled={isImporting}
      onclick={() => openFilePicker('zip')}
      aria-label={activeImportFormat === 'zip' ? 'Opening ZIP' : 'Open ZIP'}
    >
      <span class="full-import-label" aria-hidden="true">
        {activeImportFormat === 'zip' ? 'Opening…' : 'Open ZIP'}
      </span>
      <span class="compact-import-label" aria-hidden="true">
        {activeImportFormat === 'zip' ? 'Opening…' : 'ZIP'}
      </span>
    </button>

    <label class="visually-hidden" for="dtd-file-input">Choose DTD file</label>
    <input
      bind:this={dtdFileInput}
      id="dtd-file-input"
      class="file-input"
      type="file"
      accept=".dtd,application/xml-dtd"
      tabindex="-1"
      hidden
      onchange={(event) => void handleFileSelection('dtd', event)}
    />
    <label class="visually-hidden" for="xsd-file-input">Choose XSD file</label>
    <input
      bind:this={xsdFileInput}
      id="xsd-file-input"
      class="file-input"
      type="file"
      accept=".xsd,application/xml,text/xml"
      tabindex="-1"
      hidden
      onchange={(event) => void handleFileSelection('xsd', event)}
    />
    <label class="visually-hidden" for="rng-file-input">Choose RNG file</label>
    <input
      bind:this={rngFileInput}
      id="rng-file-input"
      class="file-input"
      type="file"
      accept=".rng,application/xml,text/xml"
      tabindex="-1"
      hidden
      onchange={(event) => void handleFileSelection('rng', event)}
    />
    <label class="visually-hidden" for="zip-file-input"
      >Choose ZIP schema package</label
    >
    <input
      bind:this={zipFileInput}
      id="zip-file-input"
      class="file-input"
      type="file"
      accept=".zip,application/zip,application/x-zip-compressed"
      tabindex="-1"
      hidden
      onchange={(event) => void handleFileSelection('zip', event)}
    />
  </div>

  <div class="project-name" aria-label={projectAccessibleLabel}>
    <strong>{projectIdentity}</strong>
    {#if projectStatus}
      <span class="project-status">{projectStatus}</span>
    {/if}
  </div>

  <div class="search-owner" role="presentation" onpointerdown={onSearchIntent}>
    <SchemaSearch {onOpenSource} />
  </div>

  {#if retainedProblemAccessibleName && retainedProblemCount !== undefined}
    <button
      class="utility-action problems-action"
      type="button"
      aria-haspopup="dialog"
      aria-controls={PROBLEM_REPORT_DIALOG_ID}
      aria-label={retainedProblemAccessibleName}
      onclick={(event) => onOpenProblems(event.currentTarget)}
    >
      <span class="full-problems-label" aria-hidden="true"
        >Problems ({retainedProblemCount})</span
      >
      <span class="compact-problems-label" aria-hidden="true">
        <span>Problems</span>
        <span class="problem-count">({retainedProblemCount})</span>
      </span>
    </button>
  {/if}

  <button
    bind:this={helpButton}
    class="utility-action help-action"
    type="button"
    aria-label="Open XML Carousel help"
    onclick={onOpenHelp}
  >
    <span class="full-help-label" aria-hidden="true">Help</span>
    <span class="compact-help-label" aria-hidden="true">?</span>
  </button>

  <div class="compact-panel-controls" aria-label="Panel controls">
    <button
      bind:this={navigationButton}
      class="navigation-toggle"
      type="button"
      aria-expanded={isNavigationOpen}
      aria-controls="schema-navigation-panel"
      aria-label={isNavigationOpen
        ? 'Close schema navigation'
        : 'Open schema navigation'}
      onclick={onToggleNavigation}
    >
      <span class="full-navigation-label" aria-hidden="true">Navigation</span>
      <span class="compact-navigation-label" aria-hidden="true">Nav</span>
    </button>
    <button
      class="inspector-placeholder"
      type="button"
      disabled
      title="Inspector panel is unavailable"
    >
      Inspector
    </button>
  </div>
</header>

<style>
  .top-bar {
    grid-area: topbar;
    z-index: 30;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
    padding: 0 var(--space-5);
    overflow: visible;
    border-bottom: 1px solid var(--colour-border);
    background: var(--colour-panel);
  }

  .app-brand {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    margin: 0 var(--space-2) 0 0;
    line-height: 0;
  }

  .app-logo {
    display: block;
    width: auto;
    height: 30px;
  }

  button,
  input {
    height: var(--control-min-size);
    border-radius: var(--radius-medium);
  }

  button {
    padding: 0 var(--space-4);
    border: 1px solid var(--colour-border);
    background: var(--colour-panel);
    font-weight: 600;
  }

  .primary-action {
    min-inline-size: var(--control-min-size);
    inline-size: max-content;
    border-color: var(--colour-accent);
    background: var(--colour-accent);
    color: var(--colour-text-inverse);
    cursor: pointer;
  }

  .primary-action:disabled {
    border-color: var(--colour-border);
    background: var(--colour-panel-subtle);
    color: var(--colour-text-secondary);
  }

  .primary-action:not(:disabled):hover {
    border-color: var(--colour-accent-hover);
    background: var(--colour-accent-hover);
  }

  .primary-action:not(:disabled):active {
    border-color: var(--colour-accent-active);
    background: var(--colour-accent-active);
  }

  .import-actions {
    display: flex;
    flex: 0 0 auto;
    gap: var(--space-2);
    min-width: 0;
  }

  .secondary-import {
    border-color: var(--colour-accent);
    background: var(--colour-panel);
    color: var(--colour-accent);
  }

  .secondary-import:not(:disabled):hover {
    color: var(--colour-text-inverse);
  }

  button:disabled,
  input:disabled {
    cursor: not-allowed;
    opacity: 0.72;
  }

  .project-name {
    display: grid;
    min-width: 0;
    flex: 1 1 auto;
    align-content: center;
    gap: 0;
    overflow: hidden;
    color: var(--colour-text-secondary);
    white-space: nowrap;
  }

  .project-name strong,
  .project-status {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .project-name strong {
    color: var(--colour-text);
    font-size: var(--font-size-sm);
  }

  .project-status {
    color: var(--colour-text-muted);
    font-size: var(--font-size-xs);
  }

  .search-owner {
    display: contents;
  }

  .compact-import-label,
  .compact-navigation-label,
  .compact-help-label,
  .compact-problems-label {
    display: none;
  }

  .problems-action {
    display: inline-flex;
    min-width: var(--control-min-size);
    min-height: var(--control-min-size);
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    border-color: var(--colour-error);
    color: var(--colour-error);
    line-height: 1.2;
    white-space: nowrap;
    cursor: pointer;
  }

  .problems-action:hover {
    background: var(--colour-error-soft);
  }

  .problems-action:active {
    border-color: var(--colour-error);
    background: var(--colour-error-soft);
  }

  .compact-problems-label {
    align-items: center;
    gap: var(--space-1);
  }

  .problem-count {
    font-variant-numeric: tabular-nums;
  }

  .help-action {
    flex: 0 0 auto;
    cursor: pointer;
  }

  .help-action:hover {
    border-color: var(--colour-accent);
    color: var(--colour-accent);
  }

  .help-action:active {
    background: var(--colour-accent-soft);
  }

  .compact-panel-controls {
    display: none;
    gap: var(--space-2);
  }

  .navigation-toggle {
    display: inline-flex;
    min-width: var(--control-min-size);
    min-height: var(--control-min-size);
    align-items: center;
    justify-content: center;
    line-height: 1.2;
    text-align: center;
  }

  .navigation-toggle > span {
    align-items: center;
    justify-content: center;
    line-height: inherit;
    text-align: center;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .file-input {
    display: none;
  }

  @media (max-width: 1279px) {
    .compact-panel-controls,
    .navigation-toggle {
      display: flex;
    }

    .inspector-placeholder {
      display: none;
    }
  }

  @media (max-width: 1100px) {
    .full-import-label {
      display: none;
    }

    .compact-import-label {
      display: inline;
    }

    .full-help-label {
      display: none;
    }

    .compact-help-label {
      display: inline;
      font-size: var(--font-size-lg);
    }

    .full-problems-label {
      display: none;
    }

    .compact-problems-label {
      display: inline-flex;
    }
  }

  @media (max-width: 899px) {
    .app-brand,
    .project-name,
    .inspector-placeholder {
      display: none;
    }

    .compact-panel-controls {
      margin-left: auto;
    }
  }

  @media (max-width: 699px) {
    .top-bar {
      gap: var(--space-2);
      padding-inline: var(--space-3);
    }

    .app-brand {
      margin-right: 0;
    }

    .app-logo {
      height: 24px;
    }

    button {
      padding-inline: var(--space-2);
      font-size: var(--font-size-sm);
    }

    .project-name {
      min-width: 44px;
      overflow: hidden;
      font-family: var(--font-code);
      font-size: var(--font-size-sm);
      text-overflow: ellipsis;
    }
  }

  @media (max-width: 389px) {
    .app-logo {
      height: 20px;
    }

    .top-bar {
      gap: var(--space-1);
      padding-inline: var(--space-2);
    }

    .import-actions {
      gap: var(--space-1);
    }

    button {
      padding-inline: var(--space-1);
    }

    .full-navigation-label {
      display: none;
    }

    .compact-navigation-label {
      display: inline-flex;
    }

    .inspector-placeholder {
      display: none;
    }
  }

  @media (max-width: 479px) {
    .top-bar {
      gap: var(--space-1);
      padding-inline: var(--space-2);
    }

    .app-brand,
    .project-name {
      display: none;
    }

    .import-actions {
      gap: var(--space-1);
    }

    .problems-action {
      padding-inline: 0;
    }

    .compact-problems-label {
      flex-direction: column;
      gap: 0;
      line-height: 1;
    }

    .full-navigation-label {
      display: none;
    }

    .compact-navigation-label {
      display: inline-flex;
    }
  }
</style>
