import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { SchemaDiagnosticReport } from '../../app/import/schemaDiagnosticReport';
import ImportErrorAlert from './ImportErrorAlert.svelte';
import source from './ImportErrorAlert.svelte?raw';

function report(count: number): SchemaDiagnosticReport {
  return {
    attemptId: 'attempt-1',
    format: 'xsd',
    attemptedFileName: 'annotation-errors.xsd',
    diagnostics: Array.from({ length: count }, (_, index) => ({
      id: `problem-${index}`,
      severity: 'error' as const,
      message: `Problem ${index + 1}`,
    })),
    totalCount: count,
  };
}

function presentation(additional: number) {
  return {
    heading: 'Could not open annotation-errors.xsd',
    message: 'Problem 1',
    additionalProblemCount: additional,
    ...(additional
      ? {
          additionalProblemsText: `${additional} more ${additional === 1 ? 'problem' : 'problems'}`,
        }
      : {}),
  };
}

describe('ImportErrorAlert complete-report controls', () => {
  it('shows no modal opener for one diagnostic', () => {
    render(ImportErrorAlert, {
      props: {
        presentation: presentation(0),
        report: report(1),
        onViewAll: vi.fn(),
        onDismiss: vi.fn(),
      },
    });
    const alert = screen.getByRole('alert');
    expect(within(alert).queryByText(/more problems?/)).toBeNull();
    expect(within(alert).queryByText('View all problems')).toBeNull();
  });

  it('uses separate keyboard-focusable openers with accurate names', async () => {
    const onViewAll = vi.fn();
    render(ImportErrorAlert, {
      props: {
        presentation: presentation(1),
        report: report(2),
        onViewAll,
        onDismiss: vi.fn(),
      },
    });
    const link = screen.getByRole('button', {
      name: 'View all 2 problems for annotation-errors.xsd',
    });
    const button = screen.getByRole('button', {
      name: 'View all 2 problems for annotation-errors.xsd using the complete report',
    });
    expect(link).toHaveTextContent('1 more problem');
    expect(button).toHaveTextContent('View all problems');
    link.focus();
    expect(link).toHaveFocus();
    await fireEvent.click(link);
    await fireEvent.click(button);
    expect(onViewAll).toHaveBeenNthCalledWith(1, link);
    expect(onViewAll).toHaveBeenNthCalledWith(2, button);
  });

  it('uses plural wording and explicit link interaction styles', () => {
    render(ImportErrorAlert, {
      props: {
        presentation: presentation(7),
        report: report(8),
        onViewAll: vi.fn(),
        onDismiss: vi.fn(),
      },
    });
    expect(screen.getByText('7 more problems')).toBeVisible();
    expect(source).toContain('text-decoration: underline');
    expect(source).toContain('.additional-problems:hover');
    expect(source).toContain('.additional-problems:active');
  });
});
