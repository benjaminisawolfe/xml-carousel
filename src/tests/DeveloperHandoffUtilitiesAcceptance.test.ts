import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/svelte';
import { get, writable } from 'svelte/store';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../app/App.svelte';
import { inspectorStore } from '../app/stores/inspectorStore';
import { navigationStore } from '../app/stores/navigationStore';
import { activeProjectStore } from '../app/stores/projectStore';
import { replaceProjectSession } from '../app/stores/projectSession';
import {
  createSourceViewStore,
  type SourceViewOrigin,
} from '../app/stores/sourceViewStore';
import { semanticZoomStore } from '../app/stores/semanticZoomStore';
import type {
  SchemaProject,
  SchemaSourceMarkupByNodeId,
} from '../schema/model';
import {
  bookDtdImportResult,
  bookDtdNodeIds,
  bookDtdProject,
} from '../schema/samples/bookDtdProject';
import type { InspectorSummary } from '../ui/inspector/inspectorSummary';
import { formatNodeSummary } from '../ui/presentation/nodeSummaryPresentation';
import {
  presentSourceLocation,
  selectSourceViewPresentation,
  type SourceViewPresentation,
} from '../ui/presentation/sourceMarkupPresentation';
import SourceViewDialog from '../ui/source/SourceViewDialog.svelte';
import { copyText, type CopyTextResult } from '../ui/source/copyText';

const exactDtd =
  '<!-- owner -->\r\n\t<!ELEMENT root (child*)>\r\n<!ATTLIST root id ID #IMPLIED>\r\n';
const secondDtd = '<!ATTLIST root role (main|aside) "main">';

const project: SchemaProject = {
  id: 'handoff-acceptance',
  displayName: 'Handoff acceptance',
  sourceFiles: [{ id: 'source:dtd', filename: 'fixture.dtd' }],
  nodes: [
    {
      id: 'root',
      kind: 'dtdElement',
      name: 'root',
      sourceFileId: 'source:dtd',
    },
  ],
  edges: [],
  rootNodeIds: ['root'],
};

const markup: SchemaSourceMarkupByNodeId = {
  root: {
    syntax: 'dtd',
    fragments: [
      {
        id: 'root:declaration',
        sourceFileId: 'source:dtd',
        range: {
          start: { offset: 0, line: 8, column: 3 },
          end: { offset: exactDtd.length, line: 11, column: 1 },
          sourceId: 'source:dtd',
        },
        text: exactDtd,
      },
      {
        id: 'root:separate-attlist',
        sourceFileId: 'source:dtd',
        range: {
          start: { offset: 200, line: 20, column: 1 },
          end: { offset: 200 + secondDtd.length, line: 20, column: 45 },
          sourceId: 'source:dtd',
        },
        text: secondDtd,
      },
    ],
  },
};

function presentation(
  overrides: Partial<SourceViewPresentation> = {},
): SourceViewPresentation {
  return {
    projectId: project.id,
    nodeId: 'root',
    displayName: 'root',
    nodeKind: 'dtdElement',
    nodeKindLabel: 'DTD element declaration',
    sourceIdentity: {
      kind: 'standaloneFilename',
      label: 'fixture.dtd',
    },
    location: {
      kind: 'exactLineColumn',
      line: 8,
      column: 3,
      label: 'Line 8, column 3 · exact',
    },
    syntax: 'dtd',
    fragments: [
      {
        id: 'root:declaration',
        text: exactDtd,
        location: {
          kind: 'exactLineColumn',
          line: 8,
          column: 3,
          label: 'Line 8, column 3 · exact',
        },
      },
    ],
    sourceAvailable: true,
    ...overrides,
  };
}

function summary(overrides: Partial<InspectorSummary> = {}): InspectorSummary {
  return {
    nodeId: 'root',
    displayName: 'root',
    kind: 'dtdElement',
    overviewProperties: [],
    showRelatedNodeKinds: true,
    isSchemaOverview: false,
    declarations: [],
    orderedDestinations: [],
    relatedDefinitions: [],
    attributes: [],
    globalAttributes: [],
    enumerationValues: [],
    documentation: [],
    appInfo: [],
    comments: [],
    incomingRelationships: [],
    unresolvedReferences: [],
    isStructuralLeaf: true,
    hasStructuralDestinations: false,
    ...overrides,
  };
}

function restoreSample(): void {
  const result = replaceProjectSession({
    project: bookDtdProject,
    initialFocusNodeId: bookDtdNodeIds.book,
    metadata: {
      origin: 'sample',
      sourceFilename: 'sample.book.dtd',
      ...(bookDtdImportResult.status === 'success'
        ? {
            sourceMarkupByNodeId: bookDtdImportResult.sourceMarkupByNodeId,
            commentsByNodeId: bookDtdImportResult.commentsByNodeId,
            dtdAttributesByNodeId: bookDtdImportResult.dtdAttributesByNodeId,
          }
        : {}),
    },
  });
  if (!result.applied) throw new Error('Expected sample restoration to apply.');
}

function installClipboard(
  writeText: (text: string) => Promise<void>,
): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  return () => {
    if (descriptor) Object.defineProperty(navigator, 'clipboard', descriptor);
    else delete (navigator as { clipboard?: Clipboard }).clipboard;
  };
}

afterEach(() => {
  restoreSample();
  inspectorStore.close();
  semanticZoomStore.reset();
  vi.restoreAllMocks();
});

describe('Developer Handoff Utilities acceptance contract', () => {
  it('keeps identity and location truthful across standalone and package presentations', () => {
    const standalone = selectSourceViewPresentation(
      {
        project,
        origin: 'imported',
        sourceFilename: 'fixture.dtd',
        sourceMarkupByNodeId: markup,
        xsdMetadataByNodeId: {},
      },
      'root',
    );
    const longRelativePath = `schemas/${'nested/'.repeat(24)}fixture.dtd`;
    const packaged = selectSourceViewPresentation(
      {
        project,
        origin: 'package',
        sourceFilename: 'E:\\private\\project.zip',
        schemaPackageSources: [
          {
            sourceFileId: 'source:dtd',
            archiveEntryId: 'entry:dtd',
            archivePath: `archive/${longRelativePath}`,
            packageRelativePath: longRelativePath,
            format: 'dtd',
            sourceOrder: 0,
            byteLength: exactDtd.length + secondDtd.length,
            nodeCount: 1,
            rootNodeIds: ['root'],
            initialFocusNodeId: 'root',
          },
        ],
        sourceMarkupByNodeId: markup,
        xsdMetadataByNodeId: {},
      },
      'root',
    );
    const unsafePackage = selectSourceViewPresentation(
      {
        project,
        origin: 'package',
        sourceFilename: '/private/project.zip',
        schemaPackageSources: [
          {
            sourceFileId: 'source:dtd',
            archiveEntryId: 'unsafe',
            archivePath: 'C:\\private\\fixture.dtd',
            packageRelativePath: 'C:\\private\\fixture.dtd',
            format: 'dtd',
            sourceOrder: 0,
            byteLength: exactDtd.length,
            nodeCount: 1,
            rootNodeIds: ['root'],
            initialFocusNodeId: 'root',
          },
        ],
        sourceMarkupByNodeId: markup,
        xsdMetadataByNodeId: {},
      },
      'root',
    );

    expect(standalone).toMatchObject({
      sourceIdentity: { kind: 'standaloneFilename', label: 'fixture.dtd' },
      location: {
        kind: 'multipleFragments',
        label: 'Multiple retained source fragments',
      },
    });
    expect(packaged?.sourceIdentity).toEqual({
      kind: 'packageRelativePath',
      label: longRelativePath,
    });
    expect(JSON.stringify(packaged)).not.toMatch(/[A-Za-z]:\\|\/private\//u);
    expect(unsafePackage?.sourceIdentity).toBeUndefined();
    expect(unsafePackage?.location.kind).toBe('multipleFragments');

    expect([
      presentSourceLocation({ kind: 'exactLineColumn', line: 4, column: 2 }),
      presentSourceLocation({ kind: 'exactLine', line: 4 }),
      presentSourceLocation({ kind: 'approximateDeclaration' }),
      presentSourceLocation({
        kind: 'locationUnavailable',
        sourceKnown: true,
      }),
      presentSourceLocation({
        kind: 'locationUnavailable',
        sourceKnown: false,
      }),
    ]).toEqual([
      {
        kind: 'exactLineColumn',
        line: 4,
        column: 2,
        label: 'Line 4, column 2 · exact',
      },
      {
        kind: 'exactLine',
        line: 4,
        label: 'Line 4 · exact line; column unavailable',
      },
      {
        kind: 'approximateDeclaration',
        label: 'Declaration-level location · approximate',
      },
      {
        kind: 'locationUnavailable',
        label: 'Source file known; declaration location unavailable',
      },
      {
        kind: 'locationUnavailable',
        label: 'Declaration location unavailable',
      },
    ]);
  });

  it.each<SourceViewOrigin>(['focused-card', 'inspector', 'search-result'])(
    'keeps source-view state independent for the %s origin',
    (origin) => {
      const navigation = writable({ path: ['root'], focus: 'root' });
      const inspection = writable({ nodeId: 'other' });
      const search = writable({ query: 'root', resultOrder: ['root'] });
      const zoom = writable('overview');
      const snapshotIndependentState = () => [
        get(navigation),
        get(inspection),
        get(search),
        get(zoom),
      ];
      const snapshots = snapshotIndependentState();
      const sourceView = createSourceViewStore(project, {
        projectId: project.id,
      });

      expect(
        sourceView.open(
          { projectId: project.id, nodeId: 'root', sourceAvailable: true },
          origin,
        ),
      ).toMatchObject({ applied: true });
      expect(get(sourceView)).toEqual({
        projectId: project.id,
        nodeId: 'root',
        origin,
      });
      expect(snapshotIndependentState()).toEqual(snapshots);

      expect(sourceView.resetForProject('replacement')).toMatchObject({
        applied: true,
        state: { projectId: 'replacement' },
      });
      expect(snapshotIndependentState()).toEqual(snapshots);
      expect(
        sourceView.open(
          { projectId: project.id, nodeId: 'root', sourceAvailable: true },
          origin,
        ),
      ).toMatchObject({ applied: false, reason: 'projectMismatch' });
    },
  );

  it('copies exact source and deterministic bounded summary as distinct payloads', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(() =>
      Promise.resolve(),
    );
    const sourcePresentation = presentation();
    const relationships = Array.from({ length: 25 }, (_, order) => ({
      relationshipId: `edge:${order}`,
      nodeId: `node:${order}`,
      displayName: `child ${order}`,
      kind: 'dtdElement' as const,
      occurrence: order % 2 === 0 ? '*' : '',
      order,
      disposition: order === 0 ? ('terminalCycleClosure' as const) : undefined,
      targetJourneyPosition: order === 0 ? 999 : undefined,
    }));
    const semanticSummary = summary({
      orderedDestinations: relationships,
      documentation: [
        {
          id: 'doc:2',
          text: 'later',
          displayText: 'later',
          isEmpty: false,
          order: 2,
        },
        {
          id: 'doc:1',
          text: ' first\n documentation ',
          displayText: ' first\n documentation ',
          isEmpty: false,
          order: 1,
        },
      ],
    });
    const changedJourney = summary({
      ...semanticSummary,
      orderedDestinations: relationships.map((relationship) => ({
        ...relationship,
        disposition: 'advance' as const,
        targetJourneyPosition: 42,
      })),
    });
    const formatted = formatNodeSummary(semanticSummary, sourcePresentation);

    expect(formatNodeSummary(changedJourney, sourcePresentation)).toBe(
      formatted,
    );
    expect(formatted).toContain('child 19; +5 more');
    expect(formatted).toContain('Documentation: first documentation (+1 more)');
    expect(formatted).not.toMatch(/edge:|node:|\n\n|\n$/u);
    expect(await copyText(exactDtd, { writeText })).toEqual({
      succeeded: true,
    });
    expect(await copyText(formatted, { writeText })).toEqual({
      succeeded: true,
    });
    expect(writeText.mock.calls).toEqual([[exactDtd], [formatted]]);
    expect(formatted).not.toBe(exactDtd);
    expect(await copyText('source', undefined)).toEqual({
      succeeded: false,
      reason: 'unavailable',
    });
    expect(
      await copyText('source', {
        writeText: () => Promise.reject(new Error('denied')),
      }),
    ).toEqual({ succeeded: false, reason: 'failed' });
  });

  it('renders retained fragments inertly and permits only explicit per-fragment copies', async () => {
    const hostile = '<script>bad()</script>\n<img src=x onerror=bad()> & < >';
    const fragments = [
      { ...presentation().fragments[0]!, text: hostile },
      {
        id: 'second',
        text: secondDtd,
        location: {
          kind: 'exactLineColumn' as const,
          line: 20,
          column: 1,
          label: 'Line 20, column 1 · exact',
        },
      },
    ];
    const copySourceText = vi.fn((): Promise<CopyTextResult> =>
      Promise.resolve({ succeeded: true }),
    );
    const request = vi.spyOn(globalThis, 'fetch');
    render(SourceViewDialog, {
      open: true,
      presentation: presentation({
        location: {
          kind: 'multipleFragments',
          label: 'Multiple retained source fragments',
        },
        fragments,
      }),
      copySourceText,
    });
    const dialog = await screen.findByRole('dialog', { name: 'root' });

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.querySelector('script')).toBeNull();
    expect(dialog.querySelector('img')).toBeNull();
    expect(
      within(dialog).queryByRole('button', { name: 'Copy source' }),
    ).toBeNull();
    const copyButtons = within(dialog).getAllByRole('button', {
      name: /Copy source fragment/u,
    });
    expect(copySourceText).not.toHaveBeenCalled();
    await fireEvent.click(copyButtons[0]!);
    await fireEvent.click(copyButtons[1]!);
    expect(copySourceText.mock.calls).toEqual([[hostile], [secondDtd]]);
    expect(request).not.toHaveBeenCalled();
  });

  it('preserves Search, focus, inspection, and zoom while source and summary actions run', async () => {
    restoreSample();
    const writeText = vi.fn<(text: string) => Promise<void>>(() =>
      Promise.resolve(),
    );
    const restoreClipboard = installClipboard(writeText);
    const request = vi.spyOn(globalThis, 'fetch');
    try {
      render(App);
      const searchbox = screen.getByRole('searchbox', {
        name: 'Search schema',
      });
      await fireEvent.input(searchbox, { target: { value: 'chapter' } });
      expect(inspectorStore.inspect(bookDtdNodeIds.chapter).applied).toBe(true);
      const beforeNavigation = get(navigationStore);
      const beforeInspection = get(inspectorStore);
      const beforeZoom = get(semanticZoomStore);
      const summaryAction = await screen.findByRole('button', {
        name: 'Copy node summary',
      });

      await fireEvent.click(summaryAction);
      const sourceAction = within(
        screen.getByRole('complementary', { name: 'Schema inspector' }),
      ).getByRole('button', { name: 'View source for chapter' });
      await fireEvent.click(sourceAction);
      const dialog = await screen.findByRole('dialog', { name: 'chapter' });
      await fireEvent.click(
        within(dialog).getByRole('button', { name: 'Copy source' }),
      );
      await fireEvent.click(
        within(dialog).getByRole('button', {
          name: 'Close source for chapter',
        }),
      );

      await waitFor(() => expect(sourceAction).toHaveFocus());
      expect(writeText).toHaveBeenCalledTimes(2);
      expect(writeText.mock.calls[0]![0]).toMatch(/^Name: chapter\nKind:/u);
      expect(writeText.mock.calls[1]![0]).toContain('<!ELEMENT chapter');
      expect(writeText.mock.calls[1]![0]).not.toBe(writeText.mock.calls[0]![0]);
      expect(searchbox).toHaveValue('chapter');
      expect(
        screen.getByRole('heading', { name: 'Search results' }),
      ).toBeVisible();
      expect(get(navigationStore)).toEqual(beforeNavigation);
      expect(get(inspectorStore)).toEqual(beforeInspection);
      expect(get(semanticZoomStore)).toEqual(beforeZoom);
      expect(get(activeProjectStore).project.id).toBe(bookDtdProject.id);
      expect(request).not.toHaveBeenCalled();
    } finally {
      request.mockRestore();
      restoreClipboard();
    }
  });
});
