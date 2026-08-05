import type { SchemaNode, SchemaProject } from '../../schema/model';

export function getNodeSourceFilename(
  project: Pick<SchemaProject, 'sourceFiles'>,
  node: Pick<SchemaNode, 'sourceFileId'> | undefined,
): string | undefined {
  const sourceFileId = node?.sourceFileId?.trim();
  if (!sourceFileId) return undefined;
  const sourceFilename = project.sourceFiles
    ?.find(({ id }) => id === sourceFileId)
    ?.filename.trim();
  return sourceFilename || sourceFileId;
}

export function getCarouselHeading(
  focusedNode: Pick<SchemaNode, 'sourceFileId'> | undefined,
  project: Pick<SchemaProject, 'displayName' | 'sourceFiles'>,
): string {
  const sourceFilename = getNodeSourceFilename(project, focusedNode);
  if (sourceFilename) return sourceFilename;

  const projectName = project.displayName.trim();
  return projectName || 'Schema view';
}
