import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { SchemaSetOutlinePresentation } from '../presentation/schemaSetOutlinePresentation';
import SchemaSetOutline from './SchemaSetOutline.svelte';
import source from './SchemaSetOutline.svelte?raw';

function presentation(): SchemaSetOutlinePresentation {
  const rootCandidates: SchemaSetOutlinePresentation['rootCandidates'] = [
    {
      id: 'schema-package-entry:entities/abilities.xsd',
      archivePath: 'schemas/entities/abilities.xsd',
      normalizedPath: 'schemas/entities/abilities.xsd',
      packageRelativePath: 'entities/abilities.xsd',
      basename: 'abilities.xsd',
      kind: 'xsd-source',
      classificationReason: 'XSD schema source',
      originalOrder: 0,
      deterministicOrder: 0,
      byteLength: 128,
      compressedByteLength: 96,
      textStatus: 'text',
      sourceViewAvailable: true,
      standardsStatus: 'accepted-schema-source',
      visualizationStatus: 'complete',
      nodeCount: 1,
      searchDocumentCount: 2,
      sourceMarkupCount: 1,
      dependencyCount: 0,
      dependentCount: 0,
      unresolvedRelationshipCount: 0,
      blockedRelationshipCount: 0,
      dependencies: [],
      dependents: [],
      rootCandidate: true,
      rootCandidateReason:
        'Unreferenced schema root or deterministic cycle representative',
      selectedEntry: true,
      sharedDependency: false,
    },
    {
      id: 'schema-package-entry:entities/advancement-activities.xsd',
      archivePath: 'schemas/entities/advancement-activities.xsd',
      normalizedPath: 'schemas/entities/advancement-activities.xsd',
      packageRelativePath: 'entities/advancement-activities.xsd',
      basename: 'advancement-activities.xsd',
      kind: 'xsd-source',
      classificationReason: 'XSD schema source',
      originalOrder: 1,
      deterministicOrder: 1,
      byteLength: 256,
      compressedByteLength: 160,
      textStatus: 'text',
      sourceViewAvailable: true,
      standardsStatus: 'accepted-schema-source',
      visualizationStatus: 'complete',
      nodeCount: 1,
      searchDocumentCount: 2,
      sourceMarkupCount: 1,
      dependencyCount: 0,
      dependentCount: 0,
      unresolvedRelationshipCount: 0,
      blockedRelationshipCount: 0,
      dependencies: [],
      dependents: [],
      rootCandidate: true,
      rootCandidateReason: 'Selected archive entry',
      selectedEntry: false,
      sharedDependency: false,
    },
    {
      id: 'schema-package-entry:very-long-path',
      archivePath:
        'schemas/very-long-unbroken-directory-name/another-long-directory-name/root-candidate-with-a-long-filename.xsd',
      normalizedPath:
        'schemas/very-long-unbroken-directory-name/another-long-directory-name/root-candidate-with-a-long-filename.xsd',
      packageRelativePath:
        'very-long-unbroken-directory-name/another-long-directory-name/root-candidate-with-a-long-filename.xsd',
      basename: 'root-candidate-with-a-long-filename.xsd',
      kind: 'xsd-source',
      classificationReason: 'XSD schema source',
      originalOrder: 2,
      deterministicOrder: 2,
      byteLength: 384,
      compressedByteLength: 224,
      textStatus: 'text',
      sourceViewAvailable: true,
      standardsStatus: 'accepted-schema-source',
      visualizationStatus: 'complete',
      nodeCount: 1,
      searchDocumentCount: 2,
      sourceMarkupCount: 1,
      dependencyCount: 0,
      dependentCount: 0,
      unresolvedRelationshipCount: 0,
      blockedRelationshipCount: 0,
      dependencies: [],
      dependents: [],
      rootCandidate: true,
      rootCandidateReason: 'Independent schema root',
      selectedEntry: false,
      sharedDependency: false,
    },
  ];
  const ignoredEntry: SchemaSetOutlinePresentation['entryGroups'][number]['entries'][number] =
    {
      ...rootCandidates[0]!,
      id: 'schema-package-entry:README.txt',
      archivePath: 'schemas/README.txt',
      normalizedPath: 'schemas/README.txt',
      packageRelativePath: 'README.txt',
      basename: 'README.txt',
      kind: 'ignored',
      classificationReason: 'Not a supported schema source',
      originalOrder: 3,
      deterministicOrder: 3,
      standardsStatus: 'not-a-schema-source',
      visualizationStatus: 'ignored',
      nodeCount: 0,
      searchDocumentCount: 1,
      sourceMarkupCount: 0,
      rootCandidate: false,
      selectedEntry: false,
    };
  const directoryEntry: SchemaSetOutlinePresentation['entryGroups'][number]['entries'][number] =
    {
      ...rootCandidates[0]!,
      id: 'schema-package-entry:schemas',
      archivePath: 'schemas/',
      normalizedPath: 'schemas',
      packageRelativePath: '',
      basename: 'schemas',
      kind: 'directory',
      classificationReason: 'ZIP directory entry',
      originalOrder: 4,
      deterministicOrder: 4,
      textStatus: 'unavailable',
      sourceViewAvailable: false,
      standardsStatus: 'not-independently-validated',
      visualizationStatus: 'not-applicable',
      nodeCount: 0,
      searchDocumentCount: 1,
      sourceMarkupCount: 0,
      rootCandidate: false,
      selectedEntry: false,
    };

  return {
    packageId: 'schema-package:example-schemas.zip',
    archiveFilename: 'example-schemas.zip',
    packageType: 'ZIP archive',
    packageRoot: '/',
    commonRoot: 'No single common root',
    summary: {
      entryCount: 3,
      fileCount: 2,
      directoryCount: 1,
      schemaSourceCount: 1,
      xsdSourceCount: 1,
      dtdSourceCount: 0,
      auxiliaryCount: 0,
      ignoredCount: 1,
      blockedCount: 0,
      rootCandidateCount: rootCandidates.length,
      completeFileCount: 1,
      zeroNodeSourceCount: 0,
      unresolvedRelationshipCount: 0,
    },
    entryGroups: [
      {
        id: 'schema-sources',
        label: 'Schema sources',
        entries: [rootCandidates[2]!],
      },
      {
        id: 'ignored-entries',
        label: 'Ignored entries',
        entries: [ignoredEntry],
      },
      {
        id: 'directories',
        label: 'Directories',
        entries: [directoryEntry],
      },
    ],
    rootCandidates,
    sourceCount: 2,
    unresolvedReferenceCount: 1,
    statusText: '2 schema files · 1 unresolved reference',
    sources: [
      {
        sourceFileId: 'schema-package-source:one',
        filename: 'schemas/a-very-long-directory-name/root.xsd',
        format: 'xsd',
        formatLabel: 'XSD',
        sourceOrder: 0,
        nodeCount: 2,
        rootCount: 1,
        unresolvedReferenceCount: 1,
        groups: [
          {
            id: 'group:first',
            label: 'Document elements',
            nodes: [
              {
                nodeId: 'schema-package-node:root',
                displayName: 'root',
                kind: 'globalElement',
                kindLabel: 'Global element',
                sourceFileId: 'schema-package-source:one',
                groupId: 'group:first',
                beginNewJourney: true,
              },
            ],
          },
        ],
        unresolvedReferences: [
          {
            id: 'unresolved:one',
            sourceNodeId: 'schema-package-node:root',
            raw: '<t:Missing>',
            kindLabel: 'Type reference',
            reasonLabel: 'Not found',
            explanation:
              'No matching declaration was found in this ZIP package.',
            ownerDisplayName: 'root',
            candidateCount: 0,
            line: 3,
            column: 9,
          },
        ],
      },
      {
        sourceFileId: 'schema-package-source:two',
        filename: 'legacy/book.dtd',
        format: 'dtd',
        formatLabel: 'DTD',
        sourceOrder: 1,
        nodeCount: 1,
        rootCount: 1,
        unresolvedReferenceCount: 0,
        groups: [
          {
            id: 'group:second',
            label: 'Root elements',
            nodes: [
              {
                nodeId: 'schema-package-node:book',
                displayName: 'book',
                kind: 'dtdElement',
                kindLabel: 'DTD element',
                sourceFileId: 'schema-package-source:two',
                groupId: 'group:second',
                beginNewJourney: false,
              },
            ],
          },
        ],
        unresolvedReferences: [],
      },
    ],
  };
}

async function activateNativeButtonWithKeyboard(
  button: HTMLButtonElement,
  key: 'Enter' | ' ',
): Promise<void> {
  button.focus();
  await fireEvent.keyDown(button, { key });
  if (key === 'Enter') await fireEvent.click(button);
  await fireEvent.keyUp(button, { key });
  if (key === ' ') await fireEvent.click(button);
}

describe('SchemaSetOutline', () => {
  it('exposes four independent accessible disclosures with the required defaults and keyboard activation', async () => {
    const expected = presentation();
    const { container } = render(SchemaSetOutline, {
      props: {
        projectId: 'package-project',
        presentation: expected,
        onCenterNode: vi.fn(),
        onInspectNode: vi.fn(),
        onCenterUnresolvedOwner: vi.fn(),
      },
    });
    const root = screen.getByRole('button', {
      name: 'Root schema candidates, 3 items',
    }) as HTMLButtonElement;
    const schemas = screen.getByRole('button', {
      name: 'Schema sources, 1 item',
    });
    const ignored = screen.getByRole('button', {
      name: 'Ignored entries, 1 item',
    }) as HTMLButtonElement;
    const directories = screen.getByRole('button', {
      name: 'Directories, 1 item',
    });
    const controls = [root, schemas, ignored, directories];
    const initialStates = ['false', 'false', 'false', 'false'];

    controls.forEach((control, index) => {
      expect(control.tagName).toBe('BUTTON');
      expect(control).toHaveAttribute('type', 'button');
      expect(control).toHaveAttribute('aria-expanded', initialStates[index]);
      const panelId = control.getAttribute('aria-controls');
      expect(panelId).toBeTruthy();
      expect(container.querySelector(`#${panelId}`)).not.toBeNull();
      expect(control.querySelector('.disclosure-chevron')).toHaveAttribute(
        'aria-hidden',
        'true',
      );
    });

    const rootPanel = container.querySelector<HTMLElement>(
      `#${root.getAttribute('aria-controls')}`,
    )!;
    const schemaPanel = container.querySelector<HTMLElement>(
      `#${schemas.getAttribute('aria-controls')}`,
    )!;
    const ignoredPanel = container.querySelector<HTMLElement>(
      `#${ignored.getAttribute('aria-controls')}`,
    )!;
    const directoryPanel = container.querySelector<HTMLElement>(
      `#${directories.getAttribute('aria-controls')}`,
    )!;
    expect(rootPanel).toHaveAttribute('hidden');
    expect(schemaPanel).toHaveAttribute('hidden');
    expect(ignoredPanel).toHaveAttribute('hidden');
    expect(directoryPanel).toHaveAttribute('hidden');
    expect(schemaPanel.querySelector('.entry-path')).not.toBeVisible();
    expect(ignoredPanel.querySelector('.entry-path')).not.toBeVisible();

    await activateNativeButtonWithKeyboard(root, 'Enter');
    expect(root).toHaveAttribute('aria-expanded', 'true');
    expect(rootPanel).not.toHaveAttribute('hidden');
    expect(schemas).toHaveAttribute('aria-expanded', 'false');
    expect(document.activeElement).toBe(root);

    await activateNativeButtonWithKeyboard(ignored, ' ');
    expect(ignored).toHaveAttribute('aria-expanded', 'true');
    expect(ignoredPanel).not.toHaveAttribute('hidden');
    expect(root).toHaveAttribute('aria-expanded', 'true');
    expect(schemas).toHaveAttribute('aria-expanded', 'false');
    expect(document.activeElement).toBe(ignored);

    await activateNativeButtonWithKeyboard(
      schemas as HTMLButtonElement,
      'Enter',
    );
    expect(schemas).toHaveAttribute('aria-expanded', 'true');
    expect(schemaPanel).not.toHaveAttribute('hidden');
    expect(schemaPanel.querySelector('.entry-path')).toBeVisible();
    expect(root).toHaveAttribute('aria-expanded', 'true');
    expect(ignored).toHaveAttribute('aria-expanded', 'true');
    expect(document.activeElement).toBe(schemas);

    await fireEvent.click(schemas);
    expect(schemas).toHaveAttribute('aria-expanded', 'false');
    expect(schemaPanel).toHaveAttribute('hidden');
    expect(schemaPanel.querySelector('.entry-path')).not.toBeVisible();
    expect(root).toHaveAccessibleName('Root schema candidates, 3 items');
    expect(schemas).toHaveAccessibleName('Schema sources, 1 item');
    expect(ignored).toHaveAccessibleName('Ignored entries, 1 item');
    expect(directories).toHaveAccessibleName('Directories, 1 item');
  });

  it('preserves disclosure state within a package and resets it for a new activation', async () => {
    const props = {
      projectId: 'package-project',
      projectRevision: 1,
      presentation: presentation(),
      currentFocusNodeId: 'schema-package-node:root',
      inspectedNodeId: undefined,
      currentSourceFileId: 'schema-package-source:one',
      onCenterNode: vi.fn(),
      onInspectNode: vi.fn(),
      onCenterUnresolvedOwner: vi.fn(),
    };
    const rendered = render(SchemaSetOutline, { props });
    const root = screen.getByRole('button', {
      name: 'Root schema candidates, 3 items',
    });
    const schemas = screen.getByRole('button', {
      name: 'Schema sources, 1 item',
    });
    const rootPaths = () =>
      [...document.querySelectorAll('.root-candidate-path')].map(
        (path) => path.textContent,
      );
    const initialOrder = rootPaths();

    await fireEvent.click(root);
    expect(root).toHaveAttribute('aria-expanded', 'true');
    expect(schemas).toHaveAttribute('aria-expanded', 'false');

    await rendered.rerender({
      ...props,
      presentation: presentation(),
      currentFocusNodeId: 'schema-package-node:book',
      inspectedNodeId: 'schema-package-node:root',
      currentSourceFileId: 'schema-package-source:two',
    });
    expect(root).toHaveAttribute('aria-expanded', 'true');
    expect(schemas).toHaveAttribute('aria-expanded', 'false');
    expect(rootPaths()).toEqual(initialOrder);
    expect(new Set(rootPaths()).size).toBe(initialOrder.length);

    await rendered.rerender({ ...props, projectRevision: 2 });
    expect(root).toHaveAttribute('aria-expanded', 'false');
    expect(schemas).toHaveAttribute('aria-expanded', 'false');

    await fireEvent.click(
      screen.getByRole('button', { name: 'Directories, 1 item' }),
    );
    await rendered.rerender({
      ...props,
      projectId: 'different-package-project',
      projectRevision: 2,
    });
    expect(
      screen.getByRole('button', { name: 'Root schema candidates, 3 items' }),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.getByRole('button', { name: 'Schema sources, 1 item' }),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.getByRole('button', { name: 'Directories, 1 item' }),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(rootPaths()).toEqual(initialOrder);
  });

  it('stacks complete package-entry metadata beneath a subordinate path identity', () => {
    const expected = presentation();
    const entry = expected.entryGroups[0]!.entries[0]!;
    const { container } = render(SchemaSetOutline, {
      props: {
        projectId: 'package-project',
        presentation: expected,
        onCenterNode: vi.fn(),
        onInspectNode: vi.fn(),
        onCenterUnresolvedOwner: vi.fn(),
      },
    });

    const inventoryHeading = screen.getByRole('heading', {
      level: 3,
      name: 'Complete package inventory',
    });
    const groupHeading = screen.getByRole('heading', {
      level: 4,
      name: 'Schema sources',
    });
    expect(inventoryHeading).toBeVisible();
    expect(groupHeading).toBeVisible();

    const card = container.querySelector<HTMLElement>(
      `[data-package-entry-id="${entry.id}"]`,
    )!;
    const path = card.querySelector('.entry-path');
    expect(path).toHaveTextContent(entry.archivePath);
    expect(path?.tagName).toBe('SPAN');
    expect(within(card).queryByRole('button')).toBeNull();

    const metadata = card.querySelector('.package-entry-metadata');
    expect(metadata?.tagName).toBe('DL');
    const fields = [...(metadata?.querySelectorAll(':scope > div') ?? [])];
    const expectedLabels = [
      'Archive path',
      'Normalized project path',
      'Path relative to project root',
      'Entry kind',
      'Size',
      'Compressed size',
      'Original ZIP order',
      'Deterministic order',
      'Text state',
      'Standards status',
      'Visualization status',
      'Normalized nodes',
      'Search documents',
      'Source-markup records',
      'Dependencies',
      'Dependents',
      'Missing relationships',
      'Blocked relationships',
      'Root candidate',
      'Selected entry',
      'Shared dependency',
    ];
    expect(
      fields.map((field) => field.querySelector('dt')?.textContent),
    ).toEqual(expectedLabels);
    for (const field of fields) {
      const label = field.querySelector('dt');
      const value = field.querySelector('dd');
      expect(label).not.toBeNull();
      expect(value).not.toBeNull();
      expect(label?.nextElementSibling).toBe(value);
      expect(value?.textContent?.trim()).not.toBe('');
    }
    expect(fields[0]?.querySelector('dd')).toHaveTextContent(entry.archivePath);
    expect(fields[1]?.querySelector('dd')).toHaveTextContent(
      entry.normalizedPath,
    );
    expect(fields[2]?.querySelector('dd')).toHaveTextContent(
      entry.packageRelativePath,
    );
    expect(source).toContain('.package-entry-metadata > div');
    expect(source).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(source).toContain('text-align: left');
    expect(source).toContain('word-break: normal');
    expect(source).not.toContain('.entry-details dl > div');
  });

  it('groups complete ordered root candidates in a static accessible card list', async () => {
    const expected = presentation();
    const { container } = render(SchemaSetOutline, {
      props: {
        projectId: 'package-project',
        presentation: expected,
        onCenterNode: vi.fn(),
        onInspectNode: vi.fn(),
        onCenterUnresolvedOwner: vi.fn(),
      },
    });

    const rootToggle = screen.getByRole('button', {
      name: 'Root schema candidates, 3 items',
    });
    await fireEvent.click(rootToggle);
    const region = screen.getByRole('region', {
      name: 'Root schema candidates',
    });
    expect(
      within(region).getByRole('heading', {
        level: 4,
        name: 'Root schema candidates',
      }),
    ).toBeVisible();
    const list = within(region).getByRole('list');
    const cards = within(list).getAllByRole('listitem');
    expect(cards).toHaveLength(expected.summary.rootCandidateCount);
    expect(
      cards.map((card) => card.querySelector('code')?.textContent),
    ).toEqual(
      expected.rootCandidates.map(
        ({ packageRelativePath }) => packageRelativePath,
      ),
    );
    expect(cards.map((card) => card.querySelector('p')?.textContent)).toEqual(
      expected.rootCandidates.map(
        ({ rootCandidateReason }) => rootCandidateReason,
      ),
    );
    for (const card of cards) {
      expect(card).toHaveClass('root-candidate-card');
      expect(card.querySelector('code')).toHaveClass('root-candidate-path');
      expect(card.querySelector('p')).toHaveClass('root-candidate-reason');
      expect(within(card).queryByRole('button')).toBeNull();
    }
    expect(region.textContent).not.toContain('—');
    expect(container.querySelectorAll('.root-candidate-card')).toHaveLength(
      expected.rootCandidates.length,
    );
    expect(source).toContain('font-style: italic');
    expect(source).toContain('.root-candidate-path');
    expect(source).toContain('overflow-wrap: anywhere');
  });

  it('renders ordered source sections, summary, states, and safe unresolved data', () => {
    const onCenterNode = vi.fn();
    const onInspectNode = vi.fn();
    const onCenterUnresolvedOwner = vi.fn();
    const { container } = render(SchemaSetOutline, {
      props: {
        projectId: 'package-project',
        presentation: presentation(),
        currentFocusNodeId: 'schema-package-node:book',
        inspectedNodeId: 'schema-package-node:root',
        currentSourceFileId: 'schema-package-source:two',
        onCenterNode,
        onInspectNode,
        onCenterUnresolvedOwner,
      },
    });

    expect(screen.getByText('example-schemas.zip')).toBeVisible();
    expect(
      screen.getByText('2 schema files · 1 unresolved reference'),
    ).toBeVisible();
    expect(screen.getByText('1 unresolved reference remains')).toBeVisible();
    const toggles = screen.getAllByRole('button', {
      name: /root\.xsd|book\.dtd/,
    });
    expect(toggles.map((button) => button.textContent)).toEqual([
      expect.stringContaining('schemas/a-very-long-directory-name/root.xsd'),
      expect.stringContaining('legacy/book.dtd'),
    ]);
    expect(toggles[0]).toHaveAttribute('aria-expanded', 'true');
    expect(toggles[1]).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('book')).toHaveAttribute('aria-current', 'true');
    expect(
      screen.getByRole('button', { name: 'root is currently inspected' }),
    ).toBeVisible();
    expect(screen.getByText('<t:Missing>')).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Document elements' }),
    ).toHaveAttribute('data-outline-section-heading');
    expect(
      screen.getByRole('heading', {
        level: 3,
        name: 'Unresolved references',
      }),
    ).toHaveAttribute('data-outline-section-heading');
    expect(container.textContent).not.toContain('schema-package-source:');
    expect(container.textContent).not.toContain('schema-package-node:');
    expect(source).toContain('min-height: var(--control-min-size)');
    expect(source).toContain('overflow-wrap: anywhere');
  });

  it('supports manual expansion and resets it for a project-session revision', async () => {
    const props = {
      projectId: 'package-project',
      projectRevision: 1,
      presentation: presentation(),
      currentFocusNodeId: 'schema-package-node:book',
      inspectedNodeId: 'schema-package-node:root',
      currentSourceFileId: 'schema-package-source:two',
      onCenterNode: vi.fn(),
      onInspectNode: vi.fn(),
      onCenterUnresolvedOwner: vi.fn(),
    };
    const rendered = render(SchemaSetOutline, { props });
    const rootToggle = screen.getByRole('button', { name: /root\.xsd/ });

    await fireEvent.click(rootToggle);
    expect(screen.getByRole('button', { name: /root\.xsd/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await rendered.rerender({ ...props, projectRevision: 2 });
    expect(screen.getByRole('button', { name: /root\.xsd/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('keeps centre, inspect, and unresolved-owner controls separate', async () => {
    const onCenterNode = vi.fn();
    const onInspectNode = vi.fn();
    const onCenterUnresolvedOwner = vi.fn();
    render(SchemaSetOutline, {
      props: {
        projectId: 'package-project',
        presentation: presentation(),
        currentFocusNodeId: 'schema-package-node:book',
        inspectedNodeId: 'schema-package-node:root',
        currentSourceFileId: 'schema-package-source:two',
        onCenterNode,
        onInspectNode,
        onCenterUnresolvedOwner,
      },
    });

    await fireEvent.click(
      screen.getByRole('button', { name: 'Center root, Global element' }),
    );
    await fireEvent.click(
      screen.getByRole('button', { name: 'root is currently inspected' }),
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Centre owner' }));
    await fireEvent.click(
      screen.getByRole('button', { name: 'Inspect owner' }),
    );

    expect(onCenterNode).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: 'root', beginNewJourney: true }),
    );
    expect(onInspectNode).toHaveBeenNthCalledWith(
      1,
      'schema-package-node:root',
    );
    expect(onInspectNode).toHaveBeenNthCalledWith(
      2,
      'schema-package-node:root',
    );
    expect(onCenterUnresolvedOwner).toHaveBeenCalledWith(
      expect.objectContaining({ raw: '<t:Missing>' }),
    );
    for (const button of screen.getAllByRole('button')) {
      expect(within(button).queryByRole('button')).toBeNull();
    }
  });
});
