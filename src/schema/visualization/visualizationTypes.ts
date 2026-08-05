import type { SchemaSourceRange } from '../model';

export const MAX_RETAINED_VISUALIZATION_FINDINGS = 50;

export type VisualizationCompleteness = 'complete' | 'partial';

export interface VisualizationFinding {
  readonly id: string;
  readonly stage: 'visualization';
  readonly severity: 'warning';
  readonly source: 'visualization';
  readonly category: 'visualization';
  readonly code: string;
  readonly message: string;
  readonly sourceFileId?: string;
  readonly range?: SchemaSourceRange;
  readonly constructKind?: string;
  readonly constructName?: string;
  readonly sourceMarkup?: string;
}

export interface VisualizationSummary {
  readonly completeness: VisualizationCompleteness;
  readonly totalFindingCount: number;
  readonly retainedFindingCount: number;
  readonly omittedConstructCount: number;
  readonly placeholderCount: number;
  /** Exact uncapped audit counts; UI finding retention remains bounded. */
  readonly findingCountsByCode?: Readonly<Record<string, number>>;
}

export interface VisualizationResult {
  readonly summary: VisualizationSummary;
  readonly findings: readonly VisualizationFinding[];
}

export interface VisualizationFindingInput {
  readonly code: string;
  readonly message: string;
  readonly sourceFileId?: string;
  readonly range?: SchemaSourceRange;
  readonly constructKind?: string;
  readonly constructName?: string;
  readonly sourceMarkup?: string;
}

function compareOptional(left?: string, right?: string): number {
  return (left ?? '').localeCompare(right ?? '');
}

function compareFindings(
  left: VisualizationFindingInput,
  right: VisualizationFindingInput,
): number {
  return (
    compareOptional(left.sourceFileId, right.sourceFileId) ||
    (left.range?.start.offset ?? Number.MAX_SAFE_INTEGER) -
      (right.range?.start.offset ?? Number.MAX_SAFE_INTEGER) ||
    (left.range?.end.offset ?? Number.MAX_SAFE_INTEGER) -
      (right.range?.end.offset ?? Number.MAX_SAFE_INTEGER) ||
    left.code.localeCompare(right.code) ||
    compareOptional(left.constructKind, right.constructKind) ||
    compareOptional(left.constructName, right.constructName) ||
    left.message.localeCompare(right.message)
  );
}

function cloneRange(range: SchemaSourceRange): SchemaSourceRange {
  return {
    start: { ...range.start },
    end: { ...range.end },
    ...(range.sourceId === undefined ? {} : { sourceId: range.sourceId }),
  };
}

export function createVisualizationResult(
  inputs: readonly VisualizationFindingInput[],
  totalFindingCount = inputs.length,
  suppliedFindingCountsByCode?: Readonly<Record<string, number>>,
): VisualizationResult {
  const retainedInputs = [...inputs]
    .sort(compareFindings)
    .slice(0, MAX_RETAINED_VISUALIZATION_FINDINGS);
  const findings = retainedInputs.map((input, index) =>
    Object.freeze({
      id: `visualization:finding:${index + 1}`,
      stage: 'visualization' as const,
      severity: 'warning' as const,
      source: 'visualization' as const,
      category: 'visualization' as const,
      code: input.code,
      message: input.message,
      ...(input.sourceFileId === undefined
        ? {}
        : { sourceFileId: input.sourceFileId }),
      ...(input.range === undefined ? {} : { range: cloneRange(input.range) }),
      ...(input.constructKind === undefined
        ? {}
        : { constructKind: input.constructKind }),
      ...(input.constructName === undefined
        ? {}
        : { constructName: input.constructName }),
      ...(input.sourceMarkup === undefined
        ? {}
        : { sourceMarkup: input.sourceMarkup }),
    }),
  );
  const total = Math.max(totalFindingCount, inputs.length);
  const findingCountsByCode = Object.fromEntries(
    Object.entries(
      suppliedFindingCountsByCode ??
        inputs.reduce<Record<string, number>>((counts, input) => {
          counts[input.code] = (counts[input.code] ?? 0) + 1;
          return counts;
        }, {}),
    ).sort(([left], [right]) => left.localeCompare(right)),
  );
  return Object.freeze({
    summary: Object.freeze({
      completeness: total === 0 ? 'complete' : 'partial',
      totalFindingCount: total,
      retainedFindingCount: findings.length,
      omittedConstructCount: total,
      placeholderCount: 0,
      findingCountsByCode: Object.freeze(findingCountsByCode),
    }),
    findings: Object.freeze(findings),
  });
}

export const completeVisualizationResult = createVisualizationResult([]);
