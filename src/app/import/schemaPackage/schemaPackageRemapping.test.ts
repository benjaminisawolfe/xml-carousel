import { describe, expect, it } from 'vitest';
import { importDtdSource } from '../../../schema/dtd';
import { importXsdSource } from '../../../schema/xsd';
import type { SchemaArchiveSchemaEntry } from '../schemaArchive';
import {
  deriveSchemaPackageSourceFileId,
  remapSchemaPackageFile,
  type SchemaPackageRemapInput,
} from './schemaPackageRemapping';

function entry(path: string, format: 'dtd' | 'xsd'): SchemaArchiveSchemaEntry {
  return {
    id: `entry:${path}`,
    archivePath: path,
    packageRelativePath: path,
    directoryPath: path.includes('/') ? path.split('/')[0] : undefined,
    basename: path.split('/').slice(-1)[0],
    format,
    sourceOrder: 0,
  };
}

describe('uniform schema package ID remapping', () => {
  it('remaps complete DTD graph, attributes, comments, and markup immutably', () => {
    const archiveEntry = entry('a/schema.dtd', 'dtd');
    const sourceFileId = deriveSchemaPackageSourceFileId(archiveEntry);
    const imported = importDtdSource(
      `<!-- root docs -->
<!ELEMENT root (child)>
<!ATTLIST root id ID #REQUIRED>
<!ELEMENT child EMPTY>`,
      {
        projectId: 'dtd-file',
        displayName: 'schema.dtd',
        sourceFileId,
        sourceFilename: archiveEntry.packageRelativePath,
      },
    );
    expect(imported.status).toBe('success');
    if (imported.status !== 'success') return;
    const before = structuredClone(imported);
    const remapped = remapSchemaPackageFile({
      entry: archiveEntry,
      sourceFileId,
      byteLength: 100,
      imported,
    });

    expect(remapped.status).toBe('success');
    if (remapped.status !== 'success') return;
    expect(
      remapped.file.project.nodes.every((node) =>
        node.id.startsWith('schema-package-node:'),
      ),
    ).toBe(true);
    expect(
      remapped.file.project.edges.every((edge) =>
        edge.id.startsWith('schema-package-edge:'),
      ),
    ).toBe(true);
    expect(
      remapped.file.project.edges.every(
        (edge) =>
          remapped.file.project.nodes.some(
            (node) => node.id === edge.sourceNodeId,
          ) &&
          remapped.file.project.nodes.some(
            (node) => node.id === edge.targetNodeId,
          ),
      ),
    ).toBe(true);
    const attribute = Object.values(remapped.file.dtdAttributesByNodeId)[0];
    expect(attribute?.attributeNodeId).toMatch(/^schema-package-node:/u);
    expect(attribute?.ownerElementNodeId).toMatch(/^schema-package-node:/u);
    expect(remapped.file.comments[0]?.commentId).toMatch(
      /^schema-package-comment:/u,
    );
    expect(remapped.file.comments[0]?.attachedNodeId).toMatch(
      /^schema-package-node:/u,
    );
    expect(
      Object.values(remapped.file.sourceMarkupByNodeId)[0]?.fragments[0]?.id,
    ).toMatch(/^schema-package-markup:/u);
    expect(imported).toEqual(before);
  });

  it('keeps same-named DTD declarations distinct across source files', () => {
    const firstEntry = entry('a/common.dtd', 'dtd');
    const secondEntry = entry('b/common.dtd', 'dtd');
    const remap = (archiveEntry: SchemaArchiveSchemaEntry) => {
      const sourceFileId = deriveSchemaPackageSourceFileId(archiveEntry);
      const imported = importDtdSource('<!ELEMENT root EMPTY>', {
        projectId: archiveEntry.id,
        displayName: archiveEntry.archivePath,
        sourceFileId,
        sourceFilename: archiveEntry.packageRelativePath,
      });
      expect(imported.status).toBe('success');
      if (imported.status !== 'success')
        throw new Error('Expected DTD success.');
      return remapSchemaPackageFile({
        entry: archiveEntry,
        sourceFileId,
        byteLength: 10,
        imported,
      });
    };
    const first = remap(firstEntry);
    const second = remap(secondEntry);
    expect(first.status).toBe('success');
    expect(second.status).toBe('success');
    if (first.status === 'success' && second.status === 'success') {
      expect(first.file.project.nodes[0]?.id).not.toBe(
        second.file.project.nodes[0]?.id,
      );
    }
  });

  it('remaps XSD metadata keys and nested resolved targets', () => {
    const archiveEntry = entry('schema.xsd', 'xsd');
    const sourceFileId = deriveSchemaPackageSourceFileId(archiveEntry);
    const imported = importXsdSource(
      `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"
        xmlns:t="urn:test" targetNamespace="urn:test">
        <xs:complexType name="Shared"/>
        <xs:element name="root" type="t:Shared"/>
      </xs:schema>`,
      {
        projectId: 'xsd-file',
        displayName: 'schema.xsd',
        sourceFileId,
        sourceFilename: 'schema.xsd',
      },
    );
    expect(imported.status).toBe('success');
    if (imported.status !== 'success') return;
    const remapped = remapSchemaPackageFile({
      entry: archiveEntry,
      sourceFileId,
      byteLength: 100,
      imported,
    });
    expect(remapped.status).toBe('success');
    if (remapped.status !== 'success') return;
    const resolved = Object.values(remapped.file.xsdMetadataByNodeId).find(
      (metadata) => metadata.typeReference?.resolution === 'resolved',
    )?.typeReference;
    expect(resolved?.targetNodeId).toMatch(/^schema-package-node:/u);
    expect(
      remapped.file.project.nodes.some(
        (node) => node.id === resolved?.targetNodeId,
      ),
    ).toBe(true);
  });

  it('reports deterministic duplicate node and edge identifiers', () => {
    const archiveEntry = entry('broken.dtd', 'dtd');
    const sourceFileId = deriveSchemaPackageSourceFileId(archiveEntry);
    const imported = {
      status: 'success',
      project: {
        id: 'broken',
        displayName: 'broken',
        nodes: [
          { id: 'same', kind: 'dtdElement', name: 'a' },
          { id: 'same', kind: 'dtdElement', name: 'b' },
        ],
        edges: [],
        rootNodeIds: ['same'],
      },
      contentKindsByNodeId: {},
      dtdAttributesByNodeId: {},
      comments: [],
      commentsByNodeId: {},
      schemaLevelComments: [],
      sourceMarkupByNodeId: {},
      initialFocusNodeId: 'same',
      diagnostics: [],
    } as unknown as SchemaPackageRemapInput['imported'];
    expect(
      remapSchemaPackageFile({
        entry: archiveEntry,
        sourceFileId,
        byteLength: 1,
        imported,
      }),
    ).toMatchObject({
      status: 'failure',
      diagnostics: [{ code: 'node-id-collision' }],
    });
  });
});
