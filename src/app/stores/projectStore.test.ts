import { get } from 'svelte/store';
import { describe, expect, it } from 'vitest';
import type { DtdNormalizedComment } from '../../schema/dtd';
import { importXsdSource } from '../../schema/xsd';
import type {
  SchemaProject,
  SchemaSourceMarkupByNodeId,
} from '../../schema/model';
import {
  bookDtdNodeIds,
  bookDtdProject,
} from '../../schema/samples/bookDtdProject';
import {
  activeProjectStore,
  createActiveProjectStore,
  sourceFilenameForProject,
  type ActiveProjectState,
} from './projectStore';
import sameDocumentReferences from '../../../tests/fixtures/xsd/same-document-references.xsd?raw';
import xsdAttributes from '../../../tests/fixtures/xsd/attributes.xsd?raw';
import xsdEnumerations from '../../../tests/fixtures/xsd/simple-type-enumerations.xsd?raw';
import xsdComplexDerivations from '../../../tests/fixtures/xsd/complex-type-derivations.xsd?raw';
import xsdAnnotations from '../../../tests/fixtures/xsd/annotations.xsd?raw';
import { createVisualizationResult } from '../../schema/visualization';

function initialState(): ActiveProjectState {
  return {
    project: bookDtdProject,
    origin: 'sample',
    sourceFilename: 'sample.book.dtd',
  };
}

function alternateProject(): SchemaProject {
  return {
    id: 'test:alternate',
    displayName: 'Alternate project',
    sourceFiles: [{ id: 'alternate-source', filename: 'alternate.dtd' }],
    nodes: [
      {
        id: 'alternate-root',
        kind: 'dtdElement',
        name: 'alternate',
        sourceFileId: 'alternate-source',
      },
    ],
    edges: [],
    rootNodeIds: ['alternate-root'],
  };
}

function normalizedComment(
  attachmentKind: 'preceding' | 'schema' = 'preceding',
): DtdNormalizedComment {
  return {
    commentId: `comment:${attachmentKind}`,
    sourceFileId: 'alternate-source',
    raw: '<!-- docs -->',
    text: ' docs ',
    sourceRange: {
      start: { offset: 0, line: 1, column: 1 },
      end: { offset: 13, line: 1, column: 14 },
      sourceId: 'alternate-source',
    },
    contentRange: {
      start: { offset: 4, line: 1, column: 5 },
      end: { offset: 10, line: 1, column: 11 },
      sourceId: 'alternate-source',
    },
    order: 0,
    attachmentKind,
    ...(attachmentKind === 'schema'
      ? {}
      : {
          declarationKind: 'element' as const,
          declarationRange: {
            start: { offset: 14, line: 2, column: 1 },
            end: { offset: 40, line: 2, column: 27 },
            sourceId: 'alternate-source',
          },
          attachedNodeId: 'alternate-root',
        }),
  };
}

function sourceMarkup(
  syntax: 'dtd' | 'xsd' = 'dtd',
): SchemaSourceMarkupByNodeId {
  const text = '<!ELEMENT alternate EMPTY>';
  return {
    'alternate-root': {
      syntax,
      fragments: [
        {
          id: 'alternate:0',
          sourceFileId: 'alternate-source',
          range: {
            start: { offset: 0, line: 1, column: 1 },
            end: { offset: text.length, line: 1, column: text.length + 1 },
            sourceId: 'alternate-source',
          },
          text,
        },
      ],
    },
  };
}

function importedXsd(projectId = 'test:xsd-store') {
  const result = importXsdSource(sameDocumentReferences, {
    projectId,
    displayName: projectId,
    sourceFileId: `${projectId}:source`,
    sourceFilename: `${projectId}.xsd`,
  });
  if (result.status !== 'success') {
    throw new Error('Expected XSD store fixture to import.');
  }
  return result;
}

function importedXsdAttributes() {
  const result = importXsdSource(xsdAttributes, {
    projectId: 'test:xsd-attribute-store',
    displayName: 'XSD attributes',
    sourceFileId: 'attributes:source',
    sourceFilename: 'attributes.xsd',
  });
  if (result.status !== 'success') {
    throw new Error('Expected XSD attribute store fixture to import.');
  }
  return result;
}

function importedXsdEnumerations() {
  const result = importXsdSource(xsdEnumerations, {
    projectId: 'test:xsd-enumeration-store',
    displayName: 'XSD enumerations',
    sourceFileId: 'enumerations:source',
    sourceFilename: 'simple-type-enumerations.xsd',
  });
  if (result.status !== 'success') {
    throw new Error('Expected XSD enumeration store fixture to import.');
  }
  return result;
}

function importedXsdComplexDerivations() {
  const result = importXsdSource(xsdComplexDerivations, {
    projectId: 'test:xsd-complex-derivation-store',
    displayName: 'XSD complex derivations',
    sourceFileId: 'complex-derivations:source',
    sourceFilename: 'complex-type-derivations.xsd',
  });
  if (result.status !== 'success') {
    throw new Error('Expected XSD complex derivation store fixture to import.');
  }
  return result;
}

function importedXsdAnnotations() {
  const result = importXsdSource(xsdAnnotations, {
    projectId: 'test:xsd-annotation-store',
    displayName: 'XSD annotations',
    sourceFileId: 'annotations:source',
    sourceFilename: 'annotations.xsd',
  });
  if (result.status !== 'success') {
    throw new Error('Expected XSD annotation store fixture to import.');
  }
  return result;
}

describe('active project store', () => {
  it('initializes the application singleton with the hydrated parser-produced sample', () => {
    const state = get(activeProjectStore);
    expect(state).toMatchObject({
      project: bookDtdProject,
      origin: 'sample',
      sourceFilename: 'sample.book.dtd',
    });
    expect(Object.keys(state.dtdAttributesByNodeId ?? {})).toHaveLength(3);
    expect(state.commentsByNodeId?.[bookDtdNodeIds.book]).toHaveLength(1);
    expect(state.sourceMarkupByNodeId?.[bookDtdNodeIds.book]).toBeDefined();
    expect(state.preparedSearchIndex?.projectId).toBe(bookDtdProject.id);
  });

  it('exposes subscription and bounded replacement without writable methods', () => {
    const store = createActiveProjectStore(initialState());

    expect(store.subscribe).toBeTypeOf('function');
    expect(store.replace).toBeTypeOf('function');
    expect(store).not.toHaveProperty('set');
    expect(store).not.toHaveProperty('update');
  });

  it('replaces a valid project and retains import metadata', () => {
    const store = createActiveProjectStore(initialState());
    const project = alternateProject();
    const result = store.replace(project, {
      origin: 'imported',
      sourceFilename: 'alternate.dtd',
      contentKindsByNodeId: { 'alternate-root': 'empty' },
    });

    expect(result.applied).toBe(true);
    expect(get(store)).toEqual({
      project,
      origin: 'imported',
      sourceFilename: 'alternate.dtd',
      contentKindsByNodeId: { 'alternate-root': 'empty' },
    });
  });

  it('rejects invalid projects without changing current state', () => {
    const store = createActiveProjectStore(initialState());
    const before = get(store);
    const invalid: SchemaProject = {
      ...alternateProject(),
      rootNodeIds: ['missing'],
    };
    const result = store.replace(invalid, {
      origin: 'imported',
      sourceFilename: 'invalid.dtd',
    });

    expect(result).toMatchObject({
      applied: false,
      reason: 'invalidProject',
      findings: [{ code: 'missingRootNode' }],
      state: before,
    });
    expect(get(store)).toBe(before);
  });

  it('does not mutate supplied projects, metadata, or the previous state', () => {
    const store = createActiveProjectStore(initialState());
    const previous = get(store);
    const project = alternateProject();
    const projectBefore = JSON.stringify(project);
    const contentKindsByNodeId = { 'alternate-root': 'empty' as const };

    store.replace(project, {
      origin: 'imported',
      sourceFilename: 'alternate.dtd',
      contentKindsByNodeId,
    });
    contentKindsByNodeId['alternate-root'] = 'empty';

    expect(JSON.stringify(project)).toBe(projectBefore);
    expect(previous).toEqual(initialState());
    expect(previous.project.rootNodeIds).toContain(bookDtdNodeIds.book);
    expect(get(store)).not.toBe(previous);
    expect(get(store).contentKindsByNodeId).not.toBe(contentKindsByNodeId);
  });

  it('defensively copies attached and schema-level comment metadata', () => {
    const store = createActiveProjectStore(initialState());
    const attached = normalizedComment();
    const schema = normalizedComment('schema');
    const comments = [attached, schema];
    const commentsByNodeId = { 'alternate-root': [attached] };
    const schemaLevelComments = [schema];

    store.replace(alternateProject(), {
      origin: 'imported',
      sourceFilename: 'alternate.dtd',
      comments,
      commentsByNodeId,
      schemaLevelComments,
    });
    const state = get(store);

    expect(state.comments).toEqual(comments);
    expect(state.comments).not.toBe(comments);
    expect(state.comments?.[0]).not.toBe(attached);
    expect(state.comments?.[0]?.sourceRange).not.toBe(attached.sourceRange);
    expect(state.commentsByNodeId).not.toBe(commentsByNodeId);
    expect(state.commentsByNodeId?.['alternate-root']).not.toBe(
      commentsByNodeId['alternate-root'],
    );
    expect(state.schemaLevelComments).not.toBe(schemaLevelComments);
    expect(JSON.parse(JSON.stringify(state.comments))).toEqual(state.comments);
  });

  it('clears comment metadata when replacement metadata omits it', () => {
    const store = createActiveProjectStore(initialState());
    const attached = normalizedComment();
    store.replace(alternateProject(), {
      origin: 'imported',
      sourceFilename: 'alternate.dtd',
      comments: [attached],
      commentsByNodeId: { 'alternate-root': [attached] },
      schemaLevelComments: [],
    });
    expect(get(store).comments).toHaveLength(1);

    store.replace(bookDtdProject, {
      origin: 'sample',
      sourceFilename: 'sample.book.dtd',
    });

    expect(get(store)).not.toHaveProperty('comments');
    expect(get(store)).not.toHaveProperty('commentsByNodeId');
    expect(get(store)).not.toHaveProperty('schemaLevelComments');
  });

  it('defensively copies XSD source markup and clears it when later omitted', () => {
    const store = createActiveProjectStore(initialState());
    const markup = sourceMarkup('xsd');
    store.replace(alternateProject(), {
      origin: 'imported',
      sourceFilename: 'alternate.dtd',
      sourceMarkupByNodeId: markup,
    });
    const imported = get(store);

    expect(imported.sourceMarkupByNodeId).toEqual(markup);
    expect(imported.sourceMarkupByNodeId).not.toBe(markup);
    expect(imported.sourceMarkupByNodeId?.['alternate-root']).not.toBe(
      markup['alternate-root'],
    );
    expect(
      imported.sourceMarkupByNodeId?.['alternate-root']?.fragments[0],
    ).not.toBe(markup['alternate-root']?.fragments[0]);
    expect(
      imported.sourceMarkupByNodeId?.['alternate-root']?.fragments[0]?.range,
    ).not.toBe(markup['alternate-root']?.fragments[0]?.range);
    expect(JSON.parse(JSON.stringify(imported.sourceMarkupByNodeId))).toEqual(
      imported.sourceMarkupByNodeId,
    );

    store.replace(bookDtdProject, {
      origin: 'sample',
      sourceFilename: 'sample.book.dtd',
    });
    expect(get(store)).not.toHaveProperty('sourceMarkupByNodeId');
  });

  it('replaces one commented metadata set without retaining old comments', () => {
    const store = createActiveProjectStore(initialState());
    const first = normalizedComment();
    const second = {
      ...normalizedComment(),
      commentId: 'comment:replacement',
      raw: '<!-- replacement -->',
      text: ' replacement ',
    };
    store.replace(alternateProject(), {
      origin: 'imported',
      sourceFilename: 'first.dtd',
      comments: [first],
      commentsByNodeId: { 'alternate-root': [first] },
      schemaLevelComments: [],
    });

    store.replace(alternateProject(), {
      origin: 'imported',
      sourceFilename: 'second.dtd',
      comments: [second],
      commentsByNodeId: { 'alternate-root': [second] },
      schemaLevelComments: [],
    });

    expect(get(store).comments?.map(({ commentId }) => commentId)).toEqual([
      'comment:replacement',
    ]);
    expect(JSON.stringify(get(store))).not.toContain(first.commentId);
  });

  it('performs predictable same-project replacement with a fresh state', () => {
    const store = createActiveProjectStore(initialState());
    const first = get(store);

    const result = store.replace(bookDtdProject, {
      origin: 'sample',
      sourceFilename: 'sample.book.dtd',
    });

    expect(result.applied).toBe(true);
    expect(get(store)).not.toBe(first);
    expect(get(store)).toEqual(first);
    expect(get(store).project).toBe(bookDtdProject);
  });

  it('keeps state plain and excludes browser, parser, and AST objects', () => {
    const store = createActiveProjectStore(initialState());
    store.replace(alternateProject(), {
      origin: 'imported',
      sourceFilename: 'alternate.dtd',
      contentKindsByNodeId: { 'alternate-root': 'empty' },
    });
    const serialized = JSON.stringify(get(store));

    expect(() => JSON.parse(serialized)).not.toThrow();
    expect(serialized).not.toContain('"ast"');
    expect(serialized).not.toContain('"parser"');
    expect(serialized).not.toContain('"file"');
    expect(get(store)).not.toHaveProperty('navigationPath');
    expect(get(store)).not.toHaveProperty('inspectedNodeId');
  });

  it('prefers declared filenames and safely falls back to model identity', () => {
    expect(sourceFilenameForProject(alternateProject())).toBe('alternate.dtd');
    expect(sourceFilenameForProject(bookDtdProject)).toBe('sample.book.dtd');
  });

  it('accepts and deeply clones every nested XSD metadata shape', () => {
    const store = createActiveProjectStore(initialState());
    const imported = importedXsdAttributes();
    store.replace(imported.project, {
      origin: 'imported',
      sourceFilename: 'schema.xsd',
      xsdMetadataByNodeId: imported.xsdMetadataByNodeId,
    });
    const state = get(store);

    expect(state.xsdMetadataByNodeId).toEqual(imported.xsdMetadataByNodeId);
    expect(state.xsdMetadataByNodeId).not.toBe(imported.xsdMetadataByNodeId);
    for (const [nodeId, metadata] of Object.entries(
      imported.xsdMetadataByNodeId,
    )) {
      const active = state.xsdMetadataByNodeId?.[nodeId];
      expect(active).not.toBe(metadata);
      expect(active?.sourceRange).not.toBe(metadata.sourceRange);
      expect(active?.sourceRange.start).not.toBe(metadata.sourceRange.start);
      expect(active?.startTagRange).not.toBe(metadata.startTagRange);
      if (metadata.occurrence) {
        expect(active?.occurrence).not.toBe(metadata.occurrence);
      }
      if (metadata.typeReference) {
        expect(active?.typeReference).not.toBe(metadata.typeReference);
        expect(active?.typeReference?.range).not.toBe(
          metadata.typeReference.range,
        );
      }
      if (metadata.elementReference) {
        expect(active?.elementReference).not.toBe(metadata.elementReference);
        expect(active?.elementReference?.range).not.toBe(
          metadata.elementReference.range,
        );
      }
      if (metadata.localForm) {
        expect(active?.localForm).not.toBe(metadata.localForm);
      }
      if (metadata.attributeReference) {
        expect(active?.attributeReference).not.toBe(
          metadata.attributeReference,
        );
        expect(active?.attributeReference?.range).not.toBe(
          metadata.attributeReference.range,
        );
      }
      if (metadata.attributeForm) {
        expect(active?.attributeForm).not.toBe(metadata.attributeForm);
      }
      if (metadata.valueConstraint) {
        expect(active?.valueConstraint).not.toBe(metadata.valueConstraint);
        expect(active?.valueConstraint?.range).not.toBe(
          metadata.valueConstraint.range,
        );
      }
    }
    expect(JSON.parse(JSON.stringify(state.xsdMetadataByNodeId))).toEqual(
      state.xsdMetadataByNodeId,
    );
  });

  it('isolates caller and active XSD metadata mutations in both directions', () => {
    const store = createActiveProjectStore(initialState());
    const imported = importedXsd();
    store.replace(imported.project, {
      origin: 'imported',
      sourceFilename: 'schema.xsd',
      xsdMetadataByNodeId: imported.xsdMetadataByNodeId,
    });
    const nodeId = Object.keys(imported.xsdMetadataByNodeId)[0]!;
    const input = imported.xsdMetadataByNodeId[nodeId]!;
    const active = get(store).xsdMetadataByNodeId?.[nodeId];
    if (!active) throw new Error('Expected cloned active XSD metadata.');
    const inputLine = input.sourceRange.start.line;
    const activeColumn = active.sourceRange.start.column;

    Object.assign(active.sourceRange.start, { line: 777 });
    expect(input.sourceRange.start.line).toBe(inputLine);
    Object.assign(input.sourceRange.start, { column: 888 });
    expect(active.sourceRange.start.column).toBe(activeColumn);
  });

  it('deeply clones restriction bases and enumeration arrays with their ranges', () => {
    const store = createActiveProjectStore(initialState());
    const imported = importedXsdEnumerations();
    store.replace(imported.project, {
      origin: 'imported',
      sourceFilename: 'simple-type-enumerations.xsd',
      xsdMetadataByNodeId: imported.xsdMetadataByNodeId,
    });
    const restriction = imported.project.nodes.find(
      ({ kind, name }) =>
        kind === 'restriction' && name === 'Restriction of StatusType',
    )!;
    const input = imported.xsdMetadataByNodeId[restriction.id]!;
    const active = get(store).xsdMetadataByNodeId?.[restriction.id];

    expect(active?.restrictionBaseReference).toEqual(
      input.restrictionBaseReference,
    );
    expect(active?.restrictionBaseReference).not.toBe(
      input.restrictionBaseReference,
    );
    expect(active?.restrictionBaseReference?.range).not.toBe(
      input.restrictionBaseReference?.range,
    );
    expect(active?.enumerationValues).toEqual(input.enumerationValues);
    expect(active?.enumerationValues).not.toBe(input.enumerationValues);
    expect(active?.enumerationValues?.[0]).not.toBe(
      input.enumerationValues?.[0],
    );
    expect(active?.enumerationValues?.[0]?.sourceRange).not.toBe(
      input.enumerationValues?.[0]?.sourceRange,
    );
    expect(active?.enumerationValues?.[0]?.valueRange).not.toBe(
      input.enumerationValues?.[0]?.valueRange,
    );
  });

  it('deeply clones complex derivation metadata, base references, and ranges', () => {
    const store = createActiveProjectStore(initialState());
    const imported = importedXsdComplexDerivations();
    store.replace(imported.project, {
      origin: 'imported',
      sourceFilename: 'complex-type-derivations.xsd',
      xsdMetadataByNodeId: imported.xsdMetadataByNodeId,
    });
    const extension = imported.project.nodes.find(
      ({ kind, name }) =>
        kind === 'extension' && name === 'Extension of BeforeDerived',
    )!;
    const input =
      imported.xsdMetadataByNodeId[extension.id]!.complexTypeDerivation!;
    const active =
      get(store).xsdMetadataByNodeId?.[extension.id]?.complexTypeDerivation;

    expect(active).toEqual(input);
    expect(active).not.toBe(input);
    expect(active?.baseReference).not.toBe(input.baseReference);
    expect(active?.baseReference?.range).not.toBe(input.baseReference?.range);
    expect(active?.sourceRange).not.toBe(input.sourceRange);
    expect(active?.startTagRange).not.toBe(input.startTagRange);
  });

  it('deeply clones annotation entries, values, and every nested range', () => {
    const store = createActiveProjectStore(initialState());
    const imported = importedXsdAnnotations();
    store.replace(imported.project, {
      origin: 'imported',
      sourceFilename: 'annotations.xsd',
      xsdMetadataByNodeId: imported.xsdMetadataByNodeId,
    });
    const schema = imported.project.nodes.find(
      ({ kind }) => kind === 'schema',
    )!;
    const input = imported.xsdMetadataByNodeId[schema.id]!.annotations![0]!;
    const active =
      get(store).xsdMetadataByNodeId?.[schema.id]?.annotations?.[0];

    expect(active).toEqual(input);
    expect(active).not.toBe(input);
    expect(active?.entries).not.toBe(input.entries);
    expect(active?.entries[0]).not.toBe(input.entries[0]);
    expect(active?.sourceRange).not.toBe(input.sourceRange);
    expect(active?.startTagRange).not.toBe(input.startTagRange);
    expect(active?.entries[0]?.sourceRange).not.toBe(
      input.entries[0]?.sourceRange,
    );
    expect(active?.entries[0]?.startTagRange).not.toBe(
      input.entries[0]?.startTagRange,
    );
    expect(active?.entries[0]?.contentRange).not.toBe(
      input.entries[0]?.contentRange,
    );
    const inputDocumentation = input.entries[0];
    const activeDocumentation = active?.entries[0];
    if (
      inputDocumentation?.kind !== 'documentation' ||
      activeDocumentation?.kind !== 'documentation'
    ) {
      throw new Error('Expected cloned documentation metadata.');
    }
    expect(activeDocumentation.xmlLang).not.toBe(inputDocumentation.xmlLang);
    expect(activeDocumentation.xmlLang?.range).not.toBe(
      inputDocumentation.xmlLang?.range,
    );
    expect(activeDocumentation.source).not.toBe(inputDocumentation.source);
    expect(activeDocumentation.source?.range).not.toBe(
      inputDocumentation.source?.range,
    );
    expect(JSON.parse(JSON.stringify(active))).toEqual(active);
  });

  it('clears annotation metadata across XSD replacement and DTD replacement', () => {
    const store = createActiveProjectStore(initialState());
    const annotated = importedXsdAnnotations();
    const ordinary = importedXsd('test:ordinary-after-annotations');
    store.replace(annotated.project, {
      origin: 'imported',
      sourceFilename: 'annotations.xsd',
      xsdMetadataByNodeId: annotated.xsdMetadataByNodeId,
    });
    expect(JSON.stringify(get(store))).toContain(
      'Defines the persistent identity',
    );

    store.replace(ordinary.project, {
      origin: 'imported',
      sourceFilename: 'ordinary.xsd',
      xsdMetadataByNodeId: ordinary.xsdMetadataByNodeId,
    });
    expect(JSON.stringify(get(store))).not.toContain(
      'Defines the persistent identity',
    );

    store.replace(alternateProject(), {
      origin: 'imported',
      sourceFilename: 'alternate.dtd',
    });
    expect(get(store)).not.toHaveProperty('xsdMetadataByNodeId');
  });

  it('clears format-specific metadata instead of merging indexes', () => {
    const store = createActiveProjectStore(initialState());
    const first = importedXsd('test:first-xsd');
    const second = importedXsd('test:second-xsd');
    store.replace(first.project, {
      origin: 'imported',
      sourceFilename: 'first.xsd',
      xsdMetadataByNodeId: first.xsdMetadataByNodeId,
    });
    store.replace(second.project, {
      origin: 'imported',
      sourceFilename: 'second.xsd',
      xsdMetadataByNodeId: second.xsdMetadataByNodeId,
    });
    expect(Object.keys(get(store).xsdMetadataByNodeId ?? {})).toEqual(
      Object.keys(second.xsdMetadataByNodeId),
    );
    expect(get(store).sourceFilename).toBe('second.xsd');

    store.replace(alternateProject(), {
      origin: 'imported',
      sourceFilename: 'alternate.dtd',
      contentKindsByNodeId: { 'alternate-root': 'empty' },
      sourceMarkupByNodeId: sourceMarkup(),
    });
    expect(get(store)).not.toHaveProperty('xsdMetadataByNodeId');

    store.replace(first.project, {
      origin: 'imported',
      sourceFilename: 'first.xsd',
      xsdMetadataByNodeId: first.xsdMetadataByNodeId,
    });
    expect(get(store)).not.toHaveProperty('contentKindsByNodeId');
    expect(get(store)).not.toHaveProperty('sourceMarkupByNodeId');

    store.replace(bookDtdProject, {
      origin: 'sample',
      sourceFilename: 'sample.book.dtd',
    });
    expect(get(store)).not.toHaveProperty('xsdMetadataByNodeId');
  });

  it('preserves current XSD metadata when project validation rejects a replacement', () => {
    const store = createActiveProjectStore(initialState());
    const imported = importedXsd();
    store.replace(imported.project, {
      origin: 'imported',
      sourceFilename: 'schema.xsd',
      xsdMetadataByNodeId: imported.xsdMetadataByNodeId,
    });
    const before = get(store);
    const result = store.replace(
      { ...imported.project, rootNodeIds: ['missing'] },
      { origin: 'imported', sourceFilename: 'invalid.xsd' },
    );
    expect(result.applied).toBe(false);
    expect(get(store)).toBe(before);
  });

  it('deeply clones package metadata and removes it on later replacements', () => {
    const store = createActiveProjectStore(initialState());
    const project = alternateProject();
    const manifest = {
      id: 'schema-package:schemas.zip',
      archiveFilename: 'schemas.zip',
      archiveByteLength: 42,
      packageRoot: 'bundle',
      entries: [],
      schemaEntries: [
        {
          id: 'entry:alternate',
          archivePath: 'bundle/alternate.dtd',
          packageRelativePath: 'alternate.dtd',
          basename: 'alternate.dtd',
          format: 'dtd' as const,
          sourceOrder: 0,
        },
      ],
      xsdCount: 0,
      dtdCount: 1,
      rngCount: 0,
      ignoredFileCount: 0,
      totalFileEntryCount: 1,
    };
    const source = {
      sourceFileId: 'alternate-source',
      archiveEntryId: 'entry:alternate',
      archivePath: 'bundle/alternate.dtd',
      packageRelativePath: 'alternate.dtd',
      format: 'dtd' as const,
      sourceOrder: 0,
      byteLength: 42,
      nodeCount: 1,
      rootNodeIds: ['alternate-root'],
      initialFocusNodeId: 'alternate-root',
    };
    const unresolved = {
      id: 'unresolved:alternate',
      sourceNodeId: 'alternate-root',
      sourceFileId: 'alternate-source',
      referenceKind: 'type' as const,
      raw: 't:Missing',
      localName: 'Missing',
      reason: 'ambiguous' as const,
      candidateNodeIds: ['alternate-root'],
      range: {
        start: { offset: 1, line: 2, column: 2 },
        end: { offset: 3, line: 2, column: 4 },
        sourceId: 'alternate-source',
      },
    };
    const result = store.replace(project, {
      origin: 'package',
      sourceFilename: 'schemas.zip',
      schemaPackageManifest: manifest,
      schemaPackageSources: [source],
      unresolvedReferences: [unresolved],
      contentKindsByNodeId: { 'alternate-root': 'empty' },
      dtdAttributesByNodeId: {},
      xsdMetadataByNodeId: {},
    });
    expect(result.applied).toBe(true);
    const state = get(store);

    manifest.schemaEntries[0]!.packageRelativePath = 'mutated.dtd';
    source.rootNodeIds.push('mutated');
    unresolved.candidateNodeIds.push('mutated');
    unresolved.range.start.line = 99;

    expect(state.origin).toBe('package');
    expect(
      state.schemaPackageManifest?.schemaEntries[0]?.packageRelativePath,
    ).toBe('alternate.dtd');
    expect(state.schemaPackageSources?.[0]?.rootNodeIds).toEqual([
      'alternate-root',
    ]);
    expect(state.unresolvedReferences?.[0]?.candidateNodeIds).toEqual([
      'alternate-root',
    ]);
    expect(state.unresolvedReferences?.[0]?.range.start.line).toBe(2);
    expect(JSON.stringify(state)).not.toMatch(/"bytes"|"sourceText"/);
    expect(() => JSON.stringify(state)).not.toThrow();

    store.replace(project, {
      origin: 'imported',
      sourceFilename: 'alternate.dtd',
      contentKindsByNodeId: { 'alternate-root': 'empty' },
    });
    expect(get(store)).not.toHaveProperty('schemaPackageManifest');
    expect(get(store)).not.toHaveProperty('schemaPackageSources');
    expect(get(store)).not.toHaveProperty('unresolvedReferences');

    const xsd = importedXsd('test:package-clearing-xsd');
    store.replace(xsd.project, {
      origin: 'imported',
      sourceFilename: 'schema.xsd',
      xsdMetadataByNodeId: xsd.xsdMetadataByNodeId,
    });
    expect(get(store)).not.toHaveProperty('schemaPackageManifest');
  });

  it('retains bounded partial metadata independently and replaces it atomically', () => {
    const store = createActiveProjectStore(initialState());
    const visualization = createVisualizationResult([
      {
        code: 'dtd:unsupported-declaration',
        message: 'A valid entity is not visualized.',
        sourceFileId: 'alternate-source',
        constructKind: 'entity',
        constructName: 'author',
        sourceMarkup: '<!ENTITY author "value">',
        range: {
          start: { offset: 0, line: 1, column: 1 },
          end: { offset: 25, line: 1, column: 26 },
          sourceId: 'alternate-source',
        },
      },
    ]);
    store.replace(alternateProject(), {
      origin: 'imported',
      sourceFilename: 'alternate.dtd',
      visualizationCompleteness: visualization.summary.completeness,
      visualizationSummary: visualization.summary,
      visualizationFindings: visualization.findings,
    });
    const partial = get(store);
    expect(partial.visualizationCompleteness).toBe('partial');
    expect(partial.visualizationSummary?.totalFindingCount).toBe(1);
    expect(partial.visualizationFindings).toEqual(visualization.findings);
    expect(partial.visualizationFindings).not.toBe(visualization.findings);

    store.replace(bookDtdProject, {
      origin: 'sample',
      sourceFilename: 'sample.book.dtd',
      visualizationCompleteness: 'complete',
      visualizationSummary: {
        completeness: 'complete',
        totalFindingCount: 0,
        retainedFindingCount: 0,
        omittedConstructCount: 0,
        placeholderCount: 0,
      },
      visualizationFindings: [],
    });
    expect(get(store)).toMatchObject({
      visualizationCompleteness: 'complete',
      visualizationFindings: [],
    });
  });
});
