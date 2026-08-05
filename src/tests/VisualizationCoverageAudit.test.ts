import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import matrix from '../../docs/technical/visualization-coverage-matrix.json';
import expectation from '../../tests/fixtures/hermetic-foundry/expected-audit.json';
import localization from '../../tests/fixtures/visualization-coverage/hermetic-finding-localization.json';
import { buildCoverageMatrix } from '../../scripts/visualization-coverage-catalogue.mjs';

interface LocalizationRecord {
  readonly sourcePath: string;
  readonly diagnosticCode: string;
  readonly matrixEntryId: string;
  readonly range: {
    readonly startOffset: number;
    readonly endOffset: number;
  };
}

const localizationRecords =
  localization.records as readonly LocalizationRecord[];

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function localizationErrors(
  candidate: typeof localization,
  knownMatrix: typeof matrix,
): string[] {
  const errors: string[] = [];
  const ids = new Set(knownMatrix.entries.map(({ id }) => id));
  if (candidate.findingCount !== candidate.records.length) {
    errors.push('finding count mismatch');
  }
  if (
    candidate.findingCount !==
    expectation.regressionSummary.visualizationTotalFindingCount
  ) {
    errors.push('baseline count mismatch');
  }
  if (candidate.records.some(({ matrixEntryId }) => !ids.has(matrixEntryId))) {
    errors.push('unknown matrix entry');
  }
  const counts = candidate.records.reduce<Record<string, number>>(
    (result, { diagnosticCode }) => {
      result[diagnosticCode] = (result[diagnosticCode] ?? 0) + 1;
      return result;
    },
    {},
  );
  const sortedCounts = Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
  if (
    JSON.stringify(sortedCounts) !==
    JSON.stringify(
      expectation.regressionSummary.visualizationFindingCountsByCode,
    )
  ) {
    errors.push('diagnostic count mismatch');
  }
  const matrixFindingCounts = Object.fromEntries(
    knownMatrix.entries
      .filter(({ currentFindings }) => currentFindings.length > 0)
      .map((entry) => [
        entry.id,
        (entry.currentFindings as readonly { readonly count: number }[]).reduce(
          (total, finding) => total + finding.count,
          0,
        ),
      ]),
  );
  if (
    JSON.stringify(matrixFindingCounts) !==
    JSON.stringify(candidate.findingCountsByMatrixEntry)
  ) {
    errors.push('matrix finding count mismatch');
  }
  return errors;
}

describe('Task 13.10 visualization coverage audit', () => {
  it('keeps the checked matrix byte-equivalent to its exhaustive catalogue', () => {
    expect(matrix).toEqual(buildCoverageMatrix());
    expect(matrix.entries).toHaveLength(221);
    expect(
      Object.fromEntries(
        Object.entries(
          matrix.entries.reduce<Record<string, number>>((counts, entry) => {
            counts[entry.standardsFamily] =
              (counts[entry.standardsFamily] ?? 0) + 1;
            return counts;
          }, {}),
        ).sort(([left], [right]) => left.localeCompare(right)),
      ),
    ).toEqual({
      'XML/DTD': 51,
      'XSD 1.0': 77,
      'ZIP/package presentation': 40,
      'annotation/foreign/source content': 23,
      'schema-set relationship': 30,
    });
    const dtdEntries = matrix.entries.filter(
      ({ standardsFamily }) => standardsFamily === 'XML/DTD',
    );
    expect(dtdEntries).toHaveLength(51);
    expect(
      dtdEntries.every(
        (entry) =>
          entry.exactGapClassification === 'complete' &&
          entry.extractionStatus === 'complete' &&
          entry.normalizedModelStatus === 'complete' &&
          entry.sourceIdentityStatus === 'complete' &&
          entry.rawSourceMarkupStatus === 'complete' &&
          entry.navigationStatus === 'complete' &&
          entry.searchStatus === 'complete' &&
          entry.carouselStatus === 'complete' &&
          entry.inspectorStatus === 'complete' &&
          entry.sourceViewStatus === 'complete' &&
          entry.accessibilityStatus === 'complete' &&
          entry.existingTestCoverage.status === 'complete',
      ),
    ).toBe(true);
    const task1314Entries = matrix.entries.filter(
      ({ owningFutureTask }) => owningFutureTask === '13.14',
    );
    expect(task1314Entries).toHaveLength(30);
    expect(
      task1314Entries.every(
        (entry) =>
          entry.exactGapClassification === 'complete' &&
          entry.extractionStatus === 'complete' &&
          entry.normalizedModelStatus === 'complete' &&
          entry.navigationStatus === 'complete' &&
          entry.searchStatus === 'complete' &&
          entry.carouselStatus === 'complete' &&
          entry.inspectorStatus === 'complete' &&
          entry.sourceViewStatus === 'complete' &&
          entry.accessibilityStatus === 'complete',
      ),
    ).toBe(true);
    const task1317Entries = matrix.entries.filter(
      ({ owningFutureTask }) => owningFutureTask === '13.17',
    );
    expect(task1317Entries.map(({ id }) => id)).toEqual([
      'presentation.carousel-context',
      'presentation.compact-layout-reachability',
      'presentation.continuation-disclosure',
      'presentation.declaration-reference-language',
      'presentation.dense-structure-bounds',
      'presentation.file-ownership-label',
      'presentation.focus-inspector-independence',
      'presentation.inspector-detail',
      'presentation.keyboard-reachability',
      'presentation.large-project-reachability',
      'presentation.navigation-discovery',
      'presentation.relationship-label',
      'presentation.screen-reader-semantics',
      'presentation.search-discovery',
      'presentation.source-view-route',
      'presentation.unnamed-context-label',
    ]);
    expect(
      task1317Entries.every(
        (entry) =>
          entry.exactGapClassification === 'complete' &&
          entry.extractionStatus === 'complete' &&
          entry.normalizedModelStatus === 'complete' &&
          entry.sourceIdentityStatus === 'complete' &&
          entry.rawSourceMarkupStatus === 'complete' &&
          entry.navigationStatus === 'complete' &&
          entry.searchStatus === 'complete' &&
          entry.carouselStatus === 'complete' &&
          entry.inspectorStatus === 'complete' &&
          entry.sourceViewStatus === 'complete' &&
          entry.accessibilityStatus === 'complete' &&
          entry.existingTestCoverage.status === 'complete',
      ),
    ).toBe(true);
    expect(
      matrix.entries.every(
        ({ exactGapClassification }) => exactGapClassification === 'complete',
      ),
    ).toBe(true);
  });

  it('detects an unreviewed classification change', () => {
    const changed = deepClone(matrix);
    changed.entries[0]!.exactGapClassification = 'partial';
    expect(changed).not.toEqual(buildCoverageMatrix());
  });

  it('records the completed Hermetic annotation gate with no retained findings', () => {
    expect(localizationErrors(localization, matrix)).toEqual([]);
    expect(localization.findingCount).toBe(0);
    expect(localization.findingCountsByCode).toEqual({});
    expect(localization.records).toEqual([]);
    expect(
      matrix.entries
        .filter(({ owningFutureTask }) => owningFutureTask === '13.15')
        .every(
          (entry) =>
            entry.exactGapClassification === 'complete' &&
            entry.currentFindings.length === 0,
        ),
    ).toBe(true);
  });

  it('fails when a completed gate fabricates a stale finding count', () => {
    const stale = deepClone(localization);
    stale.findingCount = 1;
    stale.findingCountsByCode = { 'xsd:multiple-annotations': 1 };
    expect(localizationErrors(stale, matrix)).not.toEqual([]);
  });

  it('proves localization order independence and excludes host paths', () => {
    expect(new Set(Object.values(localization.orderResults))).toHaveLength(1);
    expect(JSON.stringify(localization)).not.toMatch(/[A-Z]:[\\/]/u);
    expect(localizationRecords.map((record) => record.sourcePath)).toEqual(
      [...localizationRecords]
        .sort(
          (left, right) =>
            left.sourcePath.localeCompare(right.sourcePath) ||
            left.range.startOffset - right.range.startOffset ||
            left.range.endOffset - right.range.endOffset ||
            left.diagnosticCode.localeCompare(right.diagnosticCode) ||
            left.matrixEntryId.localeCompare(right.matrixEntryId),
        )
        .map((record) => record.sourcePath),
    );
  });

  it('produces byte-stable machine and human summaries through the Node CLI', () => {
    const command = ['scripts/audit-visualization-coverage.mjs'];
    const first = execFileSync(process.execPath, command, {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    const second = execFileSync(process.execPath, command, {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    expect(first).toBe(second);
    expect(first).not.toMatch(/[A-Z]:[\\/]/u);
    expect(first).toContain('Hermetic localized findings: 0');
  });
});
