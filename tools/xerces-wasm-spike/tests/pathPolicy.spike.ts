import { describe, expect, it } from 'vitest';
import { normalizeProjectPath, validateProjectFiles } from '../src/pathPolicy';

describe('controlled project paths', () => {
  it('preserves nested project-relative paths and duplicate basenames', () => {
    expect(validateProjectFiles(['a/common.xsd', 'b/common.xsd'])).toEqual([
      'a/common.xsd',
      'b/common.xsd',
    ]);
  });

  it.each([
    'https://example.invalid/a.xsd',
    'ftp://example.invalid/a.dtd',
    'file:///etc/passwd',
    '\\\\server\\share\\a.xsd',
    'C:\\schema\\a.xsd',
    '../outside.xsd',
    'dir/../../outside.xsd',
    '%2e%2e/outside.xsd',
    '%252e%252e%252foutside.xsd',
    'dir\\..\\outside.xsd',
  ])('blocks %s', (candidate) => {
    expect(() => normalizeProjectPath(candidate)).toThrow();
  });

  it('rejects duplicate normalized paths', () => {
    expect(() => validateProjectFiles(['one.xsd', 'one.xsd'])).toThrow(
      /Duplicate/u,
    );
  });
});
