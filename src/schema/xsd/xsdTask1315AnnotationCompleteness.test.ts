import { describe, expect, it } from 'vitest';
import source from '../../../tests/fixtures/xsd/task-13.15-annotation-completeness.xsd?raw';
import { buildProjectSearchIndex } from '../../app/search';
import { buildInspectorSummary } from '../../ui/inspector/inspectorSummary';
import { buildFocusCardSummary } from '../../ui/carousel/focusCardSummary';
import { getOutgoingEdges, type SchemaNode } from '../model';
import {
  importXsdSource,
  parseXsd,
  type XsdAnnotationContentMetadata,
} from './index';

const options = {
  projectId: 'task-13.15-annotations',
  displayName: 'Task 13.15 annotation completeness',
  sourceFileId: 'task-13.15-annotation-completeness.xsd',
  sourceFilename: 'task-13.15-annotation-completeness.xsd',
};

function imported() {
  const result = importXsdSource(source, options);
  expect(result.status).toBe('success');
  if (result.status !== 'success') throw new Error('Expected fixture import.');
  return result;
}

function nodesOfKind(
  nodes: readonly SchemaNode[],
  kind: SchemaNode['kind'],
): readonly SchemaNode[] {
  return nodes.filter((node) => node.kind === kind);
}

describe('Task 13.15 annotation, foreign-content, and source completeness', () => {
  it('accepts repeated and interspersed schema annotations without component-only diagnostics', () => {
    const parsed = parseXsd(source, options.sourceFileId);
    expect(parsed.status).toBe('success');
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.schema?.annotations).toHaveLength(2);
    expect(
      parsed.schema?.annotations.map(({ range }) =>
        source.slice(range.start.offset, range.end.offset),
      ),
    ).toEqual([
      expect.stringContaining('urn:docs:overview'),
      expect.stringContaining('urn:docs:second'),
    ]);
  });

  it('creates stable, source-ordered, reachable nodes for every retained content class', () => {
    const result = imported();
    const kinds = result.project.nodes.map(({ kind }) => kind);
    expect(nodesOfKind(result.project.nodes, 'xsdAnnotation')).toHaveLength(8);
    expect(kinds).toEqual(
      expect.arrayContaining([
        'xsdDocumentation',
        'xsdAppInfo',
        'xsdForeignElement',
        'xsdComment',
        'xsdProcessingInstruction',
        'xsdProlog',
      ]),
    );

    const schema = result.project.nodes.find(({ kind }) => kind === 'schema')!;
    const schemaAnnotations = getOutgoingEdges(result.project, schema.id)
      .filter(({ kind }) => kind === 'ownsAnnotation')
      .map(({ targetNodeId }) =>
        result.project.nodes.find(({ id }) => id === targetNodeId)!,
      );
    expect(schemaAnnotations).toHaveLength(2);
    expect(schemaAnnotations[0]!.sourceOrder).toBeLessThan(
      schemaAnnotations[1]!.sourceOrder!,
    );
    expect(new Set(result.project.nodes.map(({ id }) => id)).size).toBe(
      result.project.nodes.length,
    );
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(imported()).toEqual(result);
  });

  it('preserves mixed content, namespaces, attributes, raw XML, and narrow ranges', () => {
    const result = imported();
    const documentation = result.project.nodes.find(
      ({ kind, name }) =>
        kind === 'xsdDocumentation' && name.includes('Human documentation'),
    )!;
    const metadata = result.xsdMetadataByNodeId[documentation.id]!;
    const content = metadata.annotationContent;
    expect(content?.kind).toBe('documentation');
    if (content?.kind !== 'documentation')
      throw new Error('Expected documentation.');
    expect(content.text).toContain('<literal> CDATA & entity-like text');
    expect(content.xmlLang?.value).toBe('en-CA');
    expect(content.source?.value).toBe('urn:docs:overview');
    expect(content.attributes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          qualifiedName: 'source',
          value: 'urn:docs:overview',
        }),
      ]),
    );
    expect(content.mixedContent.map(({ kind }) => kind)).toEqual(
      expect.arrayContaining([
        'text',
        'foreignElement',
        'cdata',
        'comment',
        'processingInstruction',
      ]),
    );
    expect(content.rawXml).toBe(
      source.slice(
        metadata.sourceRange.start.offset,
        metadata.sourceRange.end.offset,
      ),
    );
    expect(
      source.slice(
        content.contentRange.start.offset,
        content.contentRange.end.offset,
      ),
    ).toContain('<vendor:term');

    const foreign = result.project.nodes.find(
      ({ kind, name }) =>
        kind === 'xsdForeignElement' && name === 'vendor:term',
    )!;
    const foreignContent = result.xsdMetadataByNodeId[foreign.id]
      ?.annotationContent as Extract<
      XsdAnnotationContentMetadata,
      { readonly kind: 'foreignElement' }
    >;
    expect(foreignContent).toMatchObject({
      qualifiedName: 'vendor:term',
      prefix: 'vendor',
      localName: 'term',
      namespaceUri: 'urn:vendor:annotation',
    });
    expect(foreignContent.namespaceBindings.vendor).toBe(
      'urn:vendor:annotation',
    );
    expect(foreignContent.rawXml).toContain('documentation');
  });

  it('preserves comments, PIs, and XML declaration fields as inert source metadata', () => {
    const result = imported();
    const prolog = nodesOfKind(result.project.nodes, 'xsdProlog')[0]!;
    expect(
      result.xsdMetadataByNodeId[prolog.id]?.annotationContent,
    ).toMatchObject({
      kind: 'prolog',
      target: 'xml',
      version: '1.0',
      encoding: 'UTF-8',
      standalone: 'yes',
    });
    expect(
      nodesOfKind(result.project.nodes, 'xsdComment').map(({ name }) => name),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('leading schema comment'),
        expect.stringContaining('after-root comment'),
      ]),
    );
    expect(
      nodesOfKind(result.project.nodes, 'xsdProcessingInstruction').map(
        (node) => result.xsdMetadataByNodeId[node.id]?.annotationContent,
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: 'xml-carousel',
          data: 'preview="inert"',
        }),
        expect.objectContaining({ target: 'after-root', data: 'inert' }),
      ]),
    );
  });

  it('indexes all safe text and exposes concise navigation, inspector, and escaped source routes', () => {
    const result = imported();
    const search = buildProjectSearchIndex({
      project: result.project,
      xsdMetadataByNodeId: result.xsdMetadataByNodeId,
    });
    const allSearchText = search.documents
      .flatMap(({ fields }) => fields.map(({ text }) => text))
      .join('\n');
    expect(allSearchText).toContain('urn:vendor:annotation');
    expect(allSearchText).toContain('en-CA');
    expect(allSearchText).toContain('after-root');
    expect(allSearchText).toContain('javascript:alert(1)');

    const appInfo = result.project.nodes.find(
      ({ kind, name }) =>
        kind === 'xsdAppInfo' && name.includes('machine data'),
    )!;
    const inspector = buildInspectorSummary(
      result.project,
      appInfo.id,
      {},
      {},
      result.sourceMarkupByNodeId,
      result.xsdMetadataByNodeId,
    )!;
    expect(inspector.sourceMarkup?.fragments[0]?.text).toContain('<h:script>');
    expect(inspector.overviewProperties).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: 'Machine/private uninterpreted XSD appinfo',
        }),
      ]),
    );
    const card = buildFocusCardSummary(
      result.project,
      appInfo.id,
      {},
      result.xsdMetadataByNodeId,
    )!;
    expect(card.destinationCount).toBeGreaterThan(0);
    expect(card.visibleRelationshipSummaries.length).toBeLessThanOrEqual(4);
    expect(result.sourceMarkupByNodeId[appInfo.id]?.fragments[0]?.text).toBe(
      source.slice(
        result.xsdMetadataByNodeId[appInfo.id]!.sourceRange.start.offset,
        result.xsdMetadataByNodeId[appInfo.id]!.sourceRange.end.offset,
      ),
    );
  });

  it('does not interpret hostile HTML, SVG, MathML, event, or javascript-looking values', () => {
    const result = imported();
    const dangerous = result.project.nodes.filter(
      ({ kind, searchTerms }) =>
        kind === 'xsdForeignElement' &&
        searchTerms?.some((term) =>
          /script|javascript:|onload|onclick|MathML|svg/iu.test(term),
        ),
    );
    expect(dangerous.length).toBeGreaterThanOrEqual(4);
    for (const node of dangerous) {
      const metadata = result.xsdMetadataByNodeId[node.id]!;
      expect(metadata.annotationContent?.kind).toBe('foreignElement');
      expect(node.properties).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: 'Safety',
            value: 'Opaque markup; never interpreted or executed',
          }),
        ]),
      );
    }
  });
});
