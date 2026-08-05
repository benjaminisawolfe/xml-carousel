<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import {
    createSchemaFileImportController,
    type SchemaArchiveReadableFile,
    type SchemaFileFormat,
    type SchemaFileImportOutcome,
    type SchemaReadableFile,
  } from '../../app/import/schemaFileImportController';
  import { activeProjectStore } from '../../app/stores/projectStore';
  import { projectSessionResetStore } from '../../app/stores/projectSessionResetStore';
  import { activateBuiltInSample } from '../../app/samples/sampleActivation';
  import { createWelcomePreference } from '../../app/welcome/welcomePreference';
  import type { BuiltInSampleId } from '../../schema/samples/sampleCatalog';
  import WelcomeHelpDialog from '../help/WelcomeHelpDialog.svelte';
  import ProblemReportDialog from '../problems/ProblemReportDialog.svelte';
  import { formatSchemaPackageStatus } from '../presentation/schemaSetOutlinePresentation';
  import { presentSchemaImportProgress } from '../presentation/schemaImportProgressPresentation';
  import CarouselRegion from './CarouselRegion.svelte';
  import ImportErrorAlert from './ImportErrorAlert.svelte';
  import ImportProgress from './ImportProgress.svelte';
  import ImportWarningNotice from './ImportWarningNotice.svelte';
  import InspectorPanel from './InspectorPanel.svelte';
  import LeftPanel from './LeftPanel.svelte';
  import TopBar from './TopBar.svelte';

  const importController = createSchemaFileImportController();
  const welcomePreference = createWelcomePreference();
  const importState = importController.state;
  const diagnosticReport = importController.diagnosticReport;
  let topBar: TopBar;
  let isNavigationOpen = false;
  let isHelpOpen = false;
  let helpOpenOrigin: 'automatic' | 'help' = 'automatic';
  let suppressAutomaticWelcome = false;
  let automaticWelcomeCompleted = false;
  let sampleError: string | undefined;
  let observedProjectResetRevision = -1;
  let isProblemReportOpen = false;
  let problemReportAttemptId: string | undefined;
  let problemReportOrigin: HTMLElement | undefined;
  let problemReportFormat: SchemaFileFormat | undefined;

  $: projectIdentity =
    $activeProjectStore.origin === 'package'
      ? ($activeProjectStore.schemaPackageManifest?.archiveFilename ??
        $activeProjectStore.sourceFilename)
      : $activeProjectStore.sourceFilename;
  $: projectStatus =
    $activeProjectStore.origin === 'package'
      ? formatSchemaPackageStatus(
          $activeProjectStore.schemaPackageSources?.length ?? 0,
          $activeProjectStore.unresolvedReferences?.length ?? 0,
        )
      : undefined;
  $: projectAccessibleLabel = projectStatus
    ? `Current schema package: ${projectIdentity}. ${projectStatus.replace(
        ' · ',
        '. ',
      )}.`
    : `Current schema project: ${projectIdentity}.`;
  $: importProgressPresentation =
    $importState.status === 'reading' || $importState.status === 'processing'
      ? presentSchemaImportProgress($importState)
      : undefined;
  $: currentImportPhase =
    $importState.status === 'reading'
      ? 'reading'
      : $importState.status === 'processing'
        ? $importState.progress.phase
        : undefined;
  $: isImporting =
    $importState.status === 'reading' || $importState.status === 'processing';
  $: showPersistentProblems =
    $diagnosticReport !== undefined && $importState.status !== 'failure';
  $: if ($projectSessionResetStore.revision !== observedProjectResetRevision) {
    observedProjectResetRevision = $projectSessionResetStore.revision;
    isNavigationOpen = false;
  }
  $: if (
    isProblemReportOpen &&
    (!$diagnosticReport ||
      $diagnosticReport.attemptId !== problemReportAttemptId)
  ) {
    void closeProblemReport(true);
  }

  onMount(() => {
    if (automaticWelcomeCompleted) return;
    automaticWelcomeCompleted = true;
    const persistedDismissal = welcomePreference.readPersistedDismissal();
    suppressAutomaticWelcome = persistedDismissal;
    if (!persistedDismissal) {
      helpOpenOrigin = 'automatic';
      isHelpOpen = true;
    }
  });

  onDestroy(() => importController.destroy());

  async function dismissImportFailure(): Promise<void> {
    if ($importState.status !== 'failure') return;
    const format: SchemaFileFormat = $importState.format;
    importController.dismissFailure();
    await tick();
    topBar.focusOpenButton(format);
  }

  function openProblemReport(origin: HTMLElement): void {
    if (!$diagnosticReport) return;
    problemReportAttemptId = $diagnosticReport.attemptId;
    problemReportOrigin = origin;
    problemReportFormat = $diagnosticReport.format;
    isProblemReportOpen = true;
  }

  async function closeProblemReport(restoreFocus: boolean): Promise<void> {
    if (!isProblemReportOpen) return;
    const origin = problemReportOrigin;
    const format = problemReportFormat;
    isProblemReportOpen = false;
    problemReportAttemptId = undefined;
    problemReportOrigin = undefined;
    problemReportFormat = undefined;
    await tick();
    if (!restoreFocus) return;
    if (origin?.isConnected) origin.focus({ preventScroll: true });
    else if (format) topBar.focusOpenButton(format);
  }

  function dismissImportWarning(): void {
    importController.dismissWarning();
  }

  async function cancelImport(): Promise<void> {
    if (
      $importState.status !== 'reading' &&
      $importState.status !== 'processing'
    ) {
      return;
    }
    const format: SchemaFileFormat = $importState.format;
    if (!importController.cancel()) return;
    await tick();
    topBar.focusOpenButton(format);
  }

  async function openNavigation(): Promise<void> {
    isNavigationOpen = true;
    await tick();
    document
      .querySelector<HTMLButtonElement>('[data-navigation-close]')
      ?.focus({ preventScroll: true });
  }

  function closeNavigation(restoreToggleFocus: boolean): void {
    if (!isNavigationOpen) return;
    isNavigationOpen = false;
    if (restoreToggleFocus) {
      void tick().then(() => topBar.focusNavigationToggle());
    }
  }

  function toggleNavigation(): void {
    if (isNavigationOpen) {
      closeNavigation(true);
    } else {
      void openNavigation();
    }
  }

  function openHelp(): void {
    closeNavigation(false);
    sampleError = undefined;
    helpOpenOrigin = 'help';
    suppressAutomaticWelcome = welcomePreference.readPersistedDismissal();
    isHelpOpen = true;
  }

  function applyWelcomePreference(): void {
    if (suppressAutomaticWelcome) {
      welcomePreference.persistDismissal();
    } else {
      welcomePreference.removePersistedDismissal();
    }
  }

  async function closeHelp(): Promise<void> {
    if (!isHelpOpen) return;
    applyWelcomePreference();
    isHelpOpen = false;
    sampleError = undefined;
    await tick();
    if (helpOpenOrigin === 'help') {
      topBar.focusHelpButton();
    } else {
      topBar.focusOpenButton('dtd');
    }
  }

  async function loadSample(sampleId: BuiltInSampleId): Promise<void> {
    if (isImporting) return;
    sampleError = undefined;
    const outcome = activateBuiltInSample(sampleId, {
      invalidateImport: () =>
        importController.invalidateForExternalActivation(),
      clearImportFailure: () => importController.clearDiagnosticReport(),
    });
    if (outcome.status === 'busy') return;
    if (outcome.status === 'failure') {
      sampleError = outcome.message;
      return;
    }

    applyWelcomePreference();
    isHelpOpen = false;
    await tick();
    document
      .querySelector<HTMLElement>('[data-focus-card-heading]')
      ?.focus({ preventScroll: true });
  }

  async function completeLocalImport(
    opening: Promise<SchemaFileImportOutcome>,
  ): Promise<SchemaFileImportOutcome> {
    const outcome = await opening;
    if (outcome.status !== 'success') return outcome;

    const activatedProjectId = $activeProjectStore.project.id;
    const activatedSessionRevision = $projectSessionResetStore.revision;
    await tick();

    if (
      $activeProjectStore.project.id === activatedProjectId &&
      $projectSessionResetStore.revision === activatedSessionRevision &&
      ($importState.status === 'idle' || $importState.status === 'warning')
    ) {
      document
        .querySelector<HTMLElement>('[data-focus-card-heading]')
        ?.focus({ preventScroll: true });
    }

    return outcome;
  }

  function openDtdFile(file: SchemaReadableFile) {
    return completeLocalImport(importController.openDtd(file));
  }

  function openXsdFile(file: SchemaReadableFile) {
    return completeLocalImport(importController.openXsd(file));
  }

  function openZipFile(file: SchemaArchiveReadableFile) {
    return completeLocalImport(importController.openZip(file));
  }

  async function handleNavigationAction(
    kind: 'center' | 'inspect',
  ): Promise<void> {
    isNavigationOpen = false;
    await tick();
    document
      .querySelector<HTMLElement>(
        kind === 'inspect'
          ? '[data-inspector-close]'
          : '[data-focus-card-heading]',
      )
      ?.focus({ preventScroll: true });
  }
</script>

<div
  class="app-shell"
  data-schema-import-phase={currentImportPhase}
  inert={isHelpOpen || isProblemReportOpen}
>
  <TopBar
    bind:this={topBar}
    {projectIdentity}
    {projectStatus}
    {projectAccessibleLabel}
    importState={$importState}
    {isNavigationOpen}
    onOpenDtdFile={openDtdFile}
    onOpenXsdFile={openXsdFile}
    onOpenZipFile={openZipFile}
    onToggleNavigation={toggleNavigation}
    onSearchIntent={() => closeNavigation(false)}
    retainedProblemCount={showPersistentProblems
      ? $diagnosticReport?.totalCount
      : undefined}
    retainedProblemFilename={showPersistentProblems
      ? $diagnosticReport?.attemptedFileName
      : undefined}
    onOpenProblems={openProblemReport}
    onOpenHelp={openHelp}
  />
  {#if importProgressPresentation}
    <ImportProgress
      presentation={importProgressPresentation}
      phase={currentImportPhase ?? 'reading'}
      onCancel={() => void cancelImport()}
    />
  {/if}
  {#if $importState.status === 'failure'}
    <ImportErrorAlert
      presentation={$importState.presentation}
      report={$importState.report}
      onViewAll={openProblemReport}
      onDismiss={() => void dismissImportFailure()}
    />
  {/if}
  {#if $importState.status === 'warning'}
    <ImportWarningNotice
      filename={$importState.filename}
      diagnostics={$importState.diagnostics}
      totalWarningCount={$importState.totalWarningCount}
      visualizationSummary={$importState.visualizationSummary}
      onDismiss={dismissImportWarning}
    />
  {/if}
  {#if isNavigationOpen}
    <div
      class="navigation-backdrop"
      aria-hidden="true"
      onpointerdown={() => closeNavigation(true)}
    ></div>
  {/if}
  <LeftPanel
    isOverlayOpen={isNavigationOpen}
    onRequestClose={closeNavigation}
    onOverlayAction={(kind) => void handleNavigationAction(kind)}
  />
  <CarouselRegion />
  <InspectorPanel />
</div>

<WelcomeHelpDialog
  open={isHelpOpen}
  bind:suppressAutomaticWelcome
  sampleActionsDisabled={isImporting}
  {sampleError}
  onClose={() => void closeHelp()}
  onLoadSample={(sampleId) => void loadSample(sampleId)}
/>

<ProblemReportDialog
  open={isProblemReportOpen}
  report={$diagnosticReport}
  hasActiveProject={$activeProjectStore.project !== undefined}
  onClose={() => void closeProblemReport(true)}
/>

<style>
  .app-shell {
    display: grid;
    grid-template:
      'topbar topbar topbar' var(--top-bar-height)
      'import-status import-status import-status' auto
      'left carousel inspector' minmax(0, 1fr)
      / var(--left-panel-width) minmax(var(--content-min-width), 1fr) var(
        --inspector-width
      );
    width: 100%;
    height: 100dvh;
    min-height: 0;
    overflow: hidden;
    background: var(--colour-canvas);
  }

  .navigation-backdrop {
    display: none;
  }

  @media (min-width: 1280px) and (max-width: 1399px) {
    .app-shell {
      grid-template:
        'topbar topbar topbar' var(--top-bar-height)
        'import-status import-status import-status' auto
        'left carousel inspector' minmax(0, 1fr)
        / min(20vw, 280px) minmax(0, 1fr) min(25vw, 340px);
    }
  }

  @media (max-width: 1279px) {
    .app-shell {
      grid-template:
        'topbar topbar' var(--top-bar-height)
        'import-status import-status' auto
        'carousel inspector' minmax(0, 1fr)
        / minmax(var(--content-min-width), 1fr) min(36vw, 360px);
    }

    .navigation-backdrop {
      position: fixed;
      z-index: 24;
      inset: var(--top-bar-height) 0 0;
      display: block;
      min-width: 0;
      min-height: 0;
      padding: 0;
      border: 0;
      border-radius: 0;
      background: rgb(23 33 43 / 32%);
      cursor: pointer;
    }
  }

  @media (max-width: 1099px) {
    .app-shell {
      grid-template:
        'topbar' var(--top-bar-height)
        'import-status' auto
        'carousel' minmax(0, 1fr)
        / minmax(0, 1fr);
    }
  }
</style>
