<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { get } from 'svelte/store';
  import { inspectorStore } from '../../app/stores/inspectorStore';
  import { navigationStore } from '../../app/stores/navigationStore';
  import { activeProjectStore } from '../../app/stores/projectStore';
  import { projectSessionResetStore } from '../../app/stores/projectSessionResetStore';
  import type { NodeCenterRequest } from '../../app/stores/navigationCentering';
  import { buildInspectorSummary } from '../inspector/inspectorSummary';
  import NodeInspector from '../inspector/NodeInspector.svelte';

  const { inspectedNodeId, hasTarget } = inspectorStore;
  const { currentFocusNodeId } = navigationStore;
  let observedInspectedNodeId: string | undefined;

  $: inspectorSummary = $inspectedNodeId
    ? buildInspectorSummary(
        $activeProjectStore.project,
        $inspectedNodeId,
        $activeProjectStore.dtdAttributesByNodeId,
        $activeProjectStore.commentsByNodeId,
        $activeProjectStore.sourceMarkupByNodeId,
        $activeProjectStore.xsdMetadataByNodeId,
        $navigationStore,
        $activeProjectStore.unresolvedReferences,
      )
    : undefined;
  $: if ($inspectedNodeId !== observedInspectedNodeId) {
    observedInspectedNodeId = $inspectedNodeId;
    if ($inspectedNodeId) void focusOverlayInspectorEntry();
  }
  $: childListResetKey = `${$activeProjectStore.project.id}\u0000${$projectSessionResetStore.revision}\u0000${$inspectedNodeId ?? ''}`;

  onMount(() => {
    const overlayQuery = window.matchMedia?.('(max-width: 1099px)');
    const handleOverlayChange = (event: MediaQueryListEvent): void => {
      if (event.matches && get(inspectedNodeId)) {
        const activeElement = document.activeElement;
        if (
          activeElement instanceof HTMLElement &&
          activeElement.closest('[data-carousel-side-window]')
        ) {
          return;
        }
        void focusOverlayInspectorEntry();
      }
    };

    if (overlayQuery?.media !== '(max-width: 1099px)') return;

    overlayQuery.addEventListener('change', handleOverlayChange);
    return () => {
      overlayQuery.removeEventListener('change', handleOverlayChange);
    };
  });

  function isRendered(element: HTMLElement): boolean {
    let current: HTMLElement | null = element;
    while (current) {
      const style = getComputedStyle(current);
      if (style.display === 'none' || style.visibility === 'hidden')
        return false;
      current = current.parentElement;
    }
    return true;
  }

  function centerNode(request: NodeCenterRequest): void {
    navigationStore.centerNode({ ...request, origin: 'inspector' });
  }

  async function focusOverlayInspectorEntry(): Promise<void> {
    await tick();
    const usesOverlay = window.matchMedia?.('(max-width: 1099px)').matches;
    if (!usesOverlay) return;

    document
      .querySelector<HTMLButtonElement>('[data-inspector-close]')
      ?.focus({ preventScroll: true });
  }

  async function centerInspectedNode(): Promise<void> {
    const targetNodeId = get(inspectedNodeId);
    if (!targetNodeId) return;

    const result = navigationStore.centerNode({
      targetNodeId,
      origin: 'inspector',
    });
    if (!result.applied) return;

    await tick();
    document
      .querySelector<HTMLButtonElement>('[data-inspector-close]')
      ?.focus({ preventScroll: true });
  }

  async function close(): Promise<void> {
    const targetNodeId = get(inspectedNodeId);
    inspectorStore.close();
    await tick();

    // Closing removes the close button. Return focus to the originating card's
    // Inspect control when it survives, or to the current-focus Inspect control.
    const focusNodeId = get(currentFocusNodeId);
    const preferred = targetNodeId
      ? document.querySelector<HTMLButtonElement>(
          `[data-inspect-node-id="${targetNodeId}"]`,
        )
      : undefined;
    const fallback = document.querySelector<HTMLButtonElement>(
      `[data-inspect-node-id="${focusNodeId}"]`,
    );
    const preferredIsVisible = preferred && isRendered(preferred);
    (preferredIsVisible ? preferred : fallback)?.focus();
  }
</script>

<aside
  class:has-target={$hasTarget}
  class="inspector-panel"
  aria-label="Schema inspector"
>
  {#if inspectorSummary}
    <NodeInspector
      summary={inspectorSummary}
      isCurrentFocus={inspectorSummary.nodeId === $currentFocusNodeId}
      onCenter={() => void centerInspectedNode()}
      onCenterNode={centerNode}
      onClose={() => void close()}
      {childListResetKey}
    />
  {:else}
    <div class="empty-heading">
      <p class="eyebrow">Inspector</p>
      <h2>Nothing inspected</h2>
    </div>
    <div class="empty-content">
      <p>
        Use Inspect from a carousel card, Navigation, or Search to open node
        details without changing carousel focus.
      </p>
    </div>
  {/if}
</aside>

<style>
  .inspector-panel {
    grid-area: inspector;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border-left: 1px solid var(--colour-border);
    background: var(--colour-panel);
  }

  .empty-heading {
    min-height: var(--panel-header-height);
    padding: var(--space-3) var(--space-5);
    border-bottom: 1px solid var(--colour-border);
  }

  .eyebrow {
    margin-bottom: var(--space-1);
    color: var(--colour-text-muted);
    font-size: var(--font-size-xs);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  h2 {
    margin: 0;
    font-size: var(--font-size-lg);
    line-height: 1.25;
  }

  .empty-content {
    padding: var(--space-5);
  }

  .empty-content p {
    margin: 0;
    padding: var(--space-4);
    border: 1px solid var(--colour-border-subtle);
    border-radius: var(--radius-medium);
    background: var(--colour-panel-subtle);
    color: var(--colour-text-secondary);
    font-size: var(--font-size-sm);
  }

  @media (max-width: 1099px) {
    .inspector-panel {
      position: fixed;
      z-index: 20;
      top: var(--top-bar-height);
      right: 0;
      bottom: 0;
      display: none;
      width: min(92vw, var(--inspector-width));
      border-top: 1px solid var(--colour-border);
      box-shadow: var(--shadow-medium);
    }

    .inspector-panel.has-target {
      display: block;
    }
  }

  @media (max-width: 699px) and (orientation: portrait) {
    .inspector-panel.has-target {
      top: auto;
      right: max(0px, env(safe-area-inset-right));
      bottom: max(0px, env(safe-area-inset-bottom));
      left: max(0px, env(safe-area-inset-left));
      width: auto;
      height: min(66dvh, calc(100dvh - var(--top-bar-height) - 180px));
      max-height: 66dvh;
      overflow-x: hidden;
      overflow-y: hidden;
      overscroll-behavior: contain;
      border-top: 1px solid var(--colour-border-strong);
      border-left: 0;
      border-radius: var(--radius-card) var(--radius-card) 0 0;
      box-shadow: 0 -8px 24px rgb(23 33 43 / 18%);
      scroll-padding-bottom: env(safe-area-inset-bottom);
    }
  }
</style>
