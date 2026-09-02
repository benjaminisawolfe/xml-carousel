import { fireEvent, render, screen, within } from '@testing-library/svelte';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildProjectSearchIndex, searchProjectIndex } from '../../search';
import SchemaSetOutline from '../../../ui/layout/SchemaSetOutline.svelte';
import { buildSchemaSetOutlinePresentation } from '../../../ui/presentation/schemaSetOutlinePresentation';
import { importSchemaArchivePackage } from './importSchemaArchivePackage';

const xsdOpen =
  '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:task-13.16" xmlns:t="urn:task-13.16">';

interface FixtureEntry {
  readonly path: string;
  readonly content: string | Uint8Array | null;
  readonly directory?: boolean;
}

const fixtureEntries: readonly FixtureEntry[] = [
  { path: 'bundle/', content: null, directory: true },
  { path: 'bundle/schemas/', content: null, directory: true },
  { path: 'bundle/shared/', content: null, directory: true },
  {
    path: 'bundle/schemas/root-a.xsd',
    content: `${xsdOpen}
      <xs:include schemaLocation="../shared/common.xsd"/>
      <xs:include schemaLocation="../missing.xsd"/>
      <xs:include schemaLocation="../../outside.xsd"/>
      <xs:element name="root-a" type="t:Shared"/>
    </xs:schema>`,
  },
  {
    path: 'bundle/schemas/root-b.xsd',
    content: `${xsdOpen}
      <xs:include schemaLocation="../shared/common.xsd"/>
      <xs:element name="root-b" type="t:Shared"/>
    </xs:schema>`,
  },
  {
    path: 'bundle/shared/common.xsd',
    content: `${xsdOpen}<xs:complexType name="Shared"/></xs:schema>`,
  },
  {
    path: 'bundle/schemas/orphan.xsd',
    content: `${xsdOpen}<xs:element name="orphan" type="xs:string"/></xs:schema>`,
  },
  {
    path: 'bundle/schemas/empty.xsd',
    content: `${xsdOpen}</xs:schema>`,
  },
  {
    path: 'bundle/one/common.xsd',
    content: `${xsdOpen}<xs:element name="one" type="xs:string"/></xs:schema>`,
  },
  {
    path: 'bundle/two/common.xsd',
    content: `${xsdOpen}<xs:element name="two" type="xs:string"/></xs:schema>`,
  },
  {
    path: 'bundle/legacy/main.dtd',
    content:
      '<!ENTITY % shared SYSTEM "../shared/common.ent">\n%shared;\n<!ELEMENT legacy-root EMPTY>',
  },
  {
    path: 'bundle/shared/common.ent',
    content: '<!ELEMENT shared-from-entity EMPTY>',
  },
  {
    path: 'bundle/legacy/wrapper.xml',
    content: '<legacy-root/>',
  },
  {
    path: 'bundle/shared/fragment.schema',
    content: '<opaque-schema-fragment/>',
  },
  {
    path: 'bundle/README.txt',
    content: 'Task 13.16 safe package notes',
  },
  {
    path: 'bundle/image.bin',
    content: new Uint8Array([0, 1, 2, 3, 255]),
  },
  {
    path: '__MACOSX/._root-a.xsd',
    content: 'operating-system metadata',
  },
];

async function fixtureBytes(
  entries: readonly FixtureEntry[] = fixtureEntries,
): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const entry of entries) {
    if (entry.directory) {
      zip.file(entry.path, null, { dir: true, createFolders: false });
    } else {
      zip.file(entry.path, entry.content!, { createFolders: false });
    }
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'STORE' });
}

async function importFixture(entries?: readonly FixtureEntry[]) {
  const result = await importSchemaArchivePackage({
    filename: 'task-13.16-complete-package.zip',
    data: await fixtureBytes(entries),
  });
  expect(result.status).toBe('success');
  if (result.status !== 'success') {
    throw new Error('Task 13.16 package fixture must import successfully.');
  }
  return result;
}

function normalizedInventory(
  result: Awaited<ReturnType<typeof importFixture>>,
) {
  return result.entries.map((entry) =>
    Object.fromEntries(
      Object.entries(entry).filter(
        ([key]) => key !== 'originalOrder' && key !== 'compressedByteLength',
      ),
    ),
  );
}

describe('Task 13.16 complete package presentation', () => {
  it('accounts for every entry with exact classification, source, and relationship evidence', async () => {
    const result = await importFixture();

    expect(result.manifest).toMatchObject({
      id: 'schema-package:task-13.16-complete-package.zip',
      packageRoot: 'bundle',
      commonRootDirectory: 'bundle',
    });
    expect(result.summary).toEqual({
      entryCount: 17,
      fileCount: 14,
      directoryCount: 3,
      schemaSourceCount: 8,
      xsdSourceCount: 7,
      dtdSourceCount: 1,
      rngSourceCount: 0,
      auxiliaryCount: 2,
      ignoredCount: 4,
      blockedCount: 1,
      rootCandidateCount: 7,
      completeFileCount: 7,
      zeroNodeSourceCount: 1,
      unresolvedRelationshipCount: 1,
    });
    expect(
      result.entries.map(({ deterministicOrder }) => deterministicOrder),
    ).toEqual(Array.from({ length: 17 }, (_, index) => index));
    expect(new Set(result.entries.map(({ id }) => id)).size).toBe(17);
    expect(result.entries.map(({ archivePath }) => archivePath)).toEqual(
      [...result.entries.map(({ archivePath }) => archivePath)].sort(),
    );

    expect(
      result.entries.find(
        ({ packageRelativePath }) =>
          packageRelativePath === 'schemas/empty.xsd',
      ),
    ).toMatchObject({
      kind: 'xsd-source',
      sourceViewAvailable: true,
      standardsStatus: 'not-independently-validated',
      visualizationStatus: 'no-navigable-declarations',
      rootCandidate: true,
    });
    expect(
      result.entries.find(
        ({ packageRelativePath }) =>
          packageRelativePath === 'shared/common.xsd',
      ),
    ).toMatchObject({
      kind: 'xsd-source',
      dependentCount: 2,
      sharedDependency: true,
      rootCandidate: false,
    });
    expect(
      result.entries.find(
        ({ packageRelativePath }) =>
          packageRelativePath === 'schemas/root-a.xsd',
      ),
    ).toMatchObject({
      dependencyCount: 3,
      unresolvedRelationshipCount: 1,
      blockedRelationshipCount: 1,
      rootCandidate: true,
      selectedEntry: false,
    });
    expect(
      result.entries.find(
        ({ packageRelativePath }) =>
          packageRelativePath === 'shared/common.ent',
      ),
    ).toMatchObject({
      kind: 'auxiliary',
      classificationReason: 'Potential controlled resolution resource',
      sourceViewAvailable: true,
      standardsStatus: 'accepted-auxiliary-dependency',
      visualizationStatus: 'auxiliary',
    });
    expect(
      result.entries.find(
        ({ packageRelativePath }) => packageRelativePath === 'README.txt',
      ),
    ).toMatchObject({
      kind: 'ignored',
      textStatus: 'text',
      sourceText: 'Task 13.16 safe package notes',
    });
    expect(
      result.entries.find(
        ({ packageRelativePath }) => packageRelativePath === 'image.bin',
      ),
    ).toMatchObject({
      kind: 'ignored',
      textStatus: 'binary',
      sourceViewAvailable: false,
    });
    expect(JSON.stringify(result)).not.toContain('"bytes"');
  });

  it('keeps normalized IDs, relationships, counts, and Search stable across ZIP order', async () => {
    const forward = await importFixture(fixtureEntries);
    const reversed = await importFixture([...fixtureEntries].reverse());
    const shuffledOrder = fixtureEntries.map(
      (_, index) => fixtureEntries[(index * 7) % fixtureEntries.length]!,
    );
    const shuffled = await importFixture(shuffledOrder);

    expect(normalizedInventory(reversed)).toEqual(normalizedInventory(forward));
    expect(normalizedInventory(shuffled)).toEqual(normalizedInventory(forward));
    expect(reversed.summary).toEqual(forward.summary);
    expect(shuffled.summary).toEqual(forward.summary);

    const search = buildProjectSearchIndex({
      project: forward.project,
      xsdMetadataByNodeId: forward.xsdMetadataByNodeId,
      commentsByNodeId: forward.commentsByNodeId,
      dtdAttributesByNodeId: forward.dtdAttributesByNodeId,
      packageEntries: forward.entries,
    });
    expect(
      searchProjectIndex(search, 'README.txt').map(
        ({ resultKind, packageEntryKind, packageEntryId }) => ({
          resultKind,
          packageEntryKind,
          packageEntryId,
        }),
      ),
    ).toContainEqual({
      resultKind: 'package-entry',
      packageEntryKind: 'ignored',
      packageEntryId: 'schema-archive-inventory:bundle%2FREADME.txt:file',
    });
    expect(
      searchProjectIndex(search, 'outside.xsd').some(
        ({ packageEntryKind, nodeName }) =>
          packageEntryKind === 'xsd-source' && nodeName === 'root-a.xsd',
      ),
    ).toBe(true);
  });

  it('renders every inventory entry, textual statuses, and safe source routes without binary text', async () => {
    const result = await importFixture();
    const presentation = buildSchemaSetOutlinePresentation({
      archiveFilename: result.manifest.archiveFilename,
      manifest: result.manifest,
      project: result.project,
      sources: result.sources,
      entries: result.entries,
      summary: result.summary,
      unresolvedReferences: result.unresolvedReferences,
      xsdMetadataByNodeId: result.xsdMetadataByNodeId,
    });
    const { container } = render(SchemaSetOutline, {
      props: {
        projectId: result.project.id,
        presentation,
        onCenterNode: () => {},
        onInspectNode: () => {},
        onCenterUnresolvedOwner: () => {},
      },
    });

    expect(
      screen.getByRole('heading', { name: 'Package summary' }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Complete package inventory' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: 'Root schema candidates, 7 items',
      }),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.getByRole('button', { name: 'Schema sources, 8 items' }),
    ).toHaveAttribute('aria-expanded', 'false');
    const ignoredToggle = screen.getByRole('button', {
      name: 'Ignored entries, 4 items',
    });
    expect(ignoredToggle).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.getByRole('button', { name: 'Directories, 3 items' }),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(container.querySelectorAll('[data-package-entry-id]')).toHaveLength(
      17,
    );
    const packageEntries = [
      ...container.querySelectorAll<HTMLElement>('[data-package-entry-id]'),
    ];
    for (const entry of packageEntries) {
      const metadata = entry.querySelector('.package-entry-metadata');
      expect(metadata?.tagName).toBe('DL');
      const fields = [...(metadata?.querySelectorAll(':scope > div') ?? [])];
      expect(fields.length).toBeGreaterThan(0);
      for (const field of fields) {
        const label = field.querySelector('dt');
        const value = field.querySelector('dd');
        expect(label?.nextElementSibling).toBe(value);
        expect(label?.textContent?.trim()).not.toBe('');
        const displayedValue = value?.textContent?.trim();
        if (
          entry.dataset.packageEntryId ===
            'schema-archive-inventory:bundle:directory' &&
          label?.textContent?.trim() === 'Path relative to project root'
        ) {
          expect(displayedValue).toBe('');
        } else {
          expect(
            displayedValue,
            `${entry.dataset.packageEntryId}: ${label?.textContent?.trim()}`,
          ).not.toBe('');
        }
      }
    }
    await fireEvent.click(ignoredToggle);
    const binary = container.querySelector<HTMLElement>(
      '[data-package-entry-id="schema-archive-inventory:bundle%2Fimage.bin:file"]',
    )!;
    binary.querySelector('summary')?.click();
    expect(
      within(binary).getByText('Binary content is not rendered as text.'),
    ).toBeVisible();
    expect(binary.querySelector('pre')).toBeNull();

    const readme = container.querySelector<HTMLElement>(
      '[data-package-entry-id="schema-archive-inventory:bundle%2FREADME.txt:file"]',
    )!;
    readme.querySelector('summary')?.click();
    expect(
      within(readme).getByText('View source: bundle/README.txt'),
    ).toBeVisible();
    expect(container.textContent).toContain('Operating-system metadata');
    expect(container.textContent).toContain('Blocked relationships');
  });
});
