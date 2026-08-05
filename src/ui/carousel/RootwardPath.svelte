<script lang="ts">
  import { afterUpdate, tick } from 'svelte';
  import type {
    SchemaNode,
    SchemaNodeKind,
    SchemaProject,
  } from '../../schema/model';
  import type { XsdMetadataByNodeId } from '../../schema/xsd';
  import ContextCard from './ContextCard.svelte';
  import RootwardHistoryRow from './RootwardHistoryRow.svelte';
  import {
    getRootwardWindow,
    renderedVerticalWindowFits,
  } from './carouselWindowing';
  import { buildJourneyMotionKey } from './gesture/gesturePresentation';
  import { shouldShowContextNodeKinds } from '../presentation/projectPresentation';
  import SideWindowControl from './SideWindowControl.svelte';
  import { getSchemaNodeDisplayName } from '../presentation/xsdMetadataPresentation';
  import type { ImplementedSemanticZoomPresentation } from './semanticZoomPresentation';

  export let nodes: readonly SchemaNode[];
  export let onNavigatePrevious: () => void;
  export let onJumpEarlier: (nodeId: string, journeyPosition: number) => void;
  export let inspectedNodeId: string | undefined;
  export let gesturePreviewNodeId: string | undefined = undefined;
  export let onToggleInspection: (nodeId: string) => void;
  export let focusedNodeKind: SchemaNodeKind | undefined;
  export let journeyLength: number;
  export let journeyKey: string;
  export let projectSessionRevision = 0;
  export let project: SchemaProject | undefined = undefined;
  export let xsdMetadataByNodeId: XsdMetadataByNodeId = {};
  export let earlierPathRows = 2;
  export let availableHeight: number | undefined = undefined;
  export let reflowRevision = 0;
  export let presentation: ImplementedSemanticZoomPresentation = 'full';

  let laneElement: HTMLElement;
  let historyStartIndex = 0;
  let observedJourneyKey = '';
  let observedCapacityKey = '';
  let fittedEarlierPathRows = earlierPathRows;
  let capacityMeasurementPending = false;

  $: resetKey = `${projectSessionRevision}\u0000${journeyKey}`;
  $: if (resetKey !== observedJourneyKey) {
    observedJourneyKey = resetKey;
    historyStartIndex = 0;
  }
  $: capacityKey = `${resetKey}\u0000${reflowRevision}\u0000${earlierPathRows}\u0000${availableHeight ?? ''}`;
  $: if (capacityKey !== observedCapacityKey) {
    observedCapacityKey = capacityKey;
    fittedEarlierPathRows = earlierPathRows;
    historyStartIndex = getRootwardWindow(
      nodes,
      historyStartIndex,
      journeyLength,
      fittedEarlierPathRows,
    ).historyStartIndex;
    capacityMeasurementPending = true;
  }
  $: windowed = getRootwardWindow(
    nodes,
    historyStartIndex,
    journeyLength,
    fittedEarlierPathRows,
  );
  $: visibleNodes = [
    ...(windowed.previousStep ? [windowed.previousStep.item] : []),
    ...windowed.earlierSteps.map(({ item }) => item),
  ];
  $: showKinds = shouldShowContextNodeKinds(visibleNodes, focusedNodeKind);

  afterUpdate(() => {
    if (!capacityMeasurementPending || !laneElement) return;
    capacityMeasurementPending = false;

    const renderedHeight = laneElement.getBoundingClientRect().height;
    const stageHeight =
      availableHeight ??
      (typeof window === 'undefined' ? Number.NaN : window.innerHeight);
    if (
      renderedVerticalWindowFits(renderedHeight, stageHeight) ||
      fittedEarlierPathRows <= 1
    ) {
      return;
    }

    fittedEarlierPathRows -= 1;
    historyStartIndex = getRootwardWindow(
      nodes,
      historyStartIndex,
      journeyLength,
      fittedEarlierPathRows,
    ).historyStartIndex;
    capacityMeasurementPending = true;
  });

  function formatStepCount(count: number): string {
    return `${count} ${count === 1 ? 'step' : 'steps'}`;
  }

  function displayName(node: SchemaNode): string {
    return project
      ? getSchemaNodeDisplayName(project, node, xsdMetadataByNodeId)
      : node.name;
  }

  async function shiftHistory(direction: 'closer' | 'earlier'): Promise<void> {
    const delta =
      direction === 'earlier'
        ? windowed.hiddenEarlierCount
        : -windowed.hiddenCloserCount;
    historyStartIndex = getRootwardWindow(
      nodes,
      windowed.historyStartIndex + delta,
      journeyLength,
      fittedEarlierPathRows,
    ).historyStartIndex;
    capacityMeasurementPending = true;
    await tick();

    const preferredDirection =
      direction === 'earlier' ? 'rootward-closer' : 'rootward-earlier';
    const fallbackDirection =
      direction === 'earlier' ? 'rootward-earlier' : 'rootward-closer';
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
  class="context-lane rootward-context"
  aria-label="Rootward journey"
  data-carousel-side-window="rootward"
>
  <span class="lane-label">Rootward</span>
  <div class="context-stack">
    {#if windowed.previousStep}
      {@const previous = windowed.previousStep}
      <div class="previous-step" data-rootward-previous-step>
        <ContextCard
          node={previous.item}
          displayName={displayName(previous.item)}
          direction="rootward"
          contextLabel="Previous step"
          {focusedNodeKind}
          showKind={showKinds}
          isInspected={previous.item.id === inspectedNodeId}
          isGesturePreview={previous.item.id === gesturePreviewNodeId}
          motionKey={buildJourneyMotionKey(
            previous.journeyPosition,
            previous.item.id,
          )}
          journeyPosition={previous.journeyPosition}
          {presentation}
          onActivate={onNavigatePrevious}
          {onToggleInspection}
        />
      </div>
    {/if}

    {#if nodes.length > 1}
      <section
        class="history-group"
        aria-labelledby="earlier-path-heading"
        data-rootward-history-group
      >
        <h3 id="earlier-path-heading">Earlier in path</h3>

        {#if windowed.hiddenCloserCount > 0}
          <SideWindowControl
            visibleLabel={`Show ${formatStepCount(windowed.hiddenCloserCount)} closer to current`}
            accessibleLabel={`Show ${formatStepCount(windowed.hiddenCloserCount)} closer to current`}
            direction="rootward-closer"
            onActivate={() => void shiftHistory('closer')}
          />
        {/if}

        <ol aria-label="Earlier steps in the current path">
          {#each windowed.earlierSteps as { item: node, journeyPosition } (`${node.id}:${journeyPosition}`)}
            <RootwardHistoryRow
              {node}
              displayName={displayName(node)}
              {journeyPosition}
              showKind={showKinds}
              isInspected={node.id === inspectedNodeId}
              onJump={onJumpEarlier}
              {onToggleInspection}
              {presentation}
            />
          {/each}
        </ol>

        {#if windowed.hiddenEarlierCount > 0}
          <SideWindowControl
            visibleLabel={`Show ${windowed.hiddenEarlierCount} earlier path ${windowed.hiddenEarlierCount === 1 ? 'step' : 'steps'}`}
            accessibleLabel={`Show ${windowed.hiddenEarlierCount} earlier path ${windowed.hiddenEarlierCount === 1 ? 'step' : 'steps'}`}
            direction="rootward-earlier"
            onActivate={() => void shiftHistory('earlier')}
          />
        {/if}
      </section>
    {/if}
  </div>
</section>

<style>
  .context-lane,
  .context-stack,
  .history-group {
    display: grid;
    min-width: 0;
  }

  .context-lane {
    align-content: center;
    gap: var(--space-2);
  }

  .context-stack {
    gap: var(--space-3);
  }

  .previous-step {
    min-width: 0;
  }

  .history-group {
    gap: var(--space-2);
    padding-top: var(--space-2);
    border-top: 1px solid var(--colour-border-subtle);
  }

  .history-group h3,
  .lane-label {
    margin: 0;
    color: var(--colour-text-muted);
    font-size: var(--font-size-xs);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .history-group ol {
    display: grid;
    min-width: 0;
    gap: var(--space-2);
    padding: 0;
    margin: 0;
    list-style: none;
  }

  .context-lane.compact,
  .context-lane.compact .context-stack {
    gap: var(--space-1);
  }

  .context-lane.compact .history-group {
    gap: var(--space-1);
    padding-top: var(--space-1);
  }

  .context-lane.compact .lane-label,
  .context-lane.compact .history-group h3 {
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

  @media (max-width: 699px), (max-height: 699px) {
    .context-stack {
      gap: var(--space-2);
    }

    .history-group {
      gap: var(--space-1);
      padding-top: var(--space-1);
    }
  }

  @media (orientation: landscape) and (max-height: 520px) {
    .context-stack,
    .history-group,
    .history-group ol {
      gap: var(--space-1);
    }

    .lane-label {
      display: none;
    }
  }
</style>
