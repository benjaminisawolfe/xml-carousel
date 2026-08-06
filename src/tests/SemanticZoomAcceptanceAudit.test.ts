import { readFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { render, screen, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import App from '../app/App.svelte';
import { importSchemaArchivePackage } from '../app/import/schemaPackage';
import { inspectorStore } from '../app/stores/inspectorStore';
import { navigationStore } from '../app/stores/navigationStore';
import { replaceProjectSession } from '../app/stores/projectSession';
import {
  createSemanticZoomStore,
  isSemanticZoomDesktopViewport,
  SEMANTIC_ZOOM_DESKTOP_MEDIA_QUERY,
  SEMANTIC_ZOOM_LEVELS,
  semanticZoomStore,
} from '../app/stores/semanticZoomStore';
import { importDtdSource } from '../schema/dtd';
import {
  getOutgoingStructuralRelationships,
  type SchemaProject,
} from '../schema/model';
import {
  bookDtdNodeIds,
  bookDtdProject,
} from '../schema/samples/bookDtdProject';
import { importXsdSource } from '../schema/xsd';
import contextCardSource from '../ui/carousel/ContextCard.svelte?raw';
import focusCardSource from '../ui/carousel/FocusCard.svelte?raw';
import relationshipLinesComponentSource from '../ui/carousel/SemanticZoomRelationshipLines.svelte?raw';
import semanticZoomControlSource from '../ui/carousel/SemanticZoomControl.svelte?raw';
import {
  getBranchWindow,
  getRootwardWindow,
  MAX_LEAFWARD_CARDS,
  MAX_OVERVIEW_EARLIER_PATH_ROWS,
  MAX_OVERVIEW_LEAFWARD_CARDS,
} from '../ui/carousel/carouselWindowing';
import {
  buildLeafwardRelationshipLines,
  buildRootwardJourneyLines,
} from '../ui/carousel/semanticZoomRelationshipGeometry';
import {
  SEMANTIC_ZOOM_MAXIMUM_SCALE,
  SEMANTIC_ZOOM_MAXIMUM_TRANSLATION_PX,
  SEMANTIC_ZOOM_MINIMUM_SCALE,
  SEMANTIC_ZOOM_TRANSITION_DURATION_MS,
  calculateSemanticZoomInverseTransform,
} from '../ui/carousel/semanticZoomTransition';
import branchingDtdSource from '../../tests/fixtures/keyboard-navigation/branching-navigation.dtd?raw';
import branchingXsdSource from '../../tests/fixtures/keyboard-navigation/branching-navigation.xsd?raw';
import relationshipLinesFixtureSource from '../../tests/fixtures/semantic-zoom/relationship-lines.xsd?raw';
import lifecycleHarnessSource from '../../scripts/audit-standards-engine-lifecycle.mjs?raw';

const fixtureRoot = path.resolve('tests/fixtures');
const hermeticFixturePaths = [
  'project-root/shared/rich-text.xsd',
  'project-root/shared/common.xsd',
  'project-root/entity.xsd',
  'project-root/entities/character.xsd',
] as const;

const acceptanceMatrix = Object.freeze({
  presentations: ['full', 'compact', 'overview'],
  formats: ['dtd', 'xsd', 'zip', 'hermetic-foundry'],
  graphShapes: [
    'structural-leaf',
    'single-leafward-destination',
    'small-branch-fan',
    'dense-compact-branch-fan',
    'dense-overview-branch-fan',
    'deep-rootward-journey',
    'shared-destination',
    'duplicate-visible-edges',
    'terminal-cycle-closure',
    'long-display-name',
    'mixed-node-kinds',
    'schema-package-overview',
  ],
  navigation: [
    'direct-card',
    'pointer-leafward',
    'pointer-rootward',
    'pointer-vertical-branch',
    'spatial-keyboard',
    'search-centre',
    'search-inspect',
    'previous-step',
    'earlier-path-jump',
    'side-window-button',
    'side-window-wheel',
  ],
  controls: [
    'zoom-in-button',
    'zoom-out-button',
    'range-pointer',
    'range-keyboard',
    'control-wheel',
    'rapid-input',
    'reverse-transition',
    'full-to-overview',
  ],
  environments: [
    'normal-motion',
    'reduced-motion',
    'forced-colours',
    'text-125',
    'text-150',
    'text-200',
    'reflow-400',
    'navigation-panel-open-closed',
    'inspector-open-closed',
  ],
});

interface ProjectCase {
  readonly format: (typeof acceptanceMatrix.formats)[number];
  readonly filename: string;
  readonly project: SchemaProject;
  readonly initialFocusNodeId: string;
}

let projectCases: readonly ProjectCase[] = [];

function dtdProject(source: string, filename: string): ProjectCase {
  const result = importDtdSource(source, {
    projectId: `acceptance:${filename}`,
    displayName: filename,
    sourceFileId: `acceptance:${filename}:source`,
    sourceFilename: filename,
  });
  if (result.status !== 'success')
    throw new Error(`Could not import ${filename}.`);
  return {
    format: 'dtd',
    filename,
    project: result.project,
    initialFocusNodeId: result.initialFocusNodeId,
  };
}

function xsdProject(source: string, filename: string): ProjectCase {
  const result = importXsdSource(source, {
    projectId: `acceptance:${filename}`,
    displayName: filename,
    sourceFileId: `acceptance:${filename}:source`,
    sourceFilename: filename,
  });
  if (result.status !== 'success')
    throw new Error(`Could not import ${filename}.`);
  return {
    format: 'xsd',
    filename,
    project: result.project,
    initialFocusNodeId: result.initialFocusNodeId,
  };
}

async function hermeticArchiveBytes(): Promise<Uint8Array> {
  const archive = new JSZip();
  for (const relativePath of hermeticFixturePaths) {
    archive.file(
      relativePath,
      await readFile(
        path.join(
          fixtureRoot,
          'hermetic-foundry/synthetic-project',
          relativePath,
        ),
        'utf8',
      ),
      { createFolders: false, date: new Date('2000-01-01T00:00:00.000Z') },
    );
  }
  return archive.generateAsync({ type: 'uint8array', compression: 'STORE' });
}

async function packageProject(
  format: 'zip' | 'hermetic-foundry',
  filename: string,
  data: Uint8Array,
): Promise<ProjectCase> {
  const result = await importSchemaArchivePackage({ filename, data });
  if (result.status !== 'success')
    throw new Error(`Could not import ${filename}.`);
  return {
    format,
    filename,
    project: result.project,
    initialFocusNodeId: result.initialFocusNodeId,
  };
}

class ControlledMediaQueryList implements MediaQueryList {
  readonly media: string;
  matches: boolean;
  onchange:
    ((this: MediaQueryList, ev: MediaQueryListEvent) => unknown) | null = null;
  readonly addListener = vi.fn();
  readonly removeListener = vi.fn();
  readonly addEventListener = vi.fn();
  readonly removeEventListener = vi.fn();
  readonly dispatchEvent = vi.fn(() => true);

  constructor(media: string, matches: boolean) {
    this.media = media;
    this.matches = matches;
  }
}

function installEligibleDesktop(): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(
      (query: string) =>
        new ControlledMediaQueryList(
          query,
          query === SEMANTIC_ZOOM_DESKTOP_MEDIA_QUERY,
        ),
    ),
  );
}

function activateProject(projectCase: ProjectCase): void {
  const result = replaceProjectSession({
    project: projectCase.project,
    initialFocusNodeId: projectCase.initialFocusNodeId,
    metadata: { origin: 'imported', sourceFilename: projectCase.filename },
  });
  if (!result.applied)
    throw new Error(`Could not activate ${projectCase.filename}.`);
}

function restoreSample(): void {
  const result = replaceProjectSession({
    project: bookDtdProject,
    initialFocusNodeId: bookDtdNodeIds.book,
    metadata: { origin: 'sample', sourceFilename: 'book.dtd' },
  });
  if (!result.applied) throw new Error('Could not restore the sample project.');
}

beforeAll(async () => {
  const zipBytes = new Uint8Array(
    await readFile(path.join(fixtureRoot, 'zip/valid-xsd-include.zip')),
  );
  projectCases = [
    dtdProject(branchingDtdSource, 'branching-navigation.dtd'),
    xsdProject(branchingXsdSource, 'branching-navigation.xsd'),
    await packageProject('zip', 'valid-xsd-include.zip', zipBytes),
    await packageProject(
      'hermetic-foundry',
      'synthetic-hermetic-foundry.zip',
      await hermeticArchiveBytes(),
    ),
  ];
}, 30_000);

afterEach(() => {
  restoreSample();
  inspectorStore.close();
  semanticZoomStore.reset();
  semanticZoomStore.setDesktopAvailability(false);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('final semantic zoom acceptance matrix', () => {
  it('binds every required matrix axis to a durable named category', () => {
    expect(acceptanceMatrix.presentations).toEqual(SEMANTIC_ZOOM_LEVELS);
    expect(acceptanceMatrix.formats).toEqual([
      'dtd',
      'xsd',
      'zip',
      'hermetic-foundry',
    ]);
    expect(acceptanceMatrix.graphShapes).toHaveLength(12);
    expect(acceptanceMatrix.navigation).toHaveLength(11);
    expect(acceptanceMatrix.controls).toHaveLength(8);
    expect(acceptanceMatrix.environments).toHaveLength(9);
    expect(JSON.stringify(acceptanceMatrix)).not.toMatch(
      /history-private|file:/u,
    );
  });

  it('imports every required public format and keeps semantic zoom out of project data', () => {
    expect(projectCases.map(({ format }) => format)).toEqual(
      acceptanceMatrix.formats,
    );
    for (const projectCase of projectCases) {
      expect(projectCase.project.nodes.length).toBeGreaterThan(0);
      expect(projectCase.project.rootNodeIds.length).toBeGreaterThan(0);
      expect(JSON.stringify(projectCase.project)).not.toMatch(
        /requestedLevel|effectiveLevel|semanticZoom/u,
      );
    }
  });

  it('preserves requested level, project identity, and navigation across every format', () => {
    const zoom = createSemanticZoomStore();
    zoom.setDesktopAvailability(true);
    zoom.setRequestedLevel('overview');

    for (const projectCase of projectCases) {
      activateProject(projectCase);
      const pathBefore = [...get(navigationStore.navigationPathIds)];
      const projectBefore = projectCase.project;
      zoom.setDesktopAvailability(false);
      expect(get(zoom)).toMatchObject({
        requestedLevel: 'overview',
        effectiveLevel: 'full',
      });
      zoom.setDesktopAvailability(true);
      expect(get(zoom).effectiveLevel).toBe('overview');
      expect(projectCase.project).toBe(projectBefore);
      expect(get(navigationStore.navigationPathIds)).toEqual(pathBefore);
    }
  });

  it('renders Full, Compact, and Overview without mutating the active project', async () => {
    installEligibleDesktop();
    activateProject(projectCases[0]!);
    const project = projectCases[0]!.project;
    const rendered = render(App);

    for (const level of SEMANTIC_ZOOM_LEVELS) {
      semanticZoomStore.setRequestedLevel(level);
      await waitFor(() =>
        expect(
          document.querySelector('[data-carousel-gesture-viewport]'),
        ).toHaveAttribute('data-semantic-zoom-presentation', level),
      );
      expect(
        screen.getByRole('slider', { name: 'Semantic zoom' }),
      ).toHaveAttribute(
        'aria-valuetext',
        level === 'full'
          ? 'Full detail'
          : level[0]!.toUpperCase() + level.slice(1),
      );
      expect(projectCases[0]!.project).toBe(project);
    }

    expect(
      document.querySelector('[data-semantic-zoom-focus-card]'),
    ).toHaveTextContent('catalog');
    rendered.unmount();
  });

  it('proves public dense, recursive, leaf, mixed-kind, and package graph coverage', () => {
    const dtd = projectCases.find(({ format }) => format === 'dtd')!;
    const xsd = projectCases.find(({ format }) => format === 'xsd')!;
    const zip = projectCases.find(({ format }) => format === 'zip')!;
    const hermetic = projectCases.find(
      ({ format }) => format === 'hermetic-foundry',
    )!;
    const dtdRoot = dtd.project.nodes.find(({ name }) => name === 'catalog')!;
    const dtdRelationships = getOutgoingStructuralRelationships(
      dtd.project,
      dtdRoot.id,
    );

    expect(dtdRelationships.length).toBeGreaterThan(MAX_LEAFWARD_CARDS);
    expect(dtd.project.nodes.some(({ name }) => name === 'leaf')).toBe(true);
    expect(
      dtd.project.edges.some(
        ({ sourceNodeId, targetNodeId }) => sourceNodeId === targetNodeId,
      ),
    ).toBe(true);
    expect(
      new Set(xsd.project.nodes.map(({ kind }) => kind)).size,
    ).toBeGreaterThan(2);
    expect(zip.project.sourceFiles?.length).toBeGreaterThan(1);
    expect(hermetic.project.sourceFiles?.length).toBe(4);
  });

  it('keeps dense leafward and deep rootward DOM work bounded by presentation', () => {
    const dense = Array.from({ length: 10_000 }, (_, index) => index);
    expect(
      getBranchWindow(dense, 0, dense.length, 'compact').visible,
    ).toHaveLength(MAX_LEAFWARD_CARDS);
    expect(
      getBranchWindow(dense, 0, dense.length, 'overview').visible,
    ).toHaveLength(MAX_OVERVIEW_LEAFWARD_CARDS);
    expect(
      getRootwardWindow(dense, 0, dense.length + 1, dense.length, 'overview')
        .earlierSteps,
    ).toHaveLength(MAX_OVERVIEW_EARLIER_PATH_ROWS);
  });

  it('directly imports the 10,000-node DTD with isolated bounded zoom behaviour', async () => {
    const filename = 'large-10000.dtd';
    const projectCase = dtdProject(
      await readFile(path.join(fixtureRoot, 'dtd', filename), 'utf8'),
      filename,
    );
    expect(projectCase.project.nodes.length).toBeGreaterThanOrEqual(10_000);

    const nodeIds = projectCase.project.nodes.map(({ id }) => id);
    expect(
      getBranchWindow(nodeIds, 0, nodeIds.length, 'compact').visible,
    ).toHaveLength(MAX_LEAFWARD_CARDS);
    expect(
      getBranchWindow(nodeIds, 0, nodeIds.length, 'overview').visible,
    ).toHaveLength(MAX_OVERVIEW_LEAFWARD_CARDS);

    const projectBefore = projectCase.project;
    activateProject(projectCase);
    semanticZoomStore.setDesktopAvailability(true);
    const pathBefore = [...get(navigationStore.navigationPathIds)];
    for (const level of SEMANTIC_ZOOM_LEVELS) {
      semanticZoomStore.setRequestedLevel(level);
      expect(get(semanticZoomStore).effectiveLevel).toBe(level);
      expect(projectCase.project).toBe(projectBefore);
      expect(get(navigationStore.navigationPathIds)).toEqual(pathBefore);
    }
  }, 120_000);

  it('directly imports the 10,000-node XSD with isolated bounded zoom behaviour', async () => {
    const filename = 'large-10000.xsd';
    const projectCase = xsdProject(
      await readFile(path.join(fixtureRoot, 'xsd', filename), 'utf8'),
      filename,
    );
    expect(projectCase.project.nodes.length).toBeGreaterThanOrEqual(10_000);

    const nodeIds = projectCase.project.nodes.map(({ id }) => id);
    expect(
      getBranchWindow(nodeIds, 0, nodeIds.length, 'compact').visible,
    ).toHaveLength(MAX_LEAFWARD_CARDS);
    expect(
      getBranchWindow(nodeIds, 0, nodeIds.length, 'overview').visible,
    ).toHaveLength(MAX_OVERVIEW_LEAFWARD_CARDS);

    const projectBefore = projectCase.project;
    activateProject(projectCase);
    semanticZoomStore.setDesktopAvailability(true);
    const pathBefore = [...get(navigationStore.navigationPathIds)];
    for (const level of SEMANTIC_ZOOM_LEVELS) {
      semanticZoomStore.setRequestedLevel(level);
      expect(get(semanticZoomStore).effectiveLevel).toBe(level);
      expect(projectCase.project).toBe(projectBefore);
      expect(get(navigationStore.navigationPathIds)).toEqual(pathBefore);
    }
  }, 120_000);

  it('binds corrected A/B/C geometry, duplicate edge identity, gaps, and cycles', () => {
    expect(relationshipLinesFixtureSource).toContain('RelationshipLineType');
    const stage = { left: 100, top: 50, width: 900, height: 600 };
    const focus = { left: 420, top: 250, width: 180, height: 120 };
    const targets = [
      {
        edgeId: 'fixture-edge-a',
        nodeId: 'shared-node',
        visibleOrder: 0,
        terminal: false,
        box: { left: 760, top: 180, width: 160, height: 80 },
      },
      {
        edgeId: 'fixture-edge-b',
        nodeId: 'shared-node',
        visibleOrder: 1,
        terminal: true,
        box: { left: 760, top: 300, width: 160, height: 80 },
      },
    ];
    const stateA = buildLeafwardRelationshipLines(stage, focus, targets);
    const stateB = buildRootwardJourneyLines(stage, [
      {
        nodeId: 'previous',
        journeyPosition: 0,
        role: 'previous',
        box: { left: 140, top: 250, width: 180, height: 80 },
      },
      { nodeId: 'focus', journeyPosition: 1, role: 'focus', box: focus },
    ]);
    const stateC = buildLeafwardRelationshipLines(stage, focus, targets);

    expect(stateA.map(({ key }) => key)).toEqual([
      'leafward:fixture-edge-a',
      'leafward:fixture-edge-b',
    ]);
    expect(stateA[1]).toMatchObject({ terminal: true });
    expect(stateB).toHaveLength(1);
    expect(stateC).toEqual(stateA);
    expect(
      buildRootwardJourneyLines(stage, [
        {
          nodeId: 'gap-a',
          journeyPosition: 0,
          role: 'history',
          box: { left: 140, top: 100, width: 100, height: 60 },
        },
        {
          nodeId: 'gap-c',
          journeyPosition: 2,
          role: 'previous',
          box: { left: 140, top: 250, width: 100, height: 60 },
        },
      ]),
    ).toEqual([]);
  });

  it('locks transition bounds and responsive availability to accepted values', () => {
    expect(SEMANTIC_ZOOM_TRANSITION_DURATION_MS).toBe(180);
    expect(SEMANTIC_ZOOM_MAXIMUM_TRANSLATION_PX).toBe(160);
    expect(SEMANTIC_ZOOM_MINIMUM_SCALE).toBe(0.82);
    expect(SEMANTIC_ZOOM_MAXIMUM_SCALE).toBe(1.18);
    expect(
      calculateSemanticZoomInverseTransform(
        { left: -1000, top: -1000, width: 100, height: 100 },
        { left: 1000, top: 1000, width: 80, height: 120 },
      ),
    ).toMatchObject({ deltaX: -160, deltaY: -160, usesScale: true });

    for (const [width, height, available] of [
      [1440, 900, true],
      [1280, 720, true],
      [1280, 600, true],
      [1100, 600, true],
      [1024, 768, true],
      [1024, 600, true],
      [1024, 599, false],
      [1023, 600, false],
      [768, 900, false],
      [412, 915, false],
      [390, 844, false],
      [915, 412, false],
      [844, 390, false],
      [320, 800, false],
    ] as const) {
      expect(isSemanticZoomDesktopViewport(width, height)).toBe(available);
    }
  });

  it('locks accessibility, reflow, native input, and forced-colour contracts', () => {
    expect(semanticZoomControlSource).toContain('aria-label="Semantic zoom"');
    expect(semanticZoomControlSource).toContain('type="range"');
    expect(semanticZoomControlSource).toContain(
      'aria-valuetext={currentLabel}',
    );
    expect(semanticZoomControlSource).toContain('min-width: 72px');
    expect(semanticZoomControlSource).toContain('touch-action: manipulation');
    expect(semanticZoomControlSource).toContain(
      '@container carousel (max-width: 760px)',
    );
    expect(semanticZoomControlSource).toContain(
      '@container carousel (max-width: 460px)',
    );
    expect(semanticZoomControlSource).toContain(
      '@media (forced-colors: active)',
    );
    expect(contextCardSource).toContain('border-left: 4px dotted CanvasText');
    expect(contextCardSource).toContain('border-right: 4px solid LinkText');
    expect(contextCardSource).toContain('border-right: 4px double Highlight');
    expect(relationshipLinesComponentSource).toContain('stroke-dasharray: 2 4');
    expect(relationshipLinesComponentSource).toContain('stroke-dasharray: 9 4');
    expect(focusCardSource).toContain('overflow-wrap: anywhere');
    expect(lifecycleHarnessSource).toContain(
      "keys: ['+', '-', '0'].map(dispatchKey)",
    );
    expect(lifecycleHarnessSource).toContain('[400, 320, 640]');
  });

  it('keeps browser evidence tied to cleanup and zero-network assertions', () => {
    for (const contract of [
      'noExternalRequests',
      'noFileRequests',
      'noLiveWorkersBetweenImports',
      'noPageErrors',
      'noConsoleWarningsOrErrors',
      'semanticZoomUxHardening',
      'relationshipLineRegression',
      'liveWorkers',
    ]) {
      expect(lifecycleHarnessSource).toContain(contract);
    }
    expect(lifecycleHarnessSource).toContain("options.browser === 'firefox'");
    expect(lifecycleHarnessSource).toContain("options.browser === 'chrome'");
  });
});
