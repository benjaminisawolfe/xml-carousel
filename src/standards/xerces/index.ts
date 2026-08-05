export {
  createVisualizationFailureDiagnostic,
  filterProbeOnlyXercesDiagnostics,
  getProductionXercesAdapter,
  retainXercesDiagnostics,
  validateWithProductionXerces,
} from './productionValidator';
export {
  XERCES_MAX_AGGREGATE_BYTES,
  XERCES_MAX_DEPENDENCY_DEPTH,
  XERCES_MAX_PATH_CODE_POINTS,
  XERCES_MAX_PATH_SEGMENTS,
  XERCES_MAX_PROJECT_FILES,
  XERCES_MAX_RETAINED_DIAGNOSTICS,
  XERCES_WORKER_LIFETIME_MS,
} from './limits';
export {
  normalizeXercesProjectPath,
  resolveXercesProjectReference,
  validateXercesProjectFiles,
} from './pathPolicy';
export type {
  StandardsBoundaryDiagnostic,
  StandardsDiagnosticCategory,
  XercesAdapter,
  XercesProjectFile,
  XercesValidationFormat,
  XercesValidationRequest,
  XercesValidationResult,
  XercesValidationStatus,
} from './types';
export type { XercesModuleFactory } from './adapter';
