import { describe, expect, it } from 'vitest';
import type {
  DtdNormalizedAttributeDefault,
  DtdNormalizedAttributeType,
} from '../../schema/dtd';
import {
  formatDtdAttributeDefault,
  formatDtdAttributeType,
} from './attributePresentation';

describe('DTD attribute presentation', () => {
  it.each([
    'CDATA',
    'ID',
    'IDREF',
    'IDREFS',
    'ENTITY',
    'ENTITIES',
    'NMTOKEN',
    'NMTOKENS',
  ] as const)('formats the %s tokenized type exactly', (name) => {
    expect(formatDtdAttributeType({ kind: 'tokenized', name })).toBe(name);
  });

  it('preserves enumeration and NOTATION value order', () => {
    const enumeration: DtdNormalizedAttributeType = {
      kind: 'enumeration',
      values: ['draft', 'review', 'final'],
    };
    const notation: DtdNormalizedAttributeType = {
      kind: 'notation',
      values: ['gif', 'jpg', 'png'],
    };

    expect(formatDtdAttributeType(enumeration)).toBe(
      '(draft | review | final)',
    );
    expect(formatDtdAttributeType(notation)).toBe('NOTATION (gif | jpg | png)');
  });

  it.each([
    [{ kind: 'required' }, 'Required'],
    [{ kind: 'implied' }, 'Implied'],
    [
      {
        kind: 'fixed',
        literal: { value: 'gif', quote: 'double' },
      },
      'Fixed "gif"',
    ],
    [
      {
        kind: 'value',
        literal: { value: "don't expand &copy;", quote: 'single' },
      },
      "Default 'don't expand &copy;'",
    ],
  ] satisfies readonly (readonly [DtdNormalizedAttributeDefault, string])[])(
    'formats default metadata as user-facing text',
    (value, expected) => {
      expect(formatDtdAttributeDefault(value)).toBe(expected);
    },
  );

  it('preserves embedded markup-looking text and line breaks', () => {
    expect(
      formatDtdAttributeDefault({
        kind: 'value',
        literal: { value: 'one > two\n"quoted"', quote: 'double' },
      }),
    ).toBe('Default "one > two\n"quoted""');
  });
});
