import type { RelaxNgSemanticModel } from './relaxNgSemanticModel';

const omittedKeys = new Set([
  'id',
  'sourceFileId',
  'sourceOrder',
  'range',
  'nameRange',
  'combineRange',
  'lexicalNameRange',
  'typeRange',
  'valueRange',
  'hrefRange',
  'packageRelationshipId',
  'path',
  'rawHref',
  'sourceLexicalValue',
  'sourceValue',
  'explicit',
  'explicitNs',
]);

/**
 * Produces a clone-safe, syntax-neutral view used to prove that XML and
 * Compact Syntax sources project to the same RELAX NG meaning. Source-facing
 * identity, spelling, order offsets, and ranges intentionally remain outside
 * this comparator.
 */
export function relaxNgSemanticMeaning(model: RelaxNgSemanticModel): unknown {
  const valuesById = new Map<string, Record<string, unknown>>();
  for (const [collectionName, collection] of Object.entries(model)) {
    if (!Array.isArray(collection)) continue;
    collection.forEach((entry, index) => {
      if (
        typeof entry === 'object' &&
        entry !== null &&
        'id' in entry &&
        typeof entry.id === 'string'
      ) {
        valuesById.set(entry.id, {
          ...(entry as Record<string, unknown>),
          semanticCollection: collectionName,
          semanticIndex: index,
        });
      }
    });
  }

  const semanticKeys = [
    'semanticCollection',
    'kind',
    'name',
    'localName',
    'lexicalName',
    'type',
    'combine',
    'effectiveCombine',
  ] as const;
  const signatures = new Map(
    [...valuesById].map(([id, value]) => [
      id,
      JSON.stringify(
        Object.fromEntries(
          semanticKeys.flatMap((key) =>
            value[key] === undefined ? [] : [[key, value[key]]],
          ),
        ),
      ),
    ]),
  );

  const normalize = (value: unknown, key?: string): unknown => {
    if (key !== undefined && omittedKeys.has(key)) return undefined;
    if (
      key === 'namespaceBindings' &&
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value)
    ) {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).filter(
          ([prefix, uri]) =>
            !(prefix === '' && uri === 'http://relaxng.org/ns/structure/1.0') &&
            !(
              prefix === 'xml' && uri === 'http://www.w3.org/XML/1998/namespace'
            ) &&
            !(
              prefix === 'a' &&
              uri === 'http://relaxng.org/ns/compatibility/annotations/1.0'
            ),
        ),
      );
    }
    if (typeof value === 'string') return signatures.get(value) ?? value;
    if (Array.isArray(value)) {
      return value
        .map((entry) => normalize(entry))
        .filter((entry) => entry !== undefined);
    }
    if (typeof value !== 'object' || value === null) return value;
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .flatMap(([entryKey, entryValue]) => {
          const normalized = normalize(entryValue, entryKey);
          return normalized === undefined ? [] : [[entryKey, normalized]];
        }),
    );
  };

  const normalized = normalize(model) as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(normalized).map(([key, value]) => [
      key,
      Array.isArray(value)
        ? [...value].sort((left, right) =>
            JSON.stringify(left).localeCompare(JSON.stringify(right)),
          )
        : value,
    ]),
  );
}

export function areRelaxNgSemanticallyEquivalent(
  left: RelaxNgSemanticModel,
  right: RelaxNgSemanticModel,
): boolean {
  return (
    JSON.stringify(relaxNgSemanticMeaning(left)) ===
    JSON.stringify(relaxNgSemanticMeaning(right))
  );
}
