<script lang="ts">
  import { afterUpdate, onMount, tick } from 'svelte';
  import {
    formatOccurrence,
    type SchemaNodeId,
    type SchemaProject,
    type SchemaRelationship,
    type SchemaNodeKind,
  } from '../../schema/model';
  import type { XsdMetadataByNodeId } from '../../schema/xsd';
  import ContextCard from './ContextCard.svelte';
  import { buildContextCardStructureSummary } from './contextCardSummary';
  import {
    DEFAULT_LEAFWARD_CARDS,
    formatBranchWindowRange,
    getBranchWindow,
    getLeafwardWindowSizeForStage,
    renderedVerticalWindowFits,
    shiftSideWindow,
  } from './carouselWindowing';
  import { getKeyboardSelectionWindowStart } from './keyboardNavigation';
  import { buildJourneyMotionKey } from './gesture/gesturePresentation';
  import { shouldShowContextNodeKinds } from '../presentation/projectPresentation';
  import SideWindowControl from './SideWindowControl.svelte';
  import { getSchemaNodeDisplayName } from '../presentation/xsdMetadataPresentation';
  import { buildJourneyRelationshipPresentation } from '../presentation/schemaRelationshipPresentation';
  import type { NavigationState } from '../../app/stores/navigationTypes';
  import type { ImplementedSemanticZoomPresentation } from './semanticZoomPresentation';

  export let relationships: readonly SchemaRelationship[];
  export let focusNodeId: SchemaNodeId | undefined;
  export let onNavigate: (relationship: SchemaRelationship) => void;
  export let inspectedNodeId: string | undefined;
  export let gesturePreviewRelationshipId: string | undefined = undefined;
  export let nextJourneyPosition: number;
  export let onToggleInspection: (nodeId: string) => void;
  export let focusedNodeKind: SchemaNodeKind | undefined;
  export let project: SchemaProject;
  export let xsdMetadataByNodeId: XsdMetadataByNodeId = {};
  export let projectSessionRevision = 0;
  export let navigationState: NavigationState | undefined = undefined;
  export let isPointerGestureActive = false;
  export let keyboardSelectedRelationshipId: string | undefined = undefined;
  export let availableWidth: number | undefined = undefined;
  export let availableHeight: number | undefined = undefined;
  export let reflowRevision = 0;
  export let presentation: ImplementedSemanticZoomPresentation = 'full';

  let laneElement: HTMLElement;
  let windowStartIndex = 0;
  let leafwardWindowSize = DEFAULT_LEAFWARD_CARDS;
  let observedWindowKey = '';
  let wheelAccumulator = 0;
  let wheelDirection = 0;
  let windowAnnouncement = '';
  let observedKeyboardWindowKey = '';
  let observedCapacityKey = '';
  let capacityMeasurementPending = false;

  const WHEEL_SHIFT_THRESHOLD = 40;

  $: windowKey = `${project.id}\u0000${projectSessionRevision}\u0000${focusNodeId}\u0000${relationships
    .map(({ edge }) => edge.id)
    .join('\u0000')}`;
  $: if (windowKey !== observedWindowKey) {
    observedWindowKey = windowKey;
    windowStartIndex = 0;
    resetWheelState();
    windowAnnouncement = '';
  }
  $: capacityKey = `${windowKey}\u0000${reflowRevision}\u0000${availableWidth ?? ''}\u0000${availableHeight ?? ''}`;
  $: if (capacityKey !== observedCapacityKey) {
    observedCapacityKey = capacityKey;
    const nextSize = getLeafwardWindowSizeForStage(
      availableWidth ??
        (typeof window === 'undefined' ? Number.NaN : window.innerWidth),
      availableHeight ??
        (typeof window === 'undefined' ? Number.NaN : window.innerHeight),
    );
    if (nextSize !== leafwardWindowSize) {
      leafwardWindowSize = nextSize;
      windowStartIndex = getBranchWindow(
        relationships,
        windowStartIndex,
        nextSize,
      ).startIndex;
      ensureKeyboardSelectionVisible();
      resetWheelState();
      windowAnnouncement = '';
    }
    capacityMeasurementPending = true;
  }
  $: if (isPointerGestureActive) resetWheelState();
  $: windowed = getBranchWindow(
    relationships,
    windowStartIndex,
    leafwardWindowSize,
  );
  $: keyboardWindowKey = `${windowKey}\u0000${keyboardSelectedRelationshipId ?? ''}`;
  $: synchronizeKeyboardWindow(keyboardWindowKey);
  $: showKinds = shouldShowContextNodeKinds(
    windowed.visible.map(({ item: { node } }) => node),
    focusedNodeKind,
  );
  $: fallbackFocusNodeId =
    focusNodeId ??
    relationships[0]?.edge.sourceNodeId ??
    project.rootNodeIds[0] ??
    project.nodes[0]?.id;
  $: effectiveNavigationState =
    navigationState ??
    (fallbackFocusNodeId
      ? {
          projectId: project.id,
          navigationPath: [fallbackFocusNodeId] as const,
        }
      : undefined);

  onMount(() => {
    function handleWheel(event: WheelEvent): void {
      if (isPointerGestureActive) {
        resetWheelState();
        return;
      }
      if (windowed.hiddenBeforeCount === 0 && windowed.hiddenAfterCount === 0) {
        resetWheelState();
        return;
      }
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

      const direction = Math.sign(event.deltaY);
      if (wheelDirection !== 0 && direction !== wheelDirection) {
        wheelAccumulator = 0;
      }
      wheelDirection = direction;
      wheelAccumulator += event.deltaY;

      if (Math.abs(wheelAccumulator) < WHEEL_SHIFT_THRESHOLD) return;
      const shifted = shiftWindow(direction > 0 ? 1 : -1, 'wheel');
      resetWheelState();
      if (shifted) event.preventDefault();
    }

    laneElement.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      laneElement.removeEventListener('wheel', handleWheel);
      resetWheelState();
    };
  });

  afterUpdate(() => {
    if (!capacityMeasurementPending || !laneElement) return;
    capacityMeasurementPending = false;

    const renderedHeight = laneElement.getBoundingClientRect().height;
    const stageHeight =
      availableHeight ??
      (typeof window === 'undefined' ? Number.NaN : window.innerHeight);
    if (
      renderedVerticalWindowFits(renderedHeight, stageHeight) ||
      leafwardWindowSize <= 1
    ) {
      return;
    }

    leafwardWindowSize -= 1;
    windowStartIndex = getBranchWindow(
      relationships,
      windowStartIndex,
      leafwardWindowSize,
    ).startIndex;
    ensureKeyboardSelectionVisible();
    if (windowAnnouncement) {
      windowAnnouncement = formatBranchWindowRange(
        getBranchWindow(relationships, windowStartIndex, leafwardWindowSize),
      );
    }
    capacityMeasurementPending = true;
  });

  function resetWheelState(): void {
    wheelAccumulator = 0;
    wheelDirection = 0;
  }

  function synchronizeKeyboardWindow(key: string): void {
    if (key === observedKeyboardWindowKey) return;
    observedKeyboardWindowKey = key;
    ensureKeyboardSelectionVisible();
  }

  function ensureKeyboardSelectionVisible(): void {
    const keyboardWindowStartIndex = getKeyboardSelectionWindowStart(
      relationships,
      keyboardSelectedRelationshipId,
      windowStartIndex,
      leafwardWindowSize,
    );
    if (keyboardWindowStartIndex === windowStartIndex) return;
    windowStartIndex = keyboardWindowStartIndex;
    resetWheelState();
  }

  function formatNodeCount(count: number): string {
    return `${count} ${count === 1 ? 'node' : 'nodes'}`;
  }

  function shiftWindow(delta: -1 | 1, input: 'button' | 'wheel'): boolean {
    const nextWindow = shiftSideWindow(
      relationships,
      windowed.startIndex,
      delta,
      leafwardWindowSize,
    );
    if (nextWindow.startIndex === windowed.startIndex) return false;

    windowStartIndex = nextWindow.startIndex;
    windowAnnouncement = formatBranchWindowRange(nextWindow);
    capacityMeasurementPending = true;
    if (input === 'button') void focusOverflowControl(delta);
    return true;
  }

  async function focusOverflowControl(delta: -1 | 1): Promise<void> {
    await tick();

    const preferredDirection =
      delta > 0 ? 'leafward-next' : 'leafward-previous';
    const fallbackDirection = delta > 0 ? 'leafward-previous' : 'leafward-next';
    const preferred = laneElement.querySelector<HTMLButtonElement>(
      `[data-carousel-window-direction="${preferredDirection}"]`,
    );
    const fallback = laneElement.querySelector<HTMLButtonElement>(
      `[data-carousel-window-direction="${fallbackDirection}"]`,
    );
    (preferred ?? fallback)?.focus();
  }
</script>

<section
  bind:this={laneElement}
  class:compact={presentation === 'compact'}
  class="context-lane leafward-context"
  aria-label="Leafward destinations"
  data-carousel-side-window="leafward"
>
  <span class="lane-label">Leafward</span>
  <div class="context-stack">
    {#if windowed.hiddenBeforeCount > 0}
      <SideWindowControl
        visibleLabel={`+${windowed.hiddenBeforeCount} above`}
        accessibleLabel={`Show ${formatNodeCount(windowed.hiddenBeforeCount)} above in the leafward rail`}
        direction="leafward-previous"
        onActivate={() => shiftWindow(-1, 'button')}
      />
    {/if}

    {#each windowed.visible as { item: relationship }, visibleOrder (relationship.edge.id)}
      {@const structureSummary = buildContextCardStructureSummary(
        project,
        relationship.node.id,
      )}
      {@const journeyPresentation = effectiveNavigationState
        ? buildJourneyRelationshipPresentation(
            project,
            effectiveNavigationState,
            relationship,
          )
        : undefined}
      <ContextCard
        node={relationship.node}
        displayName={getSchemaNodeDisplayName(
          project,
          relationship.node,
          xsdMetadataByNodeId,
        )}
        occurrence={relationship.edge.kind === 'contains' ||
        relationship.edge.kind === 'contentModelMember' ||
        relationship.edge.kind === 'contentModelReference' ||
        relationship.edge.kind === 'referencesUndeclaredElementName'
          ? formatOccurrence(relationship.edge.occurrence)
          : ''}
        direction="leafward"
        relationshipId={relationship.edge.id}
        relationshipKind={relationship.edge.kind}
        relationshipLabel={journeyPresentation?.disposition ===
        'terminalCycleClosure'
          ? journeyPresentation.relationshipLabel
          : undefined}
        relationshipDisposition={journeyPresentation?.disposition ?? 'advance'}
        terminalLabel={journeyPresentation?.terminalLabel}
        {focusedNodeKind}
        showKind={showKinds}
        {structureSummary}
        isInspected={relationship.node.id === inspectedNodeId}
        isGesturePreview={relationship.edge.id === gesturePreviewRelationshipId}
        isKeyboardSelected={!isPointerGestureActive &&
          relationship.edge.id === keyboardSelectedRelationshipId}
        {visibleOrder}
        motionKey={buildJourneyMotionKey(
          nextJourneyPosition,
          relationship.node.id,
        )}
        onActivate={() => onNavigate(relationship)}
        {onToggleInspection}
        {presentation}
      />
    {/each}

    {#if windowed.hiddenAfterCount > 0}
      <SideWindowControl
        visibleLabel={`+${windowed.hiddenAfterCount} more ${windowed.hiddenAfterCount === 1 ? 'destination' : 'destinations'}`}
        accessibleLabel={`Show ${formatNodeCount(windowed.hiddenAfterCount)} below in the leafward rail`}
        direction="leafward-next"
        onActivate={() => shiftWindow(1, 'button')}
      />
    {/if}
  </div>
  {#if windowAnnouncement}
    <p
      class="branch-window-range"
      data-branch-window-range
      data-branch-window-large-total={relationships.length >= 1000
        ? 'true'
        : undefined}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {windowAnnouncement}
    </p>
  {/if}
</section>

<style>
  .context-lane,
  .context-stack {
    display: grid;
    min-width: 0;
    gap: var(--space-2);
  }

  .context-lane {
    align-content: center;
    grid-template-columns: minmax(0, 1fr);
    inline-size: 100%;
  }

  .lane-label {
    color: var(--colour-text-muted);
    font-size: var(--font-size-xs);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-align: right;
    text-transform: uppercase;
  }

  .branch-window-range {
    justify-self: end;
    inline-size: max-content;
    max-inline-size: calc(100% + var(--space-10));
    min-width: 0;
    margin: 0;
    overflow-wrap: anywhere;
    color: var(--colour-accent);
    font-size: var(--font-size-xs);
    font-weight: 700;
    line-height: 1.25;
    text-align: left;
  }

  .branch-window-range[data-branch-window-large-total] {
    inline-size: 100%;
    max-inline-size: 100%;
  }

  .context-lane.compact,
  .context-lane.compact .context-stack {
    gap: var(--space-1);
  }

  .context-lane.compact .lane-label {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @media (orientation: landscape) and (max-height: 520px) {
    .context-stack {
      gap: var(--space-1);
    }

    .lane-label {
      display: none;
    }
  }
</style>
