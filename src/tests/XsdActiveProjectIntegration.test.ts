import { derived, get } from 'svelte/store';
import { describe, expect, it } from 'vitest';
import { createInspectorStore } from '../app/stores/inspectorStore';
import { createNavigationStore } from '../app/stores/navigationStore';
import { createProjectSession } from '../app/stores/projectSession';
import { createProjectSessionResetStore } from '../app/stores/projectSessionResetStore';
import {
  createActiveProjectStore,
  type ActiveProjectState,
} from '../app/stores/projectStore';
import { importDtdSource } from '../schema/dtd';
import { importXsdSource } from '../schema/xsd';
import {
  bookDtdNodeIds,
  bookDtdProject,
} from '../schema/samples/bookDtdProject';
import basicStructure from '../../tests/fixtures/xsd/basic-structure.xsd?raw';
import sameDocumentReferences from '../../tests/fixtures/xsd/same-document-references.xsd?raw';

const dtdSource = [
  '<!-- current root -->',
  '<!ELEMENT root (child)>',
  '<!ATTLIST root id ID #REQUIRED>',
  '<!ELEMENT child EMPTY>',
].join('\n');

function fixture() {
  const initial: ActiveProjectState = {
    project: bookDtdProject,
    origin: 'sample',
    sourceFilename: 'book.dtd',
  };
  const activeProject = createActiveProjectStore(initial);
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

function dtdImport() {
  return importDtdSource(dtdSource, {
    projectId: 'integration:dtd',
    displayName: 'Current DTD',
    sourceFileId: 'integration:dtd:source',
    sourceFilename: 'current.dtd',
  });
}

function xsdImport(
  source = sameDocumentReferences,
  projectId = 'integration:xsd',
  sourceFileId = 'integration:xsd:source',
  sourceFilename = 'schema.xsd',
) {
  return importXsdSource(source, {
    projectId,
    displayName: projectId,
    sourceFileId,
    sourceFilename,
  });
}

describe('XSD active-project integration and metadata isolation', () => {
  it('replaces nontrivial DTD state atomically with schema-root XSD state', () => {
    const context = fixture();
    const dtd = dtdImport();
    expect(context.session.activateImportedProject(dtd).applied).toBe(true);
    context.navigation.navigateLeafward('dtd:element:child');
    context.inspector.inspect('dtd:element:root');
    const beforeRevision = get(context.presentation).revision;
    expect(get(context.activeProject)).toMatchObject({
      dtdAttributesByNodeId: expect.any(Object),
      comments: expect.any(Array),
      sourceMarkupByNodeId: expect.any(Object),
    });

    const xsd = xsdImport();
    expect(context.session.activateImportedXsdProject(xsd).applied).toBe(true);
    if (xsd.status !== 'success') return;
    const active = get(context.activeProject);

    expect(active).toMatchObject({
      project: xsd.project,
      origin: 'imported',
      sourceFilename: 'schema.xsd',
      xsdMetadataByNodeId: xsd.xsdMetadataByNodeId,
      sourceMarkupByNodeId: xsd.sourceMarkupByNodeId,
    });
    expect(active).not.toHaveProperty('contentKindsByNodeId');
    expect(active).not.toHaveProperty('dtdAttributesByNodeId');
    expect(active).not.toHaveProperty('comments');
    expect(active).not.toHaveProperty('commentsByNodeId');
    expect(active).not.toHaveProperty('schemaLevelComments');
    expect(active.sourceMarkupByNodeId).not.toBe(xsd.sourceMarkupByNodeId);
    expect(get(context.navigation)).toEqual({
      projectId: xsd.project.id,
      navigationPath: [xsd.initialFocusNodeId],
    });
    expect(get(context.inspector)).toEqual({ projectId: xsd.project.id });
    expect(get(context.presentation)).toEqual({
      revision: beforeRevision + 1,
      initialFocusNodeId: xsd.initialFocusNodeId,
    });
  });

  it('preserves nontrivial DTD and XSD state on failed XSD activation', () => {
    const context = fixture();
    context.session.activateImportedProject(dtdImport());
    context.inspector.inspect('dtd:element:root');
    const failed = xsdImport(
      '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element',
      'integration:failed',
      'integration:failed:source',
      'failed.xsd',
    );
    const dtdBefore = {
      active: get(context.activeProject),
      navigation: get(context.navigation),
      inspector: get(context.inspector),
      presentation: get(context.presentation),
    };
    context.session.activateImportedXsdProject(failed);
    expect(get(context.activeProject)).toBe(dtdBefore.active);
    expect(get(context.navigation)).toBe(dtdBefore.navigation);
    expect(get(context.inspector)).toBe(dtdBefore.inspector);
    expect(get(context.presentation)).toBe(dtdBefore.presentation);

    context.session.activateImportedXsdProject(xsdImport());
    const activeXsd = get(context.activeProject);
    const schemaId = activeXsd.project.rootNodeIds[0]!;
    context.inspector.inspect(schemaId);
    const xsdBefore = {
      active: get(context.activeProject),
      navigation: get(context.navigation),
      inspector: get(context.inspector),
      presentation: get(context.presentation),
    };
    context.session.activateImportedXsdProject(failed);
    expect(get(context.activeProject)).toBe(xsdBefore.active);
    expect(get(context.navigation)).toBe(xsdBefore.navigation);
    expect(get(context.inspector)).toBe(xsdBefore.inspector);
    expect(get(context.presentation)).toBe(xsdBefore.presentation);
  });

  it('isolates XSD-to-XSD metadata and clears it for DTD and sample', () => {
    const context = fixture();
    const first = xsdImport(
      sameDocumentReferences,
      'integration:first',
      'integration:first:source',
      'first.xsd',
    );
    const second = xsdImport(
      basicStructure,
      'integration:second',
      'integration:second:source',
      'second.xsd',
    );
    context.session.activateImportedXsdProject(first);
    const firstKeys = Object.keys(
      get(context.activeProject).xsdMetadataByNodeId ?? {},
    );
    const firstMarkupKeys = Object.keys(
      get(context.activeProject).sourceMarkupByNodeId ?? {},
    );
    context.session.activateImportedXsdProject(second);
    if (second.status !== 'success') return;
    const secondState = get(context.activeProject);
    expect(secondState.project.id).toBe('integration:second');
    expect(secondState.sourceFilename).toBe('second.xsd');
    expect(Object.keys(secondState.xsdMetadataByNodeId ?? {})).toEqual(
      Object.keys(second.xsdMetadataByNodeId),
    );
    expect(
      firstKeys.some(
        (nodeId) => nodeId in (secondState.xsdMetadataByNodeId ?? {}),
      ),
    ).toBe(false);
    expect(Object.keys(secondState.sourceMarkupByNodeId ?? {})).toEqual(
      Object.keys(second.sourceMarkupByNodeId),
    );
    expect(
      firstMarkupKeys.some(
        (nodeId) => nodeId in (secondState.sourceMarkupByNodeId ?? {}),
      ),
    ).toBe(false);
    expect(secondState.sourceMarkupByNodeId).not.toBe(
      second.sourceMarkupByNodeId,
    );
    const secondMarkupNodeId = Object.keys(second.sourceMarkupByNodeId)[0]!;
    expect(
      secondState.sourceMarkupByNodeId?.[secondMarkupNodeId]?.fragments[0]
        ?.range,
    ).not.toBe(
      second.sourceMarkupByNodeId[secondMarkupNodeId]?.fragments[0]?.range,
    );

    context.session.activateImportedProject(dtdImport());
    expect(get(context.activeProject)).not.toHaveProperty(
      'xsdMetadataByNodeId',
    );
    expect(get(context.activeProject).sourceMarkupByNodeId).toBeDefined();
    expect(
      Object.values(
        get(context.activeProject).sourceMarkupByNodeId ?? {},
      ).every(({ syntax }) => syntax === 'dtd'),
    ).toBe(true);

    context.session.activateImportedXsdProject(second);
    expect(
      Object.values(
        get(context.activeProject).sourceMarkupByNodeId ?? {},
      ).every(({ syntax }) => syntax === 'xsd'),
    ).toBe(true);
    context.session.replace({
      project: bookDtdProject,
      initialFocusNodeId: bookDtdNodeIds.book,
      metadata: { origin: 'sample', sourceFilename: 'book.dtd' },
    });
    expect(get(context.activeProject)).not.toHaveProperty(
      'xsdMetadataByNodeId',
    );
    expect(get(context.activeProject)).not.toHaveProperty(
      'sourceMarkupByNodeId',
    );
  });

  it('supports sample-to-XSD through the same single active-project store', () => {
    const context = fixture();
    const result = context.session.activateImportedXsdProject(xsdImport());
    expect(result.applied).toBe(true);
    expect(get(context.activeProject).origin).toBe('imported');
    expect(get(context.activeProject).xsdMetadataByNodeId).toBeDefined();
  });
});
