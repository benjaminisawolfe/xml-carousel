import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type {
  SchemaDiagnostic,
  SchemaDiagnosticReport,
} from '../../app/import/schemaDiagnosticReport';
import ProblemReportDialog from './ProblemReportDialog.svelte';
import source from './ProblemReportDialog.svelte?raw';
import { PROBLEM_REPORT_DIALOG_ID } from './problemReportPresentation';

function diagnostic(
  id: string,
  overrides: Partial<SchemaDiagnostic> = {},
): SchemaDiagnostic {
  return {
    id,
    severity: 'error',
    message: `Complete message ${id}`,
    ...overrides,
  };
}
function report(
  diagnostics: readonly SchemaDiagnostic[],
  overrides: Partial<SchemaDiagnosticReport> = {},
): SchemaDiagnosticReport {
  return {
    attemptId: 'attempt',
    format: 'xsd',
    attemptedFileName: 'annotation-errors.xsd',
    diagnostics,
    totalCount: diagnostics.length,
    ...overrides,
  };
}

describe('ProblemReportDialog', () => {
  it('uses attempted-import identity, honest summary, and active-project wording', async () => {
    render(ProblemReportDialog, {
      props: {
        open: true,
        report: report([
          diagnostic('one', { category: 'standards-invalid' }),
          diagnostic('two', {
            severity: 'warning',
            category: 'blocked-dependency',
          }),
        ]),
        hasActiveProject: true,
      },
    });
    const dialog = await screen.findByRole('dialog', {
      name: 'Problems in annotation-errors.xsd',
    });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('id', PROBLEM_REPORT_DIALOG_ID);
    expect(dialog).toHaveTextContent('2 problems: 1 error and 1 warning.');
    expect(dialog).toHaveTextContent(
      'Standards validation error and Blocked or missing dependency',
    );
    expect(dialog).toHaveTextContent(
      'The attempted schema could not be opened.',
    );
    expect(dialog).toHaveTextContent(
      'The previously loaded project remains open.',
    );
  });

  it('does not claim a previous project without one', async () => {
    render(ProblemReportDialog, {
      props: {
        open: true,
        report: report([diagnostic('one'), diagnostic('two')]),
        hasActiveProject: false,
      },
    });
    const dialog = await screen.findByRole('dialog');
    expect(dialog).not.toHaveTextContent('previously loaded project');
  });

  it('renders complete repeated safe messages and only supplied metadata', async () => {
    const message = '<img src=x> First line\nSecond line remains complete.';
    render(ProblemReportDialog, {
      props: {
        open: true,
        report: report([
          diagnostic('one', {
            message,
            fileName: 'annotation-errors.xsd',
            line: 14,
            column: 9,
            code: 'xerces:14',
            source: 'xsd',
            category: 'standards-invalid',
            relatedNodeId: 'type:example',
          }),
          diagnostic('two', { message, fileName: 'annotation-errors.xsd' }),
        ]),
      },
    });
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getAllByText((_, node) => node?.textContent === message),
    ).toHaveLength(2);
    expect(dialog.querySelector('img')).toBeNull();
    expect(dialog).toHaveTextContent('Line 14');
    expect(dialog).toHaveTextContent('Column 9');
    expect(dialog).toHaveTextContent('Code xerces:14');
    expect(dialog).toHaveTextContent('Source XSD');
    expect(dialog).toHaveTextContent('Related component type:example');
    expect(dialog).not.toHaveTextContent('Unknown');
  });

  it('groups ZIP paths and unknown diagnostics without basename collapse', async () => {
    render(ProblemReportDialog, {
      props: {
        open: true,
        report: report(
          [
            diagnostic('a1', { fileName: 'a/shared.xsd' }),
            diagnostic('b1', { fileName: 'b/shared.xsd' }),
            diagnostic('a2', { fileName: 'a/shared.xsd' }),
            diagnostic('unknown'),
          ],
          { format: 'zip', attemptedFileName: 'schemas.zip' },
        ),
      },
    });
    const headings = within(await screen.findByRole('dialog')).getAllByRole(
      'heading',
      { level: 3 },
    );
    expect(headings.map(({ textContent }) => textContent)).toEqual([
      'a/shared.xsd — 2 problems',
      'b/shared.xsd — 1 problem',
      'Project-level or unknown-source problems',
    ]);
    expect(
      within(headings[0]!.parentElement!)
        .getAllByRole('listitem')
        .map(({ textContent }) => textContent),
    ).toEqual([
      expect.stringContaining('Complete message a1'),
      expect.stringContaining('Complete message a2'),
    ]);
  });

  it('focuses inside, traps Tab, and reports Escape and Close', async () => {
    const onClose = vi.fn();
    render(ProblemReportDialog, {
      props: {
        open: true,
        report: report([diagnostic('one'), diagnostic('two')]),
        onClose,
      },
    });
    const dialog = await screen.findByRole('dialog');
    const close = within(dialog).getByRole('button', {
      name: 'Close problems for annotation-errors.xsd',
    });
    await waitFor(() => expect(close).toHaveFocus());
    const details = within(dialog).getByRole('region', {
      name: 'Problem details',
    });
    expect(details).toHaveAttribute('tabindex', '0');
    await fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(details).toHaveFocus();
    await fireEvent.keyDown(details, { key: 'Tab' });
    expect(close).toHaveFocus();
    await fireEvent.keyDown(close, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledWith('escape');
    await fireEvent.click(close);
    expect(onClose).toHaveBeenCalledWith('close');
  });

  it('closes safely when the retained report disappears and stays viewport-bounded', async () => {
    const rendered = render(ProblemReportDialog, {
      props: {
        open: true,
        report: report([diagnostic('one'), diagnostic('two')]),
      },
    });
    await screen.findByRole('dialog');
    await rendered.rerender({ open: true, report: undefined });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(source).toContain('max-height: calc(100dvh');
    expect(source).toContain('overflow: auto');
    expect(source).toContain('overflow-wrap: anywhere');
    expect(source).toContain('white-space: pre-wrap');
    expect(source).not.toContain('@html');
  });
});
