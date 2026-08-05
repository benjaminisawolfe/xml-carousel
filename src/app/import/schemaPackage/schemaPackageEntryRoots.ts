import { resolveXercesProjectReference } from '../../../standards/xerces/pathPolicy';
import type { SchemaPackageSourceText } from './schemaPackageDecoding';
import { compareUnicodeCodePoints } from './schemaPackageUtilities';

const xsdDependencyPattern =
  /<(?:[\w.-]+:)?(?:include|import)\b[^>]*\bschemaLocation\s*=\s*(['"])(.*?)\1[^>]*>/giu;

function dependencyReferences(sourceText: string): readonly string[] {
  const markup = sourceText
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/gu, '');
  const references: string[] = [];
  for (const match of markup.matchAll(xsdDependencyPattern)) {
    if (match[2] !== undefined) references.push(match[2]);
  }
  return references;
}

/**
 * Selects likely validation roots without interpreting XSD semantics. Every
 * source remains in the immutable project map. Unreferenced XSDs are roots;
 * one deterministic representative is added for each otherwise-unreachable
 * cycle. DTD entries remain independent roots.
 */
export function selectSchemaPackageEntryRoots(
  sources: readonly SchemaPackageSourceText[],
): readonly { readonly format: 'dtd' | 'xsd'; readonly entryPath: string }[] {
  const xsdPaths = sources
    .filter(({ entry }) => entry.format === 'xsd')
    .map(({ entry }) => entry.packageRelativePath)
    .sort(compareUnicodeCodePoints);
  const xsdPathSet = new Set(xsdPaths);
  const dependencies = new Map<string, Set<string>>(
    xsdPaths.map((path) => [path, new Set<string>()]),
  );
  const referenced = new Set<string>();

  for (const source of sources) {
    if (source.entry.format !== 'xsd') continue;
    const sourcePath = source.entry.packageRelativePath;
    for (const reference of dependencyReferences(source.sourceText)) {
      let targetPath: string;
      try {
        targetPath = resolveXercesProjectReference(sourcePath, reference);
      } catch {
        // Xerces remains authoritative for unsafe or malformed references.
        continue;
      }
      if (!xsdPathSet.has(targetPath)) continue;
      dependencies.get(sourcePath)!.add(targetPath);
      referenced.add(targetPath);
    }
  }

  const selected = xsdPaths.filter((path) => !referenced.has(path));
  const reachable = new Set<string>();
  const visit = (start: string): void => {
    const pending = [start];
    while (pending.length > 0) {
      const current = pending.pop()!;
      if (reachable.has(current)) continue;
      reachable.add(current);
      const targets = [...(dependencies.get(current) ?? [])].sort(
        compareUnicodeCodePoints,
      );
      for (let index = targets.length - 1; index >= 0; index -= 1) {
        pending.push(targets[index]!);
      }
    }
  };
  selected.forEach(visit);

  for (const path of xsdPaths) {
    if (reachable.has(path)) continue;
    selected.push(path);
    visit(path);
  }

  const roots = [
    ...sources
      .filter(({ entry }) => entry.format === 'dtd')
      .map(({ entry }) => ({
        format: 'dtd' as const,
        entryPath: entry.packageRelativePath,
      })),
    ...selected.map((entryPath) => ({ format: 'xsd' as const, entryPath })),
  ];
  return roots.sort((left, right) =>
    compareUnicodeCodePoints(left.entryPath, right.entryPath),
  );
}
