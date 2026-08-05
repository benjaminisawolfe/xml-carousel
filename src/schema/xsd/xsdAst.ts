import type { SchemaSourceRange } from '../model/SchemaSourceMarkup';
import type {
  XsdXmlAttributeAst,
  XsdXmlDocumentAst,
  XsdXmlElementAst,
} from './xsdXmlAst';
import type { XsdDiagnostic } from './xsdDiagnostics';

export type XsdFormDefault = 'qualified' | 'unqualified';
export type XsdAttributeUse = 'optional' | 'prohibited' | 'required';
export type XsdMaxOccurs = number | 'unbounded';
export type XsdCompositorKind = 'sequence' | 'choice' | 'all';
export type XsdComplexTypeDerivationKind = 'extension' | 'restriction';

export interface XsdSchemaValueAst<T> {
  readonly value: T;
  readonly lexicalValue: string;
  readonly range?: SchemaSourceRange;
}

export interface XsdQNameAst {
  readonly raw: string;
  readonly prefix?: string;
  readonly localName: string;
  readonly namespaceUri?: string;
  readonly range: SchemaSourceRange;
}

export interface XsdOccurrenceAst {
  readonly minOccurs: number;
  readonly maxOccurs: XsdMaxOccurs;
  readonly minOccursAttribute?: XsdXmlAttributeAst;
  readonly maxOccursAttribute?: XsdXmlAttributeAst;
}

export interface XsdDeferredComponentAst {
  readonly kind: 'deferred';
  readonly qualifiedName: string;
  readonly localName: string;
  readonly namespaceUri?: string;
  readonly reason: 'annotation' | 'unsupported-xsd' | 'foreign';
  readonly range: SchemaSourceRange;
  readonly sourceOrder: number;
  readonly xml: XsdXmlElementAst;
}

interface XsdComponentBase {
  readonly annotations: readonly XsdAnnotationAst[];
  readonly range: SchemaSourceRange;
  readonly startTagRange: SchemaSourceRange;
  readonly sourceOrder: number;
  readonly xml: XsdXmlElementAst;
  readonly deferredComponents: readonly XsdDeferredComponentAst[];
}

export interface XsdAnnotationAst {
  readonly kind: 'annotation';
  readonly entries: readonly XsdAnnotationEntryAst[];
  readonly deferredComponents: readonly XsdDeferredComponentAst[];
  readonly range: SchemaSourceRange;
  readonly startTagRange: SchemaSourceRange;
  readonly sourceOrder: number;
  readonly rawXml: string;
  readonly xml: XsdXmlElementAst;
}

export type XsdAnnotationEntryAst = XsdDocumentationAst | XsdAppInfoAst;

export interface XsdDocumentationAst {
  readonly kind: 'documentation';
  readonly text: string;
  readonly rawXml: string;
  readonly xmlLang?: XsdSchemaValueAst<string>;
  readonly source?: XsdSchemaValueAst<string>;
  readonly range: SchemaSourceRange;
  readonly startTagRange: SchemaSourceRange;
  readonly contentRange: SchemaSourceRange;
  readonly sourceOrder: number;
  readonly xml: XsdXmlElementAst;
}

export interface XsdAppInfoAst {
  readonly kind: 'appInfo';
  readonly text: string;
  readonly rawXml: string;
  readonly source?: XsdSchemaValueAst<string>;
  readonly range: SchemaSourceRange;
  readonly startTagRange: SchemaSourceRange;
  readonly contentRange: SchemaSourceRange;
  readonly sourceOrder: number;
  readonly xml: XsdXmlElementAst;
}

export interface XsdAttributeValueConstraintAst {
  readonly kind: 'default' | 'fixed';
  readonly value: string;
  readonly lexicalValue: string;
  readonly range: SchemaSourceRange;
}

export interface XsdGlobalAttributeAst extends XsdComponentBase {
  readonly kind: 'globalAttribute';
  readonly name?: string;
  readonly nameRange?: SchemaSourceRange;
  readonly type?: XsdQNameAst;
  readonly anonymousSimpleType?: XsdSimpleTypeAst;
  readonly valueConstraint?: XsdAttributeValueConstraintAst;
}

export interface XsdLocalAttributeAst extends XsdComponentBase {
  readonly kind: 'localAttribute';
  readonly name?: string;
  readonly nameRange?: SchemaSourceRange;
  readonly ref?: XsdQNameAst;
  readonly type?: XsdQNameAst;
  readonly anonymousSimpleType?: XsdSimpleTypeAst;
  readonly use: XsdAttributeUse;
  readonly form?: XsdSchemaValueAst<XsdFormDefault>;
  readonly valueConstraint?: XsdAttributeValueConstraintAst;
}

export interface XsdGlobalElementAst extends XsdComponentBase {
  readonly kind: 'globalElement';
  readonly name?: string;
  readonly nameRange?: SchemaSourceRange;
  readonly type?: XsdQNameAst;
  readonly anonymousComplexType?: XsdComplexTypeAst;
  readonly anonymousSimpleType?: XsdSimpleTypeAst;
}

export interface XsdLocalElementAst extends XsdComponentBase {
  readonly kind: 'localElement';
  readonly name?: string;
  readonly nameRange?: SchemaSourceRange;
  readonly ref?: XsdQNameAst;
  readonly type?: XsdQNameAst;
  readonly occurrence: XsdOccurrenceAst;
  readonly anonymousComplexType?: XsdComplexTypeAst;
  readonly anonymousSimpleType?: XsdSimpleTypeAst;
}

export interface XsdComplexTypeAst extends XsdComponentBase {
  readonly kind: 'complexType';
  readonly name?: string;
  readonly nameRange?: SchemaSourceRange;
  readonly compositor?: XsdCompositorAst;
  readonly attributes: readonly XsdLocalAttributeAst[];
  readonly complexContent?: XsdComplexContentAst;
}

export interface XsdComplexTypeDerivationAst extends XsdComponentBase {
  readonly kind: XsdComplexTypeDerivationKind;
  readonly base?: XsdQNameAst;
  readonly compositor?: XsdCompositorAst;
  readonly attributes: readonly XsdLocalAttributeAst[];
}

export interface XsdComplexContentAst extends XsdComponentBase {
  readonly kind: 'complexContent';
  readonly derivation?: XsdComplexTypeDerivationAst;
}

export interface XsdEnumerationFacetAst extends XsdComponentBase {
  readonly kind: 'enumeration';
  readonly value?: string;
  readonly lexicalValue?: string;
  readonly valueRange?: SchemaSourceRange;
}

export interface XsdSimpleTypeRestrictionAst extends XsdComponentBase {
  readonly kind: 'restriction';
  readonly base?: XsdQNameAst;
  readonly enumerations: readonly XsdEnumerationFacetAst[];
}

export interface XsdSimpleTypeAst extends XsdComponentBase {
  readonly kind: 'simpleType';
  readonly name?: string;
  readonly nameRange?: SchemaSourceRange;
  readonly restriction?: XsdSimpleTypeRestrictionAst;
}

export interface XsdCompositorAst extends XsdComponentBase {
  readonly kind: 'compositor';
  readonly compositor: XsdCompositorKind;
  readonly occurrence: XsdOccurrenceAst;
  readonly members: readonly XsdCompositorMemberAst[];
}

export type XsdCompositorMemberAst = XsdLocalElementAst | XsdCompositorAst;

export type XsdGlobalDeclarationAst =
  | XsdGlobalElementAst
  | XsdGlobalAttributeAst
  | XsdComplexTypeAst
  | XsdSimpleTypeAst;

export type XsdSchemaRelationshipKind = 'include' | 'import' | 'redefine';

export interface XsdSchemaRelationshipAst {
  readonly kind: XsdSchemaRelationshipKind;
  readonly schemaLocation?: XsdSchemaValueAst<string>;
  readonly namespace?: XsdSchemaValueAst<string>;
  readonly range: SchemaSourceRange;
  readonly startTagRange: SchemaSourceRange;
  readonly sourceOrder: number;
  readonly xml: XsdXmlElementAst;
}

export interface XsdSchemaAst {
  readonly kind: 'schema';
  /** Complete accepted XML document, including declaration and prolog nodes. */
  readonly document: XsdXmlDocumentAst;
  readonly annotations: readonly XsdAnnotationAst[];
  readonly targetNamespace?: XsdSchemaValueAst<string>;
  readonly elementFormDefault: XsdSchemaValueAst<XsdFormDefault>;
  readonly attributeFormDefault: XsdSchemaValueAst<XsdFormDefault>;
  readonly version?: XsdSchemaValueAst<string>;
  readonly declarations: readonly XsdGlobalDeclarationAst[];
  readonly relationships: readonly XsdSchemaRelationshipAst[];
  readonly deferredComponents: readonly XsdDeferredComponentAst[];
  readonly range: SchemaSourceRange;
  readonly startTagRange: SchemaSourceRange;
  readonly sourceOrder: number;
  readonly xml: XsdXmlElementAst;
}

export interface XsdParseResult {
  readonly status: 'success' | 'failure';
  readonly schema?: XsdSchemaAst;
  readonly document: XsdXmlDocumentAst;
  readonly diagnostics: readonly XsdDiagnostic[];
}
