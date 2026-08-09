import JSZip from 'jszip';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { importSchemaArchivePackage } from '../../app/import/schemaPackage/importSchemaArchivePackage';
import { importDtdSource } from '../../schema/dtd';
import { importXsdSource } from '../../schema/xsd';
import NodeInspector from './NodeInspector.svelte';
import { buildInspectorSummary } from './inspectorSummary';
import type { SourceViewPresentation } from '../presentation/sourceMarkupPresentation';
import { selectSourceViewPresentation } from '../presentation/sourceMarkupPresentation';

function renderSummary(
  summary: NonNullable<ReturnType<typeof buildInspectorSummary>>,
  sourcePresentation?: SourceViewPresentation,
) {
  return render(NodeInspector, {
    props: {
      summary,
      isCurrentFocus: true,
      onCenter: vi.fn(),
      onCenterNode: vi.fn(),
      onClose: vi.fn(),
      childListResetKey: `integration:${summary.nodeId}`,
      sourcePresentation,
    },
  });
}

describe('inspector child filtering integration', () => {
  it('filters many real DTD children without changing the complete summary', async () => {
    const names = Array.from({ length: 20 }, (_, index) => `child-${index}`);
    const result = importDtdSource(
      [
        `<!ELEMENT root (${names.join(', ')})>`,
        ...names.map((name) => `<!ELEMENT ${name} EMPTY>`),
      ].join('\n'),
      {
        projectId: 'filter:dtd',
        displayName: 'Many DTD children',
        sourceFileId: 'filter:dtd:source',
        sourceFilename: 'many.dtd',
      },
    );
    expect(result.status).toBe('success');
    if (result.status !== 'success') throw new Error('Expected DTD import.');
    const root = result.project.nodes.find(({ name }) => name === 'root')!;
    const summary = buildInspectorSummary(result.project, root.id)!;
    expect(summary.orderedDestinations).toHaveLength(20);

    renderSummary(summary);
    const input = screen.getByRole('searchbox', {
      name: 'Filter child structures',
    });
    await fireEvent.input(input, { target: { value: 'child-19' } });
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(summary.orderedDestinations).toHaveLength(20);
  });

  it('filters real XSD local-element Structure and schema-overview Declarations', async () => {
    const locals = Array.from(
      { length: 20 },
      (_, index) => `<xs:element name="local${index}" type="xs:string"/>`,
    ).join('');
    const globals = Array.from(
      { length: 12 },
      (_, index) => `<xs:element name="global${index}" type="xs:string"/>`,
    ).join('');
    const result = importXsdSource(
      `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="root"><xs:complexType><xs:sequence>${locals}</xs:sequence></xs:complexType></xs:element>
        ${globals}
      </xs:schema>`,
      {
        projectId: 'filter:xsd',
        displayName: 'Many XSD declarations',
        sourceFileId: 'filter:xsd:source',
        sourceFilename: 'many.xsd',
      },
    );
    expect(result.status).toBe('success');
    if (result.status !== 'success') throw new Error('Expected XSD import.');

    const sequence = result.project.nodes.find(
      ({ kind }) => kind === 'sequence',
    )!;
    const structure = buildInspectorSummary(
      result.project,
      sequence.id,
      undefined,
      undefined,
      result.sourceMarkupByNodeId,
      result.xsdMetadataByNodeId,
    )!;
    expect(structure.orderedDestinations).toHaveLength(20);
    const renderedStructure = renderSummary(structure);
    expect(
      screen.getByRole('searchbox', { name: 'Filter child structures' }),
    ).toBeVisible();

    renderedStructure.unmount();
    const schema = result.project.nodes.find(({ kind }) => kind === 'schema')!;
    const overview = buildInspectorSummary(
      result.project,
      schema.id,
      undefined,
      undefined,
      result.sourceMarkupByNodeId,
      result.xsdMetadataByNodeId,
    )!;
    expect(overview.declarations).toHaveLength(13);
    renderSummary(overview);
    expect(
      screen.getByRole('searchbox', { name: 'Filter declarations' }),
    ).toBeVisible();
  });

  it('keeps package source identity and markup available alongside declaration filtering', async () => {
    const archive = new JSZip();
    archive.file(
      'schemas/root.xsd',
      `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        ${Array.from(
          { length: 12 },
          (_, index) => `<xs:element name="entry${index}" type="xs:string"/>`,
        ).join('')}
      </xs:schema>`,
      { createFolders: false },
    );
    const data = await archive.generateAsync({ type: 'uint8array' });
    const result = await importSchemaArchivePackage({
      filename: 'filter-package.zip',
      data,
    });
    expect(result.status).toBe('success');
    if (result.status !== 'success')
      throw new Error('Expected package import.');
    const schema = result.project.nodes.find(({ kind }) => kind === 'schema')!;
    const summary = buildInspectorSummary(
      result.project,
      schema.id,
      result.dtdAttributesByNodeId,
      result.commentsByNodeId,
      result.sourceMarkupByNodeId,
      result.xsdMetadataByNodeId,
      undefined,
      result.unresolvedReferences,
    )!;

    const sourcePresentation = selectSourceViewPresentation(
      {
        project: result.project,
        origin: 'package',
        sourceFilename: result.manifest.archiveFilename,
        schemaPackageSources: result.sources,
        sourceMarkupByNodeId: result.sourceMarkupByNodeId,
        xsdMetadataByNodeId: result.xsdMetadataByNodeId,
      },
      schema.id,
    );
    renderSummary(summary, sourcePresentation);
    expect(
      screen.getByRole('searchbox', { name: 'Filter declarations' }),
    ).toBeVisible();
    expect(screen.getAllByText('root.xsd').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', { name: 'View source for Schema overview' }),
    ).toBeVisible();
  });
});
