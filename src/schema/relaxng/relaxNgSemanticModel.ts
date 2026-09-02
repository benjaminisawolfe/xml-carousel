import type { SchemaSourceRange } from '../model';

export const relaxNgStructureNamespace = 'http://relaxng.org/ns/structure/1.0';
export const relaxNgCompatibilityAnnotationsNamespace =
  'http://relaxng.org/ns/compatibility/annotations/1.0';

export type RelaxNgSemanticId = string;
export type RelaxNgCombine = 'choice' | 'interleave';
export type RelaxNgSemanticFindingCode =
  | 'semantic-extractor-internal'
  | 'semantic-unresolved-binding'
  | 'semantic-unsupported-valid-construct'
  | 'semantic-source-range-unavailable';

export interface RelaxNgSourceIdentity {
  readonly sourceFileId: string;
  readonly range: SchemaSourceRange;
  readonly sourceOrder: number;
}

export interface RelaxNgContextValue {
  readonly explicit?: string;
  readonly effective: string;
  readonly range?: SchemaSourceRange;
}

export interface RelaxNgSemanticDocument extends RelaxNgSourceIdentity {
  readonly id: RelaxNgSemanticId;
  readonly path: string;
  readonly rootPatternId: RelaxNgSemanticId;
  readonly grammarId?: RelaxNgSemanticId;
  readonly status: 'eligible';
}

export interface RelaxNgGrammarScope extends RelaxNgSourceIdentity {
  readonly id: RelaxNgSemanticId;
  readonly documentId: RelaxNgSemanticId;
  readonly patternId: RelaxNgSemanticId;
  readonly parentGrammarId?: RelaxNgSemanticId;
  readonly owningPatternId?: RelaxNgSemanticId;
  readonly startClauseIds: readonly RelaxNgSemanticId[];
  readonly effectiveStartId?: RelaxNgSemanticId;
  readonly definitionGroupIds: readonly RelaxNgSemanticId[];
  readonly includeIds: readonly RelaxNgSemanticId[];
}

export interface RelaxNgStartClause extends RelaxNgSourceIdentity {
  readonly id: RelaxNgSemanticId;
  readonly grammarId: RelaxNgSemanticId;
  readonly combine?: RelaxNgCombine;
  readonly combineRange?: SchemaSourceRange;
  readonly bodyPatternIds: readonly RelaxNgSemanticId[];
  readonly includeId?: RelaxNgSemanticId;
}

export interface RelaxNgEffectiveStart {
  readonly id: RelaxNgSemanticId;
  readonly grammarId: RelaxNgSemanticId;
  readonly clauseIds: readonly RelaxNgSemanticId[];
  readonly effectiveCombine?: RelaxNgCombine;
  readonly contributionGrammarIds: readonly RelaxNgSemanticId[];
}

export interface RelaxNgDefineClause extends RelaxNgSourceIdentity {
  readonly id: RelaxNgSemanticId;
  readonly grammarId: RelaxNgSemanticId;
  readonly name: string;
  readonly nameRange?: SchemaSourceRange;
  readonly combine?: RelaxNgCombine;
  readonly combineRange?: SchemaSourceRange;
  readonly bodyPatternIds: readonly RelaxNgSemanticId[];
  readonly includeId?: RelaxNgSemanticId;
}

export interface RelaxNgDefinitionGroup {
  readonly id: RelaxNgSemanticId;
  readonly grammarId: RelaxNgSemanticId;
  readonly name: string;
  readonly clauseIds: readonly RelaxNgSemanticId[];
  readonly effectiveCombine?: RelaxNgCombine;
  readonly contributionGroupIds: readonly RelaxNgSemanticId[];
}

export interface RelaxNgAnnotationAttribute {
  readonly qualifiedName: string;
  readonly namespaceUri?: string;
  readonly localName: string;
  readonly value: string;
  readonly range: SchemaSourceRange;
  readonly sourceOrder: number;
}

export interface RelaxNgForeignAnnotation extends RelaxNgSourceIdentity {
  readonly id: RelaxNgSemanticId;
  readonly ownerId: RelaxNgSemanticId;
  readonly namespaceUri?: string;
  readonly localName: string;
  readonly qualifiedName: string;
  readonly attributes: readonly RelaxNgAnnotationAttribute[];
  readonly text: string;
}

export interface RelaxNgDocumentation extends RelaxNgSourceIdentity {
  readonly id: RelaxNgSemanticId;
  readonly ownerId: RelaxNgSemanticId;
  readonly text: string;
  readonly xmlLang?: string;
}

export interface RelaxNgDefaultValue {
  readonly lexicalValue: string;
  readonly range: SchemaSourceRange;
}

export interface RelaxNgNameClassBase extends RelaxNgSourceIdentity {
  readonly id: RelaxNgSemanticId;
  readonly ownerPatternId: RelaxNgSemanticId;
  readonly annotations: readonly RelaxNgSemanticId[];
}

export interface RelaxNgNameNameClass extends RelaxNgNameClassBase {
  readonly kind: 'name';
  readonly lexicalName: string;
  readonly lexicalNameRange?: SchemaSourceRange;
  readonly localName?: string;
  readonly namespaceUri?: string;
  readonly explicitNs?: string;
  readonly effectiveNs: string;
}

export interface RelaxNgAnyNameClass extends RelaxNgNameClassBase {
  readonly kind: 'anyName';
  readonly exceptNameClassId?: RelaxNgSemanticId;
}

export interface RelaxNgNsNameClass extends RelaxNgNameClassBase {
  readonly kind: 'nsName';
  readonly explicitNs?: string;
  readonly effectiveNs: string;
  readonly exceptNameClassId?: RelaxNgSemanticId;
}

export interface RelaxNgChoiceNameClass extends RelaxNgNameClassBase {
  readonly kind: 'choice';
  readonly childNameClassIds: readonly RelaxNgSemanticId[];
}

export type RelaxNgNameClass =
  | RelaxNgNameNameClass
  | RelaxNgAnyNameClass
  | RelaxNgNsNameClass
  | RelaxNgChoiceNameClass;

interface RelaxNgPatternBase extends RelaxNgSourceIdentity {
  readonly id: RelaxNgSemanticId;
  readonly grammarId?: RelaxNgSemanticId;
  readonly annotations: readonly RelaxNgSemanticId[];
  readonly ns: RelaxNgContextValue;
  readonly datatypeLibrary: RelaxNgContextValue;
}

export interface RelaxNgGrammarPattern extends RelaxNgPatternBase {
  readonly kind: 'grammar';
  readonly grammarScopeId: RelaxNgSemanticId;
}

export interface RelaxNgElementPattern extends RelaxNgPatternBase {
  readonly kind: 'element';
  readonly nameClassId: RelaxNgSemanticId;
  readonly contentPatternIds: readonly RelaxNgSemanticId[];
}

export interface RelaxNgAttributePattern extends RelaxNgPatternBase {
  readonly kind: 'attribute';
  readonly nameClassId: RelaxNgSemanticId;
  readonly valuePatternIds: readonly RelaxNgSemanticId[];
  readonly defaultValue?: RelaxNgDefaultValue;
}

export type RelaxNgOperatorKind =
  | 'choice'
  | 'group'
  | 'interleave'
  | 'optional'
  | 'zeroOrMore'
  | 'oneOrMore'
  | 'mixed'
  | 'list';

export interface RelaxNgOperatorPattern extends RelaxNgPatternBase {
  readonly kind: RelaxNgOperatorKind;
  readonly childPatternIds: readonly RelaxNgSemanticId[];
}

export interface RelaxNgTerminalPattern extends RelaxNgPatternBase {
  readonly kind: 'text' | 'empty' | 'notAllowed';
}

export interface RelaxNgParam extends RelaxNgSourceIdentity {
  readonly id: RelaxNgSemanticId;
  readonly ownerPatternId: RelaxNgSemanticId;
  readonly name: string;
  readonly value: string;
  readonly sourceValue: string;
  readonly nameRange?: SchemaSourceRange;
  readonly valueRange?: SchemaSourceRange;
}

export interface RelaxNgDataPattern extends RelaxNgPatternBase {
  readonly kind: 'data';
  readonly type: string;
  readonly typeRange?: SchemaSourceRange;
  readonly paramIds: readonly RelaxNgSemanticId[];
  readonly exceptPatternIds: readonly RelaxNgSemanticId[];
}

export interface RelaxNgValuePattern extends RelaxNgPatternBase {
  readonly kind: 'value';
  readonly lexicalValue: string;
  readonly sourceLexicalValue: string;
  readonly valueRange?: SchemaSourceRange;
  readonly type: string;
  readonly namespaceBindings: Readonly<Record<string, string>>;
}

export interface RelaxNgRefPattern extends RelaxNgPatternBase {
  readonly kind: 'ref';
  readonly name: string;
  readonly nameRange?: SchemaSourceRange;
  readonly resolvedDefinitionGroupId?: RelaxNgSemanticId;
}

export interface RelaxNgParentRefPattern extends RelaxNgPatternBase {
  readonly kind: 'parentRef';
  readonly name: string;
  readonly nameRange?: SchemaSourceRange;
  readonly parentGrammarId?: RelaxNgSemanticId;
  readonly resolvedDefinitionGroupId?: RelaxNgSemanticId;
}

export interface RelaxNgExternalRefPattern extends RelaxNgPatternBase {
  readonly kind: 'externalRef';
  readonly rawHref: string;
  readonly hrefRange?: SchemaSourceRange;
  readonly packageRelationshipId?: string;
  readonly resolution?: 'resolved' | 'missing' | 'ambiguous' | 'blocked';
  readonly resolvedDocumentId?: RelaxNgSemanticId;
  readonly resolvedRootPatternId?: RelaxNgSemanticId;
}

export type RelaxNgPattern =
  | RelaxNgGrammarPattern
  | RelaxNgElementPattern
  | RelaxNgAttributePattern
  | RelaxNgOperatorPattern
  | RelaxNgTerminalPattern
  | RelaxNgDataPattern
  | RelaxNgValuePattern
  | RelaxNgRefPattern
  | RelaxNgParentRefPattern
  | RelaxNgExternalRefPattern;

export interface RelaxNgIncludeComponent extends RelaxNgSourceIdentity {
  readonly id: RelaxNgSemanticId;
  readonly grammarId: RelaxNgSemanticId;
  readonly rawHref: string;
  readonly hrefRange?: SchemaSourceRange;
  readonly packageRelationshipId?: string;
  readonly resolution?: 'resolved' | 'missing' | 'ambiguous' | 'blocked';
  readonly resolvedDocumentId?: RelaxNgSemanticId;
  readonly resolvedGrammarId?: RelaxNgSemanticId;
  readonly overrideStartClauseIds: readonly RelaxNgSemanticId[];
  readonly overrideDefineClauseIds: readonly RelaxNgSemanticId[];
  readonly annotationIds: readonly RelaxNgSemanticId[];
}

export interface RelaxNgSemanticBinding {
  readonly id: RelaxNgSemanticId;
  readonly kind: 'ref' | 'parentRef' | 'include' | 'externalRef';
  readonly sourceId: RelaxNgSemanticId;
  readonly targetId: RelaxNgSemanticId;
}

export interface RelaxNgSemanticFinding {
  readonly id: RelaxNgSemanticId;
  readonly code: RelaxNgSemanticFindingCode;
  readonly message: string;
  readonly sourceFileId?: string;
  readonly constructId?: RelaxNgSemanticId;
  readonly range?: SchemaSourceRange;
}

export interface RelaxNgSemanticModel {
  readonly version: 1;
  readonly documents: readonly RelaxNgSemanticDocument[];
  readonly grammars: readonly RelaxNgGrammarScope[];
  readonly startClauses: readonly RelaxNgStartClause[];
  readonly effectiveStarts: readonly RelaxNgEffectiveStart[];
  readonly defineClauses: readonly RelaxNgDefineClause[];
  readonly definitionGroups: readonly RelaxNgDefinitionGroup[];
  readonly patterns: readonly RelaxNgPattern[];
  readonly nameClasses: readonly RelaxNgNameClass[];
  readonly params: readonly RelaxNgParam[];
  readonly includes: readonly RelaxNgIncludeComponent[];
  readonly annotations: readonly RelaxNgForeignAnnotation[];
  readonly documentation: readonly RelaxNgDocumentation[];
  readonly bindings: readonly RelaxNgSemanticBinding[];
  readonly findings: readonly RelaxNgSemanticFinding[];
}

export interface RelaxNgSemanticSource {
  readonly sourceFileId: string;
  readonly path: string;
  readonly sourceText: string;
}

export interface RelaxNgSemanticPackageRelationship {
  readonly id: string;
  readonly kind: 'rng-include' | 'rng-external-ref';
  readonly rawTarget: string;
  readonly sourcePath: string;
  readonly targetPath?: string;
  readonly status: 'resolved' | 'missing' | 'ambiguous' | 'blocked';
}

export interface RelaxNgSemanticBuildInput {
  readonly sources: readonly RelaxNgSemanticSource[];
  readonly relationships?: readonly RelaxNgSemanticPackageRelationship[];
}

export interface RelaxNgSemanticBuildResult {
  readonly model?: RelaxNgSemanticModel;
  readonly findings: readonly RelaxNgSemanticFinding[];
}
