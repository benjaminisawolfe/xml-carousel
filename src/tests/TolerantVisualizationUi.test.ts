import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/svelte';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../app/App.svelte';
import { activeProjectStore } from '../app/stores/projectStore';
import { replaceProjectSession } from '../app/stores/projectSession';
import {
  bookDtdNodeIds,
  bookDtdProject,
} from '../schema/samples/bookDtdProject';
import mixedDtd from '../../tests/fixtures/dtd/visualization/mixed-supported-unsupported.dtd?raw';
import mixedXsd from '../../tests/fixtures/xsd/visualization/mixed-supported-unsupported.xsd?raw';
import brokenDtd from '../../tests/fixtures/dtd/broken.dtd?raw';

function restoreSample(): void {
  const result = replaceProjectSession({
    project: bookDtdProject,
    initialFocusNodeId: bookDtdNodeIds.book,
    metadata: {
      origin: 'sample',
      sourceFilename: 'book.dtd',
      visualizationCompleteness: 'complete',
      visualizationSummary: {
        completeness: 'complete',
        totalFindingCount: 0,
        retainedFindingCount: 0,
        omittedConstructCount: 0,
        placeholderCount: 0,
      },
      visualizationFindings: [],
    },
  });
  if (!result.applied) throw new Error('Expected sample restoration to apply.');
}

function schemaFile(name: string, sourceText: string): File {
  const file = new File([sourceText], name, { type: 'application/xml' });
  Object.defineProperty(file, 'text', {
    configurable: true,
    value: () => Promise.resolve(sourceText),
  });
  return file;
}

async function select(
  container: HTMLElement,
  format: 'dtd' | 'xsd',
  name: string,
  sourceText: string,
): Promise<void> {
  const input = container.querySelector<HTMLInputElement>(
    `#${format}-file-input`,
  );
  if (!input) throw new Error(`Expected ${format} input.`);
  await fireEvent.change(input, {
    target: { files: [schemaFile(name, sourceText)] },
  });
  const open = await screen.findByRole('button', {
    name: format === 'dtd' ? 'Open DTD' : 'Open XSD',
  });
  await waitFor(() => expect(open).toBeEnabled());
}

beforeEach(restoreSample);
afterEach(() => {
  restoreSample();
  vi.restoreAllMocks();
});

describe('tolerant visualization notice integration', () => {
  it('opens a complete DTD and preserves it under a later failed attempt', async () => {
    const { container } = render(App);
    await select(container, 'dtd', 'mixed.dtd', mixedDtd);

    expect(container.querySelector('[data-schema-import-warning]')).toBeNull();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const complete = get(activeProjectStore);
    expect(complete.visualizationCompleteness).toBe('complete');
    expect(complete.visualizationFindings).toEqual([]);
    expect(complete.project.nodes.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['root', 'child', 'id', 'author', 'png', 'logo']),
    );

    await select(container, 'dtd', 'broken.dtd', brokenDtd);
    expect(screen.getByRole('alert')).toBeVisible();
    expect(container.querySelector('[data-schema-import-warning]')).toBeNull();
    expect(get(activeProjectStore)).toBe(complete);

    await fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss import error' }),
    );
    expect(container.querySelector('[data-schema-import-warning]')).toBeNull();
    expect(get(activeProjectStore)).toBe(complete);
    const problems = screen.getByRole('button', {
      name: /Open retained problem report for broken\.dtd, \d+ problems?/,
    });
    expect(problems).toBeVisible();
    await fireEvent.click(problems);
    const dialog = await screen.findByRole('dialog', {
      name: 'Problems in broken.dtd',
    });
    expect(dialog).not.toHaveTextContent('mixed.dtd');
    await fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'Close problems for broken.dtd',
      }),
    );
    await waitFor(() => expect(problems).toHaveFocus());

    expect(problems).toBeVisible();
    expect(get(activeProjectStore).visualizationCompleteness).toBe('complete');
  });

  it('opens supported XSD siblings around unsupported components without a red failure', async () => {
    const { container } = render(App);
    await select(container, 'xsd', 'mixed.xsd', mixedXsd);

    expect(
      container.querySelector('[data-schema-import-warning]'),
    ).toHaveTextContent('Project loaded with limited visualization');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const active = get(activeProjectStore);
    expect(active.visualizationCompleteness).toBe('partial');
    expect(active.visualizationSummary?.totalFindingCount).toBe(1);
    expect(active.project.nodes.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['before', 'after', 'Label', 'Choice']),
    );
    expect(active.sourceMarkupByNodeId).not.toEqual({});
  });
});
