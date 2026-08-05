import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SemanticZoomControl from './SemanticZoomControl.svelte';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('SemanticZoomControl', () => {
  it('is absent when unavailable', () => {
    render(SemanticZoomControl, {
      isAvailable: false,
      presentation: 'full',
      onSelect: vi.fn(),
    });
    expect(
      screen.queryByRole('group', { name: 'Semantic zoom' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Overview')).not.toBeInTheDocument();
  });

  it('uses a native three-step range at Full', () => {
    const { container } = render(SemanticZoomControl, {
      isAvailable: true,
      presentation: 'full',
      onSelect: vi.fn(),
    });
    expect(screen.getByText('Zoom')).toBeVisible();
    const range = screen.getByRole<HTMLInputElement>('slider', {
      name: 'Semantic zoom',
    });
    expect(range).toHaveAttribute('min', '0');
    expect(range).toHaveAttribute('max', '2');
    expect(range).toHaveAttribute('step', '1');
    expect(range).toHaveValue('2');
    expect(range).toHaveAttribute('aria-valuetext', 'Full detail');
    expect(range).toHaveAccessibleDescription(
      'Use arrow keys to choose Overview, Compact, or Full detail. You can also use the mouse wheel while pointing at or focusing the zoom control.',
    );
    expect(
      screen.getByRole('group', { name: 'Semantic zoom' }),
    ).toHaveAttribute('data-carousel-gesture-ignore');
    expect(
      screen.getByRole('button', { name: 'Zoom out to Compact' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Zoom in to Full detail' }),
    ).toBeDisabled();
    expect(
      container.querySelector('[data-semantic-zoom-control]'),
    ).toHaveAttribute('data-carousel-gesture-ignore');
  });

  it('supports range input, buttons, boundaries, and one announcement per change', async () => {
    const onSelect = vi.fn();
    const rendered = render(SemanticZoomControl, {
      isAvailable: true,
      presentation: 'full',
      onSelect,
    });
    const range = screen.getByRole('slider', { name: 'Semantic zoom' });

    await fireEvent.input(range, { target: { value: '1' } });
    expect(onSelect).toHaveBeenLastCalledWith('compact');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Semantic zoom: Compact.',
    );

    await rendered.rerender({
      isAvailable: true,
      presentation: 'compact',
      onSelect,
    });
    expect(range).toHaveValue('1');
    expect(range).toHaveAttribute('aria-valuetext', 'Compact');
    expect(
      screen.getByRole('button', { name: 'Zoom out to Overview' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Zoom in to Full detail' }),
    ).toBeEnabled();

    onSelect.mockClear();
    await fireEvent.input(range, { target: { value: '1' } });
    expect(onSelect).not.toHaveBeenCalled();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Zoom in to Full detail' }),
    );
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith('full');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Semantic zoom: Full detail.',
    );

    await rendered.rerender({
      isAvailable: true,
      presentation: 'compact',
      onSelect,
    });
    await fireEvent.click(
      screen.getByRole('button', { name: 'Zoom out to Overview' }),
    );
    expect(onSelect).toHaveBeenLastCalledWith('overview');
    await rendered.rerender({
      isAvailable: true,
      presentation: 'overview',
      onSelect,
    });
    expect(range).toHaveValue('0');
    expect(range).toHaveAttribute('aria-valuetext', 'Overview');
    expect(
      screen.getByRole('button', { name: 'Zoom out to Overview' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Zoom in to Compact' }),
    ).toBeEnabled();
  });

  it('keeps focus in the control when a button reaches a disabled boundary', async () => {
    const onSelect = vi.fn();
    const rendered = render(SemanticZoomControl, {
      isAvailable: true,
      presentation: 'compact',
      onSelect,
    });
    const range = screen.getByRole('slider', { name: 'Semantic zoom' });

    const zoomOut = screen.getByRole('button', {
      name: 'Zoom out to Overview',
    });
    zoomOut.focus();
    await fireEvent.click(zoomOut);
    await rendered.rerender({
      isAvailable: true,
      presentation: 'overview',
      onSelect,
    });
    await waitFor(() => expect(range).toHaveFocus());

    await rendered.rerender({
      isAvailable: true,
      presentation: 'compact',
      onSelect,
    });
    const zoomIn = screen.getByRole('button', {
      name: 'Zoom in to Full detail',
    });
    zoomIn.focus();
    await fireEvent.click(zoomIn);
    await rendered.rerender({
      isAvailable: true,
      presentation: 'full',
      onSelect,
    });
    await waitFor(() => expect(range).toHaveFocus());
  });

  it.each([
    ['ArrowLeft', '0', 'overview'],
    ['ArrowDown', '0', 'overview'],
    ['Home', '0', 'overview'],
    ['ArrowRight', '2', 'full'],
    ['ArrowUp', '2', 'full'],
    ['End', '2', 'full'],
  ] as const)(
    'accepts the native %s range result',
    async (_key, value, expected) => {
      const onSelect = vi.fn();
      render(SemanticZoomControl, {
        isAvailable: true,
        presentation: expected === 'full' ? 'compact' : 'full',
        onSelect,
      });
      await fireEvent.input(
        screen.getByRole('slider', { name: 'Semantic zoom' }),
        { target: { value } },
      );
      expect(onSelect).toHaveBeenCalledWith(expected);
    },
  );

  it('consumes one settled wheel step through Full, Compact, and Overview', async () => {
    vi.useFakeTimers();
    const onSelect = vi.fn();
    const rendered = render(SemanticZoomControl, {
      isAvailable: true,
      presentation: 'full',
      onSelect,
    });
    const control = screen.getByRole('group', {
      name: 'Semantic zoom',
    });

    const down = new WheelEvent('wheel', {
      deltaY: 80,
      bubbles: true,
      cancelable: true,
    });
    control.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith('compact');

    control.dispatchEvent(
      new WheelEvent('wheel', {
        deltaY: 80,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(onSelect).toHaveBeenCalledOnce();
    await rendered.rerender({
      isAvailable: true,
      presentation: 'compact',
      onSelect,
    });

    vi.advanceTimersByTime(181);
    const toOverview = new WheelEvent('wheel', {
      deltaY: 80,
      bubbles: true,
      cancelable: true,
    });
    control.dispatchEvent(toOverview);
    expect(toOverview.defaultPrevented).toBe(true);
    expect(onSelect).toHaveBeenLastCalledWith('overview');

    await rendered.rerender({
      isAvailable: true,
      presentation: 'overview',
      onSelect,
    });
    vi.advanceTimersByTime(181);
    const overviewBoundary = new WheelEvent('wheel', {
      deltaY: 80,
      bubbles: true,
      cancelable: true,
    });
    control.dispatchEvent(overviewBoundary);
    expect(overviewBoundary.defaultPrevented).toBe(false);

    const up = new WheelEvent('wheel', {
      deltaY: -80,
      bubbles: true,
      cancelable: true,
    });
    control.dispatchEvent(up);
    expect(up.defaultPrevented).toBe(true);
    expect(onSelect).toHaveBeenLastCalledWith('compact');
  });

  it.each([
    { deltaX: 0, deltaY: 80, ctrlKey: true },
    { deltaX: 0, deltaY: -80, metaKey: true },
    { deltaX: 90, deltaY: 80 },
  ])('does not capture modifier or horizontal wheel input', (input) => {
    const onSelect = vi.fn();
    render(SemanticZoomControl, {
      isAvailable: true,
      presentation: 'full',
      onSelect,
    });
    const event = new WheelEvent('wheel', {
      ...input,
      bubbles: true,
      cancelable: true,
    });
    screen.getByRole('group', { name: 'Semantic zoom' }).dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('clears pending wheel work when availability is lost and on destroy', async () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    const rendered = render(SemanticZoomControl, {
      isAvailable: true,
      presentation: 'full',
      onSelect: vi.fn(),
    });
    await fireEvent.wheel(
      screen.getByRole('group', { name: 'Semantic zoom' }),
      { deltaY: 80 },
    );
    await rendered.rerender({
      isAvailable: false,
      presentation: 'full',
      onSelect: vi.fn(),
    });
    expect(clearTimeoutSpy).toHaveBeenCalled();
    rendered.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('coalesces same-update range bursts and deduplicates same-value noise', async () => {
    const onSelect = vi.fn();
    render(SemanticZoomControl, {
      isAvailable: true,
      presentation: 'full',
      onSelect,
    });
    const range = screen.getByRole<HTMLInputElement>('slider', {
      name: 'Semantic zoom',
    });

    range.value = '1';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    range.value = '0';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    range.dispatchEvent(new Event('input', { bubbles: true }));
    await Promise.resolve();

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith('overview');
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Semantic zoom: Overview.',
      ),
    );
  });
});
