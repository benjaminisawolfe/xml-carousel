import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import matrix from '../../docs/technical/visualization-coverage-matrix.json';
import {
  completeVisualizationExpectations,
  deriveReleaseBlockingVisualizationFindingCodes,
  validateAcceptedProjectEvidence,
  validateCompleteVisualizationMatrix,
  validateGeneratedMatrixText,
  validateReachabilityRegistry,
  validateVisualizationAcceptance,
  type ReachabilityRegistryInput,
} from '../acceptance/completeVisualizationAcceptance';
import { buildCoverageMatrix } from '../../scripts/visualization-coverage-catalogue.mjs';
import {
  packageEntryReachabilityContracts,
  reachabilityActivationActions,
  schemaEdgeReachabilityContracts,
  schemaNodeReachabilityContracts,
  formatReachabilityActionLabel,
} from '../ui/presentation/schemaReachability';
import {
  dtdBuildDiagnosticPolicy,
  dtdParseDiagnosticPolicy,
  xsdBuildDiagnosticPolicy,
  xsdDiagnosticPolicy,
} from '../schema/visualization/diagnosticPolicy';
import { schemaEdgeKinds, schemaNodeKinds } from '../schema/model';
import { schemaPackageEntryKinds } from '../app/import/schemaPackage/schemaPackageTypes';
import expectation from '../../tests/fixtures/hermetic-foundry/expected-audit.json';
import localization from '../../tests/fixtures/visualization-coverage/hermetic-finding-localization.json';

const releaseBlockingVisualizationFindingCodes =
  deriveReleaseBlockingVisualizationFindingCodes({
    dtdParse: dtdParseDiagnosticPolicy,
    dtdBuild: dtdBuildDiagnosticPolicy,
    xsdParse: xsdDiagnosticPolicy,
    xsdBuild: xsdBuildDiagnosticPolicy,
  });

type DeepMutable<T> = {
  -readonly [Property in keyof T]: DeepMutable<T[Property]>;
};

function clone<T>(value: T): DeepMutable<T> {
  return JSON.parse(JSON.stringify(value)) as DeepMutable<T>;
}

function registry(
  overrides: Partial<ReachabilityRegistryInput> = {},
): ReachabilityRegistryInput {
  return {
    nodeKinds: [...schemaNodeKinds],
    edgeKinds: [...schemaEdgeKinds],
    packageEntryKinds: [...schemaPackageEntryKinds],
    nodeContracts: clone(schemaNodeReachabilityContracts),
    edgeContracts: clone(schemaEdgeReachabilityContracts),
    packageEntryContracts: clone(packageEntryReachabilityContracts),
    activationHandlers: [...reachabilityActivationActions],
    formatActionLabel: formatReachabilityActionLabel,
    ...overrides,
  };
}

describe('Task 13.18 complete-visualization acceptance gate', () => {
  it('accepts exactly 221 complete generated rows and the ownership contract', () => {
    expect(validateCompleteVisualizationMatrix(matrix)).toEqual([]);
    expect(matrix.entries).toHaveLength(
      completeVisualizationExpectations.matrixEntryCount,
    );
    expect(
      Object.fromEntries(
        Object.entries(
          matrix.entries.reduce<Record<string, number>>((counts, row) => {
            counts[row.owningFutureTask] =
              (counts[row.owningFutureTask] ?? 0) + 1;
            return counts;
          }, {}),
        ).sort(([left], [right]) => left.localeCompare(right)),
      ),
    ).toEqual(completeVisualizationExpectations.ownership);
  });

  it('accepts exhaustive node, edge, and package-entry reachability', () => {
    expect(validateReachabilityRegistry(registry())).toEqual([]);
    expect(schemaNodeKinds).toHaveLength(52);
    expect(schemaEdgeKinds).toHaveLength(52);
    expect(schemaPackageEntryKinds).toHaveLength(5);
  });

  it('derives the seven release-blocking presentation codes from policy', () => {
    expect(releaseBlockingVisualizationFindingCodes).toEqual([
      'dtd:unresolved-element-reference',
      'dtd:unsupported-declaration',
      'dtd:unsupported-syntax',
      'xsd:invalid-annotation-placement',
      'xsd:multiple-annotations',
      'xsd:unsupported-explicit-local-form',
      'xsd:unsupported-xsd-component',
    ]);
    expect(
      releaseBlockingVisualizationFindingCodes.every((code) =>
        releaseBlockingVisualizationFindingCodes.includes(code),
      ),
    ).toBe(true);
    expect(
      releaseBlockingVisualizationFindingCodes.includes('xerces-xml:40'),
    ).toBe(false);
    expect(
      releaseBlockingVisualizationFindingCodes.includes(
        'xerces:missing-project-dependency',
      ),
    ).toBe(false);
  });

  it('accepts the committed Hermetic and standalone-failure evidence', () => {
    expect(validateAcceptedProjectEvidence(expectation, localization)).toEqual(
      [],
    );
  });

  it('is invoked by the one canonical validation decision', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
    const runner = readFileSync('scripts/run-validation.mjs', 'utf8');
    expect(packageJson.scripts['acceptance:complete-visualization']).toBe(
      'node scripts/complete-visualization-acceptance.mjs',
    );
    expect(runner).toContain("['run', 'acceptance:complete-visualization']");
    expect(runner).not.toContain(
      "['run', 'audit:visualization-coverage:verify']",
    );
  });

  it('rejects partial and misleading matrix rows by stable ID', () => {
    for (const state of ['partial', 'misleading']) {
      const changed = clone(matrix);
      changed.entries[0]!.exactGapClassification = state;
      expect(
        validateCompleteVisualizationMatrix(changed, changed).join('\n'),
      ).toContain(
        `matrix row ${changed.entries[0]!.id}: exactGapClassification must be complete`,
      );
    }
  });

  it('rejects duplicate IDs and ownership count drift', () => {
    const duplicate = clone(matrix);
    duplicate.entries[1]!.id = duplicate.entries[0]!.id;
    expect(
      validateCompleteVisualizationMatrix(duplicate, duplicate).join('\n'),
    ).toContain(
      `matrix row ${duplicate.entries[0]!.id}: stable ID is duplicated`,
    );

    const ownership = clone(matrix);
    const originalOwner = ownership.entries[0]!.owningFutureTask;
    ownership.entries[0]!.owningFutureTask = '13.12';
    expect(
      validateCompleteVisualizationMatrix(ownership, ownership).join('\n'),
    ).toContain(`matrix ownership invariant Task ${originalOwner}`);
  });

  it('rejects missing and stale reachability contracts', () => {
    const missing = registry({
      nodeKinds: [...schemaNodeKinds, 'newNormalizedKind'],
    });
    expect(validateReachabilityRegistry(missing).join('\n')).toContain(
      'node kind newNormalizedKind: reachability contract is missing',
    );

    const stale = registry();
    (stale.nodeContracts as Record<string, unknown>).retiredKind = {
      kind: 'retiredKind',
    };
    expect(validateReachabilityRegistry(stale).join('\n')).toContain(
      'node kind retiredKind: stale reachability contract remains',
    );

    const duplicate = registry({
      nodeKinds: [...schemaNodeKinds, 'schema'],
    });
    expect(validateReachabilityRegistry(duplicate).join('\n')).toContain(
      'node kind schema: authoritative kind is duplicated',
    );
  });

  it('rejects omitted surfaces, missing handlers, and impossible source targets', () => {
    const omitted = registry();
    delete (omitted.nodeContracts.schema as { search?: unknown }).search;
    expect(validateReachabilityRegistry(omitted).join('\n')).toContain(
      'node kind schema.search: applicable surface is omitted without not-applicable',
    );

    const handlers = registry({
      activationHandlers: reachabilityActivationActions.filter(
        (action) => action !== 'center',
      ),
    });
    expect(validateReachabilityRegistry(handlers).join('\n')).toContain(
      'activation action center has no handler',
    );

    const target = registry();
    (
      target.nodeContracts.schema as {
        sourceView: { target: string };
      }
    ).sourceView.target = 'standard-reference';
    expect(validateReachabilityRegistry(target).join('\n')).toContain(
      'action open-source cannot resolve target standard-reference',
    );
  });

  it('rejects a supported source-only fallback and unspecified focus', () => {
    const sourceOnly = registry();
    const sourceOnlySchema = sourceOnly.nodeContracts.schema as {
      primaryRoute: string;
      navigation: Record<string, string>;
    };
    sourceOnlySchema.primaryRoute = 'sourceView';
    sourceOnlySchema.navigation = {
      availability: 'not-applicable',
      action: 'not-applicable',
      target: 'not-applicable',
      focusResult: 'not-applicable',
    };
    expect(validateReachabilityRegistry(sourceOnly).join('\n')).toContain(
      'source-only primary route is invalid',
    );

    const focus = registry();
    delete (
      focus.nodeContracts.schema as {
        search: { focusResult?: string };
      }
    ).search.focusResult;
    expect(validateReachabilityRegistry(focus).join('\n')).toContain(
      'node kind schema.search: focus behavior is unspecified',
    );
  });

  it('rejects release-blocking findings in accepted valid input', () => {
    const errors = validateVisualizationAcceptance(
      {
        summary: {
          completeness: 'partial',
          totalFindingCount: 1,
          retainedFindingCount: 1,
          omittedConstructCount: 1,
          placeholderCount: 0,
          findingCountsByCode: { 'xsd:unsupported-xsd-component': 1 },
        },
        findings: [{ code: 'xsd:unsupported-xsd-component' }],
      },
      'mutated fixture',
      releaseBlockingVisualizationFindingCodes,
    );
    expect(errors.join('\n')).toContain(
      'mutated fixture: release-blocking visualization finding xsd:unsupported-xsd-component',
    );
  });

  it('rejects stale generated matrix bytes', () => {
    const generated = `${JSON.stringify(buildCoverageMatrix(), null, 2)}\n`;
    expect(validateGeneratedMatrixText(generated, generated)).toEqual([]);
    expect(
      validateGeneratedMatrixText(`${generated} `, generated).join('\n'),
    ).toContain('committed output is stale');
  });
});
