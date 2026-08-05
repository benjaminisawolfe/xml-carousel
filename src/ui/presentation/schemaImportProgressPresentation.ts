import type {
  SchemaFileFormat,
  SchemaFileImportState,
} from '../../app/import/schemaFileImportController';

export interface SchemaImportProgressPresentation {
  readonly heading: string;
  readonly message: string;
  readonly progressLabel: string;
  readonly determinate: boolean;
  readonly value?: number;
  readonly max?: number;
  readonly cancelAccessibleName: string;
}

type VisibleImportState = Extract<
  SchemaFileImportState,
  { status: 'reading' | 'processing' }
>;

function visibleFilename(filename: string): string {
  return filename.trim() || 'selected file';
}

function formatName(format: SchemaFileFormat): string {
  return format.toUpperCase();
}

function readingMessage(format: SchemaFileFormat): string {
  return format === 'zip'
    ? 'Reading the selected ZIP file.'
    : `Reading the selected ${formatName(format)} file.`;
}

function processingMessage(
  state: Extract<VisibleImportState, { status: 'processing' }>,
  filename: string,
): string {
  const { progress } = state;
  switch (progress.phase) {
    case 'validating-standards':
      return `Checking ${filename} with Apache Xerces-C++…`;
    case 'preparing':
      return `Preparing ${filename}.`;
    case 'parsing':
      return `Parsing ${filename}.`;
    case 'building':
      return `Building the ${formatName(state.format)} project.`;
    case 'discovering-package':
      return `Inspecting ${filename}.`;
    case 'reading-package':
      return `Reading schema files from ${filename}.`;
    case 'importing-package-source': {
      const source = progress.currentSourceFilename?.trim() || 'schema file';
      return `Importing schema ${progress.current} of ${progress.total}: ${source}.`;
    }
    case 'resolving-package':
      return 'Resolving references across the ZIP package.';
    case 'indexing-search':
      return 'Preparing schema search.';
    case 'activating':
      return 'Preparing the schema interface.';
    case 'finalizing':
      return state.format === 'zip'
        ? `Finalizing ${filename}.`
        : 'Finalizing the schema project.';
  }
}

export function presentSchemaImportProgress(
  state: VisibleImportState,
): SchemaImportProgressPresentation {
  const filename = visibleFilename(state.filename);
  const message =
    state.status === 'reading'
      ? readingMessage(state.format)
      : processingMessage(state, filename);
  const current =
    state.status === 'processing' ? state.progress.current : undefined;
  const total =
    state.status === 'processing' ? state.progress.total : undefined;
  const determinate =
    Number.isInteger(current) &&
    Number.isInteger(total) &&
    (current ?? 0) > 0 &&
    (total ?? 0) > 0 &&
    (current ?? 0) <= (total ?? 0);

  return {
    heading: `Opening ${filename}`,
    message,
    progressLabel: `Schema import progress: ${message}`,
    determinate,
    ...(determinate ? { value: current, max: total } : {}),
    cancelAccessibleName: `Cancel opening ${filename}`,
  };
}
