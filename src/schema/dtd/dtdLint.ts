import type {
  DtdAttributeDefinitionAst,
  DtdAttributeListDeclarationAst,
  DtdDeclarationAst,
  DtdSourceRange,
} from './dtdAst';

export const dtdLintDiagnosticCodes = [
  'attlist-target-undeclared',
  'duplicate-attribute-declaration',
  'attlist-without-element-declarations',
] as const;

export type DtdLintDiagnosticCode = (typeof dtdLintDiagnosticCodes)[number];

export interface DtdLintDiagnostic {
  readonly code: DtdLintDiagnosticCode;
  readonly severity: 'warning';
  readonly source: 'dtd-lint';
  readonly category: 'dtd-lint';
  readonly message: string;
  readonly elementName?: string;
  readonly attributeName?: string;
  readonly sourceId?: string;
  readonly range?: DtdSourceRange;
  readonly relatedRange?: DtdSourceRange;
}

function warning(
  value: Omit<DtdLintDiagnostic, 'severity' | 'source' | 'category'>,
): DtdLintDiagnostic {
  return {
    severity: 'warning',
    source: 'dtd-lint',
    category: 'dtd-lint',
    ...value,
  };
}

function attributeKey(elementName: string, attributeName: string): string {
  return `${elementName}\u0000${attributeName}`;
}

/**
 * Produces deterministic, advisory findings from the parsed declaration set.
 * Production calls this only after the authoritative Xerces boundary accepts
 * the source. These findings explain visualization choices and never decide
 * standards validity.
 */
export function lintDtdDeclarations(
  declarations: readonly DtdDeclarationAst[],
  sourceId?: string,
): readonly DtdLintDiagnostic[] {
  const elementNames = new Set(
    declarations
      .filter((declaration) => declaration.kind === 'elementDeclaration')
      .map((declaration) => declaration.name),
  );
  const attributeLists = declarations.filter(
    (declaration): declaration is DtdAttributeListDeclarationAst =>
      declaration.kind === 'attributeListDeclaration',
  );
  const diagnostics: DtdLintDiagnostic[] = [];
  const firstAttributes = new Map<string, DtdAttributeDefinitionAst>();

  for (const declaration of attributeLists) {
    if (!elementNames.has(declaration.elementName)) {
      diagnostics.push(
        warning({
          code: 'attlist-target-undeclared',
          message: `ATTLIST declares attributes for "${declaration.elementName}", but this DTD has no matching ELEMENT declaration. The attribute list is shown as its own declaration.`,
          elementName: declaration.elementName,
          sourceId,
          range: declaration.rawDeclarationRange,
        }),
      );
    }

    for (const attribute of declaration.attributeDefinitions) {
      const key = attributeKey(declaration.elementName, attribute.name);
      const first = firstAttributes.get(key);
      if (first) {
        diagnostics.push(
          warning({
            code: 'duplicate-attribute-declaration',
            message: `Attribute "${attribute.name}" is declared more than once for "${declaration.elementName}". The first declaration is effective; this later declaration is ignored in the visualization.`,
            elementName: declaration.elementName,
            attributeName: attribute.name,
            sourceId,
            range: attribute.range,
            relatedRange: first.range,
          }),
        );
      } else {
        firstAttributes.set(key, attribute);
      }
    }
  }

  if (elementNames.size === 0 && attributeLists.length > 0) {
    diagnostics.push(
      warning({
        code: 'attlist-without-element-declarations',
        message:
          'This DTD contains ATTLIST declarations but no ELEMENT declarations. Attribute lists remain available for navigation and inspection.',
        sourceId,
        range: attributeLists[0]?.rawDeclarationRange,
      }),
    );
  }

  return diagnostics;
}
