import { get } from 'svelte/store';
import { describe, expect, it } from 'vitest';
import { buildProjectSearchIndex, searchProjectIndex } from '../app/search';
import { createInspectorStore } from '../app/stores/inspectorStore';
import { createNavigationStore } from '../app/stores/navigationStore';
import { importDtdSource } from '../schema/dtd';
import { bookDtdProject } from '../schema/samples/bookDtdProject';
import { importXsdSource } from '../schema/xsd';
import annotationsSource from '../../tests/fixtures/xsd/annotations.xsd?raw';
import commentsSource from '../../tests/fixtures/dtd/comments.dtd?raw';
import attlistOnlySource from '../../tests/fixtures/dtd/attlist-undeclared-element.dtd?raw';

function successfulXsdImport() {
  const result = importXsdSource(annotationsSource, {
    projectId: 'search:annotations',
    displayName: 'Annotation search fixture',
    sourceFileId: 'search:annotations:source',
    sourceFilename: 'annotations.xsd',
  });
  if (result.status !== 'success') {
    throw new Error('Expected annotations.xsd to import successfully.');
  }
  return result;
}

function successfulDtdImport() {
  const result = importDtdSource(commentsSource, {
    projectId: 'search:comments',
    displayName: 'DTD comment search fixture',
    sourceFileId: 'search:comments:source',
    sourceFilename: 'comments.dtd',
  });
  if (result.status !== 'success') {
    throw new Error('Expected comments.dtd to import successfully.');
  }
  return result;
}

describe('project search integration', () => {
  it('indexes real XSD owners, references, attributes, and filenames without changing application state', () => {
    const imported = successfulXsdImport();
    const navigation = createNavigationStore(imported.project, {
      projectId: imported.project.id,
      navigationPath: [imported.initialFocusNodeId],
    });
    const schemaNodeId = imported.project.rootNodeIds[0]!;
    const inspector = createInspectorStore(imported.project, {
      projectId: imported.project.id,
      inspectedNodeId: schemaNodeId,
    });
    const stateBefore = {
      navigation: JSON.stringify(get(navigation)),
      inspector: JSON.stringify(get(inspector)),
      project: JSON.stringify(imported.project),
      metadata: JSON.stringify(imported.xsdMetadataByNodeId),
    };

    const index = buildProjectSearchIndex({
      project: imported.project,
      sourceFilename: 'annotations.xsd',
      xsdMetadataByNodeId: imported.xsdMetadataByNodeId,
    });

    expect(index.documents).toHaveLength(imported.project.nodes.length);
    expect(new Set(index.documents.map(({ nodeId }) => nodeId)).size).toBe(
      imported.project.nodes.length,
    );
    expect(
      searchProjectIndex(index, 'urn:annotations documentation')[0],
    ).toMatchObject({
      nodeId: schemaNodeId,
      nodeKind: 'schema',
    });
    expect(searchProjectIndex(index, 'schema overview documentation')).toEqual(
      [],
    );
    expect(searchProjectIndex(index, 'root')[0]).toMatchObject({
      nodeName: 'root',
      nodeKind: 'globalElement',
    });
    expect(searchProjectIndex(index, 'BaseType')[0]).toMatchObject({
      nodeName: 'BaseType',
      nodeKind: 'complexType',
    });
    expect(searchProjectIndex(index, 'ExtendedType')[0]).toMatchObject({
      nodeName: 'ExtendedType',
      nodeKind: 'complexType',
    });
    expect(
      searchProjectIndex(index, 'Extension documentation')[0],
    ).toMatchObject({
      nodeName: 'Documentation: Extension documentation.',
      nodeKind: 'xsdDocumentation',
    });
    expect(searchProjectIndex(index, 'StatusType')[0]).toMatchObject({
      nodeName: 'StatusType',
      nodeKind: 'simpleType',
    });
    expect(
      searchProjectIndex(index, 'restriction documentation').some(
        ({ nodeKind }) => nodeKind === 'restriction',
      ),
    ).toBe(true);
    expect(searchProjectIndex(index, 'extensionCode')[0]).toMatchObject({
      nodeName: 'extensionCode',
      nodeKind: 'attribute',
    });
    expect(
      searchProjectIndex(index, 'xs:string').some(({ matches }) =>
        matches.some(
          ({ fieldKind, text }) =>
            fieldKind === 'reference' && text === 'xs:string',
        ),
      ),
    ).toBe(true);
    expect(
      searchProjectIndex(index, 'Complex-content documentation')[0],
    ).toMatchObject({
      nodeName: 'Documentation: Complex-content documentation.',
      nodeKind: 'xsdDocumentation',
    });
    expect(
      searchProjectIndex(index, 'Anonymous enumeration documentation')[0],
    ).toMatchObject({ nodeKind: 'xsdDocumentation' });
    expect(searchProjectIndex(index, 'annotations.xsd')).toHaveLength(
      imported.project.nodes.length,
    );

    expect(
      searchProjectIndex(index, 'extension attribute metadata')[0],
    ).toMatchObject({
      nodeKind: 'xsdAppInfo',
    });
    expect(
      searchProjectIndex(index, 'importance="high"').some(
        ({ nodeKind }) => nodeKind === 'xsdForeignElement',
      ),
    ).toBe(true);
    expect(searchProjectIndex(index, 'm:config')[0]).toMatchObject({
      nodeKind: 'xsdForeignElement',
      nodeName: 'm:config',
    });

    expect(JSON.stringify(get(navigation))).toBe(stateBefore.navigation);
    expect(JSON.stringify(get(inspector))).toBe(stateBefore.inspector);
    expect(JSON.stringify(imported.project)).toBe(stateBefore.project);
    expect(JSON.stringify(imported.xsdMetadataByNodeId)).toBe(
      stateBefore.metadata,
    );
  });

  it('indexes concrete DTD names, attached comments, attributes, and source filenames only', () => {
    const imported = successfulDtdImport();
    const navigation = createNavigationStore(imported.project, {
      projectId: imported.project.id,
      navigationPath: [imported.initialFocusNodeId],
    });
    const inspector = createInspectorStore(imported.project, {
      projectId: imported.project.id,
      inspectedNodeId: imported.initialFocusNodeId,
    });
    const stateBefore = {
      navigation: JSON.stringify(get(navigation)),
      inspector: JSON.stringify(get(inspector)),
    };
    const index = buildProjectSearchIndex({
      project: imported.project,
      sourceFilename: 'comments.dtd',
      commentsByNodeId: imported.commentsByNodeId,
      dtdAttributesByNodeId: imported.dtdAttributesByNodeId,
    });

    expect(searchProjectIndex(index, 'book')[0]).toMatchObject({
      nodeName: 'book',
      nodeKind: 'dtdElement',
    });
    expect(searchProjectIndex(index, 'root element')[0]).toMatchObject({
      nodeName: 'book',
      nodeKind: 'dtdElement',
    });
    expect(searchProjectIndex(index, 'id')[0]).toMatchObject({
      nodeName: 'id',
      nodeKind: 'dtdAttribute',
    });
    expect(searchProjectIndex(index, 'comments.dtd').length).toBe(
      imported.project.nodes.length,
    );
    expect(
      searchProjectIndex(index, 'root element').every(({ nodeId }) =>
        imported.project.nodes.some(({ id }) => id === nodeId),
      ),
    ).toBe(true);

    expect(searchProjectIndex(index, 'Project-level note')).toEqual([]);
    expect(searchProjectIndex(index, '#PCDATA')).toEqual([]);
    expect(searchProjectIndex(index, '<!ELEMENT')).toEqual([]);
    expect(JSON.stringify(get(navigation))).toBe(stateBefore.navigation);
    expect(JSON.stringify(get(inspector))).toBe(stateBefore.inspector);
  });

  it('indexes startup sample names without imported metadata', () => {
    const index = buildProjectSearchIndex({
      project: bookDtdProject,
      sourceFilename: 'book.dtd',
    });

    expect(searchProjectIndex(index, 'chapter')[0]).toMatchObject({
      nodeName: 'chapter',
      nodeKind: 'dtdElement',
    });
    expect(index.documents).toHaveLength(bookDtdProject.nodes.length);
  });

  it('indexes an ATTLIST-only declaration as its explicit node kind', () => {
    const imported = importDtdSource(attlistOnlySource, {
      projectId: 'search:attlist-only',
      displayName: 'ATTLIST-only search fixture',
      sourceFileId: 'search:attlist-only:source',
      sourceFilename: 'attlist-undeclared-element.dtd',
    });
    expect(imported.status).toBe('success');
    if (imported.status !== 'success') return;

    const index = buildProjectSearchIndex({
      project: imported.project,
      sourceFilename: 'attlist-undeclared-element.dtd',
      dtdAttributesByNodeId: imported.dtdAttributesByNodeId,
    });

    expect(searchProjectIndex(index, 'book')[0]).toMatchObject({
      nodeId: 'dtd:attribute-list:book',
      nodeKind: 'dtdAttributeList',
      nodeCategory: 'dtdDeclaration',
    });
    expect(searchProjectIndex(index, 'id')[0]).toMatchObject({
      nodeId: 'dtd:attribute:book:id',
      nodeKind: 'dtdAttribute',
    });
  });
});
