import { describe, expect, it } from 'vitest';
import { getCarouselHeading, getNodeSourceFilename } from './carouselHeading';

describe('carousel heading', () => {
  const project = { displayName: 'Fixture schema project' };

  it('tracks the focused node source filename across bounded fixtures', () => {
    expect(getCarouselHeading({ sourceFileId: 'catalog.xsd' }, project)).toBe(
      'catalog.xsd',
    );
    expect(
      getCarouselHeading({ sourceFileId: 'shared-types.xsd' }, project),
    ).toBe('shared-types.xsd');
  });

  it('falls back to the project name and then a neutral label', () => {
    expect(getCarouselHeading({}, project)).toBe('Fixture schema project');
    expect(getCarouselHeading(undefined, { displayName: '   ' })).toBe(
      'Schema view',
    );
  });

  it('resolves package source IDs centrally and uses a trimmed legacy fallback', () => {
    const packageProject = {
      displayName: 'Package',
      sourceFiles: [
        {
          id: 'schema-package-source:schemas%2Froot.xsd',
          filename: 'schemas/root.xsd',
        },
      ],
    };
    const node = {
      sourceFileId: 'schema-package-source:schemas%2Froot.xsd',
    };

    expect(getNodeSourceFilename(packageProject, node)).toBe(
      'schemas/root.xsd',
    );
    expect(getCarouselHeading(node, packageProject)).toBe('schemas/root.xsd');
    expect(
      getNodeSourceFilename(
        { sourceFiles: [] },
        { sourceFileId: '  legacy-source-id  ' },
      ),
    ).toBe('legacy-source-id');
  });
});
