import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import OutlineSectionHeading from './OutlineSectionHeading.svelte';
import source from './OutlineSectionHeading.svelte?raw';

describe('OutlineSectionHeading', () => {
  it('uses heading semantics with a full-width bordered label/count treatment', () => {
    render(OutlineSectionHeading, {
      props: { id: 'types', label: 'Complex types', count: 4 },
    });
    const heading = screen.getByRole('heading', {
      level: 3,
      name: 'Complex types',
    });
    expect(heading).toHaveAttribute('id', 'types');
    expect(heading).toHaveAttribute('data-outline-section-heading');
    expect(heading).toHaveTextContent('Complex types 4');
    expect(source).toContain('width: 100%');
    expect(source).toContain('border: 1px solid var(--colour-border-strong)');
    expect(source).toContain('font-size: var(--font-size-md)');
    expect(source).toContain('font-weight: 800');
  });
});
