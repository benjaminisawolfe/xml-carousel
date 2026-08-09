import type { InspectorSummary } from '../inspector/inspectorSummary';
import { formatSchemaNodeKind } from '../carousel/nodePresentation';
import type { SourceViewPresentation } from './sourceMarkupPresentation';

export const NODE_SUMMARY_COLLECTION_LIMIT = 20;
export const NODE_SUMMARY_EXCERPT_LIMIT = 240;
export const NODE_SUMMARY_VALUE_LIMIT = 240;

const PROPERTY_PRIORITY = [
  'scope',
  'namespace',
  'target-namespace',
  'type',
  'base-type',
  'references',
  'occurs',
  'derivation',
  'role',
  'content-kind',
  'mixed',
  'element-form',
  'allowed-values',
  'namespace-constraint',
  'process-contents',
  'version',
] as const;

const PROPERTY_RANK = new Map<string, number>(
  PROPERTY_PRIORITY.map((id, index) => [id, index]),
);

function normalize(value: string | undefined): string {
  return value?.replace(/\s+/gu, ' ').trim() ?? '';
}

function truncate(value: string, limit = NODE_SUMMARY_VALUE_LIMIT): string {
  const characters = Array.from(value);
  return characters.length > limit
    ? `${characters.slice(0, limit - 1).join('')}…`
    : value;
}

function normalizedValue(value: string | undefined): string {
  return truncate(normalize(value));
}

function safeSourceLabel(
  sourcePresentation: SourceViewPresentation | undefined,
): string {
  const label = normalize(sourcePresentation?.sourceIdentity?.label);
  return /^(?:[a-z]:[\\/]|[\\/]{1,2}|file:)/iu.test(label)
    ? ''
    : normalizedValue(label);
}

function appendLine(lines: string[], label: string, value: string): void {
  const normalized = normalize(value);
  if (normalized) lines.push(`${label}: ${normalized}`);
}

function bounded(items: string[]): string {
  const visible = items.slice(0, NODE_SUMMARY_COLLECTION_LIMIT);
  const remaining = items.length - visible.length;
  return remaining > 0
    ? `${visible.join('; ')}; +${remaining} more`
    : visible.join('; ');
}

function orderedByPresentation<T extends { order: number }>(
  items: readonly T[],
): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (left, right) =>
        left.item.order - right.item.order || left.index - right.index,
    )
    .map(({ item }) => item);
}

function formatStructuralDestinations(summary: InspectorSummary): string {
  const destinations = summary.isSchemaOverview
    ? summary.declarations
    : summary.orderedDestinations;

  return bounded(
    orderedByPresentation(destinations).flatMap((destination) => {
      const name = normalizedValue(destination.displayName);
      if (!name) return [];
      const occurrence = normalizedValue(destination.occurrence);
      if (!occurrence) return [name];
      return [
        /^[?*+]$/u.test(occurrence)
          ? `${name}${occurrence}`
          : `${name} (${occurrence})`,
      ];
    }),
  );
}

function formatAttributes(summary: InspectorSummary): string {
  const attributes = summary.isSchemaOverview
    ? summary.globalAttributes
    : summary.attributes;

  return bounded(
    orderedByPresentation(attributes).flatMap((attribute) => {
      const name = normalizedValue(attribute.name);
      if (!name) return [];
      const details = attribute.detailLines
        .map(normalizedValue)
        .filter(Boolean);
      return [details.length > 0 ? `${name} (${details.join(' · ')})` : name];
    }),
  );
}

function excerpt(value: string): string {
  const characters = Array.from(normalize(value));
  if (characters.length <= NODE_SUMMARY_EXCERPT_LIMIT)
    return characters.join('');
  return `${characters.slice(0, NODE_SUMMARY_EXCERPT_LIMIT - 1).join('')}…`;
}

function formatFirstExcerpt(
  entries: ReadonlyArray<{ text: string; order: number }>,
): string {
  const readable = orderedByPresentation(entries)
    .map(({ text }) => normalize(text))
    .filter(Boolean);
  if (readable.length === 0) return '';
  const additional = readable.length - 1;
  return additional > 0
    ? `${excerpt(readable[0]!)} (+${additional} more)`
    : excerpt(readable[0]!);
}

function formatUsedBy(summary: InspectorSummary): string {
  const seen = new Set<string>();
  const declarations: string[] = [];

  for (const relationship of orderedByPresentation(
    summary.incomingRelationships,
  )) {
    if (seen.has(relationship.nodeId)) continue;
    seen.add(relationship.nodeId);
    const name = normalizedValue(relationship.displayName);
    if (name) declarations.push(name);
  }

  if (declarations.length === 0) return '';
  const count = declarations.length;
  return `${count} ${count === 1 ? 'declaration' : 'declarations'} — ${bounded(declarations)}`;
}

/**
 * Formats one Inspector target for a short, deterministic plain-text handoff.
 * The function intentionally consumes presentation data only and never follows
 * relationships beyond those already shown directly by the Inspector.
 */
export function formatNodeSummary(
  summary: InspectorSummary,
  sourcePresentation: SourceViewPresentation | undefined,
): string {
  const lines: string[] = [];

  appendLine(lines, 'Name', normalizedValue(summary.displayName));
  appendLine(
    lines,
    'Kind',
    normalizedValue(formatSchemaNodeKind(summary.kind)),
  );
  appendLine(lines, 'Source', safeSourceLabel(sourcePresentation));
  appendLine(
    lines,
    'Location',
    normalizedValue(sourcePresentation?.location.label),
  );

  summary.overviewProperties
    .map((property, index) => ({ property, index }))
    .filter(
      ({ property }) => property.id !== 'kind' && property.id !== 'source-file',
    )
    .sort((left, right) => {
      const leftRank =
        PROPERTY_RANK.get(left.property.id) ?? PROPERTY_PRIORITY.length;
      const rightRank =
        PROPERTY_RANK.get(right.property.id) ?? PROPERTY_PRIORITY.length;
      return leftRank - rightRank || left.index - right.index;
    })
    .forEach(({ property }) =>
      appendLine(
        lines,
        normalizedValue(property.label),
        normalizedValue(property.value),
      ),
    );

  appendLine(
    lines,
    'Structural destinations',
    formatStructuralDestinations(summary),
  );
  appendLine(lines, 'Attributes', formatAttributes(summary));
  appendLine(
    lines,
    'Documentation',
    formatFirstExcerpt(
      summary.documentation.map(({ displayText, order }) => ({
        text: displayText,
        order,
      })),
    ),
  );
  appendLine(lines, 'Comment', formatFirstExcerpt(summary.comments));
  appendLine(lines, 'Used by', formatUsedBy(summary));

  return lines.join('\n');
}
