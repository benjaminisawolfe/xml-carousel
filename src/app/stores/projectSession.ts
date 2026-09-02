import type { DtdImportResult } from '../../schema/dtd';
import type { XsdImportResult } from '../../schema/xsd';
import type { StandaloneRelaxNgImportResult } from '../../schema/relaxng';
import type { SchemaPackageImportResult } from '../import/schemaPackage';
import {
  getSchemaNode,
  primeSchemaProjectQueryIndex,
  type SchemaNodeId,
  type SchemaProject,
  type SchemaValidationFinding,
} from '../../schema/model';
import type { ProjectSearchIndex } from '../search';
import { inspectorStore, type InspectorStore } from './inspectorStore';
import { navigationStore, type NavigationStore } from './navigationStore';
import {
  activeProjectStore,
  sourceFilenameForProject,
  validateActiveProjectCandidate,
  type ActiveProjectMetadata,
  type ActiveProjectOrigin,
  type ActiveProjectOwnership,
  type ActiveProjectState,
  type ActiveProjectStore,
} from './projectStore';
import {
  projectSessionResetStore,
  type ProjectSessionResetStore,
} from './projectSessionResetStore';
import { sourceViewStore, type SourceViewStore } from './sourceViewStore';

export interface ProjectSessionReplacement {
  readonly project: SchemaProject;
  readonly initialFocusNodeId: SchemaNodeId;
  readonly metadata: ActiveProjectMetadata;
  readonly ownership?: ActiveProjectOwnership;
}

export interface ProjectImportActivationOptions {
  readonly ownership?: ActiveProjectOwnership;
  readonly preparedSearchIndex?: ProjectSearchIndex;
  readonly origin?: Extract<ActiveProjectOrigin, 'imported' | 'sample'>;
}

export type ProjectImportFailure =
  | Extract<DtdImportResult, { status: 'failure' }>
  | Extract<XsdImportResult, { status: 'failure' }>
  | Extract<SchemaPackageImportResult, { status: 'failure' }>;

export type ProjectSessionReplacementResult =
  | {
      readonly applied: true;
      readonly state: ActiveProjectState;
    }
  | {
      readonly applied: false;
      readonly reason:
        'importFailure' | 'invalidProject' | 'invalidInitialFocus';
      readonly findings?: readonly SchemaValidationFinding[];
      readonly importResult?: ProjectImportFailure;
    };

export interface ProjectSessionDependencies {
  readonly activeProject: ActiveProjectStore;
  readonly navigation: Pick<NavigationStore, 'resetForProject'>;
  readonly inspector: Pick<InspectorStore, 'resetForProject'>;
  readonly sourceView?: Pick<SourceViewStore, 'resetForProject'>;
  readonly presentation: ProjectSessionResetStore;
  readonly validateProject?: typeof validateActiveProjectCandidate;
}

export interface ProjectSession {
  replace(
    replacement: ProjectSessionReplacement,
  ): ProjectSessionReplacementResult;
  activateImportedProject(
    importResult: DtdImportResult,
    options?: ProjectImportActivationOptions,
  ): ProjectSessionReplacementResult;
  activateImportedXsdProject(
    importResult: XsdImportResult,
    options?: ProjectImportActivationOptions,
  ): ProjectSessionReplacementResult;
  activateImportedRelaxNgProject(
    importResult: StandaloneRelaxNgImportResult,
    options?: ProjectImportActivationOptions,
  ): ProjectSessionReplacementResult;
  activateImportedSchemaPackage(
    importResult: SchemaPackageImportResult,
    options?: ProjectImportActivationOptions,
  ): ProjectSessionReplacementResult;
}

export function createProjectSession(
  dependencies: ProjectSessionDependencies,
): ProjectSession {
  function replace(
    replacement: ProjectSessionReplacement,
  ): ProjectSessionReplacementResult {
    const findings = (
      dependencies.validateProject ?? validateActiveProjectCandidate
    )(replacement.project);
    if (findings.length > 0) {
      return { applied: false, reason: 'invalidProject', findings };
    }
    if (!getSchemaNode(replacement.project, replacement.initialFocusNodeId)) {
      return { applied: false, reason: 'invalidInitialFocus' };
    }
    primeSchemaProjectQueryIndex(replacement.project);

    /*
     * Reset ID-only state before publishing the new project. During these
     * synchronous writes selectors can see new IDs with the old project, which
     * they already tolerate as unresolved. They never see old IDs with the new
     * project. The final reset signal runs only after all durable state agrees.
     */
    dependencies.navigation.resetForProject(
      replacement.project,
      replacement.initialFocusNodeId,
    );
    dependencies.inspector.resetForProject(replacement.project.id);
    dependencies.sourceView?.resetForProject(replacement.project.id);
    const projectResult = dependencies.activeProject.replaceValidated(
      replacement.project,
      replacement.metadata,
      replacement.ownership,
    );
    if (!projectResult.applied) {
      return {
        applied: false,
        reason: 'invalidProject',
        findings: projectResult.findings,
      };
    }
    dependencies.presentation.reset(replacement.initialFocusNodeId);

    return { applied: true, state: projectResult.state };
  }

  return {
    replace,
    activateImportedProject(importResult, options = {}) {
      if (importResult.status === 'failure') {
        return {
          applied: false,
          reason: 'importFailure',
          importResult,
        };
      }

      return replace({
        project: importResult.project,
        initialFocusNodeId: importResult.initialFocusNodeId,
        metadata: {
          origin: options.origin ?? 'imported',
          sourceFilename: sourceFilenameForProject(importResult.project),
          visualizationCompleteness:
            importResult.visualization.summary.completeness,
          visualizationSummary: importResult.visualization.summary,
          visualizationFindings: importResult.visualization.findings,
          contentKindsByNodeId: importResult.contentKindsByNodeId,
          ...(Object.keys(importResult.dtdAttributesByNodeId).length > 0
            ? {
                dtdAttributesByNodeId: importResult.dtdAttributesByNodeId,
              }
            : {}),
          ...(importResult.comments.length > 0
            ? {
                comments: importResult.comments,
                commentsByNodeId: importResult.commentsByNodeId,
                schemaLevelComments: importResult.schemaLevelComments,
              }
            : {}),
          ...(Object.keys(importResult.sourceMarkupByNodeId).length > 0
            ? { sourceMarkupByNodeId: importResult.sourceMarkupByNodeId }
            : {}),
          ...(options.preparedSearchIndex
            ? { preparedSearchIndex: options.preparedSearchIndex }
            : {}),
        },
        ownership: options.ownership,
      });
    },
    activateImportedXsdProject(importResult, options = {}) {
      if (importResult.status === 'failure') {
        return {
          applied: false,
          reason: 'importFailure',
          importResult,
        };
      }

      return replace({
        project: importResult.project,
        initialFocusNodeId: importResult.initialFocusNodeId,
        metadata: {
          origin: options.origin ?? 'imported',
          sourceFilename: sourceFilenameForProject(importResult.project),
          visualizationCompleteness:
            importResult.visualization.summary.completeness,
          visualizationSummary: importResult.visualization.summary,
          visualizationFindings: importResult.visualization.findings,
          xsdMetadataByNodeId: importResult.xsdMetadataByNodeId,
          sourceMarkupByNodeId: importResult.sourceMarkupByNodeId,
          ...(options.preparedSearchIndex
            ? { preparedSearchIndex: options.preparedSearchIndex }
            : {}),
        },
        ownership: options.ownership,
      });
    },
    activateImportedRelaxNgProject(importResult, options = {}) {
      return replace({
        project: importResult.project,
        initialFocusNodeId: importResult.initialFocusNodeId,
        metadata: {
          origin: options.origin ?? 'imported',
          sourceFilename: sourceFilenameForProject(importResult.project),
          visualizationCompleteness:
            importResult.visualization.summary.completeness,
          visualizationSummary: importResult.visualization.summary,
          visualizationFindings: importResult.visualization.findings,
          sourceMarkupByNodeId: importResult.sourceMarkupByNodeId,
          ...(options.preparedSearchIndex
            ? { preparedSearchIndex: options.preparedSearchIndex }
            : {}),
        },
        ownership: options.ownership,
      });
    },
    activateImportedSchemaPackage(importResult, options = {}) {
      if (importResult.status === 'failure') {
        return {
          applied: false,
          reason: 'importFailure',
          importResult,
        };
      }

      return replace({
        project: importResult.project,
        initialFocusNodeId: importResult.initialFocusNodeId,
        metadata: {
          origin: 'package',
          sourceFilename: importResult.manifest.archiveFilename,
          visualizationCompleteness:
            importResult.visualization.summary.completeness,
          visualizationSummary: importResult.visualization.summary,
          visualizationFindings: importResult.visualization.findings,
          schemaPackageManifest: importResult.manifest,
          schemaPackageSources: importResult.sources,
          schemaPackageEntries: importResult.entries,
          schemaPackageSummary: importResult.summary,
          unresolvedReferences: importResult.unresolvedReferences,
          contentKindsByNodeId: importResult.contentKindsByNodeId,
          dtdAttributesByNodeId: importResult.dtdAttributesByNodeId,
          comments: importResult.comments,
          commentsByNodeId: importResult.commentsByNodeId,
          schemaLevelComments: importResult.schemaLevelComments,
          sourceMarkupByNodeId: importResult.sourceMarkupByNodeId,
          xsdMetadataByNodeId: importResult.xsdMetadataByNodeId,
          ...(options.preparedSearchIndex
            ? { preparedSearchIndex: options.preparedSearchIndex }
            : {}),
        },
        ownership: options.ownership,
      });
    },
  };
}

export const projectSession = createProjectSession({
  activeProject: activeProjectStore,
  navigation: navigationStore,
  inspector: inspectorStore,
  sourceView: sourceViewStore,
  presentation: projectSessionResetStore,
});

export const activateImportedProject =
  projectSession.activateImportedProject.bind(projectSession);
export const activateImportedXsdProject =
  projectSession.activateImportedXsdProject.bind(projectSession);
export const activateImportedRelaxNgProject =
  projectSession.activateImportedRelaxNgProject.bind(projectSession);
export const activateImportedSchemaPackage =
  projectSession.activateImportedSchemaPackage.bind(projectSession);
export const replaceProjectSession =
  projectSession.replace.bind(projectSession);
