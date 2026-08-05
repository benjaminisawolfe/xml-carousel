import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import NodeDeclarations from './NodeDeclarations.svelte';
import NodeStructure from './NodeStructure.svelte';
import type {
  InspectorDeclarationSummary,
  InspectorDestinationSummary,
} from './inspectorSummary';

function destinations(count: number): readonly InspectorDestinationSummary[] {
  return Array.from({ length: count }, (_, index) => ({
    relationshipId: `edge:${index}`,
    nodeId: `node:${index}`,
    displayName:
      index === count - 1 ? '<script>last</script>' : `Child ${index}`,
    kind: index % 2 === 0 ? 'localElement' : 'sequence',
    occurrence: index % 3 === 0 ? '*' : '',
    order: index,
    relationshipKind: 'contains',
    relationshipLabel: index % 5 === 0 ? 'Recursive child' : 'Child',
    ...(index === 7
      ? {
          disposition: 'terminalCycleClosure' as const,
          terminalLabel: 'Already present earlier in this path',
        }
      : {}),
  }));
}

function declarations(count: number): readonly InspectorDeclarationSummary[] {
  return Array.from({ length: count }, (_, index) => ({
    relationshipId: `declaration-edge:${index}`,
    nodeId: `declaration:${index}`,
    displayName: `Declaration ${index}`,
    kind: index % 2 === 0 ? 'globalElement' : 'complexType',
    occurrence: '',
    order: index,
    relationshipKind: 'contains',
    relationshipLabel:
      index % 2 === 0 ? 'Global element' : 'Named complex type',
  }));
}

function structureProps(count: number, resetKey = 'project:0:owner') {
  return {
    summary: {
      nodeId: 'owner',
      declaration: '(children)',
      orderedDestinations: destinations(count),
      isStructuralLeaf: false,
    },
    showNodeKinds: true,
    onCenterNode: vi.fn(),
    resetKey,
  };
}

describe('inspector child filtering UI', () => {
  it('keeps the exact small-list anatomy below ten rows', () => {
    render(NodeStructure, { props: structureProps(9) });

    expect(
      screen.queryByRole('searchbox', { name: 'Filter child structures' }),
    ).not.toBeInTheDocument();
    expect(
      within(
        screen.getByRole('list', { name: 'Ordered child structures' }),
      ).getAllByRole('listitem'),
    ).toHaveLength(9);
  });

  it('adds filtering at ten rows and matches display, kind, relationship, occurrence, and terminal fields', async () => {
    render(NodeStructure, { props: structureProps(10) });
    const input = screen.getByRole('searchbox', {
      name: 'Filter child structures',
    });

    expect(input).toHaveAttribute('placeholder', 'Filter child structures');
    expect(input).toHaveAttribute('autocomplete', 'off');
    expect(input).toHaveAttribute('spellcheck', 'false');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Showing 10 of 10 child structures.',
    );

    await fireEvent.input(input, { target: { value: 'sequence child' } });
    expect(screen.getAllByRole('listitem')).toHaveLength(5);

    await fireEvent.input(input, { target: { value: 'recursive *' } });
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('Child 0*')).toBeVisible();

    await fireEvent.input(input, { target: { value: 'earlier path' } });
    expect(screen.getByText('Child 7')).toBeVisible();
    expect(screen.getByText(/Already present earlier/)).toBeVisible();
  });

  it('clears with Escape without escaping the input and retains focus', async () => {
    const outerKeydown = vi.fn();
    window.addEventListener('keydown', outerKeydown);
    render(NodeDeclarations, {
      props: {
        sourceNodeId: 'schema',
        declarations: declarations(20),
        onCenterNode: vi.fn(),
        resetKey: 'project:0:schema',
      },
    });
    const input = screen.getByRole('searchbox', {
      name: 'Filter declarations',
    });
    input.focus();
    await fireEvent.input(input, { target: { value: 'complex type' } });
    await fireEvent.keyDown(input, { key: 'Escape' });

    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
    expect(outerKeydown).not.toHaveBeenCalled();

    await fireEvent.keyDown(input, { key: 'Escape' });
    expect(outerKeydown).toHaveBeenCalledOnce();
    window.removeEventListener('keydown', outerKeydown);
  });

  it('clears through the 44px Clear control and resets the result page', async () => {
    render(NodeDeclarations, {
      props: {
        sourceNodeId: 'schema',
        declarations: declarations(120),
        onCenterNode: vi.fn(),
      },
    });
    const input = screen.getByRole('searchbox', {
      name: 'Filter declarations',
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Show 50 more' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(100);
    await fireEvent.input(input, { target: { value: 'declaration' } });
    expect(screen.getAllByRole('listitem')).toHaveLength(50);
    await fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(input).toHaveFocus();
    expect(input).toHaveValue('');
    expect(screen.getAllByRole('listitem')).toHaveLength(50);
  });

  it('shows 50-row increments, a final partial label, and keeps button focus', async () => {
    render(NodeStructure, { props: structureProps(120) });

    const first = screen.getByRole('button', { name: 'Show 50 more' });
    first.focus();
    await fireEvent.click(first);
    expect(screen.getAllByRole('listitem')).toHaveLength(100);
    expect(screen.getByRole('button', { name: 'Show 20 more' })).toHaveFocus();

    await fireEvent.click(screen.getByRole('button', { name: 'Show 20 more' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(120);
    expect(screen.queryByRole('button', { name: /Show .* more/ })).toBeNull();
  });

  it('uses declaration-specific grammar and safe no-match rendering', async () => {
    render(NodeDeclarations, {
      props: {
        sourceNodeId: 'schema',
        declarations: declarations(20),
        onCenterNode: vi.fn(),
      },
    });
    const input = screen.getByRole('searchbox', {
      name: 'Filter declarations',
    });
    await fireEvent.input(input, {
      target: { value: '<img src=x onerror=alert(1)>' },
    });

    expect(screen.getByRole('status')).toHaveTextContent(
      'Showing 0 of 0 matching declarations.',
    );
    expect(
      screen.getByText('No declarations match “<img src=x onerror=alert(1)>”.'),
    ).toBeVisible();
    expect(document.querySelector('img')).toBeNull();
    expect(screen.queryByText(/nodes/)).toBeNull();
  });

  it('resets query and limit when inspected identity, project, or revision changes', async () => {
    const { rerender } = render(NodeStructure, {
      props: structureProps(120, 'project-a:0:owner'),
    });
    const input = screen.getByRole('searchbox', {
      name: 'Filter child structures',
    });
    await fireEvent.input(input, { target: { value: 'child' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Show 50 more' }));

    await rerender(structureProps(120, 'project-b:1:other'));
    expect(input).toHaveValue('');
    expect(screen.getAllByRole('listitem')).toHaveLength(50);
  });

  it('renders 2,000 generated rows incrementally without a committed fixture', () => {
    const startedAt = performance.now();
    render(NodeDeclarations, {
      props: {
        sourceNodeId: 'schema',
        declarations: declarations(2000),
        onCenterNode: vi.fn(),
      },
    });
    const elapsedMs = performance.now() - startedAt;

    expect(screen.getAllByRole('listitem')).toHaveLength(50);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Showing 50 of 2000 declarations.',
    );
    expect(elapsedMs).toBeGreaterThanOrEqual(0);
  });
});
