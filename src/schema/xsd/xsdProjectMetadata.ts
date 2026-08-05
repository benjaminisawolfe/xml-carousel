import type {
  SchemaNodeId,
  SchemaNodeKind,
  SchemaOccurrence,
  SchemaSourceRange,
} from '../model';
import type {
  XsdAttributeUse,
  XsdCompositorKind,
  XsdComplexTypeDerivationKind,
  XsdFormDefault,
} from './xsdAst';

export type XsdNodeScope =
  'schema' | 'global' | 'local' | 'anonymous' | 'standard';

export type XsdFacetKind =
  | 'length'
  | 'minLength'
  | 'maxLength'
  | 'pattern'
  | 'enumeration'
  | 'whiteSpace'
  | 'maxInclusive'
  | 'maxExclusive'
  | 'minInclusive'
  | 'minExclusive'
  | 'totalDigits'
  | 'fractionDigits';

export type XsdTypeDerivationMethod =
  | 'simpleRestriction'
  | 'simpleList'
  | 'simpleUnion'
  | 'complexExtension'
  | 'complexRestriction'
  | 'simpleContentExtension'
  | 'simpleContentRestriction'
  | 'builtInRestriction'
  | 'builtInList';

export type XsdReferenceResolution =
  'resolved' | 'xsdBuiltIn' | 'externalDeferred';

export interface XsdSchemaValueMetadata<T> {
  readonly value: T;
  readonly lexicalValue: string;
  readonly range?: SchemaSourceRange;
}

export interface XsdDocumentationMetadata {
  readonly kind: 'documentation';
  readonly text: string;
  readonly rawXml: string;
  readonly xmlLang?: XsdSchemaValueMetadata<string>;
  readonly source?: XsdSchemaValueMetadata<string>;
  readonly sourceRange: SchemaSourceRange;
  readonly startTagRange: SchemaSourceRange;
  readonly contentRange: SchemaSourceRange;
  readonly sourceOrder: number;
}

export interface XsdAppInfoMetadata {
  readonly kind: 'appInfo';
  readonly text: string;
  readonly rawXml: string;
  readonly source?: XsdSchemaValueMetadata<string>;
  readonly sourceRange: SchemaSourceRange;
  readonly startTagRange: SchemaSourceRange;
  readonly contentRange: SchemaSourceRange;
  readonly sourceOrder: number;
}

export type XsdAnnotationEntryMetadata =
  XsdDocumentationMetadata | XsdAppInfoMetadata;

export interface XsdAnnotationMetadata {
  readonly entries: readonly XsdAnnotationEntryMetadata[];
  readonly rawXml: string;
  readonly sourceRange: SchemaSourceRange;
  readonly startTagRange: SchemaSourceRange;
  readonly sourceOrder: number;
}

export interface XsdForeignAttributeMetadata {
  readonly qualifiedName: string;
  readonly prefix?: string;
  readonly localName: string;
  readonly namespaceUri?: string;
  readonly value: string;
  readonly lexicalValue: string;
  readonly sourceRange: SchemaSourceRange;
  readonly nameRange: SchemaSourceRange;
  readonly valueRange: SchemaSourceRange;
  readonly sourceOrder: number;
}

export type XsdMixedContentMetadata =
  | {
      readonly kind: 'text' | 'cdata';
      readonly value: string;
      readonly raw: string;
      readonly sourceRange: SchemaSourceRange;
      readonly sourceOrder: number;
    }
  | {
      readonly kind: 'foreignElement' | 'comment' | 'processingInstruction';
      readonly nodeId: SchemaNodeId;
      readonly sourceRange: SchemaSourceRange;
      readonly sourceOrder: number;
    };

export type XsdAnnotationContentMetadata =
  | {
      readonly kind: 'annotation';
      readonly ownerNodeId: SchemaNodeId;
      readonly rawXml: string;
      readonly entryCount: number;
      readonly attributes: readonly XsdForeignAttributeMetadata[];
      readonly namespaceBindings: Readonly<Record<string, string>>;
    }
  | {
      readonly kind: 'documentation';
      readonly ownerNodeId: SchemaNodeId;
      readonly text: string;
      readonly rawXml: string;
      readonly xmlLang?: XsdSchemaValueMetadata<string>;
      readonly source?: XsdSchemaValueMetadata<string>;
      readonly contentRange: SchemaSourceRange;
      readonly attributes: readonly XsdForeignAttributeMetadata[];
      readonly mixedContent: readonly XsdMixedContentMetadata[];
    }
  | {
      readonly kind: 'appInfo';
      readonly ownerNodeId: SchemaNodeId;
      readonly text: string;
      readonly rawXml: string;
      readonly source?: XsdSchemaValueMetadata<string>;
      readonly contentRange: SchemaSourceRange;
      readonly attributes: readonly XsdForeignAttributeMetadata[];
      readonly mixedContent: readonly XsdMixedContentMetadata[];
    }
  | {
      readonly kind: 'foreignElement';
      readonly ownerNodeId: SchemaNodeId;
      readonly qualifiedName: string;
      readonly prefix?: string;
      readonly localName: string;
      readonly namespaceUri?: string;
      readonly namespaceBindings: Readonly<Record<string, string>>;
      readonly rawXml: string;
      readonly attributes: readonly XsdForeignAttributeMetadata[];
      readonly mixedContent: readonly XsdMixedContentMetadata[];
    }
  | {
      readonly kind: 'comment';
      readonly ownerNodeId: SchemaNodeId;
      readonly text: string;
      readonly raw: string;
      readonly contentRange: SchemaSourceRange;
    }
  | {
      readonly kind: 'processingInstruction';
      readonly ownerNodeId: SchemaNodeId;
      readonly target: string;
      readonly data: string;
      readonly raw: string;
    }
  | {
      readonly kind: 'prolog';
      readonly ownerNodeId: SchemaNodeId;
      readonly target: string;
      readonly data: string;
      readonly raw: string;
      readonly version?: string;
      readonly encoding?: string;
      readonly standalone?: string;
    };

export interface XsdNormalizedReference {
  readonly kind:
    | 'type'
    | 'element'
    | 'attribute'
    | 'group'
    | 'attributeGroup'
    | 'substitutionGroup'
    | 'restrictionBase'
    | 'complexTypeBase'
    | 'listItemType'
    | 'unionMemberType'
    | 'keyrefTarget'
    | 'notation';
  readonly raw: string;
  readonly prefix?: string;
  readonly localName: string;
  readonly namespaceUri?: string;
  readonly range: SchemaSourceRange;
  readonly resolution: XsdReferenceResolution;
  readonly targetNodeId?: SchemaNodeId;
}

export type XsdSchemaRelationshipResolutionStatus =
  'pending' | 'resolved' | 'missing' | 'blocked' | 'ambiguous';

export interface XsdSchemaRelationshipMetadata {
  readonly kind: 'include' | 'import' | 'redefine';
  readonly lexicalSchemaLocation?: string;
  readonly normalizedProjectPath?: string;
  readonly importedNamespace?: string;
  readonly sourcePath: string;
  readonly targetPath?: string;
  readonly targetSchemaNodeId?: SchemaNodeId;
  readonly resolutionStatus: XsdSchemaRelationshipResolutionStatus;
  readonly resolutionDetail: string;
  readonly effectiveNamespace?: string;
  readonly contextId?: string;
  readonly sharedTarget?: boolean;
  readonly cycleMember?: boolean;
}

export interface XsdComplexTypeDerivationMetadata {
  readonly kind: XsdComplexTypeDerivationKind;
  readonly baseReference?: XsdNormalizedReference;
  readonly declaredCompositor?: XsdCompositorKind;
  readonly declaredAttributeCount: number;
  readonly sourceRange: SchemaSourceRange;
  readonly startTagRange: SchemaSourceRange;
}

export interface XsdEnumerationValueMetadata {
  readonly value: string;
  readonly lexicalValue: string;
  readonly valueRange: SchemaSourceRange;
  readonly sourceRange: SchemaSourceRange;
  readonly sourceOrder: number;
}

export type XsdLocalFormMetadata =
  | {
      readonly resolution: 'inherited';
      readonly value: XsdFormDefault;
    }
  | {
      readonly resolution: 'explicit';
      readonly value: XsdFormDefault;
    }
  | {
      readonly resolution: 'explicitDeferred';
      readonly lexicalValue: string;
    };

export interface XsdNodeMetadata {
  readonly kind: SchemaNodeKind;
  readonly scope: XsdNodeScope;
  readonly sourceFileId: string;
  readonly sourceOrder: number;
  readonly sourceRange: SchemaSourceRange;
  readonly startTagRange: SchemaSourceRange;
  readonly annotations?: readonly XsdAnnotationMetadata[];
  readonly annotationContent?: XsdAnnotationContentMetadata;
  readonly foreignAttributes?: readonly XsdForeignAttributeMetadata[];
  readonly namespaceBindings?: Readonly<Record<string, string>>;
  readonly targetNamespace?: string;
  readonly ownerNodeId?: SchemaNodeId;
  readonly anonymous?: boolean;
  readonly declarationRole?: 'declaration' | 'reference';
  readonly simpleTypeVariety?: 'restriction' | 'list' | 'union';
  readonly applicationOwned?: boolean;
  readonly builtInType?: {
    readonly localName: string;
    readonly directBaseLocalName?: string;
    readonly ancestry: readonly string[];
    readonly derivationMethod?: 'restriction' | 'list';
  };
  readonly typeDerivation?: {
    readonly method: XsdTypeDerivationMethod;
    readonly baseReference?: XsdNormalizedReference;
    readonly ownerTypeNodeId?: SchemaNodeId;
  };
  readonly listItemTypeReference?: XsdNormalizedReference;
  readonly unionMemberTypeReferences?: readonly XsdNormalizedReference[];
  readonly facet?: {
    readonly kind: XsdFacetKind;
    readonly value: string;
    readonly lexicalValue: string;
    readonly valueRange: SchemaSourceRange;
    readonly fixed: boolean;
    readonly fixedLexicalValue?: string;
  };
  readonly identityConstraint?: {
    readonly kind: 'unique' | 'key' | 'keyref';
    readonly name: string;
    readonly referReference?: XsdNormalizedReference;
  };
  readonly xpathConstraint?: {
    readonly kind: 'selector' | 'field';
    readonly value: string;
    readonly lexicalValue: string;
    readonly valueRange: SchemaSourceRange;
    readonly fieldOrder?: number;
  };
  readonly notation?: {
    readonly publicIdentifier?: string;
    readonly systemIdentifier?: string;
  };
  readonly notationReference?: XsdNormalizedReference;
  readonly effectiveBlock?: {
    readonly tokens: readonly string[];
    readonly source: 'declaration' | 'schemaDefault' | 'implicit';
    readonly applicability: 'element';
  };
  readonly effectiveFinal?: {
    readonly tokens: readonly string[];
    readonly source: 'declaration' | 'schemaDefault' | 'implicit';
    readonly applicability: 'simpleType' | 'complexType' | 'element';
  };
  readonly contentKind?:
    'empty' | 'simple' | 'elementOnly' | 'mixed' | 'inherited';
  readonly mixed?: boolean;
  readonly abstract?: boolean;
  readonly nillable?: boolean;
  readonly block?: readonly string[];
  readonly final?: readonly string[];
  readonly namespaceDeclarations?: readonly {
    readonly prefix: string;
    readonly namespaceUri: string;
  }[];
  readonly processContents?: 'strict' | 'lax' | 'skip';
  readonly wildcardNamespace?: readonly string[];
  readonly compositor?: XsdCompositorKind;
  readonly occurrence?: SchemaOccurrence;
  readonly typeReference?: XsdNormalizedReference;
  readonly elementReference?: XsdNormalizedReference;
  readonly attributeUse?: XsdAttributeUse;
  readonly attributeReference?: XsdNormalizedReference;
  readonly groupReference?: XsdNormalizedReference;
  readonly attributeGroupReference?: XsdNormalizedReference;
  readonly substitutionGroupReference?: XsdNormalizedReference;
  readonly attributeForm?: XsdLocalFormMetadata;
  readonly valueConstraint?: {
    readonly kind: 'default' | 'fixed';
    readonly value: string;
    readonly lexicalValue: string;
    readonly range: SchemaSourceRange;
  };
  readonly implicitAttributeType?: 'xs:anySimpleType';
  readonly restrictionBaseReference?: XsdNormalizedReference;
  readonly complexTypeDerivation?: XsdComplexTypeDerivationMetadata;
  readonly enumerationValues?: readonly XsdEnumerationValueMetadata[];
  readonly enumerationCount?: number;
  readonly localForm?: XsdLocalFormMetadata;
  readonly elementFormDefault?: XsdFormDefault;
  readonly attributeFormDefault?: XsdFormDefault;
  readonly version?: string;
  readonly schemaRelationship?: XsdSchemaRelationshipMetadata;
}

export type XsdMetadataByNodeId = Readonly<
  Record<SchemaNodeId, XsdNodeMetadata>
>;
