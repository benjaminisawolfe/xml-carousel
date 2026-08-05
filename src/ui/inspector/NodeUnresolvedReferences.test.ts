import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import NodeUnresolvedReferences from './NodeUnresolvedReferences.svelte';

describe('NodeUnresolvedReferences', () => {
  it('is absent when empty and safely renders noninteractive package issues', () => {
    const empty = render(NodeUnresolvedReferences, {
      props: { references: [] },
    });
    expect(
      screen.queryByRole('heading', { name: 'Unresolved references' }),
    ).not.toBeInTheDocument();
    empty.unmount();

    const { container } = render(NodeUnresolvedReferences, {
      props: {
        references: [
          {
            id: 'internal-unresolved-id',
            sourceNodeId: 'internal-owner-id',
            raw: '<script>alert(1)</script>',
            kindLabel: 'Type reference',
            reasonLabel: 'Wrong component kind',
            explanation:
              'Matching declarations exist, but none has the XSD component kind required by this reference.',
            ownerDisplayName: 'root',
            candidateCount: 2,
            candidateSummary: 'Candidates: Shared · a.xsd; Shared · b.xsd',
            line: 4,
            column: 7,
          },
        ],
      },
    });

    expect(
      screen.getByRole('heading', { name: 'Unresolved references' }),
    ).toBeVisible();
    expect(screen.getByText('<script>alert(1)</script>')).toBeVisible();
    expect(screen.getByText(/Wrong component kind/)).toBeVisible();
    expect(screen.getByText(/Candidates: Shared/)).toBeVisible();
    expect(screen.getByText('Source line 4, column 7')).toBeVisible();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('a, button')).toBeNull();
    expect(container.textContent).not.toContain('internal-unresolved-id');
    expect(container.textContent).not.toContain('internal-owner-id');
  });
});
