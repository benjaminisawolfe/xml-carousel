import { describe, expect, it } from 'vitest';
import type { SchemaFileImportState } from '../../app/import/schemaFileImportController';
import { presentSchemaImportProgress } from './schemaImportProgressPresentation';

function processing(
  progress: Extract<
    SchemaFileImportState,
    { status: 'processing' }
  >['progress'],
): Extract<SchemaFileImportState, { status: 'processing' }> {
  return {
    status: 'processing',
    format: progress.format,
    filename: progress.filename,
    progress,
  };
}

describe('schema import progress presentation', () => {
  it.each([
    ['dtd', 'Reading the selected DTD file.'],
    ['xsd', 'Reading the selected XSD file.'],
    ['zip', 'Reading the selected ZIP file.'],
  ] as const)('presents truthful %s main-thread reading', (format, message) => {
    expect(
      presentSchemaImportProgress({
        status: 'reading',
        format,
        filename: `schema.${format}`,
      }),
    ).toEqual({
      heading: `Opening schema.${format}`,
      message,
      progressLabel: `Schema import progress: ${message}`,
      determinate: false,
      cancelAccessibleName: `Cancel opening schema.${format}`,
    });
  });

  it.each([
    ['preparing', 'Preparing schema.xsd.'],
    ['parsing', 'Parsing schema.xsd.'],
    ['building', 'Building the XSD project.'],
    ['finalizing', 'Finalizing the schema project.'],
  ] as const)(
    'presents XSD %s without a guessed percentage',
    (phase, message) => {
      const presentation = presentSchemaImportProgress(
        processing({
          phase,
          format: 'xsd',
          filename: 'schema.xsd',
        }),
      );
      expect(presentation.message).toBe(message);
      expect(presentation.determinate).toBe(false);
      expect(presentation).not.toHaveProperty('value');
      expect(presentation).not.toHaveProperty('max');
    },
  );

  it.each([
    ['discovering-package', 'Inspecting schemas.zip.'],
    ['reading-package', 'Reading schema files from schemas.zip.'],
    ['resolving-package', 'Resolving references across the ZIP package.'],
    ['finalizing', 'Finalizing schemas.zip.'],
  ] as const)('presents ZIP %s truthfully', (phase, message) => {
    expect(
      presentSchemaImportProgress(
        processing({
          phase,
          format: 'zip',
          filename: 'schemas.zip',
        }),
      ).message,
    ).toBe(message);
  });

  it('presents determinate N-of-M package-source progress only with valid values', () => {
    expect(
      presentSchemaImportProgress(
        processing({
          phase: 'importing-package-source',
          format: 'zip',
          filename: 'schemas.zip',
          current: 3,
          total: 12,
          currentSourceFilename: 'schemas/types.xsd',
        }),
      ),
    ).toMatchObject({
      message: 'Importing schema 3 of 12: schemas/types.xsd.',
      determinate: true,
      value: 3,
      max: 12,
    });
  });

  it('preserves malicious-looking filenames and source paths as inert text', () => {
    const state = processing({
      phase: 'importing-package-source',
      format: 'zip',
      filename: '<img src=x onerror=alert(1)>.zip',
      current: 1,
      total: 1,
      currentSourceFilename: '<script>private()</script>.xsd',
    });
    const before = structuredClone(state);
    const presentation = presentSchemaImportProgress(state);
    expect(presentation.heading).toContain('<img');
    expect(presentation.message).toContain('<script>');
    expect(state).toEqual(before);
    expect(JSON.parse(JSON.stringify(presentation))).toEqual(presentation);
  });

  it('uses a defensive visible fallback for an empty filename', () => {
    expect(
      presentSchemaImportProgress({
        status: 'reading',
        format: 'dtd',
        filename: '  ',
      }),
    ).toMatchObject({
      heading: 'Opening selected file',
      cancelAccessibleName: 'Cancel opening selected file',
    });
  });
});
