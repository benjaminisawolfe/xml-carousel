<script lang="ts">
  import { onMount, tick } from 'svelte';
  import {
    buildLeafwardRelationshipLines,
    buildRootwardJourneyLines,
    type LeafwardLineTarget,
    type RootwardLineItem,
    type SemanticZoomRectangle,
    type SemanticZoomRelationshipLine,
  } from './semanticZoomRelationshipGeometry';

  export let reflowRevision = 0;
  export let navigationKey = '';
  export let isResting = true;

  let lineLayer: SVGSVGElement;
  let lines: readonly SemanticZoomRelationshipLine[] = [];
  let stageWidth = 1;
  let stageHeight = 1;
  let stage: HTMLElement | undefined;
  let pendingFrame: number | undefined;
  let mounted = false;
  let resizeObserver: ResizeObserver | undefined;
  let mutationObserver: MutationObserver | undefined;
  let observedBoxes: readonly Element[] = [];
  let observedScheduleKey = '';
  let scheduleGeneration = 0;

  $: scheduleKey = `${isResting ? 'resting' : 'moving'}\u0000${reflowRevision}\u0000${navigationKey}`;
  $: if (scheduleKey !== observedScheduleKey) {
    observedScheduleKey = scheduleKey;
    invalidateAndScheduleMeasurement();
  }

  onMount(() => {
    mounted = true;
    stage = lineLayer.parentElement ?? undefined;
    if (!stage) return;

    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(() =>
        invalidateAndScheduleMeasurement(),
      );
      resizeObserver.observe(stage);
    }
    if (typeof MutationObserver === 'function') {
      mutationObserver = new MutationObserver((records) => {
        if (
          records.every(
            ({ target }) =>
              target instanceof Node && lineLayer.contains(target),
          )
        ) {
          return;
        }
        invalidateAndScheduleMeasurement();
      });
      mutationObserver.observe(stage, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: [
          'data-carousel-visible-order',
          'data-journey-position',
          'data-relationship-disposition',
          'data-semantic-zoom-leafward-edge-id',
          'data-semantic-zoom-rootward-position',
          'aria-pressed',
          'class',
          'style',
        ],
      });
    }

    void document.fonts?.ready.then(() => {
      if (mounted) invalidateAndScheduleMeasurement();
    });
    invalidateAndScheduleMeasurement();

    return () => {
      mounted = false;
      scheduleGeneration += 1;
      if (pendingFrame !== undefined) {
        window.cancelAnimationFrame(pendingFrame);
        pendingFrame = undefined;
      }
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      observedBoxes = [];
      lines = [];
    };
  });

  function invalidateAndScheduleMeasurement(): void {
    scheduleGeneration += 1;
    const generation = scheduleGeneration;
    lines = [];
    if (pendingFrame !== undefined) {
      window.cancelAnimationFrame(pendingFrame);
      pendingFrame = undefined;
    }
    if (!mounted || !stage || !isResting) return;
    void scheduleSettledMeasurement(generation);
  }

  async function scheduleSettledMeasurement(generation: number): Promise<void> {
    await tick();
    if (!canMeasure(generation)) return;
    scheduleFrame(generation, 2);
  }

  function canMeasure(generation: number): boolean {
    return Boolean(
      mounted &&
      isResting &&
      stage?.isConnected &&
      generation === scheduleGeneration,
    );
  }

  function scheduleFrame(generation: number, framesRemaining: number): void {
    if (!canMeasure(generation)) return;
    pendingFrame = window.requestAnimationFrame(() => {
      pendingFrame = undefined;
      if (!canMeasure(generation)) return;
      if (framesRemaining > 1) {
        scheduleFrame(generation, framesRemaining - 1);
        return;
      }
      measureLines();
    });
  }

  function rectangle(element: Element): SemanticZoomRectangle {
    const bounds = element.getBoundingClientRect();
    return {
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height,
    };
  }

  function synchronizeObservedBoxes(elements: readonly Element[]): void {
    if (!resizeObserver) return;
    for (const element of observedBoxes) {
      if (!elements.includes(element)) {
        resizeObserver.unobserve(element);
      }
    }
    for (const element of elements) {
      if (observedBoxes.includes(element)) continue;
      resizeObserver.observe(element);
    }
    observedBoxes = [...elements];
  }

  function measureLines(): void {
    if (!stage?.isConnected || !isResting) return;
    const focus = stage.querySelector<HTMLElement>(
      '[data-semantic-zoom-focus-card]',
    );
    const leafwardElements = [
      ...stage.querySelectorAll<HTMLElement>(
        '[data-semantic-zoom-leafward-edge-id]',
      ),
    ];
    const rootwardElements = [
      ...stage.querySelectorAll<HTMLElement>(
        '[data-semantic-zoom-rootward-position]',
      ),
    ];
    synchronizeObservedBoxes([
      ...(focus ? [focus] : []),
      ...leafwardElements,
      ...rootwardElements,
    ]);

    const stageBox = rectangle(stage);
    stageWidth = Math.max(1, stageBox.width);
    stageHeight = Math.max(1, stageBox.height);

    const leafwardTargets = leafwardElements.flatMap((element) => {
      const edgeId = element.dataset.semanticZoomLeafwardEdgeId;
      const nodeId = element.dataset.semanticZoomLineNodeId;
      const visibleOrder = Number(element.dataset.carouselVisibleOrder);
      if (!edgeId || !nodeId || !Number.isInteger(visibleOrder)) return [];
      return [
        {
          edgeId,
          nodeId,
          visibleOrder,
          terminal:
            element.dataset.relationshipDisposition === 'terminalCycleClosure',
          visible: isVisibleGeometryTarget(element),
          box: rectangle(element),
        } satisfies LeafwardLineTarget,
      ];
    });

    const rootwardItems: RootwardLineItem[] = rootwardElements.flatMap(
      (element) => {
        const nodeId = element.dataset.semanticZoomLineNodeId;
        const journeyPosition = Number(element.dataset.journeyPosition);
        if (!nodeId || !Number.isInteger(journeyPosition)) return [];
        return [
          {
            nodeId,
            journeyPosition,
            role:
              element.dataset.semanticZoomLineRole === 'history'
                ? ('history' as const)
                : ('previous' as const),
            visible: isVisibleGeometryTarget(element),
            box: rectangle(element),
          },
        ];
      },
    );
    if (focus) {
      const nodeId = focus.dataset.semanticZoomLineNodeId;
      const journeyPosition = Number(focus.dataset.journeyPosition);
      if (nodeId && Number.isInteger(journeyPosition)) {
        rootwardItems.push({
          nodeId,
          journeyPosition,
          role: 'focus',
          visible: isVisibleGeometryTarget(focus),
          box: rectangle(focus),
        });
      }
    }

    lines = [
      ...buildLeafwardRelationshipLines(
        stageBox,
        focus ? rectangle(focus) : undefined,
        leafwardTargets,
      ),
      ...buildRootwardJourneyLines(stageBox, rootwardItems),
    ];
  }

  function isVisibleGeometryTarget(element: HTMLElement): boolean {
    if (element.hidden || element.getAttribute('aria-hidden') === 'true') {
      return false;
    }
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }
</script>

<svg
  bind:this={lineLayer}
  class="semantic-zoom-relationship-lines"
  viewBox={`0 0 ${stageWidth} ${stageHeight}`}
  preserveAspectRatio="none"
  aria-hidden="true"
  focusable="false"
  data-semantic-zoom-lines-state={isResting ? 'resting' : 'moving'}
  data-semantic-zoom-stage-width={stageWidth}
  data-semantic-zoom-stage-height={stageHeight}
  data-semantic-zoom-relationship-lines
>
  {#each lines as line (line.key)}
    <path
      class:leafward={line.kind === 'leafward'}
      class:rootward={line.kind === 'rootward'}
      class:terminal={line.terminal}
      d={line.path}
      data-semantic-zoom-line-key={line.key}
      data-semantic-zoom-line-kind={line.kind}
      data-semantic-zoom-line-terminal={line.terminal ? 'true' : undefined}
      data-semantic-zoom-line-source={line.sourceIdentity}
      data-semantic-zoom-line-target={line.targetIdentity}
      data-semantic-zoom-line-from-x={line.from.x}
      data-semantic-zoom-line-from-y={line.from.y}
      data-semantic-zoom-line-to-x={line.to.x}
      data-semantic-zoom-line-to-y={line.to.y}
      vector-effect="non-scaling-stroke"
    />
  {/each}
</svg>

<style>
  .semantic-zoom-relationship-lines {
    position: absolute;
    z-index: 0;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    pointer-events: none;
  }

  path {
    fill: none;
    stroke-width: 3;
    stroke-linecap: round;
  }

  path.leafward {
    stroke: var(--colour-element);
  }

  path.rootward {
    stroke: var(--colour-metadata);
  }

  path.terminal {
    stroke: var(--colour-border-strong);
    stroke-dasharray: 5 5;
    stroke-linecap: butt;
  }
</style>
