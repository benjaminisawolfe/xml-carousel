import { parseXsdXml, type XsdXmlElementAst } from '../xsd';
import { relaxNgStructureNamespace } from './relaxNgSemanticModel';

export interface RelaxNgSourceReference {
  readonly kind: 'rng-include' | 'rng-external-ref';
  readonly rawTarget: string;
  readonly sourceFileId: string;
  readonly sourceOrder: number;
  readonly range: import('../model').SchemaSourceRange;
}

export function parseRelaxNgXmlSource(
  sourceText: string,
  sourceFileId: string,
) {
  return parseXsdXml(sourceText, sourceFileId);
}

export function extractRelaxNgSourceReferences(
  sourceText: string,
  sourceFileId: string,
): readonly RelaxNgSourceReference[] {
  const parsed = parseRelaxNgXmlSource(sourceText, sourceFileId);
  const references: RelaxNgSourceReference[] = [];
  const visit = (element: XsdXmlElementAst): void => {
    if (
      element.namespaceUri === relaxNgStructureNamespace &&
      (element.localName === 'include' || element.localName === 'externalRef')
    ) {
      const href = element.attributes.find(
        (attribute) =>
          attribute.localName === 'href' &&
          attribute.namespaceUri === undefined,
      );
      if (href) {
        references.push({
          kind:
            element.localName === 'include'
              ? 'rng-include'
              : 'rng-external-ref',
          rawTarget: href.value,
          sourceFileId,
          sourceOrder: element.sourceOrder,
          range: href.valueContentRange,
        });
      }
    }
    for (const child of element.children) {
      if (child.kind === 'element') visit(child);
    }
  };
  if (parsed.document.root) visit(parsed.document.root);
  return references.sort(
    (left, right) =>
      left.sourceOrder - right.sourceOrder ||
      left.kind.localeCompare(right.kind) ||
      left.rawTarget.localeCompare(right.rawTarget),
  );
}
