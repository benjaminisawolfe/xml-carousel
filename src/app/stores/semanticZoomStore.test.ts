import { get } from 'svelte/store';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSemanticZoomStore,
  isSemanticZoomDesktopViewport,
  isSemanticZoomLevel,
  resolveEffectiveSemanticZoom,
  SEMANTIC_ZOOM_DESKTOP_MEDIA_QUERY,
  SEMANTIC_ZOOM_LEVELS,
  semanticZoomLevelIndex,
  semanticZoomLevelLabel,
  semanticZoomStore,
  stepSemanticZoom,
  type SemanticZoomLevel,
} from './semanticZoomStore';

afterEach(() => {
  semanticZoomStore.reset();
  semanticZoomStore.setDesktopAvailability(false);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('semantic zoom model', () => {
  it('defines one immutable most-detail-to-least-detail ordering and labels', () => {
    expect(SEMANTIC_ZOOM_LEVELS).toEqual(['full', 'compact', 'overview']);
    expect(semanticZoomLevelIndex('full')).toBe(0);
    expect(semanticZoomLevelIndex('compact')).toBe(1);
    expect(semanticZoomLevelIndex('overview')).toBe(2);
    expect(SEMANTIC_ZOOM_LEVELS.map(semanticZoomLevelLabel)).toEqual([
      'Full detail',
      'Compact',
      'Overview',
    ]);
  });

  it('steps toward less or more detail with bounded endpoints', () => {
    expect(stepSemanticZoom('full', 'out')).toBe('compact');
    expect(stepSemanticZoom('compact', 'out')).toBe('overview');
    expect(stepSemanticZoom('overview', 'out')).toBe('overview');
    expect(stepSemanticZoom('overview', 'in')).toBe('compact');
    expect(stepSemanticZoom('compact', 'in')).toBe('full');
    expect(stepSemanticZoom('full', 'in')).toBe('full');
  });

  it('accepts only the three exact level strings', () => {
    for (const level of SEMANTIC_ZOOM_LEVELS) {
      expect(isSemanticZoomLevel(level)).toBe(true);
    }
    expect(isSemanticZoomLevel('Full')).toBe(false);
    expect(isSemanticZoomLevel('detailed')).toBe(false);
    expect(isSemanticZoomLevel(1)).toBe(false);
  });

  it('centralizes the desktop media query and viewport eligibility matrix', () => {
    expect(SEMANTIC_ZOOM_DESKTOP_MEDIA_QUERY).toBe(
      '(min-width: 1024px) and (min-height: 600px)',
    );
    for (const [width, height, available] of [
      [1440, 900, true],
      [1280, 720, true],
      [1024, 768, true],
      [768, 900, false],
      [412, 915, false],
      [390, 844, false],
      [915, 412, false],
      [844, 390, false],
    ] as const) {
      expect(isSemanticZoomDesktopViewport(width, height)).toBe(available);
    }
    expect(isSemanticZoomDesktopViewport(Number.NaN, 900)).toBe(false);
    expect(isSemanticZoomDesktopViewport(1440, Number.POSITIVE_INFINITY)).toBe(
      false,
    );
  });

  it('forces effective Full when unavailable without changing the request', () => {
    expect(resolveEffectiveSemanticZoom('overview', false)).toBe('full');
    expect(resolveEffectiveSemanticZoom('overview', true)).toBe('overview');
  });
});

describe('semantic zoom store', () => {
  it('defaults requested and effective presentation to Full before availability is known', () => {
    expect(get(createSemanticZoomStore())).toEqual({
      requestedLevel: 'full',
      effectiveLevel: 'full',
      isAvailable: false,
    });
  });

  it('preserves and restores a requested level across constrained layout', () => {
    const store = createSemanticZoomStore();
    store.setDesktopAvailability(true);
    store.setRequestedLevel('compact');
    expect(get(store)).toEqual({
      requestedLevel: 'compact',
      effectiveLevel: 'compact',
      isAvailable: true,
    });

    store.setDesktopAvailability(false);
    expect(get(store)).toEqual({
      requestedLevel: 'compact',
      effectiveLevel: 'full',
      isAvailable: false,
    });

    store.setDesktopAvailability(true);
    expect(get(store)).toEqual({
      requestedLevel: 'compact',
      effectiveLevel: 'compact',
      isAvailable: true,
    });
  });

  it('selects every valid level directly and uses requested state for steps', () => {
    const store = createSemanticZoomStore();
    store.setDesktopAvailability(true);
    for (const level of SEMANTIC_ZOOM_LEVELS) {
      store.setRequestedLevel(level);
      expect(get(store).requestedLevel).toBe(level);
      expect(get(store).effectiveLevel).toBe(level);
    }

    store.zoomIn();
    expect(get(store).requestedLevel).toBe('compact');
    store.zoomIn();
    store.zoomIn();
    expect(get(store).requestedLevel).toBe('full');
    store.zoomOut();
    store.zoomOut();
    store.zoomOut();
    expect(get(store).requestedLevel).toBe('overview');
  });

  it('steps a preserved request while unavailable and restores that result', () => {
    const store = createSemanticZoomStore();
    store.setRequestedLevel('compact');
    store.zoomOut();
    expect(get(store)).toMatchObject({
      requestedLevel: 'overview',
      effectiveLevel: 'full',
    });
    store.setDesktopAvailability(true);
    expect(get(store).effectiveLevel).toBe('overview');
  });

  it('reset returns to Full without changing current availability', () => {
    const store = createSemanticZoomStore();
    store.setDesktopAvailability(true);
    store.setRequestedLevel('overview');
    store.reset();
    expect(get(store)).toEqual({
      requestedLevel: 'full',
      effectiveLevel: 'full',
      isAvailable: true,
    });
  });

  it('does not silently accept an unknown runtime string', () => {
    const store = createSemanticZoomStore();
    expect(() =>
      store.setRequestedLevel('invalid' as SemanticZoomLevel),
    ).toThrow('Unknown semantic zoom level');
  });

  it('does not access browser persistence APIs', () => {
    const localStorageGet = vi.spyOn(Storage.prototype, 'getItem');
    const localStorageSet = vi.spyOn(Storage.prototype, 'setItem');
    const indexedDbOpen = vi.fn();
    vi.stubGlobal('indexedDB', { open: indexedDbOpen });
    const store = createSemanticZoomStore();
    store.setDesktopAvailability(true);
    store.setRequestedLevel('overview');
    store.reset();
    expect(localStorageGet).not.toHaveBeenCalled();
    expect(localStorageSet).not.toHaveBeenCalled();
    expect(indexedDbOpen).not.toHaveBeenCalled();
  });

  it('keeps factory instances independent and the singleton stable', () => {
    const first = createSemanticZoomStore();
    const second = createSemanticZoomStore();
    first.setDesktopAvailability(true);
    first.setRequestedLevel('compact');
    expect(get(first).requestedLevel).toBe('compact');
    expect(get(second).requestedLevel).toBe('full');
    expect(semanticZoomStore).toBe(semanticZoomStore);
  });
});
