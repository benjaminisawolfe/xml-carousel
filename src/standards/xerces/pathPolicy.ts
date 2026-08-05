import {
  XERCES_MAX_AGGREGATE_BYTES,
  XERCES_MAX_PATH_CODE_POINTS,
  XERCES_MAX_PATH_SEGMENTS,
  XERCES_MAX_PROJECT_FILES,
} from './limits';
import type { StandardsBoundaryDiagnostic, XercesProjectFile } from './types';

const schemePattern = /^[a-z][a-z\d+.-]*:/iu;
const drivePattern = /^[a-z]:/iu;

function fullyDecode(value: string): string {
  let decoded = value;
  for (let pass = 0; pass < 3; pass += 1) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      throw new Error('invalid-percent-encoding');
    }
    if (next === decoded) return next;
    decoded = next;
  }
  return decoded;
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
  });
}

export function normalizeXercesProjectPath(path: string): string {
  if (typeof path !== 'string' || path.length === 0) {
    throw new Error('empty-path');
  }
  const decoded = fullyDecode(path).replace(/\\/gu, '/');
  if (
    decoded.startsWith('/') ||
    decoded.startsWith('//') ||
    schemePattern.test(decoded) ||
    drivePattern.test(decoded)
  ) {
    throw new Error('external-or-absolute-path');
  }
  const segments = decoded.split('/');
  if (
    segments.some(
      (segment) =>
        segment === '' ||
        segment === '.' ||
        segment === '..' ||
        hasControlCharacter(segment),
    )
  ) {
    throw new Error('unsafe-path-segment');
  }
  if ([...decoded].length > XERCES_MAX_PATH_CODE_POINTS) {
    throw new Error('path-too-long');
  }
  if (segments.length > XERCES_MAX_PATH_SEGMENTS) {
    throw new Error('path-too-deep');
  }
  return segments.join('/');
}

export function resolveXercesProjectReference(
  referringPath: string,
  reference: string,
): string {
  const base = normalizeXercesProjectPath(referringPath);
  const decoded = fullyDecode(reference).replace(/\\/gu, '/');
  const projectPrefix = decoded.match(/^project:\/\/\//iu)?.[0];
  const projectQualified = projectPrefix !== undefined;
  const referencePath = projectQualified
    ? decoded.slice(projectPrefix.length)
    : decoded;
  if (
    referencePath.length === 0 ||
    referencePath.includes('?') ||
    referencePath.includes('#') ||
    (!projectQualified &&
      (referencePath.startsWith('/') ||
        referencePath.startsWith('//') ||
        schemePattern.test(referencePath) ||
        drivePattern.test(referencePath)))
  ) {
    throw new Error('external-or-absolute-path');
  }
  const slash = base.lastIndexOf('/');
  const segments = projectQualified
    ? []
    : slash < 0
      ? []
      : base.slice(0, slash).split('/');
  for (const segment of referencePath.split('/')) {
    if (segment === '') throw new Error('unsafe-path-segment');
    if (segment === '.') continue;
    if (segment === '..') {
      if (segments.length === 0) throw new Error('path-escapes-project-root');
      segments.pop();
      continue;
    }
    if (hasControlCharacter(segment)) throw new Error('unsafe-path-segment');
    segments.push(segment);
  }
  if (segments.length === 0) throw new Error('empty-path');
  const resolved = segments.join('/');
  if ([...resolved].length > XERCES_MAX_PATH_CODE_POINTS) {
    throw new Error('path-too-long');
  }
  if (segments.length > XERCES_MAX_PATH_SEGMENTS) {
    throw new Error('path-too-deep');
  }
  return resolved;
}

function resourceDiagnostic(
  code: string,
  message: string,
  fileName?: string,
): StandardsBoundaryDiagnostic {
  return {
    stage: 'standards',
    code,
    severity: 'error',
    message,
    category: 'resource-limit',
    source: 'project',
    ...(fileName === undefined ? {} : { fileName }),
  };
}

function securityDiagnostic(
  code: string,
  message: string,
  fileName?: string,
): StandardsBoundaryDiagnostic {
  return {
    stage: 'standards',
    code,
    severity: 'error',
    message,
    category: 'security',
    source: 'project',
    ...(fileName === undefined ? {} : { fileName }),
  };
}

export function validateXercesProjectFiles(
  files: readonly XercesProjectFile[],
):
  | { readonly accepted: true; readonly normalizedPaths: readonly string[] }
  | {
      readonly accepted: false;
      readonly diagnostics: readonly StandardsBoundaryDiagnostic[];
    } {
  if (files.length > XERCES_MAX_PROJECT_FILES) {
    return {
      accepted: false,
      diagnostics: [
        resourceDiagnostic(
          'xerces:too-many-files',
          `The selected project contains more than ${XERCES_MAX_PROJECT_FILES} schema files.`,
        ),
      ],
    };
  }

  const totalBytes = files.reduce(
    (total, file) => total + file.bytes.length,
    0,
  );
  if (totalBytes > XERCES_MAX_AGGREGATE_BYTES) {
    return {
      accepted: false,
      diagnostics: [
        resourceDiagnostic(
          'xerces:project-too-large',
          'The selected schema files exceed the 20 MiB standards-engine limit.',
        ),
      ],
    };
  }

  const normalizedPaths: string[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    let normalized: string;
    try {
      normalized = normalizeXercesProjectPath(file.path);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unsafe-path';
      const diagnostic =
        reason === 'path-too-long' || reason === 'path-too-deep'
          ? resourceDiagnostic
          : securityDiagnostic;
      return {
        accepted: false,
        diagnostics: [
          diagnostic(
            `xerces:${reason}`,
            'A supplied schema path is outside the controlled project boundary.',
          ),
        ],
      };
    }
    if (seen.has(normalized)) {
      return {
        accepted: false,
        diagnostics: [
          securityDiagnostic(
            'xerces:duplicate-project-path',
            `The selected project contains the duplicate path ${normalized}.`,
            normalized,
          ),
        ],
      };
    }
    seen.add(normalized);
    normalizedPaths.push(normalized);
  }
  return { accepted: true, normalizedPaths };
}
