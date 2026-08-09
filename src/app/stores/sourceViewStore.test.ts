import { get, writable } from 'svelte/store';
import { describe, expect, it } from 'vitest';
import {
  bookDtdNodeIds,
  bookDtdProject,
} from '../../schema/samples/bookDtdProject';
import {
  closeSourceView,
  createSourceViewStore,
  openSourceView,
  type SourceViewState,
} from './sourceViewStore';

const closed = {
  projectId: bookDtdProject.id,
} satisfies SourceViewState;

describe('source view state', () => {
  it('starts closed and stores only project, node, and domain origin', () => {
    const store = createSourceViewStore(bookDtdProject, closed);
    expect(get(store)).toEqual(closed);

    expect(
      store.open(
        {
          projectId: bookDtdProject.id,
          nodeId: bookDtdNodeIds.book,
          sourceAvailable: true,
        },
        'focused-card',
      ),
    ).toEqual({
      applied: true,
      state: {
        projectId: bookDtdProject.id,
        nodeId: bookDtdNodeIds.book,
        origin: 'focused-card',
      },
    });
    expect(get(store)).not.toHaveProperty('element');
    expect(get(store)).not.toHaveProperty('navigationPath');
  });

  it('rejects unknown, wrong-project, and unavailable targets', () => {
    expect(
      openSourceView(
        bookDtdProject,
        closed,
        {
          projectId: bookDtdProject.id,
          nodeId: 'missing',
          sourceAvailable: true,
        },
        'inspector',
      ),
    ).toMatchObject({ applied: false, reason: 'unknownNode', state: closed });
    expect(
      openSourceView(
        bookDtdProject,
        closed,
        {
          projectId: 'stale-project',
          nodeId: bookDtdNodeIds.book,
          sourceAvailable: true,
        },
        'search-result',
      ),
    ).toMatchObject({ applied: false, reason: 'projectMismatch' });
    expect(
      openSourceView(
        bookDtdProject,
        closed,
        {
          projectId: bookDtdProject.id,
          nodeId: bookDtdNodeIds.book,
          sourceAvailable: false,
        },
        'focused-card',
      ),
    ).toMatchObject({ applied: false, reason: 'sourceUnavailable' });
  });

  it('closes and resets synchronously for project replacement', () => {
    const projectSource = writable(bookDtdProject);
    const store = createSourceViewStore(projectSource, closed);
    store.open(
      {
        projectId: bookDtdProject.id,
        nodeId: bookDtdNodeIds.chapter,
        sourceAvailable: true,
      },
      'inspector',
    );
    expect(closeSourceView(get(store))).toEqual({
      applied: true,
      state: closed,
    });
    expect(store.resetForProject('replacement')).toEqual({
      applied: true,
      state: { projectId: 'replacement' },
    });
    expect(get(store)).toEqual({ projectId: 'replacement' });
  });
});
