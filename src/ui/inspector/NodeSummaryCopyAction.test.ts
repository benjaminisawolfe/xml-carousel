import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { CopyText, CopyTextResult } from '../source/copyText';
import NodeSummaryCopyAction from './NodeSummaryCopyAction.svelte';
import nodeSummaryCopyActionSource from './NodeSummaryCopyAction.svelte?raw';

function copied(): Promise<CopyTextResult> {
  return Promise.resolve({ succeeded: true });
}

function statusRegion(): Element | null {
  return document.querySelector('[data-node-summary-copy-status]');
}

function deferredCopy(): {
  copy: CopyText;
  resolve: (result: CopyTextResult) => void;
} {
  let resolve!: (result: CopyTextResult) => void;
  return {
    copy: vi.fn(
      () =>
        new Promise<CopyTextResult>((complete) => {
          resolve = complete;
        }),
    ),
    resolve: (result) => resolve(result),
  };
}

describe('NodeSummaryCopyAction', () => {
  it('copies only after activation, preserves focus, and reports success', async () => {
    const summaryText = 'Name: chapter\nKind: DTD element declaration';
    const copySummaryText = vi.fn(copied);
    render(NodeSummaryCopyAction, {
      summaryText,
      targetKey: 'project:chapter:1',
      copySummaryText,
    });
    const button = screen.getByRole('button', { name: 'Copy node summary' });
    const status = document.querySelector('[data-node-summary-copy-status]')!;

    expect(copySummaryText).not.toHaveBeenCalled();
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-atomic', 'true');
    button.focus();
    await fireEvent.click(button);

    expect(copySummaryText).toHaveBeenCalledOnce();
    expect(copySummaryText).toHaveBeenCalledWith(summaryText);
    expect(button).toHaveFocus();
    expect(status).toHaveTextContent('Copied node summary');
  });

  it('keeps one stable polite status and reports both failure modes exactly', async () => {
    const copySummaryText = vi
      .fn<CopyText>()
      .mockResolvedValueOnce({ succeeded: false, reason: 'failed' })
      .mockResolvedValueOnce({ succeeded: false, reason: 'unavailable' })
      .mockResolvedValueOnce({ succeeded: true });
    render(NodeSummaryCopyAction, {
      summaryText: 'Name: node',
      targetKey: 'project:node:1',
      copySummaryText,
    });
    const button = screen.getByRole('button', { name: 'Copy node summary' });
    const status = document.querySelector('[data-node-summary-copy-status]')!;

    await fireEvent.click(button);
    expect(status).toHaveTextContent("Couldn't copy node summary");
    await fireEvent.click(button);
    expect(status).toHaveTextContent('Copy unavailable');
    await fireEvent.click(button);
    expect(status).toHaveTextContent('Copied node summary');
    expect(
      document.querySelectorAll('[data-node-summary-copy-status]'),
    ).toHaveLength(1);
  });

  it('clears feedback on target and availability changes and ignores stale writes', async () => {
    const pending = deferredCopy();
    const rendered = render(NodeSummaryCopyAction, {
      summaryText: 'Name: first',
      targetKey: 'project:first:1',
      copySummaryText: pending.copy,
    });
    await fireEvent.click(
      screen.getByRole('button', { name: 'Copy node summary' }),
    );

    await rendered.rerender({
      summaryText: 'Name: second',
      targetKey: 'project:second:1',
      copySummaryText: pending.copy,
    });
    expect(statusRegion()).toHaveTextContent('');
    pending.resolve({ succeeded: true });
    await Promise.resolve();
    expect(statusRegion()).toHaveTextContent('');
    expect(screen.queryByText('Copied node summary')).not.toBeInTheDocument();

    await rendered.rerender({
      summaryText: 'Name: second',
      targetKey: 'project:second:1',
      copySummaryText: vi.fn(copied),
    });
    await fireEvent.click(
      screen.getByRole('button', { name: 'Copy node summary' }),
    );
    expect(statusRegion()).toHaveTextContent('Copied node summary');
    await rendered.rerender({
      summaryText: 'Name: second',
      targetKey: 'replacement-project:second:2',
      copySummaryText: vi.fn(copied),
    });
    expect(statusRegion()).toHaveTextContent('');

    await rendered.rerender({
      summaryText: undefined,
      targetKey: 'project:second:2',
      copySummaryText: pending.copy,
    });
    expect(
      screen.queryByRole('button', { name: 'Copy node summary' }),
    ).not.toBeInTheDocument();
    expect(statusRegion()).not.toBeInTheDocument();
  });

  it('reuses the shared clipboard helper without a private clipboard path', () => {
    expect(nodeSummaryCopyActionSource).toContain(
      "import { copyText, type CopyText } from '../source/copyText';",
    );
    expect(nodeSummaryCopyActionSource).not.toContain('navigator.clipboard');
    expect(nodeSummaryCopyActionSource).not.toContain('writeText(');
    expect(nodeSummaryCopyActionSource).toContain('<button');
    expect(nodeSummaryCopyActionSource).toContain('button:focus-visible');
    expect(nodeSummaryCopyActionSource).toContain(
      '@media (forced-colors: active)',
    );
    expect(nodeSummaryCopyActionSource).not.toMatch(/animation:|transition:/u);
  });
});
