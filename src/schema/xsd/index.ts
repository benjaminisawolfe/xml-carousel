export type {
  XsdAnnotationAst,
  XsdAnnotationEntryAst,
  XsdAppInfoAst,
  XsdAttributeUse,
  XsdAttributeValueConstraintAst,
  XsdComplexTypeAst,
  XsdComplexContentAst,
  XsdComplexTypeDerivationAst,
  XsdComplexTypeDerivationKind,
  XsdCompositorAst,
  XsdCompositorKind,
  XsdCompositorMemberAst,
  XsdDeferredComponentAst,
  XsdDocumentationAst,
  XsdEnumerationFacetAst,
  XsdFormDefault,
  XsdGlobalDeclarationAst,
  XsdGlobalAttributeAst,
  XsdGlobalElementAst,
  XsdLocalElementAst,
  XsdLocalAttributeAst,
  XsdMaxOccurs,
  XsdOccurrenceAst,
  XsdParseResult,
  XsdQNameAst,
  XsdSchemaAst,
  XsdSchemaValueAst,
  XsdSimpleTypeRestrictionAst,
  XsdSimpleTypeAst,
} from './xsdAst';
export { extractXsdMixedContentText } from './xsdAnnotationText';
export {
  selectOrderedXsdAnnotationEntries,
  type OrderedXsdAnnotationEntry,
} from './xsdAnnotationQueries';
export {
  createXsdDiagnostic,
  sortXsdDiagnostics,
  xsdDiagnosticCodes,
  type XsdDiagnostic,
  type XsdDiagnosticCode,
  type XsdDiagnosticSeverity,
  type XsdDiagnosticStage,
} from './xsdDiagnostics';
export { parseXsd } from './xsdParser';
export {
  xsdBuildDiagnosticCodes,
  type XsdBuildDiagnostic,
  type XsdBuildDiagnosticCode,
} from './xsdBuildDiagnostics';
export {
  buildXsdSchemaProject,
  type XsdProjectBuildOptions,
  type XsdProjectBuildResult,
  type XsdUnresolvedReferencePolicy,
} from './xsdProjectBuilder';
export {
  createXsdImporter,
  importXsdSource,
  type XsdImportDiagnostic,
  type XsdImportOptions,
  type XsdImportPipelineDependencies,
  type XsdImportResult,
  type XsdImportStageDiagnostic,
} from './xsdImport';
export type {
  XsdAnnotationEntryMetadata,
  XsdAnnotationContentMetadata,
  XsdAnnotationMetadata,
  XsdAppInfoMetadata,
  XsdComplexTypeDerivationMetadata,
  XsdDocumentationMetadata,
  XsdForeignAttributeMetadata,
  XsdMixedContentMetadata,
  XsdEnumerationValueMetadata,
  XsdFacetKind,
  XsdLocalFormMetadata,
  XsdMetadataByNodeId,
  XsdNodeMetadata,
  XsdNodeScope,
  XsdNormalizedReference,
  XsdSchemaRelationshipMetadata,
  XsdSchemaRelationshipResolutionStatus,
  XsdReferenceResolution,
  XsdSchemaValueMetadata,
  XsdTypeDerivationMethod,
} from './xsdProjectMetadata';
export {
  getXsdBuiltInTypeAncestry,
  xsdBuiltInTypeDefinitions,
  type XsdBuiltInTypeDefinition,
} from './xsdBuiltInTypes';
export { buildXsdSourceMarkupByNodeId } from './xsdSourceMarkup';
export { selectLikelyDocumentElementIds } from './xsdQueries';
export {
  isValidXmlName,
  isXmlNameCharacter,
  isXmlNameStartCharacter,
  lexXsdXml,
  parseXmlQualifiedName,
  type ParsedXmlQualifiedName,
  type XsdXmlLexResult,
  type XsdXmlToken,
  type XsdXmlTokenKind,
} from './xsdXmlLexer';
export { parseXsdXml, type XsdXmlParseResult } from './xsdXmlParser';
export {
  createXsdSourceMap,
  xmlNamespaceUri,
  xmlSchemaNamespaceUri,
  xmlnsNamespaceUri,
  type XsdSourceMap,
  type XsdXmlAttributeAst,
  type XsdXmlCdataAst,
  type XsdXmlCommentAst,
  type XsdXmlDeclarationAst,
  type XsdXmlDocumentAst,
  type XsdXmlElementAst,
  type XsdXmlNodeAst,
  type XsdXmlProcessingInstructionAst,
  type XsdXmlQuoteKind,
  type XsdXmlTextAst,
} from './xsdXmlAst';
export type {
  SchemaSourceImportExecution,
  SchemaSourceImportPhase,
} from '../schemaSourceImportExecution';
