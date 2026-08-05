import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { SchemaOutlineListRow } from '../presentation/schemaOutlineListPresentation';
import SchemaOutlineList from './SchemaOutlineList.svelte';
import source from './SchemaOutlineList.svelte?raw';

function rows(count: number): SchemaOutlineListRow[] {
  return Array.from({ length: count }, (_, index) => ({
    nodeId: `node:${index}`,
    displayName: index === 150 ? '<script>literal</script>' : `Node ${index}`,
    kindLabel: 'DTD element',
  }));
}

describe('SchemaOutlineList', () => {
  it('renders no more than 100 safe rows and pages with native controls', async () => {
    const onCenterNode = vi.fn();
    const { container } = render(SchemaOutlineList, {
      props: {
        groupId: 'large',
        label: 'DTD elements',
        rows: rows(40_000),
        currentFocusNodeId: 'node:0',
        inspectedNodeId: undefined,
        onCenterNode,
      },
    });

    expect(
      container.querySelectorAll('[data-schema-outline-row]'),
    ).toHaveLength(100);
    const next = screen.getByRole('button', { name: 'Next 100' });
    await fireEvent.click(next);
    expect(
      container.querySelectorAll('[data-schema-outline-row]'),
    ).toHaveLength(100);
    expect(screen.getByRole('button', { name: 'Next 100' })).toHaveFocus();

    const filter = screen.getByRole('searchbox', {
      name: 'Filter DTD elements',
    });
    await fireEvent.input(filter, { target: { value: '<script>literal' } });
    expect(screen.getByText('<script>literal</script>')).toBeVisible();
    expect(container.querySelector('script')).toBeNull();
  });

  it('keeps centre and inspect actions separate with current styling', async () => {
    const onCenterNode = vi.fn();
    const onInspectNode = vi.fn();
    render(SchemaOutlineList, {
      props: {
        groupId: 'actions',
        label: 'declarations',
        rows: rows(3),
        currentFocusNodeId: 'node:0',
        inspectedNodeId: 'node:2',
        onCenterNode,
        onInspectNode,
      },
    });
    expect(screen.getByText('Node 0')).toHaveAttribute('aria-current', 'true');
    await fireEvent.click(
      screen.getByRole('button', { name: 'Center Node 1, DTD element' }),
    );
    await fireEvent.click(
      screen.getByRole('button', { name: 'Node 2 is currently inspected' }),
    );
    expect(onCenterNode).toHaveBeenCalledOnce();
    expect(onInspectNode).toHaveBeenCalledWith('node:2');
  });

  it('keeps long declaration names complete and safely wrapped beside Inspect', () => {
    const longName = 'spellMasterySpecialAbilityDefinitionType';
    render(SchemaOutlineList, {
      props: {
        groupId: 'long-name',
        label: 'complex types',
        rows: [
          { nodeId: 'long', displayName: longName, kindLabel: 'Complex type' },
        ],
        currentFocusNodeId: undefined,
        inspectedNodeId: undefined,
        onCenterNode: vi.fn(),
        onInspectNode: vi.fn(),
      },
    });
    expect(screen.getByText(longName)).toHaveTextContent(longName);
    expect(
      screen.getByRole('button', { name: `Inspect ${longName}` }),
    ).toBeVisible();
    expect(source).toContain('grid-template-columns: minmax(0, 1fr) auto');
    expect(source).toContain('overflow-wrap: anywhere');
    expect(source).toContain('font-size: var(--font-size-sm)');
    expect(source).toContain('white-space: normal');
    expect(source).not.toContain('text-overflow: ellipsis');
  });
});
