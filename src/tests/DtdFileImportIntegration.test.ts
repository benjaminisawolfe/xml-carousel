import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/svelte';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../app/App.svelte';
import { inspectorStore } from '../app/stores/inspectorStore';
import { navigationStore } from '../app/stores/navigationStore';
import { replaceProjectSession } from '../app/stores/projectSession';
import { projectSessionResetStore } from '../app/stores/projectSessionResetStore';
import { activeProjectStore } from '../app/stores/projectStore';
import {
  bookDtdNodeIds,
  bookDtdProject,
} from '../schema/samples/bookDtdProject';
import controllerSource from '../app/import/dtdFileImportController.ts?raw';
import schemaControllerSource from '../app/import/schemaFileImportController.ts?raw';
import workerRuntimeSource from '../workers/schemaImportWorkerRuntime.ts?raw';
import errorAlertSource from '../ui/layout/ImportErrorAlert.svelte?raw';
import warningNoticeSource from '../ui/layout/ImportWarningNotice.svelte?raw';
import librarySource from '../../tests/fixtures/dtd/library.dtd?raw';
import cycleSource from '../../tests/fixtures/dtd/cycle.dtd?raw';
import selfRecursionSource from '../../tests/fixtures/dtd/self-recursion.dtd?raw';
import multipleRootsSource from '../../tests/fixtures/dtd/multiple-roots.dtd?raw';
import brokenSource from '../../tests/fixtures/dtd/broken.dtd?raw';
import unresolvedSource from '../../tests/fixtures/dtd/unresolved.dtd?raw';
import attributesSource from '../../tests/fixtures/dtd/attributes.dtd?raw';
import attlistUndeclaredElementSource from '../../tests/fixtures/dtd/attlist-undeclared-element.dtd?raw';
import duplicateAttributeSource from '../../tests/fixtures/dtd/duplicate-attribute.dtd?raw';
import invalidIdDefaultSource from '../../tests/fixtures/dtd/invalid-id-default.dtd?raw';
import invalidEnumerationDefaultSource from '../../tests/fixtures/dtd/invalid-enumeration-default.dtd?raw';
import commentsSource from '../../tests/fixtures/dtd/comments.dtd?raw';
import commentTextSafetySource from '../../tests/fixtures/dtd/comment-text-safety.dtd?raw';
import unterminatedCommentSource from '../../tests/fixtures/dtd/unterminated-comment.dtd?raw';
import sdocbookSource from '../../tests/fixtures/dtd/sdocbook/sdocbook.dtd?raw';

function restoreSample(): void {
  const result = replaceProjectSession({
    project: bookDtdProject,
    initialFocusNodeId: bookDtdNodeIds.book,
    metadata: { origin: 'sample', sourceFilename: 'book.dtd' },
  });
  if (!result.applied) throw new Error('Expected sample restoration to apply.');
}

function dtdFile(
  name: string,
  sourceText: string,
  read: () => Promise<string> = () => Promise.resolve(sourceText),
): File {
  const file = new File([sourceText], name, {
    type: 'application/xml-dtd',
  });
  Object.defineProperty(file, 'text', {
    configurable: true,
    value: read,
  });
  return file;
}

function inputFor(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(
    '#dtd-file-input[type="file"]',
  );
  if (!input) throw new Error('Expected the DTD file input.');
  return input;
}

async function selectFile(container: HTMLElement, file: File): Promise<void> {
  await fireEvent.change(inputFor(container), {
    target: { files: [file] },
  });
}

async function waitUntilImportSettles(): Promise<HTMLButtonElement> {
  const button = await screen.findByRole('button', { name: 'Open DTD' });
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error('Expected Open DTD to be a native button.');
  }
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolvePromise!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

beforeEach(restoreSample);
afterEach(() => {
  restoreSample();
  vi.restoreAllMocks();
});

describe('rendered local DTD import success flow', () => {
  it('renders the complete sdocbook inventory and resolved revision references', async () => {
    const { container } = render(App);

    await selectFile(container, dtdFile('sdocbook.dtd', sdocbookSource));
    await waitUntilImportSettles();

    expect(
      get(activeProjectStore).project.nodes.filter(
        ({ kind }) => kind === 'dtdElement',
      ),
    ).toHaveLength(106);
    const navigation = screen.getByRole('navigation', {
      name: 'Schema navigation',
    });
    const elements = within(navigation).getByRole('region', {
      name: 'DTD elements',
    });
    expect(
      within(elements).getByText('Showing 1–100 of 106 DTD elements.'),
    ).toBeVisible();
    const filter = within(elements).getByRole('searchbox', {
      name: 'Filter DTD elements',
    });
    await fireEvent.input(filter, { target: { value: 'revision' } });
    expect(
      within(elements).getByText('Showing 1–1 of 1 matching DTD elements.'),
    ).toBeVisible();
    await fireEvent.click(
      within(elements).getByRole('button', {
        name: 'Center revision, DTD element declaration',
      }),
    );

    const revisionCard = screen.getByRole('article', { name: 'revision' });
    for (const name of [
      'revnumber',
      'date',
      'authorinitials',
      'revremark',
      'revdescription',
    ]) {
      const card = screen.getByRole('article', {
        name: new RegExp(`Content-model reference ${name}`),
      });
      expect(
        within(card).getByText('DTD element-name reference'),
      ).toBeVisible();
      expect(within(card).queryByText(/undeclared/i)).not.toBeInTheDocument();
    }
    expect(
      screen.getByRole('article', {
        name: /Content-model reference authorinitials\*/,
      }),
    ).toBeVisible();

    const authorInitialsCard = screen.getByRole('article', {
      name: /Content-model reference authorinitials\*/,
    });
    await fireEvent.click(
      within(authorInitialsCard).getByRole('button', {
        name: 'Inspect authorinitials',
      }),
    );
    const inspector = screen.getByRole('complementary', {
      name: 'Schema inspector',
    });
    expect(
      within(inspector).getByText('Declared element reference'),
    ).toBeVisible();
    expect(within(inspector).getByText('Zero or more (*)')).toBeVisible();
    expect(
      within(inspector).getByRole('button', {
        name: 'Follow Referenced element declaration to authorinitials, DTD element declaration',
      }),
    ).toBeVisible();
    expect(revisionCard).toBeVisible();
  }, 15_000);

  it('loads an ATTLIST-only DTD with two advisory warnings and no fake element', async () => {
    const { container } = render(App);

    await selectFile(
      container,
      dtdFile('attlist-undeclared-element.dtd', attlistUndeclaredElementSource),
    );
    await waitUntilImportSettles();

    const warning = container.querySelector('[data-schema-import-warning]');
    expect(warning).not.toBeNull();
    expect(warning).toHaveTextContent('DTD loaded with 2 warnings');
    expect(warning).toHaveTextContent('no matching ELEMENT declaration');
    expect(warning).toHaveTextContent('1 more warning');
    expect(warning).not.toHaveAttribute('role', 'alert');
    expect(screen.queryByRole('alert')).toBeNull();

    const state = get(activeProjectStore);
    expect(state.project.nodes.some(({ kind }) => kind === 'dtdElement')).toBe(
      false,
    );
    expect(state.project.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'dtd:attribute-list:book',
          kind: 'dtdAttributeList',
        }),
      ]),
    );
    expect(state.project.rootNodeIds).toHaveLength(state.project.nodes.length);
    expect(new Set(state.project.rootNodeIds)).toEqual(
      new Set(state.project.nodes.map(({ id }) => id)),
    );

    const navigation = screen.getByRole('navigation', {
      name: 'Schema navigation',
    });
    expect(within(navigation).getByText('DTD attribute lists')).toBeVisible();
    const card = screen.getByRole('article', { name: 'ATTLIST book' });
    expect(
      within(card).getByText('DTD attribute-list declaration'),
    ).toBeVisible();
    expect(within(card).getByText('No ELEMENT declaration')).toBeVisible();

    await fireEvent.click(
      within(card).getByRole('button', { name: 'Inspect ATTLIST book' }),
    );
    const inspector = screen.getByRole('complementary', {
      name: 'Schema inspector',
    });
    expect(
      within(inspector).getByText('Undeclared element name'),
    ).toBeVisible();
    await fireEvent.click(within(inspector).getByText('View source markup'));
    expect(inspector).toHaveTextContent('<!ATTLIST book id ID #IMPLIED>');
    const projectBeforeDismiss = get(activeProjectStore);
    const navigationBeforeDismiss = get(navigationStore);
    const inspectorBeforeDismiss = get(inspectorStore);
    await fireEvent.click(
      screen.getByRole('button', {
        name: 'Dismiss DTD warnings for attlist-undeclared-element.dtd',
      }),
    );
    expect(container.querySelector('[data-schema-import-warning]')).toBeNull();
    expect(get(activeProjectStore)).toBe(projectBeforeDismiss);
    expect(get(navigationStore)).toBe(navigationBeforeDismiss);
    expect(get(inspectorStore)).toBe(inspectorBeforeDismiss);
  });

  it('loads duplicate attributes with the first declaration effective and source intact', async () => {
    const { container } = render(App);

    await selectFile(
      container,
      dtdFile('duplicate-attribute.dtd', duplicateAttributeSource),
    );
    await waitUntilImportSettles();

    const warning = container.querySelector('[data-schema-import-warning]');
    expect(warning).toHaveTextContent('DTD loaded with 1 warning');
    expect(warning).toHaveTextContent('first declaration is effective');
    expect(warning).not.toHaveTextContent('more warning');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(
      get(activeProjectStore).dtdAttributesByNodeId?.['dtd:attribute:book:id']
        ?.type,
    ).toEqual({ kind: 'tokenized', name: 'ID' });

    const card = screen.getByRole('article', { name: 'book' });
    await fireEvent.click(
      within(card).getByRole('button', { name: 'Inspect book' }),
    );
    const inspector = screen.getByRole('complementary', {
      name: 'Schema inspector',
    });
    expect(within(inspector).getByText('ID · Implied')).toBeVisible();
    await fireEvent.click(within(inspector).getByText('View source markup'));
    expect(inspector).toHaveTextContent('<!ATTLIST book id ID #IMPLIED>');
    expect(inspector).toHaveTextContent('<!ATTLIST book id CDATA #IMPLIED>');
  });

  it('presents attached comments on focused cards and in the inspector only', async () => {
    const { container } = render(App);

    await selectFile(container, dtdFile('comments.dtd', commentsSource));
    await waitUntilImportSettles();

    const catalogCard = screen.getByRole('article', { name: 'book' });
    expect(
      within(catalogCard).getByLabelText('Content model'),
    ).toHaveTextContent('chapter+');
    const catalogComments = within(catalogCard).getByLabelText('2 comments');
    expect(
      within(catalogComments).getByText('The root element for the document.'),
    ).toBeVisible();
    expect(within(catalogComments).getByText('+1 more')).toBeVisible();
    expect(
      within(catalogComments).queryByRole('button'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Project-level note retained at end of file.'),
    ).toBeVisible();

    await fireEvent.click(
      within(catalogCard).getByRole('button', { name: 'Inspect book' }),
    );
    const inspector = screen.getByRole('complementary', {
      name: 'Schema inspector',
    });
    const comments = within(inspector).getByRole('region', {
      name: 'DTD comments',
    });
    const bookMarkupSummary = within(inspector).getByText('View source markup');
    const bookMarkupDisclosure = bookMarkupSummary.closest('details');
    expect(bookMarkupDisclosure).not.toHaveAttribute('open');
    await fireEvent.click(bookMarkupSummary);
    expect(bookMarkupDisclosure).toHaveAttribute('open');
    expect(
      bookMarkupDisclosure?.querySelector('pre > code')?.textContent,
    ).toContain('<!ELEMENT book (chapter+)><!-- Book structure. -->');
    expect(bookMarkupDisclosure?.textContent).not.toContain(
      'Project-level note retained at end of file.',
    );
    expect(within(comments).getAllByRole('listitem')).toHaveLength(2);
    expect(
      within(comments).getByText('The root element for the document.'),
    ).toBeVisible();
    expect(within(comments).getByText('Book structure.')).toBeVisible();
    expect(within(comments).queryByText(/Lines? \d/)).not.toBeInTheDocument();
    expect(
      within(comments).queryByText(/Before|After|Inside|ELEMENT|ATTLIST/),
    ).not.toBeInTheDocument();
    expect(within(comments).queryByRole('button')).not.toBeInTheDocument();

    await fireEvent.click(
      within(inspector).getByRole('button', {
        name: 'Close inspector for book',
      }),
    );
    await fireEvent.click(
      within(catalogCard).getByRole('button', { name: 'Inspect book' }),
    );
    expect(
      within(screen.getByRole('complementary', { name: 'Schema inspector' }))
        .getByText('View source markup')
        .closest('details'),
    ).not.toHaveAttribute('open');

    navigationStore.initializeAt('dtd:element:chapter');
    const itemCard = await screen.findByRole('article', { name: 'chapter' });
    expect(within(itemCard).getByLabelText('3 comments')).toBeVisible();
    expect(within(itemCard).getByText('+2 more')).toBeVisible();

    await fireEvent.click(
      within(itemCard).getByRole('button', { name: 'Inspect chapter' }),
    );
    const chapterInspector = screen.getByRole('complementary', {
      name: 'Schema inspector',
    });
    const chapterComments = within(chapterInspector).getByRole('region', {
      name: 'DTD comments',
    });
    expect(
      within(chapterInspector)
        .getByText('View source markup')
        .closest('details'),
    ).not.toHaveAttribute('open');
    expect(within(chapterComments).getAllByRole('listitem')).toHaveLength(3);
    expect(within(chapterComments).getByText('Chapter prose.')).toBeVisible();
    expect(
      within(chapterComments).getByText('Text content only.'),
    ).toBeVisible();
    expect(
      within(chapterComments).getByText('Identifier metadata.'),
    ).toBeVisible();
    expect(
      within(chapterComments).queryByText(/Lines? \d/),
    ).not.toBeInTheDocument();
    expect(
      within(chapterComments).queryByText(
        /Before|After|Inside|ELEMENT|ATTLIST/,
      ),
    ).not.toBeInTheDocument();
    expect(
      within(
        within(chapterInspector).getByRole('region', { name: 'Attributes' }),
      ).getByText('id'),
    ).toBeVisible();
    expect(
      within(
        within(chapterInspector).getByRole('region', { name: 'Used by' }),
      ).getByRole('button', { name: 'Center chapter' }),
    ).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders markup-like comment content as inert text', async () => {
    const { container } = render(App);

    await selectFile(
      container,
      dtdFile('comment-text-safety.dtd', commentTextSafetySource),
    );
    await waitUntilImportSettles();

    const card = screen.getByRole('article', { name: 'safe' });
    expect(within(card).getByText(/Literal <tag>, A > B/)).toBeVisible();
    expect(document.querySelector('script')).toBeNull();

    await fireEvent.click(
      within(card).getByRole('button', { name: 'Inspect safe' }),
    );
    expect(
      within(screen.getByRole('region', { name: 'DTD comments' })).getByText(
        /Literal <tag>, A > B, &example;, "quotes", and 'apostrophes'\./,
      ),
    ).toBeVisible();
    expect(document.querySelector('img[onerror]')).toBeNull();
  });

  it('imports attributes through every rendered project surface', async () => {
    const { container } = render(App);

    await selectFile(container, dtdFile('attributes.dtd', attributesSource));
    await waitUntilImportSettles();

    expect(
      within(screen.getByRole('banner')).getByText('attributes.dtd'),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 2, name: 'book' }),
    ).toBeVisible();
    const focusedCard = screen.getByRole('article', { name: 'book' });
    expect(within(focusedCard).getByText('3 attributes')).toBeVisible();
    expect(
      within(focusedCard).getByLabelText('Content model'),
    ).toHaveTextContent('#PCDATA');
    expect(within(focusedCard).queryByText('lang')).not.toBeInTheDocument();

    const navigation = screen.getByRole('navigation', {
      name: 'Schema navigation',
    });
    const elements = within(navigation).getByRole('region', {
      name: 'DTD elements',
    });
    expect(within(elements).getAllByRole('listitem')).toHaveLength(1);
    expect(within(elements).getByText('book')).toBeVisible();
    expect(within(elements).queryByText('id')).not.toBeInTheDocument();
    expect(get(navigationStore.leafwardDestinationNodes)).toEqual([]);
    expect(get(navigationStore.rootwardPathNodes)).toEqual([]);
    expect(get(activeProjectStore).project.rootNodeIds).toEqual([
      'dtd:element:book',
    ]);
    expect(
      screen.getByRole('button', {
        name: 'Center id, DTD attribute declaration',
      }),
    ).toBeVisible();

    await fireEvent.click(
      within(focusedCard).getByRole('button', { name: 'Inspect book' }),
    );
    const inspector = screen.getByRole('complementary', {
      name: 'Schema inspector',
    });
    const attributes = within(inspector).getByRole('region', {
      name: 'Attributes',
    });
    expect(within(attributes).getAllByRole('listitem')).toHaveLength(3);
    expect(within(attributes).getByText('id')).toBeVisible();
    expect(within(attributes).getByText('ID · Required')).toBeVisible();
    expect(within(attributes).getByText('lang')).toBeVisible();
    expect(within(attributes).getByText('CDATA · Default "en"')).toBeVisible();
    expect(within(attributes).getByText('status')).toBeVisible();
    expect(
      within(attributes).getByText('(draft | final) · Default "draft"'),
    ).toBeVisible();
    expect(within(attributes).queryByRole('button')).not.toBeInTheDocument();
    expect(
      within(inspector).queryByRole('region', { name: 'Used by' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('replaces every active project surface through the browser-facing flow', async () => {
    navigationStore.initializeAt(bookDtdNodeIds.chapter);
    inspectorStore.inspect(bookDtdNodeIds.section);
    const revisionBefore = get(projectSessionResetStore).revision;
    const { container } = render(App);

    await selectFile(container, dtdFile('library.dtd', librarySource));
    const openButton = await waitUntilImportSettles();

    expect(
      within(screen.getByRole('banner')).getByText('library.dtd'),
    ).toBeVisible();
    const navigation = screen.getByRole('navigation', {
      name: 'Schema navigation',
    });
    expect(
      within(within(navigation).getByRole('region', { name: 'DTD elements' }))
        .getAllByRole('listitem')
        .map((item) =>
          item.textContent?.replace('DTD element declaration', '').trim(),
        ),
    ).toEqual(['library', 'shelf', 'book', 'title', 'author']);
    expect(within(navigation).queryByText('front.matter')).toBeNull();
    expect(within(navigation).queryByText('chapter')).toBeNull();
    expect(
      screen.getByRole('heading', { level: 2, name: 'library' }),
    ).toBeVisible();
    expect(
      screen.getByRole('article', {
        name: 'Content-model reference shelf+',
      }),
    ).toBeVisible();
    expect(get(navigationStore).navigationPath).toEqual([
      'dtd:element:library',
    ]);
    expect(get(inspectorStore).inspectedNodeId).toBeUndefined();
    expect(get(activeProjectStore)).toMatchObject({
      origin: 'imported',
      sourceFilename: 'library.dtd',
      project: { id: 'imported-dtd:library.dtd' },
    });
    expect(get(projectSessionResetStore).revision).toBe(revisionBefore + 1);
    expect(
      document.querySelector('[data-carousel-gesture-viewport]'),
    ).toHaveAttribute('data-presentation-phase', 'resting');
    expect(document.querySelector('[data-gesture-preview="true"]')).toBeNull();
    expect(screen.getAllByRole('status')).toHaveLength(1);
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Focused: library, DTD element declaration. One child.',
      ),
    );
    const focusHeading = screen.getByRole('heading', {
      level: 2,
      name: 'library',
    });
    await waitFor(() => expect(focusHeading).toHaveFocus());
    expect(focusHeading).toHaveAttribute('tabindex', '-1');
    expect(openButton).not.toHaveFocus();
  });

  it('keeps the current project visible and interactive while a read is pending', async () => {
    let resolveRead!: (source: string) => void;
    const pending = new Promise<string>((resolve) => {
      resolveRead = resolve;
    });
    const before = get(activeProjectStore);
    const { container } = render(App);

    await selectFile(
      container,
      dtdFile('library.dtd', librarySource, () => pending),
    );

    expect(screen.getByRole('button', { name: 'Opening DTD' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Opening DTD' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'book' }),
    ).toBeVisible();
    expect(get(activeProjectStore)).toBe(before);

    resolveRead(librarySource);
    await waitUntilImportSettles();
    expect(
      screen.getByRole('heading', { level: 2, name: 'library' }),
    ).toBeVisible();
  });

  it('processes same-file reselection and emits a fresh session reset', async () => {
    const { container } = render(App);
    const file = dtdFile('library.dtd', librarySource);

    await selectFile(container, file);
    await waitUntilImportSettles();
    const firstRevision = get(projectSessionResetStore).revision;
    navigationStore.initializeAt('dtd:element:book');

    await selectFile(container, file);
    await waitFor(() =>
      expect(get(projectSessionResetStore).revision).toBe(firstRevision + 1),
    );

    expect(get(navigationStore).navigationPath).toEqual([
      'dtd:element:library',
    ]);
    expect(inputFor(container).value).toBe('');
  });

  it('loads a mutual cycle and keeps b focused at its terminal closure', async () => {
    const { container } = render(App);
    await selectFile(container, dtdFile('cycle.dtd', cycleSource));
    await waitUntilImportSettles();

    expect(screen.getByRole('heading', { level: 2, name: 'a' })).toBeVisible();
    await fireEvent.click(
      screen.getByRole('button', {
        name: /Navigate leafward through Content-model reference to b, DTD element-name reference/,
      }),
    );
    await waitFor(() =>
      expect(get(navigationStore).navigationPath).toHaveLength(2),
    );
    await fireEvent.click(
      await screen.findByRole('button', {
        name: /Navigate leafward through Referenced element declaration to b, DTD element/,
      }),
    );
    await waitFor(() =>
      expect(get(navigationStore).navigationPath).toHaveLength(3),
    );
    await fireEvent.click(
      await screen.findByRole('button', {
        name: /Navigate leafward through Content-model reference to a, DTD element-name reference/,
      }),
    );
    await waitFor(() =>
      expect(get(navigationStore).navigationPath).toHaveLength(4),
    );
    const recursiveCard = await screen.findByRole('article', {
      name: 'Cycle closure a',
    });
    const terminalBody = within(recursiveCard).getByLabelText(
      'Cycle closure a. Already present earlier in this path',
    );
    expect(terminalBody).toBeVisible();
    expect(
      within(recursiveCard).queryByRole('button', {
        name: /Navigate|Return/,
      }),
    ).not.toBeInTheDocument();
    expect(
      within(recursiveCard).getByRole('button', { name: 'Inspect a' }),
    ).toBeEnabled();
    const status = screen.getByRole('status');
    const priorAnnouncement = status.textContent;
    await fireEvent.click(terminalBody);
    expect(get(navigationStore).navigationPath).toHaveLength(4);
    expect(screen.getByRole('heading', { level: 2, name: 'a' })).toBeVisible();
    expect(status.textContent).toBe(priorAnnouncement);

    const rootward = screen.getByRole('region', { name: 'Rootward journey' });
    await fireEvent.click(
      within(rootward).getByRole('button', {
        name: /Navigate rootward to b/,
      }),
    );
    expect(get(navigationStore).navigationPath).toHaveLength(3);
  });

  it('keeps a self-recursive DTD focused with a noninteractive closure body', async () => {
    const { container } = render(App);
    await selectFile(
      container,
      dtdFile('self-recursion.dtd', selfRecursionSource),
    );
    await waitUntilImportSettles();

    expect(
      screen.getByRole('heading', { level: 2, name: 'section' }),
    ).toBeVisible();
    const reference = screen.getByRole('article', {
      name: 'Content-model reference section*',
    });
    expect(
      within(reference).getByRole('button', {
        name: /Navigate leafward through Content-model reference/,
      }),
    ).toBeEnabled();
    await fireEvent.click(
      within(reference).getByRole('button', {
        name: /Navigate leafward through Content-model reference/,
      }),
    );
    await waitFor(() =>
      expect(get(navigationStore).navigationPath).toHaveLength(2),
    );
    const closure = await screen.findByRole('article', {
      name: 'Cycle closure section',
    });
    expect(
      within(closure).getByText('Already present earlier in this path'),
    ).toBeVisible();
    expect(
      within(closure).queryByRole('button', {
        name: /Navigate|Return/,
      }),
    ).not.toBeInTheDocument();
    expect(
      within(closure).getByRole('button', { name: 'Inspect section' }),
    ).toBeEnabled();
    expect(get(navigationStore).navigationPath).toHaveLength(2);
  });

  it('loads multiple roots at alpha and allows beta selection', async () => {
    const { container } = render(App);
    await selectFile(
      container,
      dtdFile('multiple-roots.dtd', multipleRootsSource),
    );
    await waitUntilImportSettles();

    expect(
      screen.getByRole('heading', { level: 2, name: 'alpha' }),
    ).toBeVisible();
    const roots = within(
      screen.getByRole('navigation', { name: 'Schema navigation' }),
    ).getByRole('heading', { name: 'Root elements' }).parentElement;
    if (!roots) throw new Error('Expected root-elements section.');
    expect(within(roots).getByText('alpha')).toBeVisible();
    await fireEvent.click(
      within(roots).getByRole('button', {
        name: 'Center beta, DTD element declaration',
      }),
    );

    expect(
      screen.getByRole('heading', { level: 2, name: 'beta' }),
    ).toBeVisible();
  });

  it('opening a second valid file replaces the first without mixed nodes', async () => {
    const { container } = render(App);
    await selectFile(container, dtdFile('library.dtd', librarySource));
    await waitUntilImportSettles();
    await fireEvent.click(
      within(screen.getByRole('article', { name: 'library' })).getByRole(
        'button',
        { name: 'Inspect library' },
      ),
    );
    await fireEvent.click(screen.getByText('View source markup'));
    expect(
      screen.getByText('View source markup').closest('details'),
    ).toHaveAttribute('open');

    await selectFile(container, dtdFile('cycle.dtd', cycleSource));
    await waitUntilImportSettles();

    expect(
      within(screen.getByRole('banner')).getByText('cycle.dtd'),
    ).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'a' })).toBeVisible();
    const navigation = screen.getByRole('navigation', {
      name: 'Schema navigation',
    });
    expect(within(navigation).queryByText('library')).toBeNull();
    expect(within(navigation).queryByText('shelf')).toBeNull();
    expect(screen.queryByText('View source markup')).not.toBeInTheDocument();
    await fireEvent.click(
      within(screen.getByRole('article', { name: 'a' })).getByRole('button', {
        name: 'Inspect a',
      }),
    );
    expect(
      screen.getByText('View source markup').closest('details'),
    ).not.toHaveAttribute('open');
    expect(
      JSON.stringify(get(activeProjectStore).sourceMarkupByNodeId),
    ).not.toContain('<!ELEMENT library');
  });
});

describe('rendered local DTD import failure flow', () => {
  it.each([
    ['malformed', 'broken.dtd', brokenSource, 'parse'],
    ['unresolved', 'unresolved.dtd', unresolvedSource, 'build'],
    [
      'invalid ID default',
      'invalid-id-default.dtd',
      invalidIdDefaultSource,
      'build',
    ],
    [
      'invalid enumeration default',
      'invalid-enumeration-default.dtd',
      invalidEnumerationDefaultSource,
      'build',
    ],
    ['empty', 'empty.dtd', '', 'import'],
  ])(
    'preserves all active state after a %s DTD',
    async (_case, filename, source, expectedStage) => {
      const { container } = render(App);
      await selectFile(container, dtdFile('library.dtd', librarySource));
      await waitUntilImportSettles();
      navigationStore.initializeAt('dtd:element:book');
      inspectorStore.inspect('dtd:element:title');
      const preservedFocus = await screen.findByRole('heading', {
        level: 2,
        name: 'book',
      });
      preservedFocus.focus();
      const before = {
        active: get(activeProjectStore),
        navigation: get(navigationStore),
        inspector: get(inspectorStore),
        presentation: get(projectSessionResetStore),
      };

      await selectFile(container, dtdFile(filename, source));
      const openButton = await waitUntilImportSettles();

      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent(`Could not open ${filename}`);
      expect(alert.textContent?.toLowerCase()).toContain(
        expectedStage === 'import' ? 'no importable' : 'near line',
      );
      expect(get(activeProjectStore)).toBe(before.active);
      expect(get(navigationStore)).toBe(before.navigation);
      expect(get(inspectorStore)).toBe(before.inspector);
      expect(get(projectSessionResetStore)).toBe(before.presentation);
      expect(
        screen.getByRole('heading', { level: 2, name: 'book' }),
      ).toBeVisible();
      expect(openButton).toBeEnabled();
      expect(preservedFocus).toHaveFocus();
      expect(openButton).not.toHaveFocus();
    },
  );

  it('preserves a commented project after unterminated-comment failure and supports dismiss/retry', async () => {
    const { container } = render(App);
    await selectFile(container, dtdFile('comments.dtd', commentsSource));
    await waitUntilImportSettles();
    navigationStore.initializeAt('dtd:element:chapter');
    inspectorStore.inspect('dtd:element:chapter');
    const disclosureSummary = await screen.findByText('View source markup');
    await fireEvent.click(disclosureSummary);
    const disclosure = disclosureSummary.closest('details');
    expect(disclosure).toHaveAttribute('open');
    const before = {
      active: get(activeProjectStore),
      navigation: get(navigationStore),
      inspector: get(inspectorStore),
      presentation: get(projectSessionResetStore),
    };

    await selectFile(
      container,
      dtdFile('unterminated-comment.dtd', unterminatedCommentSource),
    );
    await waitUntilImportSettles();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not open unterminated-comment.dtd',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('near line 1');
    expect(get(activeProjectStore)).toBe(before.active);
    expect(get(navigationStore)).toBe(before.navigation);
    expect(get(inspectorStore)).toBe(before.inspector);
    expect(get(projectSessionResetStore)).toBe(before.presentation);
    expect(disclosure).toHaveAttribute('open');
    expect(
      within(screen.getByRole('article', { name: 'chapter' })).getByRole(
        'heading',
        { level: 2, name: 'chapter' },
      ),
    ).toBeVisible();
    expect(screen.getByRole('region', { name: 'DTD comments' })).toBeVisible();

    await fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss import error' }),
    );
    expect(screen.queryByRole('alert')).toBeNull();

    await selectFile(container, dtdFile('library.dtd', librarySource));
    await waitUntilImportSettles();
    expect(
      screen.getByRole('heading', { level: 2, name: 'library' }),
    ).toBeVisible();
  });

  it('reports wrong extensions directly without changing the sample', async () => {
    const before = get(activeProjectStore);
    const { container } = render(App);

    await selectFile(
      container,
      dtdFile('library.xml', '<!ELEMENT library EMPTY>'),
    );
    await waitUntilImportSettles();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Choose a file with a .dtd extension.',
    );
    expect(get(activeProjectStore)).toBe(before);
  });

  it('reports read failure safely and permits immediate retry', async () => {
    const before = get(activeProjectStore);
    const { container } = render(App);

    await selectFile(
      container,
      dtdFile('library.dtd', '', () =>
        Promise.reject(new Error('private read detail')),
      ),
    );
    await waitUntilImportSettles();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'The selected file could not be read.',
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent(
      'private read detail',
    );
    expect(get(activeProjectStore)).toBe(before);

    await selectFile(container, dtdFile('library.dtd', librarySource));
    await waitUntilImportSettles();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(
      screen.getByRole('heading', { level: 2, name: 'library' }),
    ).toBeVisible();
  });

  it('dismisses only the error, restores Open DTD focus, and exposes the retained one-problem report', async () => {
    const before = get(activeProjectStore);
    const { container } = render(App);
    await selectFile(container, dtdFile('wrong.txt', 'not a DTD'));
    await waitUntilImportSettles();

    expect(
      screen.queryByRole('button', { name: /retained problem report/i }),
    ).toBeNull();

    await fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss import error' }),
    );

    expect(screen.queryByRole('alert')).toBeNull();
    expect(get(activeProjectStore)).toBe(before);
    expect(screen.getByRole('button', { name: 'Open DTD' })).toHaveFocus();

    const problems = screen.getByRole('button', {
      name: 'Open retained problem report for wrong.txt, 1 problem',
    });
    expect(problems).toHaveTextContent('Problems (1)');
    expect(problems).not.toHaveFocus();
    await fireEvent.click(problems);
    let dialog = await screen.findByRole('dialog', {
      name: 'Problems in wrong.txt',
    });
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(1);
    const close = within(dialog).getByRole('button', {
      name: 'Close problems for wrong.txt',
    });
    await waitFor(() => expect(close).toHaveFocus());
    await fireEvent.click(close);
    await waitFor(() => expect(problems).toHaveFocus());

    await fireEvent.click(problems);
    dialog = await screen.findByRole('dialog', {
      name: 'Problems in wrong.txt',
    });
    await fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(problems).toHaveFocus());

    await selectFile(container, dtdFile('library.dtd', librarySource));
    await waitUntilImportSettles();
    expect(
      screen.queryByRole('button', { name: /retained problem report/i }),
    ).toBeNull();
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { level: 2, name: 'library' }),
      ).toHaveFocus(),
    );
  });

  it('opens one retained report from either banner control and restores each origin', async () => {
    const source = '<!ELEMENT root (missing.one, missing.two)>';
    navigationStore.initializeAt(bookDtdNodeIds.chapter);
    inspectorStore.inspect(bookDtdNodeIds.section);
    const before = {
      active: get(activeProjectStore),
      navigation: get(navigationStore),
      inspector: get(inspectorStore),
      presentation: get(projectSessionResetStore),
    };
    const { container } = render(App);

    await selectFile(container, dtdFile('two-problems.dtd', source));
    await waitUntilImportSettles();

    const alert = screen.getByRole('alert');
    expect(
      screen.queryByRole('button', { name: /retained problem report/i }),
    ).toBeNull();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(alert).toHaveTextContent('1 more problem');
    const linkedCount = within(alert).getByRole('button', {
      name: 'View all 2 problems for two-problems.dtd',
    });
    const viewAll = within(alert).getByRole('button', {
      name: 'View all 2 problems for two-problems.dtd using the complete report',
    });

    await fireEvent.click(linkedCount);
    let dialog = await screen.findByRole('dialog', {
      name: 'Problems in two-problems.dtd',
    });
    expect(alert).toBeVisible();
    expect(document.querySelector<HTMLElement>('.app-shell')?.inert).toBe(true);
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(2);
    expect(get(activeProjectStore)).toBe(before.active);
    expect(get(navigationStore)).toBe(before.navigation);
    expect(get(inspectorStore)).toBe(before.inspector);
    expect(get(projectSessionResetStore)).toBe(before.presentation);

    await fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'Close problems for two-problems.dtd',
      }),
    );
    await waitFor(() => expect(linkedCount).toHaveFocus());
    expect(alert).toBeVisible();
    expect(document.querySelector<HTMLElement>('.app-shell')?.inert).toBe(
      false,
    );

    await fireEvent.click(viewAll);
    dialog = await screen.findByRole('dialog', {
      name: 'Problems in two-problems.dtd',
    });
    await fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(viewAll).toHaveFocus());
    expect(alert).toBeVisible();
    expect(screen.getAllByRole('status')).toHaveLength(1);

    await fireEvent.click(
      within(alert).getByRole('button', { name: 'Dismiss import error' }),
    );
    const persistent = screen.getByRole('button', {
      name: 'Open retained problem report for two-problems.dtd, 2 problems',
    });
    expect(persistent).toHaveTextContent('Problems (2)');
    expect(screen.getByRole('button', { name: 'Open DTD' })).toHaveFocus();
    await fireEvent.click(persistent);
    dialog = await screen.findByRole('dialog', {
      name: 'Problems in two-problems.dtd',
    });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(2);
    await fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'Close problems for two-problems.dtd',
      }),
    );
    await waitFor(() => expect(persistent).toHaveFocus());
  });

  it('replaces a retained report on a later failure without duplicating persistent access', async () => {
    const { container } = render(App);
    await selectFile(container, dtdFile('first.txt', 'not a DTD'));
    await waitUntilImportSettles();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss import error' }),
    );
    const firstProblems = screen.getByRole('button', {
      name: 'Open retained problem report for first.txt, 1 problem',
    });
    expect(firstProblems).toBeVisible();
    await fireEvent.click(firstProblems);
    await screen.findByRole('dialog', { name: 'Problems in first.txt' });

    await selectFile(
      container,
      dtdFile('replacement.dtd', '<!ELEMENT root (missing.one, missing.two)>'),
    );
    await waitUntilImportSettles();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('button', { name: 'Open DTD' })).toHaveFocus();
    expect(
      screen.queryByRole('button', { name: /retained problem report/i }),
    ).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not open replacement.dtd',
    );

    await fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss import error' }),
    );
    const replacement = screen.getByRole('button', {
      name: 'Open retained problem report for replacement.dtd, 2 problems',
    });
    expect(
      screen.queryByRole('button', {
        name: /retained problem report for first\.txt/i,
      }),
    ).toBeNull();
    await fireEvent.click(replacement);
    const dialog = await screen.findByRole('dialog', {
      name: 'Problems in replacement.dtd',
    });
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(2);
  });

  it('keeps retained Problems available through active work, cancellation, and empty-picker dismissal', async () => {
    const { container } = render(App);
    await selectFile(container, dtdFile('retained.txt', 'not a DTD'));
    await waitUntilImportSettles();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss import error' }),
    );
    const accessibleName =
      'Open retained problem report for retained.txt, 1 problem';
    expect(screen.getByRole('button', { name: accessibleName })).toBeVisible();

    const read = deferred<string>();
    const selection = selectFile(
      container,
      dtdFile('cancelled.dtd', librarySource, () => read.promise),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Opening DTD' }),
      ).toBeDisabled(),
    );
    expect(screen.getByRole('button', { name: accessibleName })).toBeEnabled();
    await fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    read.resolve(librarySource);
    await selection;
    expect(screen.getByRole('button', { name: accessibleName })).toBeVisible();

    await fireEvent.change(inputFor(container), {
      target: { files: [] },
    });
    expect(screen.getByRole('button', { name: accessibleName })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open DTD' })).toHaveFocus();
  });

  it('renders hostile-looking filenames and diagnostics only as safe text', async () => {
    const { container } = render(App);

    await selectFile(container, dtdFile('<img src=x>.dtd', brokenSource));
    await waitUntilImportSettles();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not open <img src=x>.dtd',
    );
    expect(screen.getByRole('alert').querySelector('img')).toBeNull();
    expect(errorAlertSource).not.toContain('@html');
    expect(warningNoticeSource).not.toContain('@html');
  });

  it('keeps local reading free of upload and persistence APIs', () => {
    for (const source of [controllerSource, schemaControllerSource]) {
      expect(source).not.toMatch(
        /\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB)\b/,
      );
    }
    expect(controllerSource).toContain('file.text()');
    expect(schemaControllerSource).toContain('file.text()');
    expect(schemaControllerSource).not.toContain('importDtdSource');
    expect(schemaControllerSource).not.toContain('importXsdSource');
    expect(workerRuntimeSource).toContain('importDtdSource');
    expect(workerRuntimeSource).toContain('importXsdSource');
    expect(schemaControllerSource).toContain('activateImportedProject');
    expect(schemaControllerSource).toContain('activateImportedXsdProject');
  });
});
