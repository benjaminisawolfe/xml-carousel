import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import type {
  SchemaNode,
  SchemaProject,
  SchemaRelationship,
} from '../../schema/model';
import BranchFan from './BranchFan.svelte';
import branchFanSource from './BranchFan.svelte?raw';

function node(index: number): SchemaNode {
  return {
    id: `node:${index}`,
    name: `Branch ${index}`,
    kind: 'dtdElement',
  };
}

function relationships(count: number): readonly SchemaRelationship[] {
  return Array.from({ length: count }, (_, index) => ({
    node: node(index),
    edge: {
      id: `edge:${index}`,
      kind: 'contains',
      sourceNodeId: 'source',
      targetNodeId: `node:${index}`,
      order: index,
    },
  }));
}

function project(items: readonly SchemaRelationship[]): SchemaProject {
  return {
    id: 'adaptive-project',
    displayName: 'Adaptive project',
    nodes: [
      { id: 'source', name: 'Source', kind: 'dtdElement' },
      ...items.map(({ node }) => node),
    ],
    edges: items.map(({ edge }) => edge),
    rootNodeIds: ['source'],
  };
}

function setHeight(
  height: number,
  eventName: 'resize' | 'orientationchange' = 'resize',
) {
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: height,
    writable: true,
  });
  window.dispatchEvent(new Event(eventName));
}

function props(count: number, overrides = {}) {
  const items = relationships(count);
  return {
    project: project(items),
    relationships: items,
    focusNodeId: 'source',
    inspectedNodeId: undefined,
    focusedNodeKind: 'dtdElement' as const,
    nextJourneyPosition: 1,
    onNavigate: vi.fn(),
    onToggleInspection: vi.fn(),
    ...overrides,
  };
}

function wheel(element: Element, deltaY: number, deltaX = 0): WheelEvent {
  const event = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    deltaX,
    deltaY,
  });
  element.dispatchEvent(event);
  return event;
}

function measuredRect(height: number): DOMRect {
  return {
    bottom: height,
    height,
    left: 0,
    right: 260,
    top: 0,
    width: 260,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  };
}

function resolveComputedToken(
  element: Element,
  property: 'color' | 'font-size',
): string {
  const value = getComputedStyle(element).getPropertyValue(property).trim();
  const token = value.match(/^var\((--[^)]+)\)$/u)?.[1];
  return token
    ? getComputedStyle(document.documentElement).getPropertyValue(token).trim()
    : value;
}

function normalizeCssColor(value: string): string {
  const probe = document.createElement('span');
  probe.style.color = value;
  document.body.append(probe);
  const normalized = getComputedStyle(probe).color;
  probe.remove();
  return normalized;
}

describe('adaptive BranchFan', () => {
  it.each([
    [225, 1],
    [412, 2],
    [600, 3],
    [768, 5],
    [900, 7],
  ])('renders the %spx height tier with %s visible cards', (height, count) => {
    render(BranchFan, {
      props: props(20, { availableWidth: 1200, availableHeight: height }),
    });
    expect(screen.getAllByRole('article')).toHaveLength(count);
  });

  it('responds to measured stage changes without initial announcements', async () => {
    const initial = props(20, {
      availableWidth: 1200,
      availableHeight: 600,
      reflowRevision: 1,
    });
    const { rerender } = render(BranchFan, { props: initial });
    const branch = screen.getByRole('region', {
      name: 'Leafward destinations',
    });

    expect(within(branch).getAllByRole('article')).toHaveLength(3);
    expect(within(branch).queryByRole('status')).toBeNull();
    await rerender({
      ...initial,
      availableHeight: 800,
      reflowRevision: 2,
    });
    expect(within(branch).getAllByRole('article')).toHaveLength(5);
    await rerender({
      ...initial,
      availableHeight: 400,
      reflowRevision: 3,
    });
    expect(within(branch).getAllByRole('article')).toHaveLength(2);
    expect(within(branch).queryByRole('status')).toBeNull();
    await Promise.resolve();
  });

  it('shrinks the static tier until the complete rendered lane fits', async () => {
    const initial = props(3, {
      availableWidth: 1200,
      availableHeight: 600,
      reflowRevision: 1,
    });
    const { rerender } = render(BranchFan, { props: initial });
    const branch = screen.getByRole('region', {
      name: 'Leafward destinations',
    });
    vi.spyOn(branch, 'getBoundingClientRect').mockImplementation(() =>
      measuredRect(
        within(branch).getAllByRole('article').length === 3 ? 620 : 500,
      ),
    );

    await rerender({ ...initial, reflowRevision: 2 });

    await vi.waitFor(() =>
      expect(within(branch).getAllByRole('article')).toHaveLength(2),
    );
    expect(within(branch).getByText('+1 more destination')).toBeVisible();
    expect(within(branch).queryByText('Branch 2')).not.toBeInTheDocument();
  });

  it('keeps the announced range synchronized when a shifted lane shrinks', async () => {
    render(BranchFan, {
      props: props(4, {
        availableWidth: 1200,
        availableHeight: 600,
      }),
    });
    const branch = screen.getByRole('region', {
      name: 'Leafward destinations',
    });
    vi.spyOn(branch, 'getBoundingClientRect').mockImplementation(() =>
      measuredRect(
        within(branch).getAllByRole('article').length === 3 ? 620 : 500,
      ),
    );

    await fireEvent.click(
      within(branch).getByRole('button', {
        name: 'Show 1 node below in the leafward rail',
      }),
    );

    await vi.waitFor(() =>
      expect(within(branch).getAllByRole('article')).toHaveLength(2),
    );
    expect(within(branch).getByRole('status')).toHaveTextContent(
      'Showing branches 2–3 of 4.',
    );
    expect(
      within(branch).getByRole('button', {
        name: 'Show 1 node above in the leafward rail',
      }),
    ).toHaveTextContent('+1 above');
    expect(
      within(branch).getByRole('button', {
        name: 'Show 1 node below in the leafward rail',
      }),
    ).toHaveTextContent('+1 more destination');
  });

  it('measures mixed-height windows and reports the exact hidden plural count', async () => {
    const initial = props(6, {
      availableWidth: 1200,
      availableHeight: 600,
      reflowRevision: 1,
    });
    const { rerender } = render(BranchFan, { props: initial });
    const branch = screen.getByRole('region', {
      name: 'Leafward destinations',
    });
    const heights = new Map([
      ['Branch 0', 150],
      ['Branch 1', 260],
      ['Branch 2', 190],
    ]);
    vi.spyOn(branch, 'getBoundingClientRect').mockImplementation(() => {
      const cards = within(branch).getAllByRole('article');
      const cardHeight = cards.reduce(
        (total, card) =>
          total +
          (heights.get(
            card.querySelector('.node-name')?.textContent?.trim() ?? '',
          ) ?? 150),
        0,
      );
      const controls = within(branch).queryAllByRole('button', {
        name: /leafward rail/,
      }).length;
      return measuredRect(cardHeight + controls * 44 + 32);
    });

    await rerender({ ...initial, reflowRevision: 2 });

    await vi.waitFor(() =>
      expect(within(branch).getAllByRole('article')).toHaveLength(2),
    );
    expect(within(branch).getByText('+4 more destinations')).toBeVisible();
  });

  it('clamps a preserved start when a larger window leaves fewer valid starts', async () => {
    const initial = props(8, {
      availableWidth: 1200,
      availableHeight: 600,
      reflowRevision: 1,
    });
    const { rerender } = render(BranchFan, { props: initial });
    const branch = screen.getByRole('region', {
      name: 'Leafward destinations',
    });
    for (let index = 0; index < 5; index += 1) {
      await fireEvent.click(
        within(branch).getByRole('button', {
          name: /Show \d+ nodes? below in the leafward rail/,
        }),
      );
    }
    expect(within(branch).getByText('Branch 7')).toBeVisible();

    await rerender({
      ...initial,
      availableHeight: 900,
      reflowRevision: 2,
    });
    expect(within(branch).getAllByRole('article')).toHaveLength(7);
    expect(within(branch).getByText('Branch 1')).toBeVisible();
    expect(within(branch).getByText('Branch 7')).toBeVisible();
  });

  it('accumulates dominant vertical wheel input and shifts at most once per event', async () => {
    setHeight(600);
    const onNavigate = vi.fn();
    render(BranchFan, { props: props(12, { onNavigate }) });
    const branch = screen.getByRole('region', {
      name: 'Leafward destinations',
    });

    expect(wheel(branch, 20).defaultPrevented).toBe(false);
    expect(within(branch).getByText('Branch 0')).toBeVisible();
    expect(wheel(branch, 20).defaultPrevented).toBe(true);
    await tick();
    expect(within(branch).getByText('Branch 1')).toBeVisible();
    expect(within(branch).queryByText('Branch 0')).toBeNull();

    expect(wheel(branch, 120).defaultPrevented).toBe(true);
    await tick();
    expect(within(branch).getByText('Branch 2')).toBeVisible();
    expect(within(branch).queryByText('Branch 3')).toBeVisible();
    expect(onNavigate).not.toHaveBeenCalled();
    expect(within(branch).getByRole('status')).toHaveTextContent(
      'Showing branches 3–5 of 12.',
    );
  });

  it('presents the shifted range as compact noninteractive accent status text', async () => {
    render(BranchFan, {
      props: props(12, { availableWidth: 1200, availableHeight: 600 }),
    });
    const branch = screen.getByRole('region', {
      name: 'Leafward destinations',
    });

    expect(within(branch).queryByRole('status')).toBeNull();
    expect(within(branch).getAllByRole('article')).toHaveLength(3);
    expect(
      within(branch).getByRole('button', {
        name: 'Show 9 nodes below in the leafward rail',
      }),
    ).toHaveTextContent('+9 more destinations');

    await fireEvent.click(
      within(branch).getByRole('button', {
        name: 'Show 9 nodes below in the leafward rail',
      }),
    );

    const status = within(branch).getByRole('status');
    document.documentElement.style.setProperty('--font-size-xs', '12px');
    document.documentElement.style.setProperty('--colour-accent', '#2367c9');
    document.body.style.fontSize = '15px';
    document.body.style.fontWeight = '400';
    document.body.style.color = '#17212b';

    const statusStyle = getComputedStyle(status);
    const bodyStyle = getComputedStyle(document.body);
    const statusFontSize = Number.parseFloat(
      resolveComputedToken(status, 'font-size'),
    );
    const bodyFontSize = Number.parseFloat(bodyStyle.fontSize);
    const statusColor = normalizeCssColor(
      resolveComputedToken(status, 'color'),
    );

    expect(status).toHaveTextContent('Showing branches 2–4 of 12.');
    expect(status.tagName).toBe('P');
    expect(status).toHaveClass('branch-window-range');
    expect(status).toHaveAttribute('data-branch-window-range');
    expect(status).not.toHaveAttribute('tabindex');
    expect(statusFontSize).toBeLessThan(bodyFontSize);
    expect(statusStyle.fontWeight).toBe('700');
    expect(statusColor).toBe('rgb(35, 103, 201)');
    expect(statusColor).not.toBe(bodyStyle.color);
    expect(
      within(branch).queryByRole('button', { name: status.textContent ?? '' }),
    ).toBeNull();
    expect(
      within(branch).queryByRole('link', { name: status.textContent ?? '' }),
    ).toBeNull();
    expect(within(branch).getAllByRole('article')).toHaveLength(3);
    expect(
      within(branch).getByRole('button', {
        name: 'Show 1 node above in the leafward rail',
      }),
    ).toHaveTextContent('+1 above');
    expect(
      within(branch).getByRole('button', {
        name: 'Show 8 nodes below in the leafward rail',
      }),
    ).toHaveTextContent('+8 more destinations');

    const rangeRule = branchFanSource.match(
      /\.branch-window-range\s*\{([^}]*)\}/,
    )?.[1];
    const laneRule = branchFanSource.match(/\.context-lane\s*\{([^}]*)\}/)?.[1];
    expect(laneRule).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(laneRule).toContain('inline-size: 100%');
    expect(rangeRule).toContain('color: var(--colour-accent)');
    expect(rangeRule).toContain('font-size: var(--font-size-xs)');
    expect(rangeRule).toContain('font-weight: 700');
    expect(rangeRule).toContain('line-height: 1.25');
    expect(rangeRule).toContain('justify-self: end');
    expect(rangeRule).toContain('inline-size: max-content');
    expect(rangeRule).toContain(
      'max-inline-size: calc(100% + var(--space-10))',
    );
    expect(rangeRule).toContain('overflow-wrap: anywhere');
    expect(rangeRule).toContain('text-align: left');
    expect(rangeRule).not.toMatch(/\b(?:background|border)\s*:/);

    document.documentElement.style.removeProperty('--font-size-xs');
    document.documentElement.style.removeProperty('--colour-accent');
    document.body.removeAttribute('style');
  });

  it('omits range status when every branch fits without continuation controls', () => {
    render(BranchFan, {
      props: props(3, { availableWidth: 1200, availableHeight: 600 }),
    });
    const branch = screen.getByRole('region', {
      name: 'Leafward destinations',
    });

    expect(within(branch).getAllByRole('article')).toHaveLength(3);
    expect(
      within(branch).queryByRole('button', { name: /leafward rail/ }),
    ).toBeNull();
    expect(within(branch).queryByRole('status')).toBeNull();
  });

  it('marks four-digit totals for rail-contained safe wrapping', async () => {
    render(BranchFan, {
      props: props(1000, { availableWidth: 1200, availableHeight: 600 }),
    });
    const branch = screen.getByRole('region', {
      name: 'Leafward destinations',
    });

    await fireEvent.click(
      within(branch).getByRole('button', {
        name: 'Show 997 nodes below in the leafward rail',
      }),
    );

    expect(within(branch).getByRole('status')).toHaveTextContent(
      'Showing branches 2–4 of 1000.',
    );
    expect(within(branch).getByRole('status')).toHaveAttribute(
      'data-branch-window-large-total',
      'true',
    );
    expect(branchFanSource).toContain(
      '.branch-window-range[data-branch-window-large-total]',
    );
    expect(branchFanSource).toContain('max-inline-size: 100%');
    expect(within(branch).getAllByRole('article')).toHaveLength(3);
    expect(
      within(branch).getByRole('button', {
        name: 'Show 996 nodes below in the leafward rail',
      }),
    ).toHaveTextContent('+996 more destinations');
  });

  it('ignores horizontal dominance and resets accumulation on reversal', () => {
    setHeight(600);
    render(BranchFan, { props: props(12) });
    const branch = screen.getByRole('region', {
      name: 'Leafward destinations',
    });

    expect(wheel(branch, 50, 60).defaultPrevented).toBe(false);
    expect(wheel(branch, 30).defaultPrevented).toBe(false);
    expect(wheel(branch, -20).defaultPrevented).toBe(false);
    expect(wheel(branch, -20).defaultPrevented).toBe(false);
    expect(within(branch).getByText('Branch 0')).toBeVisible();
    expect(within(branch).queryByRole('status')).toBeNull();
  });

  it('does not prevent boundary/no-op wheel input or move keyboard focus', async () => {
    setHeight(600);
    render(BranchFan, { props: props(4) });
    const branch = screen.getByRole('region', {
      name: 'Leafward destinations',
    });
    const focused = within(branch).getByRole('button', {
      name: 'Navigate leafward to Branch 0, DTD element declaration',
    });
    focused.focus();

    expect(wheel(branch, -40).defaultPrevented).toBe(false);
    expect(focused).toHaveFocus();
    expect(wheel(branch, 40).defaultPrevented).toBe(true);
    await tick();
    expect(document.activeElement).toBe(document.body);
    expect(
      within(branch)
        .getAllByRole('button')
        .some((button) => button === document.activeElement),
    ).toBe(false);
    expect(wheel(branch, 40).defaultPrevented).toBe(false);
    await Promise.resolve();
  });

  it('suppresses wheel shifts during an active pointer gesture and resumes afterward', async () => {
    setHeight(600);
    const initial = props(12, { isPointerGestureActive: true });
    const { rerender } = render(BranchFan, { props: initial });
    const branch = screen.getByRole('region', {
      name: 'Leafward destinations',
    });

    expect(wheel(branch, 40).defaultPrevented).toBe(false);
    expect(within(branch).getByText('Branch 0')).toBeVisible();

    await rerender({ ...initial, isPointerGestureActive: false });
    expect(wheel(branch, 40).defaultPrevented).toBe(true);
    expect(within(branch).getByText('Branch 1')).toBeVisible();
  });

  it('renders no more than seven of 500 generated branches and two controls', () => {
    setHeight(1000);
    const startedAt = performance.now();
    render(BranchFan, { props: props(500) });
    const elapsedMs = performance.now() - startedAt;
    const branch = screen.getByRole('region', {
      name: 'Leafward destinations',
    });

    expect(within(branch).getAllByRole('article')).toHaveLength(7);
    expect(
      within(branch).getAllByRole('button', {
        name: /leafward rail/,
      }),
    ).toHaveLength(1);
    expect(within(branch).queryByText('Branch 499')).toBeNull();
    expect(elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('removes its wheel listener when destroyed', () => {
    setHeight(600);
    const addSpy = vi.spyOn(HTMLElement.prototype, 'addEventListener');
    const removeSpy = vi.spyOn(HTMLElement.prototype, 'removeEventListener');
    const { unmount } = render(BranchFan, { props: props(12) });
    unmount();

    expect(addSpy).toHaveBeenCalledWith('wheel', expect.any(Function), {
      passive: false,
    });
    expect(removeSpy).toHaveBeenCalledWith('wheel', expect.any(Function));
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
