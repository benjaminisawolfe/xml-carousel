import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/svelte';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../app/App.svelte';
import { inspectorStore } from '../app/stores/inspectorStore';
import { navigationStore } from '../app/stores/navigationStore';
import { replaceProjectSession } from '../app/stores/projectSession';
import { projectSessionResetStore } from '../app/stores/projectSessionResetStore';
import { activeProjectStore } from '../app/stores/projectStore';
import {
  getOutgoingStructuralRelationships,
  type SchemaEdgeKind,
  type SchemaProject,
  type SchemaRelationship,
} from '../schema/model';
import {
  bookDtdNodeIds,
  bookDtdProject,
} from '../schema/samples/bookDtdProject';
import basicXsd from '../../tests/fixtures/xsd/basic-structure.xsd?raw';
import documentElementsXsd from '../../tests/fixtures/xsd/document-elements.xsd?raw';
import duplicateXsd from '../../tests/fixtures/xsd/duplicate-symbols.xsd?raw';
import externalXsd from '../../tests/fixtures/xsd/external-references.xsd?raw';
import malformedXsd from '../../tests/fixtures/xsd/malformed-xml.xsd?raw';
import mutualRecursionXsd from '../../tests/fixtures/xsd/mutual-recursion.xsd?raw';
import sameDocumentXsd from '../../tests/fixtures/xsd/same-document-references.xsd?raw';
import wrongRootXsd from '../../tests/fixtures/xsd/wrong-root-namespace.xsd?raw';
import attributesXsd from '../../tests/fixtures/xsd/attributes.xsd?raw';
import attributeErrorsXsd from '../../tests/fixtures/xsd/attribute-errors.xsd?raw';
import simpleTypeEnumerationsXsd from '../../tests/fixtures/xsd/simple-type-enumerations.xsd?raw';
import complexTypeDerivationsXsd from '../../tests/fixtures/xsd/complex-type-derivations.xsd?raw';
import annotationsXsd from '../../tests/fixtures/xsd/annotations.xsd?raw';
import annotationErrorsXsd from '../../tests/fixtures/xsd/annotation-errors.xsd?raw';
import dtdMarkup from '../../tests/fixtures/dtd/source-markup.dtd?raw';

const unresolvedXsd =
  '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:t="urn:t" targetNamespace="urn:t"><xs:element name="root" type="t:Missing"/></xs:schema>';
const emptyDocumentationXsd =
  '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="empty"><xs:annotation><xs:documentation xml:lang=""/><xs:appinfo>technical only</xs:appinfo></xs:annotation></xs:element></xs:schema>';

function restoreSample(): void {
  const result = replaceProjectSession({
    project: bookDtdProject,
    initialFocusNodeId: bookDtdNodeIds.book,
    metadata: { origin: 'sample', sourceFilename: 'book.dtd' },
  });
  if (!result.applied) throw new Error('Expected sample restoration to apply.');
}

function schemaFile(
  name: string,
  sourceText: string,
  type: string,
  read: () => Promise<string> = () => Promise.resolve(sourceText),
): File {
  const file = new File([sourceText], name, { type });
  Object.defineProperty(file, 'text', {
    configurable: true,
    value: read,
  });
  return file;
}

function inputFor(
  container: HTMLElement,
  format: 'dtd' | 'xsd',
): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(
    `#${format}-file-input[type="file"]`,
  );
  if (!input) throw new Error(`Expected the ${format.toUpperCase()} input.`);
  return input;
}

async function selectFile(
  container: HTMLElement,
  format: 'dtd' | 'xsd',
  file: File,
): Promise<void> {
  await fireEvent.change(inputFor(container, format), {
    target: { files: [file] },
  });
}

async function waitUntilSettled(
  format: 'dtd' | 'xsd',
): Promise<HTMLButtonElement> {
  const button = await screen.findByRole('button', {
    name: format === 'dtd' ? 'Open DTD' : 'Open XSD',
  });
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error('Expected a native Open button.');
  }
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

function currentSession() {
  return {
    active: get(activeProjectStore),
    navigation: get(navigationStore),
    inspector: get(inspectorStore),
    presentation: get(projectSessionResetStore),
  };
}

function relationship(
  project: SchemaProject,
  sourceNodeId: string,
  kind: SchemaEdgeKind,
  targetName?: string,
): SchemaRelationship {
  const result = getOutgoingStructuralRelationships(project, sourceNodeId).find(
    ({ edge, node }) =>
      edge.kind === kind &&
      (targetName === undefined || node.name === targetName),
  );
  if (!result) {
    throw new Error(
      `Expected ${kind} from ${sourceNodeId} to ${targetName ?? 'a target'}.`,
    );
  }
  return result;
}

async function followVisibleRelationship(
  relationshipToFollow: SchemaRelationship,
): Promise<void> {
  const candidate = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[data-carousel-leafward-candidate-edge-id]',
    ),
  ).find(
    (element) =>
      element.dataset.carouselLeafwardCandidateEdgeId ===
      relationshipToFollow.edge.id,
  );
  if (!candidate) {
    throw new Error(
      `Expected visible candidate ${relationshipToFollow.edge.id}.`,
    );
  }

  await fireEvent.click(
    within(candidate).getByRole('button', { name: /Navigate leafward/ }),
  );
  await waitFor(() => {
    const path = get(navigationStore).navigationPath;
    expect(path[path.length - 1]).toBe(relationshipToFollow.node.id);
  });
}

beforeEach(restoreSample);
afterEach(() => {
  restoreSample();
  vi.restoreAllMocks();
});

describe('rendered local XSD import success flow', () => {
  it('shows inspected annotation documentation without changing cards, focus, or destinations', async () => {
    const { container } = render(App);
    await selectFile(
      container,
      'xsd',
      schemaFile('annotations.xsd', annotationsXsd, 'application/xml'),
    );
    await waitUntilSettled('xsd');

    const active = get(activeProjectStore);
    expect(active.sourceFilename).toBe('annotations.xsd');
    const root = active.project.nodes.find(
      ({ kind, name }) => kind === 'globalElement' && name === 'root',
    )!;
    const path = get(navigationStore).navigationPath;
    expect(path[path.length - 1]).toBe(root.id);
    expect(active.xsdMetadataByNodeId?.[root.id]?.annotations).toHaveLength(1);
    expect(
      active.project.nodes.some(({ kind }) =>
        ['xsdAnnotation', 'xsdDocumentation', 'xsdAppInfo'].includes(kind),
      ),
    ).toBe(true);
    expect(
      getOutgoingStructuralRelationships(active.project, root.id),
    ).toHaveLength(2);
    const rootCard = screen.getByRole('article', { name: 'root' });
    const cardDocumentation = within(rootCard).getByRole('region', {
      name: 'Documentation',
    });
    expect(
      within(cardDocumentation).getByText('Documentation · en'),
    ).toBeVisible();
    expect(
      within(cardDocumentation).getByText('Root element documentation.'),
    ).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Documentation' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'AppInfo' })).toBeNull();

    await fireEvent.click(screen.getByRole('button', { name: 'Inspect root' }));
    expect(get(inspectorStore).inspectedNodeId).toBe(root.id);
    const inspector = screen.getByRole('complementary', {
      name: 'Schema inspector',
    });
    const documentation = within(inspector).getByRole('region', {
      name: 'Documentation',
    });
    expect(
      within(documentation).getByText('Root element documentation.'),
    ).toBeVisible();
    expect(within(documentation).getByText('Language')).toBeVisible();
    expect(within(documentation).getByText('en')).toBeVisible();
    expect(screen.getAllByText('View source markup')).toHaveLength(1);
    expect(screen.queryByText('View raw XML')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'AppInfo' })).toBeNull();
    expect(get(navigationStore).navigationPath).toEqual(path);
    expect(
      getOutgoingStructuralRelationships(active.project, root.id),
    ).toHaveLength(2);
  });

  it('renders every Schema overview block safely in separate Documentation and AppInfo sections', async () => {
    const { container } = render(App);
    await selectFile(
      container,
      'xsd',
      schemaFile('annotations.xsd', annotationsXsd, 'application/xml'),
    );
    await waitUntilSettled('xsd');

    const active = get(activeProjectStore);
    const schemaId = active.project.rootNodeIds[0]!;
    await fireEvent.click(
      screen.getByRole('button', { name: 'Center Schema overview' }),
    );
    await waitFor(() =>
      expect(get(navigationStore).navigationPath).toEqual([schemaId]),
    );
    const overviewCard = screen.getByRole('article', {
      name: 'Schema overview',
    });
    const cardDocumentation = within(overviewCard).getByRole('region', {
      name: 'Documentation',
    });
    expect(
      within(cardDocumentation).getByText('Documentation · en'),
    ).toBeVisible();
    expect(cardDocumentation).toHaveTextContent(
      'Defines the persistent identity, exactly. Use <literal> as text. Entity & decoded.',
    );
    expect(
      within(cardDocumentation).getByText('+1 more documentation block'),
    ).toBeVisible();
    expect(cardDocumentation).not.toHaveTextContent('Documentation française.');
    expect(cardDocumentation).not.toHaveTextContent('No text content.');
    expect(cardDocumentation).not.toHaveTextContent('AppInfo');
    expect(
      document.querySelectorAll('[data-focus-card-documentation]'),
    ).toHaveLength(1);

    const navigationBeforeInspection = get(navigationStore);
    await fireEvent.click(
      within(overviewCard).getByRole('button', {
        name: 'Inspect Schema overview',
      }),
    );
    expect(get(navigationStore)).toBe(navigationBeforeInspection);

    const inspector = screen.getByRole('complementary', {
      name: 'Schema inspector',
    });
    const documentation = within(inspector).getByRole('region', {
      name: 'Documentation',
    });
    const appInfo = within(inspector).getByRole('region', { name: 'AppInfo' });
    const documentationItems = within(documentation).getAllByRole('listitem');
    const appInfoItems = within(appInfo).getAllByRole('listitem');
    expect(documentationItems).toHaveLength(3);
    expect(appInfoItems).toHaveLength(2);
    expect(documentationItems.map((item) => item.textContent)).toEqual([
      expect.stringContaining(
        'Defines the persistent identity, exactly. Use <literal> as text. Entity & decoded.',
      ),
      expect.stringContaining('Documentation française.'),
      expect.stringContaining('No text content.'),
    ]);
    expect(within(documentationItems[0]!).getByText('en')).toBeVisible();
    expect(
      within(documentationItems[0]!).getByText('docs/schema'),
    ).toBeVisible();
    expect(within(documentationItems[1]!).getByText('fr')).toBeVisible();
    expect(within(appInfoItems[0]!).getByText('alpha')).toBeVisible();
    expect(within(appInfoItems[0]!).getByText('tool/schema')).toBeVisible();
    expect(
      within(appInfoItems[1]!).getByText('No extracted text content.'),
    ).toBeVisible();
    expect(documentation.querySelector('details')).toBeNull();
    expect(appInfo.querySelector('details')).toBeNull();
    expect(document.querySelectorAll('details')).toHaveLength(1);
    expect(document.querySelectorAll('details[open]')).toHaveLength(0);
    expect(within(documentation).queryByRole('link')).not.toBeInTheDocument();
    expect(within(appInfo).queryByRole('link')).not.toBeInTheDocument();

    const navigationBefore = get(navigationStore);
    const inspectorBefore = get(inspectorStore);
    const announcementBefore = screen.getByRole('status').textContent;
    const disclosure = screen.getByText('View source markup');
    await disclosure.click();
    expect(disclosure.closest('details')).toHaveAttribute('open');
    const schemaMetadata = active.xsdMetadataByNodeId![schemaId]!;
    const exactSchemaMarkup = annotationsXsd.slice(
      schemaMetadata.sourceRange.start.offset,
      schemaMetadata.sourceRange.end.offset,
    );
    expect(
      document.querySelector('[data-node-inspector] pre code')?.textContent,
    ).toBe(exactSchemaMarkup);
    expect(exactSchemaMarkup).toMatch(/^<xs:schema[\s\S]*<\/xs:schema>$/);
    expect(exactSchemaMarkup).toContain(
      `<xs:documentation xml:lang='en' source="docs/schema">`,
    );
    expect(screen.queryByText('View raw XML')).not.toBeInTheDocument();
    expect(document.querySelector('m\\:em')).toBeNull();
    expect(document.querySelector('script')).toBeNull();
    expect(documentation.querySelector('img')).toBeNull();
    expect(appInfo.querySelector('img')).toBeNull();
    expect(get(navigationStore)).toEqual(navigationBefore);
    expect(get(inspectorStore)).toEqual(inspectorBefore);
    expect(screen.getByRole('status')).toHaveTextContent(
      announcementBefore ?? '',
    );
  });

  it('renders source-ordered documentation only on representative focused XSD owners', async () => {
    const { container } = render(App);
    await selectFile(
      container,
      'xsd',
      schemaFile('annotations.xsd', annotationsXsd, 'application/xml'),
    );
    await waitUntilSettled('xsd');

    const active = get(activeProjectStore);
    const nodeWithText = (text: string) =>
      active.project.nodes.find((node) =>
        active.xsdMetadataByNodeId?.[node.id]?.annotations?.some((annotation) =>
          annotation.entries.some(
            (entry) => entry.kind === 'documentation' && entry.text === text,
          ),
        ),
      )!;
    const root = nodeWithText('Root element documentation.');
    expect(inspectorStore.inspect(root.id).applied).toBe(true);
    const inspectedNodeId = get(inspectorStore).inspectedNodeId;
    const projectBefore = JSON.stringify(active.project);
    const cases = [
      ['Root element documentation.', 0, 'en'],
      ['Base type documentation.', 0, undefined],
      ['Base sequence documentation.', 0, undefined],
      ['Allowed status values.', 0, undefined],
      ['Restriction documentation.', 0, undefined],
      ['Extended type documentation.', 1, undefined],
      ['Extension documentation.', 0, undefined],
      ['Complex restriction documentation.', 0, undefined],
      ['Local child documentation.', 0, undefined],
      ['Local attribute documentation.', 0, undefined],
    ] as const;

    for (const [text, additionalCount, language] of cases) {
      const node = nodeWithText(text);
      expect(navigationStore.initializeAt(node.id).applied).toBe(true);
      await waitFor(() =>
        expect(get(navigationStore).navigationPath).toEqual([node.id]),
      );
      const focusCard = document.querySelector<HTMLElement>(
        '[data-focus-card-information-layout]',
      );
      if (!focusCard) throw new Error('Expected a focused XSD card.');
      const documentation = within(focusCard).getByRole('region', {
        name: 'Documentation',
      });
      expect(within(documentation).getByText(text)).toBeVisible();
      expect(
        within(documentation).getByText(
          language ? `Documentation · ${language}` : 'Documentation',
        ),
      ).toHaveTextContent(
        language ? `Documentation · ${language}` : 'Documentation',
      );
      if (additionalCount === 0) {
        expect(
          within(documentation).queryByText(/more documentation blocks?/),
        ).not.toBeInTheDocument();
      } else {
        expect(
          within(documentation).getByText(
            `+${additionalCount} more documentation block`,
          ),
        ).toBeVisible();
      }
      expect(
        document.querySelectorAll('[data-focus-card-documentation]'),
      ).toHaveLength(1);
      for (const contextCard of document.querySelectorAll('.context-card')) {
        expect(contextCard).not.toHaveTextContent('Documentation');
      }
      expect(get(inspectorStore).inspectedNodeId).toBe(inspectedNodeId);
      expect(screen.getByRole('status')).not.toHaveTextContent(text);
    }

    const appInfoOnlyNodes = ['globalCode', 'extensionCode'].map((name) =>
      active.project.nodes.find(
        (node) => node.kind === 'attribute' && node.name === name,
      ),
    );
    for (const node of appInfoOnlyNodes) {
      if (!node) throw new Error('Expected an AppInfo-only attribute.');
      expect(navigationStore.initializeAt(node.id).applied).toBe(true);
      await waitFor(() =>
        expect(get(navigationStore).navigationPath).toEqual([node.id]),
      );
      expect(
        document.querySelector('[data-focus-card-documentation]'),
      ).toBeNull();
      expect(
        document.querySelector('[data-focus-card-information-layout]'),
      ).not.toHaveTextContent('AppInfo');
    }

    expect(JSON.stringify(get(activeProjectStore).project)).toBe(projectBefore);
  });

  it('keeps empty documentation and AppInfo in the inspector but off the focused card', async () => {
    const { container } = render(App);
    await selectFile(
      container,
      'xsd',
      schemaFile(
        'empty-documentation.xsd',
        emptyDocumentationXsd,
        'application/xml',
      ),
    );
    await waitUntilSettled('xsd');

    const active = get(activeProjectStore);
    const empty = active.project.nodes.find(
      ({ kind, name }) => kind === 'globalElement' && name === 'empty',
    )!;
    expect(get(navigationStore).navigationPath).toEqual([empty.id]);
    const focusCard = document.querySelector<HTMLElement>(
      '[data-focus-card-information-layout]',
    );
    if (!focusCard) throw new Error('Expected the empty element focus card.');
    expect(
      focusCard.querySelector('[data-focus-card-documentation]'),
    ).toBeNull();
    expect(focusCard).not.toHaveTextContent('No text content.');
    expect(focusCard).not.toHaveTextContent('AppInfo');

    await fireEvent.click(
      within(focusCard).getByRole('button', { name: 'Inspect empty' }),
    );
    const inspector = screen.getByRole('complementary', {
      name: 'Schema inspector',
    });
    expect(
      within(
        within(inspector).getByRole('region', { name: 'Documentation' }),
      ).getByText('No text content.'),
    ).toBeVisible();
    expect(
      within(
        within(inspector).getByRole('region', { name: 'AppInfo' }),
      ).getByText('technical only'),
    ).toBeVisible();
  });

  it('renders direct and forwarded annotation entries only on their normalized owners', async () => {
    const { container } = render(App);
    await selectFile(
      container,
      'xsd',
      schemaFile('annotations.xsd', annotationsXsd, 'application/xml'),
    );
    await waitUntilSettled('xsd');

    const active = get(activeProjectStore);
    const nodeWithText = (text: string) =>
      active.project.nodes.find((node) =>
        active.xsdMetadataByNodeId?.[node.id]?.annotations?.some((annotation) =>
          annotation.entries.some((entry) => entry.text === text),
        ),
      )!;
    const inspectAndExpect = async (
      nodeId: string,
      section: 'Documentation' | 'AppInfo',
      text: string,
    ) => {
      expect(inspectorStore.inspect(nodeId).applied).toBe(true);
      const inspector = screen.getByRole('complementary', {
        name: 'Schema inspector',
      });
      await waitFor(() =>
        expect(
          within(
            within(inspector).getByRole('region', { name: section }),
          ).getByText(text),
        ).toBeVisible(),
      );
      expect(screen.getAllByText('View source markup')).toHaveLength(1);
      expect(screen.queryByText('View raw XML')).not.toBeInTheDocument();
    };

    for (const text of [
      'Root element documentation.',
      'Base type documentation.',
      'Base sequence documentation.',
      'Allowed status values.',
      'Restriction documentation.',
      'Extension documentation.',
      'Complex restriction documentation.',
      'Local attribute documentation.',
    ]) {
      await inspectAndExpect(nodeWithText(text).id, 'Documentation', text);
    }

    const extensionNode = nodeWithText('Extension documentation.');
    await inspectAndExpect(
      extensionNode.id,
      'Documentation',
      'Extension documentation.',
    );
    await fireEvent.click(screen.getByText('View source markup'));
    const extensionMetadata = active.xsdMetadataByNodeId![extensionNode.id]!;
    const exactExtensionMarkup = annotationsXsd.slice(
      extensionMetadata.sourceRange.start.offset,
      extensionMetadata.sourceRange.end.offset,
    );
    expect(
      document.querySelector('[data-node-inspector] pre code')?.textContent,
    ).toBe(exactExtensionMarkup);
    expect(exactExtensionMarkup).toContain('base="a:BaseType"');
    expect(exactExtensionMarkup).toContain('Extension documentation.');
    expect(exactExtensionMarkup).toContain('<xs:sequence>');
    expect(exactExtensionMarkup).toContain('name="extra"');
    expect(exactExtensionMarkup).toContain('name="extensionCode"');
    expect(exactExtensionMarkup).toContain('extension attribute metadata');

    const statusRestriction = nodeWithText('Restriction documentation.');
    expect(inspectorStore.inspect(statusRestriction.id).applied).toBe(true);
    const inspector = screen.getByRole('complementary', {
      name: 'Schema inspector',
    });
    await waitFor(() =>
      expect(
        within(
          within(inspector).getByRole('region', { name: 'AppInfo' }),
        ).getByText('tool/active'),
      ).toBeVisible(),
    );
    await fireEvent.click(screen.getByText('View source markup'));
    const restrictionMetadata =
      active.xsdMetadataByNodeId![statusRestriction.id]!;
    const exactRestrictionMarkup = annotationsXsd.slice(
      restrictionMetadata.sourceRange.start.offset,
      restrictionMetadata.sourceRange.end.offset,
    );
    expect(
      document.querySelector('[data-node-inspector] pre code')?.textContent,
    ).toBe(exactRestrictionMarkup);
    expect(exactRestrictionMarkup).toContain('<xs:enumeration value="active">');
    expect(exactRestrictionMarkup).toContain(
      '<xs:appinfo source="tool/active">',
    );

    const extendedType = nodeWithText('Extended type documentation.');
    expect(inspectorStore.inspect(extendedType.id).applied).toBe(true);
    await waitFor(() =>
      expect(
        within(inspector).getByRole('heading', { name: 'ExtendedType' }),
      ).toBeVisible(),
    );
    const extendedDocumentation = within(inspector).getByRole('region', {
      name: 'Documentation',
    });
    expect(
      within(extendedDocumentation)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      expect.stringContaining('Extended type documentation.'),
      expect.stringContaining('Complex-content documentation.'),
    ]);
    expect(
      within(extendedDocumentation).queryByText('Root element documentation.'),
    ).not.toBeInTheDocument();
    await fireEvent.click(screen.getByText('View source markup'));
    const extendedMetadata = active.xsdMetadataByNodeId![extendedType.id]!;
    const exactExtendedMarkup = annotationsXsd.slice(
      extendedMetadata.sourceRange.start.offset,
      extendedMetadata.sourceRange.end.offset,
    );
    expect(
      document.querySelector('[data-node-inspector] pre code')?.textContent,
    ).toBe(exactExtendedMarkup);
    expect(exactExtendedMarkup).toContain('<xs:complexContent>');
    expect(exactExtendedMarkup).toContain('Complex-content documentation.');
    expect(exactExtendedMarkup).toContain('<xs:extension base="a:BaseType">');

    const globalAttribute = nodeWithText('global attribute metadata');
    await inspectAndExpect(
      globalAttribute.id,
      'AppInfo',
      'global attribute metadata',
    );
    const extensionAttribute = nodeWithText('extension attribute metadata');
    await inspectAndExpect(
      extensionAttribute.id,
      'AppInfo',
      'extension attribute metadata',
    );
    const attributeDisclosure = screen.getByText('View source markup');
    await fireEvent.click(attributeDisclosure);
    const attributeMetadata =
      active.xsdMetadataByNodeId![extensionAttribute.id]!;
    const exactAttributeMarkup = annotationsXsd.slice(
      attributeMetadata.sourceRange.start.offset,
      attributeMetadata.sourceRange.end.offset,
    );
    expect(
      document.querySelector('[data-node-inspector] pre code')?.textContent,
    ).toBe(exactAttributeMarkup);
    expect(exactAttributeMarkup).toMatch(
      /^<xs:attribute name="extensionCode"[\s\S]*<\/xs:attribute>$/,
    );
  });

  it('clears annotation sections when an ordinary XSD replaces the annotated project', async () => {
    const { container } = render(App);
    await selectFile(
      container,
      'xsd',
      schemaFile('annotations.xsd', annotationsXsd, 'application/xml'),
    );
    await waitUntilSettled('xsd');
    const annotated = get(activeProjectStore);
    expect(
      inspectorStore.inspect(annotated.project.rootNodeIds[0]!).applied,
    ).toBe(true);
    const inspector = screen.getByRole('complementary', {
      name: 'Schema inspector',
    });
    await waitFor(() =>
      expect(
        within(inspector).getByRole('region', { name: 'Documentation' }),
      ).toBeVisible(),
    );
    expect(
      document.querySelector('[data-focus-card-documentation]'),
    ).not.toBeNull();

    await selectFile(
      container,
      'xsd',
      schemaFile('basic.xsd', basicXsd, 'application/xml'),
    );
    await waitUntilSettled('xsd');
    const ordinary = get(activeProjectStore);
    const root = ordinary.project.nodes.find(
      ({ kind, name }) => kind === 'globalElement' && name === 'book',
    )!;
    expect(inspectorStore.inspect(root.id).applied).toBe(true);
    await waitFor(() =>
      expect(get(inspectorStore).inspectedNodeId).toBe(root.id),
    );
    expect(
      within(inspector).queryByRole('region', { name: 'Documentation' }),
    ).not.toBeInTheDocument();
    expect(
      within(inspector).queryByRole('region', { name: 'AppInfo' }),
    ).not.toBeInTheDocument();
    expect(
      document.querySelector('[data-focus-card-documentation]'),
    ).toBeNull();
  });

  it('preserves the active annotated project and session after annotation parse errors', async () => {
    const { container } = render(App);
    await selectFile(
      container,
      'xsd',
      schemaFile('annotations.xsd', annotationsXsd, 'application/xml'),
    );
    await waitUntilSettled('xsd');
    await fireEvent.click(screen.getByRole('button', { name: 'Inspect root' }));
    const before = currentSession();

    await selectFile(
      container,
      'xsd',
      schemaFile(
        'annotation-errors.xsd',
        annotationErrorsXsd,
        'application/xml',
      ),
    );
    await waitUntilSettled('xsd');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not open annotation-errors.xsd',
    );
    const after = currentSession();
    expect(after.active).toEqual(before.active);
    expect(after.navigation).toEqual(before.navigation);
    expect(after.inspector).toEqual(before.inspector);
    expect(after.active.sourceFilename).toBe('annotations.xsd');
  });

  it('navigates complex derivation doorways, declared bodies, bases, and rootward history', async () => {
    const { container } = render(App);
    await selectFile(
      container,
      'xsd',
      schemaFile(
        'complex-type-derivations.xsd',
        complexTypeDerivationsXsd,
        'application/xml',
      ),
    );
    await waitUntilSettled('xsd');

    const active = get(activeProjectStore);
    const navigation = screen.getByRole('navigation', {
      name: 'Schema navigation',
    });
    const derived = active.project.nodes.find(
      ({ kind, name }) => kind === 'complexType' && name === 'BeforeDerived',
    )!;
    await fireEvent.click(
      within(navigation).getByRole('button', {
        name: 'Center BeforeDerived, Complex type declaration',
      }),
    );
    await waitFor(() =>
      expect(get(navigationStore).navigationPath).toEqual([derived.id]),
    );

    const derivedCard = screen.getByRole('article', {
      name: 'BeforeDerived',
    });
    expect(within(derivedCard).getByText('Derivation')).toBeVisible();
    expect(
      within(derivedCard).getAllByText('Extension').length,
    ).toBeGreaterThan(0);
    expect(
      within(derivedCard).getAllByText('BaseLater').length,
    ).toBeGreaterThan(0);
    expect(within(derivedCard).getByText('1 attribute')).toBeVisible();
    const extension = relationship(
      active.project,
      derived.id,
      'contains',
      'Extension of BeforeDerived',
    );
    await followVisibleRelationship(extension);

    const extensionCard = await screen.findByRole('article', {
      name: 'Extension of BeforeDerived',
    });
    expect(
      within(extensionCard).getAllByText('BaseLater').length,
    ).toBeGreaterThan(0);
    expect(within(extensionCard).getByText('1 attribute')).toBeVisible();
    const extensionToBase = relationship(
      active.project,
      extension.node.id,
      'extends',
      'BaseLater',
    );
    expect(
      within(extensionCard).getByRole('button', {
        name: /Navigate leafward through Base type to BaseLater/,
      }),
    ).toBeVisible();
    await fireEvent.click(
      within(extensionCard).getByRole('button', {
        name: 'Inspect Extension of BeforeDerived',
      }),
    );
    const inspector = screen.getByRole('complementary', {
      name: 'Schema inspector',
    });
    expect(
      within(
        within(inspector).getByRole('region', { name: 'Attributes' }),
      ).getByText('beforeCode'),
    ).toBeVisible();
    expect(
      within(inspector).getByRole('region', { name: 'Structure' }),
    ).toBeVisible();
    expect(
      within(inspector).getByRole('region', {
        name: 'Related definitions',
      }),
    ).toBeVisible();
    await fireEvent.click(
      within(inspector).getByRole('button', {
        name: 'Follow Base type to BaseLater, Complex type declaration',
      }),
    );
    await waitFor(() =>
      expect(get(navigationStore).navigationPath).toEqual([
        derived.id,
        extension.node.id,
        extensionToBase.node.id,
      ]),
    );
    expect(get(inspectorStore).inspectedNodeId).toBe(extension.node.id);

    await fireEvent.click(
      screen.getByRole('button', {
        name: /Navigate rootward to Extension of BeforeDerived/,
      }),
    );
    await waitFor(() =>
      expect(get(navigationStore).navigationPath).toEqual([
        derived.id,
        extension.node.id,
      ]),
    );
    await fireEvent.click(
      screen.getByRole('button', {
        name: /Navigate rootward to BeforeDerived/,
      }),
    );
    await waitFor(() =>
      expect(get(navigationStore).navigationPath).toEqual([derived.id]),
    );

    const restricted = active.project.nodes.find(
      ({ kind, name }) => kind === 'complexType' && name === 'Restricted',
    )!;
    await fireEvent.click(
      within(navigation).getByRole('button', {
        name: 'Center Restricted, Complex type declaration',
      }),
    );
    await waitFor(() =>
      expect(get(navigationStore).navigationPath).toEqual([restricted.id]),
    );
    const restriction = relationship(
      active.project,
      restricted.id,
      'contains',
      'Restriction of Restricted',
    );
    await followVisibleRelationship(restriction);
    await fireEvent.click(
      within(
        screen.getByRole('article', { name: 'Restriction of Restricted' }),
      ).getByRole('button', { name: 'Inspect Restriction of Restricted' }),
    );
    expect(
      within(inspector).queryByRole('region', { name: 'Allowed values' }),
    ).toBeNull();
    expect(screen.getByText('View source markup')).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('navigates restrictions and inspects ordered values without enumeration destinations', async () => {
    const { container } = render(App);
    await selectFile(
      container,
      'xsd',
      schemaFile(
        'simple-type-enumerations.xsd',
        simpleTypeEnumerationsXsd,
        'application/xml',
      ),
    );
    await waitUntilSettled('xsd');

    const active = get(activeProjectStore);
    const statusType = active.project.nodes.find(
      ({ kind, name }) => kind === 'simpleType' && name === 'StatusType',
    )!;
    await fireEvent.click(
      screen.getByRole('button', {
        name: 'Center StatusType, Simple type declaration',
      }),
    );
    await waitFor(() =>
      expect(get(navigationStore).navigationPath).toEqual([statusType.id]),
    );

    const statusCard = screen.getByRole('article', { name: 'StatusType' });
    expect(within(statusCard).getByText('Base type')).toBeVisible();
    expect(within(statusCard).getAllByText('xs:string').length).toBeGreaterThan(
      0,
    );
    expect(within(statusCard).getByText('Allowed values')).toBeVisible();
    expect(within(statusCard).getByText('5')).toBeVisible();
    const statusRestriction = relationship(
      active.project,
      statusType.id,
      'contains',
      'Restriction of StatusType',
    );
    expect(
      within(statusCard).getByRole('button', {
        name: /Navigate leafward through Restriction/,
      }),
    ).toBeVisible();
    await followVisibleRelationship(statusRestriction);

    const restrictionCard = await screen.findByRole('article', {
      name: 'Restriction of StatusType',
    });
    expect(
      within(restrictionCard).getAllByText('xs:string').length,
    ).toBeGreaterThan(0);
    expect(
      within(restrictionCard).getByRole('button', {
        name: /Navigate leafward through Base type to xs:string/,
      }),
    ).toBeVisible();
    await fireEvent.click(
      within(restrictionCard).getByRole('button', {
        name: 'Inspect Restriction of StatusType',
      }),
    );
    const inspector = screen.getByRole('complementary', {
      name: 'Schema inspector',
    });
    const values = within(inspector).getByRole('region', {
      name: 'Allowed values',
    });
    expect(
      within(values)
        .getAllByRole('listitem')
        .map((row) => row.textContent),
    ).toEqual([
      'active',
      'paused',
      'active',
      '(empty string)',
      'a-very-long-status-value-that-must-wrap-safely-in-the-inspector',
    ]);
    expect(within(values).queryByRole('button')).toBeNull();
    expect(
      container.querySelector(
        '[data-carousel-leafward-candidate-id*="enumeration"]',
      ),
    ).toBeNull();
    expect(
      within(
        screen.getByRole('navigation', { name: 'Schema navigation' }),
      ).queryByRole('heading', { name: /enumerations?/i }),
    ).toBeNull();
    expect(screen.getByText('View source markup')).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('presents XSD attributes in inspectors, counts, navigation, and schema-document context', async () => {
    const { container } = render(App);
    await selectFile(
      container,
      'xsd',
      schemaFile('attributes.xsd', attributesXsd, 'application/xml'),
    );
    await waitUntilSettled('xsd');

    const active = get(activeProjectStore);
    const root = active.project.nodes.find(
      ({ kind, name }) => kind === 'globalElement' && name === 'root',
    )!;
    const rootCard = screen.getByRole('article', { name: 'root' });
    expect(get(navigationStore).navigationPath).toEqual([root.id]);
    await fireEvent.click(
      within(rootCard).getByRole('button', {
        name: /Navigate leafward through Type to RootType, Complex type declaration/,
      }),
    );

    const typeCard = await screen.findByRole('article', { name: 'RootType' });
    expect(within(typeCard).getByText('6 attributes')).toBeVisible();
    expect(within(typeCard).queryByText('status')).not.toBeInTheDocument();
    await fireEvent.click(
      within(typeCard).getByRole('button', { name: 'Inspect RootType' }),
    );
    const inspector = screen.getByRole('complementary', {
      name: 'Schema inspector',
    });
    const attributes = within(inspector).getByRole('region', {
      name: 'Attributes',
    });
    const attributeRows = within(attributes).getAllByRole('listitem');
    expect(
      attributeRows.map((row) => row.querySelector('strong')?.textContent),
    ).toEqual(['id', 'status', 'legacy', 'lang', 't:code', 'rating']);
    expect(within(attributeRows[0]!).getByText('xs:ID')).toBeVisible();
    expect(
      within(attributeRows[0]!).getByText('required · unqualified'),
    ).toBeVisible();
    expect(within(attributeRows[1]!).getByText('StatusType')).toBeVisible();
    expect(
      within(attributeRows[1]!).getByText(
        'optional · unqualified · default "active"',
      ),
    ).toBeVisible();
    expect(
      within(attributeRows[4]!).getByText('Reference: t:code'),
    ).toBeVisible();
    expect(within(attributeRows[4]!).getByText('optional')).toBeVisible();
    expect(within(attributes).queryByRole('button')).toBeNull();
    expect(within(attributes).queryByRole('link')).toBeNull();

    await fireEvent.click(
      within(
        screen.getByRole('navigation', { name: 'Schema navigation' }),
      ).getByRole('button', { name: 'Center Schema overview' }),
    );
    const overviewCard = await screen.findByRole('article', {
      name: 'Schema overview',
    });
    expect(within(overviewCard).getByText('1 global attribute')).toBeVisible();
    await fireEvent.click(
      within(overviewCard).getByRole('button', {
        name: 'Inspect Schema overview',
      }),
    );
    const globalAttributes = within(inspector).getByRole('region', {
      name: 'Global attributes',
    });
    const globalAttributeRow = within(globalAttributes).getByRole('listitem');
    expect(within(globalAttributeRow).getByText('code')).toBeVisible();
    expect(within(globalAttributeRow).getByText('xs:string')).toBeVisible();
    expect(
      within(globalAttributeRow).getByText('Global · urn:attributes'),
    ).toBeVisible();
    expect(
      within(globalAttributeRow).getByText('fixed "GLOBAL"'),
    ).toBeVisible();
    expect(
      within(
        screen.getByRole('navigation', { name: 'Schema navigation' }),
      ).getByRole('heading', { name: 'Global attributes' }),
    ).toBeInTheDocument();
    expect(
      [
        ...container.querySelectorAll('[data-carousel-leafward-candidate-id]'),
      ].some((element) =>
        active.project.nodes
          .filter(({ kind }) => kind === 'attribute')
          .some(
            ({ id }) =>
              element.getAttribute('data-carousel-leafward-candidate-id') ===
              id,
          ),
      ),
    ).toBe(true);
    expect(screen.getByText('View source markup')).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('activates basic XSD at its unique document element and keeps overview separate', async () => {
    const { container } = render(App);

    await selectFile(
      container,
      'xsd',
      schemaFile('basic-structure.xsd', basicXsd, 'application/xml'),
    );
    const openButton = await waitUntilSettled('xsd');
    const active = get(activeProjectStore);
    const schemaNodeId = active.project.rootNodeIds[0]!;
    const book = active.project.nodes.find(
      ({ kind, name }) => kind === 'globalElement' && name === 'book',
    )!;

    const focusHeading = screen.getByRole('heading', {
      level: 2,
      name: 'book',
    });
    await waitFor(() => expect(focusHeading).toHaveFocus());
    expect(focusHeading).toHaveAttribute('tabindex', '-1');
    expect(openButton).not.toHaveFocus();
    expect(
      within(screen.getByRole('banner')).getByText('basic-structure.xsd'),
    ).toBeVisible();
    expect(active.origin).toBe('imported');
    expect(active.sourceFilename).toBe('basic-structure.xsd');
    expect(active.xsdMetadataByNodeId).toBeDefined();
    expect(active).not.toHaveProperty('contentKindsByNodeId');
    expect(active).not.toHaveProperty('dtdAttributesByNodeId');
    expect(active).not.toHaveProperty('comments');
    expect(active.sourceMarkupByNodeId).toBeDefined();
    expect(get(navigationStore)).toEqual({
      projectId: active.project.id,
      navigationPath: [book.id],
    });
    expect(get(inspectorStore)).toEqual({ projectId: active.project.id });
    expect(get(projectSessionResetStore).initialFocusNodeId).toBe(book.id);

    const bookCard = screen.getByRole('article', { name: 'book' });
    expect(
      within(bookCard).getByRole('button', {
        name: /Navigate leafward through Type to BookType, Complex type declaration/,
      }),
    ).toBeVisible();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Center Schema overview' }),
    );
    await waitFor(() =>
      expect(get(navigationStore).navigationPath).toEqual([schemaNodeId]),
    );

    const schemaCard = screen.getByRole('article', {
      name: 'Schema overview',
    });
    expect(
      within(schemaCard).getByRole('heading', {
        level: 2,
        name: 'Schema overview',
      }),
    ).toBeVisible();
    expect(within(schemaCard).queryByText('Schema')).not.toBeInTheDocument();
    expect(within(schemaCard).getByText('basic-structure.xsd')).toBeVisible();
    expect(within(schemaCard).getByText('urn:books')).toBeVisible();
    expect(
      within(schemaCard).getByRole('button', {
        name: /Global element declaration to book, Global element declaration/,
      }),
    ).toBeVisible();
    expect(
      within(schemaCard).queryByText(/<xs:schema/),
    ).not.toBeInTheDocument();

    await fireEvent.click(
      within(schemaCard).getByRole('button', {
        name: 'Inspect Schema overview',
      }),
    );
    const inspector = screen.getByRole('complementary', {
      name: 'Schema inspector',
    });
    expect(inspector).toHaveTextContent('Schema overview');
    expect(
      within(inspector).getByRole('region', { name: 'Declarations' }),
    ).toBeVisible();
    expect(
      within(inspector).queryByRole('region', { name: 'Structure' }),
    ).toBeNull();
    await fireEvent.click(
      within(schemaCard).getByRole('button', {
        name: /Global element declaration to book, Global element declaration/,
      }),
    );
    await waitFor(() =>
      expect(get(navigationStore).navigationPath).toEqual([
        schemaNodeId,
        book.id,
      ]),
    );
    expect(
      screen.getByRole('button', {
        name: /Navigate rootward to Schema overview, Schema/,
      }),
    ).toBeVisible();
    expect(get(inspectorStore).inspectedNodeId).toBe(schemaNodeId);
    expect(screen.getByText('View source markup')).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Attributes' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('supports same-file repeat and uppercase XSD extensions', async () => {
    const { container } = render(App);
    const initialRevision = get(projectSessionResetStore).revision;
    const file = schemaFile('BASIC.XSD', basicXsd, 'text/xml');

    await selectFile(container, 'xsd', file);
    await waitUntilSettled('xsd');
    await selectFile(container, 'xsd', file);
    await waitUntilSettled('xsd');

    expect(get(activeProjectStore).sourceFilename).toBe('BASIC.XSD');
    expect(get(projectSessionResetStore).revision).toBe(initialRevision + 2);
  });

  it('groups XSD Navigation entries and starts declaration journeys directly', async () => {
    const { container } = render(App);
    await selectFile(
      container,
      'xsd',
      schemaFile('basic-structure.xsd', basicXsd, 'application/xml'),
    );
    await waitUntilSettled('xsd');

    const active = get(activeProjectStore);
    const schemaId = active.project.rootNodeIds[0]!;
    const book = active.project.nodes.find(
      ({ kind, name }) => kind === 'globalElement' && name === 'book',
    )!;
    const bookType = active.project.nodes.find(
      ({ kind, name }) => kind === 'complexType' && name === 'BookType',
    )!;
    const navigation = screen.getByRole('navigation', {
      name: 'Schema navigation',
    });

    expect(
      within(navigation).getByRole('heading', { name: 'Schema overview' }),
    ).toBeVisible();
    expect(
      within(navigation).getByRole('heading', { name: 'Document elements' }),
    ).toBeVisible();
    expect(
      within(navigation).queryByRole('heading', { name: 'Schema root' }),
    ).not.toBeInTheDocument();
    expect(
      within(navigation).getByRole('heading', { name: 'Complex types' }),
    ).toBeVisible();
    expect(
      within(navigation).getByRole('heading', { name: 'Simple types' }),
    ).toBeVisible();
    expect(
      within(navigation).queryByRole('heading', { name: 'DTD elements' }),
    ).not.toBeInTheDocument();
    expect(within(navigation).getByText('book')).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(
      within(navigation).getByRole('button', {
        name: 'Center BookType, Complex type declaration',
      }),
    ).toBeVisible();
    expect(
      within(navigation).getByRole('button', {
        name: 'Center CodeType, Simple type declaration',
      }),
    ).toBeVisible();
    expect(within(navigation).queryByText('title')).not.toBeInTheDocument();
    expect(within(navigation).queryByText('chapter')).not.toBeInTheDocument();
    expect(within(navigation).queryByText('urn:books')).not.toBeInTheDocument();

    inspectorStore.inspect(book.id);
    await fireEvent.click(
      within(navigation).getByRole('button', {
        name: 'Center BookType, Complex type declaration',
      }),
    );
    await waitFor(() =>
      expect(get(navigationStore).navigationPath).toEqual([bookType.id]),
    );

    expect(get(inspectorStore).inspectedNodeId).toBe(book.id);
    expect(
      within(navigation).getByText('BookType').closest('[aria-current="true"]'),
    ).not.toBeNull();

    await fireEvent.click(
      within(navigation).getByRole('button', {
        name: 'Center Schema overview',
      }),
    );
    await waitFor(() =>
      expect(get(navigationStore).navigationPath).toEqual([schemaId]),
    );
    expect(get(inspectorStore).inspectedNodeId).toBe(book.id);
    expect(within(navigation).getByText('Overview')).toHaveAttribute(
      'aria-current',
      'true',
    );

    await fireEvent.click(
      within(navigation).getByRole('button', {
        name: 'Center book, Global element declaration',
      }),
    );
    await waitFor(() =>
      expect(get(navigationStore).navigationPath).toEqual([book.id]),
    );
    expect(get(inspectorStore).inspectedNodeId).toBe(book.id);
  });

  it('follows a real XSD relationship journey, preserves inspection, and returns rootward', async () => {
    const { container } = render(App);
    await selectFile(
      container,
      'xsd',
      schemaFile(
        'same-document-references.xsd',
        sameDocumentXsd,
        'application/xml',
      ),
    );
    await waitUntilSettled('xsd');

    const project = get(activeProjectStore).project;
    const root = project.nodes.find(
      ({ kind, name }) => kind === 'globalElement' && name === 'root',
    )!;
    const rootToType = relationship(project, root.id, 'typeOf', 'RootType');
    const typeToSequence = relationship(
      project,
      rootToType.node.id,
      'contains',
    );
    const sequenceToRef = relationship(
      project,
      typeToSequence.node.id,
      'contains',
      'g:item',
    );
    const refToGlobal = relationship(
      project,
      sequenceToRef.node.id,
      'references',
      'item',
    );

    expect(get(navigationStore).navigationPath).toEqual([root.id]);
    const navigation = screen.getByRole('navigation', {
      name: 'Schema navigation',
    });
    expect(
      within(
        within(navigation).getByRole('region', {
          name: 'Document elements',
        }),
      ).getByText('root'),
    ).toBeVisible();
    expect(
      within(
        within(navigation).getByRole('region', {
          name: 'Other global elements',
        }),
      ).getByText('item'),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /Navigate rootward/ }),
    ).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Focused: root, Global element declaration. One structural destination.',
    );
    expect(
      within(screen.getByRole('article', { name: 'root' })).getByRole(
        'heading',
        { level: 2, name: 'root' },
      ),
    ).toBeVisible();

    await followVisibleRelationship(rootToType);
    await followVisibleRelationship(typeToSequence);
    await followVisibleRelationship(sequenceToRef);

    await fireEvent.click(
      within(screen.getByRole('article', { name: 'g:item' })).getByRole(
        'button',
        { name: 'Inspect g:item' },
      ),
    );
    expect(get(inspectorStore).inspectedNodeId).toBe(sequenceToRef.node.id);
    const inspector = screen.getByRole('complementary', {
      name: 'Schema inspector',
    });
    expect(
      within(inspector).getByRole('region', { name: 'Related definitions' }),
    ).toBeVisible();
    await fireEvent.click(
      within(inspector).getByRole('button', {
        name: 'Follow Referenced element to item, Global element declaration',
      }),
    );
    await waitFor(() => {
      const path = get(navigationStore).navigationPath;
      expect(path[path.length - 1]).toBe(refToGlobal.node.id);
    });
    expect(get(inspectorStore).inspectedNodeId).toBe(sequenceToRef.node.id);
    expect(get(navigationStore).navigationPath).toEqual([
      root.id,
      rootToType.node.id,
      typeToSequence.node.id,
      sequenceToRef.node.id,
      refToGlobal.node.id,
    ]);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Focused: item, Global element declaration. One structural destination.',
    );

    const itemToType = relationship(
      project,
      refToGlobal.node.id,
      'typeOf',
      'ItemType',
    );
    const itemTypeToChoice = relationship(
      project,
      itemToType.node.id,
      'contains',
    );
    const choiceToParent = relationship(
      project,
      itemTypeToChoice.node.id,
      'contains',
      'parent',
    );
    const parentToRootType = relationship(
      project,
      choiceToParent.node.id,
      'typeOf',
      'RootType',
    );
    await followVisibleRelationship(itemToType);
    await followVisibleRelationship(itemTypeToChoice);
    await followVisibleRelationship(choiceToParent);
    const recursiveTypeCard = document.querySelector<HTMLElement>(
      `[data-carousel-leafward-candidate-edge-id="${parentToRootType.edge.id}"]`,
    );
    if (!recursiveTypeCard) {
      throw new Error('Expected the recursive RootType relationship card.');
    }
    const terminalPath = [...get(navigationStore).navigationPath];
    expect(within(recursiveTypeCard).getByText('Recursive type')).toBeVisible();
    expect(
      within(recursiveTypeCard).getByText(
        'Already present earlier in this path',
      ),
    ).toBeVisible();
    const terminalBody = within(recursiveTypeCard).getByLabelText(
      'Recursive type RootType. Already present earlier in this path',
    );
    expect(
      within(recursiveTypeCard).queryByRole('button', {
        name: /Navigate|Return/,
      }),
    ).not.toBeInTheDocument();
    await fireEvent.click(terminalBody);
    expect(get(navigationStore).navigationPath).toEqual(terminalPath);
    expect(get(inspectorStore).inspectedNodeId).toBe(sequenceToRef.node.id);

    while (get(navigationStore).navigationPath.length > 1) {
      const previousLength = get(navigationStore).navigationPath.length;
      const rootward = screen.getByRole('region', {
        name: 'Rootward journey',
      });
      const immediate = within(rootward)
        .getAllByRole('button')
        .find((button) =>
          button.getAttribute('aria-label')?.startsWith('Navigate rootward'),
        );
      if (!immediate) throw new Error('Expected an immediate rootward button.');
      await fireEvent.click(immediate);
      await waitFor(() =>
        expect(get(navigationStore).navigationPath).toHaveLength(
          previousLength - 1,
        ),
      );
    }

    expect(get(navigationStore).navigationPath).toEqual([root.id]);
    expect(get(inspectorStore).inspectedNodeId).toBe(sequenceToRef.node.id);
  });

  it('presents multiple document elements through a fixed schema overview', async () => {
    const { container } = render(App);
    await selectFile(
      container,
      'xsd',
      schemaFile(
        'document-elements.xsd',
        documentElementsXsd,
        'application/xml',
      ),
    );
    await waitUntilSettled('xsd');

    const active = get(activeProjectStore);
    const schemaId = active.project.rootNodeIds[0]!;
    const catalog = active.project.nodes.find(
      ({ kind, name }) => kind === 'globalElement' && name === 'catalog',
    )!;
    expect(get(navigationStore).navigationPath).toEqual([schemaId]);

    const overviewCard = screen.getByRole('article', {
      name: 'Schema overview',
    });
    expect(overviewCard).not.toHaveTextContent('Kind: Schema');
    expect(
      within(overviewCard).getByText('document-elements.xsd'),
    ).toBeVisible();
    expect(within(overviewCard).getByText('urn:documents')).toBeVisible();
    expect(
      within(overviewCard).getByRole('button', {
        name: /Global element declaration to catalog, Global element declaration/,
      }),
    ).toBeVisible();
    expect(
      within(overviewCard).getByRole('button', {
        name: /Complex type declaration to SharedType, Complex type declaration/,
      }),
    ).toBeVisible();
    expect(within(overviewCard).queryByText(/<xs:schema/)).toBeNull();

    const navigation = screen.getByRole('navigation', {
      name: 'Schema navigation',
    });
    const documents = within(navigation).getByRole('region', {
      name: 'Document elements',
    });
    expect(within(documents).getByText('catalog')).toBeVisible();
    expect(within(documents).getByText('archive')).toBeVisible();
    const others = within(navigation).getByRole('region', {
      name: 'Other global elements',
    });
    expect(within(others).getByText('entry')).toBeVisible();
    expect(
      within(navigation).queryByRole('heading', { name: 'Global elements' }),
    ).toBeNull();

    await fireEvent.click(
      within(overviewCard).getByRole('button', {
        name: 'Inspect Schema overview',
      }),
    );
    const inspector = screen.getByRole('complementary', {
      name: 'Schema inspector',
    });
    expect(
      within(inspector).getByRole('heading', {
        name: 'Schema overview',
      }),
    ).toBeVisible();
    expect(within(inspector).queryByText('Schema', { exact: true })).toBeNull();
    expect(
      within(inspector).getByRole('region', { name: 'Declarations' }),
    ).toBeVisible();
    expect(
      within(inspector).queryByRole('region', { name: 'Structure' }),
    ).toBeNull();
    expect(
      within(inspector).getByRole('button', {
        name: 'Center catalog, Global element declaration',
      }),
    ).toBeVisible();

    await fireEvent.click(
      within(navigation).getByRole('button', {
        name: 'Center catalog, Global element declaration',
      }),
    );
    await waitFor(() =>
      expect(get(navigationStore).navigationPath).toEqual([catalog.id]),
    );
    expect(get(inspectorStore).inspectedNodeId).toBe(schemaId);
    expect(
      screen.queryByRole('button', {
        name: /Navigate rootward to Schema overview/,
      }),
    ).toBeNull();

    await fireEvent.click(
      within(navigation).getByRole('button', {
        name: 'Center Schema overview',
      }),
    );
    await waitFor(() =>
      expect(get(navigationStore).navigationPath).toEqual([schemaId]),
    );
  });

  it('keeps mutual recursion terminal from both Global elements entry points', async () => {
    const { container } = render(App);
    await selectFile(
      container,
      'xsd',
      schemaFile('mutual-recursion.xsd', mutualRecursionXsd, 'application/xml'),
    );
    await waitUntilSettled('xsd');

    const active = get(activeProjectStore);
    expect(get(navigationStore).navigationPath).toEqual([
      active.project.rootNodeIds[0],
    ]);
    expect(
      screen.getByRole('article', { name: 'Schema overview' }),
    ).toBeVisible();

    const navigation = screen.getByRole('navigation', {
      name: 'Schema navigation',
    });
    const globals = within(navigation).getByRole('region', {
      name: 'Global elements',
    });
    expect(within(globals).getByText('one')).toBeVisible();
    expect(within(globals).getByText('two')).toBeVisible();
    expect(
      within(navigation).queryByRole('heading', {
        name: 'Document elements',
      }),
    ).toBeNull();
    expect(
      within(navigation).queryByRole('heading', {
        name: 'Other global elements',
      }),
    ).toBeNull();

    await fireEvent.click(
      within(globals).getByRole('button', {
        name: 'Center one, Global element declaration',
      }),
    );
    const project = active.project;
    const one = project.nodes.find(
      ({ kind, name }) => kind === 'globalElement' && name === 'one',
    )!;
    const two = project.nodes.find(
      ({ kind, name }) => kind === 'globalElement' && name === 'two',
    )!;
    expect(get(navigationStore).navigationPath).toEqual([one.id]);

    const oneAnonymous = relationship(project, one.id, 'typeOf');
    const oneSequence = relationship(project, oneAnonymous.node.id, 'contains');
    const localTwo = relationship(project, oneSequence.node.id, 'contains');
    const referencedTwo = relationship(
      project,
      localTwo.node.id,
      'references',
      'two',
    );
    expect(referencedTwo.node.id).toBe(two.id);
    const twoAnonymous = relationship(project, two.id, 'typeOf');
    const twoSequence = relationship(project, twoAnonymous.node.id, 'contains');
    const localOne = relationship(project, twoSequence.node.id, 'contains');
    const closureToOne = relationship(
      project,
      localOne.node.id,
      'references',
      'one',
    );
    const acyclicRoute = [
      oneAnonymous,
      oneSequence,
      localTwo,
      referencedTwo,
      twoAnonymous,
      twoSequence,
      localOne,
    ];

    for (const step of acyclicRoute) {
      expect(
        navigationStore.navigateStructuralRelationship({
          edgeId: step.edge.id,
          sourceNodeId: step.edge.sourceNodeId,
          targetNodeId: step.node.id,
        }),
      ).toMatchObject({ applied: true, effect: 'advanced' });
    }
    expect(new Set(get(navigationStore).navigationPath).size).toBe(
      get(navigationStore).navigationPath.length,
    );

    const closureSelector = `[data-carousel-leafward-candidate-edge-id="${closureToOne.edge.id}"]`;
    await waitFor(() =>
      expect(document.querySelector(closureSelector)).not.toBeNull(),
    );
    const closureCard = document.querySelector<HTMLElement>(closureSelector);
    if (!closureCard) throw new Error('Expected recursive reference card.');
    const terminalPath = [...get(navigationStore).navigationPath];
    expect(within(closureCard).getByText('Recursive reference')).toBeVisible();
    expect(
      within(closureCard).getByText('Already present earlier in this path'),
    ).toBeVisible();
    const terminalBody = within(closureCard).getByLabelText(
      'Recursive reference one. Already present earlier in this path',
    );
    expect(
      within(closureCard).queryByRole('button', {
        name: /Navigate|Return/,
      }),
    ).not.toBeInTheDocument();
    expect(
      within(closureCard).getByRole('button', { name: 'Inspect one' }),
    ).toBeEnabled();

    const focusCard = document.querySelector<HTMLElement>(
      '[data-focus-card-information-layout]',
    );
    if (!focusCard) throw new Error('Expected focused local reference card.');
    await fireEvent.click(
      within(focusCard).getByRole('button', {
        name: `Inspect ${localOne.node.name}`,
      }),
    );
    const status = screen.getByRole('status');
    const priorAnnouncement = status.textContent;
    await fireEvent.click(terminalBody);
    expect(get(navigationStore).navigationPath).toEqual(terminalPath);
    expect(get(inspectorStore).inspectedNodeId).toBe(localOne.node.id);
    expect(status.textContent).toBe(priorAnnouncement);

    const inspector = screen.getByRole('complementary', {
      name: 'Schema inspector',
    });
    await waitFor(() =>
      expect(
        within(inspector).getByText(
          'Recursive reference — Already present earlier in this path · Global element declaration',
        ),
      ).toBeVisible(),
    );
    expect(
      within(inspector).queryByRole('button', {
        name: /Recursive reference.*one/,
      }),
    ).not.toBeInTheDocument();
    expect(
      within(inspector).getByRole('button', {
        name: `Close inspector for ${localOne.node.name}`,
      }),
    ).toBeEnabled();

    const rootward = screen.getByRole('region', { name: 'Rootward journey' });
    const rootwardCardCount = within(rootward).getAllByRole('button').length;
    for (let iteration = 0; iteration < 4; iteration += 1) {
      const stateBeforeAttempt = get(navigationStore);
      const result = navigationStore.navigateStructuralRelationship({
        edgeId: closureToOne.edge.id,
        sourceNodeId: closureToOne.edge.sourceNodeId,
        targetNodeId: one.id,
      });
      expect(result).toMatchObject({
        applied: false,
        reason: 'terminalCycleClosure',
      });
      expect(result.state).toBe(stateBeforeAttempt);
      expect(get(navigationStore)).toBe(stateBeforeAttempt);
      expect(get(navigationStore).navigationPath).toEqual(terminalPath);
      expect(new Set(get(navigationStore).navigationPath).size).toBe(
        terminalPath.length,
      );
    }
    expect(within(rootward).getAllByRole('button')).toHaveLength(
      rootwardCardCount,
    );
    expect(get(inspectorStore).inspectedNodeId).toBe(localOne.node.id);

    await fireEvent.click(
      within(navigation).getByRole('button', {
        name: 'Center Schema overview',
      }),
    );
    await waitFor(() =>
      expect(get(navigationStore).navigationPath).toEqual([
        active.project.rootNodeIds[0],
      ]),
    );
    await fireEvent.click(
      within(globals).getByRole('button', {
        name: 'Center two, Global element declaration',
      }),
    );
    await waitFor(() =>
      expect(get(navigationStore).navigationPath).toEqual([two.id]),
    );

    const reverseRoute = [
      twoAnonymous,
      twoSequence,
      localOne,
      closureToOne,
      oneAnonymous,
      oneSequence,
      localTwo,
    ];
    for (const step of reverseRoute) {
      expect(
        navigationStore.navigateStructuralRelationship({
          edgeId: step.edge.id,
          sourceNodeId: step.edge.sourceNodeId,
          targetNodeId: step.node.id,
        }),
      ).toMatchObject({ applied: true, effect: 'advanced' });
    }
    const reverseTerminalPath = [...get(navigationStore).navigationPath];
    const reverseSelector = `[data-carousel-leafward-candidate-edge-id="${referencedTwo.edge.id}"]`;
    await waitFor(() =>
      expect(document.querySelector(reverseSelector)).not.toBeNull(),
    );
    const reverseClosureCard =
      document.querySelector<HTMLElement>(reverseSelector);
    if (!reverseClosureCard) {
      throw new Error('Expected reverse recursive reference card.');
    }
    expect(
      within(reverseClosureCard).getByText(
        'Already present earlier in this path',
      ),
    ).toBeVisible();
    expect(
      within(reverseClosureCard).queryByRole('button', {
        name: /Navigate|Return/,
      }),
    ).not.toBeInTheDocument();
    expect(
      navigationStore.navigateStructuralRelationship({
        edgeId: referencedTwo.edge.id,
        sourceNodeId: referencedTwo.edge.sourceNodeId,
        targetNodeId: two.id,
      }),
    ).toMatchObject({
      applied: false,
      reason: 'terminalCycleClosure',
    });
    expect(get(navigationStore).navigationPath).toEqual(reverseTerminalPath);
  });

  it('activates warning-bearing XSD without alert or placeholder nodes', async () => {
    const { container } = render(App);

    await selectFile(
      container,
      'xsd',
      schemaFile('external-references.xsd', externalXsd, 'application/xml'),
    );
    await waitUntilSettled('xsd');

    expect(screen.queryByRole('alert')).toBeNull();
    expect(get(activeProjectStore).sourceFilename).toBe(
      'external-references.xsd',
    );
    expect(
      get(activeProjectStore).project.nodes.some(({ name }) =>
        name.includes('External'),
      ),
    ).toBe(false);
    const navigation = screen.getByRole('navigation', {
      name: 'Schema navigation',
    });
    expect(
      within(navigation).getByRole('heading', { name: 'Document elements' }),
    ).toBeVisible();
    expect(
      within(navigation).getByRole('heading', { name: 'Complex types' }),
    ).toBeVisible();
    expect(
      within(navigation).queryByRole('heading', { name: 'Simple types' }),
    ).not.toBeInTheDocument();
    expect(within(navigation).queryByText('builtIn')).not.toBeInTheDocument();
  });
});

describe('rendered XSD failure preservation', () => {
  it.each([
    ['malformed XML', 'malformed-xml.xsd', malformedXsd],
    ['wrong root', 'wrong-root-namespace.xsd', wrongRootXsd],
    ['unresolved reference', 'unresolved.xsd', unresolvedXsd],
    ['duplicate declarations', 'duplicates.xsd', duplicateXsd],
    ['attribute conflict', 'attribute-errors.xsd', attributeErrorsXsd],
  ])(
    'preserves a nontrivial XSD session after %s',
    async (_case, filename, source) => {
      const { container } = render(App);
      await selectFile(
        container,
        'xsd',
        schemaFile('basic-structure.xsd', basicXsd, 'application/xml'),
      );
      await waitUntilSettled('xsd');
      const active = get(activeProjectStore);
      const book = active.project.nodes.find(({ name }) => name === 'book')!;
      navigationStore.navigateLeafward(book.id);
      inspectorStore.inspect(book.id);
      const before = currentSession();

      await selectFile(
        container,
        'xsd',
        schemaFile(filename, source, 'application/xml'),
      );
      await waitUntilSettled('xsd');

      const alert = screen.getByRole('alert');
      expect(alert).toHaveAttribute(
        'aria-labelledby',
        'schema-import-error-heading',
      );
      expect(
        document.querySelectorAll('#schema-import-error-heading'),
      ).toHaveLength(1);
      expect(alert).toHaveTextContent(`Could not open ${filename}`);
      expect(get(activeProjectStore)).toBe(before.active);
      expect(get(navigationStore)).toBe(before.navigation);
      expect(get(inspectorStore)).toBe(before.inspector);
      expect(get(projectSessionResetStore)).toBe(before.presentation);
      expect(get(activeProjectStore).sourceFilename).toBe(
        'basic-structure.xsd',
      );
      expect(alert.textContent?.toLowerCase()).toContain('line');
    },
  );

  it('preserves DTD state after failed XSD and dismisses back to Open XSD', async () => {
    const { container } = render(App);
    await selectFile(
      container,
      'dtd',
      schemaFile('source-markup.dtd', dtdMarkup, 'application/xml-dtd'),
    );
    await waitUntilSettled('dtd');
    const before = currentSession();

    await selectFile(
      container,
      'xsd',
      schemaFile('malformed-xml.xsd', malformedXsd, 'application/xml'),
    );
    await waitUntilSettled('xsd');
    expect(get(activeProjectStore)).toBe(before.active);

    await fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss import error' }),
    );

    expect(screen.queryByRole('alert')).toBeNull();
    expect(get(activeProjectStore)).toBe(before.active);
    expect(screen.getByRole('button', { name: 'Open XSD' })).toHaveFocus();
  });

  it('rejects crossed extensions without reading or changing the project', async () => {
    const read = vi.fn(() => Promise.resolve(basicXsd));
    const before = get(activeProjectStore);
    const { container } = render(App);

    await selectFile(
      container,
      'xsd',
      schemaFile('schema.dtd', basicXsd, 'application/xml', read),
    );
    await waitUntilSettled('xsd');

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Choose a file with a .xsd extension.',
    );
    expect(read).not.toHaveBeenCalled();
    expect(get(activeProjectStore)).toBe(before);
  });
});

describe('rendered coordinated DTD/XSD replacement', () => {
  it('clears format-specific metadata through DTD to XSD to DTD', async () => {
    const { container } = render(App);

    await selectFile(
      container,
      'dtd',
      schemaFile('source-markup.dtd', dtdMarkup, 'application/xml-dtd'),
    );
    await waitUntilSettled('dtd');
    expect(get(activeProjectStore).sourceMarkupByNodeId).toBeDefined();

    await selectFile(
      container,
      'xsd',
      schemaFile('basic-structure.xsd', basicXsd, 'application/xml'),
    );
    await waitUntilSettled('xsd');
    expect(get(activeProjectStore).xsdMetadataByNodeId).toBeDefined();
    expect(get(activeProjectStore).sourceMarkupByNodeId).toBeDefined();

    await selectFile(
      container,
      'dtd',
      schemaFile('source-markup.dtd', dtdMarkup, 'application/xml-dtd'),
    );
    await waitUntilSettled('dtd');
    expect(get(activeProjectStore).sourceMarkupByNodeId).toBeDefined();
    expect(get(activeProjectStore)).not.toHaveProperty('xsdMetadataByNodeId');
    await fireEvent.click(
      within(screen.getByRole('article', { name: 'book' })).getByRole(
        'button',
        { name: 'Inspect book' },
      ),
    );
    expect(screen.getByText('View source markup')).toBeVisible();
  });

  it('prevents a stale DTD read from replacing a newer XSD', async () => {
    let resolveSlow!: (source: string) => void;
    const slowRead = new Promise<string>((resolve) => {
      resolveSlow = resolve;
    });
    const { container } = render(App);
    const slowSelection = selectFile(
      container,
      'dtd',
      schemaFile('slow.dtd', dtdMarkup, 'application/xml-dtd', () => slowRead),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Opening DTD' }),
      ).toHaveAttribute('aria-controls', 'dtd-file-input'),
    );

    await selectFile(
      container,
      'xsd',
      schemaFile('newer.xsd', basicXsd, 'application/xml'),
    );
    await waitUntilSettled('xsd');
    resolveSlow(dtdMarkup);
    await slowSelection;

    expect(get(activeProjectStore).sourceFilename).toBe('newer.xsd');
    expect(get(activeProjectStore).xsdMetadataByNodeId).toBeDefined();
    expect(get(activeProjectStore).sourceMarkupByNodeId).toBeDefined();
    const currentHeading = screen.getByRole('heading', {
      level: 2,
      name: 'book',
    });
    await waitFor(() => expect(currentHeading).toHaveFocus());
    expect(screen.getByRole('button', { name: 'Open XSD' })).not.toHaveFocus();
  });
});
