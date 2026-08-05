import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SEMANTIC_ZOOM_MAXIMUM_SCALE,
  SEMANTIC_ZOOM_MAXIMUM_TRANSLATION_PX,
  SEMANTIC_ZOOM_MINIMUM_SCALE,
  calculateSemanticZoomInverseTransform,
  captureSemanticZoomMotionGeometry,
  createSemanticZoomTransitionController,
} from './semanticZoomTransition';

function rectangle(
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({ left, top, width, height }),
  } as DOMRect;
}

function motionElement(
  key: string,
  bounds: { left: number; top: number; width: number; height: number },
): HTMLElement {
  const element = document.createElement('article');
  element.dataset.carouselMotionKey = key;
  element.getBoundingClientRect = vi.fn(() =>
    rectangle(bounds.left, bounds.top, bounds.width, bounds.height),
  );
  return element;
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('semantic zoom transition geometry', () => {
  it('captures unique, visible motion keys', () => {
    const root = document.createElement('div');
    root.append(
      motionElement('focus', { left: 10, top: 20, width: 100, height: 80 }),
      motionElement('focus', { left: 30, top: 40, width: 90, height: 70 }),
      motionElement('destination', {
        left: 300,
        top: 100,
        width: 120,
        height: 60,
      }),
    );

    expect(captureSemanticZoomMotionGeometry(root)).toEqual({
      focus: { left: 10, top: 20, width: 100, height: 80 },
      destination: { left: 300, top: 100, width: 120, height: 60 },
    });
  });

  it('bounds translation and ordinary scaling', () => {
    const inverse = calculateSemanticZoomInverseTransform(
      { left: -1000, top: -1000, width: 100, height: 100 },
      { left: 1000, top: 1000, width: 80, height: 120 },
    );

    expect(inverse).toEqual({
      deltaX: -SEMANTIC_ZOOM_MAXIMUM_TRANSLATION_PX,
      deltaY: -SEMANTIC_ZOOM_MAXIMUM_TRANSLATION_PX,
      scaleX: SEMANTIC_ZOOM_MAXIMUM_SCALE,
      scaleY: 100 / 120,
      usesScale: true,
    });
    expect(inverse?.scaleX).toBeGreaterThanOrEqual(SEMANTIC_ZOOM_MINIMUM_SCALE);
  });

  it('drops extreme scale ratios while retaining bounded translation', () => {
    expect(
      calculateSemanticZoomInverseTransform(
        { left: 0, top: 0, width: 600, height: 400 },
        { left: 80, top: 60, width: 100, height: 50 },
      ),
    ).toMatchObject({ scaleX: 1, scaleY: 1, usesScale: false });
  });
});

describe('semantic zoom transition controller', () => {
  function harness() {
    const frames = new Map<number, FrameRequestCallback>();
    const timers = new Map<number, () => void>();
    let nextHandle = 1;
    const phases: string[] = [];
    const settled = vi.fn();
    const controller = createSemanticZoomTransitionController({
      onPhaseChange: (phase) => phases.push(phase),
      onSettled: settled,
      requestFrame: (callback) => {
        const handle = nextHandle++;
        frames.set(handle, callback);
        return handle;
      },
      cancelFrame: (handle) => frames.delete(handle),
      setTimer: (callback) => {
        const handle = nextHandle++;
        timers.set(handle, callback);
        return handle;
      },
      clearTimer: (handle) => timers.delete(handle),
    });
    const runNextFrame = () => {
      const entry = frames.entries().next().value as
        [number, FrameRequestCallback] | undefined;
      if (!entry) throw new Error('Expected a pending frame.');
      frames.delete(entry[0]);
      entry[1](0);
    };
    const runTimer = () => {
      const entry = timers.entries().next().value as
        [number, () => void] | undefined;
      if (!entry) throw new Error('Expected a pending timer.');
      timers.delete(entry[0]);
      entry[1]();
    };
    return {
      controller,
      frames,
      timers,
      phases,
      settled,
      runNextFrame,
      runTimer,
    };
  }

  it('measures, animates, clears temporary styles, and settles', async () => {
    const root = document.createElement('div');
    const focusBounds = { left: 300, top: 200, width: 240, height: 160 };
    const focus = motionElement('focus', focusBounds);
    root.append(focus);
    document.body.append(root);
    const { controller, phases, runNextFrame, runTimer } = harness();

    await controller.transition({
      root,
      from: 'full',
      to: 'compact',
      reducedMotion: false,
      commit: () => {
        focusBounds.left = 360;
        focusBounds.top = 250;
        focusBounds.width = 200;
        focusBounds.height = 120;
      },
      waitForLayout: async () => undefined,
    });

    expect(phases).toEqual(['measuring', 'animating']);
    expect(focus.dataset.semanticZoomMotion).toBe('matched');
    expect(focus.style.transform).toContain('translate3d');
    expect(controller.hasPendingWork).toBe(true);

    runNextFrame();
    runNextFrame();
    expect(focus.style.transition).toContain('var(--duration-panel)');
    expect(focus.style.transform).toContain('scale(1, 1)');
    runTimer();

    expect(phases[phases.length - 1]).toBe('idle');
    expect(focus.getAttribute('style')).toBe('');
    expect(controller.hasPendingWork).toBe(false);
  });

  it('makes reduced-motion changes immediate without frames or timers', async () => {
    const root = document.createElement('div');
    const focus = motionElement('focus', {
      left: 0,
      top: 0,
      width: 100,
      height: 100,
    });
    root.append(focus);
    document.body.append(root);
    const { controller, frames, timers, phases, settled } = harness();

    await controller.transition({
      root,
      from: 'compact',
      to: 'overview',
      reducedMotion: true,
      commit: vi.fn(),
      waitForLayout: async () => undefined,
    });

    expect(phases).toEqual(['measuring', 'idle']);
    expect(frames).toHaveLength(0);
    expect(timers).toHaveLength(0);
    expect(settled).toHaveBeenCalledOnce();
    expect(controller.hasPendingWork).toBe(false);
  });

  it('cancels superseded work and lets the latest request win', async () => {
    const root = document.createElement('div');
    const bounds = { left: 0, top: 0, width: 240, height: 160 };
    const focus = motionElement('focus', bounds);
    root.append(focus);
    document.body.append(root);
    const { controller, frames, phases } = harness();

    await controller.transition({
      root,
      from: 'full',
      to: 'compact',
      reducedMotion: false,
      commit: () => {
        bounds.left = 50;
        bounds.width = 200;
      },
      waitForLayout: async () => undefined,
    });
    expect(frames.size).toBe(1);

    await controller.transition({
      root,
      from: 'compact',
      to: 'overview',
      reducedMotion: false,
      commit: () => {
        bounds.left = 100;
        bounds.width = 160;
      },
      waitForLayout: async () => undefined,
    });

    expect(frames.size).toBe(1);
    expect(phases.slice(-2)).toEqual(['measuring', 'animating']);
    expect(focus.dataset.semanticZoomMotion).toBe('matched');
    controller.cancel();
    expect(frames.size).toBe(0);
    expect(focus.getAttribute('style')).toBe('');
    expect(controller.hasPendingWork).toBe(false);
  });
});
