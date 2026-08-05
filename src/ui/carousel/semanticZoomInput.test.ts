import { describe, expect, it } from 'vitest';
import type { SemanticZoomState } from '../../app/stores/semanticZoomStore';
import {
  createSemanticZoomWheelController,
  decideSemanticZoomWheelStep,
  semanticZoomWheelAction,
  type SemanticZoomWheelInput,
} from './semanticZoomInput';

const baseInput: SemanticZoomWheelInput = {
  deltaX: 0,
  deltaY: 1,
  ctrlKey: false,
  metaKey: false,
};

function state(
  requestedLevel: SemanticZoomState['requestedLevel'] = 'compact',
  isAvailable = true,
): SemanticZoomState {
  return {
    requestedLevel,
    effectiveLevel: isAvailable ? requestedLevel : 'full',
    isAvailable,
  };
}

describe('future semantic zoom wheel contract', () => {
  it('maps wheel up to more detail and wheel down to less detail', () => {
    expect(semanticZoomWheelAction({ ...baseInput, deltaY: -10 })).toBe(
      'zoomIn',
    );
    expect(semanticZoomWheelAction({ ...baseInput, deltaY: 10 })).toBe(
      'zoomOut',
    );
  });

  it.each([
    {
      input: { ...baseInput, deltaX: 12, deltaY: 10 },
      description: 'horizontal-dominant',
    },
    { input: { ...baseInput, ctrlKey: true }, description: 'Ctrl-modified' },
    { input: { ...baseInput, metaKey: true }, description: 'Meta-modified' },
    { input: { ...baseInput, deltaY: 0 }, description: 'zero' },
    {
      input: { ...baseInput, deltaY: Number.NaN },
      description: 'non-finite vertical',
    },
    {
      input: { ...baseInput, deltaX: Number.POSITIVE_INFINITY },
      description: 'non-finite horizontal',
    },
  ] as const)('ignores $description input', ({ input }) => {
    expect(semanticZoomWheelAction(input)).toBeUndefined();
    expect(decideSemanticZoomWheelStep(input, state()).consumed).toBe(false);
  });

  it('returns one semantic step for an eligible dedicated-control event', () => {
    expect(decideSemanticZoomWheelStep(baseInput, state('full'))).toEqual({
      consumed: true,
      action: 'zoomOut',
      nextLevel: 'compact',
    });
    expect(
      decideSemanticZoomWheelStep(
        { ...baseInput, deltaY: -1 },
        state('overview'),
      ),
    ).toEqual({
      consumed: true,
      action: 'zoomIn',
      nextLevel: 'compact',
    });
  });

  it('does not consume a boundary step', () => {
    expect(
      decideSemanticZoomWheelStep({ ...baseInput, deltaY: -1 }, state('full')),
    ).toEqual({ consumed: false });
    expect(decideSemanticZoomWheelStep(baseInput, state('overview'))).toEqual({
      consumed: false,
    });
  });

  it('does not consume input while semantic zoom is unavailable', () => {
    expect(
      decideSemanticZoomWheelStep(baseInput, state('compact', false)),
    ).toEqual({ consumed: false });
  });

  it('allows at most one step until the deliberate gesture settles', () => {
    const controller = createSemanticZoomWheelController();
    expect(controller.handle(baseInput, state('full')).consumed).toBe(true);
    expect(controller.handle(baseInput, state('compact')).consumed).toBe(false);
    controller.settle();
    expect(controller.handle(baseInput, state('compact'))).toMatchObject({
      consumed: true,
      nextLevel: 'overview',
    });
    controller.reset();
    expect(
      controller.handle({ ...baseInput, deltaY: -1 }, state('overview')),
    ).toMatchObject({ consumed: true, nextLevel: 'compact' });
  });

  it('is intentionally unattached to ordinary carousel wheel input', () => {
    const controller = createSemanticZoomWheelController();
    expect(controller).not.toHaveProperty('attach');
    expect(controller).not.toHaveProperty('handleEvent');
  });
});
