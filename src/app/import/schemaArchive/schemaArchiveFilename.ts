export function normalizeSchemaArchiveFilename(filename: string): string {
  const trimmed = filename.trim();
  const segments = trimmed.split(/[\\/]/u);
  return segments[segments.length - 1] ?? '';
}

export function isSchemaArchiveFilename(filename: string): boolean {
  const normalized = normalizeSchemaArchiveFilename(filename);
  return normalized.length > 0 && /\.zip$/iu.test(normalized);
}
