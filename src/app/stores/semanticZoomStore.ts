import { get, writable, type Readable } from 'svelte/store';

export const SEMANTIC_ZOOM_LEVELS = Object.freeze([
  'full',
  'compact',
  'overview',
] as const);

export type SemanticZoomLevel = (typeof SEMANTIC_ZOOM_LEVELS)[number];
export type SemanticZoomDirection = 'in' | 'out';

export const SEMANTIC_ZOOM_LEVEL_LABELS = {
  full: 'Full detail',
  compact: 'Compact',
  overview: 'Overview',
} as const satisfies Readonly<Record<SemanticZoomLevel, string>>;

export const SEMANTIC_ZOOM_DESKTOP_MEDIA_QUERY =
  '(min-width: 1024px) and (min-height: 600px)';

const semanticZoomLevelIndexes = new Map<SemanticZoomLevel, number>(
  SEMANTIC_ZOOM_LEVELS.map((level, index) => [level, index]),
);

export interface SemanticZoomState {
  readonly requestedLevel: SemanticZoomLevel;
  readonly effectiveLevel: SemanticZoomLevel;
  readonly isAvailable: boolean;
}

export interface SemanticZoomStore extends Readable<SemanticZoomState> {
  setRequestedLevel(level: SemanticZoomLevel): void;
  zoomIn(): void;
  zoomOut(): void;
  setDesktopAvailability(isAvailable: boolean): void;
  reset(): void;
}

export function isSemanticZoomLevel(
  value: unknown,
): value is SemanticZoomLevel {
  return (
    typeof value === 'string' &&
    semanticZoomLevelIndexes.has(value as SemanticZoomLevel)
  );
}

export function semanticZoomLevelIndex(level: SemanticZoomLevel): number {
  const index = semanticZoomLevelIndexes.get(level);
  if (index === undefined) {
    throw new Error(`Unknown semantic zoom level: ${String(level)}`);
  }
  return index;
}

export function semanticZoomLevelLabel(level: SemanticZoomLevel): string {
  return SEMANTIC_ZOOM_LEVEL_LABELS[level];
}

export function stepSemanticZoom(
  level: SemanticZoomLevel,
  direction: SemanticZoomDirection,
): SemanticZoomLevel {
  const currentIndex = semanticZoomLevelIndex(level);
  const delta = direction === 'out' ? 1 : -1;
  const nextIndex = Math.min(
    SEMANTIC_ZOOM_LEVELS.length - 1,
    Math.max(0, currentIndex + delta),
  );
  return SEMANTIC_ZOOM_LEVELS[nextIndex] ?? level;
}

export function resolveEffectiveSemanticZoom(
  requestedLevel: SemanticZoomLevel,
  isAvailable: boolean,
): SemanticZoomLevel {
  return isAvailable ? requestedLevel : 'full';
}

export function isSemanticZoomDesktopViewport(
  viewportWidth: number,
  viewportHeight: number,
): boolean {
  return (
    Number.isFinite(viewportWidth) &&
    Number.isFinite(viewportHeight) &&
    viewportWidth >= 1024 &&
    viewportHeight >= 600
  );
}

function createState(
  requestedLevel: SemanticZoomLevel,
  isAvailable: boolean,
): SemanticZoomState {
  return Object.freeze({
    requestedLevel,
    effectiveLevel: resolveEffectiveSemanticZoom(requestedLevel, isAvailable),
    isAvailable,
  });
}

export function createSemanticZoomStore(): SemanticZoomStore {
  const state = writable<SemanticZoomState>(createState('full', false));

  function updateRequestedLevel(level: SemanticZoomLevel): void {
    if (!isSemanticZoomLevel(level)) {
      throw new TypeError(`Unknown semantic zoom level: ${String(level)}`);
    }
    const current = get(state);
    if (current.requestedLevel === level) return;
    state.set(createState(level, current.isAvailable));
  }

  return {
    subscribe: state.subscribe,
    setRequestedLevel: updateRequestedLevel,
    zoomIn() {
      updateRequestedLevel(stepSemanticZoom(get(state).requestedLevel, 'in'));
    },
    zoomOut() {
      updateRequestedLevel(stepSemanticZoom(get(state).requestedLevel, 'out'));
    },
    setDesktopAvailability(isAvailable) {
      const current = get(state);
      if (current.isAvailable === isAvailable) return;
      state.set(createState(current.requestedLevel, isAvailable));
    },
    reset() {
      state.set(createState('full', get(state).isAvailable));
    },
  };
}

export const semanticZoomStore = createSemanticZoomStore();
