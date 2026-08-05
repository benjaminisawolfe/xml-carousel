import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/svelte';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../app/App.svelte';
import { inspectorStore } from '../app/stores/inspectorStore';
import { isValidStructuralJourney } from '../app/stores/navigationCentering';
import { navigationStore } from '../app/stores/navigationStore';
import { replaceProjectSession } from '../app/stores/projectSession';
import { activeProjectStore } from '../app/stores/projectStore';
import { importDtdSource } from '../schema/dtd';
import {
  bookDtdNodeIds,
  bookDtdProject,
} from '../schema/samples/bookDtdProject';
import { importXsdSource } from '../schema/xsd';
import annotationsSource from '../../tests/fixtures/xsd/annotations.xsd?raw';
import commentsSource from '../../tests/fixtures/dtd/comments.dtd?raw';

function restoreSample(): void {
  const result = replaceProjectSession({
    project: bookDtdProject,
    initialFocusNodeId: bookDtdNodeIds.book,
    metadata: { origin: 'sample', sourceFilename: 'book.dtd' },
  });
  if (!result.applied) throw new Error('Expected sample restoration to apply.');
}

function applyAnnotationsProject(projectId = 'ui-search:annotations'): void {
  const imported = importXsdSource(annotationsSource, {
    projectId,
    displayName: 'Annotation search fixture',
    sourceFileId: `${projectId}:source`,
    sourceFilename: 'annotations.xsd',
  });
  if (imported.status !== 'success') {
    throw new Error('Expected annotations.xsd to import successfully.');
  }
  const result = replaceProjectSession({
    project: imported.project,
    initialFocusNodeId: imported.initialFocusNodeId,
    metadata: {
      origin: 'imported',
      sourceFilename: 'annotations.xsd',
      xsdMetadataByNodeId: imported.xsdMetadataByNodeId,
      sourceMarkupByNodeId: imported.sourceMarkupByNodeId,
    },
  });
  if (!result.applied) throw new Error('Expected XSD replacement to apply.');
}

function applyCommentsProject(projectId = 'ui-search:comments'): void {
  const imported = importDtdSource(commentsSource, {
    projectId,
    displayName: 'DTD comment search fixture',
    sourceFileId: `${projectId}:source`,
    sourceFilename: 'comments.dtd',
  });
  if (imported.status !== 'success') {
    throw new Error('Expected comments.dtd to import successfully.');
  }
  const result = replaceProjectSession({
    project: imported.project,
    initialFocusNodeId: imported.initialFocusNodeId,
    metadata: {
      origin: 'imported',
      sourceFilename: 'comments.dtd',
      contentKindsByNodeId: imported.contentKindsByNodeId,
      dtdAttributesByNodeId: imported.dtdAttributesByNodeId,
      comments: imported.comments,
      commentsByNodeId: imported.commentsByNodeId,
      schemaLevelComments: imported.schemaLevelComments,
      sourceMarkupByNodeId: imported.sourceMarkupByNodeId,
    },
  });
  if (!result.applied) throw new Error('Expected DTD replacement to apply.');
}

function searchbox(): HTMLInputElement {
  return screen.getByRole('searchbox', {
    name: 'Search schema',
  }) as HTMLInputElement;
}

async function searchFor(query: string): Promise<void> {
  await fireEvent.input(searchbox(), { target: { value: query } });
}

function resultHeading(name: string): HTMLElement {
  return screen.getByRole('heading', { level: 4, name });
}

function resultArticle(name: string): HTMLElement {
  const article = resultHeading(name).closest('article');
  if (!article) throw new Error(`Expected result article for ${name}.`);
  return article;
}

function projectNodeId(name: string): string {
  const node = get(activeProjectStore).project.nodes.find(
    (candidate) => candidate.name === name,
  );
  if (!node) throw new Error(`Expected project node ${name}.`);
  return node.id;
}

function carouselStatus(): HTMLElement {
  const status = screen
    .getByRole('main', { name: 'Schema carousel' })
    .querySelector<HTMLElement>('[role="status"]');
  if (!status) throw new Error('Expected carousel live status.');
  return status;
}

beforeEach(restoreSample);
afterEach(restoreSample);

describe('rendered project search interface integration', () => {
  it('preserves annotated XSD names, prose, references, and source groups with two actions', async () => {
    applyAnnotationsProject();
    render(App);
    const before = {
      navigation: JSON.stringify(get(navigationStore)),
      inspector: JSON.stringify(get(inspectorStore)),
    };

    await searchFor('root');
    expect(screen.getByRole('heading', { name: /^Elements \(/ })).toBeVisible();
    expect(
      within(resultArticle('root')).getByText('Global element declaration'),
    ).toBeVisible();
    expect(
      within(resultArticle('root')).getByText('annotations.xsd'),
    ).toBeVisible();

    await searchFor('BaseType');
    expect(screen.getByRole('heading', { name: /^Types \(/ })).toBeVisible();
    expect(resultHeading('BaseType')).toBeVisible();

    await searchFor('ExtendedType');
    expect(resultHeading('ExtendedType')).toBeVisible();

    await searchFor('Extension documentation');
    expect(
      screen.getByRole('heading', {
        name: /^Documentation and comments \(/,
      }),
    ).toBeVisible();
    const extension = resultArticle('Extension of ExtendedType');
    expect(
      within(extension).getByText(/^Documentation(?: · \w+)?:$/),
    ).toBeVisible();
    expect(extension.querySelector('mark')).not.toBeNull();

    await searchFor('restriction documentation');
    expect(
      screen.getByRole('heading', {
        name: /^Documentation and comments \(/,
      }),
    ).toBeVisible();
    expect(screen.getAllByText('Restriction').length).toBeGreaterThan(0);

    await searchFor('extensionCode');
    expect(
      screen.getByRole('heading', { name: /^Attributes \(/ }),
    ).toBeVisible();
    expect(resultHeading('extensionCode')).toBeVisible();

    await searchFor('xs:string');
    expect(screen.getAllByText('Reference:').length).toBeGreaterThan(0);

    await searchFor('annotations.xsd');
    expect(
      screen.getByRole('heading', { name: /^Source files \(/ }),
    ).toBeVisible();
    expect(screen.getAllByText('Source file:').length).toBeGreaterThan(0);

    await searchFor('extension attribute metadata');
    expect(
      resultHeading('Appinfo: extension attribute metadata'),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: /^Schema and structures \(/ }),
    ).toBeVisible();
    await searchFor('importance="high"');
    expect(resultHeading('m:em')).toBeVisible();

    for (const article of within(
      screen.getByRole('search', { name: 'Schema search' }),
    ).queryAllByRole('article')) {
      expect(within(article).getAllByRole('button').length).toBeGreaterThan(0);
      expect(within(article).queryByRole('link')).not.toBeInTheDocument();
    }
    expect(JSON.stringify(get(navigationStore))).toBe(before.navigation);
    expect(JSON.stringify(get(inspectorStore))).toBe(before.inspector);
  });

  it('presents DTD elements, attributes, attached comments, and source without markup', async () => {
    applyCommentsProject();
    render(App);
    const before = {
      navigation: JSON.stringify(get(navigationStore)),
      inspector: JSON.stringify(get(inspectorStore)),
    };

    await searchFor('book');
    expect(
      screen.getByRole('heading', { name: /^DTD declarations \(/ }),
    ).toBeVisible();
    expect(resultHeading('book')).toBeVisible();

    await searchFor('id');
    expect(
      screen.getByRole('heading', { name: /^Attributes \(/ }),
    ).toBeVisible();
    expect(resultHeading('id')).toBeVisible();

    await searchFor('root element');
    expect(
      screen.getByRole('heading', {
        name: /^Documentation and comments \(/,
      }),
    ).toBeVisible();
    expect(
      within(resultArticle('book')).getByText('DTD comment:'),
    ).toBeVisible();

    await searchFor('comments.dtd');
    expect(
      screen.getByRole('heading', { name: /^Source files \(/ }),
    ).toBeVisible();

    await searchFor('Project-level note');
    expect(
      screen.getByRole('heading', {
        name: 'No nodes matched “Project-level note”.',
      }),
    ).toBeVisible();
    await searchFor('#PCDATA');
    expect(
      screen.getByRole('heading', {
        name: 'No nodes matched “#PCDATA”.',
      }),
    ).toBeVisible();
    await searchFor('<!ELEMENT');
    expect(
      screen.getByRole('heading', {
        name: 'No nodes matched “<!ELEMENT”.',
      }),
    ).toBeVisible();

    expect(JSON.stringify(get(navigationStore))).toBe(before.navigation);
    expect(JSON.stringify(get(inspectorStore))).toBe(before.inspector);
  });

  it('searches startup sample names without imported comment or source markup', async () => {
    render(App);

    await searchFor('chapter');

    expect(resultHeading('chapter')).toBeVisible();
    expect(
      within(resultArticle('chapter')).getByText('DTD element declaration'),
    ).toBeVisible();
    expect(screen.queryByText('DTD comment:')).not.toBeInTheDocument();
    expect(screen.queryByText('<!ELEMENT')).not.toBeInTheDocument();
  });

  it('centres representative XSD results through valid search-origin journeys', async () => {
    applyAnnotationsProject();
    render(App);
    const project = get(activeProjectStore).project;
    const inspectorSentinel = projectNodeId('root');
    expect(inspectorStore.inspect(inspectorSentinel).applied).toBe(true);
    const cases = [
      ['BaseType', 'BaseType', 'Complex type declaration'],
      ['root', 'root', 'Global element declaration'],
      ['ExtendedType', 'ExtendedType', 'Complex type declaration'],
      ['Extension', 'Extension of ExtendedType', 'Extension derivation'],
      [
        'restriction',
        'Restriction of RestrictedType',
        'Restriction derivation',
      ],
      ['extensionCode', 'extensionCode', 'Attribute declaration'],
    ] as const;

    for (const [query, name, kind] of cases) {
      await searchFor(query);
      await fireEvent.click(
        within(resultArticle(name)).getByRole('button', {
          name: `Center ${name}, ${kind}`,
        }),
      );
      const nodeId = projectNodeId(name);

      await waitFor(() =>
        expect(get(navigationStore.currentFocusNodeId)).toBe(nodeId),
      );
      expect(searchbox()).toHaveValue(query);
      expect(
        screen.queryByRole('heading', { name: 'Search results' }),
      ).not.toBeInTheDocument();
      expect(get(inspectorStore.inspectedNodeId)).toBe(inspectorSentinel);
      expect(
        isValidStructuralJourney(project, get(navigationStore).navigationPath),
      ).toBe(true);
      const focusedHeading = document.querySelector<HTMLElement>(
        '[data-focus-card-heading]',
      );
      expect(focusedHeading).toHaveTextContent(name);
      await waitFor(() => expect(focusedHeading).toHaveFocus());
      await waitFor(() =>
        expect(carouselStatus()).toHaveTextContent(
          `Focused: ${name}, ${kind}.`,
        ),
      );
      expect(screen.getAllByRole('status')).toHaveLength(1);

      await fireEvent.focus(searchbox());
      const result = resultArticle(name);
      expect(
        within(result).getByRole('button', {
          name: `Center ${name}, ${kind}`,
        }),
      ).toHaveAttribute('aria-current', 'true');
      expect(result).toHaveAttribute('data-current-focus', 'true');
    }
  });

  it('inspects representative XSD results without changing carousel state or announcement', async () => {
    applyAnnotationsProject();
    render(App);
    const cases = [
      ['root', 'root', 'Global element declaration'],
      ['BaseType', 'BaseType', 'Complex type declaration'],
      ['extensionCode', 'extensionCode', 'Attribute declaration'],
      [
        'restriction',
        'Restriction of RestrictedType',
        'Restriction derivation',
      ],
    ] as const;

    for (const [query, name, kind] of cases) {
      const navigationBefore = get(navigationStore);
      const announcementBefore = carouselStatus().textContent;
      await searchFor(query);
      await fireEvent.click(
        within(resultArticle(name)).getByRole('button', {
          name: `Inspect ${name}, ${kind}`,
        }),
      );

      await waitFor(() =>
        expect(get(inspectorStore.inspectedNodeId)).toBe(projectNodeId(name)),
      );
      expect(get(navigationStore)).toBe(navigationBefore);
      expect(carouselStatus()).toHaveTextContent(announcementBefore ?? '');
      expect(searchbox()).toHaveValue(query);
      expect(
        screen.queryByRole('heading', { name: 'Search results' }),
      ).not.toBeInTheDocument();
      await waitFor(() =>
        expect(
          screen.getByRole('button', {
            name: `Close inspector for ${name}`,
          }),
        ).toHaveFocus(),
      );

      await fireEvent.focus(searchbox());
      const article = resultArticle(name);
      expect(article).toHaveAttribute('data-inspected', 'true');
      expect(
        within(article).getByRole('button', {
          name: `Inspect ${name}, ${kind}, currently inspected`,
        }),
      ).toHaveTextContent('Inspect');
    }
  });

  it('centres and inspects DTD declarations, attributes, and comment owners independently', async () => {
    applyCommentsProject();
    render(App);
    const inspectorSentinel = projectNodeId('book');
    expect(inspectorStore.inspect(inspectorSentinel).applied).toBe(true);
    const centerCases = [
      ['book', 'book', 'DTD element declaration'],
      ['chapter', 'chapter', 'DTD element declaration'],
      ['id', 'id', 'DTD attribute declaration'],
    ] as const;

    for (const [query, name, kind] of centerCases) {
      await searchFor(query);
      await fireEvent.click(
        within(resultArticle(name)).getByRole('button', {
          name: `Center ${name}, ${kind}`,
        }),
      );
      await waitFor(() =>
        expect(get(navigationStore.currentFocusNodeId)).toBe(
          projectNodeId(name),
        ),
      );
      expect(get(inspectorStore.inspectedNodeId)).toBe(inspectorSentinel);
      expect(searchbox()).toHaveValue(query);
    }

    const navigationBefore = get(navigationStore);
    await searchFor('Identifier metadata');
    await fireEvent.click(
      within(resultArticle('chapter')).getByRole('button', {
        name: 'Inspect chapter, DTD element declaration',
      }),
    );
    await waitFor(() =>
      expect(get(inspectorStore.inspectedNodeId)).toBe(
        projectNodeId('chapter'),
      ),
    );
    expect(get(navigationStore)).toBe(navigationBefore);
    expect(searchbox()).toHaveValue('Identifier metadata');
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: 'Close inspector for chapter',
        }),
      ).toHaveFocus(),
    );
  });

  it('supports startup-sample Centre and Inspect actions without source markup', async () => {
    render(App);
    await searchFor('chapter');
    await fireEvent.click(
      within(resultArticle('chapter')).getByRole('button', {
        name: 'Center chapter, DTD element declaration',
      }),
    );
    await waitFor(() =>
      expect(get(navigationStore.currentFocusNodeId)).toBe(
        bookDtdNodeIds.chapter,
      ),
    );
    expect(document.querySelector('[data-focus-card-heading]')).toHaveFocus();

    await searchFor('book');
    const navigationBefore = get(navigationStore);
    await fireEvent.click(
      within(resultArticle('book')).getByRole('button', {
        name: 'Inspect book, DTD element declaration',
      }),
    );
    await waitFor(() =>
      expect(get(inspectorStore.inspectedNodeId)).toBe(bookDtdNodeIds.book),
    );
    expect(get(navigationStore)).toBe(navigationBefore);
    expect(screen.queryByText('View source markup')).not.toBeInTheDocument();
  });

  it('clears and closes across XSD/DTD project replacement while failed replacement preserves search', async () => {
    applyAnnotationsProject('ui-search:project-a');
    render(App);
    await searchFor('BaseType');
    expect(resultHeading('BaseType')).toBeVisible();

    applyAnnotationsProject('ui-search:project-b');
    await waitFor(() => expect(searchbox()).toHaveValue(''));
    expect(
      screen.queryByRole('heading', { name: 'Search results' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { level: 4, name: 'BaseType' }),
    ).not.toBeInTheDocument();

    await fireEvent.focus(searchbox());
    await searchFor('ExtendedType');
    expect(resultHeading('ExtendedType')).toBeVisible();

    applyCommentsProject();
    await waitFor(() => expect(searchbox()).toHaveValue(''));
    expect(
      screen.queryByRole('heading', { name: 'Search results' }),
    ).not.toBeInTheDocument();

    await fireEvent.focus(searchbox());
    await searchFor('book');
    expect(resultHeading('book')).toBeVisible();
    const failed = replaceProjectSession({
      project: {
        id: 'invalid',
        displayName: 'Invalid',
        nodes: [],
        edges: [],
        rootNodeIds: ['missing'],
      },
      initialFocusNodeId: 'missing',
      metadata: { origin: 'imported', sourceFilename: 'invalid.xsd' },
    });
    expect(failed.applied).toBe(false);
    expect(searchbox()).toHaveValue('book');
    expect(resultHeading('book')).toBeVisible();
  });
});
