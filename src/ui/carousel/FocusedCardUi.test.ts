import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/svelte';
import { get } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../app/App.svelte';
import { inspectorStore } from '../../app/stores/inspectorStore';
import { navigationStore } from '../../app/stores/navigationStore';
import { bookDtdNodeIds } from '../../schema/samples/bookDtdProject';
import FocusCard from './FocusCard.svelte';
import type { FocusCardSummary } from './focusCardSummary';
import focusCardSource from './FocusCard.svelte?raw';
import type { SourceViewPresentation } from '../presentation/sourceMarkupPresentation';

const summaryFixture: FocusCardSummary = {
  nodeId: 'fixture:focus',
  displayName: 'catalog',
  kind: 'dtdElement',
  sourceFilename: 'catalog.dtd',
  showSourceFilename: true,
  declaration: '(zeta?, alpha, zeta+, beta, gamma*)',
  contentModelParts: [
    { kind: 'text', id: 'text:0', text: '(' },
    {
      kind: 'nodeReference',
      id: 'edge:zeta:first',
      nodeId: 'fixture:zeta',
      displayName: 'zeta',
      occurrence: '?',
    },
    { kind: 'text', id: 'text:6', text: ', ' },
    {
      kind: 'nodeReference',
      id: 'edge:alpha',
      nodeId: 'fixture:alpha',
      displayName: 'alpha',
      occurrence: '',
    },
    { kind: 'text', id: 'text:13', text: ', ' },
    {
      kind: 'nodeReference',
      id: 'edge:zeta:second',
      nodeId: 'fixture:zeta',
      displayName: 'zeta',
      occurrence: '+',
    },
    { kind: 'text', id: 'text:18', text: ', ' },
    {
      kind: 'nodeReference',
      id: 'edge:beta',
      nodeId: 'fixture:beta',
      displayName: 'beta',
      occurrence: '',
    },
    { kind: 'text', id: 'text:24', text: ', ' },
    {
      kind: 'nodeReference',
      id: 'edge:gamma',
      nodeId: 'fixture:gamma',
      displayName: 'gamma',
      occurrence: '*',
    },
    { kind: 'text', id: 'text:34', text: ')' },
  ],
  orderedDestinationSummaries: [
    {
      edgeId: 'edge:zeta:first',
      relationshipKind: 'contains',
      relationshipLabel: 'Child',
      nodeId: 'fixture:zeta',
      displayName: 'zeta',
      kind: 'dtdElement',
      occurrence: '?',
    },
    {
      edgeId: 'edge:alpha',
      relationshipKind: 'contains',
      relationshipLabel: 'Child',
      nodeId: 'fixture:alpha',
      displayName: 'alpha',
      kind: 'dtdElement',
      occurrence: '',
    },
    {
      edgeId: 'edge:zeta:second',
      relationshipKind: 'contains',
      relationshipLabel: 'Child',
      nodeId: 'fixture:zeta',
      displayName: 'zeta',
      kind: 'dtdElement',
      occurrence: '+',
    },
    {
      edgeId: 'edge:beta',
      relationshipKind: 'contains',
      relationshipLabel: 'Child',
      nodeId: 'fixture:beta',
      displayName: 'beta',
      kind: 'dtdElement',
      occurrence: '',
    },
    {
      edgeId: 'edge:gamma',
      relationshipKind: 'contains',
      relationshipLabel: 'Child',
      nodeId: 'fixture:gamma',
      displayName: 'gamma',
      kind: 'dtdElement',
      occurrence: '*',
    },
  ],
  visibleRelationshipSummaries: [],
  hiddenRelationshipCount: 0,
  xsdProperties: [],
  hasXsdPresentation: false,
  destinationCount: 5,
  incomingUseCount: 2,
  attributeCount: 0,
  attributeCountKind: 'attribute',
  commentCount: 0,
  annotationCount: 0,
  isStructuralLeaf: false,
  leafStateLabel: 'No child structures',
};

const sourcePresentation: SourceViewPresentation = {
  projectId: 'fixture',
  nodeId: summaryFixture.nodeId,
  displayName: summaryFixture.displayName,
  nodeKind: summaryFixture.kind,
  nodeKindLabel: 'DTD element declaration',
  sourceIdentity: { kind: 'standaloneFilename', label: 'catalog.dtd' },
  location: {
    kind: 'exactLineColumn',
    line: 4,
    column: 1,
    label: 'Line 4, column 1 · exact',
  },
  syntax: 'dtd',
  fragments: [
    {
      id: 'fragment',
      text: '<!ELEMENT catalog EMPTY>',
      location: {
        kind: 'exactLineColumn',
        line: 4,
        column: 1,
        label: 'Line 4, column 1 · exact',
      },
    },
  ],
  sourceAvailable: true,
};

describe('focused-card information architecture', () => {
  it('limits source details and action to Full zoom and keeps Inspect independent', async () => {
    const onViewSource = vi.fn();
    const onToggleInspection = vi.fn();
    const rendered = render(FocusCard, {
      props: {
        summary: summaryFixture,
        sourcePresentation,
        isInspected: false,
        motionKey: 'fixture:source',
        onToggleInspection,
        onCenterNode: vi.fn(),
        onViewSource,
        presentation: 'full',
      },
    });
    const sourceAction = screen.getByRole('button', {
      name: 'View source for catalog',
    });
    await fireEvent.click(sourceAction);
    expect(onViewSource).toHaveBeenCalledWith(sourceAction);
    expect(onToggleInspection).not.toHaveBeenCalled();

    await rendered.rerender({
      summary: summaryFixture,
      sourcePresentation,
      isInspected: false,
      motionKey: 'fixture:source',
      onToggleInspection,
      onCenterNode: vi.fn(),
      onViewSource,
      presentation: 'compact',
    });
    expect(
      screen.queryByRole('button', { name: 'View source for catalog' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Line 4, column 1 · exact'),
    ).not.toBeInTheDocument();
  });

  beforeEach(() => {
    navigationStore.initializeAt(bookDtdNodeIds.book);
    inspectorStore.close();
  });

  it('renders identity and one interactive content-model representation', () => {
    render(App);

    const card = screen.getByRole('article', { name: 'book' });
    const heading = within(card).getByRole('heading', {
      level: 2,
      name: 'book',
    });
    expect(heading).toBeVisible();
    expect(heading).toHaveAttribute('data-focus-card-heading');
    expect(heading).toHaveAttribute('tabindex', '-1');
    expect(within(card).getByText('DTD element declaration')).toBeVisible();
    expect(within(card).getByLabelText('Content model')).toHaveTextContent(
      '(front.matter, book.content, index)',
    );
    expect(
      within(card)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual([
      'Inspect book',
      'View source for book',
      'Center front.matter',
      'Center book.content',
      'Center index',
    ]);
    expect(
      within(card).queryByRole('list', {
        name: 'Immediate child structures',
      }),
    ).not.toBeInTheDocument();
    expect(within(card).queryByText('3 children')).not.toBeInTheDocument();
    expect(within(card).getByText('sample.book.dtd')).toBeVisible();
    expect(
      within(card).getByText(/Line \d+, column \d+ · exact/),
    ).toBeVisible();
    expect(within(card).queryByText(/used by/i)).not.toBeInTheDocument();
    expect(within(card).queryByText('Current focus')).not.toBeInTheDocument();
    expect(card.querySelector('.card-topline')).toHaveProperty(
      'childElementCount',
      2,
    );
    expect(
      within(card).getByRole('button', { name: 'Inspect book' }),
    ).toBeVisible();
    expect(focusCardSource).not.toContain('focus-label');
    expect(focusCardSource).toContain('font-family: var(--font-code)');
  });

  it('renders the complete model with interactive references and separate controls', async () => {
    const onCenterNode = vi.fn();
    render(FocusCard, {
      props: {
        summary: summaryFixture,
        isInspected: false,
        motionKey: 'fixture:motion',
        onToggleInspection: vi.fn(),
        onCenterNode,
      },
    });

    const card = screen.getByRole('article', { name: 'catalog' });
    expect(within(card).getByLabelText('Content model')).toHaveTextContent(
      '(zeta?, alpha, zeta+, beta, gamma*)',
    );
    expect(
      within(card)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual([
      'Inspect catalog',
      'Center zeta?',
      'Center alpha',
      'Center zeta+',
      'Center beta',
      'Center gamma*',
    ]);
    expect(within(card).queryByText(/\+\d+ more/)).not.toBeInTheDocument();
    expect(within(card).queryByText('5 children')).not.toBeInTheDocument();
    expect(within(card).getByText('Used by 2')).toBeVisible();
    expect(within(card).getByText('catalog.dtd')).toBeVisible();
    expect(within(card).queryByRole('link')).not.toBeInTheDocument();

    await fireEvent.click(
      within(card).getByRole('button', { name: 'Center zeta+' }),
    );
    expect(onCenterNode).toHaveBeenCalledWith({
      targetNodeId: 'fixture:zeta',
      relationshipContext: {
        edgeId: 'edge:zeta:second',
        sourceNodeId: 'fixture:focus',
        kind: 'outgoing-structural',
      },
    });
  });

  it.each([
    [1, '1 attribute'],
    [3, '3 attributes'],
  ])(
    'renders a noninteractive focused-card count for %i attribute(s)',
    (attributeCount, label) => {
      render(FocusCard, {
        props: {
          summary: { ...summaryFixture, attributeCount },
          isInspected: false,
          motionKey: 'fixture:attributes',
          onToggleInspection: vi.fn(),
          onCenterNode: vi.fn(),
        },
      });

      const card = screen.getByRole('article', { name: 'catalog' });
      const count = within(card).getByText(label);
      expect(count).toHaveAttribute('data-focus-card-attribute-count');
      expect(count).not.toHaveAttribute('tabindex');
      expect(count).not.toHaveProperty('tagName', 'BUTTON');
      expect(within(card).queryByText('id')).not.toBeInTheDocument();
      expect(within(card).getByLabelText('Content model')).toHaveTextContent(
        summaryFixture.declaration!,
      );
    },
  );

  it('omits the zero attribute count and keeps compact context cards unchanged', () => {
    render(FocusCard, {
      props: {
        summary: summaryFixture,
        isInspected: false,
        motionKey: 'fixture:no-attributes',
        onToggleInspection: vi.fn(),
        onCenterNode: vi.fn(),
      },
    });

    expect(
      document.querySelector('[data-focus-card-attribute-count]'),
    ).toBeNull();
    expect(focusCardSource).toContain(
      '@media (orientation: landscape) and (max-height: 520px)',
    );
    expect(focusCardSource).not.toContain('ContextCard');
  });

  it('renders bounded XSD relationship controls, metadata, and a noninteractive self target', async () => {
    const onCenterNode = vi.fn();
    render(FocusCard, {
      props: {
        summary: {
          ...summaryFixture,
          nodeId: 'xsd:element',
          displayName: 'book',
          kind: 'globalElement',
          declaration: undefined,
          contentModelParts: [],
          orderedDestinationSummaries: [],
          visibleRelationshipSummaries: [
            {
              edgeId: 'edge:type',
              relationshipKind: 'typeOf',
              relationshipLabel: 'Type',
              nodeId: 'xsd:type',
              displayName: 'BookType',
              kind: 'complexType',
              occurrence: '',
            },
            {
              edgeId: 'edge:reference',
              relationshipKind: 'references',
              relationshipLabel: 'Referenced element',
              nodeId: 'xsd:definition',
              displayName: 'bookDefinition',
              kind: 'globalElement',
              occurrence: '',
            },
            {
              edgeId: 'edge:self',
              relationshipKind: 'references',
              relationshipLabel: 'Recursive reference',
              nodeId: 'xsd:element',
              displayName: 'book',
              kind: 'globalElement',
              occurrence: '',
              disposition: 'terminalCycleClosure',
              isCurrentFocusClosure: true,
              terminalLabel: 'Already the current element',
            },
          ],
          hiddenRelationshipCount: 2,
          xsdProperties: [
            { id: 'scope', label: 'Scope', value: 'Global' },
            {
              id: 'target-namespace',
              label: 'Target namespace',
              value: 'urn:books:with:a:very:long:name',
            },
            { id: 'type', label: 'Type', value: 'BookType (tns:BookType)' },
          ],
          hasXsdPresentation: true,
          destinationCount: 5,
          incomingUseCount: 0,
          showSourceFilename: false,
          isStructuralLeaf: false,
          leafStateLabel: 'No structural destinations',
        },
        isInspected: false,
        motionKey: 'fixture:xsd',
        onToggleInspection: vi.fn(),
        onCenterNode,
      },
    });

    const card = screen.getByRole('article', { name: 'book' });
    expect(
      within(card).getByRole('list', { name: 'Structural destinations' }),
    ).toBeVisible();
    expect(
      within(card).getByRole('button', {
        name: 'Navigate leafward through Type to BookType, Complex type declaration',
      }),
    ).toBeVisible();
    expect(
      within(card).getByRole('button', {
        name: 'Navigate leafward through Referenced element to bookDefinition, Global element declaration',
      }),
    ).toBeVisible();
    expect(
      within(card).queryByRole('button', {
        name: /Referenced element to book, Global element declaration/,
      }),
    ).not.toBeInTheDocument();
    expect(within(card).getByText('+2 more destinations')).toBeVisible();
    expect(within(card).getByLabelText('XSD orientation')).toHaveTextContent(
      /Scope\s+GlobalTarget namespace\s+urn:books:with:a:very:long:nameType\s+BookType \(tns:BookType\)/,
    );
    expect(card.querySelector('button button')).toBeNull();
    expect(within(card).queryByText(/typeOf|references/)).toBeNull();

    await fireEvent.click(
      within(card).getByRole('button', {
        name: 'Navigate leafward through Type to BookType, Complex type declaration',
      }),
    );
    expect(onCenterNode).toHaveBeenCalledWith({
      targetNodeId: 'xsd:type',
      relationshipContext: {
        kind: 'outgoing-structural',
        sourceNodeId: 'xsd:element',
        edgeId: 'edge:type',
      },
    });
  });

  it('keeps dense detail in a labelled keyboard-scrollable region below the fixed header', () => {
    render(FocusCard, {
      props: {
        summary: {
          ...summaryFixture,
          displayName: 'Schema overview',
          kind: 'schema',
          contentModelParts: [],
          xsdProperties: Array.from({ length: 20 }, (_, index) => ({
            id: `namespace-${index}`,
            label: `Namespace ${index + 1}`,
            value: `urn:example:${'long-segment:'.repeat(8)}${index + 1}`,
          })),
          documentation: {
            excerpt: 'Dense schema documentation remains available.',
            documentationCount: 8,
            additionalDocumentationCount: 7,
          },
          showSourceFilename: true,
          sourceFilename: 'schemas/dense/schema-overview.xsd',
        },
        isInspected: false,
        motionKey: 'fixture:dense-schema',
        onToggleInspection: vi.fn(),
        onCenterNode: vi.fn(),
      },
    });

    const card = screen.getByRole('article', { name: 'Schema overview' });
    const scrollRegion = within(card).getByRole('region', {
      name: 'Scrollable summary details for Schema overview',
    });
    const heading = within(card).getByRole('heading', {
      level: 2,
      name: 'Schema overview',
    });
    const inspect = within(card).getByRole('button', {
      name: 'Inspect Schema overview',
    });

    expect(scrollRegion).toHaveAttribute('tabindex', '0');
    expect(scrollRegion).toHaveAttribute('data-carousel-gesture-ignore');
    expect(scrollRegion).toContainElement(screen.getByText('Namespace 20'));
    expect(scrollRegion).toContainElement(
      screen.getByText('+7 more documentation blocks'),
    );
    expect(scrollRegion).toContainElement(
      screen.getByText('schemas/dense/schema-overview.xsd'),
    );
    expect(scrollRegion).not.toContainElement(heading);
    expect(scrollRegion).not.toContainElement(inspect);
    expect(focusCardSource).toContain(
      'grid-template-rows: auto auto minmax(0, 1fr)',
    );
    expect(focusCardSource).toContain('max-height: 100%');
    expect(focusCardSource).toContain('overflow-y: auto');
    expect(focusCardSource).toContain('overflow-x: hidden');
    expect(focusCardSource).toContain('overscroll-behavior: contain');
    expect(focusCardSource).toContain('touch-action: none');
    expect(focusCardSource).toContain('moveSummaryPointerScroll');

    const dispatchTouchPointer = (type: string, clientY: number): void => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        clientY: { value: clientY },
        pointerId: { value: 7 },
        pointerType: { value: 'touch' },
      });
      scrollRegion.dispatchEvent(event);
    };
    dispatchTouchPointer('pointerdown', 240);
    dispatchTouchPointer('pointermove', 160);
    dispatchTouchPointer('pointerup', 160);
    expect(scrollRegion.scrollTop).toBe(80);
  });

  it.each([
    [1, '+1 more documentation block'],
    [2, '+2 more documentation blocks'],
  ])(
    'renders a labelled noninteractive documentation excerpt with %i additional block(s)',
    (additionalDocumentationCount, countLabel) => {
      render(FocusCard, {
        props: {
          summary: {
            ...summaryFixture,
            nodeId: 'xsd:schema',
            displayName: 'Schema overview',
            kind: 'schema',
            declaration: undefined,
            contentModelParts: [],
            orderedDestinationSummaries: [],
            xsdProperties: [
              {
                id: 'target-namespace',
                label: 'Target namespace',
                value: 'urn:documentation',
              },
            ],
            hasXsdPresentation: true,
            documentation: {
              excerpt: 'Defines the persistent identity, exactly.',
              language: 'en',
              documentationCount: additionalDocumentationCount + 1,
              additionalDocumentationCount,
            },
            destinationCount: 0,
            incomingUseCount: 0,
            showSourceFilename: false,
            isStructuralLeaf: true,
            leafStateLabel: 'No structural destinations',
          },
          isInspected: false,
          motionKey: 'fixture:documentation',
          onToggleInspection: vi.fn(),
          onCenterNode: vi.fn(),
        },
      });

      const card = screen.getByRole('article', { name: 'Schema overview' });
      const section = within(card).getByRole('region', {
        name: 'Documentation',
      });
      expect(within(section).getByText('Documentation · en')).toBeVisible();
      expect(
        within(section).getByText('Defines the persistent identity, exactly.'),
      ).toBeVisible();
      expect(within(section).getByText(countLabel)).toBeVisible();
      expect(section).not.toHaveAttribute('lang');
      expect(section.querySelector('[lang]')).toBeNull();
      expect(section.querySelector('[tabindex]')).toBeNull();
      expect(within(section).queryByRole('button')).not.toBeInTheDocument();
      expect(within(section).queryByRole('link')).not.toBeInTheDocument();
      expect(section.querySelector('details')).toBeNull();
    },
  );

  it('omits language and additional count at zero and keeps Inspect as the only action', () => {
    render(FocusCard, {
      props: {
        summary: {
          ...summaryFixture,
          nodeId: 'xsd:documentation-only',
          displayName: 'Documented node',
          kind: 'simpleType',
          declaration: undefined,
          contentModelParts: [],
          orderedDestinationSummaries: [],
          documentation: {
            excerpt: 'One documentation block.',
            documentationCount: 1,
            additionalDocumentationCount: 0,
          },
          hasXsdPresentation: true,
          destinationCount: 0,
          incomingUseCount: 0,
          showSourceFilename: false,
          isStructuralLeaf: true,
          leafStateLabel: 'No structural destinations',
        },
        isInspected: false,
        motionKey: 'fixture:single-documentation',
        onToggleInspection: vi.fn(),
        onCenterNode: vi.fn(),
      },
    });

    const card = screen.getByRole('article', { name: 'Documented node' });
    const section = within(card).getByRole('region', {
      name: 'Documentation',
    });
    expect(within(section).getByText('Documentation')).toBeVisible();
    expect(within(section).queryByText(/\+\d+ more/)).not.toBeInTheDocument();
    expect(
      within(card)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Inspect Documented node']);
  });

  it('renders malicious-looking documentation as inert text with responsive line clamps', () => {
    render(FocusCard, {
      props: {
        summary: {
          ...summaryFixture,
          documentation: {
            excerpt: '<script>alert(1)</script> <img src=x onerror=alert(1)>',
            documentationCount: 1,
            additionalDocumentationCount: 0,
          },
        },
        isInspected: false,
        motionKey: 'fixture:safe-documentation',
        onToggleInspection: vi.fn(),
        onCenterNode: vi.fn(),
      },
    });

    const section = screen.getByRole('region', { name: 'Documentation' });
    expect(section).toHaveTextContent(
      '<script>alert(1)</script> <img src=x onerror=alert(1)>',
    );
    expect(section.querySelector('script')).toBeNull();
    expect(section.querySelector('img')).toBeNull();
    expect(focusCardSource).not.toContain('{@html');
    expect(focusCardSource).not.toContain('innerHTML');
    expect(focusCardSource).toContain('-webkit-line-clamp: 3');
    expect(focusCardSource).toContain('-webkit-line-clamp: 2');
    expect(focusCardSource).toContain('-webkit-line-clamp: 1');
    expect(focusCardSource).toContain('overflow-wrap: anywhere');
  });

  it('places XSD documentation after orientation and before the unchanged DTD comment surface', () => {
    render(FocusCard, {
      props: {
        summary: {
          ...summaryFixture,
          xsdProperties: [{ id: 'scope', label: 'Scope', value: 'Global' }],
          hasXsdPresentation: true,
          documentation: {
            excerpt: 'Documentation excerpt.',
            documentationCount: 1,
            additionalDocumentationCount: 0,
          },
          commentCount: 1,
          commentExcerpt: 'Unchanged DTD comment fixture.',
        },
        isInspected: false,
        motionKey: 'fixture:placement',
        onToggleInspection: vi.fn(),
        onCenterNode: vi.fn(),
      },
    });

    const orientation = screen.getByLabelText('XSD orientation');
    const documentation = screen.getByRole('region', {
      name: 'Documentation',
    });
    const comments = screen.getByLabelText('1 comment');
    expect(
      orientation.compareDocumentPosition(documentation) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      documentation.compareDocumentPosition(comments) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('renders a safe noninteractive comment excerpt and additional count', () => {
    render(FocusCard, {
      props: {
        summary: {
          ...summaryFixture,
          commentCount: 3,
          commentExcerpt: '<script>safe text</script>\nsecond line',
        },
        isInspected: false,
        motionKey: 'fixture:comments',
        onToggleInspection: vi.fn(),
        onCenterNode: vi.fn(),
      },
    });

    const section = screen.getByLabelText('3 comments');
    expect(within(section).getByText('Comments')).toBeVisible();
    expect(section.querySelector('.comment-excerpt')).toHaveTextContent(
      '<script>safe text</script> second line',
    );
    expect(within(section).getByText('+2 more')).toBeVisible();
    expect(within(section).queryByRole('button')).not.toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
    expect(focusCardSource).not.toContain('@html');
    expect(focusCardSource).toContain('-webkit-line-clamp: 2');
    expect(focusCardSource).toContain('-webkit-line-clamp: 1');
  });

  it('uses the singular Comment label for one attached comment', () => {
    render(FocusCard, {
      props: {
        summary: {
          ...summaryFixture,
          commentCount: 1,
          commentExcerpt: 'One comment',
        },
        isInspected: false,
        motionKey: 'fixture:one-comment',
        onToggleInspection: vi.fn(),
        onCenterNode: vi.fn(),
      },
    });

    const section = screen.getByLabelText('1 comment');
    expect(within(section).getByText('Comment')).toBeVisible();
    expect(within(section).queryByText(/\+\d+ more/)).not.toBeInTheDocument();
  });

  it('renders the complete five-reference chapter production model', async () => {
    render(App);
    navigationStore.initializeAt(bookDtdNodeIds.chapter);

    const card = await screen.findByRole('article', { name: 'chapter' });
    expect(
      within(card)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual([
      'Inspect chapter',
      'View source for chapter',
      'Center title',
      'Center epigraph?',
      'Center section*',
      'Center figure*',
      'Center note*',
    ]);
    expect(within(card).getByLabelText('Content model')).toHaveTextContent(
      '(title, epigraph?, section*, figure*, note*)',
    );
    expect(within(card).queryByText('+2 more')).not.toBeInTheDocument();
    expect(within(card).queryByText('5 children')).not.toBeInTheDocument();
    expect(within(card).getByText('sample.book.dtd')).toBeVisible();
    expect(
      within(card).getByRole('button', { name: 'Center figure*' }),
    ).toBeVisible();
    expect(
      within(card).getByRole('button', { name: 'Center note*' }),
    ).toBeVisible();
  });

  it('shows a concise leaf state, applicable context, and no unsupported placeholders', async () => {
    render(App);
    navigationStore.initializeAt(bookDtdNodeIds.title);

    const card = await screen.findByRole('article', { name: 'title' });
    expect(within(card).getByText('No child structures')).toBeVisible();
    expect(within(card).queryByText(/0 children/i)).not.toBeInTheDocument();
    expect(within(card).getByText('Used by 3')).toBeVisible();
    expect(within(card).queryByText('book.dtd')).not.toBeInTheDocument();
    expect(
      within(card).queryByRole('list', {
        name: 'Immediate child structures',
      }),
    ).not.toBeInTheDocument();
    expect(card).not.toHaveTextContent(
      /attribute|documentation|comment|namespace|source snippet/i,
    );
  });

  it('keeps Inspect separate, accessible, pressed, and independent from focus', async () => {
    render(App);

    const inspect = screen.getByRole('button', { name: 'Inspect book' });
    expect(inspect).toHaveAttribute('aria-pressed', 'false');
    expect(
      inspect.closest('article')?.querySelector('button button'),
    ).toBeNull();

    await fireEvent.click(inspect);

    expect(get(navigationStore.currentFocusNodeId)).toBe(bookDtdNodeIds.book);
    expect(
      screen.getByRole('button', { name: 'Close inspection for book' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('complementary', { name: 'Schema inspector' }),
    ).toHaveTextContent('book');

    await fireEvent.click(
      screen.getByRole('button', { name: 'Close inspection for book' }),
    );
    expect(
      screen.getByRole('button', { name: 'Inspect book' }),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('preserves the restrained live-region announcement after navigation', async () => {
    render(App);
    const status = screen.getByRole('status');

    await fireEvent.click(
      screen.getByRole('button', {
        name: 'Navigate leafward to front.matter, DTD element declaration',
      }),
    );

    await waitFor(() =>
      expect(status).toHaveTextContent(
        'Focused: front.matter, DTD element declaration. 2 children.',
      ),
    );
    expect(status).not.toHaveTextContent('title.page');
    expect(status).not.toHaveTextContent('preface?');
  });

  it('renders a self closure as information while keeping Inspect operable', async () => {
    const onCenterNode = vi.fn();
    const onToggleInspection = vi.fn();
    render(FocusCard, {
      props: {
        summary: {
          ...summaryFixture,
          nodeId: 'section',
          displayName: 'section',
          declaration: '(section*)',
          contentModelParts: [
            { kind: 'text', id: 'open', text: '(' },
            {
              kind: 'nodeReference',
              id: 'section-section',
              nodeId: 'section',
              displayName: 'section',
              occurrence: '*',
              relationshipLabel: 'Recursive child',
              disposition: 'terminalCycleClosure',
              isCurrentFocusClosure: true,
              terminalLabel: 'Already the current element',
            },
            { kind: 'text', id: 'close', text: ')' },
          ],
          orderedDestinationSummaries: [],
          destinationCount: 1,
        },
        isInspected: false,
        motionKey: 'section',
        onCenterNode,
        onToggleInspection,
      },
    });

    expect(screen.getByText('Recursive child:')).toBeVisible();
    expect(screen.getByText('Already the current element')).toBeVisible();
    expect(
      screen.queryByRole('button', {
        name: /Navigate|Return/,
      }),
    ).not.toBeInTheDocument();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Inspect section' }),
    );
    expect(onToggleInspection).toHaveBeenCalledWith('section');
    expect(onCenterNode).not.toHaveBeenCalled();
  });
});
