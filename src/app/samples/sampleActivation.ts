import {
  activateImportedProject,
  activateImportedXsdProject,
  type ProjectImportActivationOptions,
  type ProjectSessionReplacementResult,
} from '../stores/projectSession';
import type { DtdImportResult } from '../../schema/dtd';
import {
  prepareBuiltInSample,
  type BuiltInSampleId,
  type BuiltInSamplePreparation,
} from '../../schema/samples/sampleCatalog';
import type { XsdImportResult } from '../../schema/xsd';

export type SampleActivationOutcome =
  | {
      readonly status: 'success';
      readonly sampleId: BuiltInSampleId;
      readonly filename: string;
    }
  | { readonly status: 'busy' }
  | { readonly status: 'failure'; readonly message: string };

export interface SampleActivationDependencies {
  readonly prepare?: (sampleId: BuiltInSampleId) => BuiltInSamplePreparation;
  readonly invalidateImport: () => boolean;
  readonly clearImportFailure: () => void;
  readonly activateDtd?: (
    result: DtdImportResult,
    options?: ProjectImportActivationOptions,
  ) => ProjectSessionReplacementResult;
  readonly activateXsd?: (
    result: XsdImportResult,
    options?: ProjectImportActivationOptions,
  ) => ProjectSessionReplacementResult;
}

const sampleActivationFailure =
  'The built-in sample could not replace the current project.';

export function activateBuiltInSample(
  sampleId: BuiltInSampleId,
  dependencies: SampleActivationDependencies,
): SampleActivationOutcome {
  if (!dependencies.invalidateImport()) return { status: 'busy' };

  let prepared: BuiltInSamplePreparation;
  try {
    prepared = (dependencies.prepare ?? prepareBuiltInSample)(sampleId);
  } catch {
    return { status: 'failure', message: sampleActivationFailure };
  }
  if (prepared.status === 'failure') return prepared;

  const { sample } = prepared;
  let activation: ProjectSessionReplacementResult;
  try {
    const options: ProjectImportActivationOptions = {
      origin: 'sample',
      preparedSearchIndex: sample.searchIndex,
    };
    activation =
      sample.format === 'dtd'
        ? (dependencies.activateDtd ?? activateImportedProject)(
            sample.importResult,
            options,
          )
        : (dependencies.activateXsd ?? activateImportedXsdProject)(
            sample.importResult,
            options,
          );
  } catch {
    return { status: 'failure', message: sampleActivationFailure };
  }

  if (!activation.applied) {
    return { status: 'failure', message: sampleActivationFailure };
  }

  dependencies.clearImportFailure();
  return {
    status: 'success',
    sampleId,
    filename: sample.filename,
  };
}
