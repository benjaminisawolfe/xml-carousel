import { derived, get } from 'svelte/store';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { importDtdSource, type DtdImportResult } from '../../schema/dtd';
import { importXsdSource, type XsdImportResult } from '../../schema/xsd';
import {
  bookDtdNodeIds,
  bookDtdProject,
} from '../../schema/samples/bookDtdProject';
import { createInspectorStore } from './inspectorStore';
import { createNavigationStore } from './navigationStore';
import {
  createProjectSession,
  type ProjectSessionDependencies,
} from './projectSession';
import {
  createActiveProjectStore,
  type ActiveProjectState,
} from './projectStore';
import { createProjectSessionResetStore } from './projectSessionResetStore';
import externalReferences from '../../../tests/fixtures/xsd/external-references.xsd?raw';
import sameDocumentReferences from '../../../tests/fixtures/xsd/same-document-references.xsd?raw';
import {
  importSchemaArchivePackage,
  type SchemaPackageImportResult,
} from '../import/schemaPackage';

const librarySource = [
  '<!ELEMENT library (shelf+)>',
  '<!ELEMENT shelf (book*)>',
  '<!ELEMENT book (title, author+)>',
  '<!ELEMENT title (#PCDATA)>',
  '<!ELEMENT author (#PCDATA)>',
].join('\n');

const attributedSource = [
  '<!ELEMENT book (#PCDATA)>',
  '<!ATTLIST book id ID #REQUIRED lang CDATA "en">',
].join('\n');

const commentedSource = [
  '<!-- before root -->',
  '<!ELEMENT root EMPTY>',
  '<!-- schema footer -->',
].join('\n');

function importSource(
  sourceText: string,
  projectId = 'test:library',
  sourceFilename = 'library.dtd',
): DtdImportResult {
  return importDtdSource(sourceText, {
    projectId,
    displayName: projectId,
    sourceFileId: `${projectId}:source`,
    sourceFilename,
  });
}

function initialActiveState(): ActiveProjectState {
  return {
    project: bookDtdProject,
    origin: 'sample',
    sourceFilename: 'book.dtd',
  };
}

function importXsd(
  sourceText = sameDocumentReferences,
  projectId = 'test:xsd-session',
  sourceFilename = 'schema.xsd',
): XsdImportResult {
  return importXsdSource(sourceText, {
    projectId,
    displayName: projectId,
    sourceFileId: `${projectId}:source`,
    sourceFilename,
  });
}

function fixture() {
  const activeProject = createActiveProjectStore(initialActiveState());
  const project = derived(activeProject, ({ project: value }) => value);
  const navigation = createNavigationStore(project, {
    projectId: bookDtdProject.id,
    navigationPath: [bookDtdNodeIds.book],
  });
  const inspector = createInspectorStore(project, {
    projectId: bookDtdProject.id,
  });
  const presentation = createProjectSessionResetStore();
  const session = createProjectSession({
    activeProject,
    navigation,
    inspector,
    presentation,
  });

  return { activeProject, navigation, inspector, presentation, session };
}

async function importedPackage() {
  const archive = new JSZip();
  archive.file(
    'schemas/root.xsd',
    `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="root" type="xs:string"/></xs:schema>`,
    {
      createFolders: false,
    },
  );
  const result = await importSchemaArchivePackage({
    filename: 'schemas.zip',
    data: await archive.generateAsync({
      type: 'uint8array',
      compression: 'STORE',
    }),
  });
  if (result.status !== 'success') {
    throw new Error('Expected package session fixture to import.');
  }
  return result;
}

function expectPlainSerializable(value: unknown): void {
  if (value === null || typeof value !== 'object') {
    expect(typeof value).not.toBe('function');
    return;
  }

  expect(value).not.toBeInstanceOf(Map);
  expect(value).not.toBeInstanceOf(Set);
  expect(value).not.toBeInstanceOf(File);
  const prototype = Object.getPrototypeOf(value);
  expect(
    Array.isArray(value) ||
      prototype === Object.prototype ||
      prototype === null,
  ).toBe(true);
  for (const child of Object.values(value)) {
    expectPlainSerializable(child);
  }
}

describe('project session replacement', () => {
  it('activates an imported project and removes all old navigation state', () => {
    const context = fixture();
    context.navigation.initializeAt(bookDtdNodeIds.chapter);
    context.inspector.inspect(bookDtdNodeIds.section);
    const result = context.session.activateImportedProject(
      importSource(librarySource),
    );

    expect(result.applied).toBe(true);
    expect(get(context.activeProject)).toMatchObject({
      origin: 'imported',
      sourceFilename: 'library.dtd',
    });
    expect(
      get(context.activeProject).project.nodes.map(({ name }) => name),
    ).toEqual(['library', 'shelf', 'book', 'title', 'author']);
    expect(get(context.navigation)).toEqual({
      projectId: 'test:library',
      navigationPath: ['dtd:element:library'],
    });
    expect(get(context.inspector)).toEqual({ projectId: 'test:library' });
    expect(get(context.navigation).navigationPath).not.toContain(
      bookDtdNodeIds.chapter,
    );
    expect(get(context.inspector)).not.toHaveProperty('inspectedNodeId');
    expect(get(context.presentation)).toEqual({
      revision: 1,
      initialFocusNodeId: 'dtd:element:library',
    });
  });

  it('retains content kinds and exposes imported carousel selectors', () => {
    const context = fixture();
    context.session.activateImportedProject(importSource(librarySource));

    expect(get(context.activeProject).contentKindsByNodeId).toMatchObject({
      'dtd:element:library': 'elementOnly',
      'dtd:element:title': 'text',
    });
    expect(get(context.navigation.currentFocusNode)?.name).toBe('library');
    expect(
      get(context.navigation.leafwardRelationships).map(({ node, edge }) => ({
        name: node.name,
        occurrence: edge.occurrence,
      })),
    ).toEqual([
      {
        name: 'shelf',
        occurrence: { min: 1, max: 'unbounded' },
      },
    ]);
  });

  it('retains imported attribute metadata without retaining parser objects', () => {
    const context = fixture();
    const imported = importSource(
      attributedSource,
      'test:attributes',
      'attributes.dtd',
    );

    context.session.activateImportedProject(imported);
    if (imported.status !== 'success') {
      throw new Error('Expected attributed import to succeed.');
    }

    const state = get(context.activeProject);
    expect(
      Object.values(state.dtdAttributesByNodeId ?? {}).map(({ name }) => name),
    ).toEqual(['id', 'lang']);
    expect(state.dtdAttributesByNodeId).toEqual(imported.dtdAttributesByNodeId);
    const serialized = JSON.stringify(state);
    expect(serialized).not.toContain('"ast"');
    expect(serialized).not.toContain('"file"');
  });

  it('retains attached and schema-level comment metadata', () => {
    const context = fixture();
    const imported = importSource(
      commentedSource,
      'test:comments',
      'comments.dtd',
    );

    context.session.activateImportedProject(imported);
    if (imported.status !== 'success') {
      throw new Error('Expected commented import to succeed.');
    }

    const state = get(context.activeProject);
    expect(state.comments).toHaveLength(2);
    expect(state.commentsByNodeId?.['dtd:element:root']).toHaveLength(1);
    expect(state.schemaLevelComments).toHaveLength(1);
    expect(state.comments).toEqual(imported.comments);
    expect(state.comments).not.toBe(imported.comments);
  });

  it('retains exact source fragments without retaining full source or parser objects', () => {
    const context = fixture();
    const imported = importSource(
      commentedSource,
      'test:source-markup',
      'source-markup.dtd',
    );

    context.session.activateImportedProject(imported);
    if (imported.status !== 'success') {
      throw new Error('Expected source-markup import to succeed.');
    }

    const state = get(context.activeProject);
    expect(
      state.sourceMarkupByNodeId?.['dtd:element:root']?.fragments.map(
        ({ text }) => text,
      ),
    ).toEqual(['<!-- before root -->\n<!ELEMENT root EMPTY>']);
    expect(state.sourceMarkupByNodeId).toEqual(imported.sourceMarkupByNodeId);
    expect(state.sourceMarkupByNodeId).not.toBe(imported.sourceMarkupByNodeId);
    const serialized = JSON.stringify(state);
    expect(serialized).not.toContain('"sourceText"');
    expect(serialized).not.toContain('"ast"');
    expect(serialized).not.toContain('"file"');
    expect(JSON.stringify(state.sourceMarkupByNodeId)).not.toContain(
      'schema footer',
    );
    expectPlainSerializable(state.sourceMarkupByNodeId);
  });

  it('uses the safe navigation, inspector, project, presentation order', () => {
    const base = fixture();
    const order: string[] = [];
    const dependencies: ProjectSessionDependencies = {
      activeProject: {
        subscribe: base.activeProject.subscribe,
        replace(project, metadata) {
          order.push('project');
          return base.activeProject.replace(project, metadata);
        },
        replaceValidated(project, metadata, ownership) {
          order.push('project');
          return base.activeProject.replaceValidated(
            project,
            metadata,
            ownership,
          );
        },
      },
      navigation: {
        resetForProject(project, nodeId) {
          order.push('navigation');
          return base.navigation.resetForProject(project, nodeId);
        },
      },
      inspector: {
        resetForProject(projectId) {
          order.push('inspector');
          return base.inspector.resetForProject(projectId);
        },
      },
      presentation: {
        subscribe: base.presentation.subscribe,
        reset(nodeId) {
          order.push('presentation');
          return base.presentation.reset(nodeId);
        },
      },
    };
    const session = createProjectSession(dependencies);

    session.activateImportedProject(importSource(librarySource));

    expect(order).toEqual([
      'navigation',
      'inspector',
      'project',
      'presentation',
    ]);
  });

  it.each([
    ['malformed', '<!ELEMENT broken (a,>', 'parse'],
    ['unresolved', '<!ELEMENT root (missing)>', 'build'],
  ])(
    'leaves every state boundary unchanged after a %s import failure',
    (_name, source, expectedStage) => {
      const context = fixture();
      context.navigation.initializeAt(bookDtdNodeIds.section);
      context.inspector.inspect(bookDtdNodeIds.section);
      const before = {
        active: get(context.activeProject),
        navigation: get(context.navigation),
        inspector: get(context.inspector),
        presentation: get(context.presentation),
      };
      const importResult = importSource(source, `test:${_name}`);
      const result = context.session.activateImportedProject(importResult);

      expect(importResult.status).toBe('failure');
      expect(importResult.diagnostics[0]?.stage).toBe(expectedStage);
      expect(result).toMatchObject({
        applied: false,
        reason: 'importFailure',
      });
      expect(get(context.activeProject)).toBe(before.active);
      expect(get(context.navigation)).toBe(before.navigation);
      expect(get(context.inspector)).toBe(before.inspector);
      expect(get(context.presentation)).toBe(before.presentation);
    },
  );

  it('swaps repeatedly without retaining prior project identities', () => {
    const context = fixture();
    context.session.activateImportedProject(importSource(librarySource));
    const sampleResult = context.session.replace({
      project: bookDtdProject,
      initialFocusNodeId: bookDtdNodeIds.book,
      metadata: {
        origin: 'sample',
        sourceFilename: 'book.dtd',
      },
    });

    expect(sampleResult.applied).toBe(true);
    expect(get(context.activeProject).project).toBe(bookDtdProject);
    expect(get(context.navigation)).toEqual({
      projectId: bookDtdProject.id,
      navigationPath: [bookDtdNodeIds.book],
    });
    expect(get(context.inspector)).toEqual({
      projectId: bookDtdProject.id,
    });
    expect(get(context.presentation).revision).toBe(2);
    expect(get(context.activeProject)).not.toHaveProperty(
      'sourceMarkupByNodeId',
    );
  });

  it('clears prior attribute metadata when an element-only project replaces it', () => {
    const context = fixture();
    context.session.activateImportedProject(
      importSource(attributedSource, 'test:attributes', 'attributes.dtd'),
    );
    expect(get(context.activeProject).dtdAttributesByNodeId).toBeDefined();

    context.session.activateImportedProject(importSource(librarySource));

    expect(get(context.activeProject)).not.toHaveProperty(
      'dtdAttributesByNodeId',
    );
  });

  it('clears prior comment metadata when a comment-free project replaces it', () => {
    const context = fixture();
    context.session.activateImportedProject(
      importSource(commentedSource, 'test:comments', 'comments.dtd'),
    );
    expect(get(context.activeProject).comments).toBeDefined();

    context.session.activateImportedProject(importSource(librarySource));

    expect(get(context.activeProject)).not.toHaveProperty('comments');
    expect(get(context.activeProject)).not.toHaveProperty('commentsByNodeId');
    expect(get(context.activeProject)).not.toHaveProperty(
      'schemaLevelComments',
    );
  });

  it('preserves comment state after a later import failure', () => {
    const context = fixture();
    context.session.activateImportedProject(
      importSource(commentedSource, 'test:comments', 'comments.dtd'),
    );
    const before = get(context.activeProject);

    context.session.activateImportedProject(
      importSource(
        '<!ELEMENT root EMPTY>\n<!-- unterminated',
        'test:broken-comments',
        'broken-comments.dtd',
      ),
    );

    expect(get(context.activeProject)).toBe(before);
    expect(before.comments).toHaveLength(2);
    expect(get(context.activeProject).sourceMarkupByNodeId).toBe(
      before.sourceMarkupByNodeId,
    );
  });

  it('replaces old source fragments completely after a successful import', () => {
    const context = fixture();
    context.session.activateImportedProject(
      importSource(commentedSource, 'test:first-source', 'first.dtd'),
    );
    expect(
      get(context.activeProject).sourceMarkupByNodeId?.['dtd:element:root'],
    ).toBeDefined();

    context.session.activateImportedProject(
      importSource(librarySource, 'test:second-source', 'second.dtd'),
    );

    const markup = get(context.activeProject).sourceMarkupByNodeId;
    expect(markup?.['dtd:element:root']).toBeUndefined();
    expect(markup?.['dtd:element:library']).toBeDefined();
    expect(JSON.stringify(markup)).not.toContain('before root');
  });

  it('preserves attributed project state after a semantic replacement failure', () => {
    const context = fixture();
    context.session.activateImportedProject(
      importSource(attributedSource, 'test:attributes', 'attributes.dtd'),
    );
    const before = get(context.activeProject);
    const failure = importSource(
      '<!ELEMENT book EMPTY>\n<!ATTLIST book id ID "invalid">',
      'test:invalid-attributes',
      'invalid-attributes.dtd',
    );

    const result = context.session.activateImportedProject(failure);

    expect(failure.status).toBe('failure');
    expect(failure.diagnostics[0]).toMatchObject({
      stage: 'build',
      code: 'invalid-id-attribute-default',
    });
    expect(result.applied).toBe(false);
    expect(get(context.activeProject)).toBe(before);
    expect(Object.keys(before.dtdAttributesByNodeId ?? {})).toHaveLength(2);
  });

  it.each([
    ['cycle', '<!ELEMENT a (b)>\n<!ELEMENT b (a)>', 'dtd:element:a', []],
    [
      'multiple roots',
      '<!ELEMENT alpha EMPTY>\n<!ELEMENT beta EMPTY>',
      'dtd:element:alpha',
      ['dtd:element:alpha', 'dtd:element:beta'],
    ],
  ])(
    'activates a %s import with its deterministic one-node journey',
    (name, source, initialFocusNodeId, roots) => {
      const context = fixture();
      const importResult = importSource(source, `test:${name}`);
      const result = context.session.activateImportedProject(importResult);

      expect(result.applied).toBe(true);
      expect(get(context.activeProject).project.rootNodeIds).toEqual(roots);
      expect(get(context.navigation).navigationPath).toEqual([
        initialFocusNodeId,
      ]);
    },
  );

  it('emits exactly one presentation/announcement reset per successful swap', () => {
    const context = fixture();
    const revisions: number[] = [];
    const unsubscribe = context.presentation.subscribe(({ revision }) => {
      revisions.push(revision);
    });

    context.session.activateImportedProject(importSource(librarySource));
    unsubscribe();

    expect(revisions).toEqual([0, 1]);
  });

  it('rejects an unknown initial focus before mutating any state', () => {
    const context = fixture();
    const before = {
      active: get(context.activeProject),
      navigation: get(context.navigation),
      inspector: get(context.inspector),
      presentation: get(context.presentation),
    };
    const result = context.session.replace({
      project: bookDtdProject,
      initialFocusNodeId: 'missing',
      metadata: { origin: 'sample', sourceFilename: 'book.dtd' },
    });

    expect(result).toEqual({
      applied: false,
      reason: 'invalidInitialFocus',
    });
    expect(get(context.activeProject)).toBe(before.active);
    expect(get(context.navigation)).toBe(before.navigation);
    expect(get(context.inspector)).toBe(before.inspector);
    expect(get(context.presentation)).toBe(before.presentation);
  });

  it('activates XSD through the shared replacement path at its selected initial focus', () => {
    const context = fixture();
    context.navigation.initializeAt(bookDtdNodeIds.chapter);
    context.inspector.inspect(bookDtdNodeIds.section);
    const imported = importXsd();
    const result = context.session.activateImportedXsdProject(imported);

    expect(result.applied).toBe(true);
    if (imported.status !== 'success') return;
    expect(get(context.activeProject)).toMatchObject({
      project: imported.project,
      origin: 'imported',
      sourceFilename: 'schema.xsd',
      xsdMetadataByNodeId: imported.xsdMetadataByNodeId,
      sourceMarkupByNodeId: imported.sourceMarkupByNodeId,
    });
    expect(get(context.navigation)).toEqual({
      projectId: imported.project.id,
      navigationPath: [imported.initialFocusNodeId],
    });
    expect(get(context.inspector)).toEqual({ projectId: imported.project.id });
    expect(get(context.presentation)).toEqual({
      revision: 1,
      initialFocusNodeId: imported.initialFocusNodeId,
    });
    expect(get(context.activeProject)).not.toHaveProperty(
      'contentKindsByNodeId',
    );
    expect(get(context.activeProject).sourceMarkupByNodeId).not.toBe(
      imported.sourceMarkupByNodeId,
    );
    const nodeId = Object.keys(imported.sourceMarkupByNodeId)[0]!;
    expect(
      get(context.activeProject).sourceMarkupByNodeId?.[nodeId]?.fragments[0]
        ?.range,
    ).not.toBe(imported.sourceMarkupByNodeId[nodeId]?.fragments[0]?.range);
  });

  it('activates warning-bearing XSD without placing diagnostics in active state', () => {
    const context = fixture();
    const imported = importXsd(
      externalReferences,
      'test:xsd-warning',
      'warning.xsd',
    );
    expect(imported.status).toBe('success');
    expect(imported.diagnostics.length).toBeGreaterThan(0);

    expect(context.session.activateImportedXsdProject(imported).applied).toBe(
      true,
    );
    expect(get(context.activeProject)).not.toHaveProperty('diagnostics');
  });

  it('preserves every state identity after a failed XSD import', () => {
    const context = fixture();
    context.session.activateImportedProject(
      importSource(commentedSource, 'test:current-dtd', 'current.dtd'),
    );
    context.navigation.initializeAt('dtd:element:root');
    context.inspector.inspect('dtd:element:root');
    const before = {
      active: get(context.activeProject),
      navigation: get(context.navigation),
      inspector: get(context.inspector),
      presentation: get(context.presentation),
    };
    const failure = importXsd(
      '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element',
      'test:broken-xsd',
      'broken.xsd',
    );
    const result = context.session.activateImportedXsdProject(failure);

    expect(result).toEqual({
      applied: false,
      reason: 'importFailure',
      importResult: failure,
    });
    expect(get(context.activeProject)).toBe(before.active);
    expect(get(context.navigation)).toBe(before.navigation);
    expect(get(context.inspector)).toBe(before.inspector);
    expect(get(context.presentation)).toBe(before.presentation);
  });

  it.each([
    ['invalid project', 'invalidProject'],
    ['invalid focus', 'invalidInitialFocus'],
  ])(
    'rejects a successful-looking XSD with %s before resets',
    (kind, reason) => {
      const context = fixture();
      const imported = importXsd();
      if (imported.status !== 'success') throw new Error('Expected success.');
      const before = {
        active: get(context.activeProject),
        navigation: get(context.navigation),
        inspector: get(context.inspector),
        presentation: get(context.presentation),
      };
      const candidate: XsdImportResult =
        kind === 'invalid project'
          ? {
              ...imported,
              project: {
                ...imported.project,
                edges: [
                  ...imported.project.edges,
                  {
                    id: 'invalid-edge',
                    kind: 'contains',
                    sourceNodeId: imported.initialFocusNodeId,
                    targetNodeId: 'missing',
                  },
                ],
              },
            }
          : { ...imported, initialFocusNodeId: 'missing' };

      const result = context.session.activateImportedXsdProject(candidate);

      expect(result).toMatchObject({ applied: false, reason });
      expect(get(context.activeProject)).toBe(before.active);
      expect(get(context.navigation)).toBe(before.navigation);
      expect(get(context.inspector)).toBe(before.inspector);
      expect(get(context.presentation)).toBe(before.presentation);
    },
  );

  it('clears XSD metadata when the compatible DTD API activates next', () => {
    const context = fixture();
    context.session.activateImportedXsdProject(importXsd());
    expect(get(context.activeProject).xsdMetadataByNodeId).toBeDefined();

    const dtdResult = context.session.activateImportedProject(
      importSource(attributedSource, 'test:dtd-after-xsd', 'after.dtd'),
    );

    expect(dtdResult.applied).toBe(true);
    expect(get(context.activeProject)).not.toHaveProperty(
      'xsdMetadataByNodeId',
    );
    expect(get(context.activeProject).dtdAttributesByNodeId).toBeDefined();
  });

  it('activates a complete package and resets each session surface once', async () => {
    const context = fixture();
    const imported = await importedPackage();
    const beforeRevision = get(context.presentation).revision;

    const result = context.session.activateImportedSchemaPackage(imported);

    expect(result.applied).toBe(true);
    const active = get(context.activeProject);
    expect(active).toEqual(
      expect.objectContaining({
        origin: 'package',
        sourceFilename: 'schemas.zip',
        schemaPackageManifest: imported.manifest,
        schemaPackageSources: imported.sources,
        unresolvedReferences: imported.unresolvedReferences,
        xsdMetadataByNodeId: imported.xsdMetadataByNodeId,
        dtdAttributesByNodeId: imported.dtdAttributesByNodeId,
      }),
    );
    expect(get(context.navigation)).toEqual(
      expect.objectContaining({
        projectId: imported.project.id,
        navigationPath: [imported.initialFocusNodeId],
      }),
    );
    expect(get(context.inspector)).toEqual({
      projectId: imported.project.id,
    });
    expect(get(context.presentation).revision).toBe(beforeRevision + 1);
    expect(() => JSON.stringify(active)).not.toThrow();
  });

  it('rejects package import failure without changing session state', () => {
    const context = fixture();
    const before = {
      active: get(context.activeProject),
      navigation: get(context.navigation),
      inspector: get(context.inspector),
      presentation: get(context.presentation),
    };
    const failure: SchemaPackageImportResult = {
      status: 'failure',
      diagnostics: [
        {
          stage: 'archive',
          code: 'invalid-archive',
          severity: 'error',
          message: 'Invalid archive.',
        },
      ],
    };

    expect(context.session.activateImportedSchemaPackage(failure)).toEqual({
      applied: false,
      reason: 'importFailure',
      importResult: failure,
    });
    expect(get(context.activeProject)).toBe(before.active);
    expect(get(context.navigation)).toBe(before.navigation);
    expect(get(context.inspector)).toBe(before.inspector);
    expect(get(context.presentation)).toBe(before.presentation);
  });

  it.each([
    ['invalidProject', 'project'],
    ['invalidInitialFocus', 'focus'],
  ] as const)(
    'rejects package %s before any reset',
    async (reason, invalidPart) => {
      const context = fixture();
      const imported = await importedPackage();
      const before = {
        active: get(context.activeProject),
        navigation: get(context.navigation),
        inspector: get(context.inspector),
        presentation: get(context.presentation),
      };
      const candidate: SchemaPackageImportResult =
        invalidPart === 'project'
          ? {
              ...imported,
              project: {
                ...imported.project,
                rootNodeIds: ['missing'],
              },
            }
          : { ...imported, initialFocusNodeId: 'missing' };

      expect(
        context.session.activateImportedSchemaPackage(candidate),
      ).toMatchObject({ applied: false, reason });
      expect(get(context.activeProject)).toBe(before.active);
      expect(get(context.navigation)).toBe(before.navigation);
      expect(get(context.inspector)).toBe(before.inspector);
      expect(get(context.presentation)).toBe(before.presentation);
    },
  );
});
