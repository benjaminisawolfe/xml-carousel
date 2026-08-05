import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import InspectorNodeRow from './InspectorNodeRow.svelte';
import InspectorSection from './InspectorSection.svelte';
import NodeAppInfo from './NodeAppInfo.svelte';
import NodeAttributes from './NodeAttributes.svelte';
import NodeComments from './NodeComments.svelte';
import NodeDeclarations from './NodeDeclarations.svelte';
import NodeDocumentation from './NodeDocumentation.svelte';
import NodeEnumerationValues from './NodeEnumerationValues.svelte';
import NodeInspector from './NodeInspector.svelte';
import NodeOverview from './NodeOverview.svelte';
import NodeRelatedDefinitions from './NodeRelatedDefinitions.svelte';
import NodeRelationships from './NodeRelationships.svelte';
import NodeSourceMarkup from './NodeSourceMarkup.svelte';
import NodeStructure from './NodeStructure.svelte';
import inspectorNodeRowSource from './InspectorNodeRow.svelte?raw';
import nodeInspectorSource from './NodeInspector.svelte?raw';
import inspectorPanelSource from '../layout/InspectorPanel.svelte?raw';
import nodeAttributesSource from './NodeAttributes.svelte?raw';
import nodeAppInfoSource from './NodeAppInfo.svelte?raw';
import nodeCommentsSource from './NodeComments.svelte?raw';
import nodeDocumentationSource from './NodeDocumentation.svelte?raw';
import nodeEnumerationValuesSource from './NodeEnumerationValues.svelte?raw';
import nodeSourceMarkupSource from './NodeSourceMarkup.svelte?raw';
import type { InspectorSummary } from './inspectorSummary';

const summary: InspectorSummary = {
  nodeId: 'chapter',
  unresolvedReferences: [],
  displayName: 'chapter',
  kind: 'dtdElement',
  sourceFilename: 'book.dtd',
  overviewProperties: [
    { id: 'kind', label: 'Kind', value: 'DTD element' },
    { id: 'source-file', label: 'Source file', value: 'book.dtd' },
  ],
  showRelatedNodeKinds: true,
  declaration: '<!ELEMENT chapter (title, section*)>',
  isSchemaOverview: false,
  declarations: [],
  orderedDestinations: [
    {
      relationshipId: 'chapter-title',
      nodeId: 'title',
      displayName: 'title',
      kind: 'dtdElement',
      occurrence: '',
      order: 0,
    },
    {
      relationshipId: 'chapter-section',
      nodeId: 'section',
      displayName: 'section',
      kind: 'dtdElement',
      occurrence: '*',
      order: 1,
    },
  ],
  relatedDefinitions: [],
  attributes: [],
  globalAttributes: [],
  enumerationValues: [],
  documentation: [],
  appInfo: [],
  comments: [],
  incomingRelationships: [
    {
      relationshipId: 'content-chapter',
      nodeId: 'content',
      displayName: 'book.content',
      kind: 'dtdContentModel',
      relationshipKind: 'contains',
      order: 0,
    },
    {
      relationshipId: 'index-reference',
      nodeId: 'index',
      displayName: 'index',
      kind: 'dtdElement',
      relationshipKind: 'references',
      order: 1,
    },
  ],
  isStructuralLeaf: false,
  hasStructuralDestinations: true,
};

describe('inspector presentation components', () => {
  it('renders ordered duplicate and empty enumeration values as noninteractive semantic rows', () => {
    render(NodeEnumerationValues, {
      values: [
        {
          value: 'active',
          displayValue: 'active',
          accessibleLabel: 'active',
          order: 0,
        },
        {
          value: 'active',
          displayValue: 'active',
          accessibleLabel: 'active',
          order: 1,
        },
        {
          value: '',
          displayValue: '(empty string)',
          accessibleLabel: 'Empty string allowed value',
          order: 2,
        },
      ],
    });

    const list = screen.getByRole('list', { name: 'Allowed values' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(within(list).getAllByText('active')).toHaveLength(2);
    expect(
      within(list).getByLabelText('Empty string allowed value'),
    ).toHaveTextContent('(empty string)');
    expect(within(list).queryByRole('button')).not.toBeInTheDocument();
    expect(list.querySelector('[tabindex]')).toBeNull();
    expect(nodeEnumerationValuesSource).toContain('overflow-wrap: anywhere');
    expect(nodeEnumerationValuesSource).not.toContain('{@html');
  });

  it('labels reusable sections as accessible regions', () => {
    render(InspectorSection, { title: 'Overview' });

    expect(screen.getByRole('region', { name: 'Overview' })).toBeVisible();
  });

  it('renders only explicitly useful Overview properties', () => {
    render(NodeOverview, { properties: summary.overviewProperties });

    expect(screen.getByText('DTD element')).toBeVisible();
    expect(screen.getByText('book.dtd')).toBeVisible();
    expect(screen.queryByText('Name')).not.toBeInTheDocument();
    expect(screen.queryByText('Declaration')).not.toBeInTheDocument();
    expect(screen.queryByText(summary.declaration!)).not.toBeInTheDocument();
  });

  it('renders declaration and every ordered destination as a centring control', async () => {
    const onCenterNode = vi.fn();
    render(NodeStructure, {
      summary,
      showNodeKinds: true,
      onCenterNode,
    });

    const list = screen.getByRole('list', {
      name: 'Ordered child structures',
    });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByText('title')).toBeVisible();
    expect(within(list).getByText('section*')).toBeVisible();
    expect(screen.getByText(summary.declaration!)).toHaveProperty(
      'tagName',
      'CODE',
    );
    expect(
      within(list)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Center title', 'Center section*']);
    expect(within(list).queryByRole('link')).not.toBeInTheDocument();

    await within(list).getByRole('button', { name: 'Center section*' }).click();
    expect(onCenterNode).toHaveBeenCalledWith({
      targetNodeId: 'section',
      relationshipContext: {
        kind: 'outgoing-structural',
        sourceNodeId: 'chapter',
        edgeId: 'chapter-section',
      },
    });
  });

  it('renders terminal recursive Structure rows as information', () => {
    const onCenterNode = vi.fn();
    render(NodeStructure, {
      summary: {
        nodeId: 'two',
        declaration: '(one, two)',
        orderedDestinations: [
          {
            relationshipId: 'two-one',
            nodeId: 'one',
            displayName: 'one',
            kind: 'dtdElement',
            occurrence: '',
            order: 0,
            relationshipKind: 'contains',
            relationshipLabel: 'Recursive child',
            disposition: 'terminalCycleClosure',
            targetJourneyPosition: 0,
            isCurrentFocusClosure: false,
            terminalLabel: 'Already present earlier in this path',
          },
          {
            relationshipId: 'two-two',
            nodeId: 'two',
            displayName: 'two',
            kind: 'dtdElement',
            occurrence: '',
            order: 1,
            relationshipKind: 'contains',
            relationshipLabel: 'Recursive child',
            disposition: 'terminalCycleClosure',
            targetJourneyPosition: 1,
            isCurrentFocusClosure: true,
            terminalLabel: 'Already the current element',
          },
        ],
        isStructuralLeaf: false,
      },
      showNodeKinds: true,
      onCenterNode,
    });

    expect(
      screen.getByText(
        'Recursive child — Already present earlier in this path',
      ),
    ).toBeVisible();
    expect(
      screen.getByText('Recursive child — Already the current element'),
    ).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(onCenterNode).not.toHaveBeenCalled();
  });

  it('renders structural content as text rather than markup', () => {
    render(NodeStructure, {
      summary: {
        nodeId: 'chapter',
        declaration: '<img src=x onerror=alert(1)>',
        orderedDestinations: [
          {
            ...summary.orderedDestinations[0]!,
            displayName: '<script>unsafe()</script>',
          },
        ],
        isStructuralLeaf: false,
      },
      showNodeKinds: false,
      onCenterNode: vi.fn(),
    });

    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeVisible();
    expect(screen.getByText('<script>unsafe()</script>')).toBeVisible();
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('script')).toBeNull();
  });

  it('states when a node has no child structures', () => {
    render(NodeStructure, {
      summary: {
        nodeId: 'chapter',
        declaration: undefined,
        orderedDestinations: [],
        isStructuralLeaf: true,
      },
      showNodeKinds: false,
      onCenterNode: vi.fn(),
    });

    expect(screen.getByText('No child structures')).toBeVisible();
    expect(
      screen.queryByRole('list', { name: 'Ordered child structures' }),
    ).not.toBeInTheDocument();
  });

  it('presents multiple direct incoming relationships as centring controls', async () => {
    const onCenterNode = vi.fn();
    render(NodeRelationships, {
      inspectedNodeId: summary.nodeId,
      relationships: summary.incomingRelationships,
      showNodeKinds: true,
      onCenterNode,
    });

    const section = screen.getByRole('region', { name: 'Used by' });
    const list = within(section).getByRole('list', {
      name: 'Incoming structural relationships',
    });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByText('book.content')).toBeVisible();
    expect(
      within(list).getByText('DTD content-model declaration · contains child'),
    ).toBeVisible();
    expect(
      within(list).getByText('DTD element declaration · references element'),
    ).toBeVisible();
    expect(within(section).queryByText(/parent/i)).not.toBeInTheDocument();
    expect(
      within(section)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Center book.content', 'Center index']);
    const contentButton = within(section).getByRole('button', {
      name: 'Center book.content',
    });
    expect(
      Array.from(contentButton.children).map((element) => element.tagName),
    ).toEqual(['STRONG', 'SPAN']);
    expect(getComputedStyle(contentButton).flexDirection).toBe('column');
    expect(
      within(section).queryByRole('button', { name: /inspect/i }),
    ).not.toBeInTheDocument();

    await within(section)
      .getByRole('button', { name: 'Center book.content' })
      .click();
    expect(onCenterNode).toHaveBeenCalledWith({
      targetNodeId: 'content',
      relationshipContext: {
        kind: 'incoming-structural',
        inspectedNodeId: 'chapter',
        sourceNodeId: 'content',
        edgeId: 'content-chapter',
      },
    });
  });

  it('renders outgoing XSD definitions with exact relationship context', async () => {
    const onCenterNode = vi.fn();
    const relationships = [
      {
        relationshipId: 'element-type',
        nodeId: 'type',
        displayName: 'BookType',
        kind: 'complexType' as const,
        relationshipKind: 'typeOf' as const,
        relationshipLabel: 'Type',
        order: 0,
      },
      {
        relationshipId: 'element-reference',
        nodeId: 'definition',
        displayName: 'book',
        kind: 'globalElement' as const,
        relationshipKind: 'references' as const,
        relationshipLabel: 'Referenced element',
        order: 1,
      },
    ];

    render(NodeRelatedDefinitions, {
      sourceNodeId: 'element',
      relationships,
      showNodeKinds: true,
      onCenterNode,
    });

    const section = screen.getByRole('region', {
      name: 'Related definitions',
    });
    const typeButton = within(section).getByRole('button', {
      name: 'Follow Type to BookType, Complex type declaration',
    });
    expect(
      Array.from(typeButton.children).map((element) => element.tagName),
    ).toEqual(['STRONG', 'SPAN']);
    expect(typeButton.querySelector('strong')).toHaveTextContent('BookType');
    expect(typeButton.querySelector('span')).toHaveTextContent(
      'Type · Complex type declaration',
    );
    expect(getComputedStyle(typeButton).flexDirection).toBe('column');
    expect(getComputedStyle(typeButton.querySelector('strong')!).display).toBe(
      'block',
    );
    expect(getComputedStyle(typeButton.querySelector('span')!).display).toBe(
      'block',
    );
    expect(
      within(section).getByText('Type · Complex type declaration'),
    ).toBeVisible();
    expect(
      within(section).getByText(
        'Referenced element · Global element declaration',
      ),
    ).toBeVisible();
    expect(
      within(section).getByRole('button', {
        name: 'Follow Type to BookType, Complex type declaration',
      }),
    ).toBeVisible();
    expect(within(section).queryByText(/typeOf|references/)).toBeNull();
    expect(section.querySelector('button button')).toBeNull();

    await within(section)
      .getByRole('button', {
        name: 'Follow Referenced element to book, Global element declaration',
      })
      .click();
    expect(onCenterNode).toHaveBeenCalledWith({
      targetNodeId: 'definition',
      relationshipContext: {
        kind: 'outgoing-structural',
        sourceNodeId: 'element',
        edgeId: 'element-reference',
      },
    });
  });

  it('stacks full DTD and XSD annotation names above semantic descriptions', () => {
    const onCenterNode = vi.fn();
    const longDocumentationName =
      'Documentation: Package-side definition of a special ability that can be selected for SpellcastingAdvancementActivity';
    render(NodeRelatedDefinitions, {
      sourceNodeId: 'mixed-related-definitions',
      relationships: [
        {
          relationshipId: 'dtd-section-reference',
          nodeId: 'section',
          displayName: 'section',
          kind: 'dtdElement',
          relationshipKind: 'references',
          relationshipLabel: 'Referenced element declaration',
          order: 0,
        },
        {
          relationshipId: 'xsd-documentation-entry',
          nodeId: 'documentation',
          displayName: longDocumentationName,
          kind: 'xsdDocumentation',
          relationshipKind: 'ownsAnnotationEntry',
          relationshipLabel: 'Annotation entry',
          order: 1,
        },
      ],
      showNodeKinds: true,
      onCenterNode,
    });

    const section = screen.getByRole('region', {
      name: 'Related definitions',
    });
    const dtdButton = within(section).getByRole('button', {
      name: 'Follow Referenced element declaration to section, DTD element declaration',
    });
    const documentationButton = within(section).getByRole('button', {
      name: `Follow Annotation entry to ${longDocumentationName}, XSD documentation`,
    });

    expect(dtdButton.querySelector('strong')).toHaveTextContent('section');
    expect(dtdButton.querySelector('span')).toHaveTextContent(
      'Referenced element declaration · DTD element declaration',
    );
    expect(documentationButton.querySelector('strong')).toHaveTextContent(
      longDocumentationName,
    );
    expect(documentationButton.querySelector('span')).toHaveTextContent(
      'Annotation entry · XSD documentation',
    );
    for (const button of [dtdButton, documentationButton]) {
      expect(
        Array.from(button.children).map((element) => element.tagName),
      ).toEqual(['STRONG', 'SPAN']);
      expect(getComputedStyle(button).flexDirection).toBe('column');
      expect(button).toHaveAttribute('type', 'button');
    }
  });

  it('renders terminal recursive Related definitions as information', () => {
    const onCenterNode = vi.fn();
    render(NodeRelatedDefinitions, {
      sourceNodeId: 'local',
      relationships: [
        {
          relationshipId: 'local-root',
          nodeId: 'root',
          displayName: 'root',
          kind: 'globalElement',
          relationshipKind: 'references',
          relationshipLabel: 'Recursive reference',
          disposition: 'terminalCycleClosure',
          targetJourneyPosition: 0,
          isCurrentFocusClosure: false,
          terminalLabel: 'Already present earlier in this path',
          order: 0,
        },
      ],
      showNodeKinds: true,
      onCenterNode,
    });

    expect(
      screen.getByText(
        'Recursive reference — Already present earlier in this path · Global element declaration',
      ),
    ).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(onCenterNode).not.toHaveBeenCalled();
  });

  it('places Related definitions after Structure without adding XSD source markup', () => {
    render(NodeInspector, {
      summary: {
        ...summary,
        sourceMarkup: undefined,
        relatedDefinitions: [
          {
            relationshipId: 'chapter-type',
            nodeId: 'type',
            displayName: 'ChapterType',
            kind: 'complexType',
            relationshipKind: 'typeOf',
            relationshipLabel: 'Type',
            order: 0,
          },
        ],
      },
      isCurrentFocus: true,
      onCenter: vi.fn(),
      onCenterNode: vi.fn(),
      onClose: vi.fn(),
    });

    expect(
      screen
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(['Overview', 'Structure', 'Related definitions', 'Used by']);
    expect(screen.queryByText('View source markup')).not.toBeInTheDocument();
  });

  it('renders schema overview declarations instead of ordinary Structure', () => {
    const onCenterNode = vi.fn();
    render(NodeInspector, {
      summary: {
        ...summary,
        nodeId: 'schema',
        displayName: 'Schema overview',
        kind: 'schema',
        declaration: undefined,
        isSchemaOverview: true,
        overviewProperties: [
          {
            id: 'source-file',
            label: 'Source file',
            value: 'schema.xsd',
          },
          {
            id: 'target-namespace',
            label: 'Target namespace',
            value: 'urn:test',
          },
        ],
        declarations: [
          {
            relationshipId: 'schema-root',
            nodeId: 'root',
            displayName: 'root',
            kind: 'globalElement',
            relationshipLabel: 'Global element declaration',
            occurrence: '',
            order: 0,
          },
        ],
        orderedDestinations: [],
        relatedDefinitions: [],
        incomingRelationships: [],
        isStructuralLeaf: false,
      },
      isCurrentFocus: true,
      onCenter: vi.fn(),
      onCenterNode,
      onClose: vi.fn(),
    });

    expect(
      screen
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(['Overview', 'Declarations']);
    expect(screen.queryByRole('region', { name: 'Structure' })).toBeNull();
    expect(screen.queryByText(/<xs:schema/)).toBeNull();

    screen
      .getByRole('button', {
        name: 'Center root, Global element declaration',
      })
      .click();
    expect(onCenterNode).toHaveBeenCalledWith({
      targetNodeId: 'root',
      relationshipContext: {
        kind: 'outgoing-structural',
        sourceNodeId: 'schema',
        edgeId: 'schema-root',
      },
    });
    expect(NodeDeclarations).toBeDefined();
  });

  it('renders attribute rows as safe, wrapping, noninteractive text', () => {
    render(NodeAttributes, {
      attributes: [
        {
          nodeId: 'attribute:status',
          name: '<status>',
          detailLines: [
            `(draft | review | final) · Default '&copy; > "quoted"'`,
          ],
          order: 0,
        },
        {
          nodeId: 'attribute:format',
          name: 'format',
          detailLines: ['NOTATION (gif | jpg | png) · Fixed "gif"'],
          order: 1,
        },
      ],
    });

    const section = screen.getByRole('region', { name: 'Attributes' });
    const list = within(section).getByRole('list', {
      name: 'Attributes',
    });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByText('<status>')).toBeVisible();
    expect(
      within(list).getByText(
        `(draft | review | final) · Default '&copy; > "quoted"'`,
      ),
    ).toBeVisible();
    expect(within(list).getByText('format')).toBeVisible();
    expect(
      within(list).getByText('NOTATION (gif | jpg | png) · Fixed "gif"'),
    ).toBeVisible();
    expect(within(list).queryByRole('button')).not.toBeInTheDocument();
    expect(within(list).queryByRole('link')).not.toBeInTheDocument();
    expect(document.querySelector('status')).toBeNull();
    expect(nodeAttributesSource).not.toContain('@html');
    expect(nodeAttributesSource).toContain('white-space: pre-wrap');
    expect(nodeAttributesSource).toContain('overflow-wrap: anywhere');
  });

  it('renders complete DTD comments as safe, wrapping, noninteractive text', () => {
    render(NodeComments, {
      comments: [
        {
          commentId: 'comment:1',
          text: '<script>safe</script>\n  complete detail',
          order: 0,
        },
      ],
    });

    const section = screen.getByRole('region', { name: 'DTD comments' });
    expect(section.querySelector('.comment-text')).toHaveTextContent(
      '<script>safe</script> complete detail',
    );
    expect(within(section).queryByText(/Lines? \d/)).not.toBeInTheDocument();
    expect(
      within(section).queryByText(/Before|After|Inside|ELEMENT|ATTLIST/),
    ).not.toBeInTheDocument();
    expect(section).not.toHaveTextContent('comment:1');
    expect(within(section).queryByRole('button')).not.toBeInTheDocument();
    expect(within(section).queryByRole('link')).not.toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
    expect(nodeCommentsSource).not.toContain('@html');
    expect(nodeCommentsSource).not.toContain('contextLabel');
    expect(nodeCommentsSource).not.toContain('locationLabel');
    expect(nodeCommentsSource).toContain('white-space: pre-wrap');
    expect(nodeCommentsSource).toContain('overflow-wrap: anywhere');
  });

  it('renders ordered Documentation blocks with explicit metadata and no entry disclosures', () => {
    const dangerousText = '<script>alert(1)</script>';
    const { container } = render(NodeDocumentation, {
      documentation: [
        {
          id: 'documentation:fixture:1-20',
          text: 'First documentation',
          displayText: 'First documentation',
          isEmpty: false,
          language: { value: 'en', displayValue: 'en' },
          source: {
            value: 'https://example.test/a/very/long/source',
            displayValue: 'https://example.test/a/very/long/source',
          },
          order: 0,
        },
        {
          id: 'documentation:fixture:21-30',
          text: '',
          displayText: 'No text content.',
          isEmpty: true,
          language: { value: '', displayValue: '(empty)' },
          source: { value: '', displayValue: '(empty)' },
          order: 1,
        },
        {
          id: 'documentation:fixture:31-60',
          text: dangerousText,
          displayText: dangerousText,
          isEmpty: false,
          order: 2,
        },
      ],
    });

    const section = screen.getByRole('region', { name: 'Documentation' });
    const items = within(section).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining('First documentation'),
      expect.stringContaining('No text content.'),
      expect.stringContaining(dangerousText),
    ]);
    expect(within(items[0]!).getByText('Language')).toHaveProperty(
      'tagName',
      'DT',
    );
    expect(within(items[0]!).getByText('Source')).toHaveProperty(
      'tagName',
      'DT',
    );
    expect(within(items[0]!).getByText('en')).toHaveProperty('tagName', 'DD');
    expect(within(items[1]!).getAllByText('(empty)')).toHaveLength(2);
    expect(section.querySelector('details')).toBeNull();
    expect(within(section).queryByText('View raw XML')).not.toBeInTheDocument();
    expect(within(section).queryByRole('button')).not.toBeInTheDocument();
    expect(within(section).queryByRole('link')).not.toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();

    expect(nodeDocumentationSource).toContain('overflow-wrap: anywhere');
    expect(nodeDocumentationSource).toContain('white-space: pre-wrap');
    expect(nodeDocumentationSource).not.toContain('{@html');
    expect(nodeDocumentationSource).not.toContain('innerHTML');
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders AppInfo separately with technical styling and escaped structured values', () => {
    const dangerousText = '<img src=x onerror=alert(1)>';
    render(NodeAppInfo, {
      appInfo: [
        {
          id: 'appinfo:fixture:1-20',
          text: dangerousText,
          displayText: dangerousText,
          isEmpty: false,
          source: { value: 'tool', displayValue: 'tool' },
          order: 0,
        },
        {
          id: 'appinfo:fixture:21-30',
          text: '',
          displayText: 'No extracted text content.',
          isEmpty: true,
          order: 1,
        },
      ],
    });

    const section = screen.getByRole('region', { name: 'AppInfo' });
    expect(within(section).getAllByRole('listitem')).toHaveLength(2);
    expect(within(section).getByText('Source')).toHaveProperty('tagName', 'DT');
    expect(within(section).getByText('tool')).toHaveProperty('tagName', 'DD');
    expect(within(section).getByText(dangerousText)).toBeVisible();
    expect(
      within(section).getByText('No extracted text content.'),
    ).toBeVisible();
    expect(section.querySelector('details')).toBeNull();
    expect(within(section).queryByText('View raw XML')).not.toBeInTheDocument();
    expect(section.querySelectorAll('[data-appinfo-entry]')).toHaveLength(2);
    expect(within(section).queryByRole('button')).not.toBeInTheDocument();
    expect(within(section).queryByRole('link')).not.toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
    expect(nodeAppInfoSource).toContain('var(--colour-type)');
    expect(nodeAppInfoSource).not.toContain('{@html');
    expect(nodeAppInfoSource).not.toContain('innerHTML');
  });

  it('places Attributes between Structure and Used by when present', () => {
    render(NodeInspector, {
      summary: {
        ...summary,
        attributes: [
          {
            nodeId: 'attribute:id',
            name: 'id',
            detailLines: ['ID · Required'],
            order: 0,
          },
        ],
      },
      isCurrentFocus: true,
      onCenter: vi.fn(),
      onCenterNode: vi.fn(),
      onClose: vi.fn(),
    });

    expect(
      screen
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(['Overview', 'Structure', 'Attributes', 'Used by']);
  });

  it('places DTD comments between Attributes and Used by when present', () => {
    render(NodeInspector, {
      summary: {
        ...summary,
        attributes: [
          {
            nodeId: 'attribute:id',
            name: 'id',
            detailLines: ['ID · Required'],
            order: 0,
          },
        ],
        comments: [
          {
            commentId: 'comment:1',
            text: 'Element documentation',
            order: 0,
          },
        ],
      },
      isCurrentFocus: true,
      onCenter: vi.fn(),
      onCenterNode: vi.fn(),
      onClose: vi.fn(),
    });

    expect(
      screen
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual([
      'Overview',
      'Structure',
      'Attributes',
      'DTD comments',
      'Used by',
    ]);
  });

  it('places Documentation and AppInfo before DTD comments and Used by', () => {
    render(NodeInspector, {
      summary: {
        ...summary,
        documentation: [
          {
            id: 'documentation:fixture:1-2',
            text: 'Human-facing',
            displayText: 'Human-facing',
            isEmpty: false,
            order: 0,
          },
        ],
        appInfo: [
          {
            id: 'appinfo:fixture:3-4',
            text: 'Machine-facing',
            displayText: 'Machine-facing',
            isEmpty: false,
            order: 0,
          },
        ],
        comments: [
          {
            commentId: 'comment:1',
            text: 'DTD comment',
            order: 0,
          },
        ],
      },
      isCurrentFocus: true,
      onCenter: vi.fn(),
      onCenterNode: vi.fn(),
      onClose: vi.fn(),
    });

    expect(
      screen
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual([
      'Overview',
      'Structure',
      'Documentation',
      'AppInfo',
      'DTD comments',
      'Used by',
    ]);
    expect(document.querySelector('button button')).toBeNull();
    expect(document.querySelector('summary button')).toBeNull();
    expect(document.querySelector('button summary')).toBeNull();
  });

  it('renders source fragments in a collapsed native disclosure before sections', async () => {
    const onCenter = vi.fn();
    const onCenterNode = vi.fn();
    const onClose = vi.fn();
    const sourceMarkup = {
      syntax: 'dtd' as const,
      fragments: [
        {
          id: 'chapter:0',
          sourceFileId: 'book.dtd',
          range: {
            start: { offset: 0, line: 1, column: 1 },
            end: { offset: 27, line: 1, column: 28 },
            sourceId: 'book.dtd',
          },
          text: '<!ELEMENT chapter (#PCDATA)>',
        },
      ],
    };
    const { container } = render(NodeInspector, {
      summary: { ...summary, sourceMarkup },
      isCurrentFocus: true,
      onCenter,
      onCenterNode,
      onClose,
    });

    const disclosure = container.querySelector('details');
    const disclosureSummary = screen.getByText('View source markup');
    const firstSection = screen.getByRole('region', { name: 'Overview' });

    expect(disclosure).not.toHaveAttribute('open');
    expect(disclosureSummary).toHaveProperty('tagName', 'SUMMARY');
    expect(disclosure?.compareDocumentPosition(firstSection)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    disclosureSummary.focus();
    disclosureSummary.click();
    expect(disclosure).toHaveAttribute('open');
    expect(document.activeElement).toBe(disclosureSummary);
    expect(screen.getByText(sourceMarkup.fragments[0]!.text)).toHaveProperty(
      'tagName',
      'CODE',
    );
    expect(onCenter).not.toHaveBeenCalled();
    expect(onCenterNode).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders discontinuous markup as safe, noninteractive text fragments', () => {
    const hostile = '</code><script>unsafe()</script>\n<!ELEMENT safe EMPTY>';
    render(NodeSourceMarkup, {
      nodeId: 'safe',
      nodeName: 'safe',
      sourceMarkup: {
        syntax: 'dtd',
        fragments: [
          {
            id: 'safe:0',
            sourceFileId: 'safe.dtd',
            range: {
              start: { offset: 0, line: 1, column: 1 },
              end: {
                offset: hostile.length,
                line: 2,
                column: 22,
              },
              sourceId: 'safe.dtd',
            },
            text: hostile,
          },
          {
            id: 'safe:1',
            sourceFileId: 'safe.dtd',
            range: {
              start: { offset: 100, line: 4, column: 1 },
              end: { offset: 122, line: 4, column: 23 },
              sourceId: 'safe.dtd',
            },
            text: '<!ATTLIST safe id ID>',
          },
        ],
      },
    });

    const codeBlocks = document.querySelectorAll('pre > code');
    expect(codeBlocks).toHaveLength(2);
    expect(codeBlocks[0]?.textContent).toBe(hostile);
    expect(document.querySelector('script')).toBeNull();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(document.querySelector('pre [tabindex]')).toBeNull();
    expect(nodeSourceMarkupSource).not.toContain('@html');
    expect(nodeSourceMarkupSource).not.toContain('aria-live');
    expect(nodeSourceMarkupSource).toContain('white-space: pre-wrap');
    expect(nodeSourceMarkupSource).toContain('overflow-wrap: anywhere');
    expect(nodeSourceMarkupSource).toContain('max-height:');
    expect(nodeSourceMarkupSource).toContain('overflow: auto');
    expect(nodeSourceMarkupSource).toContain(
      'min-height: var(--control-min-size)',
    );
    expect(nodeSourceMarkupSource).toContain('summary:focus-visible');
    expect(nodeSourceMarkupSource).not.toContain('animation:');
    expect(nodeSourceMarkupSource).not.toContain('transition:');
    expect(nodeSourceMarkupSource).not.toContain('…');
  });

  it('renders one exact XSD View Markup disclosure outside annotation sections', () => {
    const hostile = `<xs:extension base="a:BaseType">
  <xs:annotation><xs:documentation>Readable</xs:documentation></xs:annotation>
  <script>alert(1)</script>
  <img src="x" onerror="alert(1)"/>
</xs:extension>`;
    const xsdSummary: InspectorSummary = {
      ...summary,
      nodeId: 'extension',
      displayName: 'Extension of ExtendedType',
      kind: 'extension',
      sourceMarkup: {
        syntax: 'xsd',
        fragments: [
          {
            id: `xsd:source-markup:schema.xsd:0-${hostile.length}`,
            sourceFileId: 'schema.xsd',
            range: {
              start: { offset: 0, line: 1, column: 1 },
              end: { offset: hostile.length, line: 5, column: 16 },
              sourceId: 'schema.xsd',
            },
            text: hostile,
          },
        ],
      },
      documentation: [
        {
          id: 'documentation:schema.xsd:1-2',
          text: 'Readable',
          displayText: 'Readable',
          isEmpty: false,
          order: 0,
        },
      ],
      appInfo: [
        {
          id: 'appinfo:schema.xsd:3-4',
          text: 'Technical',
          displayText: 'Technical',
          isEmpty: false,
          order: 0,
        },
      ],
    };
    const { container } = render(NodeInspector, {
      summary: xsdSummary,
      isCurrentFocus: true,
      onCenter: vi.fn(),
      onCenterNode: vi.fn(),
      onClose: vi.fn(),
    });

    const markupSummaries = screen.getAllByText('View source markup');
    expect(markupSummaries).toHaveLength(1);
    expect(screen.queryByText('View raw XML')).not.toBeInTheDocument();
    const details = markupSummaries[0]!.closest('details');
    expect(details).not.toHaveAttribute('open');
    expect(container.querySelector('pre code')?.textContent).toBe(hostile);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(
      screen
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(['Overview', 'Structure', 'Documentation', 'AppInfo', 'Used by']);
    expect(
      details?.compareDocumentPosition(
        screen.getByRole('region', { name: 'Overview' }),
      ),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(document.querySelector('summary button')).toBeNull();
    expect(nodeSourceMarkupSource).toContain('white-space: pre');
    expect(nodeSourceMarkupSource).toContain('overflow: auto');
    expect(nodeSourceMarkupSource).toContain('max-height:');
    expect(nodeSourceMarkupSource).not.toContain('{@html');
    expect(nodeSourceMarkupSource).not.toContain('innerHTML');
  });

  it('preserves disclosure state for the same node and collapses for a new node', () => {
    const sourceMarkup = {
      syntax: 'xsd' as const,
      fragments: [
        {
          id: 'node:0',
          sourceFileId: 'schema.xsd',
          range: {
            start: { offset: 0, line: 1, column: 1 },
            end: { offset: 21, line: 1, column: 22 },
            sourceId: 'schema.xsd',
          },
          text: '<xs:element name="node"/>',
        },
      ],
    };
    const { container, rerender } = render(NodeSourceMarkup, {
      nodeId: 'first',
      nodeName: 'first',
      sourceMarkup,
    });
    const details = container.querySelector('details');
    screen.getByText('View source markup').click();
    expect(details).toHaveAttribute('open');

    rerender({ nodeId: 'first', nodeName: 'first', sourceMarkup });
    expect(details).toHaveAttribute('open');

    rerender({ nodeId: 'second', nodeName: 'second', sourceMarkup });
    expect(details).not.toHaveAttribute('open');
  });

  it('composes sections in order and limits header actions by focus state', () => {
    const onCenter = vi.fn();
    const onCenterNode = vi.fn();
    const onClose = vi.fn();
    const currentSampleSummary = {
      ...summary,
      overviewProperties: [],
      showRelatedNodeKinds: false,
    };
    const { container, rerender } = render(NodeInspector, {
      summary: currentSampleSummary,
      isCurrentFocus: false,
      onCenter,
      onCenterNode,
      onClose,
    });

    expect(
      screen
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(['Structure', 'Used by']);
    expect(container.querySelector('.metadata')).toBeNull();
    expect(screen.queryByText('View source markup')).not.toBeInTheDocument();
    expect(screen.queryByText('book.dtd')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Center inspected node chapter',
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Close inspector for chapter' }),
    ).toBeVisible();
    expect(
      container.querySelector('[data-inspector-scroll-body]'),
    ).not.toBeNull();

    rerender({
      summary: currentSampleSummary,
      isCurrentFocus: true,
      onCenter,
      onCenterNode,
      onClose,
    });
    expect(
      screen.queryByRole('button', {
        name: 'Center inspected node chapter',
      }),
    ).not.toBeInTheDocument();
  });

  it('uses a reusable top-aligned row without nested controls', () => {
    render(InspectorNodeRow, {
      primary: 'A long node name',
      secondary: 'DTD element',
      accessibleName: 'Center a long node name',
      onActivate: vi.fn(),
    });

    expect(screen.getByRole('listitem')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Center a long node name' }),
    ).toBeVisible();
    expect(document.querySelector('button button')).toBeNull();
    expect(inspectorNodeRowSource).toContain('align-items: flex-start');
  });

  it('keeps scrolling within the content body across panel layouts', () => {
    expect(nodeInspectorSource).toContain('data-inspector-scroll-body');
    expect(nodeInspectorSource).toContain('overflow-y: auto');
    expect(inspectorPanelSource).toContain('@media (max-width: 1099px)');
    expect(inspectorPanelSource).toContain('max-height: 66dvh');
    expect(inspectorPanelSource).toContain('overflow-y: hidden');
    expect(inspectorPanelSource).not.toContain('\n    transform:');
  });
});
