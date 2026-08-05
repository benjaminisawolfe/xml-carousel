export const MIN_LEAFWARD_CARDS = 1;
export const DEFAULT_LEAFWARD_CARDS = 3;
export const MAX_LEAFWARD_CARDS = 7;
export const MAX_EARLIER_PATH_ROWS = 2;
export const VERTICAL_WINDOW_FOCUS_CLEARANCE = 6;
/** @deprecated Use MAX_EARLIER_PATH_ROWS for role-aware rootward windows. */
export const MAX_ROOTWARD_CARDS = MAX_EARLIER_PATH_ROWS + 1;

export interface IndexedWindowItem<T> {
  readonly item: T;
  readonly itemIndex: number;
}

export interface SideWindow<T> {
  readonly visible: readonly IndexedWindowItem<T>[];
  readonly startIndex: number;
  readonly size: number;
  readonly hiddenBeforeCount: number;
  readonly hiddenAfterCount: number;
}

export interface RootwardPathItem<T> {
  readonly item: T;
  readonly journeyPosition: number;
}

export interface RootwardPathWindow<T> {
  readonly previousStep?: RootwardPathItem<T>;
  readonly earlierSteps: readonly RootwardPathItem<T>[];
  readonly historyStartIndex: number;
  readonly hiddenCloserCount: number;
  readonly hiddenEarlierCount: number;
}

/** @deprecated Use RootwardPathWindow for role-aware rootward presentation. */
export type RootwardWindow<T> = RootwardPathWindow<T>;

export function clampSideWindowStart(
  itemCount: number,
  requestedStartIndex: number,
  size = DEFAULT_LEAFWARD_CARDS,
): number {
  const safeItemCount = Math.max(0, Math.floor(itemCount));
  const safeSize = Math.max(1, Math.floor(size));
  const maximumStartIndex = Math.max(0, safeItemCount - safeSize);
  return Math.min(
    maximumStartIndex,
    Math.max(0, Math.floor(requestedStartIndex)),
  );
}

export function computeSideWindow<T>(
  items: readonly T[],
  requestedStartIndex = 0,
  size = DEFAULT_LEAFWARD_CARDS,
): SideWindow<T> {
  const safeSize = Math.max(1, Math.floor(size));
  const startIndex = clampSideWindowStart(
    items.length,
    requestedStartIndex,
    safeSize,
  );
  const endIndex = Math.min(items.length, startIndex + safeSize);
  const visible = items
    .slice(startIndex, endIndex)
    .map((item, offset) => ({ item, itemIndex: startIndex + offset }));

  return {
    visible,
    startIndex,
    size: safeSize,
    hiddenBeforeCount: startIndex,
    hiddenAfterCount: Math.max(0, items.length - endIndex),
  };
}

export function shiftSideWindow<T>(
  items: readonly T[],
  currentStartIndex: number,
  delta: number,
  size = DEFAULT_LEAFWARD_CARDS,
): SideWindow<T> {
  return computeSideWindow(items, currentStartIndex + Math.trunc(delta), size);
}

export function getBranchWindow<T>(
  items: readonly T[],
  requestedStartIndex = 0,
  size = DEFAULT_LEAFWARD_CARDS,
): SideWindow<T> {
  const requestedSize = Number.isFinite(size)
    ? Math.floor(size)
    : DEFAULT_LEAFWARD_CARDS;
  const boundedSize = Math.min(
    MAX_LEAFWARD_CARDS,
    Math.max(MIN_LEAFWARD_CARDS, requestedSize),
  );
  return computeSideWindow(items, requestedStartIndex, boundedSize);
}

export function getLeafwardWindowSize(viewportHeight: number): number {
  if (!Number.isFinite(viewportHeight)) return DEFAULT_LEAFWARD_CARDS;
  if (viewportHeight < 320) return 1;
  if (viewportHeight < 520) return 2;
  if (viewportHeight < 720) return 3;
  if (viewportHeight < 900) return 5;
  return 7;
}

export function getLeafwardWindowSizeForStage(
  stageWidth: number,
  stageHeight: number,
): number {
  const heightCapacity = getLeafwardWindowSize(stageHeight);
  if (!Number.isFinite(stageWidth)) return heightCapacity;
  if (stageWidth < 420) return Math.min(heightCapacity, 3);
  if (stageWidth < 700) return Math.min(heightCapacity, 5);
  return heightCapacity;
}

export function getRootwardHistoryRowCountForStage(
  stageHeight: number,
): number {
  if (!Number.isFinite(stageHeight)) return MAX_EARLIER_PATH_ROWS;
  return stageHeight < 520 ? 1 : MAX_EARLIER_PATH_ROWS;
}

export function renderedVerticalWindowFits(
  renderedHeight: number,
  availableHeight: number,
  focusClearance = VERTICAL_WINDOW_FOCUS_CLEARANCE,
): boolean {
  if (
    !Number.isFinite(renderedHeight) ||
    renderedHeight <= 0 ||
    !Number.isFinite(availableHeight) ||
    availableHeight <= 0
  ) {
    return true;
  }

  const safeClearance = Number.isFinite(focusClearance)
    ? Math.max(0, focusClearance)
    : VERTICAL_WINDOW_FOCUS_CLEARANCE;
  return renderedHeight + safeClearance * 2 <= availableHeight;
}

export function formatBranchWindowRange(
  window: Pick<
    SideWindow<unknown>,
    'startIndex' | 'visible' | 'hiddenBeforeCount' | 'hiddenAfterCount'
  >,
): string {
  const visibleCount = window.visible.length;
  if (visibleCount === 0) return '';

  const totalCount =
    window.hiddenBeforeCount + visibleCount + window.hiddenAfterCount;
  const firstPosition = window.startIndex + 1;
  const lastPosition = window.startIndex + visibleCount;

  return visibleCount === 1 && totalCount === 1
    ? 'Showing branch 1 of 1.'
    : `Showing branches ${firstPosition}–${lastPosition} of ${totalCount}.`;
}

export function getRootwardWindow<T>(
  items: readonly T[],
  requestedHistoryStartIndex = 0,
  journeyLength = items.length + 1,
  earlierPathRows = MAX_EARLIER_PATH_ROWS,
): RootwardPathWindow<T> {
  const previousItem = items[0];
  const safeEarlierPathRows = Math.min(
    MAX_EARLIER_PATH_ROWS,
    Math.max(1, Math.floor(earlierPathRows)),
  );
  const historyWindow = computeSideWindow(
    items.slice(1),
    requestedHistoryStartIndex,
    safeEarlierPathRows,
  );

  return {
    ...(previousItem === undefined
      ? {}
      : {
          previousStep: {
            item: previousItem,
            journeyPosition: journeyLength - 2,
          },
        }),
    earlierSteps: historyWindow.visible.map(({ item, itemIndex }) => ({
      item,
      journeyPosition: journeyLength - 3 - itemIndex,
    })),
    historyStartIndex: historyWindow.startIndex,
    hiddenCloserCount: historyWindow.hiddenBeforeCount,
    hiddenEarlierCount: historyWindow.hiddenAfterCount,
  };
}
