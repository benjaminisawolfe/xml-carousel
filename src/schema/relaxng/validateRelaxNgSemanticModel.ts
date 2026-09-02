import type {
  RelaxNgSemanticFinding,
  RelaxNgSemanticModel,
} from './relaxNgSemanticModel';

export function validateRelaxNgSemanticModel(
  model: RelaxNgSemanticModel,
): readonly RelaxNgSemanticFinding[] {
  const findings: RelaxNgSemanticFinding[] = [];
  const sourceIds = new Set(
    model.documents.map(({ sourceFileId }) => sourceFileId),
  );
  const collections = [
    model.documents,
    model.grammars,
    model.startClauses,
    model.effectiveStarts,
    model.defineClauses,
    model.definitionGroups,
    model.patterns,
    model.nameClasses,
    model.params,
    model.includes,
    model.annotations,
    model.documentation,
    model.bindings,
  ] as const;
  const allIds = collections.flatMap((collection) =>
    collection.map(({ id }) => id),
  );
  const idSet = new Set<string>();
  for (const id of allIds) {
    if (idSet.has(id)) {
      findings.push({
        id: `rng-semantic:integrity:${findings.length}`,
        code: 'semantic-extractor-internal',
        message: `Duplicate semantic identifier ${id}.`,
        constructId: id,
      });
    }
    idSet.add(id);
  }

  const grammarIds = new Set(model.grammars.map(({ id }) => id));
  const patternIds = new Set(model.patterns.map(({ id }) => id));
  const nameClassIds = new Set(model.nameClasses.map(({ id }) => id));
  const definitionGroupIds = new Set(
    model.definitionGroups.map(({ id }) => id),
  );
  const checkId = (ownerId: string, value: string, label: string): void => {
    if (idSet.has(value)) return;
    findings.push({
      id: `rng-semantic:integrity:${findings.length}`,
      code: 'semantic-extractor-internal',
      message: `${label} ${value} referenced by ${ownerId} does not exist.`,
      constructId: ownerId,
    });
  };

  for (const document of model.documents) {
    if (!sourceIds.has(document.sourceFileId)) {
      findings.push({
        id: `rng-semantic:integrity:${findings.length}`,
        code: 'semantic-extractor-internal',
        message: `Document ${document.id} has an invalid source identity.`,
        constructId: document.id,
      });
    }
    if (!patternIds.has(document.rootPatternId)) {
      checkId(document.id, document.rootPatternId, 'Root pattern');
    }
    if (document.grammarId && !grammarIds.has(document.grammarId)) {
      checkId(document.id, document.grammarId, 'Grammar');
    }
  }
  for (const pattern of model.patterns) {
    if (pattern.grammarId && !grammarIds.has(pattern.grammarId)) {
      checkId(pattern.id, pattern.grammarId, 'Grammar');
    }
    if (
      (pattern.kind === 'element' || pattern.kind === 'attribute') &&
      !nameClassIds.has(pattern.nameClassId)
    ) {
      checkId(pattern.id, pattern.nameClassId, 'Name class');
    }
    if (
      (pattern.kind === 'ref' || pattern.kind === 'parentRef') &&
      pattern.resolvedDefinitionGroupId &&
      !definitionGroupIds.has(pattern.resolvedDefinitionGroupId)
    ) {
      checkId(
        pattern.id,
        pattern.resolvedDefinitionGroupId,
        'Definition group',
      );
    }
  }
  for (const collection of collections) {
    for (const construct of collection) {
      if (!('range' in construct) || construct.range === undefined) continue;
      const { start, end } = construct.range;
      if (
        start.offset < 0 ||
        end.offset < start.offset ||
        start.line < 1 ||
        start.column < 1 ||
        end.line < 1 ||
        end.column < 1
      ) {
        findings.push({
          id: `rng-semantic:integrity:${findings.length}`,
          code: 'semantic-extractor-internal',
          message: `Construct ${construct.id} has an invalid source range.`,
          constructId: construct.id,
          range: construct.range,
        });
      }
    }
  }
  return findings;
}
