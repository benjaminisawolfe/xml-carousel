import {
  normalizeStandardsProjectPath,
  resolveStandardsProjectReference,
  validateStandardsProjectFiles,
} from '../projectResources/pathPolicy';
import type { XercesProjectFile } from './types';

export const normalizeXercesProjectPath = normalizeStandardsProjectPath;
export const resolveXercesProjectReference = resolveStandardsProjectReference;

export function validateXercesProjectFiles(
  files: readonly XercesProjectFile[],
) {
  return validateStandardsProjectFiles(files, 'xerces');
}
