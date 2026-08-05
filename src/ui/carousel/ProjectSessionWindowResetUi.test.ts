import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { getContainedChildren } from '../../schema/model';
import {
  bookDtdNodeIds,
  bookDtdProject,
} from '../../schema/samples/bookDtdProject';
import BranchFan from './BranchFan.svelte';
import RootwardPath from './RootwardPath.svelte';

describe('project-session side-window reset', () => {
  it('returns a shifted leafward window to its initial position', async () => {
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 700,
      writable: true,
    });
    const relationships = getContainedChildren(
      bookDtdProject,
      bookDtdNodeIds.chapter,
    );
    const props = {
      project: bookDtdProject,
      relationships,
      focusNodeId: bookDtdNodeIds.chapter,
      inspectedNodeId: undefined,
      focusedNodeKind: 'dtdElement' as const,
      nextJourneyPosition: 3,
      onNavigate: vi.fn(),
      onToggleInspection: vi.fn(),
      projectSessionRevision: 0,
    };
    const { rerender } = render(BranchFan, { props });
    const lane = screen.getByRole('region', {
      name: 'Leafward destinations',
    });

    expect(
      within(lane)
        .getAllByRole('article')
        .map((article) => article.getAttribute('aria-label')),
    ).toEqual([
      'Destination title',
      'Destination epigraph?',
      'Destination section*',
    ]);
    await fireEvent.click(
      within(lane).getByRole('button', {
        name: 'Show 2 nodes below in the leafward rail',
      }),
    );
    expect(within(lane).queryByLabelText('Destination title')).toBeNull();

    await rerender({ ...props, projectSessionRevision: 1 });

    expect(within(lane).getByLabelText('Destination title')).toBeVisible();
  });

  it('returns a shifted rootward window to its nearest-first position', async () => {
    const nodes = [
      bookDtdNodeIds.note,
      bookDtdNodeIds.figure,
      bookDtdNodeIds.section,
      bookDtdNodeIds.chapter,
      bookDtdNodeIds.bookContent,
    ].map((nodeId) => {
      const node = bookDtdProject.nodes.find(({ id }) => id === nodeId);
      if (!node) throw new Error(`Missing fixture node ${nodeId}.`);
      return node;
    });
    const props = {
      nodes,
      inspectedNodeId: undefined,
      focusedNodeKind: 'dtdElement' as const,
      journeyLength: 6,
      journeyKey: nodes.map(({ id }) => id).join('\u0000'),
      onNavigatePrevious: vi.fn(),
      onJumpEarlier: vi.fn(),
      onToggleInspection: vi.fn(),
      projectSessionRevision: 0,
    };
    const { rerender } = render(RootwardPath, { props });
    const lane = screen.getByRole('region', { name: 'Rootward journey' });

    expect(within(lane).getByLabelText('Previous step note')).toBeVisible();
    expect(
      within(lane).getByRole('button', {
        name: 'Jump to figure, earlier in the current path',
      }),
    ).toBeVisible();
    await fireEvent.click(
      within(lane).getByRole('button', {
        name: 'Show 2 earlier path steps',
      }),
    );
    expect(within(lane).getByLabelText('Previous step note')).toBeVisible();
    expect(
      within(lane).queryByRole('button', {
        name: 'Jump to figure, earlier in the current path',
      }),
    ).toBeNull();

    await rerender({ ...props, projectSessionRevision: 1 });

    expect(within(lane).getByLabelText('Previous step note')).toBeVisible();
    expect(
      within(lane).getByRole('button', {
        name: 'Jump to figure, earlier in the current path',
      }),
    ).toBeVisible();
  });
});
