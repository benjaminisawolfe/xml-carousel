import { describe, expect, it } from 'vitest';
import {
  implementedSemanticZoomPresentationFromControlValue,
  IMPLEMENTED_SEMANTIC_ZOOM_PRESENTATIONS,
  isImplementedSemanticZoomPresentation,
  resolveImplementedSemanticZoomPresentation,
  SEMANTIC_ZOOM_CONTROL_VALUES,
  semanticZoomControlValue,
} from './semanticZoomPresentation';

describe('implemented semantic zoom presentation', () => {
  it('maps all three effective levels to their genuine presentation', () => {
    expect(resolveImplementedSemanticZoomPresentation('full')).toBe('full');
    expect(resolveImplementedSemanticZoomPresentation('compact')).toBe(
      'compact',
    );
    expect(resolveImplementedSemanticZoomPresentation('overview')).toBe(
      'overview',
    );
  });

  it('does not mutate caller-owned requested or effective state', () => {
    const state = Object.freeze({
      requestedLevel: 'overview' as const,
      effectiveLevel: 'overview' as const,
      isAvailable: true,
    });
    expect(
      resolveImplementedSemanticZoomPresentation(state.effectiveLevel),
    ).toBe('overview');
    expect(state).toEqual({
      requestedLevel: 'overview',
      effectiveLevel: 'overview',
      isAvailable: true,
    });
  });

  it('rejects unknown runtime values instead of silently casting them', () => {
    expect(isImplementedSemanticZoomPresentation('full')).toBe(true);
    expect(isImplementedSemanticZoomPresentation('overview')).toBe(true);
    expect(() =>
      resolveImplementedSemanticZoomPresentation(
        'unknown' as Parameters<
          typeof resolveImplementedSemanticZoomPresentation
        >[0],
      ),
    ).toThrow('Unknown implemented semantic zoom presentation');
  });

  it('uses the exhaustive Overview 0, Compact 1, Full 2 mapping', () => {
    expect(IMPLEMENTED_SEMANTIC_ZOOM_PRESENTATIONS).toEqual([
      'full',
      'compact',
      'overview',
    ]);
    expect(SEMANTIC_ZOOM_CONTROL_VALUES).toEqual({
      overview: 0,
      compact: 1,
      full: 2,
    });
    expect(semanticZoomControlValue('overview')).toBe(0);
    expect(semanticZoomControlValue('compact')).toBe(1);
    expect(semanticZoomControlValue('full')).toBe(2);
    expect(implementedSemanticZoomPresentationFromControlValue(1)).toBe(
      'compact',
    );
    expect(implementedSemanticZoomPresentationFromControlValue(2)).toBe('full');
    expect(implementedSemanticZoomPresentationFromControlValue(0)).toBe(
      'overview',
    );
    expect(
      implementedSemanticZoomPresentationFromControlValue(3),
    ).toBeUndefined();
  });
});
