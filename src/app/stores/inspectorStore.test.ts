import { get } from 'svelte/store';
import { describe, expect, it } from 'vitest';
import {
  bookDtdNodeIds,
  bookDtdProject,
} from '../../schema/samples/bookDtdProject';
import {
  closeInspector,
  createInspectorStore,
  inspectNode,
} from './inspectorStore';
import type { InspectorState } from './inspectorTypes';

const emptyState = {
  projectId: bookDtdProject.id,
} satisfies InspectorState;

describe('inspector state', () => {
  it('stores only project and inspected-node identity', () => {
    const result = inspectNode(bookDtdProject, emptyState, bookDtdNodeIds.book);

    expect(result).toEqual({
      applied: true,
      state: {
        projectId: bookDtdProject.id,
        inspectedNodeId: bookDtdNodeIds.book,
      },
    });
    expect(result.state).not.toHaveProperty('inspectedNode');
    expect(result.state).not.toHaveProperty('navigationPath');
  });

  it('rejects an unknown node without replacing the current target', () => {
    const current = {
      ...emptyState,
      inspectedNodeId: bookDtdNodeIds.frontMatter,
    };

    expect(inspectNode(bookDtdProject, current, 'missing')).toEqual({
      applied: false,
      reason: 'unknownNode',
      state: current,
    });
  });

  it('rejects a mismatched project', () => {
    const mismatch = { projectId: 'another-project' };
    expect(inspectNode(bookDtdProject, mismatch, bookDtdNodeIds.book)).toEqual({
      applied: false,
      reason: 'projectMismatch',
      state: mismatch,
    });
  });

  it('closes without retaining the inspected identity', () => {
    const current = {
      ...emptyState,
      inspectedNodeId: bookDtdNodeIds.bookContent,
    };
    expect(closeInspector(current)).toEqual({
      applied: true,
      state: emptyState,
    });
  });

  it('derives the current node, children, and incoming relationships', () => {
    const store = createInspectorStore(bookDtdProject, emptyState);

    expect(get(store.hasTarget)).toBe(false);
    expect(get(store.inspectedNode)).toBeUndefined();
    expect(store.inspect(bookDtdNodeIds.chapter).applied).toBe(true);
    expect(get(store.inspectedNode)?.name).toBe('chapter');
    expect(get(store.containedChildren).map(({ node }) => node.name)).toEqual([
      'title',
      'epigraph',
      'section',
      'figure',
      'note',
    ]);
    expect(
      get(store.incomingRelationships).map(({ node }) => node.name),
    ).toEqual(['book.content']);
  });

  it('does not mutate the schema project while inspecting or closing', () => {
    const before = JSON.stringify(bookDtdProject);
    const store = createInspectorStore(bookDtdProject, emptyState);

    store.inspect(bookDtdNodeIds.index);
    store.close();

    expect(JSON.stringify(bookDtdProject)).toBe(before);
  });
});
