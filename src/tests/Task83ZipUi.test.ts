import JSZip from 'jszip';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import App from '../app/App.svelte';
import { activeProjectStore } from '../app/stores/projectStore';

async function makeZip(
  files: Readonly<Record<string, string>>,
): Promise<ArrayBuffer> {
  const archive = new JSZip();
  for (const [path, source] of Object.entries(files)) {
    archive.file(path, source, { createFolders: false });
  }
  const bytes = await archive.generateAsync({
    type: 'uint8array',
    compression: 'STORE',
  });
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

async function selectZip(
  container: HTMLElement,
  filename: string,
  files: Readonly<Record<string, string>>,
): Promise<void> {
  const input = container.querySelector<HTMLInputElement>('#zip-file-input');
  if (!input) throw new Error('Expected the ZIP file input.');
  const file = {
    name: filename,
    arrayBuffer: () => makeZip(files),
  };
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: { 0: file, length: 1, item: () => file },
  });
  await fireEvent.change(input);
}

async function openZip(
  container: HTMLElement,
  filename: string,
  files: Readonly<Record<string, string>>,
): Promise<void> {
  await selectZip(container, filename, files);
  expect((await screen.findAllByText(filename)).length).toBeGreaterThan(0);
}

const schemaHeader =
  '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:t="urn:test" targetNamespace="urn:test">';

describe('Task 8.3 real ZIP UI integration', () => {
  it('opens a resolved two-XSD package and exposes cross-file navigation', async () => {
    const { container } = render(App);
    await openZip(container, 'resolved-schemas.zip', {
      'schemas/root.xsd': `${schemaHeader}
        <xs:element name="root" type="t:Shared"/>
      </xs:schema>`,
      'schemas/types.xsd': `${schemaHeader}
        <xs:complexType name="Shared">
          <xs:sequence><xs:element name="child" type="xs:string"/></xs:sequence>
        </xs:complexType>
      </xs:schema>`,
    });

    const banner = screen.getByRole('banner');
    expect(within(banner).getByText('resolved-schemas.zip')).toBeVisible();
    expect(within(banner).getByText('2 schema files')).toBeVisible();
    const navigation = screen.getByRole('navigation', {
      name: 'Schema navigation',
    });
    expect(
      within(navigation).getByRole('heading', {
        name: 'Schema package outline',
      }),
    ).toBeVisible();
    expect(
      within(navigation).getByRole('button', { name: /root\.xsd/ }),
    ).toBeVisible();
    const typesToggle = within(navigation).getByRole('button', {
      name: /types\.xsd/,
    });
    expect(typesToggle).toBeVisible();
    await fireEvent.click(typesToggle);
    await fireEvent.click(
      within(navigation).getByRole('button', { name: 'Inspect Shared' }),
    );

    const inspector = screen.getByRole('complementary', {
      name: 'Schema inspector',
    });
    await waitFor(() =>
      expect(inspector.querySelector('.node-context')).toHaveTextContent(
        'Complex type declaration· types.xsd',
      ),
    );
    expect(
      within(inspector).queryByRole('heading', {
        name: 'Unresolved references',
      }),
    ).not.toBeInTheDocument();

    const searchbox = within(banner).getByRole('searchbox', {
      name: 'Search schema',
    });
    await fireEvent.input(searchbox, { target: { value: 'Shared' } });
    expect((await screen.findAllByText('Shared')).length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(
      /schema-package-(?:source|node|edge):/,
    );
  });

  it('activates a mixed DTD/XSD package without accidental cross-linking', async () => {
    const { container } = render(App);
    await openZip(container, 'mixed-schemas.zip', {
      'legacy/book.dtd': '<!ELEMENT book (title)>\n<!ELEMENT title (#PCDATA)>',
      'schemas/root.xsd': `${schemaHeader}<xs:element name="root" type="xs:string"/></xs:schema>`,
    });

    const navigation = screen.getByRole('navigation', {
      name: 'Schema navigation',
    });
    expect(
      within(navigation).getByRole('button', { name: /book\.dtd/ }),
    ).toBeVisible();
    expect(
      within(navigation).getByRole('button', { name: /root\.xsd/ }),
    ).toBeVisible();
    expect(within(navigation).getByText(/DTD ·/)).toBeVisible();
    expect(within(navigation).getByText(/XSD ·/)).toBeVisible();
    expect(within(navigation).getByText('Root elements')).toBeVisible();
    await fireEvent.click(
      within(navigation).getByRole('button', { name: /root\.xsd/ }),
    );
    expect(
      within(navigation).getAllByText('Schema overview').length,
    ).toBeGreaterThan(0);
  });

  it('rejects a standards-invalid unresolved package and retains the active project', async () => {
    const { container } = render(App);
    const before = get(activeProjectStore);
    await selectZip(container, 'unresolved-schemas.zip', {
      'root.xsd': `${schemaHeader}<xs:element name="root" type="t:Missing"/></xs:schema>`,
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not open unresolved-schemas.zip',
    );
    expect(get(activeProjectStore)).toBe(before);
  });

  it('keeps the prior project on an invalid member and returns focus on dismiss', async () => {
    const { container } = render(App);
    const before = screen.getByRole('main', {
      name: 'Schema carousel',
    }).textContent;
    const input = container.querySelector<HTMLInputElement>('#zip-file-input')!;
    const file = {
      name: 'invalid-member.zip',
      arrayBuffer: () => makeZip({ 'broken.xsd': '<xs:schema><xs:element' }),
    };
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: { 0: file, length: 1, item: () => file },
    });

    await fireEvent.change(input);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not open invalid-member.zip');
    expect(
      screen.getByRole('main', { name: 'Schema carousel' }).textContent,
    ).toBe(before);
    await fireEvent.click(
      within(alert).getByRole('button', { name: 'Dismiss import error' }),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Open ZIP' })).toHaveFocus(),
    );
  });

  it('keeps duplicate DTD node names separated by package-relative source', async () => {
    const { container } = render(App);
    await openZip(container, 'duplicate-names.zip', {
      'a/shared.dtd': '<!ELEMENT shared EMPTY>',
      'b/shared.dtd': '<!ELEMENT shared EMPTY>',
    });
    expect(container.querySelector('[data-schema-import-warning]')).toBeNull();
    const navigation = screen.getByRole('navigation', {
      name: 'Schema navigation',
    });
    const toggles = within(navigation).getAllByRole('button', {
      name: /shared\.dtd/,
    });
    expect(toggles).toHaveLength(2);
    await fireEvent.click(toggles[1]!);
    const inspectButtons = within(navigation).getAllByRole('button', {
      name: 'Inspect shared',
    });
    await fireEvent.click(inspectButtons[inspectButtons.length - 1]!);
    const inspector = screen.getByRole('complementary', {
      name: 'Schema inspector',
    });
    await waitFor(() =>
      expect(inspector.querySelector('.node-context')).toHaveTextContent(
        'DTD element declaration· b/shared.dtd',
      ),
    );
  });
});
