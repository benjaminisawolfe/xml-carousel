/**
 * XML Schema 1.0 built-in type ancestry. This is application-owned reference
 * data: it never acquires user-source identity or source markup.
 */
export interface XsdBuiltInTypeDefinition {
  readonly base?: string;
  readonly derivation?: 'restriction' | 'list';
}

const primitiveBase = 'anySimpleType';

export const xsdBuiltInTypeDefinitions: Readonly<
  Record<string, XsdBuiltInTypeDefinition>
> = Object.freeze({
  anyType: {},
  anySimpleType: { base: 'anyType', derivation: 'restriction' },
  string: { base: primitiveBase, derivation: 'restriction' },
  boolean: { base: primitiveBase, derivation: 'restriction' },
  decimal: { base: primitiveBase, derivation: 'restriction' },
  float: { base: primitiveBase, derivation: 'restriction' },
  double: { base: primitiveBase, derivation: 'restriction' },
  duration: { base: primitiveBase, derivation: 'restriction' },
  dateTime: { base: primitiveBase, derivation: 'restriction' },
  time: { base: primitiveBase, derivation: 'restriction' },
  date: { base: primitiveBase, derivation: 'restriction' },
  gYearMonth: { base: primitiveBase, derivation: 'restriction' },
  gYear: { base: primitiveBase, derivation: 'restriction' },
  gMonthDay: { base: primitiveBase, derivation: 'restriction' },
  gDay: { base: primitiveBase, derivation: 'restriction' },
  gMonth: { base: primitiveBase, derivation: 'restriction' },
  hexBinary: { base: primitiveBase, derivation: 'restriction' },
  base64Binary: { base: primitiveBase, derivation: 'restriction' },
  anyURI: { base: primitiveBase, derivation: 'restriction' },
  QName: { base: primitiveBase, derivation: 'restriction' },
  NOTATION: { base: primitiveBase, derivation: 'restriction' },
  normalizedString: { base: 'string', derivation: 'restriction' },
  token: { base: 'normalizedString', derivation: 'restriction' },
  language: { base: 'token', derivation: 'restriction' },
  Name: { base: 'token', derivation: 'restriction' },
  NCName: { base: 'Name', derivation: 'restriction' },
  ID: { base: 'NCName', derivation: 'restriction' },
  IDREF: { base: 'NCName', derivation: 'restriction' },
  IDREFS: { base: 'IDREF', derivation: 'list' },
  ENTITY: { base: 'NCName', derivation: 'restriction' },
  ENTITIES: { base: 'ENTITY', derivation: 'list' },
  NMTOKEN: { base: 'token', derivation: 'restriction' },
  NMTOKENS: { base: 'NMTOKEN', derivation: 'list' },
  integer: { base: 'decimal', derivation: 'restriction' },
  nonPositiveInteger: { base: 'integer', derivation: 'restriction' },
  negativeInteger: { base: 'nonPositiveInteger', derivation: 'restriction' },
  long: { base: 'integer', derivation: 'restriction' },
  int: { base: 'long', derivation: 'restriction' },
  short: { base: 'int', derivation: 'restriction' },
  byte: { base: 'short', derivation: 'restriction' },
  nonNegativeInteger: { base: 'integer', derivation: 'restriction' },
  unsignedLong: { base: 'nonNegativeInteger', derivation: 'restriction' },
  unsignedInt: { base: 'unsignedLong', derivation: 'restriction' },
  unsignedShort: { base: 'unsignedInt', derivation: 'restriction' },
  unsignedByte: { base: 'unsignedShort', derivation: 'restriction' },
  positiveInteger: { base: 'nonNegativeInteger', derivation: 'restriction' },
});

export function getXsdBuiltInTypeAncestry(
  localName: string,
): readonly string[] {
  const ancestry: string[] = [];
  const seen = new Set<string>([localName]);
  let current = xsdBuiltInTypeDefinitions[localName]?.base;
  while (current && !seen.has(current)) {
    ancestry.push(current);
    seen.add(current);
    current = xsdBuiltInTypeDefinitions[current]?.base;
  }
  return ancestry;
}
