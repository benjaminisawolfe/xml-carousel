import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type {
  SchemaArchiveReadableFile,
  SchemaFileFormat,
  SchemaFileImportOutcome,
  SchemaFileImportState,
  SchemaReadableFile,
} from '../../app/import/schemaFileImportController';
import TopBar from './TopBar.svelte';
import topBarSource from './TopBar.svelte?raw';
import { PROBLEM_REPORT_DIALOG_ID } from '../problems/problemReportPresentation';

const idle: SchemaFileImportState = { status: 'idle' };
type OpenFileCallback = (
  file: SchemaReadableFile,
) => Promise<SchemaFileImportOutcome>;
type OpenArchiveCallback = (
  file: SchemaArchiveReadableFile,
) => Promise<SchemaFileImportOutcome>;

function success(
  format: SchemaFileFormat,
  filename: string,
): SchemaFileImportOutcome {
  return { status: 'success', format, filename };
}

function props(
  importState: SchemaFileImportState = idle,
  onOpenDtdFile: OpenFileCallback = vi.fn(() =>
    Promise.resolve(success('dtd', 'library.dtd')),
  ),
  onOpenXsdFile: OpenFileCallback = vi.fn(() =>
    Promise.resolve(success('xsd', 'schema.xsd')),
  ),
  onOpenZipFile: OpenArchiveCallback = vi.fn(() =>
    Promise.resolve(success('zip', 'schemas.zip')),
  ),
) {
  return {
    projectIdentity: 'book.dtd',
    projectAccessibleLabel: 'Active schema project: book.dtd.',
    importState,
    onOpenDtdFile,
    onOpenXsdFile,
    onOpenZipFile,
    onToggleNavigation: vi.fn(),
    onSearchIntent: vi.fn(),
    retainedProblemCount: undefined,
    retainedProblemFilename: undefined,
    onOpenProblems: vi.fn(),
  };
}

function fileInput(
  container: HTMLElement,
  format: SchemaFileFormat,
): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(
    `#${format}-file-input`,
  );
  if (!input) throw new Error(`Expected the ${format.toUpperCase()} input.`);
  return input;
}

function setFiles(
  input: HTMLInputElement,
  file?: SchemaReadableFile | SchemaArchiveReadableFile,
): void {
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: file
      ? { 0: file, length: 1, item: () => file }
      : { length: 0, item: () => null },
  });
}

describe('coordinated schema-file top-bar controls', () => {
  it('renders enabled native Open DTD, Open XSD, and Open ZIP buttons', () => {
    render(TopBar, { props: props() });
    const banner = screen.getByRole('banner');

    expect(
      within(banner).getByRole('group', {
        name: 'Open schema file or ZIP package',
      }),
    ).toBeVisible();
    expect(
      within(banner).getByRole('button', { name: 'Open DTD' }),
    ).toBeEnabled();
    expect(
      within(banner).getByRole('button', { name: 'Open XSD' }),
    ).toBeEnabled();
    expect(
      within(banner).getByRole('button', { name: 'Open ZIP' }),
    ).toBeEnabled();
    expect(
      within(banner).getByRole('searchbox', { name: 'Search schema' }),
    ).toBeEnabled();
    expect(
      within(banner).getAllByRole('searchbox', { name: 'Search schema' }),
    ).toHaveLength(1);
    expect(
      within(banner).getByRole('button', {
        name: 'Open XML Carousel help',
      }),
    ).toBeEnabled();
    expect(within(banner).queryByText('Settings')).not.toBeInTheDocument();
    expect(
      within(banner).queryByRole('button', {
        name: /retained problem report/i,
      }),
    ).toBeNull();
  });

  it.each([
    [1, 'problem'],
    [6, 'problems'],
    [99, 'problems'],
    [510, 'problems'],
  ] as const)(
    'renders one bounded Problems (%s) dialog control with exact accessible grammar',
    async (count, noun) => {
      const onOpenProblems = vi.fn();
      const attemptedFileName =
        'a-very-long-attempted-filename-that-must-not-expand-the-top-bar.dtd';
      const { container } = render(TopBar, {
        props: {
          ...props(),
          retainedProblemCount: count,
          retainedProblemFilename: attemptedFileName,
          onOpenProblems,
        },
      });

      const button = screen.getByRole('button', {
        name: `Open retained problem report for ${attemptedFileName}, ${count} ${noun}`,
      });
      expect(
        screen.getAllByRole('button', { name: /retained problem report/i }),
      ).toHaveLength(1);
      expect(button).toHaveAttribute('aria-haspopup', 'dialog');
      expect(button).toHaveAttribute('aria-controls', PROBLEM_REPORT_DIALOG_ID);
      expect(button).not.toHaveAttribute('aria-expanded');
      expect(button.textContent).not.toContain(attemptedFileName);
      expect(container.querySelector('.full-problems-label')).toHaveTextContent(
        `Problems (${count})`,
      );
      expect(
        container.querySelector('.compact-problems-label'),
      ).toHaveTextContent(`Problems (${count})`);

      await fireEvent.click(button);
      expect(onOpenProblems).toHaveBeenCalledWith(button);
    },
  );

  it('uses three labeled hidden single-file inputs with exact accept hints', () => {
    const { container } = render(TopBar, { props: props() });
    const dtd = fileInput(container, 'dtd');
    const xsd = fileInput(container, 'xsd');
    const zip = fileInput(container, 'zip');

    expect(dtd).toHaveAttribute('accept', '.dtd,application/xml-dtd');
    expect(xsd).toHaveAttribute('accept', '.xsd,application/xml,text/xml');
    expect(zip).toHaveAttribute(
      'accept',
      '.zip,application/zip,application/x-zip-compressed',
    );
    for (const [format, input] of [
      ['DTD', dtd],
      ['XSD', xsd],
      ['ZIP schema package', zip],
    ] as const) {
      expect(input).not.toHaveAttribute('multiple');
      expect(input).toHaveAttribute('hidden');
      expect(input).toHaveAttribute('tabindex', '-1');
      expect(
        screen.getByText(
          format === 'ZIP schema package'
            ? 'Choose ZIP schema package'
            : `Choose ${format} file`,
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', {
          name: format === 'ZIP schema package' ? 'Open ZIP' : `Open ${format}`,
        }),
      ).toHaveAttribute('aria-controls', input.id);
    }
  });

  it.each([
    ['dtd', 'Open DTD'],
    ['xsd', 'Open XSD'],
    ['zip', 'Open ZIP'],
  ] as const)(
    'opens the %s native input from its button',
    async (format, name) => {
      const { container } = render(TopBar, { props: props() });
      const input = fileInput(container, format);
      const click = vi
        .spyOn(input, 'click')
        .mockImplementation(() => undefined);
      Object.defineProperty(input, 'value', {
        configurable: true,
        writable: true,
        value: 'old-selection',
      });

      await fireEvent.click(screen.getByRole('button', { name }));

      expect(input.value).toBe('');
      expect(click).toHaveBeenCalledOnce();
    },
  );

  it.each(['dtd', 'xsd', 'zip'] as const)(
    'disables every import button and marks only the active %s button busy',
    (format) => {
      render(TopBar, {
        props: props({
          status: 'reading',
          format,
          filename: `schema.${format}`,
        }),
      });

      const opening = screen.getByRole('button', {
        name: `Opening ${format.toUpperCase()}`,
      });
      const others = ['dtd', 'xsd', 'zip']
        .filter((candidate) => candidate !== format)
        .map((candidate) =>
          screen.getByRole('button', {
            name: `Open ${candidate.toUpperCase()}`,
          }),
        );
      expect(opening).toBeDisabled();
      expect(others).toHaveLength(2);
      for (const other of others) expect(other).toBeDisabled();
      expect(opening).toHaveAttribute('aria-busy', 'true');
      for (const other of others)
        expect(other).not.toHaveAttribute('aria-busy');
    },
  );

  it.each(['dtd', 'xsd', 'zip'] as const)(
    'keeps all import buttons disabled and only %s busy during worker processing',
    (format) => {
      render(TopBar, {
        props: props({
          status: 'processing',
          format,
          filename: `schema.${format}`,
          progress: {
            phase: 'preparing',
            format,
            filename: `schema.${format}`,
          },
        }),
      });
      const active = screen.getByRole('button', {
        name: `Opening ${format.toUpperCase()}`,
      });
      expect(active).toBeDisabled();
      expect(active).toHaveAttribute('aria-busy', 'true');
      for (const candidate of ['dtd', 'xsd', 'zip'] as const) {
        if (candidate === format) continue;
        const button = screen.getByRole('button', {
          name: `Open ${candidate.toUpperCase()}`,
        });
        expect(button).toBeDisabled();
        expect(button).not.toHaveAttribute('aria-busy');
      }
    },
  );

  it.each([
    ['dtd', 'library.dtd'],
    ['xsd', 'schema.xsd'],
    ['zip', 'schemas.zip'],
  ] as const)(
    'dispatches %s selection, clears it, and preserves successful focus ownership',
    async (format, filename) => {
      const focusTarget = document.createElement('h2');
      focusTarget.tabIndex = -1;
      document.body.append(focusTarget);
      const callback = (callbackFormat: SchemaFileFormat) =>
        vi.fn(async () => {
          focusTarget.focus();
          return success(callbackFormat, filename);
        });
      const onOpenDtdFile = callback('dtd');
      const onOpenXsdFile = callback('xsd');
      const onOpenZipFile = callback('zip');
      const { container } = render(TopBar, {
        props: props(idle, onOpenDtdFile, onOpenXsdFile, onOpenZipFile),
      });
      const input = fileInput(container, format);
      const file =
        format === 'zip'
          ? {
              name: filename,
              arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
            }
          : {
              name: filename,
              text: () => Promise.resolve('schema source'),
            };
      Object.defineProperty(input, 'value', {
        configurable: true,
        writable: true,
        value: filename,
      });
      setFiles(input, file);

      await fireEvent.change(input);

      expect(
        format === 'dtd'
          ? onOpenDtdFile
          : format === 'xsd'
            ? onOpenXsdFile
            : onOpenZipFile,
      ).toHaveBeenCalledWith(file);
      const callbacks = [onOpenDtdFile, onOpenXsdFile, onOpenZipFile];
      for (const callback of callbacks) {
        if (!callback.mock.calls.length)
          expect(callback).not.toHaveBeenCalled();
      }
      expect(input.value).toBe('');
      expect(focusTarget).toHaveFocus();
      focusTarget.remove();
    },
  );

  it('preserves focus ownership after a failed selection', async () => {
    const failure: SchemaFileImportOutcome = {
      status: 'failure',
      format: 'dtd',
      filename: 'broken.dtd',
      diagnostics: [],
    };
    const { container } = render(TopBar, {
      props: props(
        idle,
        vi.fn(() => Promise.resolve(failure)),
        vi.fn(),
        vi.fn(),
      ),
    });
    const input = fileInput(container, 'dtd');
    const priorFocus = document.createElement('button');
    document.body.append(priorFocus);
    priorFocus.focus();
    setFiles(input, {
      name: 'broken.dtd',
      text: () => Promise.resolve('<!ELEMENT'),
    });

    await fireEvent.change(input);

    expect(priorFocus).toHaveFocus();
    priorFocus.remove();
  });

  it.each(['dtd', 'xsd', 'zip'] as const)(
    'treats %s cancellation as a no-op and restores matching focus',
    async (format) => {
      const onOpenDtdFile = vi.fn();
      const onOpenXsdFile = vi.fn();
      const onOpenZipFile = vi.fn();
      const { container } = render(TopBar, {
        props: props(idle, onOpenDtdFile, onOpenXsdFile, onOpenZipFile),
      });
      const input = fileInput(container, format);
      setFiles(input);

      await fireEvent.change(input);

      expect(onOpenDtdFile).not.toHaveBeenCalled();
      expect(onOpenXsdFile).not.toHaveBeenCalled();
      expect(onOpenZipFile).not.toHaveBeenCalled();
      expect(
        screen.getByRole('button', {
          name: `Open ${format.toUpperCase()}`,
        }),
      ).toHaveFocus();
    },
  );

  it('keeps import targets at the shared minimum across compact layouts', () => {
    render(TopBar, { props: props() });

    expect(topBarSource).toContain('height: var(--control-min-size)');
    expect(topBarSource).toMatch(
      /\.primary-action\s*\{[^}]*min-inline-size:\s*var\(--control-min-size\);[^}]*inline-size:\s*max-content;/,
    );
    expect(topBarSource).not.toContain('min-width: max-content');
    expect(topBarSource).not.toMatch(
      /@media[^{]*\{[\s\S]*?\.primary-action\s*\{[^}]*min-(?:inline-size|width):\s*(?!var\(--control-min-size\))/,
    );
    expect(topBarSource).toContain('class="import-actions"');
    expect(topBarSource).toContain('z-index: 30');
    expect(topBarSource).toContain('@media (max-width: 699px)');
    expect(topBarSource).toContain('@media (max-width: 389px)');
    expect(topBarSource).toContain('compact-import-label');
    expect(topBarSource).toContain('compact-help-label');
    expect(topBarSource).toContain('compact-navigation-label');
    expect(topBarSource).toContain('compact-problems-label');
    expect(topBarSource).toMatch(
      /\.problems-action\s*\{[^}]*min-width:\s*var\(--control-min-size\);[^}]*min-height:\s*var\(--control-min-size\);/u,
    );
    expect(topBarSource).not.toContain('flex-wrap: wrap');
    for (const [accessibleName, compactLabel] of [
      ['Open DTD', 'DTD'],
      ['Open XSD', 'XSD'],
      ['Open ZIP', 'ZIP'],
    ] as const) {
      const button = screen.getByRole('button', { name: accessibleName });
      expect(button).toBeEnabled();
      expect(button).toHaveTextContent(compactLabel);
      expect(button).toHaveAttribute('aria-controls');
    }
    for (const button of screen.getAllByRole('button')) {
      expect(
        button.querySelector('button, input, select, textarea, a'),
      ).toBeNull();
    }
  });

  it('centres full and compact Navigation labels without weakening its target', () => {
    render(TopBar, { props: props() });

    const navigation = screen.getByRole('button', {
      name: 'Open schema navigation',
      hidden: true,
    });
    expect(navigation).toHaveTextContent('Navigation');
    expect(navigation).toHaveTextContent('Nav');
    expect(topBarSource).toMatch(
      /\.navigation-toggle\s*\{[^}]*display:\s*inline-flex;[^}]*min-width:\s*var\(--control-min-size\);[^}]*min-height:\s*var\(--control-min-size\);[^}]*align-items:\s*center;[^}]*justify-content:\s*center;[^}]*text-align:\s*center;/u,
    );
    expect(topBarSource).toMatch(
      /\.navigation-toggle\s*>\s*span\s*\{[^}]*align-items:\s*center;[^}]*justify-content:\s*center;[^}]*line-height:\s*inherit;/u,
    );
    expect(topBarSource).not.toMatch(
      /@media[\s\S]*?\.navigation-toggle[^}]*align-items:\s*(?:start|flex-start)/u,
    );
    expect(topBarSource).toContain(
      "aria-label={isNavigationOpen\n        ? 'Close schema navigation'\n        : 'Open schema navigation'}",
    );
  });

  it('shows package identity and status without internal source IDs', () => {
    const { container } = render(TopBar, {
      props: {
        ...props(),
        projectIdentity: 'example-schemas.zip',
        projectStatus: '2 schema files · 1 unresolved reference',
        projectAccessibleLabel:
          'Current schema package: example-schemas.zip. 2 schema files. 1 unresolved reference.',
      },
    });

    expect(screen.getByText('example-schemas.zip')).toBeVisible();
    expect(
      screen.getByText('2 schema files · 1 unresolved reference'),
    ).toBeVisible();
    expect(
      container.querySelector(
        '[aria-label="Current schema package: example-schemas.zip. 2 schema files. 1 unresolved reference."]',
      ),
    ).toBeInTheDocument();
    expect(container.textContent).not.toContain('schema-package-source:');
  });

  it('exposes active Navigation toggle semantics and preserves Inspector placeholder', async () => {
    const onToggleNavigation = vi.fn();
    const rendered = render(TopBar, {
      props: {
        ...props(),
        isNavigationOpen: false,
        onToggleNavigation,
      },
    });
    const toggle = screen.getByRole('button', {
      name: 'Open schema navigation',
      hidden: true,
    });

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', 'schema-navigation-panel');
    await fireEvent.click(toggle);
    expect(onToggleNavigation).toHaveBeenCalledOnce();
    await rendered.rerender({
      ...props(),
      isNavigationOpen: true,
      onToggleNavigation,
    });
    expect(
      screen.getByRole('button', {
        name: 'Close schema navigation',
        hidden: true,
      }),
    ).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByRole('button', { name: 'Inspector', hidden: true }),
    ).toBeDisabled();
  });

  it('contains no reading, parser, store mutation, or unsafe HTML', () => {
    expect(topBarSource).not.toContain('.text()');
    expect(topBarSource).not.toContain('importDtdSource');
    expect(topBarSource).not.toContain('importXsdSource');
    expect(topBarSource).not.toContain('activeProjectStore');
    expect(topBarSource).not.toContain('navigationStore');
    expect(topBarSource).not.toContain('inspectorStore');
    expect(topBarSource).not.toContain('@html');
    expect(topBarSource.match(/<SchemaSearch/g)).toHaveLength(1);
    expect(topBarSource).not.toContain('min-width: 0px');
    expect(topBarSource).not.toContain('overflow-x: visible');
  });
});
