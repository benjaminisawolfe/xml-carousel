import JSZip from 'jszip';

/** @param {string} value */
function fullyDecode(value) {
  let decoded = value;
  for (let pass = 0; pass < 3; pass += 1) {
    const next = decodeURIComponent(decoded);
    if (next === decoded) return next;
    decoded = next;
  }
  return decoded;
}

/**
 * @param {string} referringPath
 * @param {string} reference
 */
export function resolveInventoryReference(referringPath, reference) {
  let decoded;
  try {
    decoded = fullyDecode(reference).replace(/\\/gu, '/');
  } catch {
    return { status: 'blocked', reason: 'invalid-percent-encoding' };
  }
  if (
    decoded.length === 0 ||
    decoded.startsWith('/') ||
    /^[a-z][a-z\d+.-]*:/iu.test(decoded) ||
    /^[a-z]:/iu.test(decoded)
  ) {
    return { status: 'external-or-absolute' };
  }
  const slash = referringPath.lastIndexOf('/');
  const segments = slash < 0 ? [] : referringPath.slice(0, slash).split('/');
  for (const segment of decoded.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (segments.length === 0) {
        return { status: 'blocked', reason: 'outside-project-root' };
      }
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  return { status: 'resolved', targetPath: segments.join('/') };
}

/** @param {Uint8Array | ArrayBuffer | Buffer} bytes */
export async function inventoryArchive(bytes) {
  const archive = await JSZip.loadAsync(bytes);
  const allEntries = Object.values(archive.files);
  const fileEntries = allEntries
    .filter(({ dir }) => !dir)
    .sort((left, right) => left.name.localeCompare(right.name));
  const firstSegments = fileEntries.map(({ name }) => name.split('/')[0]);
  const commonRootDirectory =
    fileEntries.length > 0 &&
    fileEntries.every(
      ({ name }, index) =>
        name.includes('/') && firstSegments[index] === firstSegments[0],
    )
      ? `${firstSegments[0]}/`
      : null;
  /** @param {string} archivePath */
  const packagePath = (archivePath) =>
    commonRootDirectory && archivePath.startsWith(commonRootDirectory)
      ? archivePath.slice(commonRootDirectory.length)
      : archivePath;
  const packageRelativePaths = fileEntries.map(({ name }) => packagePath(name));
  const packagePaths = new Set(packageRelativePaths);
  const xsdEntries = fileEntries.filter(({ name }) => /\.xsd$/iu.test(name));
  const referencePattern =
    /<(?:[\w.-]+:)?(?:include|import|redefine)\b[^>]*\bschemaLocation\s*=\s*(['"])(.*?)\1[^>]*>/giu;
  const references = [];
  for (const entry of xsdEntries) {
    const referringPath = packagePath(entry.name);
    const sourceText = await entry.async('text');
    for (const match of sourceText.matchAll(referencePattern)) {
      const reference = match[2];
      const resolution = resolveInventoryReference(referringPath, reference);
      references.push({ referringPath, reference, ...resolution });
    }
  }
  const missingReferences = references.filter(
    ({ status, targetPath }) =>
      status === 'blocked' ||
      (status === 'resolved' &&
        typeof targetPath === 'string' &&
        !packagePaths.has(targetPath)),
  );
  return {
    zipEntryCount: allEntries.length,
    fileEntryCount: fileEntries.length,
    xsdEntryCount: xsdEntries.length,
    commonRootDirectory,
    packageRelativePaths,
    schemaLocationCount: references.length,
    references,
    externalOrAbsoluteReferenceCount: references.filter(
      ({ status }) => status === 'external-or-absolute',
    ).length,
    missingReferenceCount: missingReferences.length,
    missingReferences,
  };
}

/**
 * @param {Uint8Array | ArrayBuffer | Buffer} bytes
 * @param {string} packageRelativePath
 */
export async function readInventoryEntryText(bytes, packageRelativePath) {
  const archive = await JSZip.loadAsync(bytes);
  const fileEntries = Object.values(archive.files).filter(({ dir }) => !dir);
  const first = fileEntries[0]?.name.split('/')[0];
  const commonRoot =
    first &&
    fileEntries.every(
      ({ name }) => name.includes('/') && name.split('/')[0] === first,
    )
      ? `${first}/`
      : '';
  const entry = archive.file(`${commonRoot}${packageRelativePath}`);
  return entry ? entry.async('text') : undefined;
}
