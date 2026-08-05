<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    semanticZoomLevelLabel,
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
  const wheelController = createSemanticZoomWheelController();

  let announcement = '';
  let wheelSettleTimeout: number | undefined;
  let observedAvailability = isAvailable;

  $: if (isAvailable !== observedAvailability) {
    observedAvailability = isAvailable;
    if (!isAvailable) resetWheelInteraction();
  }

  $: currentLabel = semanticZoomLevelLabel(presentation);
  $: rangeValue = semanticZoomControlValue(presentation);
  $: canZoomOut = presentation === 'full';
  $: canZoomIn = presentation === 'compact';

  onDestroy(resetWheelInteraction);

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
    if (nextPresentation === presentation) return false;
    onSelect(nextPresentation);
    announcement = `Semantic zoom: ${semanticZoomLevelLabel(nextPresentation)}.`;
    return true;
  }

  function handleRangeInput(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const nextPresentation =
      implementedSemanticZoomPresentationFromControlValue(input.valueAsNumber);
    if (nextPresentation) selectPresentation(nextPresentation);
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
    if (
      (presentation === 'compact' && action === 'zoomOut') ||
      (presentation === 'full' && action === 'zoomIn')
    ) {
      return;
    }

    scheduleWheelSettle();
    const state: SemanticZoomState = {
      requestedLevel: presentation,
      effectiveLevel: presentation,
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
    aria-label="Semantic zoom controls"
    data-semantic-zoom-control
    data-carousel-gesture-ignore
    onwheel={handleWheel}
  >
    <span class="control-label">Zoom</span>
    <button
      type="button"
      aria-label="Zoom out to Compact"
      disabled={!canZoomOut}
      onclick={() => selectPresentation('compact')}
    >
      <span aria-hidden="true">−</span>
    </button>
    <input
      type="range"
      min="1"
      max="2"
      step="1"
      value={rangeValue}
      aria-label="Semantic zoom"
      aria-valuetext={currentLabel}
      oninput={handleRangeInput}
    />
    <button
      type="button"
      aria-label="Zoom in to Full detail"
      disabled={!canZoomIn}
      onclick={() => selectPresentation('full')}
    >
      <span aria-hidden="true">+</span>
    </button>
    <span class="current-level">{currentLabel}</span>
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
    width: clamp(88px, 10vw, 132px);
    min-height: var(--control-min-size);
    accent-color: var(--colour-accent);
    cursor: pointer;
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
</style>
