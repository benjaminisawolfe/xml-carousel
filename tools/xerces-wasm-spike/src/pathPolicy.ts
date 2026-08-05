const schemePattern = /^[a-z][a-z\d+.-]*:/iu;
const drivePattern = /^[a-z]:/iu;

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
  });
}

function fullyDecode(value: string): string {
  let decoded = value;
  for (let pass = 0; pass < 3; pass += 1) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      throw new Error(`Path has invalid percent encoding: ${value}`);
    }
    if (next === decoded) return next;
    decoded = next;
  }
  return decoded;
}

export function normalizeProjectPath(path: string): string {
  if (typeof path !== 'string' || path.length === 0) {
    throw new Error('Project paths must be nonempty strings.');
  }
  const decoded = fullyDecode(path).replace(/\\/gu, '/');
  if (
    decoded.startsWith('/') ||
    decoded.startsWith('//') ||
    schemePattern.test(decoded) ||
    drivePattern.test(decoded)
  ) {
    throw new Error(`Project path is external or absolute: ${path}`);
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
    throw new Error(`Project path contains an unsafe segment: ${path}`);
  }
  if ([...decoded].length > 512) {
    throw new Error(`Project path exceeds the spike limit: ${path}`);
  }
  if (segments.length > 32) {
    throw new Error(`Project path exceeds the spike depth limit: ${path}`);
  }
  return segments.join('/');
}

export function validateProjectFiles(
  paths: readonly string[],
): readonly string[] {
  const normalized = paths.map(normalizeProjectPath);
  const seen = new Set<string>();
  for (const path of normalized) {
    if (seen.has(path)) throw new Error(`Duplicate project path: ${path}`);
    seen.add(path);
  }
  return normalized;
}
