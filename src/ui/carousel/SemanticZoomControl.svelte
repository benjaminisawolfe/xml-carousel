<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    semanticZoomLevelLabel,
    stepSemanticZoom,
    type SemanticZoomState,
  } from '../../app/stores/semanticZoomStore';
  import {
    createSemanticZoomWheelController,
    semanticZoomWheelAction,
  } from './semanticZoomInput';
  import {
    implementedSemanticZoomPresentationFromControlValue,
    isImplementedSemanticZoomPresentation,
    semanticZoomControlValue,
    type ImplementedSemanticZoomPresentation,
  } from './semanticZoomPresentation';

  export let isAvailable: boolean;
  export let presentation: ImplementedSemanticZoomPresentation;
  export let onSelect: (
    presentation: ImplementedSemanticZoomPresentation,
  ) => void;

  const WHEEL_SETTLE_MS = 180;
  const RANGE_DESCRIPTION_ID = 'semantic-zoom-range-description';
  const wheelController = createSemanticZoomWheelController();

  let announcement = '';
  let wheelSettleTimeout: number | undefined;
  let observedAvailability = isAvailable;
  let lastAcceptedPresentation = presentation;
  let pendingRangePresentation: ImplementedSemanticZoomPresentation | undefined;
  let pendingBoundaryFocusPresentation:
    ImplementedSemanticZoomPresentation | undefined;
  let rangeUpdateQueued = false;
  let rangeElement: HTMLInputElement;
  let boundaryFocusFrame: number | undefined;
  let destroyed = false;

  $: if (isAvailable !== observedAvailability) {
    observedAvailability = isAvailable;
    if (!isAvailable) resetWheelInteraction();
  }
  $: if (presentation !== lastAcceptedPresentation) {
    lastAcceptedPresentation = presentation;
  }
  $: if (presentation === pendingBoundaryFocusPresentation) {
    pendingBoundaryFocusPresentation = undefined;
    if (boundaryFocusFrame !== undefined) {
      window.cancelAnimationFrame(boundaryFocusFrame);
    }
    boundaryFocusFrame = window.requestAnimationFrame(() => {
      boundaryFocusFrame = undefined;
      const activeElement = document.activeElement;
      if (
        destroyed ||
        (activeElement !== document.body &&
          !(
            activeElement instanceof HTMLElement &&
            activeElement.closest('[data-semantic-zoom-control]')
          ))
      ) {
        return;
      }
      rangeElement.focus({ preventScroll: true });
    });
  }

  $: currentLabel = semanticZoomLevelLabel(presentation);
  $: rangeValue = semanticZoomControlValue(presentation);
  $: zoomOutTarget = stepSemanticZoom(presentation, 'out');
  $: zoomInTarget = stepSemanticZoom(presentation, 'in');
  $: canZoomOut = zoomOutTarget !== presentation;
  $: canZoomIn = zoomInTarget !== presentation;

  onDestroy(() => {
    destroyed = true;
    pendingRangePresentation = undefined;
    pendingBoundaryFocusPresentation = undefined;
    if (boundaryFocusFrame !== undefined) {
      window.cancelAnimationFrame(boundaryFocusFrame);
      boundaryFocusFrame = undefined;
    }
    resetWheelInteraction();
  });

  function resetWheelInteraction(): void {
    if (wheelSettleTimeout !== undefined) {
      window.clearTimeout(wheelSettleTimeout);
      wheelSettleTimeout = undefined;
    }
    wheelController.reset();
  }

  function scheduleWheelSettle(): void {
    if (wheelSettleTimeout !== undefined) {
      window.clearTimeout(wheelSettleTimeout);
    }
    wheelSettleTimeout = window.setTimeout(() => {
      wheelSettleTimeout = undefined;
      wheelController.settle();
    }, WHEEL_SETTLE_MS);
  }

  function selectPresentation(
    nextPresentation: ImplementedSemanticZoomPresentation,
  ): boolean {
    if (nextPresentation === lastAcceptedPresentation) return false;
    lastAcceptedPresentation = nextPresentation;
    onSelect(nextPresentation);
    announcement = `Semantic zoom: ${semanticZoomLevelLabel(nextPresentation)}.`;
    return true;
  }

  function handleRangeInput(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const nextPresentation =
      implementedSemanticZoomPresentationFromControlValue(input.valueAsNumber);
    if (!nextPresentation) return;

    pendingRangePresentation = nextPresentation;
    if (rangeUpdateQueued) return;
    rangeUpdateQueued = true;
    queueMicrotask(() => {
      rangeUpdateQueued = false;
      if (destroyed) return;
      const pending = pendingRangePresentation;
      pendingRangePresentation = undefined;
      if (pending) selectPresentation(pending);
    });
  }

  function handleButtonSelect(
    nextPresentation: ImplementedSemanticZoomPresentation,
    reachesBoundary: boolean,
  ): void {
    if (reachesBoundary) rangeElement.focus({ preventScroll: true });
    if (!selectPresentation(nextPresentation)) return;
    if (reachesBoundary) pendingBoundaryFocusPresentation = nextPresentation;
  }

  function handleWheel(event: WheelEvent): void {
    const input = {
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
    };
    const action = semanticZoomWheelAction(input);
    if (!action) return;
    const boundaryTarget = stepSemanticZoom(
      lastAcceptedPresentation,
      action === 'zoomOut' ? 'out' : 'in',
    );
    if (boundaryTarget === lastAcceptedPresentation) {
      return;
    }

    scheduleWheelSettle();
    const state: SemanticZoomState = {
      requestedLevel: lastAcceptedPresentation,
      effectiveLevel: lastAcceptedPresentation,
      isAvailable,
    };
    const decision = wheelController.handle(input, state);
    if (
      !decision.consumed ||
      !isImplementedSemanticZoomPresentation(decision.nextLevel)
    ) {
      return;
    }

    event.preventDefault();
    selectPresentation(decision.nextLevel);
  }
</script>

{#if isAvailable}
  <section
    class="semantic-zoom-control"
    role="group"
    aria-label="Semantic zoom"
    data-semantic-zoom-control
    data-carousel-gesture-ignore
    onwheel={handleWheel}
  >
    <span class="control-label">Zoom</span>
    <button
      type="button"
      aria-label={`Zoom out to ${semanticZoomLevelLabel(zoomOutTarget)}`}
      disabled={!canZoomOut}
      onclick={() =>
        handleButtonSelect(zoomOutTarget, zoomOutTarget === 'overview')}
    >
      <span aria-hidden="true">−</span>
    </button>
    <input
      bind:this={rangeElement}
      type="range"
      min="0"
      max="2"
      step="1"
      value={rangeValue}
      aria-label="Semantic zoom"
      aria-valuetext={currentLabel}
      aria-describedby={RANGE_DESCRIPTION_ID}
      oninput={handleRangeInput}
    />
    <button
      type="button"
      aria-label={`Zoom in to ${semanticZoomLevelLabel(zoomInTarget)}`}
      disabled={!canZoomIn}
      onclick={() => handleButtonSelect(zoomInTarget, zoomInTarget === 'full')}
    >
      <span aria-hidden="true">+</span>
    </button>
    <span class="current-level">{currentLabel}</span>
    <span id={RANGE_DESCRIPTION_ID} class="visually-hidden">
      Use arrow keys to choose Overview, Compact, or Full detail. You can also
      use the mouse wheel while pointing at or focusing the zoom control.
    </span>
    <span
      class="visually-hidden"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {announcement}
    </span>
  </section>
{/if}

<style>
  .semantic-zoom-control {
    position: relative;
    z-index: 5;
    grid-row: 1;
    display: flex;
    min-width: 0;
    align-items: center;
    justify-self: end;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    margin: var(--space-2);
    border: 1px solid var(--colour-border-strong);
    border-radius: var(--radius-large);
    background: var(--colour-panel-raised);
    box-shadow: var(--shadow-low);
    touch-action: manipulation;
  }

  .control-label,
  .current-level {
    color: var(--colour-text);
    font-size: var(--font-size-sm);
    font-weight: 700;
    white-space: nowrap;
  }

  .current-level {
    min-width: 6.5rem;
    color: var(--colour-text-secondary);
  }

  button {
    width: var(--control-min-size);
    min-width: var(--control-min-size);
    height: var(--control-min-size);
    padding: 0;
    border: 1px solid var(--colour-accent);
    border-radius: var(--radius-medium);
    background: var(--colour-accent);
    color: var(--colour-text-inverse);
    font-size: var(--font-size-xl);
    font-weight: 700;
    cursor: pointer;
    touch-action: manipulation;
  }

  button:hover:not(:disabled) {
    background: var(--colour-accent-hover);
  }

  button:disabled {
    border-color: var(--colour-border-subtle);
    background: var(--colour-panel-subtle);
    color: var(--colour-text-muted);
    cursor: not-allowed;
  }

  input[type='range'] {
    width: clamp(72px, 10cqi, 132px);
    min-width: 72px;
    min-height: var(--control-min-size);
    accent-color: var(--colour-accent);
    cursor: pointer;
    touch-action: manipulation;
  }

  button:focus-visible,
  input:focus-visible {
    outline: 3px solid var(--colour-focus-ring);
    outline-offset: 2px;
  }

  .visually-hidden {
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

  @container carousel (max-width: 760px) {
    .semantic-zoom-control {
      max-width: calc(100% - var(--space-2) * 2);
      gap: var(--space-1);
      padding: var(--space-1) var(--space-2);
      margin: var(--space-1);
    }

    .control-label {
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

    .current-level {
      min-width: 5.75rem;
    }
  }

  @container carousel (max-width: 460px) {
    input[type='range'] {
      width: 72px;
    }

    .current-level {
      min-width: 0;
      overflow-wrap: anywhere;
      white-space: normal;
    }
  }

  @media (forced-colors: active) {
    .semantic-zoom-control {
      border: 2px solid CanvasText;
      background: Canvas;
      color: CanvasText;
      box-shadow: none;
    }

    .control-label,
    .current-level {
      color: CanvasText;
    }

    button {
      border-color: ButtonText;
      background: ButtonFace;
      color: ButtonText;
    }

    button:disabled {
      border-color: GrayText;
      border-style: dashed;
      background: Canvas;
      color: GrayText;
    }

    input[type='range'] {
      accent-color: Highlight;
    }

    button:focus-visible,
    input:focus-visible {
      outline-color: Highlight;
    }
  }
</style>
