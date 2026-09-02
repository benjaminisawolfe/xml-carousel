import type { SchemaArchiveSchemaEntry } from '../schemaArchive';
import type { SchemaPackageDiagnostic } from './schemaPackageTypes';

export interface SchemaPackageSourceText {
  readonly entry: SchemaArchiveSchemaEntry;
  readonly sourceFileId: string;
  readonly byteLength: number;
  readonly sourceText: string;
}

export type SchemaPackageDecodeResult =
  | { readonly status: 'success'; readonly source: SchemaPackageSourceText }
  | {
      readonly status: 'failure';
      readonly diagnostic: SchemaPackageDiagnostic;
    };

const xmlDeclarationPattern = /^\s*<\?xml\b([\s\S]*?)\?>/u;
const encodingAttributePattern = /\bencoding\s*=\s*(['"])(.*?)\1/iu;

export function decodeSchemaPackageSource(
  entry: SchemaArchiveSchemaEntry,
  sourceFileId: string,
  bytes: Uint8Array,
): SchemaPackageDecodeResult {
  let sourceText: string;
  try {
    sourceText = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return {
      status: 'failure',
      diagnostic: {
        stage: 'package',
        code: 'invalid-utf8',
        severity: 'error',
        message: 'The schema entry is not valid UTF-8 text.',
        sourceFileId,
        entryPath: entry.archivePath,
      },
    };
  }

  if (entry.format === 'xsd' || entry.format === 'rng') {
    const declaration = xmlDeclarationPattern.exec(sourceText)?.[1];
    const encoding = declaration
      ? encodingAttributePattern.exec(declaration)?.[2]
      : undefined;
    if (
      encoding !== undefined &&
      encoding.toLowerCase() !== 'utf-8' &&
      encoding.toLowerCase() !== 'utf8'
    ) {
      return {
        status: 'failure',
        diagnostic: {
          stage: 'package',
          code: 'unsupported-source-encoding',
          severity: 'error',
          message: `${entry.format.toUpperCase()} entries must use UTF-8 when an XML encoding is declared.`,
          sourceFileId,
          entryPath: entry.archivePath,
        },
      };
    }
  }

  return {
    status: 'success',
    source: {
      entry,
      sourceFileId,
      byteLength: bytes.byteLength,
      sourceText,
    },
  };
}
