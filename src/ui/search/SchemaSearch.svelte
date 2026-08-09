<script lang="ts">
  import { onMount, tick } from 'svelte';
  import {
    buildProjectSearchIndex,
    normalizeProjectSearchText,
    searchProjectIndex,
    type ProjectSearchIndex,
    type ProjectSearchIndexInput,
    type ProjectSearchResult,
  } from '../../app/search';
  import {
    activeProjectStore,
    type ActiveProjectState,
    type ActiveProjectStore,
  } from '../../app/stores/projectStore';
  import {
    inspectorStore,
    type InspectorStore,
  } from '../../app/stores/inspectorStore';
  import {
    navigationStore,
    type NavigationStore,
  } from '../../app/stores/navigationStore';
  import type { SchemaNodeId } from '../../schema/model';
  import { projectSessionResetStore } from '../../app/stores/projectSessionResetStore';
  import {
    buildProjectSearchPresentation,
    SEARCH_UI_RESULT_LIMIT,
    type ProjectSearchResultPresentation,
    type SearchPresentationState,
  } from '../presentation/projectSearchPresentation';
  import SearchResultsPanel from './SearchResultsPanel.svelte';
  import type { SourceViewOrigin } from '../../app/stores/sourceViewStore';
  import { selectSourceViewPresentation } from '../presentation/sourceMarkupPresentation';

  type SearchIndexBuilder = (
    input: ProjectSearchIndexInput,
  ) => ProjectSearchIndex;
  type SearchEngine = (
    index: ProjectSearchIndex,
    query: string,
    options: { readonly limit: number },
  ) => readonly ProjectSearchResult[];

  export let projectStore: ActiveProjectStore = activeProjectStore;
  export let navigation: NavigationStore = navigationStore;
  export let inspector: InspectorStore = inspectorStore;
  export let indexBuilder: SearchIndexBuilder = buildProjectSearchIndex;
  export let searchEngine: SearchEngine = searchProjectIndex;
  export let onOpenSource: (
    nodeId: string,
    origin: SourceViewOrigin,
    originElement: HTMLElement,
  ) => void = () => {};

  const panelId = 'schema-search-results';
  const compactMediaQuery = '(max-width: 899px)';
  const unavailableResultMessage =
    'That search result is no longer available in the current schema.';

  let root: HTMLElement;
  let searchInput: HTMLInputElement | undefined;
  let compactTrigger: HTMLButtonElement | undefined;
  let query = '';
  let committedQuery = '';
  let isOpen = false;
  let isCompact = false;
  let openOrigin: 'desktop' | 'compact' | undefined;
  let trackedProjectId: string | undefined;
  let trackedProjectSessionRevision: number | undefined;
  let projectTrackingReady = false;
  let focusRequest = 0;
  let suppressNextFocusOpen = false;
  let actionError: string | undefined;
  let state: ActiveProjectState;
  let currentFocusNodeId: SchemaNodeId;
  let inspectedNodeId: SchemaNodeId | undefined;
  let indexInput: ProjectSearchIndexInput;
  let searchIndex: ProjectSearchIndex;
  let normalizedQuery: string;
  let queryResults: readonly ProjectSearchResult[];
  let presentation: SearchPresentationState;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  $: state = $projectStore;
  $: currentFocusNodeId =
    $navigation.navigationPath[$navigation.navigationPath.length - 1];
  $: inspectedNodeId = $inspector.inspectedNodeId;
  $: {
    const nextProjectId = state.project.id;
    const nextProjectSessionRevision = $projectSessionResetStore.revision;
    if (!projectTrackingReady) {
      trackedProjectId = nextProjectId;
      trackedProjectSessionRevision = nextProjectSessionRevision;
      projectTrackingReady = true;
    } else if (
      trackedProjectId !== nextProjectId ||
      trackedProjectSessionRevision !== nextProjectSessionRevision
    ) {
      trackedProjectId = nextProjectId;
      trackedProjectSessionRevision = nextProjectSessionRevision;
      resetForProjectReplacement();
    }
  }
  $: indexInput = {
    project: state.project,
    sourceFilename: state.sourceFilename,
    ...(state.xsdMetadataByNodeId
      ? { xsdMetadataByNodeId: state.xsdMetadataByNodeId }
      : {}),
    ...(state.commentsByNodeId
      ? { commentsByNodeId: state.commentsByNodeId }
      : {}),
    ...(state.dtdAttributesByNodeId
      ? { dtdAttributesByNodeId: state.dtdAttributesByNodeId }
      : {}),
    ...(state.schemaPackageEntries
      ? { packageEntries: state.schemaPackageEntries }
      : {}),
  };
  $: searchIndex =
    state.preparedSearchIndex?.projectId === state.project.id
      ? state.preparedSearchIndex
      : indexBuilder(indexInput);
  $: normalizedQuery = normalizeProjectSearchText(committedQuery);
  $: queryResults =
    normalizedQuery.length === 0
      ? []
      : searchEngine(searchIndex, committedQuery, {
          limit: SEARCH_UI_RESULT_LIMIT + 1,
        });
  $: presentation = buildProjectSearchPresentation(
    committedQuery,
    queryResults,
  );

  onMount(() => {
    const media =
      typeof window.matchMedia === 'function'
        ? window.matchMedia(compactMediaQuery)
        : undefined;
    const updateCompactState = (): void => {
      isCompact = media?.matches ?? false;
    };
    const handleOutsidePointer = (event: PointerEvent): void => {
      if (
        isOpen &&
        event.target instanceof Node &&
        !root.contains(event.target)
      ) {
        closeWithoutFocusRestore();
      }
    };

    updateCompactState();
    media?.addEventListener('change', updateCompactState);
    document.addEventListener('pointerdown', handleOutsidePointer);

    return () => {
      cancelPendingSearch();
      media?.removeEventListener('change', updateCompactState);
      document.removeEventListener('pointerdown', handleOutsidePointer);
    };
  });

  function resetForProjectReplacement(): void {
    focusRequest += 1;
    query = '';
    committedQuery = '';
    cancelPendingSearch();
    isOpen = false;
    openOrigin = undefined;
    suppressNextFocusOpen = false;
    actionError = undefined;
  }

  function handleInput(event: Event): void {
    query = (event.currentTarget as HTMLInputElement).value;
    scheduleCommittedQuery();
    actionError = undefined;
    if (!isOpen) {
      openOrigin = 'desktop';
      isOpen = true;
    }
  }

  function handleInputFocus(): void {
    if (suppressNextFocusOpen) {
      suppressNextFocusOpen = false;
      return;
    }
    if (!isOpen) {
      openOrigin = 'desktop';
      isOpen = true;
    }
    if (committedQuery !== query) scheduleCommittedQuery();
  }

  function cancelPendingSearch(): void {
    if (searchTimer === undefined) return;
    clearTimeout(searchTimer);
    searchTimer = undefined;
  }

  function scheduleCommittedQuery(): void {
    cancelPendingSearch();
    if (
      normalizeProjectSearchText(query).length === 0 ||
      searchIndex.documents.length < 2_000
    ) {
      committedQuery = query;
      return;
    }
    committedQuery = '';
    const scheduledQuery = query;
    searchTimer = setTimeout(() => {
      searchTimer = undefined;
      if (query === scheduledQuery) committedQuery = scheduledQuery;
    }, 100);
  }

  async function openFromCompact(): Promise<void> {
    const request = ++focusRequest;
    openOrigin = 'compact';
    isOpen = true;
    await tick();
    if (request === focusRequest && isOpen) {
      searchInput?.focus();
    }
  }

  async function restoreOpeningFocus(
    origin: 'desktop' | 'compact' | undefined,
  ): Promise<void> {
    cancelPendingSearch();
    const request = ++focusRequest;
    isOpen = false;
    openOrigin = undefined;
    suppressNextFocusOpen = origin === 'desktop' && !isCompact;
    await tick();
    if (request !== focusRequest || isOpen) return;

    if (origin === 'compact' && compactTrigger) {
      compactTrigger.focus();
    } else if (isCompact && compactTrigger) {
      compactTrigger.focus();
    } else {
      searchInput?.focus();
    }
  }

  function closeWithoutFocusRestore(): void {
    cancelPendingSearch();
    focusRequest += 1;
    isOpen = false;
    openOrigin = undefined;
    suppressNextFocusOpen = false;
  }

  function handleWindowKeydown(event: KeyboardEvent): void {
    if (
      event.key !== 'Escape' ||
      !isOpen ||
      !(document.activeElement instanceof Node) ||
      !root.contains(document.activeElement)
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    void restoreOpeningFocus(openOrigin);
  }

  async function clearSearch(): Promise<void> {
    const request = ++focusRequest;
    query = '';
    committedQuery = '';
    cancelPendingSearch();
    isOpen = true;
    actionError = undefined;
    await tick();
    if (request === focusRequest) {
      searchInput?.focus();
    }
  }

  async function closeForAction(destinationSelector: string): Promise<void> {
    cancelPendingSearch();
    const request = ++focusRequest;
    actionError = undefined;
    isOpen = false;
    openOrigin = undefined;
    suppressNextFocusOpen = false;
    await tick();
    if (request !== focusRequest || isOpen) return;

    document
      .querySelector<HTMLElement>(destinationSelector)
      ?.focus({ preventScroll: true });
  }

  async function centerResult(
    result: ProjectSearchResultPresentation,
  ): Promise<void> {
    if (!result.nodeId) {
      actionError = unavailableResultMessage;
      return;
    }
    const wasAlreadyFocused = result.nodeId === currentFocusNodeId;
    const transition = navigation.centerNode({
      targetNodeId: result.nodeId,
      origin: 'search',
    });
    if (
      !transition.applied &&
      !(transition.reason === 'alreadyFocused' && wasAlreadyFocused)
    ) {
      actionError = unavailableResultMessage;
      return;
    }

    await closeForAction('[data-focus-card-heading]');
  }

  async function inspectResult(
    result: ProjectSearchResultPresentation,
  ): Promise<void> {
    if (!result.nodeId) {
      actionError = unavailableResultMessage;
      return;
    }
    const transition = inspector.inspect(result.nodeId);
    if (!transition.applied) {
      actionError = unavailableResultMessage;
      return;
    }

    await closeForAction('[data-inspector-close]');
  }

  async function openPackageEntry(
    result: ProjectSearchResultPresentation,
  ): Promise<void> {
    if (!result.packageEntryId) {
      actionError = unavailableResultMessage;
      return;
    }
    cancelPendingSearch();
    isOpen = false;
    openOrigin = undefined;
    const navigationToggle = document.querySelector<HTMLButtonElement>(
      '.navigation-toggle[aria-expanded="false"]',
    );
    navigationToggle?.click();
    await tick();
    const target = Array.from(
      document.querySelectorAll<HTMLDetailsElement>('[data-package-entry-id]'),
    ).find(
      (element) =>
        element.getAttribute('data-package-entry-id') === result.packageEntryId,
    );
    if (!target) {
      actionError = unavailableResultMessage;
      return;
    }
    target.open = true;
    target.scrollIntoView({ block: 'nearest' });
    target
      .querySelector<HTMLElement>('summary')
      ?.focus({ preventScroll: true });
  }

  function canViewSource(result: ProjectSearchResultPresentation): boolean {
    return Boolean(
      result.nodeId &&
      selectSourceViewPresentation(state, result.nodeId)?.sourceAvailable,
    );
  }

  function viewSource(
    result: ProjectSearchResultPresentation,
    originElement: HTMLButtonElement,
  ): void {
    if (!result.nodeId || !canViewSource(result)) {
      actionError = unavailableResultMessage;
      return;
    }
    onOpenSource(result.nodeId, 'search-result', originElement);
  }
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<div
  bind:this={root}
  class:compact={isCompact}
  class:open={isOpen}
  class="schema-search"
  role="search"
  aria-label="Schema search"
  data-schema-search
>
  {#if isCompact}
    <button
      bind:this={compactTrigger}
      class="compact-search-trigger"
      type="button"
      aria-label="Search schema"
      aria-expanded={isOpen}
      aria-controls={panelId}
      onclick={() => void openFromCompact()}
    >
      Search
    </button>
  {/if}

  {#if !isCompact || isOpen}
    <div class="search-input-shell">
      <label class="visually-hidden" for="schema-search-input">
        Search schema
      </label>
      <!-- svelte-ignore a11y_role_supports_aria_props_implicit -->
      <input
        bind:this={searchInput}
        id="schema-search-input"
        class:has-clear={query.length > 0}
        type="search"
        value={query}
        aria-label="Search schema"
        placeholder="Search schema"
        autocomplete="off"
        spellcheck="false"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onfocus={handleInputFocus}
        oninput={handleInput}
      />
      {#if query.length > 0}
        <button
          class="clear-search"
          type="button"
          aria-label="Clear search"
          onclick={() => void clearSearch()}
        >
          Clear
        </button>
      {/if}
    </div>
  {/if}

  {#if isOpen}
    <SearchResultsPanel
      {panelId}
      {presentation}
      {currentFocusNodeId}
      {inspectedNodeId}
      {actionError}
      onCenterResult={(result) => void centerResult(result)}
      onInspectResult={(result) => void inspectResult(result)}
      onOpenPackageEntry={(result) => void openPackageEntry(result)}
      {canViewSource}
      onViewSource={viewSource}
      onClose={() => void restoreOpeningFocus(openOrigin)}
    />
  {/if}
</div>

<style>
  .schema-search {
    position: relative;
    display: flex;
    min-width: 10rem;
    flex: 0 1 15rem;
    align-items: center;
  }

  .search-input-shell {
    position: relative;
    width: 100%;
    min-width: 0;
  }

  input {
    width: 100%;
    min-width: 0;
    height: var(--control-min-size);
    padding: 0 var(--space-3);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-medium);
    background: var(--colour-panel-subtle);
    color: var(--colour-text);
  }

  input.has-clear {
    padding-right: 4.5rem;
  }

  input:focus-visible,
  button:focus-visible {
    outline: 3px solid var(--colour-focus-ring);
    outline-offset: 2px;
  }

  .clear-search,
  .compact-search-trigger {
    min-width: var(--control-min-size);
    min-height: var(--control-min-size);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-medium);
    background: var(--colour-panel);
    color: var(--colour-text);
    font-weight: 600;
    cursor: pointer;
  }

  .clear-search {
    position: absolute;
    top: 0;
    right: 0;
    padding-inline: var(--space-3);
    border-color: transparent;
    background: transparent;
    color: var(--colour-accent);
  }

  .clear-search:hover,
  .compact-search-trigger:hover {
    border-color: var(--colour-accent);
    color: var(--colour-accent);
  }

  .clear-search:active,
  .compact-search-trigger:active {
    background: var(--colour-accent-soft);
  }

  .compact-search-trigger {
    padding-inline: var(--space-3);
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

  @media (max-width: 899px) {
    .schema-search {
      position: static;
      min-width: 0;
      flex: 0 0 auto;
    }

    .search-input-shell {
      position: fixed;
      top: var(--top-bar-height);
      right: 0;
      left: 0;
      z-index: 31;
      padding: var(--space-2);
      border-bottom: 1px solid var(--colour-border);
      background: var(--colour-panel-raised);
      box-shadow: var(--shadow-low);
    }
  }

  @media (max-width: 389px) {
    .compact-search-trigger {
      padding-inline: var(--space-2);
      font-size: var(--font-size-sm);
    }
  }

  @media (min-width: 390px) and (max-width: 479px) {
    .compact-search-trigger {
      padding-inline: var(--space-1);
      font-size: var(--font-size-sm);
    }
  }
</style>
