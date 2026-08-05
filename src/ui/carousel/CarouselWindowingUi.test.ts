import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/svelte';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../app/App.svelte';
import { inspectorStore } from '../../app/stores/inspectorStore';
import { navigationStore } from '../../app/stores/navigationStore';
import {
  getContainedChildren,
  type SchemaNode,
  type SchemaProject,
  type SchemaRelationship,
} from '../../schema/model';
import {
  bookDtdNodeIds,
  bookDtdProject,
} from '../../schema/samples/bookDtdProject';
import BranchFan from './BranchFan.svelte';
import branchFanSource from './BranchFan.svelte?raw';
import RootwardPath from './RootwardPath.svelte';
import rootwardPathSource from './RootwardPath.svelte?raw';
import rootwardHistoryRowSource from './RootwardHistoryRow.svelte?raw';
import schemaCarouselSource from './SchemaCarousel.svelte?raw';
import sideWindowControlSource from './SideWindowControl.svelte?raw';
import {
  notifyResizeObserver,
  observedResizeTargetCount,
} from '../../tests/setup';

function fixtureNode(index: number): SchemaNode {
  return {
    id: `fixture:${index}`,
    kind: 'dtdElement',
    name: `node-${index}`,
    compactDeclaration: '(#PCDATA)',
  };
}

function fixtureProject(
  relationships: readonly SchemaRelationship[],
): SchemaProject {
  return {
    id: 'fixture:context-project',
    displayName: 'Context fixture',
    nodes: [
      {
        id: 'fixture:source',
        kind: 'dtdElement',
        name: 'source',
      },
      ...relationships.map(({ node }) => node),
    ],
    edges: relationships.map(({ edge }) => edge),
    rootNodeIds: ['fixture:source'],
  };
}

describe('carousel window fixtures', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 700,
      writable: true,
    });
    navigationStore.initializeAt(bookDtdNodeIds.book);
    inspectorStore.close();
  });

  afterEach(() => {
    navigationStore.initializeAt(bookDtdNodeIds.book);
    inspectorStore.close();
  });

  it('renders three ordered branch cards and an interactive overflow control', () => {
    const relationships: SchemaRelationship[] = Array.from(
      { length: 9 },
      (_, index) => ({
        node: fixtureNode(index),
        edge: {
          id: `edge:${index}`,
          kind: 'contains',
          sourceNodeId: 'fixture:source',
          targetNodeId: `fixture:${index}`,
          order: index,
        },
      }),
    );

    render(BranchFan, {
      props: {
        project: fixtureProject(relationships),
        relationships,
        focusNodeId: 'fixture:source',
        inspectedNodeId: undefined,
        focusedNodeKind: 'dtdElement',
        nextJourneyPosition: 1,
        onNavigate: vi.fn(),
        onToggleInspection: vi.fn(),
      },
    });

    const branch = screen.getByRole('region', {
      name: 'Leafward destinations',
    });
    expect(
      within(branch)
        .getAllByRole('button')
        .map((button) => button.ariaLabel)
        .filter((label) => label?.startsWith('Navigate')),
    ).toEqual(
      Array.from(
        { length: 3 },
        (_, index) =>
          `Navigate leafward to node-${index}, DTD element declaration`,
      ),
    );
    expect(within(branch).getByText('+6 more destinations')).toBeVisible();
    expect(
      within(branch).queryByText('DTD element declaration'),
    ).not.toBeInTheDocument();
    expect(
      within(branch).getByRole('button', {
        name: 'Show 6 nodes below in the leafward rail',
      }),
    ).toHaveAttribute('data-carousel-gesture-ignore');
    expect(within(branch).getAllByRole('article')).toHaveLength(3);
  });

  it('shows model kinds only when visible context is heterogeneous', () => {
    const relationships: SchemaRelationship[] = [
      {
        node: fixtureNode(0),
        edge: {
          id: 'edge:0',
          kind: 'contains',
          sourceNodeId: 'fixture:source',
          targetNodeId: 'fixture:0',
          order: 0,
        },
      },
      {
        node: { ...fixtureNode(1), kind: 'globalElement' },
        edge: {
          id: 'edge:1',
          kind: 'contains',
          sourceNodeId: 'fixture:source',
          targetNodeId: 'fixture:1',
          order: 1,
        },
      },
    ];

    render(BranchFan, {
      props: {
        project: fixtureProject(relationships),
        relationships,
        focusNodeId: 'fixture:source',
        inspectedNodeId: undefined,
        focusedNodeKind: 'dtdElement',
        nextJourneyPosition: 1,
        onNavigate: vi.fn(),
        onToggleInspection: vi.fn(),
      },
    });

    const branch = screen.getByRole('region', {
      name: 'Leafward destinations',
    });
    expect(within(branch).getByText('DTD element declaration')).toBeVisible();
    expect(
      within(branch).getByText('Global element declaration'),
    ).toBeVisible();
    expect(
      within(branch).getByRole('button', {
        name: 'Navigate leafward through Child to node-1, Global element declaration',
      }),
    ).toBeVisible();
  });

  it('keeps XSD relationship meaning and repeated edge identity on branch cards', async () => {
    const target: SchemaNode = {
      id: 'fixture:shared',
      kind: 'globalElement',
      name: 'shared',
    };
    const relationships: SchemaRelationship[] = [
      {
        node: { id: 'fixture:type', kind: 'complexType', name: 'SharedType' },
        edge: {
          id: 'edge:type',
          kind: 'typeOf',
          sourceNodeId: 'fixture:source',
          targetNodeId: 'fixture:type',
          order: 0,
          occurrence: { min: 0, max: 1 },
        },
      },
      {
        node: target,
        edge: {
          id: 'edge:reference:first',
          kind: 'references',
          sourceNodeId: 'fixture:source',
          targetNodeId: target.id,
          order: 1,
          occurrence: { min: 0, max: 'unbounded' },
        },
      },
      {
        node: target,
        edge: {
          id: 'edge:reference:second',
          kind: 'references',
          sourceNodeId: 'fixture:source',
          targetNodeId: target.id,
          order: 2,
        },
      },
    ];
    const onNavigate = vi.fn();
    const onToggleInspection = vi.fn();

    render(BranchFan, {
      props: {
        project: fixtureProject(relationships),
        relationships,
        focusNodeId: 'fixture:source',
        inspectedNodeId: undefined,
        focusedNodeKind: 'globalElement',
        nextJourneyPosition: 1,
        onNavigate,
        onToggleInspection,
      },
    });

    const branch = screen.getByRole('region', {
      name: 'Leafward destinations',
    });
    expect(
      within(branch).getByRole('button', {
        name: 'Navigate leafward through Type to SharedType, Complex type declaration',
      }),
    ).toBeVisible();
    expect(
      within(branch).getAllByRole('button', {
        name: 'Navigate leafward through Referenced element to shared, Global element declaration',
      }),
    ).toHaveLength(2);
    expect(within(branch).queryByText(/[?*+]/)).not.toBeInTheDocument();
    expect(
      Array.from(
        branch.querySelectorAll<HTMLElement>(
          '[data-carousel-leafward-candidate-edge-id]',
        ),
      ).map((candidate) => ({
        nodeId: candidate.dataset.carouselLeafwardCandidateId,
        edgeId: candidate.dataset.carouselLeafwardCandidateEdgeId,
      })),
    ).toEqual([
      { nodeId: 'fixture:type', edgeId: 'edge:type' },
      { nodeId: 'fixture:shared', edgeId: 'edge:reference:first' },
      { nodeId: 'fixture:shared', edgeId: 'edge:reference:second' },
    ]);

    await fireEvent.click(
      within(branch).getAllByRole('button', {
        name: 'Navigate leafward through Referenced element to shared, Global element declaration',
      })[1]!,
    );
    expect(onNavigate).toHaveBeenCalledWith(relationships[2]);
    expect(onToggleInspection).not.toHaveBeenCalled();

    await fireEvent.click(
      within(branch).getAllByRole('button', { name: 'Inspect shared' })[0]!,
    );
    expect(onToggleInspection).toHaveBeenCalledWith('fixture:shared');
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('renders the initial three-card chapter window as gesture candidates', () => {
    render(BranchFan, {
      props: {
        project: bookDtdProject,
        relationships: getContainedChildren(
          bookDtdProject,
          bookDtdNodeIds.chapter,
        ),
        focusNodeId: bookDtdNodeIds.chapter,
        inspectedNodeId: undefined,
        focusedNodeKind: 'dtdElement',
        nextJourneyPosition: 1,
        onNavigate: vi.fn(),
        onToggleInspection: vi.fn(),
      },
    });

    const branch = screen.getByRole('region', {
      name: 'Leafward destinations',
    });
    expect(
      within(branch)
        .getAllByRole('button')
        .map((button) => button.ariaLabel)
        .filter((label) => label?.startsWith('Navigate')),
    ).toEqual([
      'Navigate leafward to title, DTD element declaration',
      'Navigate leafward to epigraph?, DTD element declaration',
      'Navigate leafward to section*, DTD element declaration',
    ]);
    expect(
      Array.from(
        branch.querySelectorAll<HTMLElement>(
          '[data-carousel-leafward-candidate-id]',
        ),
      ).map((candidate) => ({
        nodeId: candidate.dataset.carouselLeafwardCandidateId,
        visibleOrder: candidate.dataset.carouselVisibleOrder,
      })),
    ).toEqual([
      { nodeId: bookDtdNodeIds.title, visibleOrder: '0' },
      { nodeId: bookDtdNodeIds.epigraph, visibleOrder: '1' },
      { nodeId: bookDtdNodeIds.section, visibleOrder: '2' },
    ]);
    expect(
      within(branch).getByRole('button', {
        name: 'Show 2 nodes below in the leafward rail',
      }),
    ).toHaveTextContent('+2 more');
    expect(
      within(branch).queryByText('DTD element declaration'),
    ).not.toBeInTheDocument();
    expect(within(branch).getAllByRole('article')).toHaveLength(3);
    for (const card of within(branch).getAllByRole('article')) {
      expect(within(card).getAllByRole('button')).toHaveLength(2);
    }
  });

  it('renders a compact noninteractive chapter model only on its side card', () => {
    render(BranchFan, {
      props: {
        project: bookDtdProject,
        relationships: getContainedChildren(
          bookDtdProject,
          bookDtdNodeIds.bookContent,
        ),
        focusNodeId: bookDtdNodeIds.bookContent,
        inspectedNodeId: undefined,
        focusedNodeKind: 'dtdElement',
        nextJourneyPosition: 2,
        onNavigate: vi.fn(),
        onToggleInspection: vi.fn(),
      },
    });

    const card = screen.getByRole('article', {
      name: 'Destination chapter+',
    });
    const structure = within(card).getByLabelText(
      'Structure summary for chapter',
    );
    expect(structure).toHaveTextContent('title, epigraph?, section*');
    expect(structure).toHaveTextContent('+2 more');
    expect(within(structure).queryByRole('button')).not.toBeInTheDocument();
    expect(
      within(card).queryByText('(title, epigraph?, section*, figure*, note*)'),
    ).not.toBeInTheDocument();
    expect(
      within(card)
        .getAllByRole('button')
        .map((button) => button.ariaLabel),
    ).toEqual([
      'Navigate leafward to chapter+, DTD element declaration',
      'Inspect chapter',
    ]);
  });

  it('renders one previous-step card and two compact earlier-path rows', async () => {
    const nodes = Array.from({ length: 5 }, (_, index) => fixtureNode(index));
    const onNavigatePrevious = vi.fn();
    const onJumpEarlier = vi.fn();
    const onToggleInspection = vi.fn();

    render(RootwardPath, {
      props: {
        nodes,
        inspectedNodeId: undefined,
        focusedNodeKind: 'dtdElement',
        journeyLength: 6,
        journeyKey: 'rootward-fixture',
        onNavigatePrevious,
        onJumpEarlier,
        onToggleInspection,
      },
    });

    const path = screen.getByRole('region', { name: 'Rootward journey' });
    expect(within(path).getAllByRole('article')).toHaveLength(1);
    expect(
      within(path).getByRole('article', { name: 'Previous step node-0' }),
    ).toBeVisible();
    expect(
      within(path).getByRole('heading', { name: 'Earlier in path' }),
    ).toBeVisible();
    expect(
      Array.from(
        path.querySelectorAll<HTMLElement>('[data-rootward-history-row]'),
      ).map((row) => ({
        position: row.dataset.journeyPosition,
        name: within(row).getByRole('button', {
          name: /Jump to/,
        }).ariaLabel,
      })),
    ).toEqual([
      {
        position: '3',
        name: 'Jump to node-1, earlier in the current path',
      },
      {
        position: '2',
        name: 'Jump to node-2, earlier in the current path',
      },
    ]);
    expect(
      within(path).getByRole('button', {
        name: 'Show 2 earlier path steps',
      }),
    ).toHaveTextContent('Show 2 earlier path steps');
    expect(path).not.toHaveTextContent('Prior focus');
    expect(path).not.toHaveTextContent('Direct ancestor');

    await fireEvent.click(
      within(path).getByRole('button', {
        name: 'Navigate rootward to node-0, DTD element declaration',
      }),
    );
    expect(onNavigatePrevious).toHaveBeenCalledOnce();
    expect(onJumpEarlier).not.toHaveBeenCalled();

    await fireEvent.click(
      within(path).getByRole('button', {
        name: 'Jump to node-1, earlier in the current path',
      }),
    );
    expect(onJumpEarlier).toHaveBeenCalledWith('fixture:1', 3);

    await fireEvent.click(
      within(path).getByRole('button', { name: 'Inspect node-1' }),
    );
    expect(onToggleInspection).toHaveBeenCalledWith('fixture:1');
    expect(onJumpEarlier).toHaveBeenCalledOnce();
    expect(path.querySelector('button button')).toBeNull();
  });

  it('reduces rootward history rows when the rendered lane exceeds the measured stage', async () => {
    const nodes = Array.from({ length: 5 }, (_, index) => fixtureNode(index));
    const initial = {
      nodes,
      inspectedNodeId: undefined,
      focusedNodeKind: 'dtdElement' as const,
      journeyLength: 6,
      journeyKey: 'measured-rootward-fixture',
      earlierPathRows: 2,
      availableHeight: 600,
      reflowRevision: 1,
      onNavigatePrevious: vi.fn(),
      onJumpEarlier: vi.fn(),
      onToggleInspection: vi.fn(),
    };
    const { rerender } = render(RootwardPath, { props: initial });
    const path = screen.getByRole('region', { name: 'Rootward journey' });
    vi.spyOn(path, 'getBoundingClientRect').mockImplementation(() => {
      const height =
        path.querySelectorAll('[data-rootward-history-row]').length === 2
          ? 620
          : 500;
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
    });

    await rerender({ ...initial, reflowRevision: 2 });

    await waitFor(() =>
      expect(path.querySelectorAll('[data-rootward-history-row]')).toHaveLength(
        1,
      ),
    );
    expect(
      within(path).getByRole('button', {
        name: 'Show 3 earlier path steps',
      }),
    ).toBeVisible();
    expect(
      within(path).queryByRole('button', {
        name: 'Jump to node-2, earlier in the current path',
      }),
    ).not.toBeInTheDocument();

    await fireEvent.click(
      within(path).getByRole('button', {
        name: 'Show 3 earlier path steps',
      }),
    );
    expect(
      within(path).getByRole('button', {
        name: 'Jump to node-4, earlier in the current path',
      }),
    ).toBeVisible();
    expect(
      within(path).getByRole('button', {
        name: 'Show 3 steps closer to current',
      }),
    ).toBeVisible();
  });

  it('shifts the production chapter window without changing application state', async () => {
    navigationStore.initializeAt(bookDtdNodeIds.chapter);
    inspectorStore.inspect(bookDtdNodeIds.title);
    render(App);

    const branch = screen.getByRole('region', {
      name: 'Leafward destinations',
    });
    const initialJourney = [...get(navigationStore.navigationPathIds)];
    const initialAnnouncement = screen.getByRole('status').textContent;

    expect(
      within(branch)
        .getAllByRole('article')
        .map((card) => card.getAttribute('aria-label')),
    ).toEqual([
      'Destination title',
      'Destination epigraph?',
      'Destination section*',
    ]);
    expect(
      within(branch).queryByRole('article', { name: 'Destination figure*' }),
    ).not.toBeInTheDocument();
    expect(
      within(branch).queryByRole('article', { name: 'Destination note*' }),
    ).not.toBeInTheDocument();

    await fireEvent.click(
      within(branch).getByRole('button', {
        name: 'Show 2 nodes below in the leafward rail',
      }),
    );

    expect(
      within(branch)
        .getAllByRole('article')
        .map((card) => card.getAttribute('aria-label')),
    ).toEqual([
      'Destination epigraph?',
      'Destination section*',
      'Destination figure*',
    ]);
    expect(
      within(branch).getByRole('button', {
        name: 'Show 1 node above in the leafward rail',
      }),
    ).toHaveTextContent('+1 above');
    expect(
      within(branch).getByRole('button', {
        name: 'Show 1 node below in the leafward rail',
      }),
    ).toHaveTextContent('+1 more');

    await fireEvent.click(
      within(branch).getByRole('button', {
        name: 'Show 1 node below in the leafward rail',
      }),
    );

    expect(
      within(branch)
        .getAllByRole('article')
        .map((card) => card.getAttribute('aria-label')),
    ).toEqual([
      'Destination section*',
      'Destination figure*',
      'Destination note*',
    ]);
    expect(
      within(branch).getByRole('button', {
        name: 'Show 2 nodes above in the leafward rail',
      }),
    ).toHaveFocus();
    expect(
      Array.from(
        branch.querySelectorAll<HTMLElement>(
          '[data-carousel-leafward-candidate-id]',
        ),
      ).map((candidate) => ({
        nodeId: candidate.dataset.carouselLeafwardCandidateId,
        visibleOrder: candidate.dataset.carouselVisibleOrder,
      })),
    ).toEqual([
      { nodeId: bookDtdNodeIds.section, visibleOrder: '0' },
      { nodeId: bookDtdNodeIds.figure, visibleOrder: '1' },
      { nodeId: bookDtdNodeIds.note, visibleOrder: '2' },
    ]);
    expect(get(navigationStore.currentFocusNodeId)).toBe(
      bookDtdNodeIds.chapter,
    );
    expect(get(navigationStore.navigationPathIds)).toEqual(initialJourney);
    expect(get(inspectorStore.inspectedNodeId)).toBe(bookDtdNodeIds.title);
    expect(within(branch).getByRole('status')).toHaveTextContent(
      'Showing branches 3–5 of 5.',
    );
    expect(
      screen.getAllByRole('status').find((status) => !branch.contains(status))
        ?.textContent,
    ).toBe(initialAnnouncement);

    await fireEvent.click(screen.getByRole('button', { name: 'Center note*' }));
    expect(get(navigationStore.navigationPathIds)).toEqual([
      bookDtdNodeIds.chapter,
      bookDtdNodeIds.note,
    ]);
  });

  it('rebuilds branch capacity across repeated stage resizes and preserves canonical state', async () => {
    navigationStore.initializeAt(bookDtdNodeIds.chapter);
    inspectorStore.inspect(bookDtdNodeIds.title);
    const { container } = render(App);
    const viewport = container.querySelector<HTMLElement>(
      '[data-carousel-gesture-viewport]',
    );
    const layer = container.querySelector<HTMLElement>(
      '[data-carousel-gesture-layer]',
    );
    if (!viewport || !layer) throw new Error('Expected carousel stage.');
    const search = screen.getByRole('searchbox', { name: 'Search schema' });
    await fireEvent.input(search, { target: { value: 'title' } });
    const initialJourney = [...get(navigationStore.navigationPathIds)];

    notifyResizeObserver(viewport, 1200, 920);
    await waitFor(() =>
      expect(
        within(
          screen.getByRole('region', { name: 'Leafward destinations' }),
        ).getAllByRole('article'),
      ).toHaveLength(5),
    );
    const largeRevision = Number(
      viewport.dataset.carouselReflowRevision ?? '0',
    );
    const branch = screen.getByRole('region', {
      name: 'Leafward destinations',
    });
    const hiddenCandidate = within(branch).getByRole('button', {
      name: 'Navigate leafward to note*, DTD element declaration',
    });
    hiddenCandidate.focus();
    layer.style.setProperty('--gesture-offset', '48px');

    notifyResizeObserver(viewport, 1000, 300);
    notifyResizeObserver(viewport, 1000, 300);

    await waitFor(() =>
      expect(within(branch).getAllByRole('article')).toHaveLength(1),
    );
    expect(within(branch).getByText('+4 more destinations')).toBeVisible();
    expect(Number(viewport.dataset.carouselReflowRevision)).toBe(
      largeRevision + 1,
    );
    expect(viewport.dataset.carouselStageWidth).toBe('1000');
    expect(viewport.dataset.carouselStageHeight).toBe('300');
    expect(layer.style.getPropertyValue('--gesture-offset')).toBe('0px');
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { level: 2, name: 'chapter' }),
      ).toHaveFocus(),
    );
    expect(get(navigationStore.navigationPathIds)).toEqual(initialJourney);
    expect(get(inspectorStore.inspectedNodeId)).toBe(bookDtdNodeIds.title);
    expect(search).toHaveValue('title');

    notifyResizeObserver(viewport, 1200, 920);
    await waitFor(() =>
      expect(within(branch).getAllByRole('article')).toHaveLength(5),
    );
    const visibleCandidate = within(branch).getByRole('button', {
      name: 'Navigate leafward to title, DTD element declaration',
    });
    visibleCandidate.focus();
    notifyResizeObserver(viewport, 1200, 500);
    await waitFor(() =>
      expect(within(branch).getAllByRole('article')).toHaveLength(2),
    );
    expect(visibleCandidate).toHaveFocus();
    expect(within(branch).getByText('+3 more destinations')).toBeVisible();

    notifyResizeObserver(viewport, 1200, 920);
    await waitFor(() =>
      expect(within(branch).getAllByRole('article')).toHaveLength(5),
    );
    notifyResizeObserver(viewport, 1000, 300);
    await waitFor(() =>
      expect(within(branch).getAllByRole('article')).toHaveLength(1),
    );
    expect(within(branch).getByText('+4 more destinations')).toBeVisible();

    const unchangedRevision = Number(viewport.dataset.carouselReflowRevision);
    notifyResizeObserver(viewport, 1000, 300);
    await new Promise<void>((resolve) =>
      window.requestAnimationFrame(() => resolve()),
    );
    expect(Number(viewport.dataset.carouselReflowRevision)).toBe(
      unchangedRevision,
    );
  });

  it('disconnects the stage observer and supports the window-resize fallback', async () => {
    const first = render(App);
    expect(observedResizeTargetCount()).toBe(1);
    first.unmount();
    expect(observedResizeTargetCount()).toBe(0);

    const previousResizeObserver = globalThis.ResizeObserver;
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: undefined,
    });
    let width = 1200;
    let height = 920;
    const fallback = render(App);
    try {
      const viewport = fallback.container.querySelector<HTMLElement>(
        '[data-carousel-gesture-viewport]',
      );
      if (!viewport) throw new Error('Expected fallback carousel stage.');
      vi.spyOn(viewport, 'getBoundingClientRect').mockImplementation(
        () =>
          ({
            width,
            height,
          }) as DOMRect,
      );
      await fireEvent(window, new Event('resize'));
      await waitFor(() =>
        expect(viewport.dataset.carouselStageHeight).toBe('920'),
      );

      width = 1000;
      height = 300;
      await fireEvent(window, new Event('resize'));
      await waitFor(() =>
        expect(viewport.dataset.carouselStageHeight).toBe('300'),
      );
    } finally {
      fallback.unmount();
      Object.defineProperty(globalThis, 'ResizeObserver', {
        configurable: true,
        value: previousResizeObserver,
      });
    }
  });

  it('reveals earlier rootward positions while pinning the immediate previous node', async () => {
    navigationStore.initializeAt(bookDtdNodeIds.book);
    navigationStore.navigateLeafward(bookDtdNodeIds.bookContent);
    navigationStore.navigateLeafward(bookDtdNodeIds.chapter);
    navigationStore.navigateLeafward(bookDtdNodeIds.section);
    navigationStore.navigateLeafward(bookDtdNodeIds.para);
    inspectorStore.inspect(bookDtdNodeIds.title);
    render(App);

    const path = screen.getByRole('region', { name: 'Rootward journey' });
    const initialJourney = [...get(navigationStore.navigationPathIds)];
    const initialAnnouncement = screen.getByRole('status').textContent;

    expect(within(path).getAllByRole('article')).toHaveLength(1);
    expect(
      within(path).getByRole('article', { name: 'Previous step section' }),
    ).toBeVisible();
    expect(
      within(path)
        .getAllByRole('button', { name: /earlier in the current path/ })
        .map((button) => button.ariaLabel),
    ).toEqual([
      'Jump to chapter, earlier in the current path',
      'Jump to book.content, earlier in the current path',
    ]);

    await fireEvent.click(
      within(path).getByRole('button', {
        name: 'Show 1 earlier path step',
      }),
    );

    expect(
      within(path)
        .getAllByRole('button', { name: /earlier in the current path/ })
        .map((button) => button.ariaLabel),
    ).toEqual([
      'Jump to book.content, earlier in the current path',
      'Jump to book, earlier in the current path',
    ]);
    const closer = within(path).getByRole('button', {
      name: 'Show 1 step closer to current',
    });
    expect(closer).toHaveTextContent('Show 1 step closer to current');
    expect(closer).toHaveFocus();
    expect(
      within(path).getByRole('article', { name: 'Previous step section' }),
    ).toBeVisible();
    expect(get(navigationStore.navigationPathIds)).toEqual(initialJourney);
    expect(get(inspectorStore.inspectedNodeId)).toBe(bookDtdNodeIds.title);
    expect(screen.getByRole('status').textContent).toBe(initialAnnouncement);

    await fireEvent.click(closer);
    expect(
      within(path)
        .getAllByRole('button', { name: /earlier in the current path/ })
        .map((button) => button.ariaLabel),
    ).toEqual([
      'Jump to chapter, earlier in the current path',
      'Jump to book.content, earlier in the current path',
    ]);

    await fireEvent.click(
      within(path).getByRole('button', {
        name: 'Navigate rootward to section, DTD element declaration',
      }),
    );
    expect(get(navigationStore.navigationPathIds)).toEqual([
      bookDtdNodeIds.book,
      bookDtdNodeIds.bookContent,
      bookDtdNodeIds.chapter,
      bookDtdNodeIds.section,
    ]);
    expect(
      within(path)
        .getAllByRole('article')
        .map((card) => card.getAttribute('aria-label')),
    ).toEqual(['Previous step chapter']);
    expect(
      within(path).queryByRole('button', { name: /Show .*path step/ }),
    ).not.toBeInTheDocument();

    await fireEvent.click(
      within(path).getByRole('button', {
        name: 'Jump to book.content, earlier in the current path',
      }),
    );
    expect(get(navigationStore.navigationPathIds)).toEqual([
      bookDtdNodeIds.book,
      bookDtdNodeIds.bookContent,
    ]);
  });

  it('renders every terminal closure as information with active Inspect', async () => {
    const project: SchemaProject = {
      id: 'recursive-context-project',
      displayName: 'Recursive context project',
      nodes: [
        { id: 'one', kind: 'dtdElement', name: 'one' },
        { id: 'two', kind: 'dtdElement', name: 'two' },
      ],
      edges: [
        {
          id: 'two-one',
          kind: 'contains',
          sourceNodeId: 'two',
          targetNodeId: 'one',
          order: 0,
        },
        {
          id: 'two-two',
          kind: 'contains',
          sourceNodeId: 'two',
          targetNodeId: 'two',
          order: 1,
        },
      ],
      rootNodeIds: ['one'],
    };
    const relationships = getContainedChildren(project, 'two');
    const onNavigate = vi.fn();
    const onToggleInspection = vi.fn();

    render(BranchFan, {
      props: {
        project,
        relationships,
        focusNodeId: 'two',
        navigationState: {
          projectId: project.id,
          navigationPath: ['one', 'two'],
        },
        inspectedNodeId: undefined,
        focusedNodeKind: 'dtdElement',
        nextJourneyPosition: 2,
        onNavigate,
        onToggleInspection,
      },
    });

    const earlier = screen.getByRole('article', {
      name: 'Recursive child one',
    });
    expect(
      within(earlier).getByText('Already present earlier in this path'),
    ).toBeVisible();
    await fireEvent.click(
      within(earlier).getByLabelText(
        'Recursive child one. Already present earlier in this path',
      ),
    );
    expect(onNavigate).not.toHaveBeenCalled();
    expect(
      within(earlier).queryByRole('button', {
        name: /Navigate|Return/,
      }),
    ).not.toBeInTheDocument();
    expect(
      within(earlier).getByRole('button', { name: 'Inspect one' }),
    ).toBeEnabled();

    const self = screen.getByRole('article', {
      name: 'Recursive child two',
    });
    expect(within(self).getByText('Already the current element')).toBeVisible();
    expect(
      within(self).queryByRole('button', {
        name: /Navigate|Return/,
      }),
    ).not.toBeInTheDocument();
    expect(
      within(self).getByRole('button', { name: 'Inspect two' }),
    ).toBeEnabled();
    expect(self).toHaveAttribute(
      'data-carousel-leafward-candidate-edge-id',
      'two-two',
    );
  });

  it('declares stable window, stage, gesture-ignore, and focus-ring contracts', () => {
    expect(branchFanSource).toContain('data-carousel-side-window="leafward"');
    expect(rootwardPathSource).toContain(
      'data-carousel-side-window="rootward"',
    );
    expect(rootwardPathSource).toContain('data-rootward-previous-step');
    expect(rootwardPathSource).toContain('contextLabel="Previous step"');
    expect(rootwardHistoryRowSource).toContain('data-rootward-history-row');
    expect(rootwardHistoryRowSource).toContain('data-earlier-path-jump');
    expect(rootwardHistoryRowSource).toContain('data-carousel-gesture-ignore');
    expect(rootwardHistoryRowSource).toContain(
      'min-height: var(--control-min-size)',
    );
    expect(rootwardHistoryRowSource).toContain(':focus-visible');
    expect(rootwardHistoryRowSource).toContain(
      '@container carousel (max-width: 430px)',
    );
    expect(sideWindowControlSource).toContain(
      'data-carousel-side-window-control',
    );
    expect(sideWindowControlSource).toContain('data-carousel-gesture-ignore');
    expect(sideWindowControlSource).toContain(':focus-visible');
    expect(sideWindowControlSource).toContain(
      'min-height: var(--control-min-size)',
    );
    expect(schemaCarouselSource).toContain('data-carousel-motion-stage');
    expect(schemaCarouselSource).toContain('new ResizeObserver');
    expect(schemaCarouselSource).toContain('resizeObserver?.disconnect()');
    expect(schemaCarouselSource).toContain('window.requestAnimationFrame');
    expect(schemaCarouselSource).toContain('dimensionsMateriallyChanged');
    expect(schemaCarouselSource).toContain('overflow: hidden');
    expect(schemaCarouselSource).toContain(
      ':global([data-carousel-side-window-control])',
    );
    expect(schemaCarouselSource).toContain(
      'translateX(calc(100% + var(--space-4)))',
    );
    expect(schemaCarouselSource).toContain(
      'translateX(calc(-100% - var(--space-4)))',
    );
    expect(branchFanSource).toContain(
      '@media (orientation: landscape) and (max-height: 520px)',
    );
    expect(rootwardPathSource).toContain(
      '@media (orientation: landscape) and (max-height: 520px)',
    );
  });
});
