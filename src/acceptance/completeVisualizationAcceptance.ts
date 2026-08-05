import { buildCoverageMatrix } from '../../scripts/visualization-coverage-catalogue.mjs';

export const completeVisualizationExpectations = Object.freeze({
  matrixEntryCount: 221,
  ownership: Object.freeze({
    '13.11': 51,
    '13.12': 44,
    '13.13': 33,
    '13.14': 30,
    '13.15': 23,
    '13.16': 24,
    '13.17': 16,
  }),
  docbook: Object.freeze({
    byteLength: 46_263,
    sha256: 'a6581df71f08bf6020bf467c80246196bf70e37203ca430588b42487fc6476b2',
    elementCount: 106,
  }),
  hermetic: Object.freeze({
    archiveByteLength: 134_821,
    archiveSha256:
      'c17ce1c44cd5aa309bcc652bb43f64e30bc993aef52a0347cfbc799a32886a8f',
    packageEntryCount: 85,
    packageSchemaSourceCount: 38,
    packageIgnoredCount: 44,
    packageDirectoryCount: 3,
    packageRootCandidateCount: 33,
    supportedNodeCount: 3_958,
    sourceMarkupNodeCount: 3_739,
    normalizedResultSha256:
      'f7afe07f003c8d3423f5c5ec7551afa5d8a320a2626c0f76430c7c1701327a4a',
  }),
});

const completeLayerFields = Object.freeze([
  'extractionStatus',
  'normalizedModelStatus',
  'sourceIdentityStatus',
  'rawSourceMarkupStatus',
  'navigationStatus',
  'searchStatus',
  'carouselStatus',
  'inspectorStatus',
  'sourceViewStatus',
  'accessibilityStatus',
]);

const routeSurfaces = Object.freeze([
  'navigation',
  'search',
  'carousel',
  'inspector',
  'sourceView',
]);

interface ReachabilityRouteLike {
  readonly availability?: string;
  readonly action?: string;
  readonly target?: string;
  readonly focusResult?: string;
}

interface ReachabilityContractLike {
  readonly kind?: string;
  readonly kindLabel?: string;
  readonly relationshipLabel?: string;
  readonly primaryRoute?: string;
  readonly secondaryRoutes?: readonly string[];
  readonly navigation?: ReachabilityRouteLike;
  readonly search?: ReachabilityRouteLike;
  readonly carousel?: ReachabilityRouteLike;
  readonly inspector?: ReachabilityRouteLike;
  readonly sourceView?: ReachabilityRouteLike;
}

export interface ReachabilityRegistryInput {
  readonly nodeKinds: readonly string[];
  readonly edgeKinds: readonly string[];
  readonly packageEntryKinds: readonly string[];
  readonly nodeContracts: Readonly<Record<string, unknown>>;
  readonly edgeContracts: Readonly<Record<string, unknown>>;
  readonly packageEntryContracts: Readonly<Record<string, unknown>>;
  readonly activationHandlers: readonly string[];
  readonly formatActionLabel?: (
    action: never,
    name: string,
    kindLabel: string,
  ) => string;
}

const validTargets = new Set([
  'schema-node',
  'node-inspector',
  'node-source-markup',
  'package-entry',
  'package-entry-source',
  'standard-reference',
  'not-applicable',
]);

const actionContract: Readonly<
  Record<
    string,
    {
      readonly targets: readonly string[];
      readonly focusResult: string;
    }
  >
> = Object.freeze({
  center: Object.freeze({
    targets: Object.freeze(['schema-node']),
    focusResult: 'carousel-card',
  }),
  inspect: Object.freeze({
    targets: Object.freeze(['node-inspector']),
    focusResult: 'inspector-heading',
  }),
  'open-source': Object.freeze({
    targets: Object.freeze(['node-source-markup', 'package-entry-source']),
    focusResult: 'source-markup',
  }),
  'open-package-entry': Object.freeze({
    targets: Object.freeze(['package-entry']),
    focusResult: 'package-entry-summary',
  }),
});

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function asContract(value: unknown): ReachabilityContractLike {
  return asRecord(value) as ReachabilityContractLike;
}

export function deriveReleaseBlockingVisualizationFindingCodes(policies: {
  readonly dtdParse: Readonly<Record<string, string>>;
  readonly dtdBuild: Readonly<Record<string, string>>;
  readonly xsdParse: Readonly<Record<string, string>>;
  readonly xsdBuild: Readonly<Record<string, string>>;
}): readonly string[] {
  const derived = (
    [
      ['dtd', policies.dtdParse],
      ['dtd', policies.dtdBuild],
      ['xsd', policies.xsdParse],
      ['xsd', policies.xsdBuild],
    ] as const
  ).flatMap(([prefix, policy]) =>
    Object.entries(policy)
      .filter(
        ([, classification]) => classification === 'visualization-warning',
      )
      .map(([code]) => `${prefix}:${code}`),
  );
  return Object.freeze(
    derived.sort((left, right) => left.localeCompare(right)),
  );
}

function countBy(
  values: readonly unknown[],
  keyOf: (value: Record<string, unknown>) => string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const key = keyOf(asRecord(value));
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function exactRegistryErrors(
  label: string,
  kinds: readonly string[],
  contracts: Readonly<Record<string, unknown>>,
): string[] {
  const errors: string[] = [];
  const duplicateKinds = kinds.filter(
    (kind, index) => kinds.indexOf(kind) !== index,
  );
  for (const kind of new Set(duplicateKinds)) {
    errors.push(`${label} kind ${kind}: authoritative kind is duplicated`);
  }
  const knownKinds = new Set(kinds);
  for (const kind of kinds) {
    if (!Object.prototype.hasOwnProperty.call(contracts, kind)) {
      errors.push(`${label} kind ${kind}: reachability contract is missing`);
    }
  }
  for (const kind of Object.keys(contracts)) {
    if (!knownKinds.has(kind)) {
      errors.push(`${label} kind ${kind}: stale reachability contract remains`);
    }
  }
  return errors;
}

function validateRoute(
  label: string,
  surface: string,
  route: ReachabilityRouteLike | undefined,
  activationHandlers: readonly string[],
  formatLabel: (action: never, name: string, kindLabel: string) => string,
): string[] {
  const errors: string[] = [];
  const location = `${label}.${surface}`;
  if (!route) {
    return [
      `${location}: applicable surface is omitted without not-applicable`,
    ];
  }
  if (!route.focusResult) {
    errors.push(`${location}: focus behavior is unspecified`);
  }
  if (!route.target || !validTargets.has(route.target)) {
    errors.push(
      `${location}: target ${String(route.target)} is not resolvable`,
    );
  }
  if (route.availability === 'not-applicable') {
    if (route.action !== 'not-applicable') {
      errors.push(
        `${location}: not-applicable availability must use not-applicable action`,
      );
    }
    if (route.focusResult !== 'not-applicable') {
      errors.push(
        `${location}: not-applicable route must have not-applicable focus result`,
      );
    }
    return errors;
  }
  if (!route.action || route.action === 'not-applicable') {
    errors.push(
      `${location}: applicable route cannot use not-applicable action`,
    );
    return errors;
  }
  if (!activationHandlers.includes(route.action)) {
    errors.push(
      `${location}: activation action ${route.action} has no handler`,
    );
  }
  const required = actionContract[route.action];
  if (!required) {
    errors.push(`${location}: action ${route.action} is unknown`);
  } else {
    if (!route.target || !required.targets.includes(route.target)) {
      errors.push(
        `${location}: action ${route.action} cannot resolve target ${String(route.target)}`,
      );
    }
    if (route.focusResult !== required.focusResult) {
      errors.push(
        `${location}: action ${route.action} requires focus result ${required.focusResult}`,
      );
    }
  }
  const accessibleName = formatLabel(
    route.action as never,
    'Acceptance target',
    label,
  );
  if (typeof accessibleName !== 'string' || accessibleName.trim() === '') {
    errors.push(`${location}: accessible action name is missing`);
  }
  return errors;
}

export function validateGeneratedMatrixText(
  committedText: string,
  generatedText: string,
): string[] {
  return committedText === generatedText
    ? []
    : [
        'generated matrix invariant: committed output is stale relative to its deterministic generator',
      ];
}

export function validateCompleteVisualizationMatrix(
  matrixValue: unknown,
  generatedMatrix: unknown = buildCoverageMatrix(),
): string[] {
  const errors: string[] = [];
  const matrix = asRecord(matrixValue);
  if (matrix.schemaVersion !== 1) {
    errors.push('matrix schemaVersion invariant: expected 1');
  }
  const entries = Array.isArray(matrix.entries) ? matrix.entries : [];
  if (entries.length !== completeVisualizationExpectations.matrixEntryCount) {
    errors.push(
      `matrix entry-count invariant: expected ${completeVisualizationExpectations.matrixEntryCount}, received ${entries.length}`,
    );
  }
  const seen = new Set<string>();
  let previousId = '';
  for (const entryValue of entries) {
    const entry = asRecord(entryValue);
    const id = typeof entry.id === 'string' ? entry.id : '<missing-row-id>';
    if (!/^[a-z0-9.-]+$/u.test(id)) {
      errors.push(
        `matrix row ${id}: stable ID must be a lower-case identifier`,
      );
    }
    if (seen.has(id)) {
      errors.push(`matrix row ${id}: stable ID is duplicated`);
    }
    if (id.localeCompare(previousId) <= 0) {
      errors.push(`matrix row ${id}: stable IDs are not strictly sorted`);
    }
    previousId = id;
    seen.add(id);
    if (entry.exactGapClassification !== 'complete') {
      errors.push(
        `matrix row ${id}: exactGapClassification must be complete, received ${String(entry.exactGapClassification)}`,
      );
    }
    for (const field of completeLayerFields) {
      if (entry[field] !== 'complete') {
        errors.push(
          `matrix row ${id}: ${field} must be complete, received ${String(entry[field])}`,
        );
      }
    }
    const testCoverage = asRecord(entry.existingTestCoverage);
    if (testCoverage.status !== 'complete') {
      errors.push(
        `matrix row ${id}: existingTestCoverage.status must be complete`,
      );
    }
    if (
      typeof entry.owningFutureTask !== 'string' ||
      !Object.prototype.hasOwnProperty.call(
        completeVisualizationExpectations.ownership,
        entry.owningFutureTask,
      )
    ) {
      errors.push(`matrix row ${id}: owningFutureTask is not recognized`);
    }
    if (
      !Array.isArray(entry.currentFindings) ||
      entry.currentFindings.length > 0
    ) {
      errors.push(`matrix row ${id}: currentFindings must be an empty array`);
    }
    if (
      !Array.isArray(entry.deterministicEvidenceReferences) ||
      entry.deterministicEvidenceReferences.length === 0
    ) {
      errors.push(`matrix row ${id}: deterministic evidence is missing`);
    }
    if (
      !Array.isArray(entry.intendedSecondaryPresentationRoutes) ||
      entry.intendedSecondaryPresentationRoutes.length === 0
    ) {
      errors.push(
        `matrix row ${id}: complete secondary presentation route is missing`,
      );
    }
  }
  const ownership = countBy(entries, (entry) => String(entry.owningFutureTask));
  for (const [task, expected] of Object.entries(
    completeVisualizationExpectations.ownership,
  )) {
    if (ownership[task] !== expected) {
      errors.push(
        `matrix ownership invariant Task ${task}: expected ${expected}, received ${ownership[task] ?? 0}`,
      );
    }
  }
  for (const task of Object.keys(ownership)) {
    if (
      !Object.prototype.hasOwnProperty.call(
        completeVisualizationExpectations.ownership,
        task,
      )
    ) {
      errors.push(`matrix ownership invariant: unrecognized Task ${task}`);
    }
  }
  if (JSON.stringify(matrixValue) !== JSON.stringify(generatedMatrix)) {
    errors.push(
      'generated matrix invariant: matrix differs from deterministic regeneration',
    );
  }
  return errors;
}

export function validateReachabilityRegistry(
  input: ReachabilityRegistryInput,
): string[] {
  const errors = [
    ...exactRegistryErrors('node', input.nodeKinds, input.nodeContracts),
    ...exactRegistryErrors('edge', input.edgeKinds, input.edgeContracts),
    ...exactRegistryErrors(
      'package-entry',
      input.packageEntryKinds,
      input.packageEntryContracts,
    ),
  ];
  const labelFormatter =
    input.formatActionLabel ??
    ((action: never, name: string, kind: string) =>
      `${String(action)} ${name} ${kind}`);

  for (const kind of input.nodeKinds) {
    const contract = asContract(input.nodeContracts[kind]);
    if (Object.keys(contract).length === 0) continue;
    const location = `node kind ${kind}`;
    if (contract.kind !== kind) {
      errors.push(`${location}: contract kind is ${String(contract.kind)}`);
    }
    if (
      typeof contract.kindLabel !== 'string' ||
      contract.kindLabel.trim() === ''
    ) {
      errors.push(`${location}: accessible kind label is missing`);
    }
    for (const surface of routeSurfaces) {
      errors.push(
        ...validateRoute(
          location,
          surface,
          contract[surface as keyof ReachabilityContractLike] as
            ReachabilityRouteLike | undefined,
          input.activationHandlers,
          labelFormatter,
        ),
      );
    }
    const declaredRoutes = [
      contract.primaryRoute,
      ...(contract.secondaryRoutes ?? []),
    ];
    if (new Set(declaredRoutes).size !== declaredRoutes.length) {
      errors.push(
        `${location}: primary and secondary routes contain duplicates`,
      );
    }
    if (
      !contract.primaryRoute ||
      !['navigation', 'search', 'inspector'].includes(contract.primaryRoute)
    ) {
      errors.push(
        `${location}: source-only primary route is invalid for a supported normalized node`,
      );
    }
    for (const surface of ['navigation', 'search', 'inspector'] as const) {
      if (contract[surface]?.availability === 'not-applicable') {
        errors.push(
          `${location}.${surface}: supported discovery/inspection route cannot be source-only`,
        );
      }
    }
    if (
      contract.primaryRoute === 'inspector' &&
      contract.carousel?.availability !== 'not-applicable'
    ) {
      errors.push(
        `${location}.carousel: inspector-first kind cannot claim carousel focus`,
      );
    }
  }

  for (const kind of input.edgeKinds) {
    const contract = asContract(input.edgeContracts[kind]);
    if (Object.keys(contract).length === 0) continue;
    const location = `edge kind ${kind}`;
    if (contract.kind !== kind) {
      errors.push(`${location}: contract kind is ${String(contract.kind)}`);
    }
    if (
      typeof contract.relationshipLabel !== 'string' ||
      contract.relationshipLabel.trim() === ''
    ) {
      errors.push(`${location}: relationship label is missing`);
    }
    for (const surface of ['carousel', 'inspector', 'sourceView'] as const) {
      if (
        !['direct', 'contextual', 'when-textual', 'not-applicable'].includes(
          contract[surface]?.availability ?? String(contract[surface]),
        )
      ) {
        errors.push(
          `${location}.${surface}: availability is missing or unknown`,
        );
      }
    }
  }

  for (const kind of input.packageEntryKinds) {
    const contract = asContract(input.packageEntryContracts[kind]);
    if (Object.keys(contract).length === 0) continue;
    const location = `package-entry kind ${kind}`;
    if (contract.kind !== kind) {
      errors.push(`${location}: contract kind is ${String(contract.kind)}`);
    }
    if (contract.primaryRoute !== 'packageInventory') {
      errors.push(`${location}: primary route must be packageInventory`);
    }
    if (
      typeof contract.kindLabel !== 'string' ||
      contract.kindLabel.trim() === ''
    ) {
      errors.push(`${location}: accessible kind label is missing`);
    }
    for (const surface of routeSurfaces) {
      errors.push(
        ...validateRoute(
          location,
          surface,
          contract[surface as keyof ReachabilityContractLike] as
            ReachabilityRouteLike | undefined,
          input.activationHandlers,
          labelFormatter,
        ),
      );
    }
    if (contract.carousel?.availability !== 'not-applicable') {
      errors.push(
        `${location}.carousel: package-only kind cannot claim carousel focus`,
      );
    }
  }
  return errors;
}

export function validateVisualizationAcceptance(
  resultValue: unknown,
  label: string,
  releaseBlockingCodes: readonly string[],
): string[] {
  const errors: string[] = [];
  const result = asRecord(resultValue);
  const summary = asRecord(result.summary);
  if (summary.completeness !== 'complete') {
    errors.push(`${label}: visualization completeness must be complete`);
  }
  if (summary.totalFindingCount !== 0) {
    errors.push(`${label}: visualization finding total must be 0`);
  }
  if (summary.omittedConstructCount !== 0) {
    errors.push(`${label}: omitted supported construct count must be 0`);
  }
  if (summary.placeholderCount !== 0) {
    errors.push(`${label}: placeholder count must be 0`);
  }
  const blocking = new Set(releaseBlockingCodes);
  const findings = Array.isArray(result.findings) ? result.findings : [];
  for (const findingValue of findings) {
    const finding = asRecord(findingValue);
    if (typeof finding.code === 'string' && blocking.has(finding.code)) {
      errors.push(
        `${label}: release-blocking visualization finding ${finding.code}`,
      );
    }
  }
  const counts = asRecord(summary.findingCountsByCode);
  for (const [code, count] of Object.entries(counts)) {
    if (blocking.has(code) && typeof count === 'number' && count > 0) {
      errors.push(
        `${label}: release-blocking visualization count ${code}=${count}`,
      );
    }
  }
  return [...new Set(errors)];
}

export function validateAcceptedProjectEvidence(
  expectationValue: unknown,
  localizationValue: unknown,
): string[] {
  const errors: string[] = [];
  const expectation = asRecord(expectationValue);
  const summary = asRecord(expectation.regressionSummary);
  const localization = asRecord(localizationValue);
  const expected = completeVisualizationExpectations.hermetic;
  const exactFields: Readonly<Record<string, string | number>> = {
    archiveByteLength: expected.archiveByteLength,
    archiveSha256: expected.archiveSha256,
    packageEntryCount: expected.packageEntryCount,
    packageSchemaSourceCount: expected.packageSchemaSourceCount,
    packageIgnoredCount: expected.packageIgnoredCount,
    packageDirectoryCount: expected.packageDirectoryCount,
    packageRootCandidateCount: expected.packageRootCandidateCount,
    supportedNodeCount: expected.supportedNodeCount,
    sourceMarkupNodeCount: expected.sourceMarkupNodeCount,
    normalizedResultSha256: expected.normalizedResultSha256,
  };
  for (const [field, value] of Object.entries(exactFields)) {
    if (summary[field] !== value) {
      errors.push(
        `Hermetic evidence ${field}: expected ${value}, received ${String(summary[field])}`,
      );
    }
  }
  const zeroFields = [
    'visualizationTotalFindingCount',
    'retainedFindingCount',
    'unresolvedReferenceCount',
    'packageUnresolvedRelationshipCount',
    'missingArchiveReferenceCount',
    'externalReferenceCount',
  ];
  if (summary.visualizationCompleteness !== 'complete') {
    errors.push(
      `Hermetic evidence visualizationCompleteness: expected complete, received ${String(summary.visualizationCompleteness)}`,
    );
  }
  for (const field of zeroFields) {
    if (summary[field] !== 0) {
      errors.push(
        `Hermetic evidence ${field}: expected 0, received ${String(summary[field])}`,
      );
    }
  }
  const probe = asRecord(summary.standaloneDependencyProbe);
  const probeCounts = asRecord(probe.fatalDiagnosticCountsByCode);
  if (
    probe.entryPath !== 'foundry-common.xsd' ||
    probe.importStatus !== 'failure' ||
    probe.blockedDependency !== true ||
    probeCounts['xerces:missing-project-dependency'] !== 1
  ) {
    errors.push(
      'Hermetic evidence standalone probe: missing supplied sibling must remain a blocked failure',
    );
  }
  const archive = asRecord(localization.archive);
  if (
    archive.byteLength !== expected.archiveByteLength ||
    archive.sha256 !== expected.archiveSha256
  ) {
    errors.push(
      'Hermetic localization evidence: archive identity does not match the accepted archive',
    );
  }
  if (
    localization.findingCount !== 0 ||
    !Array.isArray(localization.records) ||
    localization.records.length !== 0
  ) {
    errors.push(
      'Hermetic localization evidence: release-blocking visualization findings must be 0',
    );
  }
  const orderResults = asRecord(localization.orderResults);
  const orderHashes = [
    orderResults.original,
    orderResults.reversed,
    orderResults['deterministic-shuffled'],
  ];
  if (
    orderHashes.some((hash) => typeof hash !== 'string') ||
    new Set(orderHashes).size !== 1
  ) {
    errors.push(
      'Hermetic localization evidence: original/reversed/shuffled results are not equivalent',
    );
  }
  return errors;
}
