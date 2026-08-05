import { readFile } from 'node:fs/promises';

/**
 * Normalize repository text assets to the release artifact line-ending policy.
 *
 * @param {string} value
 * @returns {string}
 */
export function normalizeReleaseText(value) {
  return value.replace(/\r\n?/gu, '\n');
}

/**
 * Read a repository text asset using the release artifact line-ending policy.
 *
 * @param {import('node:fs').PathLike} filePath
 * @returns {Promise<string>}
 */
export async function readNormalizedReleaseText(filePath) {
  return normalizeReleaseText(await readFile(filePath, 'utf8'));
}
