import type { SchemaSourceRange } from '../../../schema/model';
import {
  extractRelaxNgSourceReferences,
  relaxNgStructureNamespace,
} from '../../../schema/relaxng';
import type { SchemaPackageSourceText } from './schemaPackageDecoding';
import type {
  SchemaPackageDiagnostic,
  SchemaPackageFileRelationship,
} from './schemaPackageTypes';
import {
  compareUnicodeCodePoints,
  resolveControlledProjectPath,
} from './schemaPackageUtilities';

export { relaxNgStructureNamespace };

export interface RelaxNgPackageReference {
  readonly kind: 'rng-include' | 'rng-external-ref';
  readonly rawTarget: string;
  readonly sourcePath: string;
  readonly sourceFileId: string;
  readonly range: SchemaSourceRange;
  readonly sourceOrder: number;
}

/**
 * Reuses the existing namespace-aware XML lexer/parser only as a source-map
 * extractor. libxml2 remains the sole RELAX NG standards authority.
 */
export function extractRelaxNgPackageReferences(
  source: SchemaPackageSourceText,
): readonly RelaxNgPackageReference[] {
  if (source.entry.format !== 'rng') return [];
  try {
    return extractRelaxNgSourceReferences(
      source.sourceText,
      source.sourceFileId,
      source.entry.packageRelativePath,
    )
      .map((reference) => ({
        ...reference,
        sourcePath: source.entry.packageRelativePath,
      }))
      .sort(
        (left, right) =>
          left.sourceOrder - right.sourceOrder ||
          compareUnicodeCodePoints(left.kind, right.kind) ||
          compareUnicodeCodePoints(left.rawTarget, right.rawTarget),
      );
  } catch {
    // Native Compact Syntax diagnostics or libxml2 XML diagnostics remain the
    // authority for malformed sources; package graph discovery stays bounded.
    return [];
  }
}

export function buildRelaxNgPackageRelationships(
  sources: readonly SchemaPackageSourceText[],
  suppliedRngPaths: ReadonlySet<string>,
): readonly SchemaPackageFileRelationship[] {
  const relationships: SchemaPackageFileRelationship[] = [];
  for (const source of sources) {
    if (source.entry.format !== 'rng') continue;
    for (const [index, reference] of extractRelaxNgPackageReferences(
      source,
    ).entries()) {
      const resolution = resolveControlledProjectPath(
        reference.sourcePath,
        reference.rawTarget,
      );
      const status =
        resolution.status === 'blocked'
          ? 'blocked'
          : resolution.path !== undefined &&
              suppliedRngPaths.has(resolution.path) &&
              /\.rnc$/iu.test(reference.sourcePath) ===
                /\.rnc$/iu.test(resolution.path)
            ? 'resolved'
            : 'missing';
      relationships.push({
        id: `schema-package-file-relationship:${encodeURIComponent(reference.sourcePath)}:${reference.kind}:${index}`,
        kind: reference.kind,
        rawTarget: reference.rawTarget,
        sourcePath: reference.sourcePath,
        ...(status === 'resolved' && resolution.path !== undefined
          ? { targetPath: resolution.path }
          : {}),
        status,
        ...(resolution.blockedReason === undefined
          ? {}
          : { blockedReason: resolution.blockedReason }),
        range: reference.range,
      });
    }
  }
  return relationships.sort(
    (left, right) =>
      compareUnicodeCodePoints(left.sourcePath, right.sourcePath) ||
      (left.range?.start.offset ?? Number.MAX_SAFE_INTEGER) -
        (right.range?.start.offset ?? Number.MAX_SAFE_INTEGER) ||
      compareUnicodeCodePoints(left.kind, right.kind) ||
      compareUnicodeCodePoints(left.rawTarget, right.rawTarget),
  );
}

export function relaxNgRelationshipDiagnostics(
  relationships: readonly SchemaPackageFileRelationship[],
  sourceFileIdByPath: ReadonlyMap<string, string>,
): readonly SchemaPackageDiagnostic[] {
  return relationships
    .filter(({ status }) => status !== 'resolved')
    .map((relationship): SchemaPackageDiagnostic => {
      const label =
        relationship.kind === 'rng-include'
          ? 'RELAX NG include'
          : 'RELAX NG externalRef';
      const statusText =
        relationship.status === 'blocked'
          ? `blocked (${relationship.blockedReason ?? 'security policy'})`
          : relationship.status;
      return {
        stage: 'package',
        code:
          relationship.status === 'blocked'
            ? 'blocked-rng-dependency'
            : relationship.status === 'ambiguous'
              ? 'ambiguous-rng-dependency'
              : 'missing-rng-dependency',
        severity: 'warning',
        message: `${label} target "${relationship.rawTarget}" is ${statusText}.`,
        ...(sourceFileIdByPath.get(relationship.sourcePath) === undefined
          ? {}
          : {
              sourceFileId: sourceFileIdByPath.get(relationship.sourcePath),
            }),
        entryPath: relationship.sourcePath,
        reference: relationship.rawTarget,
        relationshipKind: relationship.kind,
        relationshipStatus: relationship.status,
        ...(relationship.blockedReason === undefined
          ? {}
          : { blockedReason: relationship.blockedReason }),
        ...(relationship.range === undefined
          ? {}
          : { range: relationship.range }),
      };
    });
}
