import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import source from '../../../tests/fixtures/dtd/sdocbook/sdocbook.dtd?raw';
import { buildProjectSearchIndex, searchProjectIndex } from '../../app/search';
import { getOutgoingEdges, validateSchemaProject } from '../model';
import { importDtdSource } from './dtdImport';

function importSdocbook() {
  const imported = importDtdSource(source, {
    projectId: 'sdocbook-corrective',
    displayName: 'Simplified DocBook',
    sourceFileId: 'sdocbook/sdocbook.dtd',
    sourceFilename: 'sdocbook/sdocbook.dtd',
    standardsAccepted: true,
  });
  if (imported.status !== 'success')
    throw new Error(JSON.stringify(imported.diagnostics.slice(0, 20), null, 2));
  return imported;
}

describe('complete DTD declaration inventory and resolution', () => {
  it('preserves the supplied sdocbook fixture byte-for-byte', () => {
    const bytes = readFileSync(
      resolve('tests/fixtures/dtd/sdocbook/sdocbook.dtd'),
    );
    const fixtureText = bytes.toString('utf8');
    const lines = fixtureText.split(/\r\n|\r|\n/u);
    if (lines[lines.length - 1] === '') lines.pop();

    expect(bytes.byteLength).toBe(46_263);
    expect(lines).toHaveLength(1_569);
    expect(fixtureText.match(/<!ELEMENT/gu)).toHaveLength(106);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      'a6581df71f08bf6020bf467c80246196bf70e37203ca430588b42487fc6476b2',
    );
  });

  it('retains all 106 explicit sdocbook element declarations deterministically', () => {
    const first = importSdocbook();
    const second = importSdocbook();
    const declarations = first.project.nodes.filter(
      ({ kind }) => kind === 'dtdElement',
    );

    expect(first).toEqual(second);
    expect(validateSchemaProject(first.project)).toEqual([]);
    expect(first.visualization.summary.completeness).toBe('complete');
    expect(first.visualization.findings).toEqual([]);
    expect(declarations).toHaveLength(106);
    expect(declarations.map(({ sourceOrder }) => sourceOrder)).toEqual(
      [...declarations]
        .map(({ sourceOrder }) => sourceOrder)
        .sort((left, right) => left! - right!),
    );

    const index = buildProjectSearchIndex({
      project: first.project,
      sourceFilename: 'sdocbook.dtd',
      commentsByNodeId: first.commentsByNodeId,
      dtdAttributesByNodeId: first.dtdAttributesByNodeId,
    });
    const declarationDocuments = index.documents.filter(
      ({ nodeKind }) => nodeKind === 'dtdElement',
    );
    expect(declarationDocuments).toHaveLength(106);
    for (const name of [
      'authorinitials',
      'date',
      'revision',
      'revnumber',
      'revremark',
      'revdescription',
    ]) {
      expect(
        searchProjectIndex(index, name).some(
          ({ nodeKind, nodeName }) =>
            nodeKind === 'dtdElement' && nodeName === name,
        ),
      ).toBe(true);
    }
  });

  it('resolves every revision particle while preserving occurrence and grouping', () => {
    const imported = importSdocbook();
    const revision = imported.project.nodes.find(
      ({ kind, name }) => kind === 'dtdElement' && name === 'revision',
    )!;
    const descendants = new Set<string>();
    const pending = [revision.id];
    while (pending.length > 0) {
      const ownerId = pending.shift()!;
      for (const edge of getOutgoingEdges(imported.project, ownerId)) {
        if (edge.kind !== 'contentModelMember') continue;
        if (descendants.has(edge.targetNodeId)) continue;
        descendants.add(edge.targetNodeId);
        pending.push(edge.targetNodeId);
      }
    }
    const references = imported.project.nodes.filter(
      ({ id, kind }) => kind === 'dtdElementReference' && descendants.has(id),
    );

    expect(references.map(({ name }) => name)).toEqual([
      'revnumber',
      'date',
      'authorinitials',
      'revremark',
      'revdescription',
    ]);
    for (const reference of references) {
      expect(reference.properties).toContainEqual({
        label: 'Reference status',
        value: 'Declared element reference',
      });
      const targets = getOutgoingEdges(imported.project, reference.id).filter(
        ({ kind }) => kind === 'referencesElementName',
      );
      expect(targets).toHaveLength(1);
      expect(
        imported.project.nodes.find(
          ({ id }) => id === targets[0]!.targetNodeId,
        ),
      ).toMatchObject({ kind: 'dtdElement', name: reference.name });
    }
    expect(
      references.find(({ name }) => name === 'authorinitials')?.properties,
    ).toContainEqual({ label: 'Occurrence', value: 'Zero or more (*)' });
    const optionalChoice = imported.project.nodes.find(
      ({ kind, name, properties }) =>
        kind === 'dtdContentModel' &&
        name.includes('Choice group in revision') &&
        properties?.some(
          ({ label, value }) =>
            label === 'Occurrence' && value === 'Optional (?)',
        ),
    );
    expect(optionalChoice).toBeDefined();
  });

  it.each([
    ['backward', '<!ELEMENT a (b)>\n<!ELEMENT b EMPTY>'],
    ['forward', '<!ELEMENT b EMPTY>\n<!ELEMENT a (b)>'],
  ])(
    'resolves %s declaration order identically',
    (_label, declarationSource) => {
      const imported = importDtdSource(declarationSource, {
        projectId: 'order-independent',
        displayName: 'Order independent',
        sourceFileId: 'order.dtd',
        sourceFilename: 'order.dtd',
        standardsAccepted: true,
      });
      expect(imported.status).toBe('success');
      if (imported.status !== 'success') return;
      const reference = imported.project.nodes.find(
        ({ kind, name }) => kind === 'dtdElementReference' && name === 'b',
      )!;
      expect(reference.properties).toContainEqual({
        label: 'Reference status',
        value: 'Declared element reference',
      });
      expect(
        getOutgoingEdges(imported.project, reference.id).filter(
          ({ kind }) => kind === 'referencesElementName',
        ),
      ).toHaveLength(1);
    },
  );

  it('retains a truly undeclared reference without fabricating a declaration', () => {
    const imported = importDtdSource('<!ELEMENT a (missing)>', {
      projectId: 'undeclared',
      displayName: 'Undeclared reference',
      sourceFileId: 'undeclared.dtd',
      sourceFilename: 'undeclared.dtd',
      standardsAccepted: true,
    });
    expect(imported.status).toBe('success');
    if (imported.status !== 'success') return;
    expect(
      imported.project.nodes.some(
        ({ kind, name }) => kind === 'dtdElement' && name === 'missing',
      ),
    ).toBe(false);
    expect(
      imported.project.nodes.find(
        ({ kind, name }) =>
          kind === 'dtdElementReference' && name === 'missing',
      )?.properties,
    ).toContainEqual({
      label: 'Reference status',
      value: 'Undeclared element-name reference',
    });
  });

  it('expands bounded project-local parameter entities for models and declarations', () => {
    const imported = importDtdSource(
      [
        '<!ENTITY % model "(child, sibling)">',
        '<!ENTITY % declaration "<!ELEMENT child EMPTY><!ELEMENT sibling EMPTY>">',
        '<!ELEMENT root %model;>',
        '%declaration;',
      ].join('\n'),
      {
        projectId: 'parameter-entity-declarations',
        displayName: 'Parameter entity declarations',
        sourceFileId: 'parameter-entities.dtd',
        sourceFilename: 'parameter-entities.dtd',
        standardsAccepted: true,
      },
    );
    expect(imported.status).toBe('success');
    if (imported.status !== 'success') return;
    expect(
      imported.project.nodes.filter(({ kind }) => kind === 'dtdElement'),
    ).toHaveLength(3);
    for (const name of ['child', 'sibling']) {
      const reference = imported.project.nodes.find(
        ({ kind, name: nodeName }) =>
          kind === 'dtdElementReference' && nodeName === name,
      )!;
      expect(
        getOutgoingEdges(imported.project, reference.id).filter(
          ({ kind }) => kind === 'referencesElementName',
        ),
      ).toHaveLength(1);
    }
  });
});
