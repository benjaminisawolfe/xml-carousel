import { describe, expect, it } from 'vitest';
import { resolveDtdDependencyPath } from './importSchemaArchivePackage';

describe('DTD dependency presentation path security', () => {
  it.each([
    [
      'nested sibling',
      'schemas/main.dtd',
      'parts/common.ent',
      'schemas/parts/common.ent',
    ],
    [
      'safe parent',
      'schemas/nested/main.dtd',
      '../common.ent',
      'schemas/common.ent',
    ],
    ['root boundary', 'schemas/main.dtd', '../common.ent', 'common.ent'],
    [
      'same basename remains path-specific',
      'schemas/a/main.dtd',
      'shared/common.ent',
      'schemas/a/shared/common.ent',
    ],
  ])(
    'resolves %s inside the controlled root',
    (_label, referring, target, expected) => {
      expect(resolveDtdDependencyPath(referring, target)).toEqual({
        status: 'Resolved within controlled project root',
        path: expected,
      });
    },
  );

  it.each([
    ['traversal beyond root', 'schemas/main.dtd', '../../outside.ent'],
    ['encoded traversal', 'schemas/main.dtd', '%2e%2e/outside.ent'],
    ['encoded separator', 'schemas/main.dtd', 'parts%2foutside.ent'],
    ['absolute path', 'schemas/main.dtd', '/outside.ent'],
    ['Windows separator', 'schemas/main.dtd', '..\\outside.ent'],
    ['drive path', 'schemas/main.dtd', 'C:/outside.ent'],
    ['network URL', 'schemas/main.dtd', 'https://example.invalid/outside.ent'],
    ['file URL', 'schemas/main.dtd', 'file:///outside.ent'],
  ])('blocks %s', (_label, referring, target) => {
    const result = resolveDtdDependencyPath(referring, target);
    expect(result.path).toBeUndefined();
    expect(result.status).toMatch(/^Blocked:/u);
  });
});
