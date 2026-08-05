import { render, screen, waitFor, within } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../app/App.svelte';
import { inspectorStore } from '../app/stores/inspectorStore';
import { navigationStore } from '../app/stores/navigationStore';
import {
  activateImportedProject,
  replaceProjectSession,
} from '../app/stores/projectSession';
import { activeProjectStore } from '../app/stores/projectStore';
import { importDtdSource } from '../schema/dtd';
import {
  bookDtdNodeIds,
  bookDtdProject,
} from '../schema/samples/bookDtdProject';
import inspectorPanelSource from '../ui/layout/InspectorPanel.svelte?raw';
import leftPanelSource from '../ui/layout/LeftPanel.svelte?raw';
import schemaCarouselSource from '../ui/carousel/SchemaCarousel.svelte?raw';
import topBarSource from '../ui/layout/TopBar.svelte?raw';
import dtdImportSource from '../schema/dtd/dtdImport.ts?raw';

const librarySource = [
  '<!ELEMENT library (shelf+)>',
  '<!ELEMENT shelf (book*)>',
  '<!ELEMENT book (title, author+)>',
  '<!ELEMENT title (#PCDATA)>',
  '<!ELEMENT author (#PCDATA)>',
].join('\n');

function restoreSample(): void {
  const result = replaceProjectSession({
    project: bookDtdProject,
    initialFocusNodeId: bookDtdNodeIds.book,
    metadata: {
      origin: 'sample',
      sourceFilename: 'book.dtd',
    },
  });
  if (!result.applied) throw new Error('Expected sample restoration to apply.');
}

function importLibrary() {
  return importDtdSource(librarySource, {
    projectId: 'test:library-ui',
    displayName: 'Library project',
    sourceFileId: 'test:library-source',
    sourceFilename: 'library.dtd',
  });
}

describe('active project application integration', () => {
  beforeEach(restoreSample);
  afterEach(restoreSample);

  it('updates every application surface from one imported project', async () => {
    render(App);
    const result = activateImportedProject(importLibrary());
    expect(result.applied).toBe(true);

    const topBar = screen.getByRole('banner');
    await waitFor(() =>
      expect(within(topBar).getByText('library.dtd')).toBeVisible(),
    );
    expect(
      within(topBar).getByRole('button', { name: 'Open DTD' }),
    ).toBeEnabled();

    const navigation = screen.getByRole('navigation', {
      name: 'Schema navigation',
    });
    const dtdElements = within(navigation).getByRole('region', {
      name: 'DTD elements',
    });
    expect(
      within(dtdElements)
        .getAllByRole('listitem')
        .map((item) =>
          item.textContent?.replace('DTD element declaration', '').trim(),
        ),
    ).toEqual(['library', 'shelf', 'book', 'title', 'author']);
    expect(within(navigation).getByText('library.dtd')).toBeVisible();
    expect(within(navigation).queryByText('front.matter')).toBeNull();
    expect(within(navigation).queryByText('chapter')).toBeNull();

    const carousel = screen.getByRole('main', { name: 'Schema carousel' });
    expect(
      within(carousel).getByRole('heading', { level: 2, name: 'library' }),
    ).toBeVisible();
    expect(
      within(carousel).getByRole('article', {
        name: 'Destination shelf+',
      }),
    ).toBeVisible();
    expect(get(navigationStore)).toEqual({
      projectId: 'test:library-ui',
      navigationPath: ['dtd:element:library'],
    });
    expect(
      get(navigationStore.leafwardRelationships)[0]?.edge.occurrence,
    ).toEqual({ min: 1, max: 'unbounded' });
    expect(screen.getAllByRole('status')).toHaveLength(1);
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Focused: library, DTD element declaration. One child.',
      ),
    );

    inspectorStore.inspect('dtd:element:book');
    const inspector = screen.getByRole('complementary', {
      name: 'Schema inspector',
    });
    await waitFor(() =>
      expect(
        within(inspector).getByRole('heading', { name: 'book' }),
      ).toBeVisible(),
    );
    expect(
      within(
        within(inspector).getByRole('region', { name: 'Structure' }),
      ).getByText('<!ELEMENT book (title, author+)>'),
    ).toBeVisible();
    expect(get(activeProjectStore).contentKindsByNodeId).toMatchObject({
      'dtd:element:library': 'elementOnly',
      'dtd:element:title': 'text',
    });
  });

  it('restores the original sample application state through the same boundary', async () => {
    render(App);
    activateImportedProject(importLibrary());
    restoreSample();

    await waitFor(() =>
      expect(
        within(screen.getByRole('banner')).getByText('book.dtd'),
      ).toBeVisible(),
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'book' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: 'Center chapter, DTD element declaration',
      }),
    ).toBeVisible();
    expect(get(navigationStore).navigationPath).toEqual([bookDtdNodeIds.book]);
    expect(get(inspectorStore.inspectedNodeId)).toBeUndefined();
  });

  it('keeps production UI surfaces free of private sample-project imports', () => {
    for (const source of [
      leftPanelSource,
      schemaCarouselSource,
      inspectorPanelSource,
    ]) {
      expect(source).not.toContain('bookDtdProject');
      expect(source).toContain('activeProjectStore');
    }
    expect(topBarSource).not.toContain('bookDtdProject');
    expect(topBarSource).not.toContain('activeProjectStore');
  });

  it('keeps the pure import pipeline isolated from UI, stores, and browsers', () => {
    expect(dtdImportSource).not.toMatch(/svelte|ui\/|app\/stores/);
    expect(dtdImportSource).not.toMatch(
      /\b(window|document|File|HTMLElement)\b/,
    );
  });
});
