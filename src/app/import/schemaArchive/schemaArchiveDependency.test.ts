import { describe, expect, it } from 'vitest';
import packageLockSource from '../../../../package-lock.json?raw';
import packageSource from '../../../../package.json?raw';

describe('schema archive dependency contract', () => {
  it('pins JSZip as the only direct production ZIP dependency', () => {
    const packageJson = JSON.parse(packageSource) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const directDependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    expect(packageJson.dependencies?.jszip).toBe('^3.10.1');
    expect(packageJson.devDependencies?.jszip).toBeUndefined();
    expect(directDependencies['@types/jszip']).toBeUndefined();

    for (const alternate of [
      'adm-zip',
      'archiver',
      'fflate',
      'unzipper',
      'yauzl',
    ]) {
      expect(directDependencies[alternate]).toBeUndefined();
    }
  });

  it('locks JSZip without requiring separate community types', () => {
    const packageLock = JSON.parse(packageLockSource) as {
      packages: Record<string, { version?: string }>;
    };

    expect(packageLock.packages['node_modules/jszip']?.version).toBe('3.10.1');
    expect(packageLock.packages['node_modules/@types/jszip']).toBeUndefined();
  });

  it('retains package-lock.json as the only package-manager lockfile', () => {
    const lockfiles = import.meta.glob(
      '../../../../{package-lock.json,npm-shrinkwrap.json,pnpm-lock.yaml,yarn.lock,bun.lock,bun.lockb}',
      { eager: true, query: '?raw', import: 'default' },
    );

    expect(Object.keys(lockfiles)).toEqual(['../../../../package-lock.json']);
  });
});
