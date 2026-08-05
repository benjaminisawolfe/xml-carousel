import JSZip from 'jszip';
import type {
  LoadedArchiveDirectory,
  SchemaArchiveMetadataLoader,
} from './schemaArchiveTypes';

export const loadJsZipMetadata: SchemaArchiveMetadataLoader = async (
  data,
): Promise<LoadedArchiveDirectory> => {
  const archive = await JSZip.loadAsync(data, {
    checkCRC32: false,
    createFolders: false,
  });

  return {
    entries: Object.values(archive.files).map((entry) => {
      const sizes = (
        entry as typeof entry & {
          readonly _data?: {
            readonly uncompressedSize?: unknown;
            readonly compressedSize?: unknown;
          };
        }
      )._data;
      const uncompressedByteLength = sizes?.uncompressedSize;
      const compressedByteLength = sizes?.compressedSize;
      return {
        name: entry.name,
        unsafeOriginalName: entry.unsafeOriginalName,
        dir: entry.dir,
        ...(Number.isSafeInteger(uncompressedByteLength) &&
        (uncompressedByteLength as number) >= 0
          ? { uncompressedByteLength: uncompressedByteLength as number }
          : {}),
        ...(Number.isSafeInteger(compressedByteLength) &&
        (compressedByteLength as number) >= 0
          ? { compressedByteLength: compressedByteLength as number }
          : {}),
      };
    }),
  };
};
