<script lang="ts">
  import { flushSync, onMount, tick } from 'svelte';
  import { inspectorStore } from '../../app/stores/inspectorStore';
  import type { NodeCenterRequest } from '../../app/stores/navigationCentering';
  import { navigationStore } from '../../app/stores/navigationStore';
  import { activeProjectStore } from '../../app/stores/projectStore';
  import { projectSessionResetStore } from '../../app/stores/projectSessionResetStore';
  import {
    SEMANTIC_ZOOM_DESKTOP_MEDIA_QUERY,
    semanticZoomStore,
    type SemanticZoomLevel,
  } from '../../app/stores/semanticZoomStore';
  import {
    getOutgoingStructuralRelationships,
    getSchemaNode,
    type SchemaNodeId,
    type SchemaRelationship,
  } from '../../schema/model';
  import BranchFan from './BranchFan.svelte';
  import FocusCard from './FocusCard.svelte';
  import SemanticZoomControl from './SemanticZoomControl.svelte';
  import SemanticZoomRelationshipLines from './SemanticZoomRelationshipLines.svelte';
  import { buildFocusCardSummary } from './focusCardSummary';
  import RootwardPath from './RootwardPath.svelte';
  import {
    measureRenderedLeafwardCandidates,
    PointerGestureController,
    type PointerGestureSnapshot,
  } from './gesture/pointerGestureController';
  import {
    beginDirectManipulation,
    beginGestureCommit,
    beginSnapBack,
    buildJourneyMotionKey,
    calculateGestureInverseTransform,
    createRestingPresentationState,
    finishGesturePresentation,
    GESTURE_PRESENTATION_DURATIONS_MS,
    getPresentationDurationMs,
    type GestureMotionGeometry,
    type GestureCommitDirection,
    type GesturePresentationState,
  } from './gesture/gesturePresentation';
  import { formatSchemaNodeKind } from './nodePresentation';
  import { getRootwardHistoryRowCountForStage } from './carouselWindowing';
  import { getSchemaNodeDisplayName } from '../presentation/xsdMetadataPresentation';
  import { buildJourneyRelationshipPresentation } from '../presentation/schemaRelationshipPresentation';
  import {
    getActionableLeafwardRelationships,
    moveKeyboardSelectedRelationshipId,
    resolveKeyboardSelectedRelationshipId,
    type KeyboardSelectionDirection,
  } from './keyboardNavigation';
  import {
    resolveImplementedSemanticZoomPresentation,
    type ImplementedSemanticZoomPresentation,
  } from './semanticZoomPresentation';

  const {
    canNavigateRootward,
    currentFocusNode,
    leafwardRelationships,
    navigationPathIds,
    rootwardPathNodes,
  } = navigationStore;
  const { inspectedNodeId } = inspectorStore;

  const interactiveKeyboardSelector = [
    'input',
    'textarea',
    'select',
    'button',
    'a',
    'summary',
    'pre',
    'code',
    '[data-focus-card-scroll-region]',
    '[contenteditable]:not([contenteditable="false"])',
  ].join(',');
  const interactiveAriaRoles = new Set([
    'button',
    'checkbox',
    'combobox',
    'gridcell',
    'link',
    'listbox',
    'menuitem',
    'menuitemcheckbox',
    'menuitemradio',
    'option',
    'radio',
    'searchbox',
    'slider',
    'spinbutton',
    'switch',
    'tab',
    'textbox',
    'treeitem',
  ]);

  let focusCard: FocusCard;
  let announcement = '';
  let observedFocusNodeId: SchemaNodeId | undefined;
  let observedFocusProjectId: string | undefined;
  let observedFocusSessionRevision = 0;
  let observedPresentationSessionRevision = 0;
  let hasObservedInitialFocus = false;
  let gestureController: PointerGestureController | undefined;
  let gestureSurface: HTMLDivElement;
  let gestureLayer: HTMLDivElement;
  let gestureSnapshot: PointerGestureSnapshot = {
    phase: 'idle',
    active: false,
    offsetX: 0,
    thresholdCrossed: false,
  };
  let presentationOffsetX = 0;
  let presentationState: GesturePresentationState =
    createRestingPresentationState();
  let prefersReducedMotion = false;
  let gestureStartedWithCarouselFocus = false;
  let pendingFocusTransfer: 'always' | 'gesture-owned' | 'none' = 'none';
  let presentationTimer: number | undefined;
  let inverseFrame: number | undefined;
  let playFrame: number | undefined;
  let animatedMotionElements: HTMLElement[] = [];
  let keyboardSelectedRelationshipId: string | undefined;
  let observedKeyboardSelectionKey = '';
  let carouselStageWidth =
    typeof window === 'undefined' ? Number.NaN : window.innerWidth;
  let carouselStageHeight =
    typeof window === 'undefined' ? Number.NaN : window.innerHeight;
  let carouselReflowRevision = 0;
  let observedCarouselStageWidth = Number.NaN;
  let observedCarouselStageHeight = Number.NaN;
  let pendingCarouselStageWidth = Number.NaN;
  let pendingCarouselStageHeight = Number.NaN;
  let carouselReflowFrame: number | undefined;
  let observedEffectiveSemanticZoomLevel: SemanticZoomLevel = 'full';
  let semanticZoomLifecycleMounted = false;

  $: leafwardPreviewRelationshipId =
    gestureSnapshot.semanticIntent === 'leafward'
      ? gestureSnapshot.previewRelationshipId
      : undefined;
  $: rootwardPreviewNodeId =
    gestureSnapshot.semanticIntent === 'rootward'
      ? gestureSnapshot.previewNodeId
      : undefined;
  $: focusCardSummary = $currentFocusNode
    ? buildFocusCardSummary(
        $activeProjectStore.project,
        $currentFocusNode.id,
        $activeProjectStore.commentsByNodeId,
        $activeProjectStore.xsdMetadataByNodeId,
        $navigationStore,
      )
    : undefined;
  $: actionableLeafwardRelationships = getActionableLeafwardRelationships(
    $activeProjectStore.project,
    $navigationStore,
    $leafwardRelationships,
  );
  $: keyboardSelectionKey = `${$activeProjectStore.project.id}\u0000${$projectSessionResetStore.revision}\u0000${$currentFocusNode?.id ?? ''}`;
  $: synchronizeKeyboardSelection(
    keyboardSelectionKey,
    actionableLeafwardRelationships,
  );
  $: rootwardHistoryRowCount =
    getRootwardHistoryRowCountForStage(carouselStageHeight);
  $: implementedSemanticZoomPresentation =
    resolveImplementedSemanticZoomPresentation(
      $semanticZoomStore.effectiveLevel,
    );
  $: {
    const nextEffectiveLevel = $semanticZoomStore.effectiveLevel;
    if (nextEffectiveLevel !== observedEffectiveSemanticZoomLevel) {
      observedEffectiveSemanticZoomLevel = nextEffectiveLevel;
      if (semanticZoomLifecycleMounted) {
        handleEffectiveSemanticZoomChange();
      }
    }
  }

  onMount(() => {
    const semanticZoomQuery = window.matchMedia?.(
      SEMANTIC_ZOOM_DESKTOP_MEDIA_QUERY,
    );
    const reducedMotionQuery = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    );
    prefersReducedMotion = reducedMotionQuery?.matches ?? false;

    gestureController = new PointerGestureController({
      surface: gestureSurface,
      getJourneyNodeIds: () => $navigationPathIds,
      getRenderedLeafwardCandidates: () =>
        measureRenderedLeafwardCandidates(gestureSurface),
      onNavigateLeafward: (nodeId, relationshipId) => {
        commitGestureNavigation('leafward', nodeId, relationshipId);
      },
      onNavigateRootward: () => {
        commitGestureNavigation('rootward');
      },
      onSnapshot: handleGestureSnapshot,
    });
    semanticZoomLifecycleMounted = true;
    semanticZoomStore.setDesktopAvailability(
      semanticZoomQuery?.matches ?? false,
    );

    const handleSemanticZoomAvailabilityChange = (
      event: MediaQueryListEvent,
    ): void => {
      const focusedCarouselAction =
        !event.matches &&
        document.activeElement instanceof HTMLElement &&
        gestureSurface.contains(document.activeElement)
          ? document.activeElement
          : undefined;
      semanticZoomStore.setDesktopAvailability(event.matches);
      if (focusedCarouselAction) {
        void preserveCarouselFocusAfterSemanticZoomChange(
          focusedCarouselAction,
        );
      }
    };
    const handleReducedMotionChange = (event: MediaQueryListEvent): void => {
      prefersReducedMotion = event.matches;
      if (presentationState.phase !== 'direct-manipulation') {
        finishPresentationImmediately();
      }
    };
    const measureCarouselStage = (): void => {
      const bounds = gestureSurface.getBoundingClientRect();
      scheduleCarouselReflow(
        bounds.width > 0 ? bounds.width : window.innerWidth,
        bounds.height > 0 ? bounds.height : window.innerHeight,
      );
    };
    const initialBounds = gestureSurface.getBoundingClientRect();
    const initialWidth =
      initialBounds.width > 0 ? initialBounds.width : window.innerWidth;
    const initialHeight =
      initialBounds.height > 0 ? initialBounds.height : window.innerHeight;
    observedCarouselStageWidth = initialWidth;
    observedCarouselStageHeight = initialHeight;
    carouselStageWidth = initialWidth;
    carouselStageHeight = initialHeight;
    carouselReflowRevision += 1;
    const resizeObserver =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver((entries) => {
            const entry = entries.find(
              ({ target }) => target === gestureSurface,
            );
            if (!entry) return;
            scheduleCarouselReflow(
              entry.contentRect.width,
              entry.contentRect.height,
            );
          })
        : undefined;

    semanticZoomQuery?.addEventListener(
      'change',
      handleSemanticZoomAvailabilityChange,
    );
    reducedMotionQuery?.addEventListener('change', handleReducedMotionChange);
    if (resizeObserver) {
      resizeObserver.observe(gestureSurface);
    } else {
      window.addEventListener('resize', measureCarouselStage);
      window.addEventListener('orientationchange', measureCarouselStage);
    }
    window.addEventListener('keydown', handleCarouselKeydown);

    return () => {
      semanticZoomLifecycleMounted = false;
      gestureController?.destroy();
      gestureController = undefined;
      semanticZoomQuery?.removeEventListener(
        'change',
        handleSemanticZoomAvailabilityChange,
      );
      reducedMotionQuery?.removeEventListener(
        'change',
        handleReducedMotionChange,
      );
      resizeObserver?.disconnect();
      if (!resizeObserver) {
        window.removeEventListener('resize', measureCarouselStage);
        window.removeEventListener('orientationchange', measureCarouselStage);
      }
      window.removeEventListener('keydown', handleCarouselKeydown);
      if (carouselReflowFrame !== undefined) {
        window.cancelAnimationFrame(carouselReflowFrame);
        carouselReflowFrame = undefined;
      }
      clearPresentationWork();
    };
  });

  function dimensionsMateriallyChanged(width: number, height: number): boolean {
    return (
      !Number.isFinite(observedCarouselStageWidth) ||
      !Number.isFinite(observedCarouselStageHeight) ||
      Math.abs(width - observedCarouselStageWidth) > 0.5 ||
      Math.abs(height - observedCarouselStageHeight) > 0.5
    );
  }

  function scheduleCarouselReflow(width: number, height: number): void {
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      return;
    }
    pendingCarouselStageWidth = width;
    pendingCarouselStageHeight = height;
    if (carouselReflowFrame !== undefined) return;

    carouselReflowFrame = window.requestAnimationFrame(() => {
      carouselReflowFrame = undefined;
      applyCarouselReflow(
        pendingCarouselStageWidth,
        pendingCarouselStageHeight,
      );
    });
  }

  function resetTransientReflowPresentation(): void {
    gestureController?.cancel();
    finishPresentationImmediately();
    gestureSnapshot = {
      phase: 'idle',
      active: false,
      offsetX: 0,
      thresholdCrossed: false,
    };
    setPresentationOffset(0);
  }

  function handleEffectiveSemanticZoomChange(): void {
    const focusedCarouselAction =
      document.activeElement instanceof HTMLElement &&
      gestureSurface?.contains(document.activeElement)
        ? document.activeElement
        : undefined;
    resetTransientReflowPresentation();
    carouselReflowRevision += 1;
    if (focusedCarouselAction) {
      void preserveCarouselFocusAfterSemanticZoomChange(focusedCarouselAction);
    }
  }

  async function preserveCarouselFocusAfterSemanticZoomChange(
    previouslyFocusedAction: HTMLElement,
  ): Promise<void> {
    await tick();
    if (!gestureSurface?.isConnected || previouslyFocusedAction.isConnected) {
      return;
    }
    focusCard?.focusHeading();
  }

  function applyCarouselReflow(width: number, height: number): void {
    if (!dimensionsMateriallyChanged(width, height)) return;

    const focusedSideAction =
      document.activeElement instanceof HTMLElement &&
      gestureSurface.contains(document.activeElement) &&
      document.activeElement.closest('[data-carousel-side-window]')
        ? document.activeElement
        : undefined;

    observedCarouselStageWidth = width;
    observedCarouselStageHeight = height;
    carouselStageWidth = width;
    carouselStageHeight = height;
    carouselReflowRevision += 1;
    resetTransientReflowPresentation();
    if (focusedSideAction) {
      void preserveSideFocusAfterReflow(focusedSideAction);
    }
  }

  async function preserveSideFocusAfterReflow(
    focusedSideAction: HTMLElement,
  ): Promise<void> {
    await tick();
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
    if (!gestureSurface?.isConnected) return;
    if (gestureSurface.contains(focusedSideAction)) return;
    keyboardSelectedRelationshipId = undefined;
    focusCard?.focusHeading();
  }

  $: {
    const nextFocusNodeId = $currentFocusNode?.id;
    const nextProjectId = $activeProjectStore.project.id;
    const nextSessionRevision = $projectSessionResetStore.revision;
    if (!hasObservedInitialFocus) {
      observedFocusNodeId = nextFocusNodeId;
      observedFocusProjectId = nextProjectId;
      observedFocusSessionRevision = nextSessionRevision;
      hasObservedInitialFocus = true;
    } else if (
      nextFocusNodeId &&
      (nextFocusNodeId !== observedFocusNodeId ||
        nextProjectId !== observedFocusProjectId ||
        nextSessionRevision !== observedFocusSessionRevision)
    ) {
      observedFocusNodeId = nextFocusNodeId;
      observedFocusProjectId = nextProjectId;
      const isProjectSessionReset =
        nextSessionRevision !== observedFocusSessionRevision;
      observedFocusSessionRevision = nextSessionRevision;
      const focusTransfer = isProjectSessionReset
        ? 'none'
        : pendingFocusTransfer;
      pendingFocusTransfer = 'none';
      void completeCommittedNavigation(nextFocusNodeId, focusTransfer);
    }
  }

  $: if (
    $projectSessionResetStore.revision !== observedPresentationSessionRevision
  ) {
    observedPresentationSessionRevision = $projectSessionResetStore.revision;
    resetLocalPresentationState();
  }

  function hasCarouselNavigationFocus(): boolean {
    const activeElement = document.activeElement;
    return Boolean(
      activeElement instanceof HTMLElement &&
      gestureSurface.contains(activeElement) &&
      activeElement.matches('[data-carousel-navigation-action]'),
    );
  }

  function synchronizeKeyboardSelection(
    selectionKey: string,
    relationships: readonly SchemaRelationship[],
  ): void {
    if (selectionKey !== observedKeyboardSelectionKey) {
      observedKeyboardSelectionKey = selectionKey;
      keyboardSelectedRelationshipId = undefined;
      return;
    }

    keyboardSelectedRelationshipId = resolveKeyboardSelectedRelationshipId(
      relationships,
      keyboardSelectedRelationshipId,
    );
  }

  function isInteractiveKeyboardContext(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    if (target.closest(interactiveKeyboardSelector)) return true;

    for (
      let element: Element | null = target;
      element;
      element = element.parentElement
    ) {
      const role = element.getAttribute('role')?.trim().toLowerCase();
      if (role?.split(/\s+/).some((token) => interactiveAriaRoles.has(token))) {
        return true;
      }
    }

    return false;
  }

  function isKeyboardNavigationContext(event: KeyboardEvent): boolean {
    if (
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    ) {
      return false;
    }

    return (
      !isInteractiveKeyboardContext(event.target) &&
      !isInteractiveKeyboardContext(document.activeElement)
    );
  }

  function selectedKeyboardRelationship(): SchemaRelationship | undefined {
    return actionableLeafwardRelationships.find(
      ({ edge }) => edge.id === keyboardSelectedRelationshipId,
    );
  }

  function buildKeyboardSelectionAnnouncement(
    relationship: SchemaRelationship,
  ): string {
    const selectedIndex = actionableLeafwardRelationships.findIndex(
      ({ edge }) => edge.id === relationship.edge.id,
    );
    const displayName = getSchemaNodeDisplayName(
      $activeProjectStore.project,
      relationship.node,
      $activeProjectStore.xsdMetadataByNodeId,
    );
    const presentation = buildJourneyRelationshipPresentation(
      $activeProjectStore.project,
      $navigationStore,
      relationship,
    );
    const relationshipPrefix =
      relationship.edge.kind === 'contains' &&
      $currentFocusNode?.kind === 'dtdElement'
        ? ''
        : `${presentation?.relationshipLabel ?? 'Destination'} to `;

    const currentName = $currentFocusNode
      ? getSchemaNodeDisplayName(
          $activeProjectStore.project,
          $currentFocusNode,
          $activeProjectStore.xsdMetadataByNodeId,
        )
      : 'the current node';

    return `Selected leafward destination ${selectedIndex + 1} of ${actionableLeafwardRelationships.length}: ${relationshipPrefix}${displayName}, ${formatSchemaNodeKind(relationship.node.kind)}. Press Right Arrow, Enter, or Space to navigate. Press Left Arrow to return to ${currentName}.`;
  }

  function announceKeyboardSelection(): void {
    const relationship = selectedKeyboardRelationship();
    announcement = relationship
      ? buildKeyboardSelectionAnnouncement(relationship)
      : 'No leafward destination is available from the current focus.';
  }

  function clearKeyboardSelection(announceReturn: boolean): void {
    keyboardSelectedRelationshipId = undefined;
    if (!announceReturn || !$currentFocusNode) return;

    const currentName = getSchemaNodeDisplayName(
      $activeProjectStore.project,
      $currentFocusNode,
      $activeProjectStore.xsdMetadataByNodeId,
    );
    announcement = `Keyboard focus returned to current node: ${currentName}.`;
  }

  function announceUnavailableKeyboardAction(
    message: string,
    isRepeat: boolean,
  ): void {
    if (isRepeat) return;
    announcement = message;
  }

  function moveKeyboardSelection(
    direction: KeyboardSelectionDirection,
    event: KeyboardEvent,
  ): void {
    const nextRelationshipId = moveKeyboardSelectedRelationshipId(
      actionableLeafwardRelationships,
      keyboardSelectedRelationshipId,
      direction,
    );
    if (!nextRelationshipId) {
      event.preventDefault();
      announceUnavailableKeyboardAction(
        'No leafward destination is available from the current focus.',
        event.repeat,
      );
      return;
    }
    if (nextRelationshipId === keyboardSelectedRelationshipId) {
      event.preventDefault();
      announceUnavailableKeyboardAction(
        'No further leafward destination is available in that direction.',
        event.repeat,
      );
      return;
    }

    event.preventDefault();
    keyboardSelectedRelationshipId = nextRelationshipId;
    announceKeyboardSelection();
  }

  function navigateKeyboardLeafward(
    event: KeyboardEvent,
    relationship: SchemaRelationship | undefined,
  ): void {
    event.preventDefault();
    if (event.repeat) return;

    if (!relationship || !$currentFocusNode) {
      announceUnavailableKeyboardAction(
        'No leafward destination is available from the current focus.',
        event.repeat,
      );
      return;
    }

    pendingFocusTransfer = 'always';
    const result = navigationStore.navigateStructuralRelationship({
      edgeId: relationship.edge.id,
      sourceNodeId: relationship.edge.sourceNodeId,
      targetNodeId: relationship.edge.targetNodeId,
    });
    if (!result.applied) {
      pendingFocusTransfer = 'none';
      announceUnavailableKeyboardAction(
        'The selected leafward destination is unavailable.',
        event.repeat,
      );
      return;
    }

    clearKeyboardSelection(false);
    finishPresentationImmediately();
  }

  function navigateKeyboardRootward(event: KeyboardEvent): void {
    event.preventDefault();
    if (event.repeat) return;

    if (keyboardSelectedRelationshipId) {
      clearKeyboardSelection(true);
      return;
    }

    if (!$canNavigateRootward) {
      announceUnavailableKeyboardAction(
        'No previous journey step is available.',
        event.repeat,
      );
      return;
    }

    pendingFocusTransfer = 'always';
    const result = navigationStore.navigateRootward();
    if (!result.applied) {
      pendingFocusTransfer = 'none';
      announceUnavailableKeyboardAction(
        'No previous journey step is available.',
        event.repeat,
      );
      return;
    }

    clearKeyboardSelection(false);
    finishPresentationImmediately();
  }

  function handleCarouselKeydown(event: KeyboardEvent): void {
    if (!isKeyboardNavigationContext(event) || gestureSnapshot.active) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        moveKeyboardSelection(1, event);
        return;
      case 'ArrowUp':
        moveKeyboardSelection(-1, event);
        return;
      case 'ArrowRight':
        navigateKeyboardLeafward(
          event,
          selectedKeyboardRelationship() ?? actionableLeafwardRelationships[0],
        );
        return;
      case 'Enter':
      case ' ':
        if (keyboardSelectedRelationshipId) {
          navigateKeyboardLeafward(event, selectedKeyboardRelationship());
        }
        return;
      case 'ArrowLeft':
        navigateKeyboardRootward(event);
        return;
      case 'Escape':
        if (keyboardSelectedRelationshipId) {
          event.preventDefault();
          clearKeyboardSelection(true);
        }
        return;
    }
  }

  function setPresentationOffset(offsetX: number): void {
    presentationOffsetX = offsetX;
    gestureLayer?.style.setProperty('--gesture-offset', `${offsetX}px`);
  }

  function handleGestureSnapshot(snapshot: PointerGestureSnapshot): void {
    const wasActive = gestureSnapshot.active;

    if (snapshot.active && !wasActive) {
      finishPresentationImmediately();
      clearKeyboardSelection(false);
      gestureStartedWithCarouselFocus = hasCarouselNavigationFocus();
      presentationState = beginDirectManipulation();
      setPresentationOffset(snapshot.offsetX);
    } else if (snapshot.active) {
      setPresentationOffset(snapshot.offsetX);
    } else if (!snapshot.active && wasActive) {
      const commitIsPrepared =
        presentationState.phase === 'committing-leafward' ||
        presentationState.phase === 'committing-rootward' ||
        presentationState.phase === 'reduced-motion-commit';

      if (!commitIsPrepared) {
        presentationState = beginSnapBack();
        setPresentationOffset(0);
        schedulePresentationCompletion(presentationState);
      }
    }

    gestureSnapshot = snapshot;
  }

  function captureMotionGeometry(): Readonly<
    Record<string, GestureMotionGeometry>
  > {
    const geometry: Record<string, GestureMotionGeometry> = {};

    for (const element of gestureSurface.querySelectorAll<HTMLElement>(
      '[data-carousel-motion-key]',
    )) {
      const motionKey = element.dataset.carouselMotionKey;
      if (!motionKey) continue;
      const bounds = element.getBoundingClientRect();
      geometry[motionKey] = {
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
      };
    }

    return geometry;
  }

  function resetAnimatedMotionElements(): void {
    for (const element of animatedMotionElements) {
      element.style.removeProperty('transform');
      element.style.removeProperty('transform-origin');
      element.style.removeProperty('transition');
      element.style.removeProperty('will-change');
    }
    animatedMotionElements = [];
  }

  function clearPresentationWork(): void {
    if (presentationTimer !== undefined) {
      window.clearTimeout(presentationTimer);
      presentationTimer = undefined;
    }
    if (inverseFrame !== undefined) {
      window.cancelAnimationFrame(inverseFrame);
      inverseFrame = undefined;
    }
    if (playFrame !== undefined) {
      window.cancelAnimationFrame(playFrame);
      playFrame = undefined;
    }
    resetAnimatedMotionElements();
  }

  function finishPresentationImmediately(): void {
    clearPresentationWork();
    presentationState = finishGesturePresentation();
    gestureStartedWithCarouselFocus = false;
  }

  function resetLocalPresentationState(): void {
    gestureController?.cancel();
    clearPresentationWork();
    gestureSnapshot = {
      phase: 'idle',
      active: false,
      offsetX: 0,
      thresholdCrossed: false,
    };
    setPresentationOffset(0);
    presentationState = createRestingPresentationState();
    gestureStartedWithCarouselFocus = false;
    pendingFocusTransfer = 'none';
  }

  function schedulePresentationCompletion(
    state: GesturePresentationState,
  ): void {
    if (presentationTimer !== undefined) {
      window.clearTimeout(presentationTimer);
    }

    const duration = getPresentationDurationMs(state);
    presentationTimer = window.setTimeout(
      () => finishPresentationImmediately(),
      duration + GESTURE_PRESENTATION_DURATIONS_MS.fallbackBuffer,
    );
  }

  function handlePresentationTransitionEnd(event: TransitionEvent): void {
    if (event.propertyName !== 'transform') return;

    if (
      presentationState.phase === 'settling' &&
      event.target === gestureLayer
    ) {
      finishPresentationImmediately();
      return;
    }

    if (
      (presentationState.phase === 'committing-leafward' ||
        presentationState.phase === 'committing-rootward') &&
      event.target instanceof HTMLElement &&
      animatedMotionElements.includes(event.target) &&
      event.target.style.transition.includes('--duration-gesture-commit')
    ) {
      finishPresentationImmediately();
    }
  }

  async function animateCommittedNavigation(
    before: Readonly<Record<string, GestureMotionGeometry>>,
    expectedPhase: GesturePresentationState['phase'],
  ): Promise<void> {
    await tick();
    if (presentationState.phase !== expectedPhase) return;
    const mountedSurface = gestureSurface;
    if (!mountedSurface?.isConnected) return;

    flushSync(() => {
      setPresentationOffset(0);
    });

    const movingElements: HTMLElement[] = [];
    for (const element of mountedSurface.querySelectorAll<HTMLElement>(
      '[data-carousel-motion-key]',
    )) {
      const motionKey = element.dataset.carouselMotionKey;
      const previous = motionKey ? before[motionKey] : undefined;
      if (!previous) continue;

      const current = element.getBoundingClientRect();
      if (current.width <= 0 || current.height <= 0) continue;

      const { deltaX, deltaY, scaleX, scaleY } =
        calculateGestureInverseTransform(previous, current);
      const moved =
        Math.abs(deltaX) > 0.5 ||
        Math.abs(deltaY) > 0.5 ||
        Math.abs(scaleX - 1) > 0.005 ||
        Math.abs(scaleY - 1) > 0.005;
      if (!moved) continue;

      element.style.transition = 'none';
      element.style.transformOrigin = 'center center';
      element.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0) scale(${scaleX}, ${scaleY})`;
      element.style.willChange = 'transform';
      movingElements.push(element);
    }

    animatedMotionElements = movingElements;
    if (movingElements.length === 0) {
      schedulePresentationCompletion(presentationState);
      return;
    }

    inverseFrame = window.requestAnimationFrame(() => {
      inverseFrame = undefined;
      playFrame = window.requestAnimationFrame(() => {
        playFrame = undefined;
        if (presentationState.phase !== expectedPhase) return;

        for (const element of movingElements) {
          element.style.transition =
            'transform var(--duration-gesture-commit) var(--ease-standard)';
          element.style.transform = 'translate3d(0, 0, 0) scale(1, 1)';
        }
        schedulePresentationCompletion(presentationState);
      });
    });
  }

  function commitGestureNavigation(
    direction: GestureCommitDirection,
    targetNodeId?: SchemaNodeId,
    relationshipId?: string,
  ): void {
    const before = captureMotionGeometry();
    pendingFocusTransfer = gestureStartedWithCarouselFocus
      ? 'gesture-owned'
      : 'none';
    clearPresentationWork();
    gestureStartedWithCarouselFocus = false;

    const result = (() => {
      if (direction === 'rootward') {
        return navigationStore.navigateRootward();
      }
      if (!targetNodeId) return undefined;
      if (!relationshipId || !$currentFocusNode) return undefined;
      return navigationStore.navigateStructuralRelationship({
        edgeId: relationshipId,
        sourceNodeId: $currentFocusNode.id,
        targetNodeId,
      });
    })();

    if (!result?.applied) {
      pendingFocusTransfer = 'none';
      finishPresentationImmediately();
      return;
    }

    presentationState = beginGestureCommit(direction, prefersReducedMotion);

    if (prefersReducedMotion) {
      flushSync(() => {
        setPresentationOffset(0);
      });
      schedulePresentationCompletion(presentationState);
      return;
    }

    void animateCommittedNavigation(before, presentationState.phase);
  }

  function formatAnnouncementChildCount(count: number): string {
    if (count === 0) return 'No children';
    if (count === 1) return 'One child';
    return `${count} children`;
  }

  function formatAnnouncementDestinationCount(
    count: number,
    isDtdElement: boolean,
  ): string {
    if (isDtdElement) return formatAnnouncementChildCount(count);
    if (count === 0) return 'No structural destinations';
    if (count === 1) return 'One structural destination';
    return `${count} structural destinations`;
  }

  function buildAnnouncement(nodeId: SchemaNodeId): string {
    const node = getSchemaNode($activeProjectStore.project, nodeId);
    if (!node) return '';

    const destinationCount = getOutgoingStructuralRelationships(
      $activeProjectStore.project,
      nodeId,
    ).length;
    const displayName = getSchemaNodeDisplayName(
      $activeProjectStore.project,
      node,
      $activeProjectStore.xsdMetadataByNodeId,
    );
    return `Focused: ${displayName}, ${formatSchemaNodeKind(node.kind)}. ${formatAnnouncementDestinationCount(destinationCount, node.kind === 'dtdElement')}.`;
  }

  async function completeCommittedNavigation(
    nodeId: SchemaNodeId,
    focusTransfer: 'always' | 'gesture-owned' | 'none',
  ): Promise<void> {
    await tick();
    announcement = buildAnnouncement(nodeId);
    await tick();

    if (focusTransfer !== 'none') {
      focusCard?.focusHeading();
    }
  }

  function centerNode(nodeId: SchemaNodeId, journeyPosition?: number): void {
    centerRequest({
      targetNodeId: nodeId,
      targetJourneyPosition: journeyPosition,
    });
  }

  function centerRequest(request: NodeCenterRequest): void {
    pendingFocusTransfer = 'always';
    const result = navigationStore.centerNode(request);
    if (!result.applied) {
      pendingFocusTransfer = 'none';
      return;
    }
    finishPresentationImmediately();
  }

  function centerRelationship(relationship: SchemaRelationship): void {
    centerRequest({
      targetNodeId: relationship.node.id,
      relationshipContext: {
        kind: 'outgoing-structural',
        sourceNodeId: relationship.edge.sourceNodeId,
        edgeId: relationship.edge.id,
      },
    });
  }

  function jumpToEarlierPathStep(
    nodeId: SchemaNodeId,
    journeyPosition: number,
  ): void {
    centerNode(nodeId, journeyPosition);
  }

  function navigatePreviousStep(): void {
    pendingFocusTransfer = 'always';
    const result = navigationStore.navigateRootward();
    if (!result.applied) {
      pendingFocusTransfer = 'none';
      return;
    }
    finishPresentationImmediately();
  }

  function toggleInspection(nodeId: SchemaNodeId): void {
    if ($inspectedNodeId === nodeId) {
      inspectorStore.close();
      return;
    }

    inspectorStore.inspect(nodeId);
  }

  function selectSemanticZoomPresentation(
    presentation: ImplementedSemanticZoomPresentation,
  ): void {
    semanticZoomStore.setRequestedLevel(presentation);
  }
</script>

<div class="motion-stage" data-carousel-motion-stage>
  <div
    bind:this={gestureSurface}
    class:gesture-active={gestureSnapshot.active}
    class:keyboard-selection-active={Boolean(keyboardSelectedRelationshipId)}
    class:semantic-zoom-compact={implementedSemanticZoomPresentation ===
      'compact'}
    class="gesture-viewport presentation-{presentationState.phase}"
    data-carousel-gesture-viewport
    data-gesture-phase={gestureSnapshot.phase}
    data-presentation-phase={presentationState.phase}
    data-reduced-motion={prefersReducedMotion ? 'true' : 'false'}
    data-carousel-reflow-revision={carouselReflowRevision}
    data-carousel-stage-width={carouselStageWidth}
    data-carousel-stage-height={carouselStageHeight}
    data-semantic-zoom-requested={$semanticZoomStore.requestedLevel}
    data-semantic-zoom-effective={$semanticZoomStore.effectiveLevel}
    data-semantic-zoom-available={$semanticZoomStore.isAvailable
      ? 'true'
      : 'false'}
    data-semantic-zoom-presentation={implementedSemanticZoomPresentation}
    data-keyboard-cursor-state={keyboardSelectedRelationshipId
      ? 'leafward-selection'
      : 'current-focus'}
    role="region"
    aria-label="Schema navigation carousel"
    aria-describedby="carousel-gesture-description"
    aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Enter Space"
    ontransitionend={handlePresentationTransitionEnd}
  >
    <SemanticZoomControl
      isAvailable={$semanticZoomStore.isAvailable}
      presentation={implementedSemanticZoomPresentation}
      onSelect={selectSemanticZoomPresentation}
    />
    <div
      bind:this={gestureLayer}
      class="gesture-layer"
      data-carousel-gesture-layer
      style:--gesture-offset={`${presentationOffsetX}px`}
    >
      <div class="carousel-stage">
        {#if $semanticZoomStore.isAvailable && implementedSemanticZoomPresentation === 'compact'}
          <SemanticZoomRelationshipLines
            reflowRevision={carouselReflowRevision}
            navigationKey={`${$activeProjectStore.project.id}\u0000${$navigationPathIds.join('\u0000')}`}
            isResting={presentationState.phase === 'resting'}
          />
        {/if}
        <div class="context-slot rootward-slot">
          <RootwardPath
            project={$activeProjectStore.project}
            xsdMetadataByNodeId={$activeProjectStore.xsdMetadataByNodeId}
            nodes={$rootwardPathNodes}
            focusedNodeKind={$currentFocusNode?.kind}
            journeyLength={$navigationPathIds.length}
            journeyKey={$navigationPathIds.join('\u0000')}
            projectSessionRevision={$projectSessionResetStore.revision}
            inspectedNodeId={$inspectedNodeId}
            gesturePreviewNodeId={rootwardPreviewNodeId}
            earlierPathRows={rootwardHistoryRowCount}
            availableHeight={carouselStageHeight}
            reflowRevision={carouselReflowRevision}
            presentation={implementedSemanticZoomPresentation}
            onNavigatePrevious={navigatePreviousStep}
            onJumpEarlier={jumpToEarlierPathStep}
            onToggleInspection={toggleInspection}
          />
        </div>

        {#if $currentFocusNode && focusCardSummary}
          {#key $currentFocusNode.id}
            <div class="focus-anchor" data-carousel-focus-anchor>
              <FocusCard
                bind:this={focusCard}
                summary={focusCardSummary}
                isInspected={$currentFocusNode.id === $inspectedNodeId}
                motionKey={buildJourneyMotionKey(
                  $navigationPathIds.length - 1,
                  $currentFocusNode.id,
                )}
                onCenterNode={centerRequest}
                onToggleInspection={toggleInspection}
                presentation={implementedSemanticZoomPresentation}
                journeyPosition={$navigationPathIds.length - 1}
              />
            </div>
          {/key}
        {/if}

        <div class="context-slot leafward-slot">
          <BranchFan
            project={$activeProjectStore.project}
            xsdMetadataByNodeId={$activeProjectStore.xsdMetadataByNodeId}
            projectSessionRevision={$projectSessionResetStore.revision}
            relationships={$leafwardRelationships}
            navigationState={$navigationStore}
            focusNodeId={$currentFocusNode?.id}
            focusedNodeKind={$currentFocusNode?.kind}
            inspectedNodeId={$inspectedNodeId}
            gesturePreviewRelationshipId={leafwardPreviewRelationshipId}
            {keyboardSelectedRelationshipId}
            isPointerGestureActive={gestureSnapshot.active}
            availableWidth={carouselStageWidth}
            availableHeight={carouselStageHeight}
            reflowRevision={carouselReflowRevision}
            presentation={implementedSemanticZoomPresentation}
            nextJourneyPosition={$navigationPathIds.length}
            onNavigate={centerRelationship}
            onToggleInspection={toggleInspection}
          />
        </div>
      </div>
    </div>
  </div>
</div>

<p id="carousel-gesture-description" class="visually-hidden">
  The centered node is the keyboard origin. Use Down Arrow to select the first
  leafward destination or Up Arrow to select the last. Use Right Arrow to
  navigate into the first destination from the centered node, or into an
  explicitly selected destination. Enter or Space activates only an explicitly
  selected destination. Use Left Arrow or Escape to return from a selected
  destination to the centered node. From the centered node, use Left Arrow to
  return one journey step. Drag left to move leafward. Move up or down while
  dragging to choose a branch. Drag right to move rootward. Cards can also be
  activated directly.
</p>

<p class="spatial-model">
  <span>rootward / previous step</span>
  <span aria-hidden="true">←</span>
  <strong>current focus</strong>
  <span aria-hidden="true">→</span>
  <span
    >leafward / {$currentFocusNode?.kind === 'dtdElement'
      ? 'children'
      : 'destinations'}</span
  >
</p>

<p class="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
  {announcement}
</p>

<style>
  .motion-stage,
  .gesture-viewport,
  .gesture-layer {
    display: grid;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  .motion-stage {
    overflow: hidden;
  }

  .gesture-viewport {
    position: relative;
    container: carousel / inline-size;
    grid-template-rows: auto minmax(0, 1fr);
    overflow: hidden;
    touch-action: none;
  }

  .gesture-viewport.gesture-active {
    user-select: none;
  }

  .gesture-layer {
    grid-row: 2;
    transform: translate3d(var(--gesture-offset), 0, 0);
    transition: none;
  }

  .gesture-active .gesture-layer,
  .presentation-settling .gesture-layer {
    will-change: transform;
  }

  .presentation-settling .gesture-layer {
    transition: transform var(--duration-gesture-return) var(--ease-standard);
  }

  .carousel-stage {
    position: relative;
    display: grid;
    grid-template-columns:
      minmax(0, 1fr) minmax(280px, 360px)
      minmax(0, 1fr);
    align-items: center;
    gap: var(--space-4);
    width: 100%;
    height: 100%;
    min-height: 0;
    grid-template-rows: minmax(0, 1fr);
  }

  .gesture-viewport.semantic-zoom-compact .carousel-stage {
    grid-template-columns:
      minmax(0, 1fr) minmax(220px, 300px)
      minmax(0, 1fr);
    column-gap: var(--space-6);
    row-gap: var(--space-3);
  }

  .context-slot {
    position: relative;
    z-index: 1;
    min-width: 0;
  }

  .focus-anchor {
    position: relative;
    z-index: 1;
    grid-column: 2;
    display: flex;
    height: 100%;
    max-height: 100%;
    min-width: 0;
    min-height: 0;
    align-items: center;
  }

  .spatial-model {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    margin: var(--space-2) 0 0;
    color: var(--colour-text-secondary);
    font-size: var(--font-size-sm);
    text-align: center;
  }

  .spatial-model strong {
    color: var(--colour-text);
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

  @media (hover: hover) and (pointer: fine) {
    .gesture-viewport,
    .gesture-viewport :global([data-carousel-navigation-action]) {
      cursor: grab;
    }

    .gesture-viewport.gesture-active,
    .gesture-viewport.gesture-active
      :global([data-carousel-navigation-action]) {
      cursor: grabbing;
    }

    .gesture-viewport :global([data-carousel-gesture-ignore]) {
      cursor: pointer;
    }
  }

  @media (max-width: 1399px) {
    .context-slot {
      padding-inline: var(--space-1);
    }
  }

  @media (max-width: 1099px) {
    .carousel-stage {
      grid-template-columns: minmax(84px, 1fr) minmax(280px, 360px) minmax(
          84px,
          1fr
        );
    }
  }

  @media (max-width: 699px) {
    .gesture-viewport {
      overflow: clip;
    }

    .carousel-stage {
      grid-template-columns: minmax(0, var(--focus-card-max-width));
      justify-content: center;
      width: 100%;
      max-width: var(--focus-card-max-width);
      min-height: clamp(360px, 48vh, 420px);
      margin-inline: auto;
    }

    .focus-anchor {
      grid-column: 1;
    }

    .context-slot {
      position: absolute;
      top: 50%;
      width: clamp(148px, 44vw, 180px);
      padding-inline: 0;
      transform: translateY(-50%);
    }

    .rootward-slot {
      right: calc(100% + var(--space-4));
    }

    .leafward-slot {
      left: calc(100% + var(--space-4));
    }

    .rootward-slot :global([data-carousel-side-window-control]) {
      position: relative;
      z-index: 3;
      justify-self: end;
      width: 64px;
      transform: translateX(calc(100% + var(--space-4)));
    }

    .leafward-slot :global([data-carousel-side-window-control]) {
      position: relative;
      z-index: 3;
      justify-self: start;
      width: 64px;
      transform: translateX(calc(-100% - var(--space-4)));
    }

    .gesture-viewport.keyboard-selection-active .carousel-stage {
      grid-template-columns: minmax(0, 1fr) minmax(148px, 44vw);
      gap: var(--space-2);
      max-width: 100%;
    }

    .gesture-viewport.keyboard-selection-active .leafward-slot {
      position: static;
      z-index: 3;
      grid-column: 2;
      width: auto;
      transform: none;
    }

    .gesture-viewport.keyboard-selection-active
      .leafward-slot
      :global([data-carousel-side-window-control]) {
      width: 100%;
      transform: none;
    }

    .spatial-model {
      flex-wrap: wrap;
      row-gap: var(--space-1);
      font-size: var(--font-size-xs);
    }
  }

  @media (orientation: landscape) and (max-height: 300px) {
    .carousel-stage {
      min-height: 0;
    }

    .focus-anchor {
      max-height: 100%;
    }

    .spatial-model {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
    }
  }

  @media (orientation: landscape) and (max-height: 520px) {
    .focus-anchor {
      height: 100%;
      max-height: 100%;
      min-height: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .presentation-settling .gesture-layer {
      transition-duration: var(--duration-gesture-reduced);
    }

    :global(.presentation-reduced-motion-commit .focus-card) {
      animation: reduced-focus-confirm var(--duration-gesture-reduced)
        var(--ease-standard);
    }
  }

  @keyframes reduced-focus-confirm {
    from {
      opacity: 0.88;
    }

    to {
      opacity: 1;
    }
  }
</style>
