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
  'owningPatternId',
  'path',
  'rawHref',
  'sourceLexicalValue',
  'sourceValue',
  'explicit',
  'explicitNs',
]);

function canonicalizeImplicitGroups(
  model: RelaxNgSemanticModel,
): RelaxNgSemanticModel {
  const patternsById = new Map(
    model.patterns.map((pattern) => [pattern.id, pattern]),
  );
  const consumedGroups = new Set<string>();
  const flatten = (ids: readonly string[]): readonly string[] =>
    ids.flatMap((id) => {
      const pattern = patternsById.get(id);
      if (pattern?.kind !== 'group') return [id];
      consumedGroups.add(id);
      return flatten(pattern.childPatternIds);
    });

  const startClauses = model.startClauses.map((clause) => ({
    ...clause,
    bodyPatternIds: flatten(clause.bodyPatternIds),
  }));
  const defineClauses = model.defineClauses.map((clause) => ({
    ...clause,
    bodyPatternIds: flatten(clause.bodyPatternIds),
  }));
  const patterns = model.patterns.map((pattern) => {
    if (pattern.kind === 'element') {
      return {
        ...pattern,
        contentPatternIds: flatten(pattern.contentPatternIds),
      };
    }
    if (pattern.kind === 'attribute') {
      return { ...pattern, valuePatternIds: flatten(pattern.valuePatternIds) };
    }
    if (pattern.kind === 'group') {
      return { ...pattern, childPatternIds: flatten(pattern.childPatternIds) };
    }
    if (pattern.kind === 'data') {
      return {
        ...pattern,
        exceptPatternIds: flatten(pattern.exceptPatternIds),
      };
    }
    if (pattern.kind === 'value') {
      const prefix = pattern.lexicalValue.includes(':')
        ? pattern.lexicalValue.split(':', 1)[0]
        : undefined;
      return {
        ...pattern,
        namespaceBindings:
          pattern.type === 'QName' && prefix !== undefined
            ? Object.fromEntries(
                Object.entries(pattern.namespaceBindings).filter(
                  ([candidate]) => candidate === prefix,
                ),
              )
            : {},
      };
    }
    return pattern;
  });

  return {
    ...model,
    startClauses,
    defineClauses,
    patterns: patterns.filter(({ id }) => !consumedGroups.has(id)),
  };
}

/**
 * Produces a clone-safe, syntax-neutral view used to prove that XML and
 * Compact Syntax sources project to the same RELAX NG meaning. Source-facing
 * identity, spelling, order offsets, and ranges intentionally remain outside
 * this comparator.
 */
export function relaxNgSemanticMeaning(model: RelaxNgSemanticModel): unknown {
  model = canonicalizeImplicitGroups(model);
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
