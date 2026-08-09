import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import {
  projectSearchScoreTiers,
  type ProjectSearchResult,
} from '../../app/search';
import {
  buildProjectSearchPresentation,
  SEARCH_GUIDANCE_TEXT,
  SEARCH_TRUNCATION_NOTICE,
  SEARCH_UI_RESULT_LIMIT,
} from '../presentation/projectSearchPresentation';
import searchResultsPanelSource from './SearchResultsPanel.svelte?raw';
import SearchResultsPanel from './SearchResultsPanel.svelte';

function result(
  overrides: Partial<ProjectSearchResult> = {},
): ProjectSearchResult {
  return {
    id: `search-document:${overrides.nodeId ?? 'type-1'}`,
    resultKind: 'schema-node',
    nodeId: 'type-1',
    nodeKind: 'complexType',
    nodeCategory: 'type',
    nodeName: 'BaseType',
    sourceFileId: 'annotations',
    sourceFilename: 'annotations.xsd',
    score: projectSearchScoreTiers.exactName,
    matches: [
      {
        fieldId: 'name',
        fieldKind: 'name',
        text: 'BaseType',
      },
    ],
    ...overrides,
  };
}

function renderPanel(
  query: string,
  results: readonly ProjectSearchResult[],
  options: {
    readonly currentFocusNodeId?: string;
    readonly inspectedNodeId?: string;
    readonly actionError?: string;
    readonly sourceViewable?: boolean;
  } = {},
) {
  const onClose = vi.fn();
  const onCenterResult = vi.fn();
  const onInspectResult = vi.fn();
  const onOpenPackageEntry = vi.fn();
  const onViewSource = vi.fn();
  const presentation = buildProjectSearchPresentation(query, results);
  const rendered = render(SearchResultsPanel, {
    props: {
      panelId: 'test-search-results',
      presentation,
      currentFocusNodeId: options.currentFocusNodeId ?? 'other-node',
      inspectedNodeId: options.inspectedNodeId,
      actionError: options.actionError,
      onCenterResult,
      onInspectResult,
      onOpenPackageEntry,
      canViewSource: () => options.sourceViewable ?? false,
      onViewSource,
      onClose,
    },
  });
  return {
    ...rendered,
    presentation,
    onCenterResult,
    onInspectResult,
    onOpenPackageEntry,
    onViewSource,
    onClose,
  };
}

describe('search results panel', () => {
  it('renders the heading, guidance, close control, and polite status region', () => {
    renderPanel('', []);

    expect(
      screen.getByRole('heading', { name: 'Search results' }),
    ).toBeVisible();
    expect(screen.getByText(SEARCH_GUIDANCE_TEXT)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Close search' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('renders exact empty-state wording as inert text', () => {
    renderPanel('  MissingType  ', []);

    expect(
      screen.getByRole('heading', {
        name: 'No nodes matched “MissingType”.',
      }),
    ).toBeVisible();
    expect(
      screen.getByText(
        'Try a shorter name, a namespace prefix, documentation text, or a DTD comment.',
      ),
    ).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders group headings/counts, result anatomy, context, and marks', () => {
    renderPanel('Base documentation', [
      result({
        score: projectSearchScoreTiers.documentation,
        matches: [
          {
            fieldId: 'name',
            fieldKind: 'name',
            text: 'BaseType',
          },
          {
            fieldId: 'documentation',
            fieldKind: 'documentation',
            text: 'Base documentation for reusable content.',
            language: 'en',
          },
          {
            fieldId: 'source',
            fieldKind: 'sourceFile',
            text: 'annotations.xsd',
          },
        ],
      }),
    ]);

    const group = screen.getByRole('heading', {
      name: 'Documentation and comments (1)',
    }).parentElement!;
    expect(within(group).getByRole('list')).toBeVisible();
    const article = within(group).getByRole('article');
    expect(
      within(article).getByRole('heading', { name: 'BaseType' }),
    ).toBeVisible();
    expect(within(article).getByText('Complex type declaration')).toBeVisible();
    expect(within(article).getByText('annotations.xsd')).toBeVisible();
    expect(within(article).getByText('Documentation · en:')).toBeVisible();
    expect(within(article).getAllByText(/Base|documentation/)).not.toHaveLength(
      0,
    );
    expect(article.querySelectorAll('mark')).not.toHaveLength(0);
    expect(within(article).getByText('+1 additional match')).toBeVisible();
  });

  it('renders sibling native Centre and Inspect actions in the accepted order', () => {
    renderPanel('Base', [result()]);
    const article = screen.getByRole('article');
    const controls = within(article).getAllByRole('button');

    expect(article.tagName).toBe('ARTICLE');
    expect(article).not.toHaveAttribute('tabindex');
    expect(controls).toHaveLength(2);
    expect(controls[0]).toHaveAccessibleName(
      'Center BaseType, Complex type declaration',
    );
    expect(controls[1]).toHaveAccessibleName(
      'Inspect BaseType, Complex type declaration',
    );
    expect(controls[0]!.contains(controls[1]!)).toBe(false);
    expect(within(article).queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('adds a distinct source action only for retained source without invoking primary actions', async () => {
    const viewable = renderPanel('Base', [result()], {
      sourceViewable: true,
    });
    const sourceAction = screen.getByRole('button', {
      name: 'View source for BaseType',
    });
    await fireEvent.click(sourceAction);
    expect(viewable.onViewSource).toHaveBeenCalledWith(
      expect.objectContaining({ nodeId: 'type-1' }),
      sourceAction,
    );
    expect(viewable.onCenterResult).not.toHaveBeenCalled();
    expect(viewable.onInspectResult).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'BaseType' })).toBeVisible();

    viewable.unmount();
    renderPanel('Base', [result()], { sourceViewable: false });
    expect(
      screen.queryByRole('button', { name: 'View source for BaseType' }),
    ).not.toBeInTheDocument();
  });

  it('inspects source-oriented records without fabricating a carousel action', async () => {
    const rendered = renderPanel('comment', [
      result({
        nodeId: 'comment-1',
        nodeKind: 'dtdComment',
        nodeCategory: 'other',
        nodeName: 'Comment before book',
      }),
    ]);

    const action = screen.getByRole('button', {
      name: 'Inspect Comment before book, DTD comment',
    });
    expect(action).toHaveAttribute('data-inspect-search-result');
    expect(action).not.toHaveAttribute('data-center-search-result');
    expect(screen.getAllByRole('button')).toHaveLength(2);

    await fireEvent.click(action);
    expect(rendered.onInspectResult).toHaveBeenCalledOnce();
    expect(rendered.onCenterResult).not.toHaveBeenCalled();
  });

  it('emits the exact frozen result through each explicit callback', async () => {
    const rendered = renderPanel('Base', [result()]);
    if (rendered.presentation.status !== 'results') {
      throw new Error('Expected a result presentation.');
    }
    const expected = rendered.presentation.groups[0]!.results[0]!;

    await fireEvent.click(
      screen.getByRole('button', {
        name: 'Center BaseType, Complex type declaration',
      }),
    );
    await fireEvent.click(
      screen.getByRole('button', {
        name: 'Inspect BaseType, Complex type declaration',
      }),
    );

    expect(rendered.onCenterResult).toHaveBeenCalledOnce();
    expect(rendered.onCenterResult).toHaveBeenCalledWith(expected);
    expect(rendered.onInspectResult).toHaveBeenCalledOnce();
    expect(rendered.onInspectResult).toHaveBeenCalledWith(expected);
    expect(Object.isFrozen(expected)).toBe(true);
  });

  it('exposes distinct current-focus and inspected states that can coexist', () => {
    renderPanel('Base', [result()], {
      currentFocusNodeId: 'type-1',
      inspectedNodeId: 'type-1',
    });
    const article = screen.getByRole('article');
    const center = screen.getByRole('button', {
      name: 'Center BaseType, Complex type declaration',
    });

    expect(center).toHaveAttribute('aria-current', 'true');
    expect(article).toHaveAttribute('data-current-focus', 'true');
    expect(article).toHaveAttribute('data-inspected', 'true');
    expect(article).toHaveClass('current-focus', 'inspected');
    expect(
      screen.getByRole('button', {
        name: 'Inspect BaseType, Complex type declaration, currently inspected',
      }),
    ).toHaveTextContent('Inspect');
    expect(screen.queryByText('Current Focus')).not.toBeInTheDocument();
    expect(screen.queryByText('Inspected')).not.toBeInTheDocument();
  });

  it('shows action failures visibly in a separate polite status', () => {
    renderPanel('Base', [result()], {
      actionError:
        'That search result is no longer available in the current schema.',
    });

    const error = screen.getByText(
      'That search result is no longer available in the current schema.',
    );
    expect(error).toBeVisible();
    expect(error).toHaveAttribute('role', 'status');
    expect(error).toHaveAttribute('aria-live', 'polite');
  });

  it('renders malicious-looking names, contexts, and queries literally', () => {
    const malicious = '<script>alert(1)</script><img src=x onerror=alert(1)>';
    const { container } = renderPanel('script img', [
      result({
        nodeName: malicious,
        score: projectSearchScoreTiers.documentation,
        matches: [
          {
            fieldId: 'documentation',
            fieldKind: 'documentation',
            text: malicious,
          },
        ],
      }),
    ]);

    expect(screen.getAllByText(/script/).length).toBeGreaterThan(0);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('shows live singular/plural status without moving focus', () => {
    renderPanel('Base', [result()]);
    const close = screen.getByRole('button', { name: 'Close search' });
    close.focus();

    expect(screen.getByRole('status')).toHaveTextContent(
      '1 result for “Base”.',
    );
    expect(close).toHaveFocus();
  });

  it('limits rendering to 100 rows and shows the truncation notice', () => {
    const results = Array.from(
      { length: SEARCH_UI_RESULT_LIMIT + 1 },
      (_, index) =>
        result({
          nodeId: `type-${index}`,
          nodeName: `BaseType ${index}`,
        }),
    );
    renderPanel('Base', results);

    expect(screen.getAllByRole('article')).toHaveLength(100);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Showing the first 100 results for “Base”. Refine your search.',
    );
    expect(screen.getByText(SEARCH_TRUNCATION_NOTICE)).toBeVisible();
  });

  it('dispatches only the explicit Close search control', async () => {
    const { onClose } = renderPanel('Base', [result()]);

    await fireEvent.click(screen.getByRole('button', { name: 'Close search' }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps 44px action targets and compact stacking in component styles', () => {
    expect(searchResultsPanelSource).toContain(
      'min-height: var(--control-min-size)',
    );
    expect(searchResultsPanelSource).toContain(
      'grid-template-columns: minmax(0, 1fr)',
    );
    expect(searchResultsPanelSource).toContain('.current-focus .center-result');
    expect(searchResultsPanelSource).toContain('.search-result.inspected');
    expect(searchResultsPanelSource).toContain('.center-result:hover');
    expect(searchResultsPanelSource).toContain('.center-result:active');
    expect(searchResultsPanelSource).toContain('.center-result:focus-visible');
    expect(searchResultsPanelSource).toContain('@media (max-width: 479px)');
    expect(searchResultsPanelSource).not.toContain('role="listbox"');
    expect(searchResultsPanelSource).not.toContain('role="option"');
    expect(searchResultsPanelSource).not.toContain('@html');
  });
});
