<script lang="ts">
  export let visibleLabel: string;
  export let accessibleLabel: string;
  export let direction:
    | 'leafward-previous'
    | 'leafward-next'
    | 'rootward-closer'
    | 'rootward-earlier';
  export let onActivate: () => void;
</script>

<button
  type="button"
  class="side-window-control side-window-control-{direction}"
  aria-label={accessibleLabel}
  data-carousel-side-window-control
  data-carousel-window-direction={direction}
  data-carousel-gesture-ignore
  onclick={onActivate}
>
  {visibleLabel}
</button>

<style>
  .side-window-control {
    min-width: var(--control-min-size);
    min-height: var(--control-min-size);
    padding: var(--space-2);
    border: 1px dashed var(--colour-border-strong);
    border-radius: var(--radius-medium);
    background: var(--colour-panel-subtle);
    color: var(--colour-text-secondary);
    font-size: var(--font-size-xs);
    font-weight: 700;
    line-height: 1.2;
    cursor: pointer;
  }

  .side-window-control:hover {
    border-style: solid;
    border-color: var(--colour-accent);
    background: var(--colour-accent-soft);
    color: var(--colour-text);
  }

  .side-window-control:focus-visible {
    outline: 3px solid var(--colour-focus-ring);
    outline-offset: 2px;
  }

  @media (orientation: landscape) and (max-height: 520px) {
    .side-window-control {
      min-height: var(--control-min-size);
      padding-block: var(--space-1);
    }
  }

  @media (forced-colors: active) {
    .side-window-control {
      border-color: CanvasText;
      background: ButtonFace;
      color: ButtonText;
    }

    .side-window-control:hover {
      border-style: solid;
      border-color: Highlight;
      background: ButtonFace;
      color: ButtonText;
    }

    .side-window-control:focus-visible {
      outline-color: Highlight;
    }
  }
</style>
