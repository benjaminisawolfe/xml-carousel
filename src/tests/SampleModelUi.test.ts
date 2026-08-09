import { render, screen, waitFor, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import App from '../app/App.svelte';
import leftPanelSource from '../ui/layout/LeftPanel.svelte?raw';

describe('read-only sample-model presentation', () => {
  it('renders focused book facts from the hardcoded project', () => {
    render(App);

    const carousel = screen.getByRole('main', { name: 'Schema carousel' });
    expect(
      within(carousel).getByRole('heading', { name: 'book' }),
    ).toBeVisible();
    expect(within(carousel).getByLabelText('Content model')).toHaveTextContent(
      '(front.matter, book.content, index)',
    );
    expect(within(carousel).queryByText('3 children')).not.toBeInTheDocument();
    expect(
      within(carousel).queryByText('4 attributes'),
    ).not.toBeInTheDocument();
  });

  it('renders ordered leafward context and no initial rootward cards', () => {
    render(App);

    const carousel = screen.getByRole('main', { name: 'Schema carousel' });
    const leafward = within(carousel).getByRole('region', {
      name: 'Leafward destinations',
    });
    const rootward = within(carousel).getByRole('region', {
      name: 'Rootward journey',
    });
    const focus = within(carousel).getByRole('article', { name: 'book' });

    expect(
      rootward.compareDocumentPosition(focus) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(
      focus.compareDocumentPosition(leafward) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);

    expect(
      within(leafward)
        .getAllByRole('article')
        .map((article) => article.getAttribute('aria-label')),
    ).toEqual([
      'Destination front.matter',
      'Destination book.content',
      'Destination index',
    ]);
    expect(within(rootward).queryAllByRole('article')).toEqual([]);
    expect(
      within(carousel).getByText('rootward / previous step').closest('p'),
    ).toHaveTextContent(
      'rootward / previous step ← current focus → leafward / children',
    );
    expect(
      within(carousel)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toHaveLength(11);
    expect(within(carousel).queryByRole('link')).not.toBeInTheDocument();
  });

  it('keeps the inspector placeholder separate from carousel focus', () => {
    render(App);

    const inspector = screen.getByRole('complementary', {
      name: 'Schema inspector',
    });
    expect(
      within(inspector).getByRole('heading', { name: 'Nothing inspected' }),
    ).toBeVisible();
    expect(
      within(inspector).queryByRole('button', { name: /inspect/i }),
    ).not.toBeInTheDocument();
  });

  it('makes sample navigation listings centre nodes without inspecting', async () => {
    render(App);

    const navigation = screen.getByRole('navigation', {
      name: 'Schema navigation',
    });
    const dtdElements = within(navigation).getByRole('region', {
      name: 'DTD elements',
    });
    for (const elementName of [
      'book',
      'front.matter',
      'book.content',
      'index',
      'title.page',
      'preface',
      'chapter',
      'title',
      'subtitle',
      'author',
      'epigraph',
      'section',
      'figure',
      'note',
      'para',
      'index.entry',
    ]) {
      expect(
        within(dtdElements).getByText(elementName, { exact: true }),
      ).toBeVisible();
    }
    expect(
      within(dtdElements).getAllByText('title', { exact: true }),
    ).toHaveLength(1);
    const chapter = within(dtdElements).getByRole('button', {
      name: 'Center chapter, DTD element declaration',
    });
    expect(
      within(dtdElements).queryByRole('button', {
        name: 'Center book, DTD element declaration',
      }),
    ).not.toBeInTheDocument();
    await chapter.click();
    expect(
      screen.getByRole('heading', { level: 2, name: 'chapter' }),
    ).toBeVisible();
    const currentChapter = within(dtdElements).getByText('chapter', {
      exact: true,
    });
    expect(currentChapter).toHaveAttribute('aria-current', 'true');
    expect(currentChapter).toHaveAttribute('tabindex', '-1');
    await waitFor(() => expect(currentChapter).toHaveFocus());
    expect(
      screen.getByRole('complementary', { name: 'Schema inspector' }),
    ).toHaveTextContent('Nothing inspected');

    const rootElements = within(navigation)
      .getByRole('heading', { name: 'Root elements' })
      .closest('section');
    expect(rootElements).not.toBeNull();
    await within(rootElements!)
      .getByRole('button', {
        name: 'Center book, DTD element declaration',
      })
      .click();
    expect(
      screen.getByRole('heading', { level: 2, name: 'book' }),
    ).toBeVisible();
    expect(
      within(rootElements!).queryByRole('button', {
        name: 'Center book, DTD element declaration',
      }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(rootElements!).getByText('book', { exact: true }),
      ).toHaveFocus(),
    );
    expect(within(navigation).queryByRole('link')).not.toBeInTheDocument();
  });

  it('keeps standalone Navigation row targets at the shared minimum size', () => {
    expect(leftPanelSource).toContain('min-width: var(--control-min-size)');
    expect(leftPanelSource).toContain('min-height: var(--control-min-size)');
  });
});
