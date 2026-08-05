import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  inventoryArchive,
  resolveInventoryReference,
} from '../../../../scripts/hermetic-foundry-inventory.mjs';

describe('Hermetic Foundry independent ZIP inventory', () => {
  it('reports the exact generic common-root topology and safe nested parent reference', async () => {
    const bytes = await readFile(
      'tests/fixtures/zip/visualization/common-root-nested-includes.zip',
    );
    const inventory = await inventoryArchive(bytes);

    expect(inventory.commonRootDirectory).toBe('project-root/');
    expect(inventory.fileEntryCount).toBe(5);
    expect(inventory.xsdEntryCount).toBe(5);
    expect(inventory.packageRelativePaths).toEqual([
      'common.xsd',
      'entities/character.xsd',
      'entity.xsd',
      'rich-text.xsd',
      'rules.xsd',
    ]);
    expect(inventory.schemaLocationCount).toBe(4);
    expect(inventory.missingReferenceCount).toBe(0);
    expect(inventory.externalOrAbsoluteReferenceCount).toBe(0);
    expect(inventory.references).toContainEqual({
      referringPath: 'entities/character.xsd',
      reference: '../entity.xsd',
      status: 'resolved',
      targetPath: 'entity.xsd',
    });
  });

  it('distinguishes root escape, encoded traversal, and external paths', () => {
    expect(
      resolveInventoryReference('nested/root.xsd', '../../escape.xsd'),
    ).toEqual({ status: 'blocked', reason: 'outside-project-root' });
    expect(
      resolveInventoryReference('root.xsd', '%252e%252e/escape.xsd'),
    ).toEqual({ status: 'blocked', reason: 'outside-project-root' });
    expect(
      resolveInventoryReference('root.xsd', 'https://example.test/a.xsd'),
    ).toEqual({ status: 'external-or-absolute' });
  });
});
