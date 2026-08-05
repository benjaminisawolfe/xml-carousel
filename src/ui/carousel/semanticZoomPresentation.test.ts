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
  it('maps Full to Full and Compact to Compact', () => {
    expect(resolveImplementedSemanticZoomPresentation('full')).toBe('full');
    expect(resolveImplementedSemanticZoomPresentation('compact')).toBe(
      'compact',
    );
  });

  it('isolates the Task 14.2 Overview fallback to Compact', () => {
    expect(resolveImplementedSemanticZoomPresentation('overview')).toBe(
      'compact',
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
    ).toBe('compact');
    expect(state).toEqual({
      requestedLevel: 'overview',
      effectiveLevel: 'overview',
      isAvailable: true,
    });
  });

  it('rejects unknown runtime values instead of silently casting them', () => {
    expect(isImplementedSemanticZoomPresentation('full')).toBe(true);
    expect(isImplementedSemanticZoomPresentation('overview')).toBe(false);
    expect(() =>
      resolveImplementedSemanticZoomPresentation(
        'unknown' as Parameters<
          typeof resolveImplementedSemanticZoomPresentation
        >[0],
      ),
    ).toThrow('Unknown implemented semantic zoom presentation');
  });

  it('uses the future-proof numeric mapping while exposing only 1–2', () => {
    expect(IMPLEMENTED_SEMANTIC_ZOOM_PRESENTATIONS).toEqual([
      'full',
      'compact',
    ]);
    expect(SEMANTIC_ZOOM_CONTROL_VALUES).toEqual({ compact: 1, full: 2 });
    expect(semanticZoomControlValue('compact')).toBe(1);
    expect(semanticZoomControlValue('full')).toBe(2);
    expect(implementedSemanticZoomPresentationFromControlValue(1)).toBe(
      'compact',
    );
    expect(implementedSemanticZoomPresentationFromControlValue(2)).toBe('full');
    expect(
      implementedSemanticZoomPresentationFromControlValue(0),
    ).toBeUndefined();
    expect(
      implementedSemanticZoomPresentationFromControlValue(3),
    ).toBeUndefined();
  });
});
