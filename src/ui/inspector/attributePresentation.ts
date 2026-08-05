import type {
  DtdNormalizedAttributeDefault,
  DtdNormalizedAttributeType,
  DtdNormalizedLiteralValue,
} from '../../schema/dtd';

export function formatDtdAttributeType(
  type: DtdNormalizedAttributeType,
): string {
  if (type.kind === 'tokenized') return type.name;
  const values = type.values.join(' | ');
  return type.kind === 'notation' ? `NOTATION (${values})` : `(${values})`;
}

function formatLiteral(literal: DtdNormalizedLiteralValue): string {
  const quote = literal.quote === 'single' ? "'" : '"';
  return `${quote}${literal.value}${quote}`;
}

export function formatDtdAttributeDefault(
  value: DtdNormalizedAttributeDefault,
): string {
  switch (value.kind) {
    case 'required':
      return 'Required';
    case 'implied':
      return 'Implied';
    case 'fixed':
      return `Fixed ${formatLiteral(value.literal)}`;
    case 'value':
      return `Default ${formatLiteral(value.literal)}`;
  }
}
